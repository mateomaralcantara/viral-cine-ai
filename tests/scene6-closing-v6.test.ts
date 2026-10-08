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
  assert.equal(result.dialogueShots, 1);
  assert.equal(result.silentShots, 2);
  assert.equal(result.maxTotalUsd, 0.67);

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

test('Escena 6 V6 usa WAN solo para Elena y Runway para las dos tomas silenciosas', () => {
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

  assert.equal(SCENE6_SAFE_MAX_USD_V6, 0.67);
});

test('Escena 6 oficial deja a Sofía en silencio y Elena dice la promesa exacta', () => {
  const project = projectFixture();

  planScene6ClosingV6(project);
  validateScene6ClosingV6(project);

  const scene6 = project.plan.scenes.find((scene: any) => scene.order === 6);
  const [t1, t2, t3] = [...scene6.shots].sort((a: any, b: any) => a.order - b.order);

  assert.equal(scene6.title, 'Esta es nuestra casa');
  assert.equal(t1.spokenText, '');
  assert.equal(t1.speakerId, undefined);
  assert.equal(t1.motionSpec.preferredProviders[0], 'runway');

  assert.equal(t2.speakerId, 'char-v5-elena-0001');
  assert.equal(t2.spokenText, '¿Ves? Te lo prometí… esta es nuestra casa.');
  assert.equal(t2.motionSpec.preferredProviders[0], 'wan');

  assert.equal(t3.spokenText, '');
  assert.equal(t3.motionSpec.preferredProviders[0], 'runway');

  assert.doesNotMatch(scene6.dialogue, /Mami, ¿ya terminaste\?/);
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

test('preflight Escena 6 es cero gasto y ya no exige audición de Sofía', async () => {
  const preflight = await readFile(
    new URL('../scripts/prepare-scene6-v6.ts', import.meta.url),
    'utf8'
  );

  assert.match(preflight, /SCENE6_SOFIA_AUDITION_REQUIRED=NO/);
  assert.match(preflight, /SCENE6_ELENA_APPROVED_VOICE=marin/);
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


test('Sofia Voice V2B reconoce flags SAFE en .env.local con regex PowerShell correcto', async () => {
  const script = await readFile(
    new URL('../scripts/CREATE-SOFIA-VOICE-V2B.ps1', import.meta.url),
    'utf8'
  );

  assert.match(
    script,
    /\$pattern = '\^\\s\*' \+ \[regex\]::Escape\(\$Name\) \+ '\\s\*=\\s\*\(\.\*\)\\s\*\$'/
  );
  assert.doesNotMatch(script, /\^\\\\s\*/);
  assert.match(script, /Get-DotEnvValue 'ALLOW_EXTERNAL_API_CALLS'/);
  assert.match(script, /Get-DotEnvValue 'ALLOW_PAID_GENERATION'/);
  assert.match(script, /Get-DotEnvValue 'ALLOW_PAID_PROVIDER_FALLBACK'/);
});


test('Sofia Voice V2B no contiene una segunda copia concatenada', async () => {
  const script = await readFile(
    new URL('../scripts/CREATE-SOFIA-VOICE-V2B.ps1', import.meta.url),
    'utf8'
  );

  assert.equal(
    (script.match(/function Get-DotEnvValue/g) || []).length,
    1
  );
  assert.equal(
    (script.match(/function Assert-SafeLock/g) || []).length,
    1
  );
  assert.equal(
    (script.match(/\$pattern =/g) || []).length,
    1
  );
  assert.equal(
    (script.match(/Start-Process -FilePath \$WavPath/g) || []).length,
    2
  );
});


test('Sofia Voice V2B bloquea retry tras 401 y lo clasifica sin cobro', async () => {
  const script = await readFile(
    new URL('../scripts/CREATE-SOFIA-VOICE-V2B.ps1', import.meta.url),
    'utf8'
  );

  assert.match(script, /sofia-voice-v2-auth-block\.json/);
  assert.match(script, /http_401_unauthorized/);
  assert.match(script, /charged_assumption_usd = 0\.0/);
  assert.match(script, /retry_allowed = \$false/);
  assert.match(script, /AUTH BLOCK ACTIVO/);
});

test('reconciliador Sofia V2B 401 no llama red ni proveedores', async () => {
  const script = await readFile(
    new URL('../scripts/RECONCILE-SOFIA-VOICE-V2B-401.ps1', import.meta.url),
    'utf8'
  );

  assert.match(script, /failed-no-charge/);
  assert.match(script, /voice_created = \$false/);
  assert.match(script, /live_started = \$false/);
  assert.match(script, /charged_assumption_usd = 0\.0/);
  assert.doesNotMatch(script, /Invoke-RestMethod/);
  assert.doesNotMatch(script, /ClientWebSocket/);
});

test('auditoria local de auth Sofia V2B no toca red ni imprime la clave', async () => {
  const script = await readFile(
    new URL('../scripts/CHECK-SOFIA-VOICE-V2B-AUTH-LOCAL.ps1', import.meta.url),
    'utf8'
  );

  assert.match(script, /NETWORK_CALLS=NO/);
  assert.match(script, /COST_USD=0/);
  assert.match(script, /sk-proj-/);
  assert.doesNotMatch(script, /Invoke-RestMethod/);
  assert.doesNotMatch(script, /ClientWebSocket/);
  assert.doesNotMatch(script, /Write-Host \$key/);
});


test('comparador local de claves OpenAI usa huellas y no imprime secretos', async () => {
  const script = await readFile(
    new URL('../scripts/COMPARE-OPENAI-KEY-SOURCES.ps1', import.meta.url),
    'utf8'
  );

  assert.match(script, /SHA256/);
  assert.match(script, /KEY_SOURCE_RESULT=DIFFERENT_KEYS/);
  assert.match(script, /NETWORK_CALLS=NO/);
  assert.match(script, /COST_USD=0/);
  assert.doesNotMatch(script, /Invoke-RestMethod/);
  assert.doesNotMatch(script, /ClientWebSocket/);
  assert.doesNotMatch(script, /Write-Host \$processKey/);
  assert.doesNotMatch(script, /Write-Host \$fileKey/);
});


test('Sofia Voice V3 ElevenLabs preflight es read-only y no genera media', async () => {
  const script = await readFile(
    new URL('../scripts/PREFLIGHT-SOFIA-VOICE-V3-ELEVENLABS.ps1', import.meta.url),
    'utf8'
  );

  assert.match(script, /GET https:\/\/api\.elevenlabs\.io\/v2\/voices/i);
  assert.match(script, /ELEVENLABS_API_KEY/);
  assert.match(script, /voice_design_executed = \$false/);
  assert.match(script, /tts_executed = \$false/);
  assert.match(script, /video_executed = \$false/);
  assert.match(script, /generation_cost_assumption_usd = 0\.0/);
  assert.doesNotMatch(script, /text-to-voice\/design/);
  assert.doesNotMatch(script, /text-to-speech/);
  assert.doesNotMatch(script, /Runway/i);
  assert.doesNotMatch(script, /Fal\.ai/i);
});

test('Sofia Voice V3 ElevenLabs preflight usa .env.local y regex PowerShell valido', async () => {
  const script = await readFile(
    new URL('../scripts/PREFLIGHT-SOFIA-VOICE-V3-ELEVENLABS.ps1', import.meta.url),
    'utf8'
  );

  assert.match(
    script,
    /\$pattern = '\^\\s\*' \+ \[regex\]::Escape\(\$Name\) \+ '\\s\*=\\s\*\(\.\*\)\\s\*\$'/
  );
  assert.match(script, /\$ApiKey = Get-DotEnvValue 'ELEVENLABS_API_KEY'/);
  assert.doesNotMatch(script, /\$env:ELEVENLABS_API_KEY/);
});


test('Sofia Voice V3 design usa un solo POST, 104 creditos y no guarda voz ni genera TTS', async () => {
  const script = await readFile(
    new URL('../scripts/DESIGN-SOFIA-VOICE-V3-ELEVENLABS.ps1', import.meta.url),
    'utf8'
  );

  assert.match(script, /--confirm-sofia-v3-104-credits/);
  assert.match(script, /preview_characters = 104/);
  assert.match(script, /max_authorized_credits = 104/);
  assert.match(script, /expected_previews = 3/);
  assert.match(script, /eleven_ttv_v3/);
  assert.match(script, /https:\/\/api\.elevenlabs\.io\/v1\/text-to-voice\/design/);
  assert.match(script, /Invoke-RestMethod/);
  assert.match(script, /RETRY BLOQUEADO/);
  assert.match(script, /failed-unknown/);
  assert.doesNotMatch(script, /\/v1\/text-to-speech\//);
  assert.doesNotMatch(script, /https:\/\/api\.elevenlabs\.io\/v1\/text-to-voice'\s/);
});

test('Sofia Voice V3 design conserva texto de preview fijo en 104 caracteres', async () => {
  const script = await readFile(
    new URL('../scripts/DESIGN-SOFIA-VOICE-V3-ELEVENLABS.ps1', import.meta.url),
    'utf8'
  );

  const expected = 'Mami, ¿ya terminaste? Ven, quiero enseñarte algo. Hoy hice un dibujo para ti y quiero saber si te gusta.';
  assert.equal(expected.length, 104);
  assert.match(script, /\$PreviewText\.Length -ne 104/);
  assert.match(script, /A realistic fictional Latina girl around 10 years old/);
  assert.match(script, /Avoid adult female chest resonance/);
});


test('Sofia Voice V3 preview evita mojibake en PowerShell 5.1 y conserva 104 caracteres', async () => {
  const script = await readFile(
    new URL('../scripts/DESIGN-SOFIA-VOICE-V3-ELEVENLABS.ps1', import.meta.url),
    'utf8'
  );

  assert.match(script, /\[char\]0x00BF/);
  assert.match(script, /\[char\]0x00F1/);
  assert.match(script, /\$PreviewText\.Length -ne 104/);
  assert.doesNotMatch(script, /\$PreviewText = 'Mami, ¿/);
  assert.doesNotMatch(script, /enseñarte algo/);
});


test('Sofia V3 HTTP errors quedan failed-unknown con detalle y riesgo de 104 creditos', async () => {
  const script = await readFile(
    new URL('../scripts/DESIGN-SOFIA-VOICE-V3-ELEVENLABS.ps1', import.meta.url),
    'utf8'
  );

  assert.match(script, /error_detail/);
  assert.match(script, /request_id/);
  assert.match(script, /trace_id/);
  assert.match(script, /\$Attempt\.credits_risk_max = 104/);
  assert.match(script, /state = 'failed-unknown'/);
  assert.doesNotMatch(script, /failed-no-charge-assumed/);
});

test('reconciliador Sofia V3 HTTP 400 es local y bloquea retry', async () => {
  const script = await readFile(
    new URL('../scripts/RECONCILE-SOFIA-V3-HTTP400.ps1', import.meta.url),
    'utf8'
  );

  assert.match(script, /failed-unknown/);
  assert.match(script, /Add-Member -NotePropertyName 'credits_risk_max' -NotePropertyValue 104 -Force/);
  assert.match(script, /retry_allowed = \$false/);
  assert.match(script, /Add-Member -NotePropertyName 'voice_previews_confirmed' -NotePropertyValue 0 -Force/);
  assert.doesNotMatch(script, /Invoke-RestMethod/);
  assert.doesNotMatch(script, /Invoke-WebRequest/);
});

test('auditoria Sofia V3 consulta solo uso de ElevenLabs y no genera media', async () => {
  const script = await readFile(
    new URL('../scripts/AUDIT-SOFIA-V3-ELEVENLABS-USAGE.ps1', import.meta.url),
    'utf8'
  );

  assert.match(script, /v1\/user\/subscription/);
  assert.match(script, /usage-by-product-over-time/);
  assert.match(script, /group_by = @\('product_type'\)/);
  assert.match(script, /GENERATION_EXECUTED=NO/);
  assert.match(script, /RETRY_EXECUTED=NO/);
  assert.doesNotMatch(script, /text-to-voice\/design/);
  assert.doesNotMatch(script, /text-to-speech/);
});


test('reconciliador Sofia V3 agrega propiedades nuevas de PSCustomObject con Add-Member', async () => {
  const script = await readFile(
    new URL('../scripts/RECONCILE-SOFIA-V3-HTTP400.ps1', import.meta.url),
    'utf8'
  );

  assert.match(script, /Add-Member -NotePropertyName 'credits_risk_max'/);
  assert.match(script, /Add-Member -NotePropertyName 'voice_previews_confirmed'/);
  assert.match(script, /Add-Member -NotePropertyName 'reconciled_at'/);
  assert.match(script, /Add-Member -NotePropertyName 'reconciliation_note'/);
});


test('preflight Escena 6 no contiene bloques duplicados ni strings de costo truncados', async () => {
  const preflight = await readFile(
    new URL('../scripts/prepare-scene6-v6.ts', import.meta.url),
    'utf8'
  );

  assert.equal(
    (preflight.match(/async function referenceStatus/g) || []).length,
    1
  );
  assert.equal(
    (preflight.match(/SCENE6_PREPARE=PASS/g) || []).length,
    1
  );
  assert.match(preflight, /T2 WAN:/);
  assert.match(preflight, /T1\+T3 Grok Lite:/);
  assert.doesNotMatch(preflight, /SCENE6_SOFIA_AUDITION_REQUIRED=YES/);
});


test('productor Escena 6 queda limitado a 1 WAN, 2 Grok Lite, marin y sin imagen nueva', async () => {
  const producer = await readFile(
    new URL('../lib/engine/scene6-closing-producer-v6.ts', import.meta.url),
    'utf8'
  );

  assert.match(producer, /MAX_TOTAL_VIDEO_CREDITS = 66/);
  assert.match(producer, /MAX_WAN_4S_CREDITS = 40/);
  assert.match(producer, /MAX_GROK_4S_CREDITS = 13/);
  assert.match(producer, /grokLiteImageToVideoCredits\(4, GROK_RATIO\) \* 2/);
  assert.match(producer, /wan3VideoCredits\(4, WAN_RATIO\)/);
  assert.match(producer, /voiceId !== 'marin'/);
  assert.match(producer, /generateSpeech\(/);
  assert.match(producer, /generateRunwayWan3AudioReferenceFromEnvironment/);
  assert.match(producer, /generateRunwayGrokLiteFromEnvironment/);
  assert.doesNotMatch(producer, /generateImageWithReferences/);
  assert.doesNotMatch(producer, /fal-media/);
  assert.match(producer, /delete process\.env\.FAL_KEY/);
});

test('productor Escena 6 reutiliza Escena 5 como continuidad familiar y bloquea retries ambiguos', async () => {
  const producer = await readFile(
    new URL('../lib/engine/scene6-closing-producer-v6.ts', import.meta.url),
    'utf8'
  );

  assert.match(producer, /scene-005-wan3-reunion-v6-mateo-true-child\.mp4/);
  assert.match(producer, /const t3Continuity = t1Reference/);
  assert.match(producer, /failed-unknown/);
  assert.match(producer, /failed-no-charge/);
  assert.match(producer, /No se reintentará automáticamente/);
  assert.match(producer, /SCENE6_SAFE_MAX_USD_V6/);
  assert.match(producer, /SAFE CUMULATIVE COST GATE E6/);
});

test('launcher Escena 6 exige autorización exacta US$0.67 y no autoriza más', async () => {
  const launcher = await readFile(
    new URL('../scripts/generate-scene6-v6.ts', import.meta.url),
    'utf8'
  );

  assert.match(launcher, /--confirm-scene6-usd-0\.67/);
  assert.match(launcher, /SCENE6_SAFE_MAX_USD_V6 - 0\.67/);
  assert.match(launcher, /Máximo total autorizado: US\$0\.67/);
  assert.match(launcher, /Sofía: SIN DIÁLOGO/);
  assert.match(launcher, /Imagen OpenAI nueva: NO/);
  assert.match(launcher, /Fallback pagado automático: NO/);
  assert.match(launcher, /Retry automático tras estado dudoso: NO/);
});

test('package expone safe:scene6:run con launcher protegido', async () => {
  const pkg = JSON.parse(
    await readFile(
      new URL('../package.json', import.meta.url),
      'utf8'
    )
  );

  assert.equal(
    pkg.scripts['safe:scene6:run'],
    'node --import tsx scripts/generate-scene6-v6.ts'
  );
});


test('Scene 6B Repair aísla identidades por toma y conserva el diálogo exacto', async () => {
  const spec = await import(
    new URL('../lib/engine/scene6b-repair-spec-v6.ts', import.meta.url).href
  );
  const shots = spec.buildScene6BRepairShotsV6('scene-15d-short-06');
  const result = spec.validateScene6BRepairShotsV6(shots);

  assert.equal(result.shots, 3);
  assert.equal(result.durationSeconds, 12);
  assert.equal(result.maxVideoUsd, 0.66);
  assert.equal(result.authorizedMaxUsd, 0.67);

  assert.deepEqual(shots[0].characterIds, ['char-v5-sofia-0004']);
  assert.equal(shots[0].spokenText, '');
  assert.match(shots[0].visualPrompt, /SOLO SOFÍA EN CUADRO/);

  assert.deepEqual(shots[1].characterIds, ['char-v5-elena-0001']);
  assert.equal(shots[1].speakerId, 'char-v5-elena-0001');
  assert.equal(
    shots[1].spokenText,
    '¿Ves? Te lo prometí… esta es nuestra casa.'
  );
  assert.match(shots[1].visualPrompt, /SOLO ELENA EN CUADRO/);

  assert.deepEqual(
    shots[2].characterIds,
    [
      'char-v5-elena-0001',
      'char-v5-sofia-0004',
      'char-v5-mateo-0005'
    ]
  );
  assert.equal(shots[2].spokenText, '');
  assert.match(shots[2].visualPrompt, /VISTO DESDE ATRÁS/);
  assert.match(shots[2].visualPrompt, /Ningún rostro debe ser visible/);
});

test('Scene 6B producer usa solo 2 Grok + 1 WAN y reutiliza la voz marin existente', async () => {
  const producer = await readFile(
    new URL('../lib/engine/scene6b-repair-producer-v6.ts', import.meta.url),
    'utf8'
  );

  assert.equal(
    (producer.match(/generateRunwayGrokLiteFromEnvironment\(/g) || []).length,
    2
  );
  assert.equal(
    (producer.match(/generateRunwayWan3AudioReferenceFromEnvironment\(/g) || []).length,
    1
  );
  assert.match(producer, /MAX_TOTAL_VIDEO_CREDITS = 66/);
  assert.match(producer, /MAX_GROK_4S_CREDITS = 13/);
  assert.match(producer, /MAX_WAN_4S_CREDITS = 40/);
  assert.match(
    producer,
    /scene-006-shot-02-elena-master\.wav/
  );
  assert.doesNotMatch(producer, /generateSpeech\(/);
  assert.doesNotMatch(producer, /generateImageWithReferences/);
  assert.doesNotMatch(producer, /fal-media/);
  assert.match(producer, /delete process\.env\.FAL_KEY/);
});

test('Scene 6B usa presupuesto independiente e6b y preserva el master anterior', async () => {
  const producer = await readFile(
    new URL('../lib/engine/scene6b-repair-producer-v6.ts', import.meta.url),
    'utf8'
  );

  assert.match(producer, /v6safe:e6b:t1:grok-lite:1/);
  assert.match(producer, /v6safe:e6b:t2:wan3-audio-reference:1/);
  assert.match(producer, /v6safe:e6b:t3:grok-lite:1/);
  assert.match(producer, /startsWith\(\s*'v6safe:e6b:'/);
  assert.match(producer, /scene-006-home-promise-v6\.mp4/);
  assert.match(producer, /scene-006b-repair-v6\.mp4/);
  assert.match(producer, /previousSceneVideo/);
  assert.match(producer, /No se reintentará automáticamente/);
});

test('Scene 6B T2 jamás usa frame de Sofía como referencia WAN', async () => {
  const producer = await readFile(
    new URL('../lib/engine/scene6b-repair-producer-v6.ts', import.meta.url),
    'utf8'
  );

  assert.match(producer, /references: \[\s*\{\s*uri:\s*await imageFileToDataUri\(\s*elenaWanRef/);
  assert.match(producer, /la única persona visible es Elena/);
  assert.match(producer, /No mostrar a Sofía/);
  assert.match(producer, /No transformar a Elena en niña/);
});

test('Scene 6B preflight exige assets existentes y no llama proveedores', async () => {
  const preflight = await readFile(
    new URL('../scripts/prepare-scene6b-repair-v6.ts', import.meta.url),
    'utf8'
  );

  assert.match(preflight, /scene-006-home-promise-v6\.mp4/);
  assert.match(preflight, /scene-006-shot-02-elena-master\.wav/);
  assert.match(preflight, /scene-005-shot-01-family-reference\.png/);
  assert.match(preflight, /SCENE6B_PREPARE=PASS/);
  assert.match(preflight, /Gasto de este preflight: US\$0/);
  assert.doesNotMatch(preflight, /generateRunway/);
  assert.doesNotMatch(preflight, /generateSpeech/);
});

test('Scene 6B launcher exige autorización exacta US$0.67 aunque el máximo real sea US$0.66', async () => {
  const launcher = await readFile(
    new URL('../scripts/generate-scene6b-repair-v6.ts', import.meta.url),
    'utf8'
  );

  assert.match(launcher, /--confirm-scene6b-usd-0\.67/);
  assert.match(launcher, /SCENE6B_AUTHORIZED_MAX_USD_V6 - 0\.67/);
  assert.match(launcher, /SCENE6B_MAX_VIDEO_USD_V6 - 0\.66/);
  assert.match(launcher, /Máximo real esperado: US\$0\.66/);
  assert.match(launcher, /Máximo autorizado: US\$0\.67/);
  assert.match(launcher, /Voz OpenAI nueva: NO/);
  assert.match(launcher, /Master Scene 6 anterior: PRESERVADO/);
});

test('package expone prepare y run de Scene 6B Repair', async () => {
  const pkg = JSON.parse(
    await readFile(
      new URL('../package.json', import.meta.url),
      'utf8'
    )
  );

  assert.equal(
    pkg.scripts['safe:scene6b:prepare'],
    'node --import tsx scripts/prepare-scene6b-repair-v6.ts'
  );
  assert.equal(
    pkg.scripts['safe:scene6b:run'],
    'node --import tsx scripts/generate-scene6b-repair-v6.ts'
  );
});


test('Scene 6B normaliza referencias Grok a ratios válidos antes de llamar Runway', async () => {
  const producer = await readFile(
    new URL('../lib/engine/scene6b-repair-producer-v6.ts', import.meta.url),
    'utf8'
  );

  assert.match(producer, /sofia-identity-grok-safe-9x16\.png/);
  assert.match(producer, /family-grok-safe-16x9\.png/);
  assert.match(
    producer,
    /normalizeReferenceImage\(\s*refs\.sofia,\s*sofiaGrokRef,\s*'9:16'\s*\)/
  );
  assert.match(
    producer,
    /normalizeReferenceImage\(\s*familyReference,\s*familyGrokRef,\s*'16:9'\s*\)/
  );
  assert.match(
    producer,
    /promptImage:\s*await imageFileToDataUri\(sofiaGrokRef\)/
  );
  assert.match(
    producer,
    /promptImage:\s*await imageFileToDataUri\(\s*familyGrokRef\s*\)/
  );
  assert.doesNotMatch(
    producer,
    /promptImage:\s*await imageFileToDataUri\(refs\.sofia\)/
  );
});
