
param()

$ErrorActionPreference = 'Stop'

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

$source = 'none'
$key = $env:OPENAI_API_KEY

if (-not [string]::IsNullOrWhiteSpace($key)) {
    $source = 'process-env'
}
else {
    $key = Get-DotEnvValue 'OPENAI_API_KEY'
    if (-not [string]::IsNullOrWhiteSpace($key)) {
        $source = '.env.local'
    }
}

Write-Host ''
Write-Host '==================================================' -ForegroundColor Cyan
Write-Host ' SOFIA V2B — AUTH LOCAL AUDIT' -ForegroundColor Cyan
Write-Host ' CERO RED | CERO API | CERO GASTO' -ForegroundColor Cyan
Write-Host '==================================================' -ForegroundColor Cyan

if ([string]::IsNullOrWhiteSpace($key)) {
    Write-Host 'OPENAI_API_KEY presente: NO' -ForegroundColor Red
    Write-Host 'AUTH_LOCAL_RESULT=MISSING_KEY' -ForegroundColor Red
    exit 2
}

$trimmed = $key.Trim()
$hasWhitespace = $trimmed -match '\s'
$prefix = 'other'

if ($trimmed.StartsWith('sk-proj-')) {
    $prefix = 'sk-proj'
}
elseif ($trimmed.StartsWith('sk-')) {
    $prefix = 'sk'
}

$placeholder = $trimmed -match '^(your|replace|changeme|dummy|test|redacted|none|null)' -or $trimmed.Length -lt 20

Write-Host ('Fuente: ' + $source) -ForegroundColor Green
Write-Host ('Longitud: ' + $trimmed.Length) -ForegroundColor Green
Write-Host ('Familia de prefijo: ' + $prefix) -ForegroundColor Cyan
Write-Host ('Espacios internos: ' + $(if ($hasWhitespace) { 'SI' } else { 'NO' })) -ForegroundColor $(if ($hasWhitespace) { 'Red' } else { 'Green' })
Write-Host ('Parece placeholder/invalida: ' + $(if ($placeholder) { 'SI' } else { 'NO' })) -ForegroundColor $(if ($placeholder) { 'Red' } else { 'Green' })

if ($prefix -eq 'sk-proj') {
    Write-Host 'Project-scoped por prefijo: PROBABLE' -ForegroundColor Green
}
else {
    Write-Host 'Project-scoped por prefijo: NO CONFIRMADO' -ForegroundColor Yellow
}

Write-Host ''
Write-Host 'Este diagnostico NO puede confirmar permisos api.voices.write/read ni elegibilidad de custom voices.' -ForegroundColor Yellow
Write-Host 'Eso debe comprobarse en el proyecto de OpenAI Platform.' -ForegroundColor Yellow
Write-Host 'NETWORK_CALLS=NO' -ForegroundColor Green
Write-Host 'COST_USD=0' -ForegroundColor Green
Write-Host '==================================================' -ForegroundColor Cyan
