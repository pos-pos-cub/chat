import { GoogleGenAI } from '@google/genai';
import { env } from '../config/env';
import { ChatMessage } from '../lib/supabaseClient';

// Instancia única del SDK de Google Gemini
const ai = new GoogleGenAI({ apiKey: env.GEMINI_API_KEY });

/**
 * Genera una respuesta utilizando la API de Google Gemini (@google/genai)
 * incorporando el historial previo de la conversación y las instrucciones del sistema.
 *
 * @param userPrompt - Texto del mensaje enviado por el usuario
 * @param history - Mensajes previos recuperados desde Supabase (ordenados cronológicamente)
 * @returns Texto de respuesta generado por el modelo
 */
export async function generateGeminiReply(
  userPrompt: string,
  history: ChatMessage[] = []
): Promise<string> {
  try {
    // Formatear el historial para el SDK @google/genai
    // Cada elemento requiere 'role' ('user' | 'model') y 'parts' [{ text: '...' }]
    const formattedContents = [
      ...history.map((msg) => ({
        role: msg.role === 'model' ? 'model' : 'user',
        parts: [{ text: msg.content }],
      })),
      {
        role: 'user',
        parts: [{ text: userPrompt }],
      },
    ];

    const response = await ai.models.generateContent({
      model: env.GEMINI_MODEL,
      contents: formattedContents,
      config: {
        systemInstruction: env.SYSTEM_INSTRUCTION,
        temperature: 0.7,
      },
    });

    const replyText = response.text?.trim();

    if (!replyText) {
      console.warn('[Gemini] El modelo devolvió una respuesta vacía o filtrada.');
      return 'Disculpa, no pude procesar tu solicitud en este momento. Por favor, intenta de nuevo.';
    }

    return replyText;
  } catch (error: any) {
    console.error('[Gemini] Error en la generación de contenido:', error?.message || error);
    throw error;
  }
}
