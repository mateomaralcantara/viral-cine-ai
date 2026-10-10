import assert from 'node:assert/strict';
import test from 'node:test';
import {readFile} from 'node:fs/promises';
import {diagnoseVeoOperation,diagnosisSummary} from '../lib/v7/production/veo-operation-diagnostics';

test('Provider error is revealed without raw metadata, credentials, billing assumptions',()=>{
  const diagnosis=diagnoseVeoOperation({done:true,error:{
    code:400,status:'INVALID_ARGUMENT',message:'Request was rejected'
  }},'2026-10-10T15:00:00Z');
  assert.equal(diagnosis.classification,'provider-error');
  assert.equal(diagnosis.providerCode,'400');
  assert.equal(diagnosis.providerStatus,'INVALID_ARGUMENT');
  assert.match(diagnosisSummary(diagnosis),/Request was rejected/);
  assert.equal(diagnosis.videoAvailable,false);
});
test('RAI filtered video returns Google reason and count',()=>{
  const diagnosis=diagnoseVeoOperation({done:true,response:{
    generatedVideos:[],raiMediaFilteredCount:1,raiMediaFilteredReasons:['Output filtered by provider policy']
  }});
  assert.equal(diagnosis.classification,'rai-filtered');
  assert.deepEqual(diagnosis.filteredReasons,['Output filtered by provider policy']);
  assert.equal(diagnosis.filteredCount,1);
});
test('Distinguish unresolved empty response, processing and completed video',()=>{
  assert.equal(diagnoseVeoOperation({done:true,response:{generatedVideos:[]}}).classification,'no-video-unexplained');
  assert.equal(diagnoseVeoOperation({done:false}).classification,'processing');
  assert.equal(diagnoseVeoOperation({done:true,response:{generatedVideos:[{video:{uri:'https://example.test/video'}}]}}).classification,'video-ready');
});
test('Sanitize sensitive strings returned by provider',()=>{
  const diagnosis=diagnoseVeoOperation({done:true,error:{message:
    'Bearer secret123 AIzaabcde1234567890 https://example.com/private'}})
  assert.equal(diagnosis.providerMessage?.includes('secret123'),false);
  assert.equal(diagnosis.providerMessage?.includes('AIzaabcde1234567890'),false);
  assert.equal(diagnosis.providerMessage?.includes('https://'),false);
});
test('E01 scene preserves failed attempts and allows only explicit second attempts without touching old IDs',async()=>{
  const route=await readFile(new URL('../app/api/v7/films/[filmId]/scene01-production/route.ts',import.meta.url),'utf8');
  const ui=await readFile(new URL('../components/V7DosToquesE01VisualConsole.tsx',import.meta.url),'utf8');
  assert.match(route,/body.action==='inspect'/);
  assert.match(route,/getVideosOperation/);
  assert.match(route,/newGenerationRequests:0/);
  assert.match(route,/failedShotIds/);
  assert.match(route,/provider-operation-attempt-02.json/);
  assert.match(ui,/Diagnosticar en Google · Sin nuevo render/);
  assert.match(ui,/Producir Escena 01 · bloques faltantes/);
});
