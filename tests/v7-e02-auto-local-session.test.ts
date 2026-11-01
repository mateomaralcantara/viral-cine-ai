import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';

test('local studio status GET auto-sets a signed HttpOnly cookie only for same-origin local JS',async()=>{
 const s=await readFile(new URL('../app/api/v7/local-studio-pair/route.ts',import.meta.url),'utf8');
 assert.match(s,/if\(!localOriginAllowed\(request\)\)/);
 assert.match(s,/sec-fetch-site'\)==='same-origin'/);
 assert.match(s,/sec-fetch-dest'\)==='empty'/);
 assert.match(s,/issueLocalSession\(request\)/);
 assert.match(s,/response\.cookies\.set\(LOCAL_SESSION_COOKIE/);
 assert.match(s,/httpOnly:true,sameSite:'strict'/);
 assert.match(s,/paidGenerationAutoAuthorized:false/);
 assert.match(s,/authenticated:true,requiresPairing:false/);
});
test('the scene panel no longer claims a paid generation before Runway accepts it',async()=>{
 const s=await readFile(new URL('../components/V7RunwayScene02Panel.tsx',import.meta.url),'utf8');
 assert.match(s,/Solicitando la operación de/);
 assert.match(s,/await request\('submit',shot\.id,state\);/);
 assert.match(s,/operación registrada en Runway/);
 assert.doesNotMatch(s,/setDetail\('Generando '\+shot\.id\+' con Runway/);
 assert.match(s,/setDetail\(''\);/);
});
