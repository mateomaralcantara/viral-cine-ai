param(
    [Parameter(Mandatory=$true)]
    [string]$ProjectId
)

$ErrorActionPreference = 'Stop'
$Repo = (Get-Location).Path
$BaseDir = Join-Path $Repo ('.data\projects\' + $ProjectId + '\audio\scene6-v6\sofia-v3\design')
$AttemptPath = Join-Path $BaseDir 'sofia-v3-design-attempt.json'

if (-not (Test-Path $AttemptPath)) { throw 'No existe sofia-v3-design-attempt.json.' }

$attempt = Get-Content $AttemptPath -Raw | ConvertFrom-Json

if ($attempt.http_status -ne 400) {
    throw ('Este reconciliador solo aplica a HTTP 400. Actual: ' + $attempt.http_status)
}

if ($attempt.state -notin @('failed-no-charge-assumed','failed-unknown')) {
    throw ('Estado no reconciliable: ' + $attempt.state)
}

$attempt.state = 'failed-unknown'
$attempt.retry_allowed = $false

$attempt | Add-Member -NotePropertyName 'credits_risk_max' -NotePropertyValue 104 -Force
$attempt | Add-Member -NotePropertyName 'voice_previews_confirmed' -NotePropertyValue 0 -Force
$attempt | Add-Member -NotePropertyName 'reconciled_at' -NotePropertyValue ((Get-Date).ToUniversalTime().ToString('o')) -Force
$attempt | Add-Member -NotePropertyName 'reconciliation_note' -NotePropertyValue 'HTTP 400 occurred after POST. No previews confirmed. Treat up to 104 credits as at risk until usage analytics confirms otherwise.' -Force

$attempt | ConvertTo-Json -Depth 8 | Set-Content -Path $AttemptPath -Encoding UTF8

Write-Host ''
Write-Host '==================================================' -ForegroundColor Yellow
Write-Host ' SOFIA V3 — HTTP 400 RECONCILIADO' -ForegroundColor Yellow
Write-Host '==================================================' -ForegroundColor Yellow
Write-Host 'Estado: failed-unknown' -ForegroundColor Yellow
Write-Host 'Previews confirmadas: 0' -ForegroundColor Green
Write-Host 'Retry: BLOQUEADO' -ForegroundColor Green
Write-Host 'Riesgo maximo pendiente: 104 creditos' -ForegroundColor Yellow
Write-Host 'Nueva generacion: NO' -ForegroundColor Green
Write-Host '==================================================' -ForegroundColor Yellow
