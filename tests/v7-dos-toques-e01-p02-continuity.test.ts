import assert from 'node:assert/strict';
import test from 'node:test';
import { readFile } from 'node:fs/promises';

test('E01-P02 exactly follows approved P01, preserves continuity and has no new paid authorization', async () => {
  const spec = JSON.parse(await readFile(new URL(
    '../films/dos-toques-de-bocina/E01-P02-SE-DETIENEN-V1.json', import.meta.url
  ), 'utf8')) as {
    filmId: string; shotId: string;
    editorial: { canonicalStartSeconds: number; canonicalDurationFrames: number; plannedTrimSeconds: number };
    previousShot: { sourceFile: string; approvalRequired: string; sourceApprovalRemainsUntouched: boolean };
    provider: { approvedNewBudgetUsd: number; maxSubmissions: number; submitted: boolean };
    continuityLocks: string[]; sound: { horn: string };
  };
  assert.equal(spec.filmId, 'film-dos-toques-de-bocina-v7');
  assert.equal(spec.shotId, 'E01-P02');
  assert.equal(spec.editorial.canonicalStartSeconds, 172 / 24);
  assert.equal(spec.editorial.canonicalDurationFrames, 172);
  assert.equal(spec.editorial.plannedTrimSeconds, 172 / 24);
  assert.match(spec.previousShot.sourceFile, /E01-P01-veo-candidato.mp4/);
  assert.equal(spec.previousShot.approvalRequired, 'artistic-approved');
  assert.equal(spec.previousShot.sourceApprovalRemainsUntouched, true);
  assert.equal(spec.provider.approvedNewBudgetUsd, 0);
  assert.equal(spec.provider.maxSubmissions, 0);
  assert.equal(spec.provider.submitted, false);
  assert.ok(spec.continuityLocks.length >= 4);
  assert.match(spec.sound.horn, /ningún pitido/);
  const complete = JSON.parse(await readFile(new URL(
    '../films/dos-toques-de-bocina/E01-P02-SE-DETIENEN-V1.json', import.meta.url
  ), 'utf8')) as { action: string[]; staging: string; promptEnglish: string;
    provider: { maxSubmissions: number; approvedNewBudgetUsd: number } };
  assert.match(complete.staging, /Daniel sigue delante de Gabriel y Lucía detrás/);
  assert.match(complete.staging, /No hay descenso/);
  assert.match(complete.promptEnglish, /All three remain seated, wearing their helmets/);
  assert.match(complete.promptEnglish, /Children dismount only in the NEXT shot/);
  assert.match(complete.action.join(' '), /apoya firmemente un pie/);
  assert.equal(complete.provider.maxSubmissions, 0);
  assert.equal(complete.provider.approvedNewBudgetUsd, 0);
});

test('preparation verifies P01 approval hash, extracts FFmpeg still locally, never calls paid Veo', async () => {
  const endpoint = await readFile(new URL(
    '../app/api/v7/films/[filmId]/e01-p02-continuity/route.ts', import.meta.url
  ), 'utf8');
  const image = await readFile(new URL(
    '../app/api/v7/films/[filmId]/e01-p02-continuity/reference/route.ts', import.meta.url
  ), 'utf8');
  assert.match(endpoint, /V7_CINEMA_ADMIN_TOKEN/);
  assert.match(endpoint, /process.env.NODE_ENV !== 'development'/);
  assert.match(endpoint, /timingSafeEqual/);
  assert.match(endpoint, /artistic-approval.json/);
  assert.match(endpoint, /E01-P01-veo-candidato.mp4/);
  assert.match(endpoint, /approval.status !== 'artistic-approved'/);
  assert.match(endpoint, /sha256Video\(\)/);
  assert.match(endpoint, /source.sourceVideoSha256/);
  assert.match(endpoint, /capture\('ffmpeg'/);
  assert.match(endpoint, /'-ss', '7.000'/);
  assert.match(endpoint, /await link\(temp, targetFile\(\)\)/);
  assert.match(endpoint, /paidCallsAuthorized: 0/);
  assert.match(endpoint, /additionalSpendUsd: 0/);
  assert.match(endpoint, /sourceVideoUntouched: true/);
  assert.doesNotMatch(endpoint, /generateVideos\s*\(/);
  assert.doesNotMatch(endpoint, /getVideosOperation\s*\(/);
  assert.match(image, /continuidad-final-p01.png/);
});

test('P02 panel is preproduction, not a duplicate paid trigger', async () => {
  const ui = await readFile(new URL(
    '../components/V7DosToquesShot02Panel.tsx', import.meta.url
  ), 'utf8');
  assert.match(ui, /Preparar continuidad · Sin costo/);
  assert.match(ui, /Bloqueada · US\$0 autorizado/);
  assert.match(ui, /referenceUrl/);
  assert.match(ui, /plan.promptEnglish/);
  assert.doesNotMatch(ui, /Generar una sola toma/);
});
