
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
$AuthBlockPath = Join-Path $BaseDir 'sofia-voice-v2-auth-block.json'
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

if (Test-Path $AuthBlockPath) {
    throw 'SOFIA V2B AUTH BLOCK ACTIVO. Corrige la credencial/acceso y limpia el bloqueo de forma controlada antes de reintentar.'
}

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
        $statusCode = $null

        try {
            $statusCode = [int]$_.Exception.Response.StatusCode
        }
        catch {}

        if ($statusCode -eq 401) {
            [ordered]@{
                state = 'failed-no-charge'
                reason = 'http_401_unauthorized'
                original_started_at = (Get-Date).ToUniversalTime().ToString('o')
                reconciled_at = (Get-Date).ToUniversalTime().ToString('o')
                voice_created = $false
                live_started = $false
                charged_assumption_usd = 0.0
                retry_allowed = $false
            } | ConvertTo-Json -Depth 5 | Set-Content -Path $CreateAttemptPath -Encoding UTF8

            [ordered]@{
                blocked = $true
                reason = 'http_401_unauthorized'
                created_at = (Get-Date).ToUniversalTime().ToString('o')
                required_action = 'Fix project-scoped OpenAI API authentication and custom-voice access before retry.'
            } | ConvertTo-Json -Depth 5 | Set-Content -Path $AuthBlockPath -Encoding UTF8

            throw 'OPENAI VOICE CREATE 401 UNAUTHORIZED. Voz creada: NO. Live iniciado: NO. Retry bloqueado hasta corregir autenticacion.'
        }

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
    exit 0
}

if ($Metadata.live_state -eq 'submitted' -or $Metadata.live_state -eq 'failed-unknown') {
    throw ('LIVE RETRY BLOQUEADO. Estado previo: ' + $Metadata.live_state + '. Reconcilia antes de repetir.')
}

$Metadata.live_state = 'submitted'
$Metadata.live_started_at = (Get-Date).ToUniversalTime().ToString('o')
Save-Metadata -Metadata $Metadata -Path $MetaPath

Write-Host ''
Write-Host '=== AUDICION LIVE SOFIA V2 ===' -ForegroundColor Magenta
Write-Host ('Texto exacto: ' + $AuditionText) -ForegroundColor Cyan
Write-Host 'Live ceiling: 10 seconds ~= US$0.0084' -ForegroundColor Yellow
Write-Host 'WAN: NO | Runway: NO | Fal.ai: NO' -ForegroundColor Green

$ws = [System.Net.WebSockets.ClientWebSocket]::new()
$ws.Options.SetRequestHeader('Authorization', ('Bearer ' + $ApiKey))
$uri = [Uri]'wss://api.openai.com/v1/live/sessions'
$cts = [System.Threading.CancellationTokenSource]::new()
$cts.CancelAfter([TimeSpan]::FromSeconds(11))

try {
    $ws.ConnectAsync($uri, $cts.Token).GetAwaiter().GetResult()
}
catch {
    $Metadata.live_state = 'failed-unknown'
    Save-Metadata -Metadata $Metadata -Path $MetaPath
    throw ('LIVE CONNECT FALLIDO O AMBIGUO. NO HAGAS RETRY. ' + $_.Exception.Message)
}

$sessionStart = [ordered]@{
    type = 'session.start'
    event_id = 'sofia_v2_start'
    session = [ordered]@{
        model = 'gpt-live-1'
        instructions = 'Speak in Latin American Spanish. Use the configured custom voice naturally. Wait for application instructions before speaking.'
        audio = [ordered]@{
            format = [ordered]@{
                type = 'audio/pcm'
                rate = 24000
            }
            output = [ordered]@{
                voice = [ordered]@{
                    id = $VoiceId
                }
            }
        }
        delegation = [ordered]@{
            type = 'client'
        }
        store = $false
    }
}

Send-JsonWs -Socket $ws -Payload $sessionStart -Token $cts.Token

$pcm = [System.IO.MemoryStream]::new()
$started = $false
$instructionSent = $false
$heardAudio = $false
$lastAudioAt = [DateTime]::MinValue
$transcript = ''
$hardDeadline = [DateTime]::UtcNow.AddSeconds(10)
$buffer = New-Object byte[] 131072

try {
    while ([DateTime]::UtcNow -lt $hardDeadline) {
        if ($ws.State -ne [System.Net.WebSockets.WebSocketState]::Open) {
            break
        }

        $receiveCts = [System.Threading.CancellationTokenSource]::new()
        $receiveCts.CancelAfter(500)

        try {
            $message = [System.IO.MemoryStream]::new()

            do {
                $segment = [ArraySegment[byte]]::new($buffer)
                $result = $ws.ReceiveAsync($segment, $receiveCts.Token).GetAwaiter().GetResult()

                if ($result.MessageType -eq [System.Net.WebSockets.WebSocketMessageType]::Close) {
                    break
                }

                if ($result.Count -gt 0) {
                    $message.Write($buffer, 0, $result.Count)
                }
            }
            while (-not $result.EndOfMessage)

            if ($message.Length -eq 0) {
                continue
            }

            $eventText = [System.Text.Encoding]::UTF8.GetString($message.ToArray())
            $event = $eventText | ConvertFrom-Json

            if ($event.type -eq 'error') {
                $detail = $eventText
                if ($event.error -and $event.error.message) {
                    $detail = [string]$event.error.message
                }
                throw ('LIVE ERROR: ' + $detail)
            }

            if ($event.type -eq 'session.started') {
                $started = $true

                if (-not $instructionSent) {
                    $sayInstruction = [string]::Join(' ', @(
                        'Immediately say the following line exactly and in full.',
                        'Do not add or omit any word.',
                        'Use a natural warm curious daughter-to-mother delivery.',
                        'Then stop speaking.',
                        $AuditionText
                    ))

                    Send-JsonWs -Socket $ws -Payload ([ordered]@{
                        type = 'session.instructions.append'
                        event_id = 'sofia_v2_say'
                        delegation_id = $null
                        content = $sayInstruction
                    }) -Token $cts.Token

                    $instructionSent = $true
                }
            }
            elseif ($event.type -eq 'session.output_audio.delta' -and $event.delta) {
                $chunk = [Convert]::FromBase64String([string]$event.delta)
                $pcm.Write($chunk, 0, $chunk.Length)
                $heardAudio = $true
                $lastAudioAt = [DateTime]::UtcNow
            }
            elseif ($event.type -eq 'session.output_transcript.delta' -and $event.delta) {
                $transcript += [string]$event.delta
            }

            if (
                $heardAudio -and
                $lastAudioAt -ne [DateTime]::MinValue -and
                ([DateTime]::UtcNow - $lastAudioAt).TotalMilliseconds -gt 900
            ) {
                break
            }
        }
        catch [System.OperationCanceledException] {
            if (
                $heardAudio -and
                $lastAudioAt -ne [DateTime]::MinValue -and
                ([DateTime]::UtcNow - $lastAudioAt).TotalMilliseconds -gt 900
            ) {
                break
            }
        }
        finally {
            $receiveCts.Dispose()
        }
    }

    if ($ws.State -eq [System.Net.WebSockets.WebSocketState]::Open) {
        Send-JsonWs -Socket $ws -Payload ([ordered]@{
            type = 'session.close'
            event_id = 'sofia_v2_close'
        }) -Token ([System.Threading.CancellationToken]::None)
    }
}
catch {
    $Metadata.live_state = 'failed-unknown'
    $Metadata.transcript = $transcript
    Save-Metadata -Metadata $Metadata -Path $MetaPath
    try { $ws.Dispose() } catch {}
    try { $cts.Dispose() } catch {}
    throw
}

try { $ws.Dispose() } catch {}
try { $cts.Dispose() } catch {}

if (-not $started) {
    $Metadata.live_state = 'failed-unknown'
    Save-Metadata -Metadata $Metadata -Path $MetaPath
    throw 'Live no confirmo session.started. NO HAGAS RETRY.'
}

if (-not $heardAudio -or $pcm.Length -lt 1000) {
    $Metadata.live_state = 'failed-unknown'
    $Metadata.transcript = $transcript
    Save-Metadata -Metadata $Metadata -Path $MetaPath
    throw 'Live no devolvio audio suficiente. NO HAGAS RETRY.'
}

[System.IO.File]::WriteAllBytes($RawPcm, $pcm.ToArray())
$pcm.Dispose()

& ffmpeg -y -f s16le -ar 24000 -ac 1 -i $RawPcm -ar 48000 -ac 2 -c:a pcm_s16le $WavPath

if ($LASTEXITCODE -ne 0 -or -not (Test-Path $WavPath)) {
    $Metadata.live_state = 'failed-unknown'
    $Metadata.transcript = $transcript
    Save-Metadata -Metadata $Metadata -Path $MetaPath
    throw 'FFMPEG no pudo convertir la audicion. No se requiere otra llamada OpenAI.'
}

$Metadata.live_state = 'succeeded'
$Metadata.live_succeeded_at = (Get-Date).ToUniversalTime().ToString('o')
$Metadata.audio_path = $WavPath
$Metadata.transcript = $transcript
Save-Metadata -Metadata $Metadata -Path $MetaPath

Write-Host ''
Write-Host '==================================================' -ForegroundColor Green
Write-Host ' SOFIA VOICE V2B - AUDICION LISTA' -ForegroundColor Green
Write-Host '==================================================' -ForegroundColor Green
Write-Host 'Voice ID: GUARDADO EN METADATA' -ForegroundColor Green
Write-Host 'Pitch-shift: NO' -ForegroundColor Green
Write-Host 'Remaster agresivo: NO' -ForegroundColor Green
Write-Host 'WAN: NO' -ForegroundColor Green
Write-Host 'Runway: NO' -ForegroundColor Green
Write-Host 'Fal.ai: NO' -ForegroundColor Green
Write-Host 'Live ceiling: 10s ~= US$0.0084' -ForegroundColor Yellow
Write-Host ('Transcript: ' + $transcript) -ForegroundColor Cyan
Write-Host ('AUDIO: ' + $WavPath) -ForegroundColor Cyan
Write-Host 'SOFIA_V2_REVIEW_REQUIRED=YES' -ForegroundColor Yellow
Write-Host '==================================================' -ForegroundColor Green

Start-Process -FilePath $WavPath
