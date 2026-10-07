param(
    [Parameter(Mandatory=$true)]
    [string]$ProjectId,

    [Parameter(Mandatory=$true)]
    [string]$Confirm
)

$ErrorActionPreference = "Stop"
$ExpectedConfirm = "--confirm-sofia-v2-usd-0.01"
if ($Confirm -ne $ExpectedConfirm) {
    throw "CONFIRMACION INCORRECTA. Usa exactamente: $ExpectedConfirm"
}

$Repo = (Get-Location).Path
$EnvFile = Join-Path $Repo ".env.local"
if (-not (Test-Path $EnvFile)) { throw ".env.local no existe." }

function Get-DotEnvValue {
    param([string]$Name)
    $line = Get-Content $EnvFile |
        Where-Object { $_ -match "^\s*$([regex]::Escape($Name))\s*=" } |
        Select-Object -Last 1
    if (-not $line) { return $null }
    $value = ($line -split "=", 2)[1].Trim()
    if (
        ($value.StartsWith('"') -and $value.EndsWith('"')) -or
        ($value.StartsWith("'") -and $value.EndsWith("'"))
    ) {
        $value = $value.Substring(1, $value.Length - 2)
    }
    return $value
}

function Assert-Locked {
    $external = Get-DotEnvValue "ALLOW_EXTERNAL_API_CALLS"
    $paid = Get-DotEnvValue "ALLOW_PAID_GENERATION"
    $fallback = Get-DotEnvValue "ALLOW_PAID_PROVIDER_FALLBACK"
    if ($external -ne "false" -or $paid -ne "false" -or $fallback -ne "false") {
        throw "SAFE LOCK NO ESTA ACTIVO. Ejecuta LOCK-PAID-APIS.ps1 primero."
    }
}

Assert-Locked

$ApiKey = $env:OPENAI_API_KEY
if ([string]::IsNullOrWhiteSpace($ApiKey)) { $ApiKey = Get-DotEnvValue "OPENAI_API_KEY" }
if ([string]::IsNullOrWhiteSpace($ApiKey)) { throw "OPENAI_API_KEY no esta disponible." }

$BaseDir = Join-Path $Repo ".data\projects\$ProjectId\audio\scene6-v6\sofia-v2"
New-Item -ItemType Directory -Force -Path $BaseDir | Out-Null
$MetaPath = Join-Path $BaseDir "sofia-voice-v2.json"
$RawPcm = Join-Path $BaseDir "sofia-voice-v2-audition.pcm"
$WavPath = Join-Path $BaseDir "sofia-voice-v2-audition.wav"

$VoicePrompt = @"
A fictional synthetic Latin American Spanish-speaking girl around 10 years old.
The voice must sound unmistakably like a real preadolescent girl from the first phoneme:
small and light vocal tract impression, bright youthful timbre, gentle upper resonance,
clear childlike consonants, natural short phrases, spontaneous curiosity and warmth.
Neutral Caribbean/Latin American Spanish, understandable and natural, without caricature.
Absolutely avoid adult female chest resonance, mature breathiness, sensuality, announcer tone,
theatrical acting, baby talk, cartoon squeakiness, metallic processing, or exaggerated pitch.
She is speaking affectionately to her mother at home. The delivery is innocent, simple,
close, curious, emotionally genuine, and conversational. This is an original fictional
synthetic character voice and must not imitate any real child or identifiable person.
"@.Trim()

$ScriptHint = "Mami, ¿ya terminaste? Mamá, ven un momento. Quiero enseñarte algo que hice hoy."
$VoiceId = $null

if (Test-Path $MetaPath) {
    try {
        $existing = Get-Content $MetaPath -Raw | ConvertFrom-Json
        if ($existing.voice_id) {
            $VoiceId = [string]$existing.voice_id
            Write-Host "Voice ID existente reutilizado. No se crea otra voz." -ForegroundColor Green
        }
    } catch {
        throw "Metadata de Sofia V2 invalida. No se ejecutara otra llamada."
    }
}

if (-not $VoiceId) {
    Write-Host ""
    Write-Host "=== CREANDO SOFIA VOICE V2 ===" -ForegroundColor Magenta
    $body = @{
        type = "prompt"
        name = "ViralCine Sofia Voice V2"
        prompt = $VoicePrompt
        model = "auto"
        script_hint = $ScriptHint
    } | ConvertTo-Json -Depth 5

    try {
        $voice = Invoke-RestMethod -Uri "https://api.openai.com/v1/audio/voices" -Method Post -Headers @{ Authorization = "Bearer $ApiKey" } -ContentType "application/json" -Body $body
    } catch {
        throw "OPENAI VOICE CREATE FALLIDO. NO HAGAS RETRY. $($_.Exception.Message)"
    }

    if (-not $voice.id) { throw "OpenAI no devolvio voice ID. NO HAGAS RETRY." }
    $VoiceId = [string]$voice.id

    @{
        voice_id = $VoiceId
        name = "ViralCine Sofia Voice V2"
        type = [string]$voice.type
        created_at = $voice.created_at
        prompt = $VoicePrompt
        script_hint = $ScriptHint
        approved = $false
        approved_at = $null
        audition_text = "Mami, ¿ya terminaste?"
        live_max_seconds = 8
        live_max_estimated_usd = 0.0067
    } | ConvertTo-Json -Depth 6 | Set-Content -Encoding UTF8 $MetaPath
}

Write-Host ""
Write-Host "=== AUDICION LIVE SOFIA V2 ===" -ForegroundColor Magenta
Write-Host "Texto exacto: Mami, ¿ya terminaste?" -ForegroundColor Cyan
Write-Host "Tope Live: 8 segundos ~= US$0.0067" -ForegroundColor Yellow
Write-Host "WAN: NO | Runway: NO | Fal.ai: NO" -ForegroundColor Green

$ws = [System.Net.WebSockets.ClientWebSocket]::new()
$ws.Options.SetRequestHeader("Authorization", "Bearer $ApiKey")
$uri = [Uri]"wss://api.openai.com/v1/live/sessions"
$cts = [System.Threading.CancellationTokenSource]::new()
$cts.CancelAfter([TimeSpan]::FromSeconds(12))

try {
    $ws.ConnectAsync($uri, $cts.Token).GetAwaiter().GetResult()
} catch {
    throw "LIVE CONNECT FALLIDO. NO HAGAS RETRY. $($_.Exception.Message)"
}

function Send-JsonWs {
    param(
        [System.Net.WebSockets.ClientWebSocket]$Socket,
        [object]$Object,
        [System.Threading.CancellationToken]$Token
    )
    $json = $Object | ConvertTo-Json -Depth 20 -Compress
    $bytes = [System.Text.Encoding]::UTF8.GetBytes($json)
    $segment = [ArraySegment[byte]]::new($bytes)
    $Socket.SendAsync(
        $segment,
        [System.Net.WebSockets.WebSocketMessageType]::Text,
        $true,
        $Token
    ).GetAwaiter().GetResult()
}

$sessionStart = @{
    type = "session.start"
    event_id = "sofia_v2_start"
    session = @{
        model = "gpt-live-1"
        instructions = @"
You are performing one isolated voice audition for a fictional film character named Sofia.
Speak in Latin American Spanish. Use the configured Sofia custom voice exactly as designed.
Your entire spoken response must be exactly these words and nothing else:
Mami, ¿ya terminaste?
Do not greet. Do not explain. Do not add any word before or after the line.
Natural daughter-to-mother delivery: curious, warm, simple, innocent, conversational.
"@.Trim()
        audio = @{
            format = @{ type = "audio/pcm"; rate = 24000 }
            output = @{ voice = @{ id = $VoiceId } }
        }
        delegation = @{ type = "client" }
        store = $false
    }
}

Send-JsonWs -Socket $ws -Object $sessionStart -Token $cts.Token

$pcm = [System.IO.MemoryStream]::new()
$started = $false
$promptSent = $false
$heardAudio = $false
$lastAudioAt = [DateTime]::MinValue
$deadline = [DateTime]::UtcNow.AddSeconds(8)
$buffer = New-Object byte[] 131072

while ([DateTime]::UtcNow -lt $deadline) {
    if ($ws.State -ne [System.Net.WebSockets.WebSocketState]::Open) { break }
    $receiveCts = [System.Threading.CancellationTokenSource]::new()
    $receiveCts.CancelAfter(500)

    try {
        $message = [System.IO.MemoryStream]::new()
        do {
            $segment = [ArraySegment[byte]]::new($buffer)
            $result = $ws.ReceiveAsync($segment, $receiveCts.Token).GetAwaiter().GetResult()
            if ($result.MessageType -eq [System.Net.WebSockets.WebSocketMessageType]::Close) { break }
            if ($result.Count -gt 0) { $message.Write($buffer, 0, $result.Count) }
        } while (-not $result.EndOfMessage)

        if ($message.Length -eq 0) { continue }
        $text = [System.Text.Encoding]::UTF8.GetString($message.ToArray())
        $event = $text | ConvertFrom-Json

        if ($event.type -eq "error") {
            $detail = if ($event.error.message) { $event.error.message } else { $text }
            throw "LIVE ERROR: $detail"
        }
        if ($event.type -eq "session.started") {
            $started = $true
            if (-not $promptSent) {
                Send-JsonWs -Socket $ws -Object @{
                    type = "session.commentary.append"
                    event_id = "sofia_v2_line"
                    delegation_id = $null
                    content = "Mami, ¿ya terminaste?"
                } -Token $cts.Token
                $promptSent = $true
            }
        }
        if ($event.type -eq "session.output_audio.delta" -and $event.delta) {
            $chunk = [Convert]::FromBase64String([string]$event.delta)
            $pcm.Write($chunk, 0, $chunk.Length)
            $heardAudio = $true
            $lastAudioAt = [DateTime]::UtcNow
        }
        if ($heardAudio -and $lastAudioAt -ne [DateTime]::MinValue -and ([DateTime]::UtcNow - $lastAudioAt).TotalMilliseconds -gt 1000) { break }
    }
    catch [System.OperationCanceledException] {
        if ($heardAudio -and ([DateTime]::UtcNow - $lastAudioAt).TotalMilliseconds -gt 1000) { break }
        continue
    }
    finally {
        $receiveCts.Dispose()
    }
}

try {
    if ($ws.State -eq [System.Net.WebSockets.WebSocketState]::Open) {
        Send-JsonWs -Socket $ws -Object @{ type = "session.close"; event_id = "sofia_v2_close" } -Token ([System.Threading.CancellationToken]::None)
    }
} catch {}

$ws.Dispose()
$cts.Dispose()

if (-not $started) { throw "Live no confirmo session.started. NO HAGAS RETRY." }
if (-not $heardAudio -or $pcm.Length -lt 1000) { throw "Live no devolvio audio suficiente. NO HAGAS RETRY." }

[System.IO.File]::WriteAllBytes($RawPcm, $pcm.ToArray())
$pcm.Dispose()

ffmpeg -y -f s16le -ar 24000 -ac 1 -i $RawPcm -ar 48000 -ac 2 -c:a pcm_s16le $WavPath

if ($LASTEXITCODE -ne 0 -or -not (Test-Path $WavPath)) {
    throw "FFMPEG no pudo convertir la audicion. No se requiere otra llamada OpenAI."
}

Write-Host ""
Write-Host "==================================================" -ForegroundColor Green
Write-Host " SOFIA VOICE V2 — AUDICION LISTA" -ForegroundColor Green
Write-Host "==================================================" -ForegroundColor Green
Write-Host "Voice ID: GUARDADO EN METADATA (no mostrado)" -ForegroundColor Green
Write-Host "Pitch-shift: NO" -ForegroundColor Green
Write-Host "Remaster agresivo: NO" -ForegroundColor Green
Write-Host "WAN: NO" -ForegroundColor Green
Write-Host "Runway: NO" -ForegroundColor Green
Write-Host "Fal.ai: NO" -ForegroundColor Green
Write-Host "Live max: 8s ~= US$0.0067" -ForegroundColor Yellow
Write-Host "AUDIO: $WavPath" -ForegroundColor Cyan
Write-Host "SOFIA_V2_REVIEW_REQUIRED=YES" -ForegroundColor Yellow
Write-Host "==================================================" -ForegroundColor Green

Start-Process -FilePath $WavPath
