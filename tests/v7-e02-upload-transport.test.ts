import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';

test('Local studio pairing supports status GET as required by the browser, not only POST',async()=>{
 const route=await readFile(new URL('../app/api/v7/local-studio-pair/route.ts',import.meta.url),'utf8');
 const client=await readFile(new URL('../lib/v7/security/local-studio-client.ts',import.meta.url),'utf8');
 assert.match(client,/fetch\('\/api\/v7\/local-studio-pair'/);
 assert.match(route,/export async function GET\(request:Request\)/);
 assert.match(route,/hasLocalSession\(request\)/);
 assert.match(route,/authenticated:true,requiresPairing:false/);
 assert.match(route,/authenticated:false,requiresPairing:true/);
 assert.match(route,/V7_STUDIO_PAIR_EXPIRES/);
 assert.match(route,/localOriginAllowed/);
});
test('Runway E02 upload supports image binary and confirms disk before returning JSON',async()=>{
 const route=await readFile(new URL('../app/api/v7/films/[filmId]/runway-scene02/route.ts',import.meta.url),'utf8');
 assert.match(route,/image\/jpeg/);
 assert.match(route,/image\/png/);
 assert.match(route,/image\/webp/);
 assert.match(route,/x-v7-shot-id/);
 assert.match(route,/request\.arrayBuffer\(\)/);
 assert.match(route,/await saveE02ShotImage\(id,bytes\)/);
 assert.match(route,/await e02ShotImageReady\(id\)/);
 assert.match(route,/transport:'binary'/);
 assert.match(route,/runwayAdminAuthorized\(request\)/);
});
test('Runway E02 client handles empty POST replies and stops repeating a broken batch',async()=>{
 const ui=await readFile(new URL('../components/V7RunwayScene02Panel.tsx',import.meta.url),'utf8');
 assert.match(ui,/body:file/);
 assert.match(ui,/X-V7-Shot-ID/);
 assert.match(ui,/const raw=await response\.text\(\)/);
 assert.match(ui,/servidor respondió vacío \(HTTP/);
 assert.match(ui,/Carga detenida por error de comunicación/);
 assert.match(ui,/setBulkMessage\(old=>old\.startsWith\('Carga detenida'\)/);
 assert.doesNotMatch(ui,/response\.json\(\) as \{ok\?:boolean;error\?:string;alreadySaved/);
});
