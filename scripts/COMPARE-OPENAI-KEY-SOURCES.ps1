
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

function Get-Fingerprint {
    param([string]$Value)

    if ([string]::IsNullOrWhiteSpace($Value)) {
        return $null
    }

    $bytes = [System.Text.Encoding]::UTF8.GetBytes($Value.Trim())
    $sha = [System.Security.Cryptography.SHA256]::Create()

    try {
        $hash = $sha.ComputeHash($bytes)
    }
    finally {
        $sha.Dispose()
    }

    return ([BitConverter]::ToString($hash).Replace('-', '').Substring(0, 12))
}

function Get-KeyFamily {
    param([string]$Value)

    if ([string]::IsNullOrWhiteSpace($Value)) {
        return 'missing'
    }

    $trimmed = $Value.Trim()

    if ($trimmed.StartsWith('sk-proj-')) {
        return 'sk-proj'
    }

    if ($trimmed.StartsWith('sk-')) {
        return 'sk'
    }

    return 'other'
}

$processKey = $env:OPENAI_API_KEY
$fileKey = Get-DotEnvValue 'OPENAI_API_KEY'

$processFingerprint = Get-Fingerprint $processKey
$fileFingerprint = Get-Fingerprint $fileKey

$processLength = if ($processKey) { $processKey.Trim().Length } else { 0 }
$fileLength = if ($fileKey) { $fileKey.Trim().Length } else { 0 }

$same = $false
if (
    -not [string]::IsNullOrWhiteSpace($processKey) -and
    -not [string]::IsNullOrWhiteSpace($fileKey)
) {
    $same = [System.StringComparer]::Ordinal.Equals(
        $processKey.Trim(),
        $fileKey.Trim()
    )
}

Write-Host ''
Write-Host '==================================================' -ForegroundColor Cyan
Write-Host ' OPENAI KEY SOURCES — LOCAL FINGERPRINT AUDIT' -ForegroundColor Cyan
Write-Host ' CERO RED | CERO API | CERO GASTO' -ForegroundColor Cyan
Write-Host '==================================================' -ForegroundColor Cyan

Write-Host ('Process env presente: ' + $(if ($processKey) { 'SI' } else { 'NO' })) -ForegroundColor Cyan
Write-Host ('Process env familia: ' + (Get-KeyFamily $processKey)) -ForegroundColor Cyan
Write-Host ('Process env longitud: ' + $processLength) -ForegroundColor Cyan
Write-Host ('Process env fingerprint: ' + $(if ($processFingerprint) { $processFingerprint } else { 'N/A' })) -ForegroundColor Cyan

Write-Host ''

Write-Host ('.env.local presente: ' + $(if ($fileKey) { 'SI' } else { 'NO' })) -ForegroundColor Cyan
Write-Host ('.env.local familia: ' + (Get-KeyFamily $fileKey)) -ForegroundColor Cyan
Write-Host ('.env.local longitud: ' + $fileLength) -ForegroundColor Cyan
Write-Host ('.env.local fingerprint: ' + $(if ($fileFingerprint) { $fileFingerprint } else { 'N/A' })) -ForegroundColor Cyan

Write-Host ''

if (-not $processKey -and -not $fileKey) {
    Write-Host 'KEY_SOURCE_RESULT=NO_KEY' -ForegroundColor Red
}
elseif ($processKey -and -not $fileKey) {
    Write-Host 'KEY_SOURCE_RESULT=PROCESS_ONLY' -ForegroundColor Yellow
}
elseif (-not $processKey -and $fileKey) {
    Write-Host 'KEY_SOURCE_RESULT=DOTENV_ONLY' -ForegroundColor Green
}
elseif ($same) {
    Write-Host 'KEY_SOURCE_RESULT=SAME_KEY' -ForegroundColor Green
}
else {
    Write-Host 'KEY_SOURCE_RESULT=DIFFERENT_KEYS' -ForegroundColor Yellow
    Write-Host 'La sesion de PowerShell esta sobreescribiendo la clave de .env.local.' -ForegroundColor Yellow
}

Write-Host ''
Write-Host 'NETWORK_CALLS=NO' -ForegroundColor Green
Write-Host 'COST_USD=0' -ForegroundColor Green
Write-Host '==================================================' -ForegroundColor Cyan
