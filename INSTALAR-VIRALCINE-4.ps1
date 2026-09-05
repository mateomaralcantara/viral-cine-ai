param(
  [string]$ProjectRoot = (Get-Location).Path,
  [switch]$SkipInstall,
  [switch]$SkipMigration,
  [switch]$SkipVerify
)

$ErrorActionPreference = 'Stop'
Set-StrictMode -Version Latest

function Write-Step([string]$Text) {
  Write-Host "`n=== $Text ===" -ForegroundColor Cyan
}

function Require-Command([string]$Name) {
  $cmd = Get-Command $Name -ErrorAction SilentlyContinue
  if (-not $cmd) { throw "Falta '$Name' en PATH." }
  return $cmd
}

function Get-EnvLines([string]$Path) {
  if (Test-Path -LiteralPath $Path) { return @(Get-Content -LiteralPath $Path) }
  return @()
}

function Set-EnvValue([System.Collections.Generic.List[string]]$Lines, [string]$Name, [string]$Value) {
  $pattern = '^\s*' + [regex]::Escape($Name) + '\s*='
  for ($i = 0; $i -lt $Lines.Count; $i++) {
    if ($Lines[$i] -match $pattern) {
      $Lines[$i] = "$Name=$Value"
      return
    }
  }
  $Lines.Add("$Name=$Value")
}

$ProjectRoot = (Resolve-Path -LiteralPath $ProjectRoot).Path
Set-Location -LiteralPath $ProjectRoot

Write-Step 'VERIFICANDO REPOSITORIO'
Require-Command git | Out-Null
Require-Command node | Out-Null
Require-Command npm | Out-Null
Require-Command ffmpeg | Out-Null
Require-Command ffprobe | Out-Null

if (-not (Test-Path -LiteralPath (Join-Path $ProjectRoot '.git'))) {
  throw "La carpeta no es un repositorio Git: $ProjectRoot"
}

$branch = (git branch --show-current).Trim()
if ($LASTEXITCODE -ne 0) { throw 'No fue posible determinar la rama Git.' }
if ($branch -ne 'feat/viralcine-4-real-cinema') {
  throw "Rama incorrecta: '$branch'. Cambia primero a feat/viralcine-4-real-cinema."
}

$dirty = git status --porcelain
if ($LASTEXITCODE -ne 0) { throw 'No fue posible leer git status.' }
if ($dirty) {
  throw "Hay cambios locales sin guardar. Haz commit o git stash antes de instalar ViralCine 4.0."
}

Write-Host "Rama: $branch" -ForegroundColor Green
Write-Host "Node: $(node --version)"
Write-Host "npm:  $(npm --version)"
Write-Host "FFmpeg: OK"

Write-Step 'RESPALDANDO CONFIGURACION LOCAL'
$timestamp = Get-Date -Format 'yyyyMMdd-HHmmss'
$localBackupRoot = Join-Path $ProjectRoot "backups\install-v4-$timestamp"
New-Item -ItemType Directory -Force -Path $localBackupRoot | Out-Null

$envLocal = Join-Path $ProjectRoot '.env.local'
$envExample = Join-Path $ProjectRoot '.env.example'
if (Test-Path -LiteralPath $envLocal) {
  Copy-Item -LiteralPath $envLocal -Destination (Join-Path $localBackupRoot '.env.local') -Force
} elseif (Test-Path -LiteralPath $envExample) {
  Copy-Item -LiteralPath $envExample -Destination $envLocal -Force
}

if (-not (Test-Path -LiteralPath $envLocal)) {
  throw 'No existe .env.local ni .env.example.'
}

# Instalacion siempre comienza en modo offline seguro. Las claves existentes se conservan.
$envLines = [System.Collections.Generic.List[string]]::new()
foreach ($line in (Get-EnvLines $envLocal)) { $envLines.Add([string]$line) }
Set-EnvValue $envLines 'PRODUCTION_MODE' 'demo'
Set-EnvValue $envLines 'REAL_CINEMA_PIPELINE' 'true'
Set-EnvValue $envLines 'ALLOW_EXTERNAL_API_CALLS' 'false'
Set-EnvValue $envLines 'ALLOW_PAID_GENERATION' 'false'
Set-EnvValue $envLines 'ALLOW_PAID_PROVIDER_FALLBACK' 'false'
Set-EnvValue $envLines 'AUTO_REGENERATE' 'false'
Set-EnvValue $envLines 'PILOT_MODE' 'true'
Set-EnvValue $envLines 'PILOT_MAX_SCENES' '1'
Set-EnvValue $envLines 'PILOT_MAX_SHOTS' '4'
Set-EnvValue $envLines 'PILOT_MAX_SPEND_USD' '1.00'
Set-EnvValue $envLines 'FAKE_PROVIDER_SCENARIO' 'success'
Set-EnvValue $envLines 'FAKE_PROVIDER_STAGE' ''
Set-Content -LiteralPath $envLocal -Value $envLines -Encoding utf8
Write-Host 'Entorno forzado a OFFLINE SEGURO. Las claves existentes no fueron borradas.' -ForegroundColor Green

if (-not $SkipInstall) {
  Write-Step 'INSTALANDO DEPENDENCIAS'
  npm ci
  if ($LASTEXITCODE -ne 0) { throw 'npm ci fallo.' }
}

if (-not $SkipVerify) {
  Write-Step 'VALIDANDO TYPESCRIPT Y TESTS'
  npm run verify:4
  if ($LASTEXITCODE -ne 0) { throw 'La validacion 4.0 fallo. No habilites proveedores pagados.' }
}

if (-not $SkipMigration) {
  Write-Step 'MIGRANDO METADATOS 3.3 A 4.0'
  npm run migrate:4
  if ($LASTEXITCODE -ne 0) { throw 'La migracion 4.0 fallo. Revisa el backup antes de continuar.' }
}

Write-Step 'INSTALACION COMPLETADA EN MODO SEGURO'
Write-Host "Backup de .env.local: $localBackupRoot" -ForegroundColor Yellow
Write-Host 'main no fue modificada por este instalador.'
Write-Host 'Los videos, audios, imagenes y exports existentes no se regeneraron.'
Write-Host ''
Write-Host 'Siguiente arranque local:' -ForegroundColor Cyan
Write-Host '  npm run studio'
Write-Host ''
Write-Host 'Antes de cualquier piloto real:' -ForegroundColor Yellow
Write-Host '  1) asigna voiceId a cada personaje;'
Write-Host '  2) confirma ELEVENLABS_API_KEY, GEMINI_API_KEY/FAL_KEY;'
Write-Host '  3) deja PILOT_MODE=true;'
Write-Host '  4) solo entonces habilita ALLOW_EXTERNAL_API_CALLS=true y ALLOW_PAID_GENERATION=true.'
