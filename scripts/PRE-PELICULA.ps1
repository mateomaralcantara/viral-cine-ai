# Pre-película: une en orden todos los videos ya generados (E01…E10), aprobados o no.
# Solo local con FFmpeg: sin proveedores, sin costo, sin modificar los originales.
#
# Uso (PowerShell, dentro del proyecto):
#   powershell -ExecutionPolicy Bypass -File .\scripts\PRE-PELICULA.ps1
# Opcional:
#   -Data "C:\ruta\.data"   carpeta de datos (por defecto, VIRALCINE_DATA_DIR de .env.local)
#   -MaxSeconds 8            duración máxima de cada toma en el corte
#   -Silencio                quita el audio original de los clips
param(
  [string]$Data = '',
  [double]$MaxSeconds = 8,
  [switch]$Silencio
)
$ErrorActionPreference = 'Stop'
$filmId = 'film-dos-toques-de-bocina-v7'

if (-not $Data) {
  $line = Get-Content (Join-Path $PSScriptRoot '..\.env.local') -ErrorAction SilentlyContinue |
    Where-Object { $_ -match '^VIRALCINE_DATA_DIR=' } | Select-Object -First 1
  $Data = if ($line) { ($line -replace '^VIRALCINE_DATA_DIR=', '').Trim().Trim('"', "'") } else { Join-Path $PSScriptRoot '..\.data' }
}
$film = Join-Path $Data "v7\films\$filmId"
if (-not (Test-Path $film)) { throw "No encuentro la película en $film" }
foreach ($tool in 'ffmpeg', 'ffprobe') {
  if (-not (Get-Command $tool -ErrorAction SilentlyContinue)) { throw "Falta $tool en el PATH." }
}

$stamp = Get-Date -Format 'yyyyMMdd-HHmmss'
$outDir = Join-Path $film 'pre-pelicula'
$work = Join-Path $outDir "trabajo-$stamp"
New-Item -ItemType Directory -Force -Path $work | Out-Null

$parts = @()
$missing = @()
foreach ($e in 1..10) {
  foreach ($p in 1..12) {
    $label = 'E{0:D2}-P{1:D2}' -f $e, $p
    $dir = Join-Path $film $label.ToLower()
    if (-not (Test-Path $dir)) { continue }
    $src = @("$label-runway-gen4-turbo.mp4", "$label-veo-candidato.mp4") |
      ForEach-Object { Join-Path $dir $_ } |
      Where-Object { (Test-Path $_) -and ((Get-Item $_).Length -gt 10000) } |
      Select-Object -First 1
    if (-not $src) { $missing += $label; continue }

    $dur = [double](& ffprobe -v error -show_entries format=duration -of default=nw=1:nk=1 $src)
    $hasAudio = [bool](& ffprobe -v error -select_streams a -show_entries stream=index -of csv=p=0 $src)
    $t = [math]::Min($MaxSeconds, $dur).ToString([Globalization.CultureInfo]::InvariantCulture)
    $part = Join-Path $work ('{0:D3}-{1}.mp4' -f ($parts.Count + 1), $label)
    $vf = 'scale=1280:720:force_original_aspect_ratio=decrease,pad=1280:720:(ow-iw)/2:(oh-ih)/2,setsar=1,fps=24,format=yuv420p'
    $ffArgs = @('-nostdin', '-v', 'error', '-y', '-i', $src)
    if ($hasAudio -and -not $Silencio) {
      $ffArgs += @('-map', '0:v:0', '-map', '0:a:0', '-af', 'aresample=48000,apad')
    } else {
      $ffArgs += @('-f', 'lavfi', '-i', 'anullsrc=r=48000:cl=stereo', '-map', '0:v:0', '-map', '1:a:0')
    }
    $ffArgs += @('-t', $t, '-vf', $vf, '-c:v', 'libx264', '-preset', 'veryfast', '-crf', '21',
      '-c:a', 'aac', '-ar', '48000', '-ac', '2', $part)
    & ffmpeg @ffArgs
    if ($LASTEXITCODE -ne 0) { Write-Warning "No se pudo preparar $label"; continue }
    $parts += $part
    Write-Host ("  OK  {0}  ({1}s)" -f $label, $t)
  }
}
if (-not $parts.Count) { throw 'No hay videos generados todavía.' }

$list = Join-Path $work 'lista.txt'
$parts | ForEach-Object { "file '" + ($_ -replace '\\', '/') + "'" } | Set-Content -Encoding ascii $list
$final = Join-Path $outDir "pre-pelicula-$stamp.mp4"
& ffmpeg -nostdin -v error -y -f concat -safe 0 -i $list -c copy -movflags +faststart $final
if ($LASTEXITCODE -ne 0) { throw 'FFmpeg no pudo unir los clips.' }
Remove-Item -Recurse -Force $work

$total = [double](& ffprobe -v error -show_entries format=duration -of default=nw=1:nk=1 $final)
Write-Host ''
Write-Host ("PRE-PELÍCULA LISTA: {0} tomas, {1:N0} s ({2:N1} min)" -f $parts.Count, $total, ($total / 60)) -ForegroundColor Green
Write-Host "Archivo: $final"
if ($missing.Count) { Write-Host ("Sin video todavía: " + ($missing -join ', ')) -ForegroundColor Yellow }
Start-Process $final
