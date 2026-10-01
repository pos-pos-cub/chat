import { GoogleGenAI } from '@google/genai';
import { env } from '../config/env';
import { ChatMessage } from '../lib/supabaseClient';

// Instancia única del SDK de Google Gemini
const ai = new GoogleGenAI({ apiKey: env.GEMINI_API_KEY });

// Modelos ordenados por prioridad para tolerancia a fallos y alta demanda (503)
const CANDIDATE_MODELS = [
  env.GEMINI_MODEL || 'gemini-3.5-flash',
  'gemini-3.5-flash',
  'gemini-3.6-flash',
  'gemini-flash-lite-latest',
  'gemini-3.1-flash-lite',
];

/**
 * Genera una respuesta utilizando la API de Google Gemini (@google/genai)
 * incorporando el historial previo de la conversación y las instrucciones del sistema.
 * Cuenta con conmutación automática de modelos (fallback) ante alta demanda (503).
 *
 * @param userPrompt - Texto del mensaje enviado por el usuario
 * @param history - Mensajes previos recuperados desde Supabase (ordenados cronológicamente)
 * @returns Texto de respuesta generado por el modelo
 */
export async function generateGeminiReply(
  userPrompt: string,
  history: ChatMessage[] = []
): Promise<string> {
  // Formatear el historial para el SDK @google/genai
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

  // Eliminar duplicados en la lista de modelos
  const modelsToTry = Array.from(new Set(CANDIDATE_MODELS));
  let lastError: any = null;

  for (const model of modelsToTry) {
    try {
      console.log(`[Gemini] Generando respuesta con modelo: ${model}...`);
      const response = await ai.models.generateContent({
        model,
        contents: formattedContents,
        config: {
          systemInstruction: env.SYSTEM_INSTRUCTION,
          temperature: 0.7,
        },
      });

      const replyText = response.text?.trim();

      if (replyText) {
        return replyText;
      }
    } catch (error: any) {
      console.warn(`[Gemini] El modelo '${model}' reportó alta demanda o error (${error?.status || error?.message}). Reintentando con modelo de respaldo...`);
      lastError = error;
    }
  }

  console.error('[Gemini] Todos los modelos candidatos fallaron.');
  throw lastError;
}
