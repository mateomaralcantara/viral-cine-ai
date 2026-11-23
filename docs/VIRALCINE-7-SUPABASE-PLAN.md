# ViralCine 7 — Supabase Production Persistence

## Objective

Supabase becomes ViralCine 7's durable production memory:

- PostgreSQL = source of truth for film state, process state and audit history.
- Storage = private media store for images, audio, video, masters and QA artifacts.
- Local .data = migration source, cache and disaster-recovery copy until cutover is verified.
- Process Memory = versioned record of errors, root causes, repairs, prompts, decisions and promoted workflows.

## Safety rule

No existing local media is deleted during migration.

The cutover uses three modes:

1. local — current .data remains authoritative.
2. shadow — write to local + Supabase, compare counts/hashes, local still authoritative.
3. supabase — Supabase becomes authoritative only after verification gates pass.

## Database migrations

- 0001_feature_film_core.sql — film hierarchy, takes, assets, jobs, continuity, timeline.
- 0002_operational_controls.sql — spend, rights, permissions, libraries, QA, provider state.
- 0003_process_memory.sql — process versions, runs, incidents, root causes, repair recipes, prompt versions, observations, lessons and promotions.

## API key model

Use Supabase's current key model:

- NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY for browser-safe access governed by RLS.
- SUPABASE_SECRET_KEY only on trusted server code.
- Never expose the secret key to the browser or commit it to Git.

## Planned Storage buckets

Private buckets:

- character-references
- voice-vault
- film-assets
- masters
- qa-artifacts

## Migration gates

Supabase does not become source of truth until all gates pass:

1. database migrations applied successfully;
2. RLS policies verified;
3. storage buckets private and policies verified;
4. all V6/V7 project records imported;
5. all media files inventoried;
6. SHA-256 verified for uploaded assets;
7. local project count = Supabase film count;
8. local asset count = Supabase asset count for migration scope;
9. final masters playable from Storage;
10. local backup retained;
11. paid generation APIs remain disabled during migration;
12. rollback to local mode tested.

## Process Memory rule

An error becomes permanent knowledge only through:

incident -> root cause -> repair execution -> QA evidence -> repeated success -> explicit promotion.

A single successful retry is never enough to promote a process or repair recipe.
