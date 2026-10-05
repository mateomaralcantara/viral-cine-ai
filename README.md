# ViralCine Studio Pro 4.2

Motor privado de producción audiovisual larga con flujo **reanundable, resiliente y con control de gasto**. ViralCine 4.2 convierte un plan narrativo en referencias visuales, video, voces, lip-sync, música y un máster MP4 verificable.

## Arquitectura 4.2

- Full Flow por toma: referencia → video → voz → lip-sync cuando aplica → música → promoción oficial.
- Tomas single y multihablante con pipelines separados y compatibles.
- Checkpoints e idempotencia para no repetir etapas pagadas ya completadas.
- Batch resiliente: una toma fallida pasa a `RETRY_PENDING` y el lote continúa.
- Fallback de imágenes por continuidad cuando el proveedor bloquea por moderación, 429, 5xx o timeout.
- Modo de video local por FFmpeg para terminar producción sin depender de Veo:
  `VIRALCINE_LOCAL_VIDEO_ONLY=1`.
- Modo de cierre sin Fal cuando el lip-sync externo no está disponible:
  `VIRALCINE_LOCAL_LIPSYNC_ONLY=1`.
- Rescate de timing para narración off-camera y tomas segmentadas dentro del schema de 4–8 s.
- Ledger de gasto por operación y reporte histórico por proveedor.
- Exportación final de las tomas oficiales a un solo máster MP4.
- Validación TypeScript, tests, smoke real-cinema, build y dependency audit en CI.

## Requisitos

- Windows 10/11, macOS o Linux.
- Node.js 22 o superior.
- npm 10 o superior.
- FFmpeg completo disponible en `PATH`.
- Para producción con proveedores externos, configura solo las claves que realmente usarás en `.env.local`.

## Inicio rápido

```powershell
cd "C:\ruta\viral-cine-ai"
npm install
npm run studio
```

El panel usa Next.js y el worker ejecuta las tareas de producción. Las claves permanecen en servidor; nunca uses prefijos `NEXT_PUBLIC_` para secretos.

## Flujo recomendado de producción

1. Crear o cargar el proyecto.
2. Revisar plan, casting, continuidad y duración.
3. Ejecutar preflight antes de cualquier gasto.
4. Producir por toma con `shot:full` o por lote con `batch:full`.
5. Reutilizar automáticamente todo checkpoint ya listo.
6. Resolver al final únicamente las tomas `RETRY_PENDING`.
7. Confirmar `84/84` o el total correspondiente con `full:status`.
8. Exportar el máster con `movie:master`.
9. Hacer QA final y mastering de publicación fuera del generador si solo hace falta ajuste de audio.

## Comandos 4.2

```text
npm run studio             Panel + worker
npm run worker             Solo worker
npm run build              Build de producción
npm run typecheck          Validación TypeScript
npm test                   Suite de pruebas
npm run smoke              Smoke técnico sin gasto

npm run shot:full          Full Flow de una toma
npm run batch:full         Full Flow resiliente por lote
npm run full:status        Estado global del proyecto
npm run spend:report       Reporte de gasto del ledger
npm run movie:master       Preflight/exportación del máster final
npm run cleanup:workspace  Limpia build/caches sin tocar proyectos ni credenciales
```

### Ejemplo: preflight de una toma

```powershell
npm run shot:full -- preview "<projectId>" "<shotId>"
```

### Ejemplo: batch

```powershell
npm run batch:full -- preview "<projectId>" --max-shots 10
```

La ejecución pagada exige confirmaciones explícitas implementadas por cada comando. No elimines esas confirmaciones en producción.

### Exportar el máster

```powershell
npm run movie:master -- preview "<projectId>"
npm run movie:master -- run "<projectId>" --confirm EXPORTAR MASTER 4.2
```

La exportación del máster no llama OpenAI, Veo, ElevenLabs ni Fal: concatena los assets oficiales existentes y valida audio/video/duración.

## Modos de cierre económico

Cuando un proveedor de video está sin cuota o inestable:

```powershell
$env:VIRALCINE_LOCAL_VIDEO_ONLY = "1"
```

Cuando Fal no está disponible y necesitas terminar una toma con el audio correcto pero sin animación labial externa:

```powershell
$env:VIRALCINE_LOCAL_LIPSYNC_ONLY = "1"
```

Estos modos deben considerarse degradaciones controladas de calidad, no sustitutos permanentes del router multi-proveedor futuro.

## Persistencia y seguridad

Los proyectos viven en:

```text
.data/projects/<projectId>
```

Ahí se almacenan assets, checkpoints, ledger y exports. **`.data/` no debe borrarse durante una limpieza normal.**

También se preservan:

- `.env.local`: credenciales locales.
- `node_modules/`: dependencias instaladas.
- assets oficiales del proyecto.
- másters y manifiestos QA.

El comando seguro:

```powershell
npm run cleanup:workspace
```

solo elimina artefactos reconstruibles como `.next`, coverage, reportes temporales, diagnósticos, smoke data y caches.

## Proveedores

ViralCine 4.2 incluye integración o soporte operativo para:

- OpenAI: referencias visuales y componentes del pipeline.
- Google Veo: video generativo.
- ElevenLabs: voces.
- Fal.ai: lip-sync y música.
- FFmpeg: montaje, fallback local, mezcla y exportación.

La dirección recomendada para la siguiente versión es un **router multi-proveedor** para que ningún proveedor externo sea un punto único de fallo.

## Documentación

- [Pipeline Real Cinema 4.x](docs/VIRALCINE_4_REAL_CINEMA_PIPELINE.md)
- [Arquitectura](docs/ARCHITECTURE.md)
- [Proveedores](docs/API_PROVIDERS.md)
- [Pipeline reanudable](docs/PIPELINE_REANUDABLE.md)
- [Puerta de calidad](docs/QUALITY_GATE.md)
- [Hardening offline 3.3](docs/HARDENING_OFFLINE_3.3.md)

## Estado del repositorio

La rama `feat/viralcine-4-real-cinema` contiene la arquitectura de producción 4.2 validada en CI. Los scripts específicos creados únicamente para reparar tomas concretas de una producción terminada no forman parte del núcleo reutilizable.
