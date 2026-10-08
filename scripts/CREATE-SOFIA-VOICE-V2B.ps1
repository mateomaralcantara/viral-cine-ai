
param(
    [Parameter(Mandatory=$true)]
    [string]$ProjectId,

    [Parameter(Mandatory=$true)]
    [string]$Confirm
)

$ErrorActionPreference = 'Stop'

$ExpectedConfirm = '--confirm-sofia-v2-usd-0.01'
if ($Confirm -ne $ExpectedConfirm) {
    throw ('CONFIRMACION INCORRECTA. Usa exactamente: ' + $ExpectedConfirm)
}

$Repo = (Get-Location).Path
$EnvFile = Join-Path $Repo '.env.local'

if (-not (Test-Path $EnvFile)) {
    throw '.env.local no existe.'
}

function Get-DotEnvValue {
    param([string]$Name)

    $value = $null
    $pattern = '^\s*' + [regex]::Escape($Name) + '\s*=\s*(.*)\s*$'

    foreach ($line in Get-Content $EnvFile) {
        if ($line -match $pattern) {
            $value = $Matches[1].Trim()
        }
    }

    if ([string]::IsNullOrWhiteSpace($value)) {
        return $null
    }

    if (
        ($value.StartsWith([char]34) -and $value.EndsWith([char]34)) -or
        ($value.StartsWith([char]39) -and $value.EndsWith([char]39))
    ) {
        $value = $value.Substring(1, $value.Length - 2)
    }

    return $value
}

function Assert-SafeLock {
    $external = Get-DotEnvValue 'ALLOW_EXTERNAL_API_CALLS'
    $paid = Get-DotEnvValue 'ALLOW_PAID_GENERATION'
    $fallback = Get-DotEnvValue 'ALLOW_PAID_PROVIDER_FALLBACK'

    if ($external -ne 'false' -or $paid -ne 'false' -or $fallback -ne 'false') {
        throw 'SAFE LOCK NO ESTA ACTIVO.'
    }
}

function Save-Metadata {
    param(
        [object]$Metadata,
        [string]$Path
    )

    $Metadata | ConvertTo-Json -Depth 10 | Set-Content -Path $Path -Encoding UTF8
}

function Send-JsonWs {
    param(
        [System.Net.WebSockets.ClientWebSocket]$Socket,
        [object]$Payload,
        [System.Threading.CancellationToken]$Token
    )

    $json = $Payload | ConvertTo-Json -Depth 20 -Compress
    $bytes = [System.Text.Encoding]::UTF8.GetBytes($json)
    $segment = [ArraySegment[byte]]::new($bytes)

    $Socket.SendAsync(
        $segment,
        [System.Net.WebSockets.WebSocketMessageType]::Text,
        $true,
        $Token
    ).GetAwaiter().GetResult()
}

Assert-SafeLock

$ApiKey = $env:OPENAI_API_KEY
if ([string]::IsNullOrWhiteSpace($ApiKey)) {
    $ApiKey = Get-DotEnvValue 'OPENAI_API_KEY'
}
if ([string]::IsNullOrWhiteSpace($ApiKey)) {
    throw 'OPENAI_API_KEY no esta disponible.'
}

$BaseDir = Join-Path $Repo ('.data\\projects\\' + $ProjectId + '\\audio\\scene6-v6\\sofia-v2')
New-Item -ItemType Directory -Force -Path $BaseDir | Out-Null

$MetaPath = Join-Path $BaseDir 'sofia-voice-v2.json'
$CreateAttemptPath = Join-Path $BaseDir 'sofia-voice-v2-create-attempt.json'
$RawPcm = Join-Path $BaseDir 'sofia-voice-v2-audition.pcm'
$WavPath = Join-Path $BaseDir 'sofia-voice-v2-audition.wav'

$InvertedQuestion = [char]0x00BF
$AuditionText = 'Mami, ' + $InvertedQuestion + 'ya terminaste?'

$VoicePrompt = [string]::Join(' ', @(
    'A fictional synthetic Latin American Spanish-speaking girl around 10 years old.',
    'The voice must sound unmistakably preadolescent from the first phoneme.',
    'Use a small light vocal impression, bright youthful timbre, gentle upper resonance, and clear childlike consonants.',
    'Keep the delivery natural, warm, curious, innocent, spontaneous, and conversational.',
    'Use neutral Caribbean and Latin American Spanish influence without caricature.',
    'Avoid adult female chest resonance, mature breathiness, sensuality, announcer tone, theatrical acting, baby talk, cartoon squeakiness, metallic processing, or exaggerated pitch.',
    'This is an original fictional synthetic character voice and must not imitate any real child or identifiable person.'
))

$ScriptHint = [string]::Join(' ', @(
    $AuditionText,
    'Mama, ven un momento.',
    'Quiero ensenarte algo que hice hoy.'
))

$Metadata = $null
$VoiceId = $null

if (Test-Path $MetaPath) {
    try {
        $Metadata = Get-Content $MetaPath -Raw | ConvertFrom-Json
        if ($Metadata.voice_id) {
            $VoiceId = [string]$Metadata.voice_id
            Write-Host 'Voice ID existente reutilizado. No se crea otra voz.' -ForegroundColor Green
        }
    }
    catch {
        throw 'Metadata de Sofia V2 invalida. No se ejecutara ninguna llamada.'
    }
}

if (-not $VoiceId) {
    if (Test-Path $CreateAttemptPath) {
        throw 'VOICE CREATE ya fue intentado y no hay metadata valida. NO HAGAS RETRY; reconcilia primero.'
    }

    [ordered]@{
        state = 'submitted'
        started_at = (Get-Date).ToUniversalTime().ToString('o')
        name = 'ViralCine Sofia Voice V2'
    } | ConvertTo-Json | Set-Content -Path $CreateAttemptPath -Encoding UTF8

    Write-Host ''
    Write-Host '=== CREANDO SOFIA VOICE V2 ===' -ForegroundColor Magenta

    $body = [ordered]@{
        type = 'prompt'
        name = 'ViralCine Sofia Voice V2'
        prompt = $VoicePrompt
        model = 'auto'
        script_hint = $ScriptHint
    } | ConvertTo-Json -Depth 5

    try {
        $voice = Invoke-RestMethod -Uri 'https://api.openai.com/v1/audio/voices' -Method Post -Headers @{ Authorization = ('Bearer ' + $ApiKey) } -ContentType 'application/json' -Body $body
    }
    catch {
        throw ('OPENAI VOICE CREATE FALLIDO O AMBIGUO. NO HAGAS RETRY. ' + $_.Exception.Message)
    }

    if (-not $voice.id) {
        throw 'OpenAI respondio sin voice ID. NO HAGAS RETRY.'
    }

    $VoiceId = [string]$voice.id

    $Metadata = [ordered]@{
        voice_id = $VoiceId
        name = 'ViralCine Sofia Voice V2'
        type = [string]$voice.type
        created_at = $voice.created_at
        prompt = $VoicePrompt
        script_hint = $ScriptHint
        approved = $false
        approved_at = $null
        audition_text = $AuditionText
        live_state = 'not_started'
        live_started_at = $null
        live_succeeded_at = $null
        live_max_seconds = 10
        live_max_estimated_usd = 0.0084
        audio_path = $null
        transcript = $null
    }

    Save-Metadata -Metadata $Metadata -Path $MetaPath
    Remove-Item $CreateAttemptPath -Force
}

if (Test-Path $WavPath) {
    Write-Host ''
    Write-Host 'SOFIA V2 ya tiene audicion local. Se reutiliza; no se llama OpenAI.' -ForegroundColor Green
    Start-Process -FilePath $WavPath
