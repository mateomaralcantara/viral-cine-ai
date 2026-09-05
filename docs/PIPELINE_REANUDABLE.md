# Pipeline reanudable por toma

ViralCine 3.0 divide películas de 5–120 minutos en escenas y luego en tomas de 4–8 segundos. La toma es la unidad mínima durable: una toma aprobada no se regenera al reiniciar.

## Orden de persistencia

1. Crear o reutilizar voz y primer fotograma.
2. Solicitar un video real al proveedor.
3. Normalizar el resultado en un archivo `.partial-<uuid>.mp4`.
4. Validar video, audio y duración con `ffprobe`.
5. Publicar el MP4 canónico mediante cambio de nombre.
6. Generar hoja de contacto y evaluación de calidad.
7. Corregir y repetir si la evaluación falla.
8. Al aprobar, escribir atómicamente el checkpoint de toma.
9. Después de aprobar todas las tomas, concatenar y guardar el checkpoint de escena.

## Archivos

```text
.data/projects/<id>/
  project.json
  checkpoints/
    scene-001-shot-01.json
    scene-001-shot-02.json
    scene-001.json
  quality/
    scene-001-shot-01-attempt-01.jpg
    scene-001-shot-01-attempt-01.json
    scene-001-shot-01-latest.json
  images/
    character-<id>.png
    scene-001-shot-01.png
  audio/
    scene-001-shot-01.mp3
  video/
    scene-001-shot-01.mp4
    scene-001.mp4
  exports/
    pelicula-final.mp4
```

## Recuperación

Al arrancar, el worker devuelve a la cola proyectos detenidos en `producing` o `composing`. Una toma que estaba en `rendering` vuelve a `pending`; una toma `ready` conserva su estado. Antes de generar, el worker verifica el checkpoint, tamaño, pistas y duración del MP4. Si los recursos canónicos son válidos pero falta el JSON, reconstruye el checkpoint.

Un archivo `.partial-*` nunca se acepta como resultado. Si el cierre ocurrió durante el montaje, las escenas se recomponen con sus tomas ya validadas.

## Garantías y límite

- Las tomas aprobadas sobreviven al cierre del panel, worker o Windows.
- Una toma defectuosa no invalida las anteriores.
- `.env.local` y `.data` no son reemplazados por el instalador.
- Un proveedor puede facturar una solicitud que quedó en curso antes de una interrupción. Sin un resultado descargado no es posible recuperarla localmente; solo se repite esa toma.

Inicia siempre con `npm run studio` o `run-dev.ps1` y conserva copias de seguridad de `VIRALCINE_DATA_DIR`.
