# DOS TOQUES E01-P02. Preproduction only. All paid generation disabled.
$ErrorActionPreference = 'Stop'

$work = 'C:\Users\martin\Desktop\VSC\BestS\viral-cine-v7-cinema-core'
$integration = 'C:\Users\martin\Desktop\VSC\BestS\viral-cine-v7-integration'
$legacy = 'C:\Users\martin\Desktop\VSC\BestS\viral-cine-ai'
$branch = 'feat/v7-dos-toques-e01-p02-continuity'
$film = 'film-dos-toques-de-bocina-v7'

Write-Host ''
Write-Host '=== DOS TOQUES - PREPARAR TOMA 2 SIN COSTO ===' -ForegroundColor Cyan
foreach ($dir in @($work, $integration, $legacy)) {
  if (-not (Test-Path -LiteralPath $dir -PathType Container)) { throw "Falta carpeta: $dir" }
}
Set-Location $work
$changes = @(git status --porcelain | Where-Object { $_ })
if ($LASTEXITCODE -ne 0) { throw 'No se pudo leer Git.' }
$others = @($changes | Where-Object {
  $_ -notmatch '^\s*M\s+next-env\.d\.ts$' -and
  $_ -notmatch '^\?\?\s+scripts/FINALIZAR-15-DIAS-4MIN-LOCAL\.mjs$'
})
if ($others.Count -gt 0) {
  $others | ForEach-Object { Write-Host $_ -ForegroundColor Yellow }
  throw 'Hay modificaciones locales diferentes del archivo generado. No sobrescribir.'
}
if ($changes | Where-Object { $_ -match '^\s*M\s+next-env\.d\.ts$' }) {
  $backup = Join-Path $env:TEMP ('dos-toques-p02-next-env-' + (Get-Date -Format 'yyyyMMdd-HHmmss') + '.d.ts')
  Copy-Item -LiteralPath 'next-env.d.ts' -Destination $backup
  git stash push -m 'V7 auto next-env antes E01-P02' -- next-env.d.ts
  if ($LASTEXITCODE -ne 0) { throw 'No se pudo proteger next-env.d.ts.' }
  Write-Host "BACKUP_NEXT=$backup"
}

git fetch origin $branch
if ($LASTEXITCODE -ne 0) { throw 'No se pudo obtener la rama E01-P02.' }
git switch --detach ('origin/' + $branch)
if ($LASTEXITCODE -ne 0) { throw 'No se pudo activar el codigo E01-P02.' }
Write-Host "COMMIT=$(git rev-parse --short HEAD)" -ForegroundColor Green

$env:VIRALCINE_DATA_DIR = Join-Path $integration '.data'
$env:VIRALCINE_V6_DATA_DIR = Join-Path $legacy '.data'
if (-not (Test-Path $env:VIRALCINE_DATA_DIR)) { throw 'No existe la carpeta .data de V7.' }

# No provider calls or additional payments are authorized for E01-P02.
$env:PRODUCTION_MODE = 'demo'
$env:V7_DOS_TOQUES_P01_PAID_ENABLED = 'false'
$env:V7_CINEMA_PAID_ENABLED = 'false'
$env:ALLOW_EXTERNAL_API_CALLS = 'false'
$env:ALLOW_PAID_GENERATION = 'false'
$env:V7_CINEMA_MAX_USD = '0'
$env:V7_CINEMA_ADMIN_TOKEN = [guid]::NewGuid().ToString('N') + [guid]::NewGuid().ToString('N')

Write-Host ''
Write-Host 'GASTOS_P02_AUTORIZADOS=0' -ForegroundColor Green
Write-Host 'GENERACIONES_VEO=DESHABILITADAS' -ForegroundColor Green
Write-Host 'P01_ORIGINAL_Y_APROBACION=SOLO_LECTURA'
Write-Host 'TOKEN ADMINISTRATIVO PARA EXTRAER FOTOGRAMA (NO COMPARTIR):' -ForegroundColor Yellow
Write-Host $env:V7_CINEMA_ADMIN_TOKEN -ForegroundColor Magenta

$url = "http://localhost:3010/v7/films/$film" + '?tab=scene01'
Write-Host "ABRIR: $url"
Start-Process $url
Write-Host 'Busca Siguiente toma E01-P02 y pulsa Preparar continuidad Sin costo.'
npm run dev -- -p 3010
