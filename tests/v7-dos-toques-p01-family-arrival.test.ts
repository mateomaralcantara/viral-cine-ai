import assert from 'node:assert/strict';
import test from 'node:test';
import { readFile } from 'node:fs/promises';

test('E01-P01 V2 requires Gabriel, Daniel and Lucia in cinematic arrival without name cards', async () => {
  const plan = JSON.parse(await readFile(
    new URL('../films/dos-toques-de-bocina/E01-P01-LLEGADA-FAMILIAR-V2.json', import.meta.url),
    'utf8'
  )) as {
    shot: string; rawVideoDurationSeconds: number; characters: Array<{ id: string; safety: string }>;
    negativePrompt: string; compositionRules: string[];
    reference: { requiredForGeneration: boolean; usedAsModelInput: boolean; path: string };
    provider: { mode: string; personGeneration: string; maxAuthorizedUsd: number; maxProviderSubmissions: number; automaticRetries: number };
  };
  assert.equal(plan.shot, 'E01-P01');
  assert.equal(plan.rawVideoDurationSeconds, 8);
  assert.deepEqual(plan.characters.map(c => c.id), ['gabriel', 'daniel', 'lucia']);
  assert.ok(plan.characters.every(c => /helmet|casco/i.test(c.safety)));
  assert.match(plan.negativePrompt, /no slideshow/i);
  assert.match(plan.negativePrompt, /no title card/i);
  assert.match(plan.negativePrompt, /no person labels/i);
  assert.equal(plan.reference.requiredForGeneration, false);
  assert.equal(plan.reference.usedAsModelInput, false);
  assert.match(plan.reference.path, /familia-v2/);
  assert.equal(plan.provider.mode, 'text-to-video');
  assert.equal(plan.provider.personGeneration, 'allow_all');
  assert.equal(plan.provider.maxAuthorizedUsd, 2);
  assert.equal(plan.provider.maxProviderSubmissions, 1);
  assert.equal(plan.provider.automaticRetries, 0);
});

test('Google paid call uses TEXT-TO-VIDEO with allow_all for minors and authorizes current family composition only', async () => {
  const api = await readFile(new URL(
    '../app/api/v7/films/[filmId]/e01-p01-render/route.ts', import.meta.url
  ), 'utf8');
  assert.match(api, /personGeneration: 'allow_all'/);
  assert.match(api, /source: \{ prompt: prompt\(\) \}/);
  assert.doesNotMatch(api, /imageBytes:/);
  assert.doesNotMatch(api, /personGeneration: 'allow_adult'/);
  assert.match(api, /Gabriel Santos/);
  assert.match(api, /Daniel Santos/);
  assert.match(api, /Lucía Santos/);
  assert.match(api, /REQUIRED_COMPOSITION/);
  assert.match(api, /body\.compositionConfirmed !== REQUIRED_COMPOSITION/);
  assert.match(api, /body\.promptSha256 !== sha/);
  assert.match(api, /status: 'reserved'/);
  assert.match(api, /if \(existing\) throw new Error/);
});

test('V2 family PNG is isolated, optional, and visible to user for storyboard QA', async () => {
  const preflight = await readFile(new URL(
    '../app/api/v7/films/[filmId]/e01-p01-preflight/route.ts', import.meta.url
  ), 'utf8');
  const getImage = await readFile(new URL(
    '../app/api/v7/films/[filmId]/e01-p01-preflight/reference/route.ts', import.meta.url
  ), 'utf8');
  const pane = await readFile(new URL(
    '../components/V7DosToquesShotRenderPanel.tsx', import.meta.url
  ), 'utf8');
  assert.match(preflight, /e01-p01\/referencia-familia-v2\.png/);
  assert.match(getImage, /e01-p01.*referencia-familia-v2\.png/s);
  assert.match(preflight, /referencePassedToModel: false/);
  assert.match(pane, /promptSha256/);
  assert.match(pane, /familyConfirmed/);
});
