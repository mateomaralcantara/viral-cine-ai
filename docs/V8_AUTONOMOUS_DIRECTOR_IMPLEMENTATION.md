# ViralCine V8 — Director IA autónomo, plan de implementación

**Estado de esta rama:** política segura del supervisor y error de créditos implementados, sin render, sin nuevo cargo, sin worker permanente. Este documento no afirma que el servicio autónomo esté desplegado.

## Problema demostrado (E02, 2026-10-10)

- E01 terminada y aprobada; conservar todos los MP4.
- E02 tiene **7/7 JPG persistidos** en `VIRALCINE_DATA_DIR`; no repetir cargas.
- Runway Gen-4 Turbo respondió **HTTP 400: You do not have enough credits to run this task** antes de proporcionar un task ID.
- El archivo local `E02-P01/runway-gen4-turbo-operation.json` se creó como `failed-unknown` y el presupuesto marcó una **reserva interna** de 0.50 USD. Eso NO demuestra un cargo del proveedor. Hay que contrastar su historial/facturación.
- El runner actual `scripts/worker-v7.ts` todavía es un placeholder `SAFE_FOUNDATION`. El plan `scene-family-engine.ts` tiene 12 familias pero no ejecuta en background.
- El Supabase `wrxeerltoapvybhaxlmu` está operativo, con esquemas como `generation_jobs`, `provider_tasks`, `spend_ledger`, `incidents` y `repair_plans`, pero no hay cola de escenas E02 alimentada ni Edge Functions desplegadas. Los MP4/JPG actuales son locales, no se han migrado.

## Resultado requerido

El director entrega imágenes, guion, decisiones artísticas y autorización de presupuesto. **No arranca servidores, no consulta manualmente operaciones, no escribe tokens, no vuelve a subir MP4 y no aprueba cincuenta pasos técnicos.**

### Arquitectura

1. **Web/orquestador director**: una consola de película (no una interfaz por toma); muestra fase, bloqueo específico, gasto máximo y CTA contextual. El botón `Iniciar producción` configura una ejecución persistente.
2. **Supabase durable source-of-truth**: películas, escenas, tomas, `generation_jobs`, `provider_tasks`, `spend_ledger`, `audit_events`, `quality_reports`, `incidents` y `repair_plans`. Activar RLS/roles correctos, migraciones aditivas y eventos idempotentes.
3. **Object storage permanente**: buckets privados para referencias, fotogramas, voces, MP4 y masters; no depender de `C:\Users\...` ni de `.data` en el frontend. El worker recupera el artefacto exacto por hash y versión.
4. **Worker real 24/7 en servidor propio o gestionado** (por ejemplo Cloud Run Jobs/servicio con scheduler o un contenedor de larga vida), desplegado explícitamente. Procesa colas con lease, heartbeats, reintentos **solo locales/gratuitos** y checkpoints. Next.js y Vercel solo proporcionan UI/API; no usar un request HTTP largo como worker.
5. **Router de proveedores**: comprueba saldo/cuota, autenticación, precio, modelo y capacidad. Si Runway devuelve 400 sin saldo, marca `blocked-credits` y deja toda la escena en HOLD; no reenvía ni salta a un proveedor caro por su cuenta.
6. **Familias de agentes**: casting/imagen/continuidad/voz/producción/QA/reparación/edición/finanzas bajo un único supervisor; agentes producen evidencias y decisiones, no llamadas pagadas implícitas.
7. **Director humano**: consultas solo para faltantes (fotos, guion, derechos), presupuesto/provider nuevo o validación artística. El supervisor puede recomendar aprobación asistida por QA; jamás sustituir una aprobación creativa solicitada.

### Estados canónicos y recuperación

`waiting-assets → preflight → waiting-budget → ready → submitted → processing → qa → review → approved → assembled`

Excepciones: `blocked-credits`, `blocked-auth`, `blocked-provider`, `failed-unknown`, `manual-review`. Una operación sin task ID tras error HTTP **no debe reutilizar ni recibir una nueva autorización automática**, aun cuando la respuesta parezca no facturable. Al registrar `blocked-credits`, solo se descuenta la reserva local no consumida; el cobro real debe verificarse con el proveedor.

**Regla inviolable:** una autorización inicial hasta X USD no autoriza superar X, reintentar pagos ni cambiar a un motor distinto; el director aprueba cada cambio de coste y de proveedor. El worker guarda ID, ledger y snapshot **antes** de cada cambio de fase y recupera los trabajos existentes por su ID.

### Semántica de QA

- Comprobaciones gratuitas de archivo, duración, codecs, fotogramas, rostros, audio, continuidad y estabilidad.
- Reparación local acotada a un máximo de tres intentos sin costo; jamás bucle infinito.
- Cambiar prompt/render pagado solo con autorización adicional explícita.
- Estado aprobado persiste; no regenerar ni modificar una toma aprobada.
- En el corte final se añade audio, música, efectos y las voces canónicas en etapas versionadas independientes.

## Secuencia de implementación real

**Etapa A — ejecutable en esta rama:** clasificador `blocked-credits` + política `autonomous-director-policy.ts` y pruebas. No necesita token, saldo ni operación pagada.

**Etapa B — nuevo PR sin costo de render:** crear worker persistente basado en `generation_jobs`, `provider_tasks`, `spend_ledger`, `provider_health` y almacenamiento privado. Acciones `resume`, `reconcile` y preflight en segundo plano. Importar E01/E02 desde Windows **una sola vez**, con verificación SHA256 y sin sobrescribir fuentes.

**Etapa C — desplegar:** acordar dónde alojar el worker, presupuesto del alojamiento y credenciales; habilitar secretos vía gestor, HTTPS y acceso del director; comprobar recuperación tras apagado, caída de proveedor y reinicio.

**Etapa D — piloto E02:** reconciliar el Runway 400 sin inferir factura; elegir saldo Runway o proveedor alternativo bajo consentimiento. Generar **solo P01** con tope aprobado; verificar factura/MP4, QA y continuidad; después producir P02-P07 autónomamente dentro del presupuesto aprobado.

**Etapa E — película completa:** avanzar escenas según grafo del film; E01 aprobada y todas las escenas previas quedan inmutables. Reporte de coste/avance y notificaciones cuando hay decisión humana.

## Aceptación verificable

- Al cerrar Chrome, el trabajador sigue ejecutando y reanuda desde el último checkpoint.
- Reiniciar un worker no crea otra factura para el mismo intento.
- Proveedor sin saldo => HOLD + aviso, **0 nuevos envíos**, saldo y coste mostrados con su fuente.
- Cualquier error sin task ID es reconciliado como conocido/ambiguo antes de enviar una toma nueva.
- Abrir otra escena no exige otro servidor, token o importación de assets.
- Ninguna fotografía previa se reenvía ni reemplaza por accidente.
- El director recibe el MP4 unido para aprobarlo; el sistema no finge éxito antes de verificarlo.

## Pendientes y permisos explícitos

1. Un **host siempre encendido** para el worker y su costo; la computadora actual no puede sustituirse por magia desde una conversación de ChatGPT.
2. Definir dónde residen los **7 JPG originales**, acceso seguro desde un worker alojado y ubicación de MP4.
3. Autorizar **saldo de Runway** o **otro proveedor**. La falta de créditos actual no se puede resolver programando.
4. Dar autorización separada para despliegues con facturación, uso de APIs pagadas y publicación de películas. No publicar claves.

Este plan prohíbe sustituir el trabajo real por scripts de inicio repetidos, pantallas de diagnóstico por toma o otro ciclo de reinstalaciones.
