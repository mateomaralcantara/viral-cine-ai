# ViralCine V7 — Inicio de consola E01; SIN envíos automáticos de pago.
# Debe ejecutarse desde el workspace después de seleccionar el commit validado.
$ErrorActionPreference = 'Stop'
$root = Split-Path -Parent $PSScriptRoot
Set-Location $root
$expectedFilm = 'film-dos-toques-de-bocina-v7'
Write-Host "`n=== VIRALCINE V7 · ESCENA 01 · CONSOLA DE SIETE TOMAS ===" -ForegroundColor Cyan
$port = Get-NetTCPConnection -LocalPort 3010 -State Listen -ErrorAction SilentlyContinue
if ($port) { throw 'Puerto 3010 ocupado. Deten el servidor Next anterior con Ctrl+C.' }
$integration = 'C:\Users\martin\Desktop\VSC\BestS\viral-cine-v7-integration'
$v6 = 'C:\Users\martin\Desktop\VSC\BestS\viral-cine-ai'
$env:VIRALCINE_DATA_DIR = Join-Path $integration '.data'
$env:VIRALCINE_V6_DATA_DIR = Join-Path $v6 '.data'
if (-not (Test-Path -LiteralPath $env:VIRALCINE_DATA_DIR)) {
  throw 'No existe el directorio de datos V7; los videos originales no se modifican.'
}
if (-not $env:GEMINI_API_KEY) {
  foreach ($file in @(
    (Join-Path $root '.env.local'),
    (Join-Path $integration '.env.local'),
    (Join-Path $v6 '.env.local')
  )) {
    if (!(Test-Path -LiteralPath $file)) { continue }
    $line = Get-Content -LiteralPath $file | Where-Object {
      $_ -match '^\s*GEMINI_API_KEY\s*='
    } | Select-Object -Last 1
    if ($line) {
      $env:GEMINI_API_KEY = $line.Substring($line.IndexOf('=')+1).Trim().Trim([char]34,[char]39)
      break
    }
  }
}
# Global provider switches remain disabled; ONLY per-shot E01 route may submit
# after explicit auth, a per-shot paid confirmation, and an immutable reservation.
$env:PRODUCTION_MODE = 'real'
$env:V7_DOS_TOQUES_P01_PAID_ENABLED = 'false'
$env:V7_DOS_TOQUES_P02_PAID_ENABLED = 'false'
$env:V7_CINEMA_PAID_ENABLED = 'false'
$env:ALLOW_PAID_GENERATION = 'false'
$env:ALLOW_EXTERNAL_API_CALLS = 'false'
$env:V7_SCENE01_PAID_ENABLED = 'true'
$env:V7_SCENE01_RATE_USD_PER_SECOND = '0.10'
$env:V7_SCENE01_PER_SHOT_CAP_USD = '0.80'
$env:V7_SCENE01_TOTAL_CAP_USD = '5.60'
if (-not $env:V7_CINEMA_ADMIN_TOKEN -or $env:V7_CINEMA_ADMIN_TOKEN.Length -lt 24) {
  $env:V7_CINEMA_ADMIN_TOKEN = [guid]::NewGuid().ToString('N') + [guid]::NewGuid().ToString('N')
}
$env:V7_CINEMA_ADMIN_TOKEN | Set-Clipboard
Write-Host 'Token administrativo nuevo copiado al portapapeles. NO lo compartas.' -ForegroundColor Green
Write-Host 'P01 y P02: existentes, no regenerables desde esta consola.' -ForegroundColor Green
Write-Host 'P03-P07: una autorizacion para nuevos envios. P01/P02 conservadas.' -ForegroundColor Green
Write-Host 'Limite acumulado, incluidos dos intentos previos: USD 5.60. Autorizacion adicional maxima: USD 4.00.' -ForegroundColor Yellow
if (-not $env:GEMINI_API_KEY) {
  Write-Host 'AVISO: GEMINI_API_KEY no encontrada; solo preflight/consulta hasta configurarla.' -ForegroundColor Yellow
}
$url = "http://localhost:3010/v7/films/$expectedFilm" + "?tab=scene01"
Write-Host "Panel: $url" -ForegroundColor Cyan
Write-Host 'Cuando Next muestre Ready, abre el panel y presiona Ctrl+F5.' -ForegroundColor Cyan
npm run dev -- -p 3010
