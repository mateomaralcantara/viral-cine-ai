import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import {
  buildFifteenDaysShortPlanV5
} from '@/lib/production-presets/fifteen-days-short-v5';
import {
  planScene6ClosingV6,
  validateScene6ClosingV6,
  SCENE6_DIALOGUE_V6,
  SCENE6_SAFE_MAX_USD_V6
} from '@/lib/engine/scene6-closing-plan-v6';

function projectFixture() {
  const plan = buildFifteenDaysShortPlanV5();
  return {
    id: 'test',
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    status: 'ready',
    input: {
      title: '15 DÍAS',
      premise: 'Premisa suficientemente larga para prueba de cierre final.',
      durationMinutes: 2.5,
      genre: 'Drama',
      audience: 'Adulto',
      visualStyle: 'Cine realista',
      language: 'es',
      aspectRatio: '16:9',
      budgetUsd: 20,
      burnSubtitles: false,
      generateMusic: true
    },
    plan,
    progress: {
      phase: 'test',
      percent: 92,
      totalScenes: 6,
      updatedAt: new Date().toISOString()
    },
    productionLog: []
  } as any;
}

test('Escena 6 V6 queda en 3 tomas / 12s con diálogo exacto', () => {
  const project = projectFixture();

  planScene6ClosingV6(project);
  const result = validateScene6ClosingV6(project);

  assert.equal(result.shots, 3);
  assert.equal(result.durationSeconds, 12);
  assert.equal(result.dialogueShots, 2);
  assert.equal(result.silentShots, 1);
  assert.equal(result.maxTotalUsd, 0.94);

  const scene6 = project.plan.scenes.find((scene: any) => scene.order === 6);

  assert.deepEqual(
    scene6.shots
      .filter((shot: any) => shot.spokenText)
      .map((shot: any) => ({
        order: shot.order,
        speakerId: shot.speakerId,
        text: shot.spokenText
      })),
    [...SCENE6_DIALOGUE_V6]
  );
});

test('Escena 6 V6 prioriza WAN para diálogo y Runway para cierre silencioso', () => {
  const project = projectFixture();

  planScene6ClosingV6(project);
  validateScene6ClosingV6(project);

  const scene6 = project.plan.scenes.find((scene: any) => scene.order === 6);
  for (const shot of scene6.shots) {
    const providers = shot.motionSpec?.preferredProviders || [];
    assert.equal(providers.includes('fal-video'), false);

    if (shot.spokenText) {
      assert.equal(providers[0], 'wan');
    } else {
      assert.equal(providers[0], 'runway');
    }
  }

  assert.equal(SCENE6_SAFE_MAX_USD_V6, 0.94);
});

test('aprobación Escena 5 exige master true-child y no llama proveedores', async () => {
  const approval = await readFile(
    new URL('../scripts/approve-scene5-true-child-v6.ts', import.meta.url),
    'utf8'
  );

  assert.match(
    approval,
    /scene-005-wan3-reunion-v6-mateo-true-child\.mp4/
  );
  assert.match(approval, /qualityOverrideApproved = true/);
  assert.doesNotMatch(approval, /generateRunway/);
  assert.doesNotMatch(approval, /generateSpeech/);
  assert.doesNotMatch(approval, /fal-media/);
});

test('preflight Escena 6 es cero gasto y exige audición de Sofía', async () => {
  const preflight = await readFile(
    new URL('../scripts/prepare-scene6-v6.ts', import.meta.url),
    'utf8'
  );

  assert.match(preflight, /SCENE6_SOFIA_AUDITION_REQUIRED=YES/);
  assert.match(preflight, /Gasto de este preflight: US\$0/);
  assert.doesNotMatch(preflight, /generateRunway/);
  assert.doesNotMatch(preflight, /generateSpeech/);
});


test('audición Sofía usa solo OpenAI voz y remaster infantil local', async () => {
  const audition = await readFile(
    new URL('../scripts/audition-scene6-sofia-v6.ts', import.meta.url),
    'utf8'
  );

  assert.match(audition, /OpenAI coral/);
  assert.match(audition, /niña latina de 10 años/i);
  assert.match(audition, /createYouthfulChildVoicePreserveTiming/);
  assert.match(audition, /--confirm-sofia-audition-retry-usd-0\.01/);
  assert.doesNotMatch(audition, /generateRunway/);
  assert.doesNotMatch(audition, /fal-media/);
});


test('audición Sofía crea directorio antes de llamar OpenAI', async () => {
  const audition = await readFile(
    new URL('../scripts/audition-scene6-sofia-v6.ts', import.meta.url),
    'utf8'
  );

  const mkdirIndex = audition.indexOf('await mkdir(audioDir');
  const speechIndex = audition.indexOf('generateSpeech(');

  assert.ok(mkdirIndex >= 0);
  assert.ok(speechIndex >= 0);
  assert.ok(mkdirIndex < speechIndex);
  assert.match(audition, /coral-true-child:2/);
});

test('reconciliador Sofía asume posible cobro y no llama proveedores', async () => {
  const reconciler = await readFile(
    new URL('../scripts/reconcile-scene6-sofia-audition-v6.ts', import.meta.url),
    'utf8'
  );

  assert.match(reconciler, /reconciled-provider-response-local-write-failed/);
  assert.match(reconciler, /state: 'reconciled'/);
  assert.match(reconciler, /actualUsd: latest\.estimatedUsd/);
  assert.doesNotMatch(reconciler, /generateSpeech/);
  assert.doesNotMatch(reconciler, /generateRunway/);
});


test('Sofía clean local elimina pitch-shift y no llama proveedores', async () => {
  const fixer = await readFile(
    new URL('../scripts/fix-scene6-sofia-clean-local-v6.ts', import.meta.url),
    'utf8'
  );

  assert.match(fixer, /createCleanVoicePreserveTiming/);
  assert.match(fixer, /scene-006-sofia-audition-coral-raw\.mp3/);
  assert.match(fixer, /Pitch shift: NO/);
  assert.match(fixer, /Gasto nuevo: US\$0/);
  assert.doesNotMatch(fixer, /generateSpeech/);
  assert.doesNotMatch(fixer, /generateRunway/);
  assert.doesNotMatch(fixer, /fal-media/);
});


test('audiciones Sofía girl usan tres voces directas sin pitch-shift ni video', async () => {
  const audition = await readFile(
    new URL('../scripts/audition-scene6-sofia-girl-v6.ts', import.meta.url),
    'utf8'
  );

  assert.match(audition, /\['coral', 'nova', 'shimmer'\]/);
  assert.match(audition, /niña latina REAL de 10 años/i);
  assert.match(audition, /Procesamiento posterior: NO/);
  assert.match(audition, /Pitch shift: NO/);
  assert.match(audition, /--confirm-sofia-girl-auditions-usd-0\.01/);
  assert.doesNotMatch(audition, /createYouthfulChildVoicePreserveTiming/);
  assert.doesNotMatch(audition, /generateRunway/);
  assert.doesNotMatch(audition, /fal-media/);
});


test('Sofia Voice V2 queda aislada a voice-create + Live y sin video', async () => {
  const script = await readFile(
    new URL('../scripts/CREATE-SOFIA-VOICE-V2B.ps1', import.meta.url),
    'utf8'
  );

  assert.match(script, /ViralCine Sofia Voice V2/);
  assert.match(script, /fictional synthetic Latin American Spanish-speaking girl around 10 years old/i);
  assert.match(script, /https:\/\/api\.openai\.com\/v1\/audio\/voices/);
  assert.match(script, /wss:\/\/api\.openai\.com\/v1\/live\/sessions/);
  assert.match(script, /--confirm-sofia-v2-usd-0\.01/);
  assert.match(script, /live_max_estimated_usd = 0\.0084/);
  assert.doesNotMatch(script, /generateRunway/);
  assert.doesNotMatch(script, /fal-media/);
});

test('Sofia Voice V2B espera session.started antes de enviar la linea', async () => {
  const script = await readFile(
    new URL('../scripts/CREATE-SOFIA-VOICE-V2B.ps1', import.meta.url),
    'utf8'
  );

  const startedIndex = script.indexOf("if ($event.type -eq 'session.started')");
  const instructionIndex = script.indexOf("type = 'session.instructions.append'");

  assert.ok(startedIndex >= 0);
  assert.ok(instructionIndex > startedIndex);
  assert.match(script, /delegation_id = \$null/);
  assert.match(script, /Immediately say the following line exactly and in full/);
});

test('launcher Sofia Voice V2 solo redirige a V2B', async () => {
  const launcher = await readFile(
    new URL('../scripts/CREATE-SOFIA-VOICE-V2.ps1', import.meta.url),
    'utf8'
  );

  assert.match(launcher, /CREATE-SOFIA-VOICE-V2B\.ps1/);
  assert.doesNotMatch(launcher, /api\.openai\.com/);
  assert.doesNotMatch(launcher, /ClientWebSocket/);
});

test('Sofia Voice V2B es parser-safe y conserva el guard de gasto', async () => {
  const script = await readFile(
    new URL('../scripts/CREATE-SOFIA-VOICE-V2B.ps1', import.meta.url),
    'utf8'
  );

  assert.doesNotMatch(script, /@"/);
  assert.doesNotMatch(script, /"@/);
  assert.match(script, /--confirm-sofia-v2-usd-0\.01/);
  assert.match(script, /live_max_estimated_usd = 0\.0084/);
  assert.match(script, /session\.instructions\.append/);
  assert.match(script, /session\.output_audio\.delta/);
  assert.match(script, /LIVE RETRY BLOQUEADO/);
  assert.doesNotMatch(script, /generateRunway/);
  assert.doesNotMatch(script, /fal-media/);
});

test('PowerShell parser acepta Sofia Voice V2B en Windows', () => {
  if (process.platform !== 'win32') return;

  const filePath = fileURLToPath(
    new URL('../scripts/CREATE-SOFIA-VOICE-V2B.ps1', import.meta.url)
  );
  const escaped = filePath.replaceAll("'", "''");
  const command = [
    '$tokens = $null',
    '$errors = $null',
    "[System.Management.Automation.Language.Parser]::ParseFile('" +
      escaped +
      "', [ref]$tokens, [ref]$errors) | Out-Null",
    'if ($errors.Count -gt 0) {',
    '  $errors | ForEach-Object { Write-Error $_.Message }',
    '  exit 1',
    '}',
    'exit 0'
  ].join('; ');

  const result = spawnSync(
    'powershell.exe',
    ['-NoProfile', '-ExecutionPolicy', 'Bypass', '-Command', command],
    { encoding: 'utf8' }
  );

  assert.equal(
    result.status,
    0,
    'PowerShell parser fallo:\n' + result.stdout + '\n' + result.stderr
  );
});
