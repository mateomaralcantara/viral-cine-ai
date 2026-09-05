# ViralCine 3.1.0 - Solucion definitiva al bloqueo del 5%

Esta version corrige la causa estructural que mantenia una pelicula en el primer plano aunque el servidor, Google y FFmpeg funcionaran correctamente.

## Causa corregida

El motor anterior heredaba todos los personajes y todas las instrucciones de camara de una escena en cada toma de ocho segundos. Una sola generacion podia recibir simultaneamente plano general, plano medio, detalle, primeros planos, travelling y contrapicado. El proveedor devolvia transformaciones, rostros inconsistentes y composiciones imposibles de aprobar.

Ademas, la aprobacion manual no consolidaba el video fallido como checkpoint. Al reanudar, el motor volvia a generarlo y consumir credito.

## Nuevo flujo

1. Genera el guion y la biblia de personajes.
2. Divide cada escena en tomas de cuatro a ocho segundos.
3. Asigna un reparto especifico de uno o dos personajes a cada toma.
4. Elimina instrucciones de montaje, alternancia y cambios de escala.
5. Asigna una sola camara continua.
6. Ejecuta preflight local 10/10 antes de llamar a una API de video.
7. Usa exclusivamente Veo 3.1 Fast 720p.
8. Reserva como maximo una generacion por toma.
9. Rechaza video negro, congelado, corrupto o sin audio.
10. Si la auditoria visual falla, pausa sin regenerar.
11. Si el usuario acepta la toma, guarda checkpoint y continua sin generar ni cobrar nuevamente.

## Limites instalados

- `VIDEO_PROVIDER=veo`
- `REQUIRE_VIDEO_ONLY=true`
- `SCENE_QUALITY_MAX_ATTEMPTS=1`
- `SHOT_MAX_TOTAL_GENERATIONS=1`
- `MAX_SHOT_SPEND_USD=2`
- `MAX_MOVIE_SPEND_USD=50`
- `ALLOW_FAL_AVATAR_FALLBACK=false`
- `PRODUCTION_CONCURRENCY=1`

## Proyectos anteriores

Los proyectos y claves se conservan. Una toma detenida puede aceptarse despues de actualizar; la aprobacion guardara el video existente y avanzara sin cobrar. Para aprovechar el reparto por toma y los prompts reconstruidos desde el principio, se recomienda crear un proyecto nuevo despues de instalar 3.1.0.
