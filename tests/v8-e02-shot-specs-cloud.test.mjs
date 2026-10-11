import test from 'node:test';
import assert from 'node:assert/strict';
import {collectShots,sourcePrompt,getSpecs,parseEnv}
 from '../scripts/sync-e02-shot-specs-cloud.mjs';

const makeShot=(i,durationSeconds=8)=>({
 id:'E02-P0'+i,sceneId:'E02',durationSeconds,
 camera:'Paneo lento hacia la derecha al entrar en el plano.',
 intention:'El personaje continúa la acción de la toma anterior.',
 visualPrompt:'Un personaje continúa avanzando por la carretera.',
 spokenText:'Diálogo original preservado.',
 characterIds:['personaje-a'],
 motionSpec:{
  bodyMotion:'Camina despacio manteniendo postura natural.',
  cameraMotion:'Travelling lateral suave.',
  environmentMotion:'Los árboles se mueven con el viento.'
 }
});
const bundle=shots=>({film:{
 id:'film-dos-toques-de-bocina-v7',
 acts:[{sequences:[{scenes:[{id:'E02',shots}]}]}]
}});
test('reads all seven real V7 nested shots, no fabricated IDs',()=>{
 const shots=collectShots(bundle(Array.from({length:7},(_,i)=>makeShot(i+1))));
 assert.equal(shots.length,7);assert.equal(shots[0].id,'E02-P01');
 assert.equal(shots.at(-1).id,'E02-P07');
});
test('fails closed if even one original E02 shot is missing',()=>{
 const shots=Array.from({length:6},(_,i)=>makeShot(i+1));
 assert.throws(()=>collectShots(bundle(shots)),/E02-P07/);
});
test('fails closed on duplicate original ID',()=>{
 const shots=Array.from({length:7},(_,i)=>makeShot(i+1));
 shots[6]={...shots[6],id:'E02-P01'};
 assert.throws(()=>collectShots(bundle(shots)),/duplicada/);
});
test('keeps original duration 8s and plans 10s Runway clip',()=>{
 const shots=getSpecs(bundle(Array.from({length:7},(_,i)=>makeShot(i+1))));
 assert.ok(shots.every(s=>s.original===8&&s.runwayDuration===10));
 assert.ok(shots.every(s=>s.prompt.length<=1000&&s.prompt.length>=15));
 assert.equal(shots[0].originalShot.spokenText,'Diálogo original preservado.');
});
test('refuses unsupported original duration; does not invent missing fields',()=>{
 const shots=Array.from({length:7},(_,i)=>makeShot(i+1));
 shots[0].durationSeconds=11;
 assert.throws(()=>getSpecs(bundle(shots)),/duración original/);
 assert.throws(()=>sourcePrompt({id:'E02-P01',visualPrompt:'',camera:''}),/faltan instrucciones/);
});
test('source prompts only reuse original camera and movement',()=>{
 const s=makeShot(1);
 const prompt=sourcePrompt(s);
 assert.ok(prompt.includes(s.motionSpec.bodyMotion));
 assert.ok(prompt.includes(s.camera));
 assert.ok(!prompt.includes('Diálogo original preservado'));
});
test('env parser reads private server config without writing',()=>{
 const env=parseEnv('SUPABASE_SERVICE_ROLE_KEY="test-key"\nNEXT_PUBLIC_SUPABASE_URL=https://example.supabase.co\n');
 assert.equal(env.SUPABASE_SERVICE_ROLE_KEY,'test-key');
 assert.equal(env.NEXT_PUBLIC_SUPABASE_URL,'https://example.supabase.co');
});
