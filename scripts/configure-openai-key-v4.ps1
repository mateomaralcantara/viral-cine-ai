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

$Key = Read-SecretPlainText 'Pega la NUEVA OPENAI_API_KEY'
Set-EnvValue 'OPENAI_API_KEY' $Key
$Key = $null

$Text = Get-Content -LiteralPath $EnvPath -Raw
$Ok = $Text -match '(?m)^OPENAI_API_KEY=\S{20,}$'
if (!$Ok) {
    throw 'OPENAI_API_KEY no quedó guardada con un formato utilizable.'
}

Write-Host 'OPENAI_API_KEY: ACTUALIZADA' -ForegroundColor Green
Write-Host 'No se modificó project.json. No se llamó ninguna API.' -ForegroundColor Green
