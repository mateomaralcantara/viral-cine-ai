param(
    [Parameter(Mandatory=$true)]
    [string]$ProjectId
)

$ErrorActionPreference = 'Stop'
$Repo = (Get-Location).Path
$EnvFile = Join-Path $Repo '.env.local'
$BaseDir = Join-Path $Repo ('.data\projects\' + $ProjectId + '\audio\scene6-v6\sofia-v3\design')
$AttemptPath = Join-Path $BaseDir 'sofia-v3-design-attempt.json'
$ReportPath = Join-Path $BaseDir 'sofia-v3-usage-audit.json'

if (-not (Test-Path $EnvFile)) { throw '.env.local no existe.' }
if (-not (Test-Path $AttemptPath)) { throw 'No existe el intento Sofia V3.' }

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

$ApiKey = Get-DotEnvValue 'ELEVENLABS_API_KEY'
if ([string]::IsNullOrWhiteSpace($ApiKey)) { throw 'ELEVENLABS_API_KEY no disponible.' }
$ApiKey = $ApiKey.Trim()
$attempt = Get-Content $AttemptPath -Raw | ConvertFrom-Json
$started = [DateTimeOffset]::Parse([string]$attempt.started_at)
$startMs = $started.AddMinutes(-2).ToUnixTimeMilliseconds()
$endMs = $started.AddMinutes(3).ToUnixTimeMilliseconds()

$headers = @{ 'xi-api-key' = $ApiKey }

Write-Host ''
Write-Host '==================================================' -ForegroundColor Cyan
Write-Host ' SOFIA V3 — ELEVENLABS USAGE AUDIT' -ForegroundColor Cyan
Write-Host ' READ-ONLY | NO GENERATION | NO RETRY' -ForegroundColor Cyan
Write-Host '==================================================' -ForegroundColor Cyan

$subscription = Invoke-RestMethod -Uri 'https://api.elevenlabs.io/v1/user/subscription' -Method Get -Headers $headers

$body = [ordered]@{
    start_time = $startMs
    end_time = $endMs
    interval_seconds = 60
    group_by = @('product_type')
    time_zone = 'UTC'
} | ConvertTo-Json -Depth 6

$analyticsStatus = 200
$analytics = $null
$analyticsError = $null
try {
    $analytics = Invoke-RestMethod -Uri 'https://api.elevenlabs.io/v1/workspace/analytics/query/usage-by-product-over-time' -Method Post -Headers $headers -ContentType 'application/json' -Body $body
}
catch {
    try { $analyticsStatus = [int]$_.Exception.Response.StatusCode } catch { $analyticsStatus = -1 }
    try { $analyticsError = [string]$_.ErrorDetails.Message } catch {}
}

$report = [ordered]@{
    audited_at = (Get-Date).ToUniversalTime().ToString('o')
    project_id = $ProjectId
    attempt_started_at = [string]$attempt.started_at
    attempt_http_status = $attempt.http_status
    attempt_state = $attempt.state
    credits_risk_max = 104
    subscription_character_count = $subscription.character_count
    subscription_character_limit = $subscription.character_limit
    analytics_http_status = $analyticsStatus
    analytics = $analytics
    analytics_error = $analyticsError
    generation_executed = $false
    retry_executed = $false
}

$report | ConvertTo-Json -Depth 12 | Set-Content -Path $ReportPath -Encoding UTF8

Write-Host ('Subscription character_count: ' + $subscription.character_count) -ForegroundColor Cyan
Write-Host ('Subscription character_limit: ' + $subscription.character_limit) -ForegroundColor Cyan
Write-Host ('Analytics HTTP: ' + $analyticsStatus) -ForegroundColor Cyan

if ($analytics) {
    Write-Host 'Analytics columns:' -ForegroundColor Green
    Write-Host (($analytics.columns | ForEach-Object { [string]$_ }) -join ' | ') -ForegroundColor Green
    Write-Host 'Analytics rows:' -ForegroundColor Green
    foreach ($row in @($analytics.rows)) {
        Write-Host (($row | ForEach-Object { [string]$_ }) -join ' | ') -ForegroundColor Green
    }
}
else {
    Write-Host ('Analytics no disponible: ' + $analyticsError) -ForegroundColor Yellow
}

Write-Host ('Reporte: ' + $ReportPath) -ForegroundColor Cyan
Write-Host 'GENERATION_EXECUTED=NO' -ForegroundColor Green
Write-Host 'RETRY_EXECUTED=NO' -ForegroundColor Green
Write-Host '==================================================' -ForegroundColor Cyan
