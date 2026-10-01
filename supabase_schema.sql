-- ==============================================================================
-- Tabla: messages
-- Almacena el historial conversacional entre los usuarios de WhatsApp y el bot Gemini
-- ==============================================================================

CREATE TABLE IF NOT EXISTS messages (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    phone_number VARCHAR(30) NOT NULL,
    role VARCHAR(10) NOT NULL CHECK (role IN ('user', 'model')),
    content TEXT NOT NULL,
    created_at TIMESTAMPTZ DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- Índice optimizado para consultar rápidamente los últimos N mensajes por número de teléfono
CREATE INDEX IF NOT EXISTS idx_messages_phone_created_at 
ON messages (phone_number, created_at DESC);

-- Habilitar RLS (Row Level Security) para mayor seguridad
ALTER TABLE messages ENABLE ROW LEVEL SECURITY;

-- Política para permitir que el backend (usando service_role key) tenga acceso completo
-- Nota: La service_role key de Supabase automáticamente hace bypass de RLS.
-- Si decides usar la anon key, descomenta la siguiente política:
/*
CREATE POLICY "Permitir acceso completo a usuarios autenticados o service_role"
ON messages
FOR ALL
TO anon, authenticated, service_role
USING (true)
WITH CHECK (true);
*/
