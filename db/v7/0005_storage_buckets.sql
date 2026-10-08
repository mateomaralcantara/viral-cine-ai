-- ViralCine 7 Feature Film OS
-- Supabase Storage bootstrap.
-- Creates private buckets only. No public browser policies are granted.

begin;

insert into storage.buckets (id, name, public, allowed_mime_types)
values
  (
    'character-references',
    'character-references',
    false,
    array['image/jpeg','image/png','image/webp']
  ),
  (
    'voice-vault',
    'voice-vault',
    false,
    array['audio/wav','audio/x-wav','audio/mpeg','audio/mp4','audio/x-m4a','application/octet-stream']
  ),
  (
    'film-assets',
    'film-assets',
    false,
    array[
      'video/mp4','video/webm','video/quicktime',
      'image/jpeg','image/png','image/webp',
      'audio/wav','audio/x-wav','audio/mpeg','audio/mp4','audio/x-m4a',
      'application/octet-stream'
    ]
  ),
  (
    'masters',
    'masters',
    false,
    array['video/mp4','video/webm','video/quicktime','application/octet-stream']
  ),
  (
    'qa-artifacts',
    'qa-artifacts',
    false,
    array[
      'application/json','text/plain','text/csv','application/pdf',
      'image/jpeg','image/png','image/webp','application/octet-stream'
    ]
  )
on conflict (id) do update
set
  name = excluded.name,
  public = false,
  allowed_mime_types = excluded.allowed_mime_types;

commit;

-- Verification
select
  id,
  name,
  public,
  allowed_mime_types
from storage.buckets
where id in (
  'character-references',
  'voice-vault',
  'film-assets',
  'masters',
  'qa-artifacts'
)
order by id;
