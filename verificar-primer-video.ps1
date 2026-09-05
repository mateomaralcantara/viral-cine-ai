param(
  [switch]$Completo,
  [switch]$ProbarAPIs,
  [switch]$AbrirInforme
)

Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'
[Console]::OutputEncoding = [System.Text.Encoding]::UTF8
$OutputEncoding = [System.Text.Encoding]::UTF8

$ProjectRoot = $PSScriptRoot
$StartedAt = Get-Date
$Checks = New-Object System.Collections.Generic.List[object]
$Actions = New-Object System.Collections.Generic.List[string]
$DotEnvValues = @{}
$ServerRunning = $false
$WorkerRunning = $false
$Utf8NoBom = New-Object System.Text.UTF8Encoding($false)

function Write-Color {
  param([string]$Text, [ConsoleColor]$Color = [ConsoleColor]::Gray)
  Write-Host $Text -ForegroundColor $Color
}

function Add-Check {
  param(
    [ValidateSet('OK', 'FALTA', 'AVISO', 'INFO')][string]$Status,
    [string]$Area,
    [string]$Detail,
    [string]$Action = ''
  )

  $color = [ConsoleColor]::DarkGray
  if ($Status -eq 'OK') { $color = [ConsoleColor]::Green }
  if ($Status -eq 'FALTA') { $color = [ConsoleColor]::Red }
  if ($Status -eq 'AVISO') { $color = [ConsoleColor]::Yellow }
  if ($Status -eq 'INFO') { $color = [ConsoleColor]::Cyan }

  Write-Color ("  [{0,-6}] {1,-22} {2}" -f $Status, $Area, $Detail) $color
  $null = $script:Checks.Add([pscustomobject]@{
    status = $Status
    area = $Area
    detail = $Detail
    action = $Action
  })
  if ($Action -and ($Status -eq 'FALTA' -or $Status -eq 'AVISO') -and -not $script:Actions.Contains($Action)) {
    $null = $script:Actions.Add($Action)
  }
}

function Invoke-Captured {
  param([string]$Executable, [string[]]$Arguments)

  $previousPreference = $ErrorActionPreference
  try {
    $ErrorActionPreference = 'Continue'
    $LASTEXITCODE = 0
    $output = & $Executable @Arguments 2>&1 | Out-String
    $exitCode = $LASTEXITCODE
    if ($null -eq $exitCode) { $exitCode = 0 }
    return [pscustomobject]@{ ExitCode = [int]$exitCode; Output = $output.Trim() }
  }
  catch {
    return [pscustomobject]@{ ExitCode = 1; Output = $_.Exception.Message }
  }
  finally {
    $ErrorActionPreference = $previousPreference
  }
}

function Get-CommandPath {
  param([string[]]$Names)
  foreach ($name in $Names) {
    $command = Get-Command $name -ErrorAction SilentlyContinue
    if ($null -ne $command) {
      if ($command.Source) { return $command.Source }
      return $command.Name
    }
  }
  return $null
}

function Read-DotEnvFile {
  param([string]$Path)

  $values = @{}
  $duplicates = New-Object System.Collections.Generic.List[string]
  $invalidLines = New-Object System.Collections.Generic.List[int]
  $lineNumber = 0

  foreach ($line in (Get-Content -LiteralPath $Path)) {
    $lineNumber += 1
    $trimmed = $line.Trim()
    if (-not $trimmed -or $trimmed.StartsWith('#')) { continue }
    if ($trimmed.StartsWith('export ')) { $trimmed = $trimmed.Substring(7).Trim() }
    if ($trimmed -notmatch '^([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)$') {
      $null = $invalidLines.Add($lineNumber)
      continue
    }

    $name = $Matches[1]
    $value = $Matches[2].Trim()
    if ($value.Length -ge 2) {
      $first = $value.Substring(0, 1)
      $last = $value.Substring($value.Length - 1, 1)
      if (($first -eq '"' -and $last -eq '"') -or ($first -eq "'" -and $last -eq "'")) {
        $value = $value.Substring(1, $value.Length - 2)
      }
    }
    if ($values.ContainsKey($name)) { $null = $duplicates.Add($name) }
    $values[$name] = $value
  }

  return [pscustomobject]@{
    Values = $values
    Duplicates = @($duplicates)
    InvalidLines = @($invalidLines)
  }
}

function Get-Setting {
  param([string]$Name, [string]$Default = '')

  $processValue = [Environment]::GetEnvironmentVariable($Name, 'Process')
  if (-not [string]::IsNullOrWhiteSpace($processValue)) { return $processValue.Trim() }
  if ($script:DotEnvValues.ContainsKey($Name)) { return [string]$script:DotEnvValues[$Name] }
  return $Default
}

function Test-SecretPresent {
  param([string]$Value)
  if ([string]::IsNullOrWhiteSpace($Value)) { return $false }
  $candidate = $Value.Trim()
  if ($candidate.Length -lt 12) { return $false }
  if ($candidate -match '^(\.\.\.|tu[_ -]?clave|your[_ -]?key|changeme|reemplazar|pegar|aqui|<.*>)$') { return $false }
  return $true
}

function Test-Tcp443 {
  param([string]$HostName)
  $client = New-Object System.Net.Sockets.TcpClient
  try {
    $async = $client.BeginConnect($HostName, 443, $null, $null)
    if (-not $async.AsyncWaitHandle.WaitOne(5000, $false)) { return $false }
    $client.EndConnect($async)
    return $true
  }
  catch { return $false }
  finally { $client.Close() }
}

function Test-OpenAIKey {
  param([string]$Key, [string]$ScriptModel)
  try {
    $headers = @{ Authorization = "Bearer $Key" }
    $response = Invoke-RestMethod -Method Get -Uri 'https://api.openai.com/v1/models' -Headers $headers -TimeoutSec 20
    $ids = @($response.data | ForEach-Object { $_.id })
    if ($ids -contains $ScriptModel) {
      Add-Check 'OK' 'API OpenAI' "Clave valida y modelo de guion disponible: $ScriptModel"
    }
    else {
      Add-Check 'AVISO' 'API OpenAI' "La clave responde, pero $ScriptModel no aparece en sus modelos." "Cambia OPENAI_SCRIPT_MODEL por un modelo disponible para tu cuenta."
    }
  }
  catch {
    $statusCode = $null
    if ($null -ne $_.Exception.Response -and $null -ne $_.Exception.Response.StatusCode) {
      $statusCode = [int]$_.Exception.Response.StatusCode
    }
    if ($statusCode -eq 401) {
      Add-Check 'FALTA' 'API OpenAI' 'OpenAI rechazo la clave (HTTP 401). No se genero contenido.' 'Crea una OPENAI_API_KEY nueva, reemplaza la anterior y repite con -ProbarAPIs.'
    }
    elseif ($statusCode -eq 429) {
      Add-Check 'FALTA' 'API OpenAI' 'OpenAI respondio HTTP 429: revisa cuota, saldo o limite del proyecto.' 'Activa facturacion o agrega saldo al proyecto de OpenAI y repite con -ProbarAPIs.'
    }
    elseif ($statusCode -eq 403) {
      Add-Check 'FALTA' 'API OpenAI' 'OpenAI respondio HTTP 403: la clave o el proyecto no tienen permiso.' 'Revisa permisos del proyecto y acceso a los modelos en OpenAI.'
    }
    else {
      $codeText = if ($null -eq $statusCode) { 'sin codigo HTTP' } else { "HTTP $statusCode" }
      Add-Check 'FALTA' 'API OpenAI' "La prueba segura fallo ($codeText). No se genero contenido." 'Revisa Internet, OPENAI_API_KEY, facturacion y acceso a los modelos; luego repite con -ProbarAPIs.'
    }
  }
}

function Test-GeminiKey {
  param([string]$Key)
  try {
    $headers = @{ 'x-goog-api-key' = $Key }
    $null = Invoke-RestMethod -Method Get -Uri 'https://generativelanguage.googleapis.com/v1beta/models?pageSize=1' -Headers $headers -TimeoutSec 20
    Add-Check 'OK' 'API Gemini' 'La clave respondio correctamente (sin generar contenido).'
  }
  catch {
    $statusCode = $null
    if ($null -ne $_.Exception.Response -and $null -ne $_.Exception.Response.StatusCode) {
      $statusCode = [int]$_.Exception.Response.StatusCode
    }
    $codeText = if ($null -eq $statusCode) { 'sin codigo HTTP' } else { "HTTP $statusCode" }
    Add-Check 'FALTA' 'API Gemini' "La prueba segura fallo ($codeText). No se genero contenido." 'Revisa GEMINI_API_KEY, facturacion y acceso a Veo; luego repite con -ProbarAPIs.'
  }
}

function Get-DataPath {
  param([string]$ConfiguredPath)
  if ([System.IO.Path]::IsPathRooted($ConfiguredPath)) {
    return [System.IO.Path]::GetFullPath($ConfiguredPath)
  }
  return [System.IO.Path]::GetFullPath((Join-Path $ProjectRoot $ConfiguredPath))
}

function Test-WorkerProcess {
  if ($env:OS -ne 'Windows_NT') { return $false }
  try {
    $processes = Get-CimInstance Win32_Process -Filter "Name='node.exe'" -ErrorAction Stop
    foreach ($process in $processes) {
      if ($process.CommandLine -match 'scripts[\\/]worker\.ts') { return $true }
    }
  }
  catch { return $false }
  return $false
}

function Write-Report {
  param([string]$ReportDirectory, [int]$Blockers, [int]$Warnings, [string]$Verdict)

  New-Item -ItemType Directory -Path $ReportDirectory -Force | Out-Null
  $jsonPath = Join-Path $ReportDirectory 'diagnostico-primer-video.json'
  $mdPath = Join-Path $ReportDirectory 'diagnostico-primer-video.md'

  $payload = [pscustomobject]@{
    generatedAt = (Get-Date).ToString('o')
    projectRoot = $ProjectRoot
    verdict = $Verdict
    blockers = $Blockers
    warnings = $Warnings
    secretsIncluded = $false
    checks = $Checks.ToArray()
    nextActions = $Actions.ToArray()
  }
  [System.IO.File]::WriteAllText($jsonPath, (($payload | ConvertTo-Json -Depth 8) + "`r`n"), $Utf8NoBom)

  $lines = New-Object System.Collections.Generic.List[string]
  $null = $lines.Add('# ViralCine - diagnostico para el primer video')
  $null = $lines.Add('')
  $null = $lines.Add("- Resultado: **$Verdict**")
  $null = $lines.Add("- Bloqueadores: **$Blockers**")
  $null = $lines.Add("- Avisos: **$Warnings**")
  $null = $lines.Add("- Fecha: $((Get-Date).ToString('yyyy-MM-dd HH:mm:ss'))")
  $null = $lines.Add('- El informe no contiene claves secretas.')
  $null = $lines.Add('')
  $null = $lines.Add('## Comprobaciones')
  $null = $lines.Add('')
  foreach ($check in $Checks) {
    $null = $lines.Add("- [$($check.status)] **$($check.area):** $($check.detail)")
  }
  $null = $lines.Add('')
  $null = $lines.Add('## Proximas acciones')
  $null = $lines.Add('')
  if ($Actions.Count -eq 0) {
    $null = $lines.Add('- No hay correcciones tecnicas pendientes. Confirma saldo y ejecuta `npm run studio`.')
  }
  else {
    foreach ($action in $Actions) { $null = $lines.Add("- $action") }
  }
  [System.IO.File]::WriteAllLines($mdPath, $lines.ToArray(), $Utf8NoBom)
  return [pscustomobject]@{ Json = $jsonPath; Markdown = $mdPath }
}

Clear-Host
Write-Color ''
Write-Color '  +------------------------------------------------------------------+' DarkCyan
Write-Color '  |       VIRALCINE - VERIFICADOR DEL PRIMER VIDEO REAL              |' Cyan
Write-Color '  |       Sistema, APIs, FFmpeg, worker, datos y presupuesto         |' DarkCyan
Write-Color '  +------------------------------------------------------------------+' DarkCyan
Write-Color ''
Write-Color "  Proyecto: $ProjectRoot" DarkGray
Write-Color "  Inicio:   $($StartedAt.ToString('yyyy-MM-dd HH:mm:ss'))" DarkGray
Write-Color ''

Write-Color '  1. Proyecto y configuracion' White
$packagePath = Join-Path $ProjectRoot 'package.json'
if (-not (Test-Path -LiteralPath $packagePath)) {
  Add-Check 'FALTA' 'Proyecto' 'No existe package.json junto al script.' 'Coloca este script en la raiz de viral-cine-ai y ejecutalo de nuevo.'
}
else {
  try {
    $package = Get-Content -LiteralPath $packagePath -Raw | ConvertFrom-Json
    if ($package.name -eq 'viralcine-studio-pro') {
      Add-Check 'OK' 'Proyecto' "ViralCine Studio $($package.version) detectado."
    }
    else {
      Add-Check 'FALTA' 'Proyecto' "package.json pertenece a $($package.name), no a ViralCine." 'Ejecuta el script dentro de la carpeta correcta de viral-cine-ai.'
    }
  }
  catch {
    Add-Check 'FALTA' 'Proyecto' 'package.json no es JSON valido.' 'Restaura o corrige package.json antes de producir.'
  }
}

$envPath = Join-Path $ProjectRoot '.env.local'
if (-not (Test-Path -LiteralPath $envPath)) {
  Add-Check 'FALTA' '.env.local' 'No existe el archivo de configuracion privada.' 'Ejecuta Copy-Item .env.example .env.local y completa las claves.'
}
else {
  $dotEnv = Read-DotEnvFile $envPath
  $DotEnvValues = $dotEnv.Values
  Add-Check 'OK' '.env.local' 'Archivo privado encontrado; sus valores no se mostraran.'
  if ($dotEnv.Duplicates.Count -gt 0) {
    Add-Check 'AVISO' '.env.local' ("Variables repetidas: " + (($dotEnv.Duplicates | Sort-Object -Unique) -join ', ')) 'Deja una sola definicion por variable en .env.local.'
  }
  if ($dotEnv.InvalidLines.Count -gt 0) {
    Add-Check 'AVISO' '.env.local' ("Lineas con formato no reconocido: " + ($dotEnv.InvalidLines -join ', ')) 'Corrige cada linea al formato NOMBRE=valor, sin dos puntos ni comas.'
  }
}

$gitignorePath = Join-Path $ProjectRoot '.gitignore'
if ((Test-Path -LiteralPath $gitignorePath) -and ((Get-Content -LiteralPath $gitignorePath -Raw) -match '(?m)^\.env\.local\s*$')) {
  Add-Check 'OK' 'Seguridad' '.env.local esta excluido de Git.'
}
else {
  Add-Check 'AVISO' 'Seguridad' '.env.local podria terminar dentro de Git.' 'Agrega .env.local a .gitignore y nunca publiques tus claves.'
}

$mode = (Get-Setting 'PRODUCTION_MODE' 'demo').ToLowerInvariant()
if ($mode -eq 'real') {
  Add-Check 'OK' 'Modo' 'PRODUCTION_MODE=real; se habilita contenido de IA.'
}
else {
  Add-Check 'FALTA' 'Modo' "PRODUCTION_MODE=$mode; asi solo obtendras placas, subtitulos y silencio." 'Cambia PRODUCTION_MODE=real en .env.local y reinicia ViralCine.'
}

Write-Color ''
Write-Color '  2. Node.js y dependencias' White
$nodePath = Get-CommandPath @('node.exe', 'node')
if (-not $nodePath) {
  Add-Check 'FALTA' 'Node.js' 'Node.js no esta instalado o no aparece en PATH.' 'Instala Node.js 22 LTS o superior y abre una PowerShell nueva.'
}
else {
  $nodeResult = Invoke-Captured $nodePath @('--version')
  $major = 0
  $versionText = $nodeResult.Output.Trim().TrimStart('v')
  $null = [int]::TryParse(($versionText -split '\.')[0], [ref]$major)
  if ($nodeResult.ExitCode -eq 0 -and $major -ge 22) {
    Add-Check 'OK' 'Node.js' "Version $versionText."
  }
  else {
    Add-Check 'FALTA' 'Node.js' "Version detectada: $versionText; se requiere 22 o superior." 'Actualiza Node.js y reinstala las dependencias con npm install.'
  }
}

$npmPath = Get-CommandPath @('npm.cmd', 'npm')
if (-not $npmPath) {
  Add-Check 'FALTA' 'npm' 'npm no aparece en PATH.' 'Reinstala Node.js incluyendo npm.'
}
else {
  $npmVersion = Invoke-Captured $npmPath @('--version')
  if ($npmVersion.ExitCode -eq 0) { Add-Check 'OK' 'npm' "Version $($npmVersion.Output.Trim())." }
  else { Add-Check 'FALTA' 'npm' 'npm no pudo ejecutarse.' 'Repara la instalacion de Node.js/npm.' }
}

$requiredModules = @(
  'node_modules\next\package.json',
  'node_modules\openai\package.json',
  'node_modules\@fal-ai\client\package.json',
  'node_modules\@google\genai\package.json'
)
$missingModules = @($requiredModules | Where-Object { -not (Test-Path -LiteralPath (Join-Path $ProjectRoot $_)) })
if ($missingModules.Count -eq 0) {
  Add-Check 'OK' 'Dependencias' 'Next.js y los clientes de IA estan instalados.'
}
else {
  Add-Check 'FALTA' 'Dependencias' "Faltan $($missingModules.Count) paquetes esenciales." 'Ejecuta npm install desde la raiz del proyecto.'
}

Write-Color ''
Write-Color '  3. Proveedores de IA' White
$openAIKey = Get-Setting 'OPENAI_API_KEY'
$falKey = Get-Setting 'FAL_KEY'
$geminiKey = Get-Setting 'GEMINI_API_KEY'
$hasOpenAI = Test-SecretPresent $openAIKey
$hasFal = Test-SecretPresent $falKey
$hasGemini = Test-SecretPresent $geminiKey

if ($hasOpenAI) {
  Add-Check 'OK' 'OpenAI' 'Clave detectada: guion, imagenes y voz quedan habilitados.'
  if ($openAIKey -notmatch '^sk-') {
    Add-Check 'AVISO' 'OpenAI' 'El formato de la clave es poco habitual.' 'Copia nuevamente OPENAI_API_KEY desde tu panel de OpenAI, sin espacios ni comillas innecesarias.'
  }
}
else {
  Add-Check 'FALTA' 'OpenAI' 'Falta una OPENAI_API_KEY real; sin ella no hay guion, imagenes ni voz.' 'Crea una clave de API de OpenAI, pegala en .env.local y confirma que la cuenta tenga facturacion.'
}

$videoProvider = (Get-Setting 'VIDEO_PROVIDER' 'auto').ToLowerInvariant()
if (@('auto', 'fal', 'veo', 'omni') -notcontains $videoProvider) {
  Add-Check 'FALTA' 'Video provider' "VIDEO_PROVIDER=$videoProvider no es valido." 'Usa VIDEO_PROVIDER=auto, omni, veo o fal.'
}
elseif ($videoProvider -eq 'fal' -and -not $hasFal) {
  Add-Check 'FALTA' 'Fal.ai' 'VIDEO_PROVIDER=fal, pero FAL_KEY esta vacia o parece un marcador.' 'Crea FAL_KEY, pegala en .env.local y confirma saldo en Fal.ai.'
}
elseif ($videoProvider -eq 'veo' -and -not $hasGemini) {
  Add-Check 'FALTA' 'Google Veo' 'VIDEO_PROVIDER=veo, pero GEMINI_API_KEY esta vacia o parece un marcador.' 'Agrega GEMINI_API_KEY con acceso y facturacion de Veo, o usa VIDEO_PROVIDER=fal.'
}
elseif ($videoProvider -eq 'omni' -and -not $hasGemini) {
  Add-Check 'FALTA' 'Gemini Omni' 'VIDEO_PROVIDER=omni, pero GEMINI_API_KEY esta vacia o parece un marcador.' 'Agrega GEMINI_API_KEY con facturacion habilitada, o usa VIDEO_PROVIDER=fal.'
}
elseif ($videoProvider -eq 'auto' -and -not $hasFal -and -not $hasGemini) {
  Add-Check 'FALTA' 'Video IA' 'No existe FAL_KEY ni GEMINI_API_KEY para generar movimiento real.' 'Agrega FAL_KEY y usa VIDEO_PROVIDER=fal; Gemini/Veo puede quedar opcional.'
}
else {
  $chosen = $videoProvider
  if ($videoProvider -eq 'auto') {
    if ($hasGemini) { $chosen = 'Gemini Omni, con Veo y Fal.ai como respaldos' } else { $chosen = 'Fal.ai' }
  }
  Add-Check 'OK' 'Video IA' "Proveedor utilizable: $chosen."
}

if ($hasFal) {
  Add-Check 'OK' 'Avatares y musica' 'FAL_KEY detectada; Fal puede crear lip-sync, video y musica.'
  Add-Check 'INFO' 'Saldo Fal.ai' 'La clave existe, pero el saldo no puede confirmarse sin una operacion facturable.'
}
else {
  Add-Check 'AVISO' 'Avatares y musica' 'Sin FAL_KEY no habra avatar con lip-sync ni musica generativa.' 'Agrega FAL_KEY para usar personajes parlantes y banda sonora; confirma saldo antes de producir.'
}

if ($hasGemini) {
  Add-Check 'OK' 'Google video' 'GEMINI_API_KEY detectada para Gemini Omni y Veo.'
}
else {
  Add-Check 'INFO' 'Google video' 'No configurado; es opcional si Fal.ai produce el video.'
}

$scriptModel = Get-Setting 'OPENAI_SCRIPT_MODEL' 'gpt-5.6-terra'
$imageModel = Get-Setting 'OPENAI_IMAGE_MODEL' 'gpt-image-2'
$ttsModel = Get-Setting 'OPENAI_TTS_MODEL' 'gpt-4o-mini-tts'
$falVideoModel = Get-Setting 'FAL_VIDEO_MODEL' 'fal-ai/vidu/q3/image-to-video'
$falAvatarModel = Get-Setting 'FAL_AVATAR_MODEL' 'fal-ai/longcat-single-avatar/image-audio-to-video'
$omniVideoModel = Get-Setting 'GEMINI_OMNI_VIDEO_MODEL' 'gemini-omni-flash-preview'
$veoVideoModel = Get-Setting 'GEMINI_VIDEO_MODEL' 'veo-3.1-fast-generate-preview'
Add-Check 'INFO' 'Modelos' "Guion=$scriptModel | Imagen=$imageModel | Voz=$ttsModel"
if ($hasGemini) { Add-Check 'INFO' 'Modelos Google' "Omni=$omniVideoModel | Veo=$veoVideoModel" }
if ($hasFal) { Add-Check 'INFO' 'Modelos Fal' "Video=$falVideoModel | Avatar=$falAvatarModel" }

if ($ProbarAPIs) {
  Write-Color '  Probando autenticacion sin generar ni facturar contenido...' DarkGray
  [Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12
  if ($hasOpenAI) { Test-OpenAIKey $openAIKey $scriptModel }
  if ($hasGemini) { Test-GeminiKey $geminiKey }
  if ($hasFal) {
    if (Test-Tcp443 'queue.fal.run') {
      Add-Check 'OK' 'Red Fal.ai' 'Conexion HTTPS disponible; no se envio ningun trabajo facturable.'
    }
    else {
      Add-Check 'FALTA' 'Red Fal.ai' 'No se pudo conectar con queue.fal.run:443.' 'Revisa Internet, firewall, antivirus o proxy para Fal.ai.'
    }
  }
}
else {
  Add-Check 'INFO' 'Prueba de APIs' 'No ejecutada. Usa -ProbarAPIs para validar OpenAI/Gemini sin generar contenido.'
}

Write-Color ''
Write-Color '  4. Motor audiovisual FFmpeg' White
$ffmpegSetting = Get-Setting 'FFMPEG_PATH' 'ffmpeg'
$ffmpegPath = $null
if ([System.IO.Path]::IsPathRooted($ffmpegSetting) -and (Test-Path -LiteralPath $ffmpegSetting)) {
  $ffmpegPath = $ffmpegSetting
}
else {
  $ffmpegPath = Get-CommandPath @($ffmpegSetting, 'ffmpeg.exe', 'ffmpeg')
}

if (-not $ffmpegPath) {
  Add-Check 'FALTA' 'FFmpeg' "No se encontro '$ffmpegSetting'." 'Ejecuta winget install --id Gyan.FFmpeg -e, cierra PowerShell y vuelve a abrirla.'
}
else {
  $ffmpegVersion = Invoke-Captured $ffmpegPath @('-hide_banner', '-version')
  if ($ffmpegVersion.ExitCode -eq 0) {
    $firstVersionLine = ($ffmpegVersion.Output -split "`r?`n")[0]
    Add-Check 'OK' 'FFmpeg' $firstVersionLine
  }
  else {
    Add-Check 'FALTA' 'FFmpeg' 'El ejecutable existe, pero no pudo iniciarse.' 'Corrige FFMPEG_PATH o reinstala FFmpeg.'
  }

  $encoders = Invoke-Captured $ffmpegPath @('-hide_banner', '-encoders')
  $filters = Invoke-Captured $ffmpegPath @('-hide_banner', '-filters')
  $missingCore = New-Object System.Collections.Generic.List[string]
  foreach ($feature in @('libx264', 'aac')) {
    if ($encoders.Output -notmatch [regex]::Escape($feature)) { $null = $missingCore.Add($feature) }
  }
  foreach ($feature in @('scale', 'crop', 'zoompan', 'amix')) {
    if ($filters.Output -notmatch ("\b" + [regex]::Escape($feature) + "\b")) { $null = $missingCore.Add($feature) }
  }
  if ($missingCore.Count -eq 0) {
    Add-Check 'OK' 'Codecs y filtros' 'H.264, AAC, encuadre, movimiento y mezcla disponibles.'
  }
  else {
    Add-Check 'FALTA' 'Codecs y filtros' ("Faltan componentes: " + ($missingCore -join ', ')) 'Instala una compilacion completa de FFmpeg (Gyan.FFmpeg) y reinicia PowerShell.'
  }

  if ($filters.Output -match '\bsubtitles\b') {
    Add-Check 'OK' 'Subtitulos' 'El filtro subtitles/libass esta disponible.'
  }
  else {
    Add-Check 'AVISO' 'Subtitulos' 'FFmpeg no incluye el filtro para incrustar subtitulos.' 'Instala FFmpeg completo o desactiva Incrustar subtitulos en el proyecto.'
  }

  if ($encoders.Output -notmatch 'libmp3lame') {
    Add-Check 'AVISO' 'Audio MP3' 'No aparece libmp3lame; el modo demo y algunas pruebas pueden fallar.' 'Instala una compilacion completa de FFmpeg.'
  }

  $tempRoot = Join-Path ([System.IO.Path]::GetTempPath()) ("viralcine-check-" + [Guid]::NewGuid().ToString('N'))
  try {
    New-Item -ItemType Directory -Path $tempRoot -Force | Out-Null
    $probeVideo = Join-Path $tempRoot 'prueba.mp4'
    $smokeResult = Invoke-Captured $ffmpegPath @(
      '-y', '-hide_banner', '-loglevel', 'error',
      '-f', 'lavfi', '-i', 'color=c=0x15152d:s=640x360:r=25:d=1',
      '-f', 'lavfi', '-i', 'sine=frequency=440:sample_rate=48000:duration=1',
      '-t', '1', '-c:v', 'libx264', '-pix_fmt', 'yuv420p',
      '-c:a', 'aac', '-b:a', '128k', '-shortest', $probeVideo
    )
    if ($smokeResult.ExitCode -eq 0 -and (Test-Path -LiteralPath $probeVideo) -and (Get-Item -LiteralPath $probeVideo).Length -gt 10000) {
      Add-Check 'OK' 'Prueba MP4' 'FFmpeg creo un video H.264/AAC de prueba correctamente.'
    }
    else {
      Add-Check 'FALTA' 'Prueba MP4' 'FFmpeg no pudo crear el archivo audiovisual de prueba.' 'Reinstala FFmpeg completo y repite el diagnostico.'
    }
  }
  catch {
    Add-Check 'FALTA' 'Prueba MP4' 'La prueba local de video fallo.' 'Revisa FFmpeg, permisos de TEMP y espacio en disco.'
  }
  finally {
    Remove-Item -LiteralPath $tempRoot -Recurse -Force -ErrorAction SilentlyContinue
  }
}

Write-Color ''
Write-Color '  5. Datos, disco y procesos' White
$configuredDataPath = Get-Setting 'VIRALCINE_DATA_DIR' '.data'
try {
  $dataPath = Get-DataPath $configuredDataPath
  New-Item -ItemType Directory -Path $dataPath -Force | Out-Null
  $writeProbe = Join-Path $dataPath ('.write-test-' + [Guid]::NewGuid().ToString('N'))
  [System.IO.File]::WriteAllText($writeProbe, 'ok', $Utf8NoBom)
  Remove-Item -LiteralPath $writeProbe -Force
  Add-Check 'OK' 'Carpeta de datos' "Escribible: $dataPath"

  $driveRoot = [System.IO.Path]::GetPathRoot($dataPath)
  if ($driveRoot -and $driveRoot.Length -ge 1) {
    $driveName = $driveRoot.Substring(0, 1)
    $drive = Get-PSDrive -Name $driveName -ErrorAction SilentlyContinue
    if ($null -ne $drive -and $null -ne $drive.Free) {
      $freeGB = [Math]::Round($drive.Free / 1073741824, 1)
      if ($freeGB -lt 2) {
        Add-Check 'FALTA' 'Espacio libre' "Solo quedan $freeGB GB." 'Libera al menos 10 GB antes de producir una pelicula larga.'
      }
      elseif ($freeGB -lt 10) {
        Add-Check 'AVISO' 'Espacio libre' "Quedan $freeGB GB; puede ser poco para clips y exportaciones." 'Libera espacio hasta tener al menos 10 GB disponibles.'
      }
      else {
        Add-Check 'OK' 'Espacio libre' "$freeGB GB disponibles."
      }
    }
  }

  $projectsRoot = Join-Path $dataPath 'projects'
  $projectCount = 0
  $readyCount = 0
  $queuedCount = 0
  $invalidCount = 0
  if (Test-Path -LiteralPath $projectsRoot) {
    foreach ($directory in (Get-ChildItem -LiteralPath $projectsRoot -Directory -ErrorAction SilentlyContinue)) {
      $projectFile = Join-Path $directory.FullName 'project.json'
      if (-not (Test-Path -LiteralPath $projectFile)) { continue }
      try {
        $savedProject = Get-Content -LiteralPath $projectFile -Raw | ConvertFrom-Json
        $projectCount += 1
        if ($savedProject.status -eq 'ready') { $readyCount += 1 }
        if ($savedProject.status -eq 'queued') { $queuedCount += 1 }
      }
      catch { $invalidCount += 1 }
    }
  }
  if ($projectCount -gt 0) {
    Add-Check 'INFO' 'Proyectos' "$projectCount detectados; terminados=$readyCount, en cola=$queuedCount."
    if ($mode -eq 'real') {
      Add-Check 'AVISO' 'Proyecto nuevo' 'Un proyecto creado o producido en demo puede conservar referencias de demostracion.' 'Despues de cambiar a modo real, reinicia el estudio y crea un proyecto nuevo para la primera pelicula real.'
    }
  }
  else {
    Add-Check 'INFO' 'Proyectos' 'Aun no hay proyectos en la carpeta de datos.'
  }
  if ($invalidCount -gt 0) {
    Add-Check 'AVISO' 'Datos' "$invalidCount archivos project.json no pudieron leerse." 'Haz copia de la carpeta de datos y revisa los project.json danados.'
  }
}
catch {
  Add-Check 'FALTA' 'Carpeta de datos' 'No se pudo crear o escribir en VIRALCINE_DATA_DIR.' 'Usa una ruta local con permisos, por ejemplo VIRALCINE_DATA_DIR=C:\ViralCineData.'
  $queuedCount = 0
}

$WorkerRunning = Test-WorkerProcess
if ($WorkerRunning) {
  Add-Check 'OK' 'Worker' 'El trabajador de produccion esta ejecutandose.'
}
else {
  Add-Check 'AVISO' 'Worker' 'No se detecto el trabajador; una pelicula quedaria esperando en la cola.' 'Inicia siempre con npm run studio o con .\run-dev.ps1, no solo con npm run dev.'
}

try {
  $system = Invoke-RestMethod -Method Get -Uri 'http://localhost:3000/api/system' -TimeoutSec 3
  $ServerRunning = $true
  Add-Check 'OK' 'Panel web' 'Responde en http://localhost:3000.'
  if ($system.system.mode -ne 'real') {
    Add-Check 'FALTA' 'Servidor actual' 'El panel que esta abierto sigue en modo demo.' 'Detenlo con Ctrl+C y ejecuta de nuevo .\run-dev.ps1 despues de editar .env.local.'
  }
  elseif (-not $system.system.ffmpeg) {
    Add-Check 'FALTA' 'Servidor actual' 'El panel abierto no logra encontrar FFmpeg.' 'Reinicia PowerShell para que el nuevo PATH llegue al servidor.'
  }
}
catch {
  Add-Check 'INFO' 'Panel web' 'No esta iniciado ahora; eso es normal durante el diagnostico.'
}

Write-Color ''
Write-Color '  6. Presupuesto preventivo' White
$videoCostText = Get-Setting 'COST_AI_VIDEO_SECOND'
if ([string]::IsNullOrWhiteSpace($videoCostText)) {
  $legacyVideoCostText = Get-Setting 'COST_AI_VIDEO_8S' '0.80'
  $legacyVideoCost = 0.0
  if ([double]::TryParse($legacyVideoCostText, [Globalization.NumberStyles]::Float, [Globalization.CultureInfo]::InvariantCulture, [ref]$legacyVideoCost)) {
    $videoCostText = ($legacyVideoCost / 8.0).ToString('0.####', [Globalization.CultureInfo]::InvariantCulture)
  }
}
$avatarCostText = Get-Setting 'COST_AVATAR_SECOND' '0.30'
$videoCost = 0.0
$avatarCost = 0.0
$videoCostOk = [double]::TryParse($videoCostText, [Globalization.NumberStyles]::Float, [Globalization.CultureInfo]::InvariantCulture, [ref]$videoCost)
$avatarCostOk = [double]::TryParse($avatarCostText, [Globalization.NumberStyles]::Float, [Globalization.CultureInfo]::InvariantCulture, [ref]$avatarCost)
if (-not $videoCostOk -or $videoCost -le 0) {
  Add-Check 'AVISO' 'Costo video' 'COST_AI_VIDEO_SECOND no es un numero positivo.' 'Usa COST_AI_VIDEO_SECOND=0.10 como referencia inicial y confirma la tarifa vigente.'
}
else {
  Add-Check 'OK' 'Costo video' "$videoCostText USD por segundo configurado."
}

if (-not $avatarCostOk -or $avatarCost -le 0) {
  Add-Check 'AVISO' 'Costo avatar' 'COST_AVATAR_SECOND no es un numero positivo.' 'Usa COST_AVATAR_SECOND=0.30 como referencia inicial y confirma la tarifa vigente.'
}
elseif ($hasFal -and $falAvatarModel -eq 'fal-ai/longcat-single-avatar/image-audio-to-video' -and $avatarCost -lt 0.30) {
  Add-Check 'AVISO' 'Costo avatar' "El estimado configurado ($avatarCostText USD/s) subestima LongCat 720p." 'Cambia COST_AVATAR_SECOND=0.30 y revisa la tarifa vigente de Fal.ai.'
}
else {
  Add-Check 'OK' 'Costo avatar' "$avatarCostText USD por segundo configurado."
}
Add-Check 'INFO' 'Control de gasto' 'El diagnostico no inicia generaciones ni consume creditos de video.'

if ($Completo) {
  Write-Color ''
  Write-Color '  7. Puerta de calidad completa' White
  if ($npmPath -and $missingModules.Count -eq 0) {
    $typecheck = Invoke-Captured $npmPath @('run', 'typecheck')
    if ($typecheck.ExitCode -eq 0) { Add-Check 'OK' 'TypeScript' 'Validacion estatica superada.' }
    else { Add-Check 'FALTA' 'TypeScript' 'La validacion estatica fallo.' 'Ejecuta npm run typecheck, corrige los errores y repite.' }

    $tests = Invoke-Captured $npmPath @('test')
    if ($tests.ExitCode -eq 0) { Add-Check 'OK' 'Pruebas' 'Pruebas automatizadas superadas.' }
    else { Add-Check 'FALTA' 'Pruebas' 'Una o mas pruebas fallaron.' 'Ejecuta npm test, corrige el fallo y repite.' }

    if ($ServerRunning) {
      Add-Check 'INFO' 'Build' 'Omitido porque el servidor esta abierto y usa la carpeta .next.'
    }
    else {
      $build = Invoke-Captured $npmPath @('run', 'build')
      if ($build.ExitCode -eq 0) { Add-Check 'OK' 'Build' 'Compilacion de produccion superada.' }
      else { Add-Check 'FALTA' 'Build' 'La compilacion de produccion fallo.' 'Ejecuta npm run build, revisa el error y repite.' }
    }
  }
  else {
    Add-Check 'FALTA' 'Calidad' 'No puede ejecutarse hasta instalar Node.js, npm y dependencias.' 'Ejecuta npm install y repite con -Completo.'
  }
}
else {
  Add-Check 'INFO' 'Calidad completa' 'Omitida. Para la primera produccion usa tambien -Completo.'
}

$blockers = @($Checks | Where-Object { $_.status -eq 'FALTA' }).Count
$warnings = @($Checks | Where-Object { $_.status -eq 'AVISO' }).Count
$verdict = 'LISTO PARA PRODUCIR'
if ($blockers -gt 0) { $verdict = 'TODAVIA NO ESTA LISTO' }
elseif ($warnings -gt 0) { $verdict = 'LISTO CON AVISOS' }

$reportPaths = Write-Report (Join-Path $ProjectRoot 'reports') $blockers $warnings $verdict

Write-Color ''
Write-Color '  +------------------------------------------------------------------+' DarkCyan
if ($blockers -eq 0) {
  Write-Color ("  |  {0,-62}|" -f $verdict) Green
}
else {
  Write-Color ("  |  {0,-62}|" -f $verdict) Red
}
Write-Color ("  |  Bloqueadores: {0,-3}  Avisos: {1,-3}                                 |" -f $blockers, $warnings) White
Write-Color '  +------------------------------------------------------------------+' DarkCyan
Write-Color ''

if ($Actions.Count -gt 0) {
  Write-Color '  QUE HACER AHORA (en orden):' Yellow
  $step = 1
  foreach ($action in $Actions) {
    Write-Color "  $step. $action" White
    $step += 1
  }
  Write-Color ''
}
else {
  Write-Color '  Siguiente paso: confirma saldo, ejecuta .\run-dev.ps1 y crea un proyecto NUEVO.' Green
  Write-Color ''
}

Write-Color "  Informe: $($reportPaths.Markdown)" DarkGray
Write-Color '  Ninguna clave secreta fue escrita en el informe.' DarkGray
Write-Color ''

if ($AbrirInforme) { Start-Process $reportPaths.Markdown }
if ($blockers -gt 0) { exit 2 }
exit 0
