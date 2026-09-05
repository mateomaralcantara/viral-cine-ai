# Proveedores y funciones

| Función | Principal | Respaldo | Variables |
|---|---|---|---|
| Guion y continuidad | OpenAI Responses | Plan demo | `OPENAI_API_KEY` |
| Fotograma y personaje de referencia | GPT Image | Placa demo | `OPENAI_API_KEY` |
| Voz | GPT-4o mini TTS | Silencio demo | `OPENAI_API_KEY` |
| Video general | Gemini Omni | Veo, Fal.ai | `GEMINI_API_KEY`, `FAL_KEY` |
| Avatar con lip-sync | Fal.ai LongCat | Video general | `FAL_KEY` |
| Música | Fal.ai | Sin música | `FAL_KEY` |
| Supervisión visual | OpenAI | Pausa con error | `OPENAI_API_KEY` |
| Montaje | FFmpeg local | Ninguno | `FFMPEG_PATH` |

## Router de video

`VIDEO_PROVIDER=auto` intenta, en orden:

1. Gemini Omni con primer fotograma y referencias de personajes.
2. Veo 3.1 con primer fotograma.
3. Fal.ai con primer fotograma.

Puedes forzar `omni`, `veo` o `fal`. En modo real, si todos fallan, la toma falla: no existe un respaldo de imagen animada.

## Identidad y continuidad

OpenAI crea una referencia por personaje. Cada toma genera un primer fotograma usando esas referencias. Los proveedores de video reciben el fotograma y, cuando lo admiten, referencias adicionales. La supervisión compara tres fotogramas del resultado con la biblia y la toma anterior.

## Costos

`COST_AI_VIDEO_SECOND` expresa el costo preventivo del video general por segundo. `COST_AVATAR_SECOND` hace lo mismo para avatar. El presupuesto multiplica cada tipo por su duración y por el máximo de intentos configurado. Los precios reales cambian por modelo, resolución y proveedor.

Los nombres de modelos pueden cambiarse sin editar código mediante `GEMINI_OMNI_VIDEO_MODEL`, `GEMINI_VIDEO_MODEL`, `FAL_VIDEO_MODEL`, `FAL_AVATAR_MODEL` y `FAL_MUSIC_MODEL`.
