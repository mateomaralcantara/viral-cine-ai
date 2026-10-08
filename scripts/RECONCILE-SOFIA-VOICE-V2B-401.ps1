
param(
    [Parameter(Mandatory=$true)]
    [string]$ProjectId
)

$ErrorActionPreference = 'Stop'

$Repo = (Get-Location).Path
$BaseDir = Join-Path $Repo ('.data\projects\' + $ProjectId + '\audio\scene6-v6\sofia-v2')
$AttemptPath = Join-Path $BaseDir 'sofia-voice-v2-create-attempt.json'
$MetaPath = Join-Path $BaseDir 'sofia-voice-v2.json'
$AuthBlockPath = Join-Path $BaseDir 'sofia-voice-v2-auth-block.json'

if (-not (Test-Path $BaseDir)) {
    throw 'No existe el directorio Sofia V2.'
}

if (Test-Path $MetaPath) {
    $meta = Get-Content $MetaPath -Raw | ConvertFrom-Json
    if ($meta.voice_id) {
        throw 'Existe voice_id. No se puede reconciliar como 401 no-creado.'
    }
}

if (-not (Test-Path $AttemptPath)) {
    throw 'No existe el intento de creacion pendiente.'
}

$attempt = Get-Content $AttemptPath -Raw | ConvertFrom-Json

if ($attempt.state -ne 'submitted') {
    throw ('Estado inesperado del intento: ' + $attempt.state)
}

$stamp = (Get-Date).ToUniversalTime().ToString('yyyyMMddTHHmmssZ')
$ArchivePath = Join-Path $BaseDir ('sofia-voice-v2-create-attempt-401-' + $stamp + '.json')

$reconciled = [ordered]@{
    state = 'failed-no-charge'
    reason = 'http_401_unauthorized'
    original_started_at = $attempt.started_at
    reconciled_at = (Get-Date).ToUniversalTime().ToString('o')
    voice_created = $false
    live_started = $false
    charged_assumption_usd = 0.0
    retry_allowed = $false
    note = 'Authentication failed before voice creation. Fix project-scoped API access before clearing auth block.'
}

$reconciled | ConvertTo-Json -Depth 6 | Set-Content -Path $ArchivePath -Encoding UTF8
Remove-Item $AttemptPath -Force

[ordered]@{
    blocked = $true
    reason = 'http_401_unauthorized'
    created_at = (Get-Date).ToUniversalTime().ToString('o')
    required_action = 'Use a valid project-scoped OpenAI API key with custom-voice access and api.voices.write/read permissions.'
} | ConvertTo-Json -Depth 5 | Set-Content -Path $AuthBlockPath -Encoding UTF8

Write-Host ''
Write-Host '==================================================' -ForegroundColor Green
Write-Host ' SOFIA V2B — 401 RECONCILIADO' -ForegroundColor Green
Write-Host '==================================================' -ForegroundColor Green
Write-Host 'Voice creada: NO' -ForegroundColor Green
Write-Host 'Live iniciado: NO' -ForegroundColor Green
Write-Host 'Cobro asumido: US$0.00' -ForegroundColor Green
Write-Host 'Retry: BLOQUEADO' -ForegroundColor Yellow
Write-Host ('Archivo reconciliado: ' + $ArchivePath) -ForegroundColor Cyan
Write-Host ('Auth block: ' + $AuthBlockPath) -ForegroundColor Cyan
Write-Host '==================================================' -ForegroundColor Green
