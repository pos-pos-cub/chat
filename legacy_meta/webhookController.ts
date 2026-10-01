import { Request, Response } from 'express';
import { env } from '../config/env';
import { WhatsAppWebhookPayload, WhatsAppIncomingMessage } from '../types/whatsapp.types';
import { getRecentHistory, saveMessage } from '../lib/supabaseClient';
import { generateGeminiReply } from '../services/geminiService';
import { sendWhatsAppMessage, markMessageAsRead } from '../services/whatsappService';

/**
 * Valida el webhook ante Meta durante la configuración inicial en el App Dashboard.
 * GET /webhook
 */
export function verifyWebhook(req: Request, res: Response): void {
  try {
    const mode = req.query['hub.mode'];
    const token = req.query['hub.verify_token'];
    const challenge = req.query['hub.challenge'];

    if (mode === 'subscribe' && token === env.WHATSAPP_VERIFY_TOKEN) {
      console.log('[Webhook Verification] Token validado con éxito por Meta.');
      res.status(200).send(challenge);
      return;
    }

    console.warn('[Webhook Verification] Intento fallido de validación. Token inválido o modo incorrecto.');
    res.sendStatus(403);
  } catch (error) {
    console.error('[Webhook Verification] Error procesando verificación:', error);
    res.sendStatus(500);
  }
}

/**
 * Recibe eventos y mensajes entrantes de WhatsApp.
 * POST /webhook
 *
 * IMPORTANTE: Responde con 200 OK inmediatamente para evitar que Meta reintente el envío,
 * y luego procesa la lógica del bot de forma asíncrona.
 */
export function receiveWebhook(req: Request, res: Response): void {
  // 1. Confirmar recepción inmediata a Meta
  res.status(200).send('EVENT_RECEIVED');

  // 2. Procesar el payload en segundo plano
  processWebhookPayload(req.body as WhatsAppWebhookPayload).catch((error) => {
    console.error('[Webhook Processing] Error crítico al procesar evento:', error);
  });
}

/**
 * Procesa la carga útil del webhook de forma asíncrona.
 */
async function processWebhookPayload(payload: WhatsAppWebhookPayload): Promise<void> {
  if (payload.object !== 'whatsapp_business_account') {
    return;
  }

  const entries = payload.entry || [];
  for (const entry of entries) {
    const changes = entry.changes || [];
    for (const change of changes) {
      const value = change.value;
      if (!value) continue;

      // Si es una actualización de estado (mensaje entregado, leído, etc.), la ignoramos
      if (value.statuses && value.statuses.length > 0) {
        // Opcional: registrar analíticas de entrega
        continue;
      }

      // Procesar mensajes entrantes
      const messages = value.messages || [];
      for (const message of messages) {
        await processSingleMessage(message, value.contacts?.[0]?.profile?.name);
      }
    }
  }
}

/**
 * Procesa un mensaje individual entrante:
 * 1. Filtra mensajes no soportados
 * 2. Consulta el historial previo en Supabase
 * 3. Llama a Gemini con el contexto conversacional
 * 4. Envía la respuesta a través de WhatsApp Cloud API
 * 5. Persiste la interacción en Supabase
 */
async function processSingleMessage(
  message: WhatsAppIncomingMessage,
  userName?: string
): Promise<void> {
  const senderNumber = message.from;
  const messageId = message.id;

  // Marcar mensaje como leído (checks azules) de forma no bloqueante
  markMessageAsRead(messageId).catch(() => {});

  // Validar si es mensaje de texto
  if (message.type !== 'text' || !message.text?.body) {
    console.log(`[Webhook] Mensaje de tipo '${message.type}' recibido de ${senderNumber}. Actualmente sólo se procesa texto.`);
    await sendWhatsAppMessage(
      senderNumber,
      'Por el momento sólo puedo procesar mensajes de texto. ¿En qué más puedo ayudarte?'
    );
    return;
  }

  const userText = message.text.body.trim();
  console.log(`[Webhook] Mensaje entrante de ${userName || senderNumber} (${senderNumber}): "${userText}"`);

  try {
    // 1. Obtener los últimos N mensajes de historial de este número desde Supabase
    const recentHistory = await getRecentHistory(senderNumber, env.MAX_HISTORY_MESSAGES);

    // 2. Generar respuesta con Google Gemini (@google/genai)
    const geminiReply = await generateGeminiReply(userText, recentHistory);

    // 3. Enviar la respuesta a WhatsApp vía Meta Graph API v21.0
    await sendWhatsAppMessage(senderNumber, geminiReply);

    // 4. Guardar tanto el mensaje del usuario como la respuesta de la IA en Supabase
    await Promise.all([
      saveMessage(senderNumber, 'user', userText),
      saveMessage(senderNumber, 'model', geminiReply),
    ]);

    console.log(`[Webhook] Conversación procesada y guardada con éxito para ${senderNumber}.`);
  } catch (error) {
    console.error(`[Webhook] Error al procesar mensaje de ${senderNumber}:`, error);

    // Enviar mensaje de contingencia al usuario
    try {
      await sendWhatsAppMessage(
        senderNumber,
        'Ocurrió un error inesperado al procesar tu solicitud. Por favor, intenta de nuevo en unos momentos.'
      );
    } catch (sendErr) {
      console.error(`[Webhook] No fue posible enviar el mensaje de error de contingencia a ${senderNumber}:`, sendErr);
    }
  }
}
