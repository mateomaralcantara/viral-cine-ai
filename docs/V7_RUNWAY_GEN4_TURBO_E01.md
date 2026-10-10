# ViralCine V7 — Runway Gen-4 Turbo como proveedor visual principal de E01

## Estado del cambio

- **P01/P02:** mantienen los MP4 y la aprobación artística originales generados con Veo.
- **P03–P07:** se preparan mediante la ruta `/api/v7/films/[filmId]/runway-gen4`.
- **NO inicia una generación ni factura al instalar o al abrir el panel.**
- No se ha comprobado en este PR una generación en una cuenta Runway real. La CI solo valida TypeScript, lógica, seguridad y ensamblaje local simulado.

## Qué ocurre al pulsar «Producir bloques faltantes con Runway»

1. El director introduce el **token administrativo local** y marca una autorización de gasto exacta (máximo inicial estimado USD 2.50 por cinco clips).
2. La aplicación genera un registro de reserva atómico por toma en `e01-p0X/runway-gen4-turbo-operation.json` **antes** de llamar a Runway.
3. Busca el último MP4 existente dentro de la misma escena: P03 parte del último fotograma de P02, P04 parte de P03 cuando exista; si falta, se declara el fotograma de una toma anterior.
4. FFmpeg crea una imagen JPG privada de 1280×720, enviada a Runway como data URI (no requiere URL pública). El secreto `RUNWAYML_API_SECRET` jamás llega al navegador.
5. Una petición `POST /v1/image_to_video` con `model=gen4_turbo`, `promptImage`, `promptText`, `ratio=1280:720`, `duration=10` recibe una tarea; se conserva su ID.
6. La página consulta **la misma tarea**, `GET /v1/tasks/:id`, y descarga su MP4 temporal cuando el estado sea `SUCCEEDED`. No reenvía otra generación, incluso si hubo timeout incierto.
7. El MP4 original de Runway se guarda como `E01-P0X-runway-gen4-turbo.mp4`; no se borran los fallos Veo ni los archivos existentes.
8. En la pestaña **Escenas**, cada nuevo MP4 aparece para revisión y aprobación humana; cuando todos estén aprobados, el ensamblador existente crea `scenes/e01/scene-cut.mp4` con 8+6×7 = 50 segundos.

La página debe permanecer abierta para ir enviando el lote en orden. Si se cierra, **las reservas y los ID de Runway sobreviven**, y se puede retomar la tarea original mediante «Recuperar misma tarea»; una segunda petición pagada para la misma toma queda bloqueada.

## Configuración

1. Conecta una cuenta con créditos para la **Runway Developer API**.
2. Establece `RUNWAYML_API_SECRET` en el entorno del servidor Next.js, por ejemplo en la carpeta local de desarrollo `.env.local` (no en GitHub). La clave es distinta del token `V7_CINEMA_ADMIN_TOKEN`.
3. Ejecuta el lanzador `scripts/INICIAR-V7-E01-CONSOLA.ps1`. Este carga el secreto privado (si existe), conserva el token administrativo cifrado y establece `V7_RUNWAY_E01_ENABLED=true`. Mantiene la generación Veo desactivada.
4. Abre `http://localhost:3010/v7/films/film-dos-toques-de-bocina-v7?tab=scene01`.

El costo publicado de Gen-4 Turbo en Runway es 5 créditos/segundo y USD 0.01/crédito. Cada render de 10 segundos equivale a **USD 0.50**, total cinco = **USD 2.50**, excluyendo impuestos, nuevas generaciones explícitas y otros servicios de imagen/voz.

## Limitaciones y próximas mejoras

- La referencia inicial es **una imagen** del MP4 anterior. Esto mejora el anclaje visual, pero **no garantiza identidad ni continuidad perfectas** en todos los movimientos.
- La voz, sincronía labial, efectos de sonido y dos bocinazos pertenecen a una fase posterior, no a Gen-4 Turbo.
- No afirmar película completa ni montaje terminado sin los cinco MP4, aprobación artística y reproducción del corte.
- Los errores de la API pueden ser independientes (Runway también aplica filtros y límites).
- Para dejar correr el flujo en segundo plano sin navegador: añadir workers, colas persistentes y leases en Supabase; esta fase usa el navegador como coordinador del lote y el servidor como fuente de verdad de cada operación.
- Estado posterior: mover el orquestador de lotes a un worker durable, añadir referencias de Avatares y QA multimodal por familia de agentes.

Fuentes oficiales:
- https://docs.dev.runwayml.com/guides/using-the-api/
- https://docs.dev.runwayml.com/guides/pricing/
- https://docs.dev.runwayml.com/assets/outputs/
