# ViralCine V7 - Dos Toques E01 P01
# This script NEVER sends a paid request. Only the user can click Submit in localhost.
$ErrorActionPreference = 'Stop'
$work = 'C:\Users\martin\Desktop\VSC\BestS\viral-cine-v7-cinema-core'
$integration = 'C:\Users\martin\Desktop\VSC\BestS\viral-cine-v7-integration'
$legacy = 'C:\Users\martin\Desktop\VSC\BestS\viral-cine-ai'
$branch = 'feat/v7-dos-toques-p01-artistic-approval'
$filmId = 'film-dos-toques-de-bocina-v7'

Write-Host ''
Write-Host '=== DOS TOQUES - PRIMERA TOMA VEO E01-P01 ===' -ForegroundColor Cyan
foreach ($dir in @($work,$integration,$legacy)) {
  if (-not (Test-Path -LiteralPath $dir -PathType Container)) { throw "No existe: $dir" }
}
Set-Location $work
$changes = @(git status --porcelain | Where-Object { $_ })
if ($LASTEXITCODE -ne 0) { throw 'Error leyendo el estado de Git.' }
$others = @($changes | Where-Object {
  $_ -notmatch '^\s*M\s+next-env\.d\.ts$' -and
  $_ -notmatch '^\?\?\s+scripts/FINALIZAR-15-DIAS-4MIN-LOCAL\.mjs$'
})
if ($others.Count -gt 0) {
  $others | ForEach-Object { Write-Host $_ -ForegroundColor Yellow }
  throw 'Hay cambios locales. No se sobrescriben.'
}
if ($changes | Where-Object { $_ -match '^\s*M\s+next-env\.d\.ts$' }) {
  $backup = Join-Path $env:TEMP ('next-env-dos-toques-' + (Get-Date -Format 'yyyyMMdd-HHmmss') + '.d.ts')
  Copy-Item -LiteralPath 'next-env.d.ts' -Destination $backup
  git stash push -m 'Next automatico antes de E01-P01' -- next-env.d.ts
  if ($LASTEXITCODE -ne 0) { throw 'No se pudo proteger next-env.d.ts.' }
  Write-Host "NEXT_GUARDADO=$backup"
}
Write-Host '[1/4] Descargando codigo, sin tocar datos V6/V7...' -ForegroundColor Yellow
git fetch origin $branch
if ($LASTEXITCODE -ne 0) { throw 'Fallo git fetch.' }
git switch --detach ('origin/' + $branch)
if ($LASTEXITCODE -ne 0) { throw 'No se pudo instalar la rama.' }
Write-Host "COMMIT=$(git rev-parse --short HEAD)"

$env:VIRALCINE_DATA_DIR = Join-Path $integration '.data'
$env:VIRALCINE_V6_DATA_DIR = Join-Path $legacy '.data'
if (-not (Test-Path $env:VIRALCINE_DATA_DIR)) { throw 'No hay carpeta de datos V7.' }

function Read-KeyFromEnvFile([string] $filename, [string] $key) {
  if (-not (Test-Path -LiteralPath $filename -PathType Leaf)) { return '' }
  $result = Get-Content -LiteralPath $filename |
    Where-Object { $_ -match ('^\s*' + [regex]::Escape($key) + '\s*=') } |
    Select-Object -Last 1
  if (-not $result) { return '' }
  return $result.Substring($result.IndexOf('=') + 1).Trim().Trim([char]34, [char]39)
}

Write-Host '[2/4] Comprobando clave local, sin mostrarla...' -ForegroundColor Yellow
if (-not $env:GEMINI_API_KEY) {
  foreach ($p in @((Join-Path $work '.env.local'),(Join-Path $integration '.env.local'),(Join-Path $legacy '.env.local'))) {
    $val = Read-KeyFromEnvFile $p 'GEMINI_API_KEY'
    if ($val) { $env:GEMINI_API_KEY = $val; break }
  }
}
if (-not $env:GEMINI_API_KEY) {
  Write-Host 'GEMINI_API_KEY=NO_ENCONTRADA. El envio real quedara bloqueado.' -ForegroundColor Yellow
} else {
  Write-Host 'GEMINI_API_KEY=CONFIGURADA (valor oculto)' -ForegroundColor Green
}

$env:PRODUCTION_MODE = 'real'
$env:V7_DOS_TOQUES_P01_PAID_ENABLED = 'true'
$env:V7_CINEMA_PAID_ENABLED = 'false'
$env:ALLOW_EXTERNAL_API_CALLS = 'false'
$env:ALLOW_PAID_GENERATION = 'false'
$env:V7_VEO_USD_PER_SECOND = '0.10'
$env:V7_CINEMA_MAX_USD = '2'
$env:V7_CINEMA_ADMIN_TOKEN = ([guid]::NewGuid().ToString('N') + [guid]::NewGuid().ToString('N'))

Write-Host '[3/4] Permiso de UNA toma, sin activar otras operaciones.' -ForegroundColor Green
Write-Host 'PRESUPUESTO_MAXIMO=USD 2.00; UNA SOLICITUD; CERO REINTENTOS'
Write-Host 'ESTIMACION_DE_VIDEO=USD 0.80'
Write-Host 'APROBAR_TOMA_EXISTENTE_SIN_NUEVA_GENERACION'
Write-Host ''
Write-Host 'TOKEN ADMINISTRATIVO PARA EL PANEL (NO LO COMPARTAS):' -ForegroundColor Yellow
Write-Host $env:V7_CINEMA_ADMIN_TOKEN -ForegroundColor Magenta

$url = "http://localhost:3010/v7/films/$filmId" + '?tab=scene01'
Write-Host "[4/4] Abriendo: $url" -ForegroundColor Green
Start-Process $url
Write-Host 'Generacion Veo: TEXTO-A-VIDEO para incluir a Gabriel, Daniel y Lucia.' -ForegroundColor Green
Write-Host 'El fotograma familiar 16:9 es OPCIONAL, solo referencia editorial; no se envia a Google.'
Write-Host 'Comprueba el prompt con los tres personajes y sus cascos antes de confirmar.'
Write-Host 'No reutilices ni importes como obligatoria la antigua imagen solo de Gabriel.'
Write-Host 'IMPORTANTE: LA TOMA E01-P01 YA ESTA DESCARGADA. USA EL BOTON APROBAR E01-P01.' -ForegroundColor Green
Write-Host 'PROHIBIDO iniciar una generacion adicional o borrar el provider-operation.json.' -ForegroundColor Yellow
Write-Host 'La aprobacion artistica NO llama a Google ni modifica el MP4 original.'
npm run dev -- -p 3010
