# 🤖 WhatsApp Gemini Bot (Baileys + Supabase + Google Gemini)

Bot inteligente y autónomo para WhatsApp con memoria contextual, desarrollado con Node.js, TypeScript, el protocolo de WhatsApp Web (**Baileys**), el SDK oficial de **Google Gemini** (`@google/genai`) y base de datos en la nube con **Supabase**.

---

## 🌟 Características
* **Sin Meta for Developers ni bloqueos regionales:** Funciona en cualquier país (incluido Cuba) mediante escaneo de código QR.
* **Persistencia de sesión:** Solo escaneas el código QR la primera vez. Las credenciales se guardan localmente en `auth_info_baileys/` y se reconectan automáticamente si se cae la red o reinicias el equipo.
* **Memoria conversacional:** Recuerda los últimos mensajes de cada usuario gracias a la base de datos Supabase en tiempo real.
* **Google Gemini 3.8 Flash:** Respuestas ultra-rápidas, inteligentes y contextuales.
* **Indicador en tiempo real:** Muestra "escribiendo..." en WhatsApp mientras la IA procesa la respuesta.
* **Protección antibucles:** No responde a sus propios mensajes ni spamea grupos.

---

## 🚀 Cómo Iniciar el Bot

### 1. Iniciar en modo desarrollo
```bash
npm run dev
```

### 2. Vincular tu WhatsApp
1. Al ejecutar el comando, aparecerá un **Código QR** en tu terminal.
2. Abre WhatsApp en tu teléfono.
3. Ve a **Ajustes** (o los tres puntos arriba a la derecha) > **Dispositivos vinculados** > **Vincular un dispositivo**.
4. Escanea el código QR de la pantalla.

¡Y listo! Una vez conectado, cualquier mensaje que envíes (o te envíen) será respondido por Gemini con memoria completa.
