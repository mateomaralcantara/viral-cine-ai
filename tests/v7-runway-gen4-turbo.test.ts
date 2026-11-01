import assert from 'node:assert/strict';
import test from 'node:test';
import {readFile} from 'node:fs/promises';
import {RUNWAY_MODEL,RUNWAY_DURATION,RUNWAY_SHOT_USD,RUNWAY_MAX_SCENE_USD,
 runwayShotSpecs,runwayEnabled} from '../lib/v7/production/runway-gen4-turbo';

test('Runway gen4_turbo uses 10s image-to-video and budget <= USD 2.50 for five E01 clips',()=>{
 assert.equal(RUNWAY_MODEL,'gen4_turbo');
 assert.equal(RUNWAY_DURATION,10);
 assert.equal(RUNWAY_SHOT_USD,0.5);
 assert.equal(RUNWAY_MAX_SCENE_USD,2.5);
 const items=runwayShotSpecs();
 assert.deepEqual(items.map(s=>s.id),['E01-P03','E01-P04','E01-P05','E01-P06','E01-P07']);
 assert.ok(items.every(s=>s.editSeconds===7&&s.estimateUsd===0.5&&s.promptText.length<1000));
 assert.equal(items.reduce((sum,s)=>sum+s.estimateUsd,0),2.5);
});
test('No Runway generation enabled by default (requires explicit environment and secret)',()=>{
 const previous=process.env.V7_RUNWAY_E01_ENABLED;
 const key=process.env.RUNWAYML_API_SECRET;
 try{
  delete process.env.V7_RUNWAY_E01_ENABLED;
  delete process.env.RUNWAYML_API_SECRET;
  assert.equal(runwayEnabled(),false);
 }finally{
  if(previous===undefined)delete process.env.V7_RUNWAY_E01_ENABLED;else process.env.V7_RUNWAY_E01_ENABLED=previous;
  if(key===undefined)delete process.env.RUNWAYML_API_SECRET;else process.env.RUNWAYML_API_SECRET=key;
 }
});
test('Image references are created from MP4 with FFmpeg and transmitted as private data URI; one-run ledger before billable call',async()=>{
 const code=await readFile(new URL('../lib/v7/production/runway-gen4-turbo.ts',import.meta.url),'utf8');
 assert.match(code,/resolveV7ShotVideo/);
 assert.match(code,/ffmpeg/);
 assert.match(code,/promptImage:frame.dataUri/);
 assert.match(code,/data:image\/jpeg;base64/);
 assert.match(code,/await writeFile\(runwayRecordPath\(id\)/);
 assert.match(code,/flag:'wx'/);
 assert.match(code,/image_to_video/);
 assert.match(code,/tasks\//);
 assert.match(code,/status!=='SUCCEEDED'/); // non-success results must not be accepted as MP4
 assert.match(code,/runwayCandidatePath/);
 assert.doesNotMatch(code,/OPENAI_API_KEY/);
});
test('Runway-first UI and same-provider asset resolution, approval and scene assembly are integrated',async()=>{
 const files=await Promise.all([
  '../components/V7RunwayGen4TurboPanel.tsx',
  '../components/V7DosToquesScene01Panel.tsx',
  '../lib/v7/production/scene-approval-board.ts',
  '../lib/v7/production/scene-local-assembler.ts',
  '../app/api/v7/films/[filmId]/scene-production/video/route.ts'
 ].map(s=>readFile(new URL(s,import.meta.url),'utf8')));
 assert.match(files[0],/Autorizo hasta US\$/);
 assert.match(files[0],/Producir bloques faltantes con Runway/);
 assert.match(files[1],/V7RunwayGen4TurboPanel/);
 for(const src of files.slice(2))assert.match(src,/resolveV7ShotVideo/);
});
