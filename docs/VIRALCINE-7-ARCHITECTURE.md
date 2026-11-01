# ViralCine 7 — Agentic Feature Film OS

## Objetivo

ViralCine 7 transforma el sistema de producción por escenas de ViralCine 6 en un sistema operativo de cine para cortos y largometrajes. La arquitectura preserva los componentes maduros de V6 —Safe Cost Gate, Spend Ledger, checkpoints, Identity Lock, Voice Lock, recovery, media validation y proveedores— y añade una capa V7 paralela, versionada y no destructiva.

La regla principal es:

> Los agentes planifican. Los servicios deterministas ejecutan.

Ningún contrato de agente recibe credenciales ni clientes de proveedores.

## Jerarquía cinematográfica

```
Film
└── Act
    └── Sequence
        └── Scene
            └── Shot
                ├── Take 1
                ├── Take 2
                └── Selected Take
```

- **Shot** describe la intención cinematográfica.
- **Take** es una ejecución/generación concreta.
- Crear un Take nuevo nunca sobrescribe los anteriores.
- `selectedTakeId` apunta al resultado elegido.

El dominio permite hasta 5 actos, 200 escenas, 2,000 shots, 100 personajes y múltiples takes por shot.

## Master Director / Showrunner

El Master Director coordina:
- Story / Script Intelligence.
- Pre-production.
- Financial Intelligence.
- Production hierarchy.
- Continuity.
- Audio.
- QA.
- Post-production.
- Final audit.

El contrato existe en `lib/v7/agents/contracts`; la ejecución de modelos queda fuera del agente.

## Memory Core

`lib/v7/memory` define tres grafos:

1. Narrative Graph.
2. Visual / Continuity Graph.
3. Audio Graph / Voice DNA.

También mantiene World State, Asset Registry y Project History.

## Continuity Brain

`lib/v7/continuity` modela y resuelve:

- Character Memory.
- Location Memory.
- Prop Memory.
- Wardrobe Memory.
- Relationship State.
- Emotional State.
- Injury / Physical State.
- Last Approved Frame.
- Last Approved Voice.

Cada escena puede generar un `SceneStateSnapshot`, que sirve como referencia automática para la escena siguiente.

## Voice Vault / Voice DNA

`VoiceProfile` incluye:

- provider / providerVoiceId / model;
- idioma y acento;
- edad, género y timbre;
- pitch y speed;
- stability / similarity;
- emotion presets;
- pronunciation dictionary;
- canonical sample;
- previous approved sample;
- voice version;
- rights status;
- consent reference.

El registry es append-only: una versión aprobada nunca se sobrescribe.

## Asset Registry

Cada asset conserva provenance:

- film;
- scene / shot / take;
- generation job;
- provider;
- provider task;
- storage path;
- SHA256;
- versión;
- estado de aprobación.

Tipos: image, video, audio, voice, music, sfx, subtitle, timeline, manifest, quality-report, reference y master.

## Financial Intelligence

`lib/v7/cost/budget-controller.ts` usa exposición total:

```
succeeded + reserved + unknown-risk + next-estimate <= budget
```

Esto extiende el principio de seguridad de V6: un estado de cobro desconocido cuenta contra el presupuesto y no habilita retry automático.

## Job Orchestrator

`GenerationJob` es la fuente de verdad conceptual para el futuro motor distribuido.

Estados:

```
draft
planned
ready
reserved
submitted
processing
succeeded
failed-no-charge
failed-unknown
review-required
approved
rejected
cancelled
```

`lib/v7/orchestration/dependency-graph.ts` valida ciclos y calcula capas ejecutables.

`planFilmJobs()` construye un DAG determinista:

```
Continuity
  ↓
Video Generate
  ↓
Shot QA
  ↓
Scene QA
  ↓
Next Scene Continuity
```

Redis/BullMQ será un transporte de ejecución, no la fuente de verdad.

## Provider Gateway

Los proveedores V7 implementarán una interfaz común:

- `capabilities()`
- `estimate()`
- `submit()`
- `status()`
- `download()`

El dominio Film/Shot no hardcodea proveedores.

Provider Health permite puntuar calidad, éxito, latencia, costo y fallos seguros antes de enrutar.

## Production Strategies

Las estrategias dejan de ser productores específicos de una película.

Ejemplos iniciales:
- `generic-cinematic`
- `dialogue-closeup`
- `silent-establishing`

Cada estrategia declara requisitos de identidad, audio, reparto visible, continuidad y QA.

## QA jerárquico

```
Take QA
  ↓
Shot QA
  ↓
Scene QA
  ↓
Sequence QA
  ↓
Act QA
  ↓
Film QA
```

Categorías:
- technical;
- identity;
- anatomy;
- motion;
- lip-sync;
- audio;
- continuity;
- cinematography;
- narrative;
- safety.

Un fallo crítico impide aprobar el nivel superior.

## Timeline / Post-production

V7 define:
- Timeline;
- Track;
- TimelineClip;
- Transition.

Tracks:
- video;
- dialogue;
- ADR;
- ambience;
- Foley;
- SFX;
- music;
- subtitle;
- title.

`lib/v7/editor/otio-export.ts` produce una representación OTIO-JSON compatible conceptualmente sin instalar una dependencia externa.

## Versioning

FilmVersion, TimelineVersion y AssetVersion son append-only.

Ejemplo:

```
cut-v001
cut-v002
director-cut-v003
final-v004
```

Los masters no deben sobrescribirse.

## Actor Library y Film Library

Actor Library conserva rostros, cuerpos, Voice DNA, rights y consent.

Film Library conserva versiones finales, masters y assets reutilizables.

## Persistencia

### Desarrollo local

```
.data/v7/films/<film-id>/bundle.json
```

Está completamente separada de `.data/projects` de V6.

### Producción futura

PostgreSQL/Supabase será la fuente de verdad.

La migración inicial está en:

`db/v7/0001_feature_film_core.sql`

Media: Object Storage / S3-compatible.

## Compatibilidad V6

`adaptLegacyProjectToV7()` convierte en memoria:

```
FilmProject V6
→ Film V7
→ Act
→ Sequence
→ Scene
→ Shot
→ approved Take
```

y genera:
- Asset Registry;
- Voice Profiles.

El adaptador compara el snapshot de entrada antes/después y falla si detecta mutación.

## UI

Ruta:

`/v7`

Permite:
- preview read-only V6 → V7;
- visualizar conteos de Film/Act/Sequence/Scene/Shot/Take;
- materializar metadata V7 localmente;
- comprobar módulos arquitectónicos.

No llama APIs externas.

## Infraestructura objetivo

```
PostgreSQL / Supabase
Object Storage
Redis / BullMQ
FFmpeg
Checkpoints
Versioning
Spend Ledger
Audit Log
Provider Health
Metrics
Provenance
Rights / Consent
```

## Arquitectura

```
USER / PRODUCER
       ↓
MASTER DIRECTOR
       ↓
MEMORY CORE
 ┌─────┼─────────────┐
 ↓     ↓             ↓
STORY  PRE-PROD   FINANCIAL
       ↓
ASSET LOCKING
       ↓
Film → Act → Sequence → Scene → Shot → Take
       ↓
Continuity / Identity / Cost / Approval Guards
       ↓
Provider Gateway
       ↓
Video / Image / Voice Workers
       ↓
QA Hierarchy
       ↓
Scene State Snapshot
       ↓
Timeline / OTIO
       ↓
Mastering
       ↓
Master Audit
       ↓
Human Final Approval
       ↓
FINAL MASTER
       ↓
Actor Library + Film Library
```
