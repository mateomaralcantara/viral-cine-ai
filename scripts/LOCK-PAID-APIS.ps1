$ErrorActionPreference = "Stop"

Set-Location (Split-Path -Parent $PSScriptRoot)

if (Test-Path ".env.local") {
    $envFile = (Resolve-Path ".env.local").Path
}
elseif (Test-Path ".env") {
    $envFile = (Resolve-Path ".env").Path
}
else {
    $envFile = Join-Path (Get-Location) ".env.local"
    New-Item -ItemType File -Path $envFile -Force | Out-Null
}

$stamp = Get-Date -Format "yyyyMMdd-HHmmss"
$backup = "$envFile.safe-lock-$stamp.bak"
Copy-Item $envFile $backup -Force

$desired = [ordered]@{
    "ALLOW_EXTERNAL_API_CALLS"      = "false"
    "ALLOW_PAID_GENERATION"         = "false"
    "ALLOW_PAID_PROVIDER_FALLBACK" = "false"
    "STRICT_SCENE_QUALITY"          = "false"
    "SAFE_MAX_SINGLE_CALL_USD"        = "0.50"
}

$lines = @(Get-Content $envFile)
$result = New-Object System.Collections.Generic.List[string]
$seen = @{}

foreach ($line in $lines) {
    $matched = $false
    foreach ($key in $desired.Keys) {
        if ($line -match ("^\s*(?:export\s+)?" + [regex]::Escape($key) + "=")) {
            if (-not $seen.ContainsKey($key)) {
                $result.Add("$key=$($desired[$key])")
                $seen[$key] = $true
            }
            $matched = $true
            break
        }
    }
    if (-not $matched) {
        $result.Add($line)
    }
}

foreach ($key in $desired.Keys) {
    if (-not $seen.ContainsKey($key)) {
        $result.Add("$key=$($desired[$key])")
    }
}

$result | Set-Content -Path $envFile -Encoding UTF8

Write-Host ""
Write-Host "=== VIRALCINE 6 SAFE LOCK ===" -ForegroundColor Cyan
Write-Host "Archivo: $envFile"
Write-Host "Backup:  $backup"
Write-Host ""
Write-Host "ALLOW_EXTERNAL_API_CALLS=false" -ForegroundColor Green
Write-Host "ALLOW_PAID_GENERATION=false" -ForegroundColor Green
Write-Host "ALLOW_PAID_PROVIDER_FALLBACK=false" -ForegroundColor Green
Write-Host "STRICT_SCENE_QUALITY=false" -ForegroundColor Green
Write-Host "SAFE_MAX_SINGLE_CALL_USD=0.50" -ForegroundColor Green
Write-Host ""
Write-Host "Todas las llamadas pagadas quedan bloqueadas hasta autorización explícita." -ForegroundColor Yellow
