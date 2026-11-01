# ViralCine V8 — Escena 02: reanudación autónoma sin Avatares

## Hechos verificables

La película **DOS TOQUES DE BOCINA** tiene E01 aprobada en el disco local. E02 conserva siete JPG:
`VIRALCINE_DATA_DIR/v7/films/film-dos-toques-de-bocina-v7/e02-p01...e02-p07`.
Runway respondió a E02-P01 **HTTP 400 insuficiencia de créditos**, sin task ID. El
MP4 de P01 no está confirmado. **No saltes a P02 ni asumas que P01 está aprobado**.

El proyecto Supabase conectado todavía **no contiene esta película en public.films**
(solo películas de prueba). Sus tablas de tareas están vacías. No se han migrado
las siete fotografías locales ni las aprobaciones de E01. Por tanto, **aún no hay
producción autónoma desplegada para esta película.** No hay funciones Edge ni
programador permanente instalado.

## Decisión del director: solo Runway por ahora

- Motor de video autorizado para la Escena 02: **Runway Gen-4 Turbo**.
- **Sin cambio automático** a Veo, Fal, WAN u otros proveedores.
- Avatares continúa totalmente excluido.
- Se mantienen las siete fotos ya guardadas. El fallo de créditos de Runway
  es un bloqueo de proveedor, no un error que se pueda corregir enviando
  otra generación.
- Elegir Runway **no autoriza recargas, compras, nuevos cargos o reintentos
  pagados**. Se exige presupuesto explícito y saldo antes de generar.
- La reanudación en la nube depende todavía de trasladar los activos desde
  Windows y de desplegar el trabajador; no está funcionando 24/7.

## Qué ya puede hacer el código de esta rama

- `supabase/migrations/20261011_v8_autonomy_jobs.sql` crea una cola durable
  con RLS, `FOR UPDATE SKIP LOCKED`, lease de ejecución, fencing token,
  reintentos acotados, incidentes auditables y estados de espera.
- `scripts/worker-v8.ts` es un servicio headless sin dependencia de Chrome o
  Next.js. Ejecuta trabajos `source-check`, `quality-check` superficial,
  `provider-reconcile` por ID existente y `director-plan`.
- `lib/v7/orchestration/v8-free-autonomy-runner.ts` prohíbe explícitamente
  Avatares y cualquier creación pagada o duplicada. Los reintentos gratuitos
  tienen backoff exponencial, se registran y al agotarse escalan con error.
- En P01, `blocked-credits` suspende E02 y no vuelve a enviar a Runway.
  El US$0.50 'reservado' era contabilidad interna, no confirmación de factura.

### Qué todavía NO hace

No crea videos, no convierte las fotos locales automáticamente en archivos en
la nube, no hace QA cinematográfico completo, no mezcla audio y no compone el MP4
final. Un `HEAD` que confirma un archivo en Storage no equivale a aprobarlo.
El worker no puede fabricarse un servidor 24/7: necesita alojamiento y secretos.
**No activar el worker sin el almacenamiento de E02 y una autorización clara.**

## Primer arranque seguro (una sola implementación de infraestructura)

1. **Preservar E01 y E02 en Windows.** No borrar, renombrar ni sobreescribir.
2. Crear bucket **privado** de Supabase para referencias, renders y masters.
   Migrar los 7 JPG con SHA256 y registrar su ruta/consentimiento.
3. Insertar de modo idempotente la película, guion, escenas, tomas, aprobaciones
   y operaciones existentes; distinguir IDs de película canónicos de IDs legacy.
4. Aplicar la migración SQL de la cola (aditiva y reversible, no crea jobs
   automáticamente) y verificar seguridad RLS.
5. Ejecutar el worker V8 en un contenedor gestionado o VPS siempre encendido.
   Variables solo **del servidor**: `V8_AUTONOMY_ENABLED=true`,
   `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, `V8_WORKER_POLL_MS`.
   `RUNWAYML_API_SECRET` solo para consultar por ID operaciones existentes.
   No exponer ninguna clave en Next.js cliente ni en repositorios.
6. Sembrar trabajos gratuitos de validación sobre las siete fotos y procesar
   la cola sin botones por toma. Confirmar que cerrar navegador NO detiene
   el worker.
7. Elegir cómo solucionar **falta de créditos**. La reposición de saldo,
   proveedor alternativo y presupuesto son decisiones comerciales; ninguna
   reanudación gratuita repara una cuenta sin saldo.
8. Después de autorización, implementar el adaptador de envío pagado con
   idempotencia antes de permitir renders. Probar P01 de manera aislada;
   continuar P02, P03…P07 solo después de recibir MP4 válido y pasar QA.
9. Añadir voz, sonido, FFmpeg, QA visual/identidad y reparación local gratuita;
   solicitar aprobación artística del corte completo de 55 segundos.

## Recuperación automática y límites

- Red/Storage con error temporal: reintento gratuito con backoff y máximo
  por trabajo.
- Tarea externa con ID conocido: consultar ese mismo ID sin generar otra.
- Crash del worker: pasado el lease, otra instancia recupera el trabajo;
  el fencing token evita que una instancia caducada finalice el registro.
- Créditos insuficientes, credenciales inválidas, QA que requiere nuevo
  render: HOLD; avisar al director. **Nunca pagar o escoger otro proveedor
  automáticamente sin un consentimiento vigente.**
- No hay aprobación artística automática irreversible de un video nuevo.
- Toda referencia de Avatares: denegada hasta nueva autorización explícita.

## Verificación de aceptación

`npm run typecheck`, `npm test`, `npm run build` deben aprobarse.
Después debe existir una prueba real de despliegue con un worker capaz de
procesar una tarea sin abrir Chrome, recuperación tras apagado y cero llamadas
pagadas no autorizadas. Sin estas pruebas, el estado sigue **fundación, no
producción autónoma en vivo**.
