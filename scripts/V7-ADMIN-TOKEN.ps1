# VIRALCINE V7 - Token administrativo persistente cifrado (Windows DPAPI).
# Uso: .\scripts\V7-ADMIN-TOKEN.ps1 -Mode Show
# No sube secretos a GitHub ni guarda texto plano en el proyecto.
param(
    [ValidateSet("Get","Show")]
    [string]$Mode = "Show"
)
$ErrorActionPreference = "Stop"
if (-not $IsWindows -and $PSVersionTable.PSEdition -eq 'Core') {
    throw "El almacen cifrado de esta version requiere Windows."
}
$directory = Join-Path $env:LOCALAPPDATA "ViralCineV7"
$secretFile = Join-Path $directory "admin-token.dpapi"
New-Item -ItemType Directory -Path $directory -Force | Out-Null

function Unprotect-V7Token([string] $payload) {
    $secure = ConvertTo-SecureString -String $payload.Trim() -ErrorAction Stop
    $pointer = [Runtime.InteropServices.Marshal]::SecureStringToBSTR($secure)
    try {
        return [Runtime.InteropServices.Marshal]::PtrToStringBSTR($pointer)
    }
    finally {
        [Runtime.InteropServices.Marshal]::ZeroFreeBSTR($pointer)
        $secure.Dispose()
    }
}
function Protect-V7Token([string] $plain) {
    $secure = ConvertTo-SecureString -String $plain -AsPlainText -Force
    try {
        $ciphertext = ConvertFrom-SecureString -SecureString $secure
        [System.IO.File]::WriteAllText($secretFile,$ciphertext,[Text.UTF8Encoding]::new($false))
    }
    finally { $secure.Dispose() }
}

# La variable explicita del inicio tiene prioridad; si existe, tambien se
# guarda cifrada para que sobreviva reinicios.
if ($env:V7_CINEMA_ADMIN_TOKEN) {
    $token = $env:V7_CINEMA_ADMIN_TOKEN.Trim()
    if ($token -notmatch '^[a-fA-F0-9]{64}$') {
        throw "V7_CINEMA_ADMIN_TOKEN debe tener 64 caracteres hexadecimales."
    }
    Protect-V7Token $token
}
elseif (Test-Path -LiteralPath $secretFile) {
    $token = Unprotect-V7Token ([System.IO.File]::ReadAllText($secretFile))
    if ($token -notmatch '^[a-fA-F0-9]{64}$') {
        throw "Token local invalido. No se reemplazara automaticamente."
    }
}
else {
    $token = [guid]::NewGuid().ToString("N") + [guid]::NewGuid().ToString("N")
    Protect-V7Token $token
}

if ($Mode -eq "Get") {
    # Una unica salida capturable por el iniciador.
    Write-Output $token
}
else {
    $token | Set-Clipboard
    Write-Host "`n=== TOKEN VIRALCINE V7 ===" -ForegroundColor Cyan
    Write-Host $token -ForegroundColor Yellow
    Write-Host "Token copiado. No lo compartas ni lo subas a GitHub." -ForegroundColor Green
    Write-Host "Se conserva cifrado para los siguientes reinicios." -ForegroundColor Green
}
