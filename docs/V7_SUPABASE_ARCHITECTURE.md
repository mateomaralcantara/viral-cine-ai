<!-- Documento histórico de la rama feat/v7-supabase-architecture (2026-10-08); métricas y pendientes requieren verificación actual. -->

# ViralCine V7 — Arquitectura de transición segura (2026-10-08)

## Estado verificado
- Supabase project ref: `wrxeerltoapvybhaxlmu`, región us-east-1.
- 57 tablas públicas con RLS activado, pero 57 avisos de ausencia de políticas.
- El advisor reporta 90 claves foráneas sin índice de soporte.
- El proyecto Next.js 16 actual conserva la verdad operacional en `.data/projects/<id>`, checkpoints por toma/escena, y ejecuta un worker local.
- La rama `main` no tiene aún el adaptador Supabase V7. Una conexión HTTP 200 no equivale a integración persistente.
- Nunca subir archivos `.env.local` o secretos a GitHub.

## Arquitectura objetivo

Panel Next.js (navegador, solo publishable)
   -> BFF autenticado / rutas server-only (validación, membresía, límites)
      -> Orquestador de producción / máquina de estados
         -> Repositorio de persistencia (interfaz)
            -> Adaptador LOCAL (actual, canónico y estable)
            -> Adaptador SHADOW (lectura/escritura controladas en entorno de pruebas)
            -> Adaptador SUPABASE (futuro, luego de reconciliación)
         -> Worker y cola: jobs durables en PostgreSQL; Redis/BullMQ opcional como transporte
         -> Agentes: guion, planificación, casting, voces, continuidad, video, audio, QA, reparación, montaje
         -> Storage privado: media / checkpoints / masters, hashes SHA-256 e IDs inmutables
         -> Observabilidad y control de gasto: audit_events, generation_jobs, spend_ledger, incidents

## Contratos operativos
1. Local = fuente canónica inicial. No sustituir los checkpoints actuales ni borrar activos.
2. Shadow = escribir a Supabase únicamente mediante operación autorizada e idempotente; una falla remota no destruye la operación local. Registrar divergencias, reintentar solo operaciones sin costo y reconciliar.
3. Supabase = fuente canónica futura **únicamente** tras pruebas de migración, lecturas comparadas, rollback probado y autorización.
4. Cada toma usa un ID estable y un idempotency key. Los reintentos pagados están prohibidos sin aprobación explícita.
5. Secret key exclusiva de procesos del servidor. Jamás NEXT_PUBLIC, bundles, logs, capturas, ni respuestas al navegador.
6. La clave publishable no concede acceso a tablas sin GRANT + política RLS. Crear políticas específicas por usuario/film_memberships, después de definir Auth.
7. Mantener `ALLOW_EXTERNAL_API_CALLS=false`, `ALLOW_PAID_GENERATION=false`, `ALLOW_PAID_PROVIDER_FALLBACK=false` durante preparación.
8. Las versiones de guion, voz, personaje, referencia, toma y material aprobado son inmutables; los cambios crean una nueva versión.
9. Voz: `voice_profiles` asocia voz canónica con personaje, película y versión de referencia; los consentimientos/licencias se conservan en `rights_grants`.
10. Reusar siempre material aprobado antes de generar. QA → aprobar / reparar fuente fallida / revisión humana, con `quality_reports`, `incidents`, `repair_recipes`, `lessons_learned`.

## Plan de implementación (gates)
**G0 / aislamiento**: rama V7, `main` inmutable, registro del último commit estable. Revisión de dependencias y scripts actuales.

**G1 / seguridad**: rotar secret parcialmente expuesta; revisar los 57 avisos RLS, usuarios/roles, grants, políticas de Storage, auditoría de funciones privilegiadas. Evitar apertura generalizada a `anon`.

**G2 / compatibilidad**: auditar el código local (puede contener cambios no enviados a GitHub); inventariar estructura `.data`, assets, esquemas y relaciones; verificar mapeo de IDs y claves foráneas.

**G3 / capa de acceso**: instalar versión fijada de `@supabase/supabase-js` con lockfile; crear interfaz `ProductionRepository` + adaptadores local/supabase. Nunca importar cliente administrador en Client Components.

**G4 / pruebas read-only**: ejecutar `npm run v7:check:supabase`; validar HTTP 200 en Auth y consulta con secret usando User-Agent backend; no escribir ni imprimir claves. Probar valores negativos.

**G5 / shadow controlado**: activar con flag específico y permisos server-only; escribir fixtures sintéticos con IDs estables; validar integridad, reversión y métricas. No replicar automáticamente producción.

**G6 / continuidad**: mapear `films, film_versions, scenes, shots, takes, assets, voice_profiles`; adjuntar hashes y preservar referencias y permisos de cada archivo.

**G7 / agentes y memoria**: registrar `process_runs`, `process_events`, incidentes, reparaciones y observaciones. Procesar jobs en worker con backpressure y límites; registrar los costos previstos y reales por proveedor.

**G8 / QA cinematográfico**: agentes independientes para continuidad facial, voz, sincronía, física, narración y derechos. No aprobar por promedio si hay un fallo crítico.

**G9 / piloto**: migrar UNA película/escena de prueba con comparación byte a byte o hashes, rollback documentado, presupuesto cero para pruebas API.

**G10 / staging y despliegue**: pipeline CI (`typecheck`, `test`, `build`, smoke), preview separada, secretos por entorno y observabilidad; promoción a producción manual.

## Primer entregable
`scripts/v7-check-supabase.mjs`: validador HTTP de solo lectura, sin instalar dependencias nuevas, sin cambios remotos. Modo local intacto.

## Pendientes antes del shadow
- Revisar y resolver avisos de seguridad y rendimiento pertinentes al patrón de consultas real.
- Determinar si la base remota debe atender usuarios autenticados o únicamente backend administrativo.
- Medir cobertura de pruebas y reconciliación de media.
- Confirmar que el repositorio GitHub refleja todos los cambios del equipo local.
