# ViralCine 7 — Migration Roadmap

## Principio

ViralCine 6 permanece estable en `feat/viralcine-6-runway-safe`.

ViralCine 7 se desarrolla en `feat/viralcine-7-feature-film-os`.

No se migra un proyecto ni se ejecuta una API pagada automáticamente.

## Fase 1 — Domain Core

Estado: **implementado**.

- Film → Act → Sequence → Scene → Shot → Take.
- Asset Registry.
- VoiceProfile / Voice DNA.
- Continuity domain.
- GenerationJob.
- Approvals.
- Audit.
- Versioning.
- Timeline.
- Actor Library / Film Library.
- Adaptador V6 → V7.

## Fase 2 — Persistence

Estado: **base implementada / conexión externa pendiente**.

Implementado:
- store local aislado `.data/v7`;
- schema SQL PostgreSQL/Supabase;
- provenance y versioning.

Pendiente para activación:
- proyecto Supabase dedicado;
- RLS;
- service roles;
- object storage;
- migración controlada.

## Fase 3 — Continuity Brain + Voice Vault

Estado: **motor de dominio implementado**.

Pendiente:
- persistence repository;
- similarity/identity embeddings;
- auditor visual entre escenas;
- UI de snapshots;
- library cross-film.

## Fase 4 — Generic Production Engine

Estado: **foundation implementada**.

Implementado:
- strategy registry;
- Take service append-only;
- Provider Gateway contracts;
- Cost Controller;
- state machine.

Pendiente:
- adapters V6 → Provider Gateway V7;
- renderer genérico;
- identity/continuity guard pipeline real.

## Fase 5 — Distributed Jobs

Estado: **DAG + queue contract implementados**.

Pendiente:
- Redis;
- BullMQ;
- worker leases;
- provider rate limits;
- durable reconciliation workers;
- observability.

## Fase 6 — Agent Departments

Estado: **contracts implementados**.

Pendiente:
- Master Director;
- Story;
- Script;
- Continuity;
- Cinematography;
- Shot;
- Voice;
- Editor;
- QA;
- Cost planning implementations.

Regla:
agents plan; deterministic services execute.

## Fase 7 — Timeline / OTIO

Estado: **domain + local engine + OTIO-JSON implementados**.

Pendiente:
- UI timeline;
- J/L cuts;
- transition renderer;
- audio mixer;
- subtitle editor;
- DaVinci/Premiere interoperability validation.

## Fase 8 — Hierarchical QA + Mastering

Estado: **QA aggregation + master audit foundation implementada**.

Pendiente:
- model-backed QA by level;
- color pipeline;
- loudness normalization;
- 4K;
- stems;
- DCP;
- delivery presets.

## Release Gates

V7 no sustituye a V6 hasta que cumpla:

1. Typecheck PASS.
2. Todos los tests V6 PASS.
3. Todos los tests V7 PASS.
4. Build PASS.
5. Migración V6 → V7 reversible.
6. Spend Ledger no regresiona.
7. Failed-unknown nunca hace retry automático.
8. Continuity QA feature-film PASS.
9. Timeline/master reproduce assets seleccionados.
10. Prueba real de 90 minutos con checkpoints y resume.

## Métricas 10/10

- continuidad de identidad >= 99%;
- pérdida de assets = 0;
- duplicación de gasto por retry ambiguo = 0;
- provenance de assets = 100%;
- jobs idempotentes = 100%;
- recuperación tras caída = 100% de jobs reconciliables;
- master reproducible desde FilmVersion + TimelineVersion;
- costo/minuto terminado visible;
- derechos/consentimiento rastreables para voces/actores.
