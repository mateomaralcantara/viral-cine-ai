# ViralCine 3.0.2 — compatibilidad de video Google 2026

## Correcciones

- Actualiza `@google/genai` desde la rama 1.x a `2.15.0`.
- Migra Gemini Omni desde `interaction.outputs` a `interaction.output_video`.
- Usa entrega por URI, espera el estado `ACTIVE` y descarga el MP4 mediante Files API.
- Elimina `generateAudio` de Veo 3.1; el audio nativo permanece siempre activo.
- Traduce respuestas 401/403 de Fal.ai a instrucciones operativas comprensibles.

## Motivo

Google retiró el esquema heredado de Interactions el 8 de junio de 2026. Los SDK JavaScript 1.x dejaron de ser compatibles con ese endpoint. Veo 3.1 genera audio nativamente y la API de Gemini no acepta un interruptor `generateAudio`.
