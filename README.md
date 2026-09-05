# ViralCine Studio Pro 3.3 · Safety Hardening

Productora audiovisual privada para crear películas de **5 a 120 minutos** desde una premisa. La versión 3 genera guion, personajes, referencias, voz, tomas de video, avatares, música, subtítulos y un MP4 final mediante un flujo durable y reanudable.

## Novedades acumulativas

- Películas configurables de 5–120 minutos.
- Guion estructurado y biblia de continuidad con OpenAI.
- División automática de cada escena en tomas de video de 4–8 segundos.
- En producción real, todas las tomas terminan como video: no existe respaldo de galería o fotografía hablada.
- Router de video con un solo proveedor por defecto; el cambio pagado entre proveedores requiere autorización explícita.
- Avatares con voz y sincronización labial vía Fal.ai.
- Checkpoint atómico por toma y por escena.
- Recuperación automática después de cerrar el panel, el worker o Windows.
- Guardado inmediato de cada video recibido antes de cualquier auditoría de calidad.
- Cero regeneraciones automáticas en la configuración segura.
- Pausa recuperable por saldo o por seguridad, sin matar el panel.
- Presupuesto preventivo por segundos de video y por intentos, no por cantidad de escenas.
- Montaje FFmpeg H.264/AAC, música, subtítulos y exportación MP4.
- Panel + worker local para trabajos de varias horas.

## Requisitos

- Windows 10/11, macOS o Linux.
- Node.js 22 o superior.
- npm 10 o superior.
- FFmpeg completo disponible en `PATH`.
- Producción real: `OPENAI_API_KEY` y al menos `GEMINI_API_KEY` o `FAL_KEY`.
- Para avatares con lip-sync y música: `FAL_KEY`.

## Inicio en Windows

```powershell
cd "C:\ruta\viral-cine-ai"
powershell -ExecutionPolicy Bypass -File .\run-dev.ps1
```

Abre `http://localhost:3000`. El comando inicia el panel y el worker; no uses únicamente `npm run dev` para producir.

## Configuración real recomendada

La instalación arranca en modo offline. Para producción real se requieren **dos autorizaciones independientes**, además de las claves. No actives estos valores durante pruebas:

Copia `.env.example` a `.env.local`, conserva tus claves en ese archivo y usa:

```env
PRODUCTION_MODE=real
REQUIRE_REAL_MEDIA=true
ALLOW_EXTERNAL_API_CALLS=true
ALLOW_PAID_GENERATION=true
ALLOW_PAID_PROVIDER_FALLBACK=false
AUTO_REGENERATE=false

OPENAI_API_KEY=...
OPENAI_SCRIPT_MODEL=gpt-5.6-terra
OPENAI_IMAGE_MODEL=gpt-image-2
OPENAI_TTS_MODEL=gpt-4o-mini-tts

VIDEO_PROVIDER=veo
GEMINI_API_KEY=...
GEMINI_OMNI_VIDEO_MODEL=gemini-omni-flash-preview
GEMINI_VIDEO_MODEL=veo-3.1-fast-generate-preview

FAL_KEY=...

SCENE_QUALITY_MODE=strict
SCENE_QUALITY_MIN_SCORE=9.0
SCENE_QUALITY_MAX_ATTEMPTS=1

COST_AI_VIDEO_SECOND=0.10
COST_AVATAR_SECOND=0.30
SHOT_MAX_TOTAL_GENERATIONS=1
MAX_MOVIE_SPEND_USD=12
```

Los valores de costo son referencias editables. Consulta la tarifa del modelo antes de cada película larga.

## Flujo de producción

1. Crear el proyecto con título, premisa, duración, estilo y presupuesto.
2. Generar el guion, los personajes y las escenas.
3. Revisar el plan: cada escena muestra sus tomas de 4–8 segundos.
4. Guardar los cambios. Alterar duración, modo, narración, diálogo, cámara o prompt recalcula las tomas.
5. Iniciar producción.
6. El worker guarda y valida una toma antes de comenzar la siguiente.
7. Una nota baja pausa la producción; nunca provoca otra generación automática.
8. Al terminar, descargar `pelicula-final.mp4`.

El modo demo crea placas animadas únicamente para comprobar FFmpeg sin consumir APIs. Esa simulación no se usa como respaldo cuando `PRODUCTION_MODE=real`.

Un proyecto que ya contiene generaciones pagadas tampoco puede reanudarse en modo demo: el sistema lo pausa para proteger el material existente.

## Persistencia

Los proyectos se guardan por defecto en `.data/projects/<id>`. Puedes moverlos:

```env
VIRALCINE_DATA_DIR=C:\ViralCineData
```

Cada toma aprobada tiene recursos canónicos y `checkpoints/scene-NNN-shot-XX.json`. Cada escena montada también tiene `checkpoints/scene-NNN.json`. En un reinicio, el worker valida MP4, audio, duración y checkpoint; solo repite la unidad incompleta.

## Comandos

```text
npm run studio       Panel y worker en desarrollo
npm run worker       Solo worker
npm run build        Compilación de producción
npm run studio:prod  Panel y worker compilados
npm run typecheck    Validación TypeScript
npm test             Pruebas automáticas
npm run smoke        Prueba técnica completa sin consumir APIs
npm run check:env    Diagnóstico rápido
```

Diagnóstico offline en Windows:

```powershell
npm run check:env
npm test
npm run smoke
```

## Documentación

- [Seguridad offline y control de gasto 3.3](docs/HARDENING_OFFLINE_3.3.md)
- [Arquitectura](docs/ARCHITECTURE.md)
- [Proveedores](docs/API_PROVIDERS.md)
- [Pipeline reanudable](docs/PIPELINE_REANUDABLE.md)
- [Puerta de calidad](docs/QUALITY_GATE.md)

Documentación oficial de proveedores:

- [OpenAI Structured Outputs](https://developers.openai.com/api/docs/guides/structured-outputs)
- [OpenAI Text to Speech](https://developers.openai.com/api/docs/guides/text-to-speech)
- [OpenAI Image Generation](https://developers.openai.com/api/docs/guides/image-generation)
- [Gemini Omni](https://ai.google.dev/gemini-api/docs/omni)
- [Google Veo](https://ai.google.dev/gemini-api/docs/veo)
- [Fal.ai JavaScript client](https://docs.fal.ai/clients/javascript)

Sora 2 no forma parte del router porque su API tiene cierre anunciado para el 24 de septiembre de 2026. Los adaptadores quedan separados para sustituir un proveedor sin reconstruir el estudio.

## Seguridad

Las claves permanecen en el servidor y `.env.local` está excluido de Git. Nunca uses prefijos `NEXT_PUBLIC_` para secretos. Los valores de ejemplo o `DISABLED_OFFLINE` no se consideran credenciales. Si expones el panel en una red, define `STUDIO_ACCESS_KEY`.
