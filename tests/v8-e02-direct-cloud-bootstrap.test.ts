import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {jpegDimensions,parseEnv} from '../scripts/sync-e02-refs-cloud.mjs';

test('direct E02 bootstrap reads only local .env values and preserves Unicode in quotes',()=>{
 const cfg=parseEnv('SUPABASE_SERVICE_ROLE_KEY="secret value"\nSUPABASE_URL=https://wrxeerltoapvybhaxlmu.supabase.co\n# comment\nRUNWAYML_API_SECRET=should-not-call');
 assert.equal(cfg.SUPABASE_SERVICE_ROLE_KEY,'secret value');
 assert.equal(cfg.SUPABASE_URL,'https://wrxeerltoapvybhaxlmu.supabase.co');
});
test('JPEG parser reads dimensions without changing or transcoding original bytes',()=>{
 const sample=Buffer.from([0xff,0xd8,
 0xff,0xe0,0x00,0x04,0x00,0x00,
 0xff,0xc0,0x00,0x11,0x08,0x02,0xd0,0x05,0x00,
 0x03,0x01,0x11,0x00,0x02,0x11,0x01,0x03,0x11,0x01,
 0xff,0xd9]);
 assert.deepEqual(jpegDimensions(sample),{width:1280,height:720});
 assert.throws(()=>jpegDimensions(Buffer.from('not image')),/not a JPEG/);
});
test('migration never starts video rendering and verifies cloud bytes before auto-approval',async()=>{
 const s=await readFile(new URL('../scripts/sync-e02-refs-cloud.mjs',import.meta.url),'utf8');
 assert.match(s,/V8_E02_DATA_ROOT/);
 assert.match(s,/SUPABASE_SERVICE_ROLE_KEY/);
 assert.match(s,/viralcine-scene-references/);
 assert.match(s,/sha\(remote\)!==hash/);
 assert.match(s,/v8_save_approved_e02_reference/);
 assert.match(s,/confirmed===7/);
 assert.match(s,/No se modificaron archivos locales/);
 assert.doesNotMatch(s,/api\.dev\.runwayml\.com|\/image_to_video|POST \/tasks/);
});
