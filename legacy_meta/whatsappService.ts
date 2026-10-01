import axios, { AxiosError } from 'axios';
import { env } from '../config/env';

const META_GRAPH_BASE_URL = 'https://graph.facebook.com';
const MAX_WHATSAPP_TEXT_LENGTH = 4000; // Límite seguro por mensaje (Meta soporta hasta 4096)

/**
 * Divide un texto largo en bloques de tamaño adecuado respetando saltos de línea cuando sea posible.
 */
function splitMessage(text: string, maxLength: number = MAX_WHATSAPP_TEXT_LENGTH): string[] {
  if (text.length <= maxLength) {
    return [text];
  }

  const chunks: string[] = [];
  let remainingText = text;

  while (remainingText.length > 0) {
    if (remainingText.length <= maxLength) {
      chunks.push(remainingText);
      break;
    }

    // Buscar el último salto de línea o espacio dentro del rango permitido
    let splitIndex = remainingText.lastIndexOf('\n', maxLength);
    if (splitIndex === -1 || splitIndex < maxLength * 0.7) {
      splitIndex = remainingText.lastIndexOf(' ', maxLength);
    }
    if (splitIndex === -1 || splitIndex < maxLength * 0.7) {
      splitIndex = maxLength;
    }

    chunks.push(remainingText.substring(0, splitIndex).trim());
    remainingText = remainingText.substring(splitIndex).trim();
  }

  return chunks;
}

/**
 * Envía un mensaje de texto a un destinatario usando la Meta WhatsApp Cloud API (v21.0+).
 *
 * @param to - Número telefónico del destinatario con código de país (ej. "5215512345678")
 * @param text - Contenido del mensaje de texto a enviar
 */
export async function sendWhatsAppMessage(to: string, text: string): Promise<void> {
  const url = `${META_GRAPH_BASE_URL}/${env.WHATSAPP_API_VERSION}/${env.WHATSAPP_PHONE_NUMBER_ID}/messages`;
  const chunks = splitMessage(text);

  for (const chunk of chunks) {
    const payload = {
      messaging_product: 'whatsapp',
      recipient_type: 'individual',
      to,
      type: 'text',
      text: {
        preview_url: false,
        body: chunk,
      },
    };

    try {
      const response = await axios.post(url, payload, {
        headers: {
          Authorization: `Bearer ${env.WHATSAPP_ACCESS_TOKEN}`,
          'Content-Type': 'application/json',
        },
        timeout: 10000,
      });

      console.log(`[WhatsApp API] Mensaje enviado exitosamente a ${to}. ID: ${response.data?.messages?.[0]?.id}`);
    } catch (err: unknown) {
      if (axios.isAxiosError(err)) {
        const axiosError = err as AxiosError<{ error?: { message?: string; type?: string; code?: number } }>;
        console.error('[WhatsApp API] Error de Meta Graph API:', {
          status: axiosError.response?.status,
          data: axiosError.response?.data,
          message: axiosError.message,
        });
      } else {
        console.error('[WhatsApp API] Error inesperado al enviar mensaje:', err);
      }
      throw err;
    }
  }
}

/**
 * Marca un mensaje entrante como leído en WhatsApp (muestra los dos checks azules).
 *
 * @param messageId - ID del mensaje entrante recibido en el webhook
 */
export async function markMessageAsRead(messageId: string): Promise<void> {
  const url = `${META_GRAPH_BASE_URL}/${env.WHATSAPP_API_VERSION}/${env.WHATSAPP_PHONE_NUMBER_ID}/messages`;

  try {
    await axios.post(
      url,
      {
        messaging_product: 'whatsapp',
        status: 'read',
        message_id: messageId,
      },
      {
        headers: {
          Authorization: `Bearer ${env.WHATSAPP_ACCESS_TOKEN}`,
          'Content-Type': 'application/json',
        },
        timeout: 5000,
      }
    );
  } catch (err) {
    // No lanzar error si falla el marcado de lectura; es una mejora opcional no crítica
    console.warn(`[WhatsApp API] No se pudo marcar como leído el mensaje ${messageId}:`, (err as Error)?.message);
  }
}
