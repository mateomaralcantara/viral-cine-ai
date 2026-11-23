# ViralCine V7 — Arquitectura Scene Family OS (rama experimental)

## Objetivo y alcance

Película completa → actos → secuencias → **escenas completas** → tomas/bloques → takes.

Una escena es la unidad visible de producción, aprobación y montaje. El motor desglosa todas las escenas existentes del Film Bundle; no hay que desarrollar nuevos componentes o endpoints por E01-P03, E01-P04, etc.

**Piloto:** DOS TOQUES DE BOCINA (actualmente 10 escenas y ~80 tomas previstas por guion; el motor se ha probado adicionalmente con 80 escenas). No se inventan escenas ni se alteran tiempos de la biblia.

## Flujo obligatorio

1. Director/guion: película y desglose cronológico; DAG idempotente de escenas completas.
2. Casting + Voice Vault: rostro, identidad, voces/códigos por personaje, permisos y derechos.
3. Continuidad: snapshot inmutable entre escenas (vestuario, motor, escuela, props, luz, personajes, voz).
4. Fotografía + sonido: plan de cada bloque; material de referencia y diálogos.
5. Finanzas: presupuesto por escena/película y autorización explícita de proveedor; jamás confundir costo estimado con gasto autorizado.
6. Producción: **recuperar** tareas/MP4 existentes antes de cualquier petición a un proveedor. Una operación con estado incierto jamás se reenvía.
7. Supervisión de calidad independiente por toma: duración, codec, identidad, continuidad, vestuario, voces, sincronía, física, narrativa.
8. Autocorrección: inspeccionar → determinar causa → reparación local sin costo → volver a inspeccionar. Máximo 3 intentos gratuitos por defecto; si no converge, bloquear y escalar; prohibido repetir una generación pagada automáticamente.
9. Aprobación humana por toma: botón siempre visible; habilitado automáticamente al existir y validarse el candidato. La aprobación crea acta inmutable enlazada al SHA-256 original.
10. Montaje de **toda** la escena: FFmpeg local, normalización de clips, audio preservado o silencio controlado, recortes al tiempo del guion, archivo nuevo, sin reescribir originales.
11. QA de escena + aprobación humana: botón siempre visible y habilitado cuando todas las tomas tienen aprobación y existe MP4 de escena.
12. Archive + master final: registrar hashes y versiones; continuar a la escena siguiente, sin perder decisiones previas.

## Componentes de esta primera etapa

- `lib/v7/orchestration/scene-family-engine.ts`: catálogo de 12 familias, DAG completo, supervisión autocorrectiva gratuita y bounded loop.
- `lib/v7/production/scene-approval-board.ts`: tablero único, estado persistente, aprobaciones atómicas y verificaciones de archivos.
- `lib/v7/production/scene-local-assembler.ts`: montaje local de todas las tomas aprobadas, con FFmpeg y publicación sin reemplazar videos de origen.
- `app/api/v7/films/[filmId]/scene-production`: API autenticada GET/POST, sin acceso a proveedores.
- `components/V7SceneProductionBoard.tsx`: botones persistentes por escena y toma, previsualización, montaje y lectura automática del estado.
- `tests/v7-scene-family-engine.test.ts`: escalado a 80 escenas, QA autónoma limitada y bloqueo de reintento pagado.

El tablero se integra en la pestaña **Escenas**; no hay que repetir la instalación por cada nueva toma.

## Seguridad y límites

- *Esta fase NO activa automáticamente la generación pagada de los bloques faltantes.* El dispatch multi-escena con proveedores, autorización económica agregada y ledger de gastos sigue como fase posterior.
- Tampoco implica que 12 familias sean doce modelos de IA autónomos ya desplegados: son contratos y unidades del plan de trabajo; para pasar a producción se conectarán ejecutores reales, colas durables y QA multimodal.
- Autocorrección no significa reintentos infinitos: reintentos locales acotados y escalamiento obligatorio. Nunca se promete que cualquier error puede resolverse de forma autónoma.
- `provider-operation.json` y los MP4 existentes se conservan; no se borran ni se reenvían tareas inciertas.
- QA artística humana y QA técnica automática son estados separados. Una aprobación de toma no constituye aprobación automática de la escena o del master.
- El actor que envía el POST debe poseer `V7_CINEMA_ADMIN_TOKEN` para escribir aprobaciones o iniciar ensamblaje.
- Antes de producción comercial: trabajadores durables, pruebas end-to-end contra datos de prueba, almacenamiento transaccional, observabilidad, RBAC por usuario y permisos de gasto por escena.

## Próxima etapa

Unir DAG con un **worker de película completo** y un planificador persistente (Supabase + cola + lease/heartbeat); iniciar con `preflight`, recuperar assets existentes, ejecutar cada escena por bloques cuando se autorice un presupuesto acumulado, QA multidimensional real, reparación localizada, montaje y notificación de botones de aprobación.

El cambio no debe instalarse en la carpeta local de producción hasta pasar CI y revisión en una rama aislada.
