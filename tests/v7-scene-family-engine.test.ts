import assert from 'node:assert/strict';
import test from 'node:test';
import { createDosToquesBundle } from '../lib/v7/presets/dos-toques-de-bocina';
import { SCENE_AGENT_FAMILIES, planCompleteFilmScenes, chooseSelfHealingAction, runFreeRepairLoop } from '../lib/v7/orchestration/scene-family-engine';

test('Scene Family Engine plans the whole film, not bespoke per-shot endpoints', () => {
  const film=createDosToquesBundle().film;
  const plan=planCompleteFilmScenes(film);
  assert.ok(plan.scenes.length>=10);
  assert.ok(plan.scenes.some(scene=>scene.shotIds.length>1));
  assert.ok(SCENE_AGENT_FAMILIES.length>=10);
  assert.equal(plan.providerCalls,0);
  assert.equal(plan.estimatedAdditionalSpendUsd,0);
  assert.ok(plan.steps.every(step=>step.externalSpendAllowed===false&&step.paidRetryAllowed===false));
  const shotCount=plan.scenes.reduce((n,s)=>n+s.shotIds.length,0);
  assert.equal(plan.steps.filter(s=>s.action==='shot.human-approval').length,shotCount);
  assert.equal(plan.steps.filter(s=>s.action==='scene.human-approval').length,plan.scenes.length);
});
test('Can expand to 80 distinct scenes without special routes or overwritten states',()=>{
  const film=createDosToquesBundle().film;
  const template=film.acts[0].sequences[0].scenes[0];
  const sequence=film.acts[0].sequences[0];
  sequence.scenes=Array.from({length:80},(_,i)=>{
    const id='scene-scaled-'+String(i+1);
    return {...template,id,order:i+1,timeIndex:i*60,
      shots:template.shots.map((shot,j)=>({...shot,id:id+'-shot-'+String(j+1),sceneId:id}))};
  });
  film.acts=[{...film.acts[0],sequences:[sequence]}];
  const plan=planCompleteFilmScenes(film);
  assert.equal(plan.scenes.length,80);
  assert.equal(plan.steps.filter(s=>s.action==='scene.human-approval').length,80);
  assert.equal(new Set(plan.steps.map(s=>s.id)).size,plan.steps.length);
});
test('Self-healing retries only free local diagnostics and stops on success',async()=>{
  let inspections=0,repairs=0;
  const result=await runFreeRepairLoop({
    inspect:async()=>({passed:++inspections>=3,failure:'local-deterministic'}),
    repair:async()=>{repairs++;},maxFreeAttempts:3
  });
  assert.equal(result.status,'passed');
  assert.equal(repairs,2);
  assert.equal(result.attempts,2);
});
test('Self-healing blocks unsafe duplicate paid submissions, uncertain tasks and endless loops',async()=>{
  assert.equal(chooseSelfHealingAction({failure:'provider-uncertain',freeAttempts:0}).action,'hold-human');
  assert.equal(chooseSelfHealingAction({failure:'paid-regeneration-needed',freeAttempts:0}).action,'hold-human');
  assert.equal(chooseSelfHealingAction({failure:'provider-pending',freeAttempts:0,hasProviderOperationId:true}).action,'resume-existing-operation');
  let repairs=0;
  const result=await runFreeRepairLoop({
    inspect:async()=>({passed:false,failure:'local-transient'}),
    repair:async()=>{repairs++;},maxFreeAttempts:2
  });
  assert.equal(result.status,'blocked');
  assert.equal(repairs,2);
});
