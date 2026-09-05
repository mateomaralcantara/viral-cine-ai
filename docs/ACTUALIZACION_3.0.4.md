# ViralCine 3.0.4 - Flujo seguro de video real

Esta version corrige el flujo que podia consumir varios intentos en la primera toma sin avanzar.

## Flujo activo

1. Reserva el costo estimado antes de llamar a una API.
2. Intenta Gemini Omni.
3. Si falla, intenta Google Veo.
4. Si Google falla, intenta Fal.ai video general.
5. Fal Avatar queda como ultimo respaldo y solo para un primer plano con un unico personaje.
6. Normaliza video y voz con FFmpeg.
7. Rechaza clips negros, congelados o con dialogo inaudible.
8. Ejecuta una sola auditoria de calidad.
9. Si no aprueba, pausa y espera una decision humana. No regenera automaticamente.
10. Guarda un checkpoint v2 con el modo de produccion y el proveedor utilizado.

## Cortafuegos de gasto

- `SCENE_QUALITY_MAX_ATTEMPTS=1`: un intento automatico.
- `SHOT_MAX_TOTAL_GENERATIONS=2`: maximo historico por plano; permite una regeneracion manual.
- `MAX_SHOT_SPEND_USD=5`: limite estimado por plano.
- `MAX_MOVIE_SPEND_USD=150`: limite global, siempre reducido al presupuesto del proyecto si este es menor.

La reserva es preventiva y no representa una factura exacta del proveedor. Su objetivo es detener la produccion antes de superar el limite configurado.

## Recuperacion

Cada plano aprobado se guarda de forma atomica. Los checkpoints antiguos no se reutilizan en modo real por defecto, porque pueden provenir de demo o de un clip que no paso los validadores nuevos.

El worker usa un bloqueo exclusivo en `.data/worker.lock`. Un segundo worker se detiene antes de leer la cola para impedir cobros duplicados.

## Importante

La instalacion no cambia claves, no borra proyectos y no inicia ninguna generacion facturable. El proyecto detenido puede reintentarse una vez despues de instalar; para una pelicula limpia se recomienda crear un proyecto nuevo.
