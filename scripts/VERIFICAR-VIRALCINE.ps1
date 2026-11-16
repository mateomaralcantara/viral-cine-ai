# Verificación de ViralCine: solo lectura. No genera video, no cobra, no modifica archivos.
#
# Uso (PowerShell, dentro de viral-cine-v7-cinema-core):
#   powershell -ExecutionPolicy Bypass -File .\scripts\VERIFICAR-VIRALCINE.ps1
# Opcional:
#   -Escena E05      revisa solo esa escena
#   -SinRed          no consulta a ElevenLabs ni a OpenAI
param([string]$Escena = '', [switch]$SinRed)
$ErrorActionPreference = 'Continue'
$root = Split-Path $PSScriptRoot -Parent
$envFile = Join-Path $root '.env.local'
$filmId = 'film-dos-toques-de-bocina-v7'

function Title($t) { Write-Host ''; Write-Host "=== $t ===" -ForegroundColor Cyan }
function Ok($t) { Write-Host "  OK    $t" -ForegroundColor Green }
function Warn($t) { Write-Host "  AVISO $t" -ForegroundColor Yellow }
function Bad($t) { Write-Host "  FALLA $t" -ForegroundColor Red }

# ---------- 1. .env.local ----------
Title '1. Configuración (.env.local) - solo nombres'
$vals = @{}; $dups = @()
if (Test-Path $envFile) {
  foreach ($l in Get-Content $envFile) {
    if ($l -match '^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=(.*)$') {
      if ($vals.ContainsKey($Matches[1])) { $dups += $Matches[1] }
      $vals[$Matches[1]] = $Matches[2].Trim().Trim('"', "'")
    }
  }
  Ok ".env.local con $($vals.Count) variables"
  if ($dups.Count) { Warn ('Duplicadas: ' + (($dups | Sort-Object -Unique) -join ', ')) } else { Ok 'Sin duplicados' }
} else { Bad "No existe $envFile" }
$need = 'NEXT_PUBLIC_SUPABASE_URL', 'SUPABASE_SECRET_KEY', 'GEMINI_API_KEY', 'V7_CINEMA_ADMIN_TOKEN', 'VIRALCINE_DATA_DIR', 'V7_VEO_SCENE_MODEL', 'V7_VEO_USD_PER_SECOND', 'V7_SCENE_MAX_USD'
foreach ($n in $need) { if ($vals[$n]) { Ok $n } else { Bad "Falta $n" } }
foreach ($n in 'V7_VEO_SCENES_ENABLED', 'V7_RUNWAY_E02_ENABLED') {
  if ($vals[$n] -eq 'true') { Warn "$n=true (generación pagada ACTIVADA)" } else { Ok "$n apagado" }
}

# ---------- 2. Tomas por escena ----------
Title '2. Estado de las tomas'
$data = if ($vals['VIRALCINE_DATA_DIR']) { $vals['VIRALCINE_DATA_DIR'] } else { Join-Path $root '.data' }
$film = Join-Path $data "v7\films\$filmId"
if (-not (Test-Path $film)) { Bad "No encuentro la carpeta de datos: $film"; exit 1 }
$hasProbe = [bool](Get-Command ffprobe -ErrorAction SilentlyContinue)
$scenes = if ($Escena) { @([int]($Escena -replace '\D', '')) } else { 1..10 }
$totalOk = 0; $totalShots = 0
foreach ($e in $scenes) {
  $rows = @()
  foreach ($p in 1..12) {
    $label = 'E{0:D2}-P{1:D2}' -f $e, $p
    $dir = Join-Path $film $label.ToLower()
    if (-not (Test-Path $dir)) { continue }
    $mp4 = @("$label-runway-gen4-turbo.mp4", "$label-veo-candidato.mp4") | ForEach-Object { Join-Path $dir $_ } |
      Where-Object { (Test-Path $_) -and ((Get-Item $_).Length -gt 10000) } | Select-Object -First 1
    $rec = @('provider-operation.json', 'runway-gen4-turbo-operation.json') | ForEach-Object { Join-Path $dir $_ } |
      Where-Object { Test-Path $_ } | Select-Object -First 1
    $status = if ($rec) { (Get-Content $rec -Raw | ConvertFrom-Json).status } elseif (Test-Path (Join-Path $dir 'veo-prompts')) { 'solo texto guardado' } else { '-' }
    $approved = Test-Path (Join-Path $dir 'artistic-approval.json')
    $secs = ''
    if ($mp4 -and $hasProbe) { $secs = '{0:N1}s' -f [double](& ffprobe -v error -show_entries format=duration -of default=nw=1:nk=1 $mp4) }
    $rows += [pscustomobject]@{ Toma = $label; Estado = $status; Video = $(if ($mp4) { "SI $secs" } else { 'NO' }); Aprobada = $(if ($approved) { 'SI' } else { '-' }) }
    $totalShots++; if ($mp4) { $totalOk++ }
  }
  if (-not $rows.Count) { Write-Host ("  E{0:D2}: sin empezar" -f $e) -ForegroundColor DarkGray; continue }
  $withVideo = @($rows | Where-Object { $_.Video -like 'SI*' }).Count
  $failed = @($rows | Where-Object { $_.Estado -like 'failed*' })
  $color = if ($failed.Count) { 'Red' } elseif ($withVideo -eq $rows.Count) { 'Green' } else { 'Yellow' }
  Write-Host ("  E{0:D2}: {1}/{2} con video, {3} aprobadas" -f $e, $withVideo, $rows.Count, @($rows | Where-Object { $_.Aprobada -eq 'SI' }).Count) -ForegroundColor $color
  $rows | Format-Table -AutoSize | Out-String -Width 200 | ForEach-Object { $_.TrimEnd() } | Write-Host
  foreach ($f in $failed) { Bad "$($f.Toma): $($f.Estado) -> corregir texto y reintentar solo esa" }
  $assembled = Get-ChildItem (Join-Path $film ("scenes\e{0:D2}" -f $e)) -Filter '*.mp4' -ErrorAction SilentlyContinue | Select-Object -First 1
  if ($assembled) { Ok ("Escena montada: " + $assembled.Name) }
}
Write-Host ("  TOTAL: {0} tomas con video de {1} empezadas (la película tiene 80)" -f $totalOk, $totalShots)

# ---------- 3. Voces ----------
Title '3. Proveedores de voz'
$voiceKeys = @{}
$integration = Join-Path (Split-Path $root -Parent) 'viral-cine-v7-integration\.env.local'
foreach ($src in @($envFile, $integration)) {
  if (-not (Test-Path $src)) { continue }
  foreach ($l in Get-Content $src) {
    if ($l -match '^\s*(ELEVENLABS_API_KEY|OPENAI_API_KEY)\s*=(.*)$' -and -not $voiceKeys[$Matches[1]]) {
      $voiceKeys[$Matches[1]] = $Matches[2].Trim().Trim('"', "'")
    }
  }
}
if ($SinRed) { Warn 'Comprobación en red omitida (-SinRed)' }
if ($voiceKeys['ELEVENLABS_API_KEY']) {
  if (-not $SinRed) {
    try {
      $s = Invoke-RestMethod -Uri 'https://api.elevenlabs.io/v1/user/subscription' -Headers @{ 'xi-api-key' = $voiceKeys['ELEVENLABS_API_KEY'] } -TimeoutSec 30
      Ok ("ElevenLabs: plan {0}, caracteres usados {1} de {2} (quedan {3})" -f $s.tier, $s.character_count, $s.character_limit, ($s.character_limit - $s.character_count))
    } catch { Bad ('ElevenLabs rechazó la clave: ' + $_.Exception.Message) }
  } else { Ok 'ElevenLabs: clave presente' }
} else { Warn 'ElevenLabs: no hay ELEVENLABS_API_KEY' }
if ($voiceKeys['OPENAI_API_KEY']) {
  if (-not $SinRed) {
    try {
      $m = Invoke-RestMethod -Uri 'https://api.openai.com/v1/models' -Headers @{ Authorization = 'Bearer ' + $voiceKeys['OPENAI_API_KEY'] } -TimeoutSec 30
      $tts = @($m.data | Where-Object { $_.id -match 'tts' } | ForEach-Object { $_.id })
      Ok ('OpenAI: clave válida. Modelos de voz: ' + ($(if ($tts.Count) { $tts -join ', ' } else { 'ninguno listado' })))
    } catch { Bad ('OpenAI rechazó la clave: ' + $_.Exception.Message) }
  } else { Ok 'OpenAI: clave presente' }
} else { Warn 'OpenAI: no hay OPENAI_API_KEY' }
$voiceKeys.Clear()

Title 'Fin de la verificación (sin cambios, sin costo)'
