import assert from 'node:assert/strict';
import test from 'node:test';
import { readFile } from 'node:fs/promises';
import { DOS_TOQUES_SECOND_SHOT_BUDGET, maySubmitSecondShot } from '../lib/v7/production/dos-toques-p02-budget';
test('E01-P02 refuses all paid submits before independent approval', async () => {
 assert.equal(DOS_TOQUES_SECOND_SHOT_BUDGET.maxTotalUsd,0.80);
 assert.equal(DOS_TOQUES_SECOND_SHOT_BUDGET.requiresFinalPanelConfirmation,true);
 assert.equal(DOS_TOQUES_SECOND_SHOT_BUDGET.executionEnabled,false);
 assert.equal(DOS_TOQUES_SECOND_SHOT_BUDGET.maxProviderSubmissions,0);
 assert.equal(maySubmitSecondShot({}),false);
 const route=await readFile(new URL('../app/api/v7/films/[filmId]/e01-p02-render/route.ts',import.meta.url),'utf8');
 assert.match(route,/GRANT.maxTotalUsd === 0/);
 assert.match(route,/GRANT.maxProviderSubmissions === 0/);
 assert.match(route,/providerOperationName/);
 assert.match(route,/getVideosOperation/);
 assert.match(route,/E01-P02-veo-candidato.mp4/);
 assert.match(route,/shotPlan.promptEnglish/);
});
