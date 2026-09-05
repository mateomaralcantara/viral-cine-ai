[CmdletBinding()]
param(
  [string]$ProjectRoot = '',
  [string]$ProjectId = '',
  [switch]$AbrirInforme
)

Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'
[Console]::OutputEncoding = [System.Text.Encoding]::UTF8
$OutputEncoding = [System.Text.Encoding]::UTF8
$StartedAt = Get-Date
$ReportLines = New-Object System.Collections.Generic.List[string]
$Blockers = New-Object System.Collections.Generic.List[string]
$Warnings = New-Object System.Collections.Generic.List[string]
$Actions = New-Object System.Collections.Generic.List[string]
$Utf8NoBom = New-Object System.Text.UTF8Encoding($false)

function Write-ReportLine {
  param([string]$Text = '', [ConsoleColor]$Color = [ConsoleColor]::Gray)
  Write-Host $Text -ForegroundColor $Color
  $ReportLines.Add($Text)
}

function Redact {
  param([AllowNull()][string]$Text)
  if ([string]::IsNullOrWhiteSpace($Text)) { return '' }
  $safe = $Text
  if (-not [string]::IsNullOrWhiteSpace($script:GeminiKey)) {
    $safe = $safe.Replace($script:GeminiKey, '[CLAVE OCULTA]')
  }
  $safe = [regex]::Replace($safe, 'AIza[0-9A-Za-z_-]{20,}', '[CLAVE OCULTA]')
  return $safe
}

function Add-Check {
  param(
    [ValidateSet('OK', 'AVISO', 'FALTA', 'INFO')][string]$Level,
    [string]$Name,
    [string]$Detail,
    [string]$Action = ''
  )
  $color = switch ($Level) {
    'OK' { [ConsoleColor]::Green }
    'AVISO' { [ConsoleColor]::Yellow }
    'FALTA' { [ConsoleColor]::Red }
    default { [ConsoleColor]::DarkGray }
  }
  Write-ReportLine ("  [{0,-6}] {1,-24} {2}" -f $Level, $Name, (Redact $Detail)) $color
  if ($Level -eq 'FALTA') { $Blockers.Add("$Name`: $(Redact $Detail)") }
  if ($Level -eq 'AVISO') { $Warnings.Add("$Name`: $(Redact $Detail)") }
  if (-not [string]::IsNullOrWhiteSpace($Action) -and -not $Actions.Contains($Action)) {
    $Actions.Add($Action)
  }
}

function Read-DotEnv {
  param([string]$Path)
  $values = New-Object 'System.Collections.Generic.Dictionary[string,string]' ([System.StringComparer]::OrdinalIgnoreCase)
  $duplicates = New-Object System.Collections.Generic.List[string]
  if (-not (Test-Path -LiteralPath $Path -PathType Leaf)) {
    return [PSCustomObject]@{ Values = $values; Duplicates = $duplicates }
  }
  foreach ($rawLine in Get-Content -LiteralPath $Path) {
    $line = $rawLine.Trim()
    if (-not $line -or $line.StartsWith('#')) { continue }
    if ($line.StartsWith('export ')) { $line = $line.Substring(7).Trim() }
    if ($line -notmatch '^([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)$') { continue }
    $name = $Matches[1]
    $value = $Matches[2].Trim()
    if ($value.Length -ge 2) {
      $first = $value.Substring(0, 1)
      $last = $value.Substring($value.Length - 1, 1)
      if (($first -eq '"' -and $last -eq '"') -or ($first -eq "'" -and $last -eq "'")) {
        $value = $value.Substring(1, $value.Length - 2)
      }
    }
    if ($values.ContainsKey($name)) { $duplicates.Add($name) }
    $values[$name] = $value
  }
  return [PSCustomObject]@{ Values = $values; Duplicates = $duplicates }
}

function Get-Setting {
  param([string]$Name, [string]$Fallback = '')
  if ($script:DotEnv.Values.ContainsKey($Name)) { return $script:DotEnv.Values[$Name] }
  $processValue = [Environment]::GetEnvironmentVariable($Name, 'Process')
  if (-not [string]::IsNullOrWhiteSpace($processValue)) { return $processValue }
  return $Fallback
}

function Get-ObjectValue {
  param(
    [AllowNull()][object]$Object,
    [string]$Name,
    [AllowNull()][object]$Fallback = $null
  )
  if ($null -eq $Object) { return $Fallback }
  $property = $Object.PSObject.Properties[$Name]
  if ($null -eq $property -or $null -eq $property.Value) { return $Fallback }
  return $property.Value
}

function Get-HttpError {
  param([System.Management.Automation.ErrorRecord]$Record)
  $status = 0
  $body = ''
  try { $status = [int]$Record.Exception.Response.StatusCode } catch { }
  try {
    if ($Record.ErrorDetails -and $Record.ErrorDetails.Message) {
      $body = $Record.ErrorDetails.Message
    }
    elseif ($Record.Exception.Response) {
      $stream = $Record.Exception.Response.GetResponseStream()
      if ($stream) {
        $reader = New-Object System.IO.StreamReader($stream)
        $body = $reader.ReadToEnd()
        $reader.Dispose()
      }
    }
  }
  catch { }
  $message = $Record.Exception.Message
  if ($body) {
    try {
      $json = $body | ConvertFrom-Json
      if ($json.error.message) { $message = [string]$json.error.message }
    }
    catch { $message = $body }
  }
  return [PSCustomObject]@{ Status = $status; Message = (Redact $message) }
}

function Resolve-AssetPath {
  param([string]$ProjectDirectory, [AllowNull()][string]$RelativePath)
  if ([string]::IsNullOrWhiteSpace($RelativePath)) { return $null }
  $native = $RelativePath.Replace('/', [System.IO.Path]::DirectorySeparatorChar)
  return Join-Path $ProjectDirectory $native
}

function Test-Asset {
  param([string]$Label, [string]$ProjectDirectory, [AllowNull()][string]$RelativePath)
  $fullPath = Resolve-AssetPath $ProjectDirectory $RelativePath
  if (-not $fullPath) {
    Add-Check 'AVISO' $Label 'Todavia no tiene archivo asignado.'
    return
  }
  if (Test-Path -LiteralPath $fullPath -PathType Leaf) {
    $file = Get-Item -LiteralPath $fullPath
    if ($file.Length -gt 0) {
      Add-Check 'OK' $Label ("Existe: {0:N0} bytes" -f $file.Length)
    }
    else {
      Add-Check 'FALTA' $Label 'El archivo existe, pero esta vacio.' 'Borra solamente la toma fallida desde el panel y vuelve a intentarla.'
    }
  }
  else {
    Add-Check 'FALTA' $Label "No existe el archivo esperado: $RelativePath" 'Reintenta solamente la toma incompleta.'
  }
}

function Find-ProjectRecord {
  param([string]$ProjectsDirectory, [string]$RequestedId)
  if (-not (Test-Path -LiteralPath $ProjectsDirectory -PathType Container)) { return $null }
  $records = New-Object System.Collections.Generic.List[object]
  foreach ($directory in Get-ChildItem -LiteralPath $ProjectsDirectory -Directory -ErrorAction SilentlyContinue) {
    if ($RequestedId -and $directory.Name -ne $RequestedId) { continue }
    $jsonPath = Join-Path $directory.FullName 'project.json'
    if (-not (Test-Path -LiteralPath $jsonPath -PathType Leaf)) { continue }
    try {
      $project = Get-Content -LiteralPath $jsonPath -Raw | ConvertFrom-Json
      $priority = if ($project.status -eq 'quality-review') { 0 } elseif ($project.status -eq 'failed') { 1 } elseif ($project.status -eq 'producing') { 2 } elseif ($project.status -eq 'queued') { 3 } else { 4 }
      $records.Add([PSCustomObject]@{
        Project = $project
        Directory = $directory.FullName
        JsonPath = $jsonPath
        LastWriteTime = (Get-Item -LiteralPath $jsonPath).LastWriteTime
        Priority = $priority
      })
    }
    catch { }
  }
  if ($RequestedId) { return $records | Select-Object -First 1 }
  return $records |
    Sort-Object -Property @{ Expression = 'Priority'; Ascending = $true }, @{ Expression = 'LastWriteTime'; Descending = $true } |
    Select-Object -First 1
}

if ([string]::IsNullOrWhiteSpace($ProjectRoot)) {
  if (-not [string]::IsNullOrWhiteSpace($PSScriptRoot)) {
    $ProjectRoot = $PSScriptRoot
  }
  else {
    $ProjectRoot = (Get-Location).Path
  }
}

$ProjectRoot = (Resolve-Path -LiteralPath $ProjectRoot).Path
$PackagePath = Join-Path $ProjectRoot 'package.json'
if (-not (Test-Path -LiteralPath $PackagePath -PathType Leaf)) {
  throw "No se encontro ViralCine en: $ProjectRoot"
}
$Package = Get-Content -LiteralPath $PackagePath -Raw | ConvertFrom-Json
if ($Package.name -ne 'viralcine-studio-pro') {
  throw "La carpeta no pertenece a ViralCine Studio Pro: $ProjectRoot"
}

$EnvPath = Join-Path $ProjectRoot '.env.local'
$script:DotEnv = Read-DotEnv $EnvPath
$script:GeminiKey = Get-Setting 'GEMINI_API_KEY'
$Mode = (Get-Setting 'PRODUCTION_MODE' 'demo').ToLowerInvariant()
$Provider = (Get-Setting 'VIDEO_PROVIDER' 'auto').ToLowerInvariant()
$OmniModel = Get-Setting 'GEMINI_OMNI_VIDEO_MODEL' 'gemini-omni-flash-preview'
$VeoModel = Get-Setting 'GEMINI_VIDEO_MODEL' 'veo-3.1-fast-generate-preview'
$QualityMode = (Get-Setting 'SCENE_QUALITY_MODE' 'strict').ToLowerInvariant()
$QualityScore = Get-Setting 'SCENE_QUALITY_MIN_SCORE' '9.0'
$QualityAttempts = Get-Setting 'SCENE_QUALITY_MAX_ATTEMPTS' '3'

Clear-Host
Write-ReportLine ''
Write-ReportLine '  +--------------------------------------------------------------------+' DarkCyan
Write-ReportLine '  |       VIRALCINE - GEMINI Y PRIMERA ESCENA                          |' Cyan
Write-ReportLine '  |       Clave, modelos, worker, proyecto, video y calidad            |' DarkCyan
Write-ReportLine '  +--------------------------------------------------------------------+' DarkCyan
Write-ReportLine ''
Write-ReportLine "  Proyecto: $ProjectRoot" DarkGray
Write-ReportLine "  Version:  $($Package.version)" DarkGray
Write-ReportLine "  Inicio:   $($StartedAt.ToString('yyyy-MM-dd HH:mm:ss'))" DarkGray
Write-ReportLine ''

Write-ReportLine '  1. Configuracion activa' White
if (Test-Path -LiteralPath $EnvPath -PathType Leaf) {
  Add-Check 'OK' '.env.local' 'Encontrado; sus secretos no se mostraran.'
} else {
  Add-Check 'FALTA' '.env.local' 'No existe.' 'Crea .env.local desde .env.example y agrega tus claves.'
}
if ($script:DotEnv.Duplicates.Count -gt 0) {
  Add-Check 'AVISO' 'Variables repetidas' (($script:DotEnv.Duplicates | Sort-Object -Unique) -join ', ') 'Deja una sola definicion por variable; ViralCine usa la ultima.'
}
if ($Mode -eq 'real') { Add-Check 'OK' 'Modo' 'PRODUCTION_MODE=real' }
else { Add-Check 'FALTA' 'Modo' "PRODUCTION_MODE=$Mode" 'Cambia PRODUCTION_MODE=real y reinicia con run-dev.ps1.' }
if (@('auto', 'omni', 'veo', 'fal') -contains $Provider) {
  Add-Check 'OK' 'Router de video' "VIDEO_PROVIDER=$Provider"
} else {
  Add-Check 'FALTA' 'Router de video' "VIDEO_PROVIDER=$Provider no es valido." 'Usa VIDEO_PROVIDER=auto.'
}
Add-Check 'INFO' 'Modelos configurados' "Omni=$OmniModel | Veo=$VeoModel"
Add-Check 'INFO' 'Calidad configurada' "Modo=$QualityMode | minimo=$QualityScore/10 | intentos=$QualityAttempts"

$HasV3Engine = (Test-Path -LiteralPath (Join-Path $ProjectRoot 'lib\engine\shot-plan.ts')) -and (Test-Path -LiteralPath (Join-Path $ProjectRoot 'lib\providers\google-omni.ts'))
if ($HasV3Engine) {
  Add-Check 'OK' 'Motor por tomas' 'Los modulos de ViralCine 3.0 estan instalados.'
} else {
  Add-Check 'FALTA' 'Motor por tomas' 'La instalacion no contiene todos los modulos 3.0.' 'Instala nuevamente la actualizacion acumulativa 3.0 con ViralCine cerrado.'
}

Write-ReportLine ''
Write-ReportLine '  2. Validacion segura de GEMINI_API_KEY' White
$GeminiValid = $false
$AvailableModels = @()
if ([string]::IsNullOrWhiteSpace($script:GeminiKey) -or $script:GeminiKey -match '^(tu_|your_|aqui|xxx|\.\.\.)') {
  Add-Check 'FALTA' 'Clave Gemini' 'GEMINI_API_KEY esta vacia o parece un marcador.' 'Crea una clave en Google AI Studio y pegala en .env.local.'
}
else {
  Add-Check 'OK' 'Clave detectada' 'Existe una GEMINI_API_KEY; no se imprimira ni se guardara.'
  try {
    $headers = @{ 'x-goog-api-key' = $script:GeminiKey }
    $response = Invoke-RestMethod -Method Get -Uri 'https://generativelanguage.googleapis.com/v1beta/models?pageSize=1000' -Headers $headers -TimeoutSec 35
    $AvailableModels = @($response.models | ForEach-Object { ([string]$_.name) -replace '^models/', '' })
    $GeminiValid = $true
    Add-Check 'OK' 'Autenticacion Gemini' "Google acepto la clave y devolvio $($AvailableModels.Count) modelos. No se genero contenido."
  }
  catch {
    $http = Get-HttpError $_
    $detail = if ($http.Status) { "HTTP $($http.Status): $($http.Message)" } else { $http.Message }
    if ($http.Status -eq 429) {
      Add-Check 'AVISO' 'Autenticacion Gemini' $detail 'La clave parece llegar a Google, pero revisa cuota y facturacion.'
    } else {
      Add-Check 'FALTA' 'Autenticacion Gemini' $detail 'Genera una clave nueva en Google AI Studio, reemplazala en .env.local y reinicia ViralCine.'
    }
  }
}

if ($GeminiValid) {
  $OmniAvailable = $AvailableModels -contains $OmniModel
  $VeoAvailable = $AvailableModels -contains $VeoModel
  if ($OmniAvailable) {
    Add-Check 'OK' 'Gemini Omni' "$OmniModel aparece disponible para esta clave."
  } else {
    Add-Check 'AVISO' 'Gemini Omni' "$OmniModel no aparecio en models.list; puede requerir acceso preview o no publicarse en ese listado." 'Manten VIDEO_PROVIDER=auto para permitir el respaldo de Veo y Fal.ai.'
  }
  if ($VeoAvailable) {
    Add-Check 'OK' 'Google Veo' "$VeoModel aparece disponible para esta clave."
  } else {
    Add-Check 'AVISO' 'Google Veo' "$VeoModel no aparecio como disponible para esta clave." 'Confirma facturacion y acceso a Veo en el mismo proyecto de Google AI Studio.'
  }
  Add-Check 'INFO' 'Limite de esta prueba' 'La lista valida autenticacion y acceso anunciado; no confirma saldo ni una generacion de video, porque eso seria facturable.'
}

Write-ReportLine ''
Write-ReportLine '  3. Panel y worker' White
$WorkerRunning = $false
$PanelRunning = $false
try {
  $processes = @(Get-CimInstance Win32_Process -Filter "Name = 'node.exe'" -ErrorAction Stop | Where-Object {
    $_.CommandLine -and $_.CommandLine.IndexOf($ProjectRoot, [System.StringComparison]::OrdinalIgnoreCase) -ge 0
  })
  $WorkerRunning = @($processes | Where-Object { $_.CommandLine -match 'worker\.ts|scripts[\\/]worker' }).Count -gt 0
  $PanelRunning = @($processes | Where-Object { $_.CommandLine -match 'next.+(?:dev|start)|next[\\/]dist' }).Count -gt 0
  if ($WorkerRunning) { Add-Check 'OK' 'Worker' 'El trabajador de produccion esta ejecutandose.' }
  else { Add-Check 'FALTA' 'Worker' 'No se detecto scripts/worker.ts.' 'Inicia siempre con .\run-dev.ps1 o npm run studio, no con npm run dev.' }
  if ($PanelRunning) { Add-Check 'OK' 'Panel' 'Se detecto el servidor de ViralCine.' }
  else { Add-Check 'INFO' 'Panel' 'No se detecto el panel; puede estar cerrado durante el diagnostico.' }
}
catch {
  Add-Check 'AVISO' 'Procesos' 'No fue posible inspeccionar los procesos de Node.' 'Ejecuta PowerShell normalmente y confirma que run-dev.ps1 permanezca abierto.'
}

if ($PanelRunning) {
  try {
    $system = Invoke-RestMethod -Method Get -Uri 'http://localhost:3000/api/system' -TimeoutSec 4
    if ($system.system.mode -eq 'real') { Add-Check 'OK' 'Servidor activo' 'El panel abierto esta en modo real.' }
    else { Add-Check 'FALTA' 'Servidor activo' 'El panel abierto sigue en modo demo.' 'Cierra ViralCine y reinicia run-dev.ps1 despues de guardar .env.local.' }
  }
  catch { Add-Check 'AVISO' 'Servidor activo' 'Node esta abierto, pero /api/system no respondio en el puerto 3000.' }
}

Write-ReportLine ''
Write-ReportLine '  4. Proyecto detenido y primera toma' White
$DataSetting = Get-Setting 'VIRALCINE_DATA_DIR' '.data'
$DataRoot = if ([System.IO.Path]::IsPathRooted($DataSetting)) { $DataSetting } else { Join-Path $ProjectRoot $DataSetting }
$ProjectsDirectory = Join-Path $DataRoot 'projects'
$Record = Find-ProjectRecord -ProjectsDirectory $ProjectsDirectory -RequestedId $ProjectId
if (-not $Record) {
  $requested = if ($ProjectId) { " con id $ProjectId" } else { '' }
  Add-Check 'FALTA' 'Proyecto' "No se encontro un proyecto$requested en $ProjectsDirectory" 'Abre ViralCine, confirma el proyecto y vuelve a ejecutar el diagnostico.'
}
else {
  $Project = $Record.Project
  $ProjectDirectory = $Record.Directory
  Add-Check 'OK' 'Proyecto analizado' "Titulo=$($Project.input.title) | id=$($Project.id)"
  Add-Check 'INFO' 'Estado' "status=$($Project.status) | fase=$($Project.progress.phase) | progreso=$($Project.progress.percent)%"
  Add-Check 'INFO' 'Mensaje actual' ([string]$Project.progress.message)
  $projectError = [string](Get-ObjectValue $Project 'error' '')
  if ($projectError) { Add-Check 'FALTA' 'Error del proyecto' $projectError 'Revisa el registro mostrado abajo antes de volver a gastar en otro intento.' }

  $plan = Get-ObjectValue $Project 'plan'
  $scenes = if ($plan) { @((Get-ObjectValue $plan 'scenes' @())) } else { @() }
  if ($scenes.Count -eq 0) {
    Add-Check 'FALTA' 'Plan de escenas' 'El proyecto no tiene escenas.' 'Genera y guarda el guion antes de producir.'
  }
  else {
    $CurrentScene = $scenes | Where-Object { $_.status -eq 'review-required' } | Select-Object -First 1
    if (-not $CurrentScene) { $CurrentScene = $scenes | Where-Object { $_.status -in @('rendering', 'failed') } | Select-Object -First 1 }
    if (-not $CurrentScene) { $CurrentScene = $scenes | Where-Object { $_.status -ne 'ready' } | Select-Object -First 1 }
    if (-not $CurrentScene) { $CurrentScene = $scenes | Select-Object -First 1 }
    Add-Check 'INFO' 'Escena actual' "Escena $($CurrentScene.order): $($CurrentScene.title) | estado=$($CurrentScene.status)"

    $shots = @((Get-ObjectValue $CurrentScene 'shots' @()))
    if ($shots.Count -eq 0) {
      Add-Check 'FALTA' 'Tomas' 'La escena no contiene el plan de tomas de ViralCine 3.0.' 'Crea un proyecto nuevo despues de instalar 3.0; no reutilices el proyecto antiguo de demo.'
    }
    else {
      $CurrentShot = $shots | Where-Object { $_.status -eq 'review-required' } | Select-Object -First 1
      if (-not $CurrentShot) { $CurrentShot = $shots | Where-Object { $_.status -in @('rendering', 'failed') } | Select-Object -First 1 }
      if (-not $CurrentShot) { $CurrentShot = $shots | Where-Object { $_.status -ne 'ready' } | Select-Object -First 1 }
      if (-not $CurrentShot) { $CurrentShot = $shots | Select-Object -First 1 }
      Add-Check 'INFO' 'Toma actual' "Toma $($CurrentShot.order)/$($shots.Count): $($CurrentShot.title) | estado=$($CurrentShot.status) | duracion=$($CurrentShot.durationSeconds)s"
      $readyShots = @($shots | Where-Object { $_.status -eq 'ready' }).Count
      Add-Check 'INFO' 'Avance de la escena' "$readyShots de $($shots.Count) tomas aprobadas."

      Test-Asset 'Primer fotograma' $ProjectDirectory ([string](Get-ObjectValue $CurrentShot 'imageAsset' ''))
      Test-Asset 'Voz de la toma' $ProjectDirectory ([string](Get-ObjectValue $CurrentShot 'voiceAsset' ''))
      Test-Asset 'Video de la toma' $ProjectDirectory ([string](Get-ObjectValue $CurrentShot 'videoAsset' ''))

      $checkpointName = 'scene-{0:D3}-shot-{1:D2}.json' -f [int]$CurrentScene.order, [int]$CurrentShot.order
      $checkpointPath = Join-Path (Join-Path $ProjectDirectory 'checkpoints') $checkpointName
      if (Test-Path -LiteralPath $checkpointPath -PathType Leaf) {
        Add-Check 'OK' 'Checkpoint de toma' "$checkpointName existe."
      }
      elseif ($CurrentShot.status -eq 'ready') {
        Add-Check 'AVISO' 'Checkpoint de toma' 'La toma figura lista, pero no tiene checkpoint.' 'Reinicia el worker para que valide y reconstruya el checkpoint.'
      }
      else {
        Add-Check 'INFO' 'Checkpoint de toma' 'Todavia no existe porque la toma no ha sido aprobada.'
      }

      $qualityRelative = [string](Get-ObjectValue $CurrentShot 'qualityReportAsset' '')
      $qualityPath = Resolve-AssetPath $ProjectDirectory $qualityRelative
      if (-not $qualityPath -or -not (Test-Path -LiteralPath $qualityPath -PathType Leaf)) {
        $latestName = 'scene-{0:D3}-shot-{1:D2}-latest.json' -f [int]$CurrentScene.order, [int]$CurrentShot.order
        $candidate = Join-Path (Join-Path $ProjectDirectory 'quality') $latestName
        if (Test-Path -LiteralPath $candidate -PathType Leaf) { $qualityPath = $candidate }
      }
      if ($qualityPath -and (Test-Path -LiteralPath $qualityPath -PathType Leaf)) {
        try {
          $Quality = Get-Content -LiteralPath $qualityPath -Raw | ConvertFrom-Json
          $criticalText = if ($Quality.criticalFailure) { 'SI' } else { 'no' }
          Add-Check 'OK' 'Informe de calidad' "Nota=$($Quality.overallScore)/10 | intento=$($Quality.attempt) | aprobado=$($Quality.passed) | fallo critico=$criticalText"
          if ($Quality.scores) {
            Add-Check 'INFO' 'Notas por criterio' ("Guion={0} | Identidad={1} | Visual={2} | Composicion={3} | Movimiento={4} | Publicacion={5}" -f $Quality.scores.narrativeAlignment, $Quality.scores.characterContinuity, $Quality.scores.visualQuality, $Quality.scores.composition, $Quality.scores.motionConsistency, $Quality.scores.professionalReadiness)
          }
          $issues = @($Quality.issues | Where-Object { $_ })
          if ($issues.Count -gt 0) {
            Add-Check 'AVISO' 'Defectos detectados' ($issues -join ' | ') 'Corrige el prompt o reintenta solo esta toma; si el video luce bien, puedes aprobarla manualmente.'
          }
          if ($Quality.correctionPrompt) {
            Add-Check 'INFO' 'Correccion solicitada' ([string]$Quality.correctionPrompt)
          }
        }
        catch { Add-Check 'AVISO' 'Informe de calidad' 'Existe, pero su JSON no pudo leerse.' }
      }
      else {
        Add-Check 'INFO' 'Informe de calidad' 'No existe una evaluacion guardada para esta toma.'
      }

      if ($CurrentShot.status -eq 'review-required' -or $Project.status -eq 'quality-review') {
        Add-Check 'FALTA' 'Causa del 5%' 'La primera toma agoto sus intentos y la puerta de calidad detuvo correctamente la pelicula.' 'No pulses Reintentar repetidamente: mira el clip y sus defectos; aprueba manualmente si es publicable o corrige el prompt y reintenta una sola vez.'
      }
      elseif ($Project.status -eq 'queued' -and -not $WorkerRunning) {
        Add-Check 'FALTA' 'Causa probable' 'El proyecto esta en cola, pero no hay worker para procesarlo.' 'Inicia .\run-dev.ps1 y deja abierta esa PowerShell.'
      }
      elseif ($CurrentShot.status -eq 'failed') {
        Add-Check 'FALTA' 'Causa probable' ([string](Get-ObjectValue $CurrentShot 'error' 'La toma fallo sin mensaje guardado.')) 'Corrige el error del proveedor antes de reintentar.'
      }
      elseif ($Project.progress.percent -le 5 -and $Project.status -eq 'producing') {
        Add-Check 'AVISO' 'Primera generacion' 'La toma sigue en produccion. Gemini/Veo puede tardar varios minutos.' 'Espera hasta 20 minutos y usa Actualizar; si el worker se cerro, reinicia run-dev.ps1.'
      }
    }
  }

  Write-ReportLine ''
  Write-ReportLine '  5. Ultimos eventos del proyecto' White
  $logs = @((Get-ObjectValue $Project 'productionLog' @()))
  if ($logs.Count -eq 0) {
    Add-Check 'INFO' 'Registro' 'No hay eventos guardados.'
  } else {
    foreach ($entry in $logs | Select-Object -Last 25) {
      Write-ReportLine ("    " + (Redact ([string]$entry))) DarkGray
    }
    $logText = ($logs | Select-Object -Last 40) -join "`n"
    if ($logText -match 'Todos los proveedores de video fallaron') {
      Add-Check 'FALTA' 'Proveedores de video' 'Gemini, Veo y Fal.ai fallaron para la toma.' 'Busca en estas ultimas lineas el mensaje individual de cada proveedor antes de gastar otro intento.'
    }
    if ($logText -match 'Gemini Omni[^\r\n]*termino sin devolver video') {
      Add-Check 'AVISO' 'Respuesta Omni' 'Gemini acepto el trabajo, pero ViralCine no encontro el video en la respuesta.' 'Actualiza ViralCine y conserva VIDEO_PROVIDER=auto para usar Veo como respaldo.'
    }
  }
}

Write-ReportLine ''
Write-ReportLine '  +--------------------------------------------------------------------+' DarkCyan
if ($Blockers.Count -eq 0) {
  Write-ReportLine ("  |  DIAGNOSTICO: SIN BLOQUEADORES   Avisos: {0,-3}                     |" -f $Warnings.Count) Green
} else {
  Write-ReportLine ("  |  DIAGNOSTICO: REQUIERE ACCION   Bloqueadores: {0,-3} Avisos: {1,-3} |" -f $Blockers.Count, $Warnings.Count) Yellow
}
Write-ReportLine '  +--------------------------------------------------------------------+' DarkCyan
Write-ReportLine ''

if ($Actions.Count -gt 0) {
  Write-ReportLine '  QUE HACER AHORA (en orden):' White
  $number = 1
  foreach ($action in $Actions) {
    Write-ReportLine "  $number. $action" Cyan
    $number += 1
  }
  Write-ReportLine ''
}

$ReportsDirectory = Join-Path $ProjectRoot 'reports'
New-Item -ItemType Directory -Path $ReportsDirectory -Force | Out-Null
$ReportPath = Join-Path $ReportsDirectory 'diagnostico-gemini-primera-escena.txt'
$ReportLines.Add('')
$ReportLines.Add('Este informe nunca incluye las claves secretas ni inicia generaciones facturables.')
[System.IO.File]::WriteAllLines($ReportPath, $ReportLines.ToArray(), $Utf8NoBom)
Write-Host "  Informe: $ReportPath" -ForegroundColor DarkGray
Write-Host '  La prueba de Gemini no genero contenido ni consumio video.' -ForegroundColor DarkGray
Write-Host ''

if ($AbrirInforme) { Start-Process notepad.exe $ReportPath }
if ($Blockers.Count -gt 0) { exit 2 }
exit 0
