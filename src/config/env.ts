import dotenv from 'dotenv';

dotenv.config();

function getEnvVar(key: string, defaultValue?: string): string {
  const value = process.env[key] || defaultValue;
  if (!value) {
    throw new Error(`[Configuration Error] Falta la variable de entorno obligatoria: ${key}`);
  }
  return value;
}

export const env = {
  // Google Gemini API
  GEMINI_API_KEY: getEnvVar('GEMINI_API_KEY'),
  GEMINI_MODEL: process.env.GEMINI_MODEL || 'gemini-3.8-flash',
  SYSTEM_INSTRUCTION: process.env.SYSTEM_INSTRUCTION || 
    'Eres un asistente virtual profesional, atento y conciso para WhatsApp. Responde de forma clara y directa en español.',

  // Supabase
  SUPABASE_URL: getEnvVar('SUPABASE_URL'),
  SUPABASE_KEY: process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_ANON_KEY || getEnvVar('SUPABASE_SERVICE_ROLE_KEY'),

  // Configuración de contexto conversacional
  MAX_HISTORY_MESSAGES: parseInt(process.env.MAX_HISTORY_MESSAGES || '10', 10),
};
