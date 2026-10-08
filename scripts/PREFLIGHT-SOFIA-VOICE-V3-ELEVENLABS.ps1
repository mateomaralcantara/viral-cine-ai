
param(
    [Parameter(Mandatory=$true)]
    [string]$ProjectId
)

$ErrorActionPreference = 'Stop'

$Repo = (Get-Location).Path
$EnvFile = Join-Path $Repo '.env.local'

if (-not (Test-Path $EnvFile)) {
    throw '.env.local no existe.'
}

function Get-DotEnvValue {
    param([string]$Name)

    $value = $null
    $pattern = '^\\s*' + [regex]::Escape($Name) + '\\s*=\\s*(.*)\\s*$'

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

$external = Get-DotEnvValue 'ALLOW_EXTERNAL_API_CALLS'
$paid = Get-DotEnvValue 'ALLOW_PAID_GENERATION'
$fallback = Get-DotEnvValue 'ALLOW_PAID_PROVIDER_FALLBACK'

if ($external -ne 'false' -or $paid -ne 'false' -or $fallback -ne 'false') {
    throw 'SAFE LOCK NO ESTA ACTIVO.'
}

$ApiKey = Get-DotEnvValue 'ELEVENLABS_API_KEY'

if ([string]::IsNullOrWhiteSpace($ApiKey)) {
    throw 'ELEVENLABS_API_KEY no existe o esta vacia en .env.local.'
}

$ApiKey = $ApiKey.Trim()

$OutDir = Join-Path $Repo ('.data\\projects\\' + $ProjectId + '\\audio\\scene6-v6\\sofia-v3')
New-Item -ItemType Directory -Force -Path $OutDir | Out-Null

$ReportPath = Join-Path $OutDir 'elevenlabs-preflight.json'

Write-Host ''
Write-Host '==================================================' -ForegroundColor Cyan
Write-Host ' SOFIA VOICE V3 - ELEVENLABS PREFLIGHT' -ForegroundColor Cyan
Write-Host ' READ-ONLY | NO VOICE DESIGN | NO TTS' -ForegroundColor Cyan
Write-Host '==================================================' -ForegroundColor Cyan
Write-Host 'Key source: .env.local' -ForegroundColor Green
Write-Host ('Key length: ' + $ApiKey.Length) -ForegroundColor Green
Write-Host 'La clave completa NO se mostrara.' -ForegroundColor Green
Write-Host ''

$status = $null
$voiceCount = $null

try {
    $response = Invoke-WebRequest -Uri 'https://api.elevenlabs.io/v2/voices?page_size=1&include_total_count=false' -Method Get -Headers @{ 'xi-api-key' = $ApiKey } -UseBasicParsing
    $status = [int]$response.StatusCode

    try {
        $payload = $response.Content | ConvertFrom-Json
        if ($payload.voices) {
            $voiceCount = @($payload.voices).Count
        }
    }
    catch {}
}
catch {
    try {
        $status = [int]$_.Exception.Response.StatusCode
    }
    catch {
        $status = -1
    }
}

$result = 'UNKNOWN'

switch ($status) {
    200 {
        $result = 'PASS'
        Write-Host 'ELEVENLABS_AUTH=PASS' -ForegroundColor Green
        Write-Host 'La clave autentica correctamente contra /v2/voices.' -ForegroundColor Green
        Write-Host 'Voice Design ejecutado: NO' -ForegroundColor Green
        Write-Host 'TTS ejecutado: NO' -ForegroundColor Green
    }
    401 {
        $result = 'INVALID_KEY'
        Write-Host 'ELEVENLABS_AUTH=401_INVALID_KEY' -ForegroundColor Red
    }
    403 {
        $result = 'PERMISSION_DENIED'
        Write-Host 'ELEVENLABS_AUTH=403_PERMISSION_DENIED' -ForegroundColor Yellow
    }
    default {
        Write-Host ('ELEVENLABS_AUTH=HTTP_' + $status) -ForegroundColor Yellow
    }
}

$report = [ordered]@{
    checked_at = (Get-Date).ToUniversalTime().ToString('o')
    project_id = $ProjectId
    key_source = '.env.local'
    http_status = $status
    result = $result
    voices_returned = $voiceCount
    voice_design_executed = $false
    tts_executed = $false
    video_executed = $false
    external_endpoint = 'GET https://api.elevenlabs.io/v2/voices?page_size=1&include_total_count=false'
    generation_cost_assumption_usd = 0.0
}

$report | ConvertTo-Json -Depth 6 | Set-Content -Path $ReportPath -Encoding UTF8

Write-Host ''
Write-Host ('HTTP STATUS: ' + $status) -ForegroundColor Cyan
Write-Host ('RESULTADO: ' + $result) -ForegroundColor Cyan
Write-Host ('Reporte: ' + $ReportPath) -ForegroundColor Cyan
Write-Host 'GENERACION_EJECUTADA=NO' -ForegroundColor Green
Write-Host 'COSTO_GENERACION_USD=0' -ForegroundColor Green
Write-Host '==================================================' -ForegroundColor Cyan

if ($status -ne 200) {
    exit 2
}
