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
# Cargar secreto Runway solo en memoria; nunca mostrarlo ni copiarlo.
if (-not $env:RUNWAYML_API_SECRET) {
  foreach ($file in @(
    (Join-Path $root '.env.local'),
    (Join-Path $integration '.env.local'),
    (Join-Path $v6 '.env.local')
  )) {
    if (!(Test-Path -LiteralPath $file)) { continue }
    $line = Get-Content -LiteralPath $file |
      Where-Object { $_ -match '^\s*RUNWAYML_API_SECRET\s*=' } |
      Select-Object -Last 1
    if ($line) {
      $env:RUNWAYML_API_SECRET = $line.Substring($line.IndexOf('=')+1).Trim().Trim([char]34,[char]39)
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
# Runway es el proveedor visual principal.
# La variable por si sola NO gasta; cada lote exige checkbox y confirmacion del usuario.
$env:V7_RUNWAY_E01_ENABLED = 'true'
$env:V7_RUNWAY_E02_ENABLED = 'true'
$env:V7_SCENE01_PAID_ENABLED = 'false'
$env:V7_SCENE01_RATE_USD_PER_SECOND = '0.10'
$env:V7_SCENE01_PER_SHOT_CAP_USD = '0.80'
$env:V7_SCENE01_TOTAL_CAP_USD = '5.60'
$tokenScript = Join-Path $PSScriptRoot 'V7-ADMIN-TOKEN.ps1'
if (!(Test-Path -LiteralPath $tokenScript)) { throw 'No se encontro el gestor de token persistente.' }
$env:V7_CINEMA_ADMIN_TOKEN = (& $tokenScript -Mode Get).Trim()
# Código independiente de un solo uso; NO es la clave administrativa.
$env:V7_STUDIO_PAIR_CODE = [guid]::NewGuid().ToString('N') + [guid]::NewGuid().ToString('N')
Write-Host "`nTOKEN ADMINISTRATIVO GENERADO Y GUARDADO CIFRADO" -ForegroundColor Green
Write-Host "El navegador se conectará automáticamente: no hay que pegar credenciales." -ForegroundColor Green
Write-Host "Para recuperar manualmente el token: .\scripts\V7-ADMIN-TOKEN.ps1 -Mode Show" -ForegroundColor DarkGray
Write-Host 'Runway Gen-4 Turbo: PROVEEDOR PRINCIPAL (10 s a 0.50 USD estimados).' -ForegroundColor Green
Write-Host 'Escena 02: 7 tomas, 55 s de corte, presupuesto nuevo hasta USD 3.50.' -ForegroundColor Green
Write-Host 'Cinco tomas nuevas: autorizacion maxima de USD 2.50, no automatica.' -ForegroundColor Yellow
if (-not $env:RUNWAYML_API_SECRET) {
  Write-Host 'RUNWAYML_API_SECRET no encontrado. Generacion Runway deshabilitada hasta configurarlo.' -ForegroundColor Yellow
}
Write-Host 'P01 y P02: existentes, no regenerables desde esta consola.' -ForegroundColor Green
Write-Host 'P03-P07: una autorizacion para nuevos envios. P01/P02 conservadas.' -ForegroundColor Green
Write-Host 'Veo: envios pagados deshabilitados. Runway es el proveedor principal.' -ForegroundColor Yellow
if (-not $env:GEMINI_API_KEY) {
  Write-Host 'AVISO: GEMINI_API_KEY no encontrada; solo preflight/consulta hasta configurarla.' -ForegroundColor Yellow
}
$url = "http://127.0.0.1:3010/v7/films/$expectedFilm" + "?tab=scene02"
$pairedUrl = $url + "#studio-pair=" + $env:V7_STUDIO_PAIR_CODE
Write-Host "Panel Escena 02: $url" -ForegroundColor Cyan
Read-Host "PRESIONA ENTER: levantar servidor y conectar token automaticamente" | Out-Null
# Un trabajo local espera a que Next esté listo y abre el navegador con
# un código de emparejamiento de un solo uso, distinto al token cifrado.
Start-Job -Name "V7-LocalPair" -ArgumentList $pairedUrl -ScriptBlock {
 param($link)
 for($i=0;$i -lt 60;$i++){
  try {
   $probe=Invoke-WebRequest -Uri "http://127.0.0.1:3010/" -UseBasicParsing -TimeoutSec 2
   if($probe.StatusCode -ge 200){
    Start-Process $link
    return
   }
  } catch {}
  Start-Sleep -Seconds 2
 }
} | Out-Null
# Fundamental: no publicar el token ni el estudio por la IP de red.
npm run dev -- -p 3010 -H 127.0.0.1
