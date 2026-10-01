import { createClient } from '@supabase/supabase-js';
import { env } from '../config/env.js';

export interface ChatMessage {
  id?: string;
  phone_number: string;
  role: 'user' | 'model';
  content: string;
  created_at?: string;
}

// Inicialización del cliente Supabase con la URL y Service Role / Anon Key
export const supabase = createClient(env.SUPABASE_URL, env.SUPABASE_KEY, {
  auth: {
    persistSession: false,
    autoRefreshToken: false,
  },
});

/**
 * Obtiene los últimos N mensajes asociados a un número telefónico.
 * Devuelve los mensajes en orden cronológico ascendente (del más antiguo al más reciente)
 * para que el modelo de IA reciba la secuencia conversacional correcta.
 */
export async function getRecentHistory(
  phoneNumber: string,
  limit: number = env.MAX_HISTORY_MESSAGES
): Promise<ChatMessage[]> {
  try {
    const { data, error } = await supabase
      .from('messages')
      .select('id, phone_number, role, content, created_at')
      .eq('phone_number', phoneNumber)
      .order('created_at', { ascending: false })
      .limit(limit);

    if (error) {
      console.error(`[Supabase] Error al consultar historial para ${phoneNumber}:`, error.message);
      return [];
    }

    if (!data || data.length === 0) {
      return [];
    }

    // Invertir el orden para que queden cronológicamente: [antiguo -> reciente]
    return (data as ChatMessage[]).reverse();
  } catch (err) {
    console.error(`[Supabase] Excepción al obtener historial para ${phoneNumber}:`, err);
    return [];
  }
}

/**
 * Guarda un mensaje (del usuario o generado por el modelo) en Supabase.
 */
export async function saveMessage(
  phoneNumber: string,
  role: 'user' | 'model',
  content: string
): Promise<ChatMessage | null> {
  try {
    const { data, error } = await supabase
      .from('messages')
      .insert([
        {
          phone_number: phoneNumber,
          role,
          content,
        },
      ])
      .select()
      .single();

    if (error) {
      console.error(`[Supabase] Error al guardar mensaje (${role}) para ${phoneNumber}:`, error.message);
      return null;
    }

    return data as ChatMessage;
  } catch (err) {
    console.error(`[Supabase] Excepción inesperada al guardar mensaje para ${phoneNumber}:`, err);
    return null;
  }
}
