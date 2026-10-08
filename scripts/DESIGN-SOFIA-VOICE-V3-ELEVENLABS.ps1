param(
    [Parameter(Mandatory=$true)]
    [string]$ProjectId,

    [Parameter(Mandatory=$true)]
    [string]$Confirm
)

$ErrorActionPreference = 'Stop'
$ExpectedConfirm = '--confirm-sofia-v3-104-credits'
if ($Confirm -ne $ExpectedConfirm) { throw ('CONFIRMACION INCORRECTA. Usa exactamente: ' + $ExpectedConfirm) }

$Repo = (Get-Location).Path
$EnvFile = Join-Path $Repo '.env.local'
if (-not (Test-Path $EnvFile)) { throw '.env.local no existe.' }

function Get-DotEnvValue {
    param([string]$Name)
    $value = $null
    $pattern = '^\s*' + [regex]::Escape($Name) + '\s*=\s*(.*)\s*$'
    foreach ($line in Get-Content $EnvFile) {
        if ($line -match $pattern) { $value = $Matches[1].Trim() }
    }
    if ([string]::IsNullOrWhiteSpace($value)) { return $null }
    if ((($value.StartsWith([char]34)) -and ($value.EndsWith([char]34))) -or (($value.StartsWith([char]39)) -and ($value.EndsWith([char]39)))) {
        $value = $value.Substring(1, $value.Length - 2)
    }
    return $value
}

$external = Get-DotEnvValue 'ALLOW_EXTERNAL_API_CALLS'
$paid = Get-DotEnvValue 'ALLOW_PAID_GENERATION'
$fallback = Get-DotEnvValue 'ALLOW_PAID_PROVIDER_FALLBACK'
if ($external -ne 'false' -or $paid -ne 'false' -or $fallback -ne 'false') { throw 'SAFE LOCK NO ESTA ACTIVO AL INICIO.' }

$ApiKey = Get-DotEnvValue 'ELEVENLABS_API_KEY'
if ([string]::IsNullOrWhiteSpace($ApiKey)) { throw 'ELEVENLABS_API_KEY no existe o esta vacia en .env.local.' }
$ApiKey = $ApiKey.Trim()

$OutDir = Join-Path $Repo ('.data\projects\' + $ProjectId + '\audio\scene6-v6\sofia-v3\design')
New-Item -ItemType Directory -Force -Path $OutDir | Out-Null
$AttemptPath = Join-Path $OutDir 'sofia-v3-design-attempt.json'
$ManifestPath = Join-Path $OutDir 'sofia-v3-design-manifest.json'

if (Test-Path $ManifestPath) {
    Write-Host 'Ya existe manifest de previews. Se reutiliza; NO se llama ElevenLabs.' -ForegroundColor Green
    $existing = Get-Content $ManifestPath -Raw | ConvertFrom-Json
    foreach ($item in $existing.previews) { if (Test-Path $item.audio_path) { Start-Process -FilePath $item.audio_path } }
    exit 0
}

if (Test-Path $AttemptPath) {
    $attempt = Get-Content $AttemptPath -Raw | ConvertFrom-Json
    if ($attempt.state -in @('submitted','failed-unknown','failed-no-charge-assumed')) { throw ('RETRY BLOQUEADO. Estado previo: ' + $attempt.state + '. Reconcilia antes de repetir.') }
}

$PreviewText = 'Mami, ¿ya terminaste? Ven, quiero enseñarte algo. Hoy hice un dibujo para ti y quiero saber si te gusta.'
if ($PreviewText.Length -ne 104) { throw ('PREVIEW TEXT CAMBIO. Esperados 104 caracteres; actual: ' + $PreviewText.Length) }

$VoiceDescription = [string]::Join(' ', @(
    'A realistic fictional Latina girl around 10 years old, clearly preadolescent from the first word.',
    'Native Latin American Spanish with a soft neutral Caribbean warmth and natural daughter-to-mother intimacy.',
    'Light youthful timbre, small vocal tract impression, bright but not squeaky, clear child consonants, spontaneous and warm.',
    'Curious, affectionate, innocent, conversational delivery at a natural pace.',
    'Avoid adult female chest resonance, teenage maturity, breathy sensual tone, announcer delivery, theatrical acting, baby talk, cartoon voice, metallic artifacts, and artificial pitch shifting.',
    'The result must sound like a real child character while remaining an original synthetic voice and not imitating any identifiable person.'
))

$Attempt = [ordered]@{
    state = 'submitted'
    started_at = (Get-Date).ToUniversalTime().ToString('o')
    project_id = $ProjectId
    provider = 'elevenlabs'
    operation = 'voice_design'
    model_id = 'eleven_ttv_v3'
    preview_characters = 104
    max_authorized_credits = 104
    expected_previews = 3
    retry_allowed = $false
}
$Attempt | ConvertTo-Json -Depth 6 | Set-Content -Path $AttemptPath -Encoding UTF8

$Body = [ordered]@{
    voice_description = $VoiceDescription
    model_id = 'eleven_ttv_v3'
    text = $PreviewText
    auto_generate_text = $false
    loudness = 0.0
    guidance_scale = 4.0
    should_enhance = $false
    stream_previews = $false
} | ConvertTo-Json -Depth 6

Write-Host ''
Write-Host '==================================================' -ForegroundColor Magenta
Write-Host ' SOFIA V3 - VOICE DESIGN' -ForegroundColor Magenta
Write-Host '==================================================' -ForegroundColor Magenta
Write-Host 'Proveedor: ElevenLabs' -ForegroundColor Cyan
Write-Host 'Modelo: eleven_ttv_v3' -ForegroundColor Cyan
Write-Host 'Preview: 104 caracteres' -ForegroundColor Cyan
Write-Host 'Max autorizado: 104 creditos ElevenLabs' -ForegroundColor Yellow
Write-Host 'Esperado: 3 previews' -ForegroundColor Cyan
Write-Host 'TTS final: NO | Video: NO' -ForegroundColor Green

try {
    $Response = Invoke-RestMethod -Uri 'https://api.elevenlabs.io/v1/text-to-voice/design' -Method Post -Headers @{ 'xi-api-key' = $ApiKey } -ContentType 'application/json' -Body $Body
}
catch {
    $status = $null
    try { $status = [int]$_.Exception.Response.StatusCode } catch {}
    if ($status -in @(400,401,403,404,422)) {
        $Attempt.state = 'failed-no-charge-assumed'
        $Attempt.http_status = $status
        $Attempt.failed_at = (Get-Date).ToUniversalTime().ToString('o')
        $Attempt | ConvertTo-Json -Depth 6 | Set-Content -Path $AttemptPath -Encoding UTF8
        throw ('ELEVENLABS VOICE DESIGN RECHAZADO HTTP ' + $status + '. NO HAGAS RETRY.')
    }
    $Attempt.state = 'failed-unknown'
    $Attempt.failed_at = (Get-Date).ToUniversalTime().ToString('o')
    $Attempt | ConvertTo-Json -Depth 6 | Set-Content -Path $AttemptPath -Encoding UTF8
    throw ('ELEVENLABS VOICE DESIGN FALLIDO O AMBIGUO. NO HAGAS RETRY. ' + $_.Exception.Message)
}

$Previews = @($Response.previews)
if ($Previews.Count -ne 3) {
    $Attempt.state = 'failed-unknown'
    $Attempt.preview_count = $Previews.Count
    $Attempt.failed_at = (Get-Date).ToUniversalTime().ToString('o')
    $Attempt | ConvertTo-Json -Depth 6 | Set-Content -Path $AttemptPath -Encoding UTF8
    throw ('ElevenLabs devolvio ' + $Previews.Count + ' previews; esperados 3. NO HAGAS RETRY.')
}

$ManifestPreviews = @()
for ($i = 0; $i -lt $Previews.Count; $i++) {
    $p = $Previews[$i]
    if ([string]::IsNullOrWhiteSpace([string]$p.audio_base_64)) { throw ('Preview ' + ($i + 1) + ' sin audio_base_64. NO HAGAS RETRY.') }
    $audioBytes = [Convert]::FromBase64String([string]$p.audio_base_64)
    $audioPath = Join-Path $OutDir ('sofia-v3-candidate-' + ($i + 1) + '.mp3')
    [System.IO.File]::WriteAllBytes($audioPath, $audioBytes)
    $ManifestPreviews += [ordered]@{
        candidate = ($i + 1)
        generated_voice_id = [string]$p.generated_voice_id
        media_type = [string]$p.media_type
        duration_secs = $p.duration_secs
        language = [string]$p.language
        audio_path = $audioPath
        approved = $false
    }
}

$Manifest = [ordered]@{
    state = 'preview-ready'
    created_at = (Get-Date).ToUniversalTime().ToString('o')
    project_id = $ProjectId
    provider = 'elevenlabs'
    model_id = 'eleven_ttv_v3'
    voice_description = $VoiceDescription
    preview_text = $PreviewText
    preview_characters = 104
    billed_credit_basis = 'preview_text_characters_once_for_three_previews'
    max_authorized_credits = 104
    previews = $ManifestPreviews
    selected_candidate = $null
    saved_voice_id = $null
    tts_generated = $false
    video_generated = $false
}
$Manifest | ConvertTo-Json -Depth 8 | Set-Content -Path $ManifestPath -Encoding UTF8

$Attempt.state = 'succeeded'
$Attempt.succeeded_at = (Get-Date).ToUniversalTime().ToString('o')
$Attempt.preview_count = 3
$Attempt | ConvertTo-Json -Depth 6 | Set-Content -Path $AttemptPath -Encoding UTF8

Write-Host ''
Write-Host '==================================================' -ForegroundColor Green
Write-Host ' SOFIA V3 - 3 CANDIDATAS LISTAS' -ForegroundColor Green
Write-Host '==================================================' -ForegroundColor Green
Write-Host 'Aprobacion automatica: NO' -ForegroundColor Yellow
Write-Host 'Voz guardada en libreria ElevenLabs: NO' -ForegroundColor Green
Write-Host 'TTS final: NO | Video: NO' -ForegroundColor Green
Write-Host ('Manifest: ' + $ManifestPath) -ForegroundColor Cyan
Write-Host '==================================================' -ForegroundColor Green

foreach ($item in $ManifestPreviews) { Start-Process -FilePath $item.audio_path }
