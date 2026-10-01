import makeWASocket, {
  DisconnectReason,
  useMultiFileAuthState,
  fetchLatestBaileysVersion,
  WAMessage,
} from '@whiskeysockets/baileys';
import { Boom } from '@hapi/boom';
import qrcode from 'qrcode-terminal';
import pino from 'pino';
import path from 'path';
import { env } from './config/env';
import { getRecentHistory, saveMessage } from './lib/supabaseClient';
import { generateGeminiReply } from './services/geminiService';

// Logger en nivel 'silent' para mantener la consola limpia y legible
const logger = pino({ level: 'silent' });

// Registro en memoria de IDs de mensajes enviados por el bot para evitar bucles
const botMessageIds = new Set<string>();

// Limpieza periódica de memoria para los IDs registrados
setInterval(() => {
  if (botMessageIds.size > 2000) {
    botMessageIds.clear();
  }
}, 60 * 60 * 1000);

/**
 * Función principal que inicia y administra el ciclo de vida del bot de WhatsApp
 */
async function startWhatsAppBot() {
  // Carpeta donde se guarda la sesión para que nunca tengas que reescanear el QR
  const authPath = path.resolve(__dirname, '../auth_info_baileys');
  const { state, saveCreds } = await useMultiFileAuthState(authPath);
  const { version } = await fetchLatestBaileysVersion();

  console.log(`[WhatsApp] Inicializando cliente Baileys v${version.join('.')}...`);

  const sock = makeWASocket({
    version,
    logger,
    auth: state,
    printQRInTerminal: false,
    syncFullHistory: false,
    generateHighQualityLinkPreview: true,
  });

  // Guardar credenciales en disco automáticamente
  sock.ev.on('creds.update', saveCreds);

  // Manejo de conexión y visualización del código QR
  sock.ev.on('connection.update', (update) => {
    const { connection, lastDisconnect, qr } = update;

    if (qr) {
      console.log('\n=============================================================');
      console.log('📲 ESCANEA ESTE CÓDIGO QR CON TU WHATSAPP PARA INICIAR:');
      console.log('=============================================================\n');
      qrcode.generate(qr, { small: true });
      console.log('\n👉 En tu móvil: WhatsApp > Dispositivos vinculados > Vincular un dispositivo.\n');
    }

    if (connection === 'close') {
      const statusCode = (lastDisconnect?.error as Boom)?.output?.statusCode;
      const shouldReconnect = statusCode !== DisconnectReason.loggedOut;

      console.log(`[WhatsApp] Conexión cerrada (Código: ${statusCode}). Reconectando automáticamente: ${shouldReconnect}`);

      if (shouldReconnect) {
        setTimeout(() => {
          startWhatsAppBot();
        }, 3000);
      } else {
        console.log('❌ [WhatsApp] Sesión cerrada desde el teléfono. Si deseas reconectar, reinicia la app para generar un nuevo QR.');
      }
    } else if (connection === 'open') {
      console.log('\n=============================================================');
      console.log('🚀 ¡BOT CONECTADO EXITOSAMENTE A WHATSAPP!');
      console.log(`🤖 Modelo Gemini activo: ${env.GEMINI_MODEL}`);
      console.log('💾 Persistencia de historial activa en Supabase');
      console.log('💬 Listo para responder mensajes en tiempo real.');
      console.log('=============================================================\n');
    }
  });

  // Procesamiento de mensajes entrantes
  sock.ev.on('messages.upsert', async ({ messages, type }) => {
    if (type !== 'notify') return;

    for (const msg of messages) {
      try {
        await handleIncomingMessage(sock, msg);
      } catch (err) {
        console.error('[WhatsApp] Error procesando mensaje entrante:', err);
      }
    }
  });
}

/**
 * Procesa cada mensaje entrante:
 * 1. Filtra mensajes no deseados, estados o mensajes propios del bot.
 * 2. Consulta el historial previo en Supabase para darle memoria.
 * 3. Solicita la respuesta a Gemini (@google/genai).
 * 4. Envía la respuesta por WhatsApp citando el mensaje.
 * 5. Guarda la interacción en Supabase.
 */
async function handleIncomingMessage(
  sock: ReturnType<typeof makeWASocket>,
  m: WAMessage
): Promise<void> {
  if (!m.message) return;

  const remoteJid = m.key.remoteJid;
  if (!remoteJid || remoteJid === 'status@broadcast') return;

  // Ignorar grupos por defecto para evitar respuestas no solicitadas
  if (remoteJid.endsWith('@g.us')) return;

  // Si el mensaje fue generado por el propio bot, ignorar para evitar bucles
  if (m.key.id && botMessageIds.has(m.key.id)) return;

  // Si el mensaje es 'fromMe' (enviado desde este número):
  // Solo responder si es el chat personal consigo mismo ("Mensajes guardados / Tú")
  if (m.key.fromMe) {
    const myPhone = sock.user?.id?.split(':')[0] || sock.user?.id?.split('@')[0];
    const targetPhone = remoteJid.split('@')[0];
    if (myPhone !== targetPhone) {
      // El usuario está chateando con otra persona desde su móvil; no intervenir
      return;
    }
  }

  // Extraer el texto del mensaje
  const userText = (
    m.message.conversation ||
    m.message.extendedTextMessage?.text ||
    m.message.imageMessage?.caption ||
    m.message.videoMessage?.caption ||
    ''
  ).trim();

  if (!userText) {
    // Si no contiene texto (ej. solo audio, sticker o llamada), omitir
    return;
  }

  const senderNumber = remoteJid.split('@')[0];
  const senderName = m.pushName || senderNumber;
  console.log(`\n📩 [Mensaje recibido] de ${senderName} (${senderNumber}): "${userText}"`);

  try {
    // Marcar como leído y mostrar indicador de "escribiendo..."
    await sock.readMessages([m.key]);
    await sock.sendPresenceUpdate('composing', remoteJid);

    // 1. Obtener historial reciente de Supabase
    const recentHistory = await getRecentHistory(senderNumber, env.MAX_HISTORY_MESSAGES);

    // 2. Generar respuesta con Google Gemini (@google/genai)
    const geminiReply = await generateGeminiReply(userText, recentHistory);

    // 3. Enviar mensaje de vuelta en WhatsApp
    const sent = await sock.sendMessage(
      remoteJid,
      { text: geminiReply },
      { quoted: m }
    );

    if (sent?.key?.id) {
      botMessageIds.add(sent.key.id);
    }

    // Detener indicador de escritura
    await sock.sendPresenceUpdate('paused', remoteJid);

    // 4. Guardar mensaje del usuario y respuesta de la IA en Supabase
    await Promise.all([
      saveMessage(senderNumber, 'user', userText),
      saveMessage(senderNumber, 'model', geminiReply),
    ]);

    console.log(`📤 [Respuesta enviada y guardada en Supabase] para ${senderNumber}`);
  } catch (error) {
    console.error(`[Error] Fallo al procesar respuesta para ${senderNumber}:`, error);

    try {
      await sock.sendPresenceUpdate('paused', remoteJid);
      await sock.sendMessage(
        remoteJid,
        { text: 'Disculpa, ocurrió un error temporal al procesar tu solicitud. Intenta de nuevo en unos segundos.' },
        { quoted: m }
      );
    } catch (sendErr) {
      console.error('[Error] No fue posible enviar el mensaje de error:', sendErr);
    }
  }
}

// Iniciar el bot
startWhatsAppBot().catch((err) => {
  console.error('[Fatal Error] Error crítico al iniciar el bot:', err);
  process.exit(1);
});
