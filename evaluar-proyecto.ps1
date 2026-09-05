param(
  [switch]$AbrirInforme,
  [switch]$MostrarDetalles
)

Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'
[Console]::OutputEncoding = [System.Text.Encoding]::UTF8
$OutputEncoding = [System.Text.Encoding]::UTF8

$ProjectRoot = $PSScriptRoot
$StartedAt = Get-Date
$Results = New-Object System.Collections.Generic.List[object]

function Write-Color {
  param([string]$Text, [ConsoleColor]$Color = [ConsoleColor]::Gray)
  Write-Host $Text -ForegroundColor $Color
}

function Write-Header {
  Clear-Host
  Write-Color ''
  Write-Color '  +----------------------------------------------------------+' DarkCyan
  Write-Color '  |          VIRALCINE - PROJECT QUALITY SCANNER            |' Cyan
  Write-Color '  |          Evaluacion tecnica de 1.0 a 10.0               |' DarkCyan
  Write-Color '  +----------------------------------------------------------+' DarkCyan
  Write-Color ''
  Write-Color "  Proyecto: $ProjectRoot" DarkGray
  Write-Color "  Inicio:   $($StartedAt.ToString('yyyy-MM-dd HH:mm:ss'))" DarkGray
  Write-Color ''
}

function Add-Result {
  param(
    [string]$Category,
    [double]$Weight,
    [double]$Earned,
    [string]$Status,
    [string]$Detail
  )

  $safeEarned = [Math]::Max(0, [Math]::Min($Weight, $Earned))
  $Results.Add([pscustomobject]@{
    categoria = $Category
    peso = [Math]::Round($Weight, 2)
    puntos = [Math]::Round($safeEarned, 2)
    estado = $Status
    detalle = $Detail
  })

  $symbol = if ($Status -eq 'OK') { '[OK]' } elseif ($Status -eq 'WARN') { '[!!]' } else { '[X]' }
  $color = if ($Status -eq 'OK') { 'Green' } elseif ($Status -eq 'WARN') { 'Yellow' } else { 'Red' }
  Write-Host ('  {0,-5} {1,-27} {2,5:N1}/{3,-5:N1}' -f $symbol, $Category, $safeEarned, $Weight) -ForegroundColor $color
  if ($MostrarDetalles -or $Status -ne 'OK') {
    Write-Color "        $Detail" DarkGray
  }
}

function Invoke-External {
  param([string]$Executable, [string[]]$Arguments)

  $watch = [System.Diagnostics.Stopwatch]::StartNew()
  $previousErrorAction = $ErrorActionPreference
  try {
    # Native tools such as npm write warnings to stderr even when they finish
    # successfully. PowerShell must use the real process exit code.
    $ErrorActionPreference = 'Continue'
    $commandOutput = & $Executable @Arguments 2>&1 | Out-String
    $exitCode = $LASTEXITCODE
  }
  finally {
    $ErrorActionPreference = $previousErrorAction
  }
  catch {
    $commandOutput = $_.Exception.Message
    $exitCode = 1
  }
  $watch.Stop()

  return [pscustomobject]@{
    ExitCode = $exitCode
    Output = $commandOutput.Trim()
    Seconds = [Math]::Round($watch.Elapsed.TotalSeconds, 2)
  }
}

function Get-CommandPath {
  param([string[]]$Names)
  foreach ($name in $Names) {
    $found = Get-Command $name -ErrorAction SilentlyContinue
    if ($null -ne $found) { return $found.Source }
  }
  return $null
}

function Get-StatusFromRatio {
  param([double]$Ratio)
  if ($Ratio -ge 0.85) { return 'OK' }
  if ($Ratio -ge 0.55) { return 'WARN' }
  return 'FAIL'
}

function Get-Bar {
  param([double]$Score)
  $filled = [Math]::Round(($Score / 10) * 30)
  $filled = [Math]::Max(0, [Math]::Min(30, $filled))
  return ('#' * $filled) + ('-' * (30 - $filled))
}

function Get-Grade {
  param([double]$Score)
  if ($Score -ge 9) { return 'EXCELENTE - listo para produccion controlada' }
  if ($Score -ge 8) { return 'MUY BUENO - faltan ajustes menores' }
  if ($Score -ge 7) { return 'BUENO - funcional, necesita fortalecimiento' }
  if ($Score -ge 6) { return 'ACEPTABLE - requiere correcciones importantes' }
  if ($Score -ge 4) { return 'DEBIL - no recomendado para produccion' }
  return 'CRITICO - requiere reconstruccion prioritaria'
}

function ConvertTo-HtmlSafe {
  param([string]$Value)
  return [System.Net.WebUtility]::HtmlEncode($Value)
}

Write-Header
Set-Location $ProjectRoot

Write-Color '  [1/9] Entorno de ejecucion' Cyan
$nodePath = Get-CommandPath @('node.exe', 'node')
$npmPath = Get-CommandPath @('npm.cmd', 'npm')
$ffmpegPath = Get-CommandPath @('ffmpeg.exe', 'ffmpeg')
$environmentChecks = 0
$environmentNotes = New-Object System.Collections.Generic.List[string]

if ($nodePath) {
  $nodeVersion = (& $nodePath --version).Trim()
  $nodeMajor = [int]($nodeVersion -replace '^v', '').Split('.')[0]
  if ($nodeMajor -ge 22) { $environmentChecks += 1; $environmentNotes.Add("Node $nodeVersion") }
  else { $environmentNotes.Add("Node $nodeVersion; se recomienda 22+") }
} else { $environmentNotes.Add('Node no encontrado') }

if ($npmPath) { $environmentChecks += 1; $environmentNotes.Add("npm $((& $npmPath --version).Trim())") }
else { $environmentNotes.Add('npm no encontrado') }

if ($ffmpegPath) {
  $ffmpegCheck = Invoke-External $ffmpegPath @('-version')
  if ($ffmpegCheck.ExitCode -eq 0) { $environmentChecks += 1; $environmentNotes.Add('FFmpeg disponible') }
  else { $environmentNotes.Add('FFmpeg no responde correctamente') }
} else { $environmentNotes.Add('FFmpeg no encontrado') }

$environmentRatio = $environmentChecks / 3
Add-Result 'Entorno' 10 (10 * $environmentRatio) (Get-StatusFromRatio $environmentRatio) ($environmentNotes -join ' | ')

Write-Color '  [2/9] Estructura del proyecto' Cyan
$requiredPaths = @(
  'package.json', 'package-lock.json', 'tsconfig.json', 'next.config.mjs',
  'app', 'components', 'lib/domain', 'lib/engine', 'lib/media',
  'lib/providers', 'lib/engine/shot-plan.ts', 'lib/providers/google-omni.ts',
  'scripts/worker.ts', 'tests'
)
$presentPaths = @($requiredPaths | Where-Object { Test-Path -LiteralPath (Join-Path $ProjectRoot $_) })
$missingPaths = @($requiredPaths | Where-Object { -not (Test-Path -LiteralPath (Join-Path $ProjectRoot $_)) })
$structureRatio = $presentPaths.Count / $requiredPaths.Count
$structureDetail = if ($missingPaths.Count -eq 0) { "$($presentPaths.Count)/$($requiredPaths.Count) componentes esenciales presentes" } else { "Faltan: $($missingPaths -join ', ')" }
Add-Result 'Arquitectura' 10 (10 * $structureRatio) (Get-StatusFromRatio $structureRatio) $structureDetail

Write-Color '  [3/9] TypeScript y calidad estatica' Cyan
if ($npmPath -and (Test-Path 'node_modules')) {
  $typecheck = Invoke-External $npmPath @('run', 'typecheck')
  if ($typecheck.ExitCode -eq 0) {
    Add-Result 'TypeScript' 15 15 'OK' "Sin errores ($($typecheck.Seconds)s)"
  } else {
    $lastTypeLines = (($typecheck.Output -split "`r?`n") | Select-Object -Last 5) -join ' | '
    Add-Result 'TypeScript' 15 0 'FAIL' $lastTypeLines
  }
} else {
  Add-Result 'TypeScript' 15 0 'FAIL' 'Dependencias ausentes. Ejecuta npm install.'
}

Write-Color '  [4/9] Pruebas automatizadas' Cyan
if ($npmPath -and (Test-Path 'node_modules')) {
  $tests = Invoke-External $npmPath @('test')
  if ($tests.ExitCode -eq 0) {
    $passMatch = [regex]::Match($tests.Output, '(?m)^.*pass\s+(\d+).*$')
    $passed = if ($passMatch.Success) { $passMatch.Groups[1].Value } else { 'todas' }
    Add-Result 'Pruebas' 15 15 'OK' "$passed pruebas aprobadas ($($tests.Seconds)s)"
  } else {
    $lastTestLines = (($tests.Output -split "`r?`n") | Select-Object -Last 6) -join ' | '
    Add-Result 'Pruebas' 15 0 'FAIL' $lastTestLines
  }
} else {
  Add-Result 'Pruebas' 15 0 'FAIL' 'No se pudieron ejecutar sin node_modules.'
}

Write-Color '  [5/9] Compilacion de produccion' Cyan
if ($npmPath -and (Test-Path 'node_modules')) {
  $build = Invoke-External $npmPath @('run', 'build')
  if ($build.ExitCode -eq 0) {
    $warningCount = ([regex]::Matches($build.Output, '(?i)warning')).Count
    $buildPoints = if ($warningCount -eq 0) { 20 } else { 18 }
    $buildStatus = if ($warningCount -eq 0) { 'OK' } else { 'WARN' }
    Add-Result 'Build' 20 $buildPoints $buildStatus "Compilacion exitosa; avisos: $warningCount ($($build.Seconds)s)"
  } else {
    $lastBuildLines = (($build.Output -split "`r?`n") | Select-Object -Last 8) -join ' | '
    Add-Result 'Build' 20 0 'FAIL' $lastBuildLines
  }
} else {
  Add-Result 'Build' 20 0 'FAIL' 'No se pudo compilar sin node_modules.'
}

Write-Color '  [6/9] Seguridad basica' Cyan
$securityPoints = 0.0
$securityNotes = New-Object System.Collections.Generic.List[string]
if (Test-Path '.env.example') { $securityPoints += 2; $securityNotes.Add('.env.example presente') }
else { $securityNotes.Add('Falta .env.example') }

if (Test-Path '.gitignore') {
  $gitignore = Get-Content '.gitignore' -Raw
  if ($gitignore -match '(?m)^\.env|\.env\.local') { $securityPoints += 3; $securityNotes.Add('archivos .env ignorados') }
  else { $securityNotes.Add('.gitignore no protege .env') }
} else { $securityNotes.Add('Falta .gitignore') }

$sourceRoots = @('app', 'components', 'lib', 'scripts') | Where-Object { Test-Path $_ }
$sourceFiles = @()
foreach ($sourceRoot in $sourceRoots) {
  $sourceFiles += Get-ChildItem $sourceRoot -Recurse -File -ErrorAction SilentlyContinue |
    Where-Object { $_.Extension -in @('.ts', '.tsx', '.js', '.mjs', '.ps1') }
}
$secretPattern = '(?i)(sk-[a-z0-9_-]{24,}|AIza[0-9A-Za-z_-]{30,}|(?:FAL_KEY|OPENAI_API_KEY|GEMINI_API_KEY)\s*=\s*["''][^"'']{12,})'
$secretHits = @($sourceFiles | Select-String -Pattern $secretPattern -ErrorAction SilentlyContinue)
if ($secretHits.Count -eq 0) { $securityPoints += 5; $securityNotes.Add('sin claves incrustadas en el codigo') }
else { $securityNotes.Add("posibles secretos encontrados: $($secretHits.Count)") }

$securityStatus = if ($securityPoints -ge 9) { 'OK' } elseif ($securityPoints -ge 6) { 'WARN' } else { 'FAIL' }
Add-Result 'Seguridad' 10 $securityPoints $securityStatus ($securityNotes -join ' | ')

Write-Color '  [7/9] Dependencias y vulnerabilidades' Cyan
$criticalVulnerabilities = 0
$highVulnerabilities = 0
if ($npmPath -and (Test-Path 'package-lock.json')) {
  $audit = Invoke-External $npmPath @('audit', '--json', '--omit=dev')
  try {
    $jsonStart = $audit.Output.IndexOf('{')
    $jsonEnd = $audit.Output.LastIndexOf('}')
    if ($jsonStart -lt 0 -or $jsonEnd -le $jsonStart) { throw 'JSON ausente' }
    $auditJson = $audit.Output.Substring($jsonStart, $jsonEnd - $jsonStart + 1) | ConvertFrom-Json
    $vulns = $auditJson.metadata.vulnerabilities
    $critical = [int]$vulns.critical
    $high = [int]$vulns.high
    $criticalVulnerabilities = $critical
    $highVulnerabilities = $high
    $moderate = [int]$vulns.moderate
    $low = [int]$vulns.low
    if ($critical -gt 0) { $dependencyPoints = 0; $dependencyStatus = 'FAIL' }
    elseif ($high -gt 0) { $dependencyPoints = 4; $dependencyStatus = 'FAIL' }
    elseif ($moderate -gt 0) { $dependencyPoints = 7; $dependencyStatus = 'WARN' }
    elseif ($low -gt 0) { $dependencyPoints = 9; $dependencyStatus = 'WARN' }
    else { $dependencyPoints = 10; $dependencyStatus = 'OK' }
    Add-Result 'Dependencias' 10 $dependencyPoints $dependencyStatus "critical=$critical, high=$high, moderate=$moderate, low=$low"
  }
  catch {
    Add-Result 'Dependencias' 10 5 'WARN' 'npm audit no devolvio JSON legible; revisa la conexion.'
  }
} else {
  Add-Result 'Dependencias' 10 0 'FAIL' 'npm o package-lock.json no disponibles.'
}

Write-Color '  [8/9] Documentacion' Cyan
$documentation = @('README.md', 'INSTRUCCIONES_RAPIDAS.md', 'docs/ARCHITECTURE.md', 'docs/API_PROVIDERS.md', '.env.example')
$documented = @($documentation | Where-Object { Test-Path -LiteralPath $_ })
$docsRatio = $documented.Count / $documentation.Count
Add-Result 'Documentacion' 5 (5 * $docsRatio) (Get-StatusFromRatio $docsRatio) "$($documented.Count)/$($documentation.Count) documentos principales"

Write-Color '  [9/9] Motor audiovisual' Cyan
$pipelinePaths = @(
  'lib/engine/producer.ts', 'lib/engine/shot-plan.ts', 'lib/engine/scene-checkpoints.ts',
  'lib/engine/quality-review.ts', 'lib/media/ffmpeg.ts', 'lib/providers/openai-media.ts',
  'lib/providers/google-omni.ts', 'lib/providers/fal-media.ts', 'lib/providers/veo.ts',
  'scripts/worker.ts', 'app/api/projects/[projectId]/produce/route.ts'
)
$pipelinePresent = @($pipelinePaths | Where-Object { Test-Path -LiteralPath $_ })
$pipelineRatio = $pipelinePresent.Count / $pipelinePaths.Count
Add-Result 'Motor audiovisual' 5 (5 * $pipelineRatio) (Get-StatusFromRatio $pipelineRatio) "$($pipelinePresent.Count)/$($pipelinePaths.Count) modulos operativos presentes"

$TotalPoints = [Math]::Round(($Results | Measure-Object -Property puntos -Sum).Sum, 2)
$RawScore = [Math]::Round($TotalPoints / 10, 1)
$ScoreCap = 10.0
$GateNotes = New-Object System.Collections.Generic.List[string]

$coreFailures = @($Results | Where-Object { $_.categoria -in @('TypeScript', 'Pruebas', 'Build') -and $_.estado -eq 'FAIL' })
if ($coreFailures.Count -gt 0) {
  $ScoreCap = [Math]::Min($ScoreCap, 5.9)
  $GateNotes.Add('La nota fue limitada porque fallo TypeScript, pruebas o build.')
}
if (($Results | Where-Object { $_.categoria -eq 'Seguridad' }).estado -eq 'FAIL') {
  $ScoreCap = [Math]::Min($ScoreCap, 6.9)
  $GateNotes.Add('La nota fue limitada por controles basicos de seguridad.')
}
if ($criticalVulnerabilities -gt 0) {
  $ScoreCap = [Math]::Min($ScoreCap, 5.9)
  $GateNotes.Add("La nota fue limitada por $criticalVulnerabilities vulnerabilidades criticas.")
} elseif ($highVulnerabilities -gt 0) {
  $ScoreCap = [Math]::Min($ScoreCap, 7.9)
  $GateNotes.Add("La nota fue limitada por $highVulnerabilities vulnerabilidades altas.")
}

$Score = [Math]::Round([Math]::Min($RawScore, $ScoreCap), 1)
$Grade = Get-Grade $Score
$FinishedAt = Get-Date
$Elapsed = [Math]::Round(($FinishedAt - $StartedAt).TotalSeconds, 2)

Write-Color ''
Write-Color '  +----------------------------------------------------------+' DarkCyan
Write-Color ("  |  PUNTUACION FINAL: {0,4:N1} / 10.0                         |" -f $Score) White
Write-Color ("  |  [{0}]  {1,-20}                |" -f (Get-Bar $Score), '') Cyan
Write-Color '  +----------------------------------------------------------+' DarkCyan
$gradeColor = if ($Score -ge 8) { 'Green' } elseif ($Score -ge 6) { 'Yellow' } else { 'Red' }
Write-Color "  $Grade" $gradeColor
foreach ($gateNote in $GateNotes) { Write-Color "  $gateNote" Yellow }
Write-Color "  Evaluacion completada en $Elapsed segundos." DarkGray

$ReportDirectory = Join-Path $ProjectRoot 'reports'
if (-not (Test-Path $ReportDirectory)) { New-Item -ItemType Directory -Path $ReportDirectory | Out-Null }
$JsonPath = Join-Path $ReportDirectory 'evaluacion-proyecto.json'
$HtmlPath = Join-Path $ReportDirectory 'evaluacion-proyecto.html'

$report = [ordered]@{
  proyecto = (Split-Path $ProjectRoot -Leaf)
  ruta = $ProjectRoot
  fecha = $FinishedAt.ToString('o')
  puntuacion = $Score
  puntuacion_bruta = $RawScore
  limite_calidad = $ScoreCap
  puntos = $TotalPoints
  maximo = 100
  clasificacion = $Grade
  limites_aplicados = $GateNotes
  duracion_segundos = $Elapsed
  resultados = $Results
}
$report | ConvertTo-Json -Depth 6 | Set-Content -Path $JsonPath -Encoding UTF8

$rows = foreach ($item in $Results) {
  $statusClass = if ($item.estado -eq 'OK') { 'ok' } elseif ($item.estado -eq 'WARN') { 'warn' } else { 'fail' }
  "<tr><td>$(ConvertTo-HtmlSafe $item.categoria)</td><td>$($item.puntos) / $($item.peso)</td><td><span class='badge $statusClass'>$($item.estado)</span></td><td>$(ConvertTo-HtmlSafe $item.detalle)</td></tr>"
}

$html = @"
<!doctype html>
<html lang="es">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>Evaluacion ViralCine - $Score/10</title>
<style>
:root{color-scheme:dark;font-family:Inter,Segoe UI,Arial,sans-serif;background:#080b16;color:#eef2ff}*{box-sizing:border-box}body{margin:0;background:radial-gradient(circle at 80% 5%,#35206b 0,transparent 32%),#080b16;min-height:100vh}.wrap{max-width:1120px;margin:auto;padding:48px 24px}.hero,.card{border:1px solid #ffffff18;background:#11162bcc;backdrop-filter:blur(18px);border-radius:24px;box-shadow:0 24px 80px #0008}.hero{display:grid;grid-template-columns:1fr auto;gap:30px;padding:34px;margin-bottom:24px}.eyebrow{color:#a78bfa;font-weight:800;letter-spacing:.12em;font-size:12px}.title{font-size:34px;margin:10px 0 8px}.muted{color:#94a3b8}.score{width:150px;height:150px;border-radius:50%;display:grid;place-items:center;background:conic-gradient(#8b5cf6 $($Score*10)%,#232942 0);position:relative}.score:after{content:'';position:absolute;inset:12px;background:#101528;border-radius:50%}.score strong{z-index:1;font-size:38px}.score small{z-index:1;color:#94a3b8;margin-left:3px}.card{padding:20px;overflow:auto}table{width:100%;border-collapse:collapse}th,td{text-align:left;padding:15px;border-bottom:1px solid #ffffff12;vertical-align:top}th{color:#94a3b8;font-size:12px;text-transform:uppercase;letter-spacing:.08em}.badge{display:inline-block;padding:5px 9px;border-radius:999px;font-weight:800;font-size:11px}.ok{background:#10b98120;color:#6ee7b7}.warn{background:#f59e0b20;color:#fcd34d}.fail{background:#ef444420;color:#fca5a5}.footer{margin-top:18px;color:#64748b;font-size:13px}@media(max-width:700px){.hero{grid-template-columns:1fr}.score{width:120px;height:120px}.title{font-size:27px}}
</style>
</head>
<body><main class="wrap">
<section class="hero"><div><div class="eyebrow">VIRALCINE PROJECT QUALITY SCANNER</div><h1 class="title">Evaluacion tecnica del proyecto</h1><p class="muted">$Grade</p><p class="muted">Generado: $($FinishedAt.ToString('yyyy-MM-dd HH:mm:ss')) | Duracion: $Elapsed segundos</p></div><div class="score"><div><strong>$Score</strong><small>/10</small></div></div></section>
<section class="card"><table><thead><tr><th>Categoria</th><th>Puntos</th><th>Estado</th><th>Detalle</th></tr></thead><tbody>$($rows -join '')</tbody></table></section>
<div class="footer">Informe generado automaticamente. La nota mide calidad tecnica verificable; no sustituye pruebas reales con proveedores de IA.</div>
</main></body></html>
"@
$html | Set-Content -Path $HtmlPath -Encoding UTF8

Write-Color ''
Write-Color '  Informes generados:' DarkGray
Write-Color "  - $HtmlPath" Cyan
Write-Color "  - $JsonPath" Cyan
Write-Color ''

if ($AbrirInforme) { Start-Process $HtmlPath }

if ($Score -lt 6) { exit 2 }
exit 0
