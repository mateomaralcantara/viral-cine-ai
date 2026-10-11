import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';

test('E02 reference schema is private, auto-approved only after stored object exists, and versions are preserved',async()=>{
 const sql=await readFile(new URL('../supabase/migrations/20261011_v8_e02_reference_autoapprove.sql',import.meta.url),'utf8');
 assert.match(sql,/viralcine-scene-references/);
 assert.match(sql,/public=false/);
 assert.match(sql,/alter table public\.scene_reference_images enable row level security/i);
 assert.match(sql,/revoke all on public\.scene_reference_images from anon,authenticated/i);
 assert.match(sql,/if not exists\(select 1 from storage\.objects/i);
 assert.match(sql,/auto-on-upload/);
 assert.match(sql,/create unique index if not exists scene_reference_one_active_per_shot/i);
 assert.match(sql,/status='archived'/);
 assert.match(sql,/p_shot_id !~ '\^E02-P0\[1-7\]\$'/);
 assert.match(sql,/coverage=7/);
});
test('Every E02 upload persists to Supabase, verifies HEAD and atomically auto-approves from server',async()=>{
 const s=await readFile(new URL('../lib/v7/production/e02-supabase-references.ts',import.meta.url),'utf8');
 assert.match(s,/sharp\(bytes,\{failOn:'error'/);
 assert.match(s,/resize\(1280,720/);
 assert.match(s,/createHash\('sha256'\)/);
 assert.match(s,/storage\/v1\/object\//);
 assert.match(s,/method:'HEAD'/);
 assert.match(s,/rpc\/v8_save_approved_e02_reference/);
 assert.match(s,/if\(!ref\.approved\|\|!ref\.readyForScene/);
 assert.match(s,/additionalSpendUsd:0,newGenerationRequests:0/);
});
test('E02 panel auto-synchronizes existing seven JPGs; uploading one means approval with no second approval click',async()=>{
 const panel=await readFile(new URL('../components/V7RunwayScene02Panel.tsx',import.meta.url),'utf8');
 const api=await readFile(new URL('../app/api/v7/films/[filmId]/scene02-references/route.ts',import.meta.url),'utf8');
 assert.match(panel,/scene02-references/);
 assert.match(panel,/sync-existing/);
 assert.match(panel,/Subir = guardar en Supabase \+ aprobar \+ dejar lista/);
 assert.match(panel,/7 fotografías guardadas y aprobadas en Supabase/);
 assert.match(panel,/cloudBoard\?\.referencesReady/);
 assert.match(panel,/Aprobada y lista en Supabase/);
 assert.match(api,/uploadAndApproveE02Reference/);
 assert.match(api,/localAdminAuthorized\(req\)/);
 assert.match(api,/sync-existing/);
 assert.match(api,/E02_SHOTS/);
 assert.match(api,/readFile\(local\)/);
 assert.doesNotMatch(api,/submitRunwayShot|runwayRequest/);
});
test('Runway E02 cannot bill before seven approved images exist in cloud',async()=>{
 const s=await readFile(new URL('../lib/v7/production/runway-e02-engine.ts',import.meta.url),'utf8');
 assert.match(s,/getApprovedE02Image\(id\)/);
 assert.match(s,/hashFile\(file\)!==approved\.hash/);
 assert.match(s,/if\(!approved\.referencesReady\)/);
 assert.match(s,/Falta configurar Supabase|Supabase no está configurado/);
});
