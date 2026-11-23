$ErrorActionPreference = 'Stop'

$ProjectRoot = Split-Path -Parent $PSScriptRoot
Set-Location -LiteralPath $ProjectRoot

$EnvPath = Join-Path $ProjectRoot '.env.local'
$GitIgnorePath = Join-Path $ProjectRoot '.gitignore'

if (!(Test-Path -LiteralPath $GitIgnorePath)) {
    throw '.gitignore no existe.'
}

$Ignored = git check-ignore .env.local 2>$null
if ($LASTEXITCODE -ne 0 -or !$Ignored) {
    throw '.env.local no está ignorado por Git. Configuración cancelada.'
}

if (Test-Path -LiteralPath $EnvPath) {
    $Stamp = Get-Date -Format 'yyyyMMdd-HHmmss'
    $Backup = Join-Path $ProjectRoot ".env.local.backup-openai-$Stamp"
    Copy-Item -LiteralPath $EnvPath -Destination $Backup -Force
    Write-Host "Backup local creado: $Backup" -ForegroundColor DarkGray
} else {
    New-Item -ItemType File -Path $EnvPath -Force | Out-Null
}

function Read-SecretPlainText([string]$Prompt) {
    $Secure = Read-Host $Prompt -AsSecureString
    $Ptr = [Runtime.InteropServices.Marshal]::SecureStringToBSTR($Secure)
    try {
        return [Runtime.InteropServices.Marshal]::PtrToStringBSTR($Ptr)
    }
    finally {
        [Runtime.InteropServices.Marshal]::ZeroFreeBSTR($Ptr)
    }
}

function Set-EnvValue([string]$Name, [string]$Value) {
    if ([string]::IsNullOrWhiteSpace($Value)) {
        throw "$Name quedó vacío. Configuración cancelada."
    }
    $Lines = @(Get-Content -LiteralPath $EnvPath -ErrorAction SilentlyContinue)
    $Pattern = '^' + [regex]::Escape($Name) + '='
    $Replaced = $false
    $Next = foreach ($Line in $Lines) {
        if ($Line -match $Pattern) {
            "$Name=$Value"
            $Replaced = $true
        } else {
            $Line
        }
    }
    if (!$Replaced) {
        $Next += "$Name=$Value"
    }
    Set-Content -LiteralPath $EnvPath -Value $Next -Encoding UTF8
}

Write-Host ''
Write-Host 'ViralCine 4.0 — rotación segura de OPENAI_API_KEY' -ForegroundColor Cyan
Write-Host 'La clave NO se mostrará en pantalla.' -ForegroundColor DarkGray

$Key = (Read-SecretPlainText 'Pega la NUEVA OPENAI_API_KEY').Trim()

if (
    ($Key.StartsWith('"') -and $Key.EndsWith('"')) -or
    ($Key.StartsWith("'") -and $Key.EndsWith("'"))
) {
    $Key = $Key.Substring(1, $Key.Length - 2).Trim()
}

if ($Key.Length -lt 20 -or $Key -match '\s') {
    throw 'La clave pegada no tiene un formato utilizable.'
}

Set-EnvValue 'OPENAI_API_KEY' $Key
$Key = $null

$SavedLine = Get-Content -LiteralPath $EnvPath |
    Where-Object { $_ -match '^OPENAI_API_KEY=' } |
    Select-Object -Last 1

if (!$SavedLine) {
    throw 'OPENAI_API_KEY no quedó guardada.'
}

$SavedValue = ($SavedLine -replace '^OPENAI_API_KEY=', '').Trim()
if (
    ($SavedValue.StartsWith('"') -and $SavedValue.EndsWith('"')) -or
    ($SavedValue.StartsWith("'") -and $SavedValue.EndsWith("'"))
) {
    $SavedValue = $SavedValue.Substring(1, $SavedValue.Length - 2).Trim()
}

if ($SavedValue.Length -lt 20 -or $SavedValue -match '\s') {
    throw 'OPENAI_API_KEY no quedó guardada con un formato utilizable.'
}

$Sha = [System.Security.Cryptography.SHA256]::Create()
try {
    $Bytes = [System.Text.Encoding]::UTF8.GetBytes($SavedValue)
    $Hash = [BitConverter]::ToString($Sha.ComputeHash($Bytes)).Replace('-', '').ToLowerInvariant()
}
finally {
    $Sha.Dispose()
}

Write-Host 'OPENAI_API_KEY: ACTUALIZADA' -ForegroundColor Green
Write-Host "Longitud: $($SavedValue.Length) | Huella: $($Hash.Substring(0, 12))" -ForegroundColor DarkGray
Write-Host 'No se modificó project.json. No se llamó ninguna API.' -ForegroundColor Green
