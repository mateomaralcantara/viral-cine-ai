[CmdletBinding()]
param(
    [string]$ProjectRoot = "",
    [string]$ProjectId = "",
    [switch]$NoDetenerWorkers,
    [switch]$PausarProyecto,
    [switch]$AbrirInforme
)

$ErrorActionPreference = "Stop"
$ProgressPreference = "SilentlyContinue"

$script:Checks = New-Object System.Collections.Generic.List[object]
$script:Findings = New-Object System.Collections.Generic.List[string]
$script:Actions = New-Object System.Collections.Generic.List[string]

function Write-Title {
    param([string]$Text)
    Write-Host ""
    Write-Host ("=" * 76) -ForegroundColor DarkCyan
    Write-Host ("  " + $Text) -ForegroundColor Cyan
    Write-Host ("=" * 76) -ForegroundColor DarkCyan
}

function Add-Check {
    param(
        [ValidateSet("OK", "INFO", "AVISO", "FALTA", "PELIGRO")]
        [string]$Level,
        [string]$Name,
        [string]$Message
    )

    $color = switch ($Level) {
        "OK"      { "Green" }
        "INFO"    { "Cyan" }
        "AVISO"   { "Yellow" }
        "FALTA"   { "Red" }
        "PELIGRO" { "Magenta" }
    }

    Write-Host ("[{0,-7}] {1,-24} {2}" -f $Level, $Name, $Message) -ForegroundColor $color
    [void]$script:Checks.Add([PSCustomObject]@{
        Level = $Level
        Name = $Name
        Message = $Message
    })
}

function Add-Finding {
    param([string]$Text)
    if (-not [string]::IsNullOrWhiteSpace($Text) -and -not $script:Findings.Contains($Text)) {
        [void]$script:Findings.Add($Text)
    }
}

function Add-Action {
    param([string]$Text)
    if (-not [string]::IsNullOrWhiteSpace($Text) -and -not $script:Actions.Contains($Text)) {
        [void]$script:Actions.Add($Text)
    }
}

function Read-DotEnv {
    param([string]$Path)

    $values = [ordered]@{}
    $duplicates = New-Object System.Collections.Generic.List[string]
    if (-not (Test-Path -LiteralPath $Path -PathType Leaf)) {
        return [PSCustomObject]@{ Values = $values; Duplicates = @() }
    }

    foreach ($line in (Get-Content -LiteralPath $Path)) {
        $trimmed = $line.Trim()
        if (-not $trimmed -or $trimmed.StartsWith("#")) { continue }
        if ($trimmed.StartsWith("export ")) { $trimmed = $trimmed.Substring(7).Trim() }
        if ($trimmed -notmatch "^([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)$") { continue }

        $name = $Matches[1]
        $value = $Matches[2].Trim()
        if ($value.Length -ge 2) {
            $first = $value.Substring(0, 1)
            $last = $value.Substring($value.Length - 1, 1)
            if (($first -eq '"' -and $last -eq '"') -or ($first -eq "'" -and $last -eq "'")) {
                $value = $value.Substring(1, $value.Length - 2)
            }
        }

        if ($values.Contains($name)) { [void]$duplicates.Add($name) }
        $values[$name] = $value
    }

    return [PSCustomObject]@{
        Values = $values
        Duplicates = @($duplicates | Sort-Object -Unique)
    }
}

function Env-Value {
    param(
        [System.Collections.IDictionary]$Values,
        [string]$Name,
        [string]$Default = ""
    )
    if ($Values.Contains($Name) -and -not [string]::IsNullOrWhiteSpace([string]$Values[$Name])) {
        return [string]$Values[$Name]
    }
    return $Default
}

function Env-Number {
    param(
        [System.Collections.IDictionary]$Values,
        [string]$Name,
        [double]$Default
    )
    $raw = Env-Value -Values $Values -Name $Name
    $parsed = 0.0
    if ($raw -and [double]::TryParse($raw, [Globalization.NumberStyles]::Float, [Globalization.CultureInfo]::InvariantCulture, [ref]$parsed)) {
        return $parsed
    }
    return $Default
}

function Is-ConfiguredSecret {
    param(
        [System.Collections.IDictionary]$Values,
        [string]$Name
    )
    $value = Env-Value -Values $Values -Name $Name
    if ([string]::IsNullOrWhiteSpace($value)) { return $false }
    $lower = $value.ToLowerInvariant()
    return -not ($lower.Contains("tu_clave") -or $lower.Contains("your_key") -or $lower.Contains("replace_me"))
}

function Test-ProcessProjectLineage {
    param(
        $Process,
        [hashtable]$ProcessMap,
        [string]$Root
    )

    $rootLower = $Root.ToLowerInvariant()
    $current = $Process
    for ($depth = 0; $depth -lt 8 -and $current; $depth += 1) {
        $line = [string]$current.CommandLine
        if ($line.ToLowerInvariant().Contains($rootLower)) { return $true }
        $parentId = [int]$current.ParentProcessId
        if (-not $ProcessMap.ContainsKey($parentId)) { break }
        $current = $ProcessMap[$parentId]
    }
    return $false
}

function Get-ProjectProcesses {
    param([string]$Root)

    $all = @(Get-CimInstance Win32_Process -ErrorAction SilentlyContinue)
    $map = @{}
    foreach ($process in $all) { $map[[int]$process.ProcessId] = $process }

    $workers = @($all | Where-Object {
        $_.Name -eq "node.exe" -and
        ([string]$_.CommandLine) -match "scripts[\\/]worker\.ts" -and
        (Test-ProcessProjectLineage -Process $_ -ProcessMap $map -Root $Root)
    })

    $nodes = @($all | Where-Object {
        $_.Name -eq "node.exe" -and
        (Test-ProcessProjectLineage -Process $_ -ProcessMap $map -Root $Root)
    })

    return [PSCustomObject]@{
        Workers = $workers
        Nodes = $nodes
    }
}

function ConvertTo-SafeMarkdown {
    param([string]$Text)
    if ($null -eq $Text) { return "" }
    return (($Text -replace "\r?\n", " ") -replace "\|", "\\|").Trim()
}

function Write-Utf8File {
    param([string]$Path, [string]$Content)
    $encoding = New-Object System.Text.UTF8Encoding($false)
    [System.IO.File]::WriteAllText($Path, $Content, $encoding)
}

function Get-FolderSummary {
    param([string]$Path)
    if (-not (Test-Path -LiteralPath $Path -PathType Container)) {
        return [PSCustomObject]@{ Count = 0; Bytes = 0; Recent = 0 }
    }
    $files = @(Get-ChildItem -LiteralPath $Path -File -Recurse -ErrorAction SilentlyContinue)
    $cutoff = (Get-Date).AddMinutes(-30)
    return [PSCustomObject]@{
        Count = $files.Count
        Bytes = [double](($files | Measure-Object -Property Length -Sum).Sum)
        Recent = @($files | Where-Object { $_.LastWriteTime -ge $cutoff }).Count
    }
}

function Format-Megabytes {
    param([double]$Bytes)
    return ([Math]::Round($Bytes / 1MB, 2)).ToString("0.00", [Globalization.CultureInfo]::InvariantCulture)
}

function Save-DiagnosticReport {
    param(
        [string]$Path,
        [string]$Root,
        $Project,
        [string]$ProjectFile,
        [int]$WorkersBefore,
        [int]$WorkersAfter,
        [int]$AttemptEvents,
        [double]$ObservedEstimate,
        [object[]]$QualityReports,
        [object[]]$FolderRows,
        [string[]]$RelevantLogs
    )

    $lines = New-Object System.Collections.Generic.List[string]
    [void]$lines.Add("# ViralCine - diagnostico de 5% y consumo de creditos")
    [void]$lines.Add("")
    [void]$lines.Add(("Fecha: {0}" -f (Get-Date -Format "yyyy-MM-dd HH:mm:ss")))
    [void]$lines.Add(("Proyecto raiz: {0}" -f $Root))
    [void]$lines.Add(("Archivo analizado: {0}" -f $ProjectFile))
    [void]$lines.Add("")
    [void]$lines.Add("## Proteccion")
    [void]$lines.Add(("- Workers antes: {0}" -f $WorkersBefore))
    [void]$lines.Add(("- Workers despues: {0}" -f $WorkersAfter))
    [void]$lines.Add(("- Proyecto pausado por el script: {0}" -f [bool]$PausarProyecto))
    [void]$lines.Add("")
    [void]$lines.Add("## Proyecto")
    [void]$lines.Add(("- Titulo: {0}" -f (ConvertTo-SafeMarkdown ([string]$Project.input.title))))
    [void]$lines.Add(("- ID: {0}" -f $Project.id))
    [void]$lines.Add(("- Estado observado: {0}" -f $Project.status))
    [void]$lines.Add(("- Progreso: {0}%" -f $Project.progress.percent))
    [void]$lines.Add(("- Fase: {0}" -f $Project.progress.phase))
    [void]$lines.Add(("- Mensaje: {0}" -f (ConvertTo-SafeMarkdown ([string]$Project.progress.message))))
    [void]$lines.Add("")
    [void]$lines.Add("## Comprobaciones")
    [void]$lines.Add("| Nivel | Comprobacion | Resultado |")
    [void]$lines.Add("|---|---|---|")
    foreach ($check in $script:Checks) {
        [void]$lines.Add(("| {0} | {1} | {2} |" -f $check.Level, (ConvertTo-SafeMarkdown $check.Name), (ConvertTo-SafeMarkdown $check.Message)))
    }
    [void]$lines.Add("")
    [void]$lines.Add("## Hallazgos")
    if ($script:Findings.Count -eq 0) {
        [void]$lines.Add("- No se identifico una causa concluyente; revisar los registros incluidos.")
    } else {
        foreach ($finding in $script:Findings) { [void]$lines.Add(("- " + (ConvertTo-SafeMarkdown $finding))) }
    }
    [void]$lines.Add("")
    [void]$lines.Add("## Intentos y costo aproximado")
    [void]$lines.Add(("- Intentos terminados y auditados encontrados en el registro: {0}" -f $AttemptEvents))
    [void]$lines.Add(('- Estimacion orientativa de esos intentos: US${0:N2}' -f $ObservedEstimate))
    [void]$lines.Add("- No es una factura: un intento puede probar varios proveedores, fallar antes del registro o tener una tarifa distinta.")
    [void]$lines.Add("")
    [void]$lines.Add("## Recursos guardados")
    [void]$lines.Add("| Carpeta | Archivos | MB | Modificados en 30 min |")
    [void]$lines.Add("|---|---:|---:|---:|")
    foreach ($row in $FolderRows) {
        [void]$lines.Add(("| {0} | {1} | {2} | {3} |" -f $row.Name, $row.Count, $row.MB, $row.Recent))
    }
    [void]$lines.Add("")
    [void]$lines.Add("## Informes de calidad recientes")
    if ($QualityReports.Count -eq 0) {
        [void]$lines.Add("- No se encontraron informes JSON de calidad.")
    } else {
        foreach ($report in ($QualityReports | Select-Object -Last 20)) {
            $issues = @($report.issues) -join "; "
            [void]$lines.Add(("- Escena {0}, toma {1}, intento {2}: {3}/10, aprobado={4}, critico={5}. {6}" -f
                $report.order, $report.shotOrder, $report.attempt, $report.overallScore, $report.passed, $report.criticalFailure, (ConvertTo-SafeMarkdown $issues)))
        }
    }
    [void]$lines.Add("")
    [void]$lines.Add("## Registros relevantes")
    if ($RelevantLogs.Count -eq 0) {
        [void]$lines.Add("- Sin coincidencias relevantes.")
    } else {
        foreach ($entry in $RelevantLogs) { [void]$lines.Add(("- " + (ConvertTo-SafeMarkdown $entry))) }
    }
    [void]$lines.Add("")
    [void]$lines.Add("## Que hacer antes de reiniciar")
    $number = 1
    foreach ($action in $script:Actions) {
        [void]$lines.Add(("{0}. {1}" -f $number, (ConvertTo-SafeMarkdown $action)))
        $number += 1
    }
    [void]$lines.Add("")
    [void]$lines.Add("Este diagnostico no llamo a OpenAI, Gemini, Veo ni Fal.ai y no contiene claves secretas.")

    Write-Utf8File -Path $Path -Content (($lines.ToArray() -join "`r`n") + "`r`n")
}

try {
    Write-Title "VIRALCINE - FRENO DE CREDITOS Y DIAGNOSTICO DEL 5%"
    Write-Host "Este script no llama a ninguna API de IA." -ForegroundColor Green

    if ([string]::IsNullOrWhiteSpace($ProjectRoot)) {
        $scriptFolder = Split-Path -Parent $MyInvocation.MyCommand.Path
        if (Test-Path -LiteralPath (Join-Path $scriptFolder "package.json")) {
            $ProjectRoot = $scriptFolder
        } else {
            $ProjectRoot = (Get-Location).Path
        }
    }

    if (-not (Test-Path -LiteralPath $ProjectRoot -PathType Container)) {
        throw "No existe la carpeta: $ProjectRoot"
    }
    $ProjectRoot = (Resolve-Path -LiteralPath $ProjectRoot).Path

    $packagePath = Join-Path $ProjectRoot "package.json"
    $envPath = Join-Path $ProjectRoot ".env.local"
    if (-not (Test-Path -LiteralPath $packagePath -PathType Leaf)) {
        throw "No se encontro package.json. Usa -ProjectRoot con la carpeta viral-cine-ai."
    }

    $package = Get-Content -LiteralPath $packagePath -Raw | ConvertFrom-Json
    Add-Check "OK" "Proyecto" ("{0} {1}" -f $package.name, $package.version)

    $dotenv = Read-DotEnv -Path $envPath
    $envValues = $dotenv.Values
    if (-not (Test-Path -LiteralPath $envPath)) {
        Add-Check "FALTA" ".env.local" "No existe; ViralCine puede iniciar en modo demo."
        Add-Finding "Falta .env.local y el sistema puede producir contenido de demostracion."
    } else {
        Add-Check "OK" ".env.local" "Encontrado; no se mostraran secretos."
    }
    if ($dotenv.Duplicates.Count -gt 0) {
        Add-Check "AVISO" "Variables repetidas" ($dotenv.Duplicates -join ", ")
        Add-Finding "Hay variables duplicadas en .env.local; la ultima definicion es la efectiva."
    }

    $mode = Env-Value -Values $envValues -Name "PRODUCTION_MODE" -Default "demo"
    $provider = Env-Value -Values $envValues -Name "VIDEO_PROVIDER" -Default "auto"
    $qualityMode = Env-Value -Values $envValues -Name "SCENE_QUALITY_MODE" -Default "strict"
    $qualityThreshold = Env-Number -Values $envValues -Name "SCENE_QUALITY_MIN_SCORE" -Default 9.0
    $maxAttempts = [int](Env-Number -Values $envValues -Name "SCENE_QUALITY_MAX_ATTEMPTS" -Default 3)

    Write-Title "1. DETENER EL CONSUMO"
    $processesBefore = Get-ProjectProcesses -Root $ProjectRoot
    $workersBefore = @($processesBefore.Workers)

    if ($workersBefore.Count -eq 0) {
        Add-Check "OK" "Workers" "No habia workers de este proyecto ejecutandose."
    } elseif ($workersBefore.Count -eq 1) {
        Add-Check "AVISO" "Worker activo" ("PID {0}; podia continuar consumiendo creditos." -f $workersBefore[0].ProcessId)
    } else {
        Add-Check "PELIGRO" "Workers duplicados" ("Se detectaron {0}; pueden generar la misma toma simultaneamente." -f $workersBefore.Count)
        Add-Finding ("Habia {0} workers. ViralCine 3.0.3 no implementa un bloqueo global entre procesos." -f $workersBefore.Count)
    }

    if (-not $NoDetenerWorkers -and $workersBefore.Count -gt 0) {
        foreach ($worker in $workersBefore) {
            Stop-Process -Id $worker.ProcessId -Force -ErrorAction SilentlyContinue
        }
        Start-Sleep -Seconds 2
    } elseif ($NoDetenerWorkers -and $workersBefore.Count -gt 0) {
        Add-Check "PELIGRO" "Consumo activo" "Se solicito -NoDetenerWorkers; el consumo puede continuar."
        Add-Action "Deten los workers antes de hacer otra prueba."
    }

    $processesAfter = Get-ProjectProcesses -Root $ProjectRoot
    $workersAfter = @($processesAfter.Workers)
    if (-not $NoDetenerWorkers) {
        if ($workersAfter.Count -eq 0) {
            Add-Check "OK" "Freno" "Workers detenidos. No se iniciaran nuevas solicitudes mientras permanezcan apagados."
            Add-Check "INFO" "Operacion en vuelo" "Una generacion que Google/Fal ya hubiera aceptado puede terminar y cobrarse; el freno evita las siguientes."
        } else {
            Add-Check "PELIGRO" "Freno incompleto" ("Todavia quedan {0} workers." -f $workersAfter.Count)
            Add-Action "Cierra todas las ventanas de ViralCine y vuelve a ejecutar este diagnostico."
        }
    }

    Write-Title "2. CONFIGURACION SIN PROBAR APIs"
    if ($mode -eq "real") {
        Add-Check "OK" "Modo" "PRODUCTION_MODE=real"
    } else {
        Add-Check "FALTA" "Modo" ("PRODUCTION_MODE={0}; produciria placas y silencio." -f $mode)
        Add-Finding "El modo no es real."
    }
    Add-Check "INFO" "Router" ("VIDEO_PROVIDER={0}" -f $provider)
    Add-Check "INFO" "Calidad" ("modo={0}; minimo={1}/10; intentos={2}" -f $qualityMode, $qualityThreshold, $maxAttempts)
    $hasGemini = [bool](Is-ConfiguredSecret $envValues "GEMINI_API_KEY")
    $hasOpenAI = [bool](Is-ConfiguredSecret $envValues "OPENAI_API_KEY")
    $hasFal = [bool](Is-ConfiguredSecret $envValues "FAL_KEY")
    $geminiLevel = if ($hasGemini) { "OK" } else { "FALTA" }
    $openAILevel = if ($hasOpenAI) { "OK" } else { "FALTA" }
    $falLevel = if ($hasFal) { "OK" } else { "INFO" }
    Add-Check $geminiLevel "Gemini" "Clave detectada: $hasGemini; no fue probada."
    Add-Check $openAILevel "OpenAI" "Clave detectada: $hasOpenAI; no fue probada."
    Add-Check $falLevel "Fal.ai" "Clave detectada: $hasFal; no fue probada."

    if ($qualityMode -ne "off" -and $qualityThreshold -ge 9 -and $maxAttempts -ge 3) {
        Add-Check "PELIGRO" "Regeneracion automatica" "Una toma puede generarse y auditarse hasta 3 veces antes de pausar."
        Add-Finding "La puerta de calidad 9/10 con 3 intentos es demasiado agresiva para controlar el gasto."
        Add-Action "Antes de reanudar, usa SCENE_QUALITY_MIN_SCORE=8.0 y SCENE_QUALITY_MAX_ATTEMPTS=1; asi una toma fallida se pausa despues del primer intento."
    }

    $configuredData = Env-Value -Values $envValues -Name "VIRALCINE_DATA_DIR" -Default ".data"
    $dataRoot = if ([IO.Path]::IsPathRooted($configuredData)) {
        [IO.Path]::GetFullPath($configuredData)
    } else {
        [IO.Path]::GetFullPath((Join-Path $ProjectRoot $configuredData))
    }
    $projectsRoot = Join-Path $dataRoot "projects"
    if (-not (Test-Path -LiteralPath $projectsRoot -PathType Container)) {
        throw "No existe la carpeta de proyectos: $projectsRoot"
    }

    Write-Title "3. PROYECTO BLOQUEADO"
    $projectFiles = @(Get-ChildItem -LiteralPath $projectsRoot -Directory -ErrorAction SilentlyContinue |
        ForEach-Object {
            $candidate = Join-Path $_.FullName "project.json"
            if (Test-Path -LiteralPath $candidate -PathType Leaf) { Get-Item -LiteralPath $candidate }
        })

    if ($projectFiles.Count -eq 0) { throw "No se encontraron proyectos." }

    $projectRows = New-Object System.Collections.Generic.List[object]
    foreach ($file in $projectFiles) {
        try {
            $value = Get-Content -LiteralPath $file.FullName -Raw | ConvertFrom-Json
            [void]$projectRows.Add([PSCustomObject]@{ Project = $value; File = $file; Modified = $file.LastWriteTimeUtc })
        } catch {}
    }
    if ($projectRows.Count -eq 0) { throw "Los project.json no pudieron analizarse." }

    $selected = $null
    if (-not [string]::IsNullOrWhiteSpace($ProjectId)) {
        $selected = $projectRows | Where-Object { $_.Project.id -eq $ProjectId } | Select-Object -First 1
        if (-not $selected) { throw "No existe el proyecto $ProjectId" }
    } else {
        $sortProperties = @(
            @{ Expression = { if ($_.Project.status -in @('producing','queued','quality-review','planning','composing')) { 1 } else { 0 } }; Descending = $true }
            @{ Expression = { $_.Modified }; Descending = $true }
        )
        $selected = $projectRows |
            Sort-Object -Property $sortProperties |
            Select-Object -First 1
    }

    $project = $selected.Project
    $projectSnapshot = ($project | ConvertTo-Json -Depth 100) | ConvertFrom-Json
    $projectFile = $selected.File.FullName
    $projectFolder = $selected.File.Directory.FullName
    $observedStatus = [string]$project.status

    Add-Check "OK" "Proyecto analizado" ("{0} | {1}" -f $project.input.title, $project.id)
    Add-Check "INFO" "Estado" ("estado={0}; fase={1}; progreso={2}%" -f $observedStatus, $project.progress.phase, $project.progress.percent)
    Add-Check "INFO" "Mensaje" ([string]$project.progress.message)

    if ([int]$project.progress.percent -le 5) {
        if ([string]$project.progress.phase -eq "planning" -or $observedStatus -eq "planning") {
            Add-Finding "El 5% corresponde a planificacion del guion; el bloqueo esta antes de las generaciones de video."
        } else {
            Add-Finding "El 5% corresponde al inicio de la primera escena o toma; el porcentaje no avanza hasta que esa unidad sea aprobada."
        }
    }

    if ($PausarProyecto -and $observedStatus -in @("planning", "queued", "producing", "composing")) {
        if ($workersAfter.Count -gt 0) {
            Add-Check "PELIGRO" "Pausa del proyecto" "No se modifico project.json porque todavia hay un worker activo."
        } else {
            $backup = $projectFile + (".backup-creditos-{0}" -f (Get-Date -Format "yyyyMMdd-HHmmss"))
            Copy-Item -LiteralPath $projectFile -Destination $backup -Force
            $project.status = "cancelled"
            $pauseError = "Pausado manualmente para diagnosticar consumo de creditos. Los recursos ya creados se conservaron."
            if ($project.PSObject.Properties["error"]) {
                $project.error = $pauseError
            } else {
                $project | Add-Member -NotePropertyName "error" -NotePropertyValue $pauseError
            }
            $newProgress = [ordered]@{
                phase = "credit-protection"
                percent = [double]$project.progress.percent
                message = "Produccion pausada para proteger creditos"
                updatedAt = (Get-Date).ToUniversalTime().ToString("o")
            }
            if ($null -ne $project.progress.currentScene) { $newProgress["currentScene"] = [int]$project.progress.currentScene }
            if ($null -ne $project.progress.totalScenes) { $newProgress["totalScenes"] = [int]$project.progress.totalScenes }
            $project.progress = [PSCustomObject]$newProgress
            $project.updatedAt = (Get-Date).ToUniversalTime().ToString("o")
            $logs = @($project.productionLog)
            $project.productionLog = @($logs + ("{0} Produccion pausada por diagnostico de creditos" -f (Get-Date).ToUniversalTime().ToString("o")))
            $json = $project | ConvertTo-Json -Depth 100
            $temporary = $projectFile + ".tmp-credit-protection"
            Write-Utf8File -Path $temporary -Content ($json + "`r`n")
            Move-Item -LiteralPath $temporary -Destination $projectFile -Force
            Add-Check "OK" "Proyecto pausado" ("Estado cancelado recuperable; respaldo {0}" -f (Split-Path -Leaf $backup))
            Add-Action "No pulses Iniciar produccion hasta aplicar los limites de calidad recomendados."
        }
    } elseif ($PausarProyecto -and $observedStatus -eq "quality-review") {
        Add-Check "OK" "Proyecto pausado" "Ya estaba detenido en revision de calidad."
    } elseif (-not $PausarProyecto -and $observedStatus -in @("planning", "queued", "producing", "composing")) {
        Add-Check "AVISO" "Estado recuperable" "Al reiniciar el worker, ViralCine puede poner este proyecto en cola automaticamente."
        Add-Action "Vuelve a ejecutar con -PausarProyecto antes de iniciar ViralCine."
    }

    $scenes = @()
    $shots = @()
    if ($project.plan) {
        $scenes = @($project.plan.scenes)
        foreach ($scene in $scenes) {
            foreach ($shot in @($scene.shots)) {
                [void]($shots += [PSCustomObject]@{ Scene = $scene; Shot = $shot })
            }
        }
        Add-Check "INFO" "Plan" ("escenas={0}; tomas={1}" -f $scenes.Count, $shots.Count)

        $sceneSummary = @($scenes | Group-Object status | ForEach-Object { "{0}={1}" -f $_.Name, $_.Count }) -join ", "
        $shotSummary = @($shots | ForEach-Object { $_.Shot } | Group-Object status | ForEach-Object { "{0}={1}" -f $_.Name, $_.Count }) -join ", "
        Add-Check "INFO" "Estados escenas" $sceneSummary
        Add-Check "INFO" "Estados tomas" $shotSummary

        $currentPair = $shots | Where-Object { $_.Shot.status -in @("rendering", "review-required", "failed") } | Select-Object -First 1
        if (-not $currentPair) { $currentPair = $shots | Where-Object { $_.Shot.status -eq "pending" } | Select-Object -First 1 }
        if ($currentPair) {
            $shot = $currentPair.Shot
            $scene = $currentPair.Scene
            Add-Check "INFO" "Toma actual" ("escena {0}, toma {1}: {2}; estado={3}; calidad={4}; intentos={5}" -f
                $scene.order, $shot.order, $shot.title, $shot.status, $shot.qualityScore, $shot.qualityAttempts)
            if ($shot.error) { Add-Check "FALTA" "Error de toma" ([string]$shot.error) }
            if ([int]$shot.qualityAttempts -ge $maxAttempts -or $shot.status -eq "review-required") {
                Add-Finding ("La escena {0}, toma {1}, agoto o esta agotando los reintentos de calidad." -f $scene.order, $shot.order)
            }
        }

        if ($shots.Count -gt 0 -and $maxAttempts -gt 1) {
            $maximumGenerations = $shots.Count * $maxAttempts
            Add-Check "AVISO" "Exposicion maxima" ("{0} tomas x {1} intentos = hasta {2} generaciones, sin contar fallos entre proveedores." -f $shots.Count, $maxAttempts, $maximumGenerations)
        }
    } else {
        Add-Check "AVISO" "Plan" "El proyecto todavia no tiene escenas ni tomas."
    }

    Write-Title "4. INTENTOS, CALIDAD Y ERRORES"
    $allLogs = @($project.productionLog)
    $attemptMatches = New-Object System.Collections.Generic.List[object]
    foreach ($entry in $allLogs) {
        if ([string]$entry -match "Escena\s+(\d+),\s+(?:plano|toma)\s+(\d+),\s+intento\s+(\d+):\s+([0-9]+(?:[\.,][0-9]+)?)/10") {
            [void]$attemptMatches.Add([PSCustomObject]@{
                SceneOrder = [int]$Matches[1]
                ShotOrder = [int]$Matches[2]
                Attempt = [int]$Matches[3]
                Score = [double]::Parse(($Matches[4] -replace ",", "."), [Globalization.CultureInfo]::InvariantCulture)
                Log = [string]$entry
            })
        }
    }

    Add-Check "INFO" "Intentos registrados" ("{0} generaciones llegaron a auditoria de calidad." -f $attemptMatches.Count)
    $repeatGroups = @($attemptMatches | Group-Object SceneOrder, ShotOrder | Where-Object { $_.Count -gt 1 } | Sort-Object Count -Descending)
    if ($repeatGroups.Count -gt 0) {
        $worst = $repeatGroups[0]
        Add-Check "PELIGRO" "Toma regenerada" ("{0} tuvo {1} intentos completos." -f $worst.Name, $worst.Count)
        Add-Finding "Una o mas tomas fueron generadas repetidamente porque no alcanzaron la puntuacion minima."
    }

    $videoSecondCost = Env-Number -Values $envValues -Name "COST_AI_VIDEO_SECOND" -Default ((Env-Number $envValues "COST_AI_VIDEO_8S" 0.8) / 8)
    $avatarSecondCost = Env-Number -Values $envValues -Name "COST_AVATAR_SECOND" -Default 0.30
    $observedEstimate = 0.0
    foreach ($attempt in $attemptMatches) {
        $pair = $shots | Where-Object { [int]$_.Scene.order -eq $attempt.SceneOrder -and [int]$_.Shot.order -eq $attempt.ShotOrder } | Select-Object -First 1
        if ($pair) {
            $rate = if ([string]$pair.Shot.mode -eq "avatar-video") { $avatarSecondCost } else { $videoSecondCost }
            $observedEstimate += ([double]$pair.Shot.durationSeconds * $rate)
        }
    }
    $observedEstimate = [Math]::Round($observedEstimate, 2)
    Add-Check "INFO" "Costo orientativo" ('US${0:N2} para intentos auditados segun tarifas configuradas; no es la factura real.' -f $observedEstimate)

    $qualityFolder = Join-Path $projectFolder "quality"
    $qualityReports = New-Object System.Collections.Generic.List[object]
    if (Test-Path -LiteralPath $qualityFolder -PathType Container) {
        foreach ($file in (Get-ChildItem -LiteralPath $qualityFolder -Filter "*.json" -File -ErrorAction SilentlyContinue | Sort-Object LastWriteTime)) {
            try {
                $report = Get-Content -LiteralPath $file.FullName -Raw | ConvertFrom-Json
                if ($null -ne $report.overallScore) { [void]$qualityReports.Add($report) }
            } catch {}
        }
    }
    Add-Check "INFO" "Informes calidad" ("{0} archivos JSON encontrados." -f $qualityReports.Count)
    if ($qualityReports.Count -gt 0) {
        $failedReports = @($qualityReports | Where-Object { $_.passed -ne $true })
        $criticalReports = @($qualityReports | Where-Object { $_.criticalFailure -eq $true })
        $average = [Math]::Round((($qualityReports | Measure-Object -Property overallScore -Average).Average), 2)
        $qualityLevel = if ($failedReports.Count -gt 0) { "AVISO" } else { "OK" }
        Add-Check $qualityLevel "Resultado calidad" ("promedio={0}/10; fallidos={1}; criticos={2}" -f $average, $failedReports.Count, $criticalReports.Count)
        if ($average -lt $qualityThreshold) {
            Add-Finding ("La puntuacion media {0}/10 esta por debajo del minimo {1}/10 y provoca regeneraciones." -f $average, $qualityThreshold)
        }
    }

    $errorPattern = "429|401|403|Forbidden|Unprocessable|RESOURCE_EXHAUSTED|prepayment|credit|credit|Todos los proveedores|no pudo generar|fallo|fallo|rechaz"
    $relevantLogs = @($allLogs | Where-Object { [string]$_ -match $errorPattern } | Select-Object -Last 80)
    if ($project.error) { $relevantLogs += ("ERROR ACTUAL: " + [string]$project.error) }
    if ($relevantLogs.Count -gt 0) {
        Add-Check "AVISO" "Errores encontrados" ("{0} eventos relevantes; incluidos en el informe." -f $relevantLogs.Count)
    } else {
        Add-Check "INFO" "Errores encontrados" "No aparecen errores explicitos de proveedor en el registro guardado."
    }

    Write-Title "5. ARCHIVOS Y CHECKPOINTS"
    $folderRows = New-Object System.Collections.Generic.List[object]
    foreach ($name in @("images", "audio", "video", "quality", "checkpoints", "exports")) {
        $summary = Get-FolderSummary -Path (Join-Path $projectFolder $name)
        [void]$folderRows.Add([PSCustomObject]@{
            Name = $name
            Count = $summary.Count
            MB = Format-Megabytes $summary.Bytes
            Recent = $summary.Recent
        })
        Add-Check "INFO" $name ("archivos={0}; MB={1}; ultimos 30 min={2}" -f $summary.Count, (Format-Megabytes $summary.Bytes), $summary.Recent)
    }

    $partials = @(Get-ChildItem -LiteralPath (Join-Path $projectFolder "video") -File -ErrorAction SilentlyContinue | Where-Object { $_.Name -match "partial|raw" })
    if ($partials.Count -gt 0) {
        Add-Check "AVISO" "Videos parciales/raw" ("{0} archivos; una llamada pudo detenerse despues de generar o descargar." -f $partials.Count)
    }

    $checkpointFiles = @(Get-ChildItem -LiteralPath (Join-Path $projectFolder "checkpoints") -Filter "*.json" -File -ErrorAction SilentlyContinue)
    $legacyCheckpoints = 0
    foreach ($checkpoint in $checkpointFiles) {
        try {
            $value = Get-Content -LiteralPath $checkpoint.FullName -Raw | ConvertFrom-Json
            if ([int]$value.version -eq 1) { $legacyCheckpoints += 1 }
        } catch {}
    }
    if ($legacyCheckpoints -gt 0) {
        Add-Check "AVISO" "Checkpoints v1" ("{0} no registran si fueron creados en demo ni que proveedor pagado usaron." -f $legacyCheckpoints)
        Add-Finding "Los checkpoints version 1 pueden reutilizar contenido antiguo sin demostrar su origen real."
    }

    Add-Action "No reinicies run-dev.ps1 hasta revisar este informe; el sistema recupera automaticamente proyectos interrumpidos."
    if ($provider -ne "auto") { Add-Action "Usa VIDEO_PROVIDER=auto para probar Gemini Omni, luego Veo y por ultimo Fal.ai." }
    if ($workersBefore.Count -gt 1) { Add-Action "Inicia ViralCine una sola vez y confirma que exista exactamente un scripts/worker.ts." }
    Add-Action "Prueba una sola toma o escena antes de reanudar la pelicula completa y verifica movimiento y voz."

    $reportsRoot = Join-Path $ProjectRoot "reports"
    New-Item -ItemType Directory -Path $reportsRoot -Force | Out-Null
    $reportPath = Join-Path $reportsRoot ("diagnostico-5-porciento-creditos-{0}.md" -f (Get-Date -Format "yyyyMMdd-HHmmss"))
    $reportArguments = @{
        Path = $reportPath
        Root = $ProjectRoot
        Project = $projectSnapshot
        ProjectFile = $projectFile
        WorkersBefore = $workersBefore.Count
        WorkersAfter = $workersAfter.Count
        AttemptEvents = $attemptMatches.Count
        ObservedEstimate = $observedEstimate
        QualityReports = $qualityReports.ToArray()
        FolderRows = $folderRows.ToArray()
        RelevantLogs = $relevantLogs
    }
    Save-DiagnosticReport @reportArguments

    Write-Title "DIAGNOSTICO TERMINADO SIN CONSUMIR CREDITOS"
    Add-Check "OK" "Informe" $reportPath
    if ($workersAfter.Count -eq 0) {
        Write-Host "El motor de produccion esta detenido. No lo reinicies todavia." -ForegroundColor Green
    }
    if ($script:Findings.Count -gt 0) {
        Write-Host ""
        Write-Host "CAUSAS PROBABLES:" -ForegroundColor Yellow
        foreach ($finding in $script:Findings) { Write-Host ("- " + $finding) -ForegroundColor Yellow }
    }
    Write-Host ""
    Write-Host "Pegame el contenido del informe generado." -ForegroundColor Cyan

    if ($AbrirInforme) { Start-Process notepad.exe -ArgumentList $reportPath }
    exit 0
} catch {
    Write-Host ""
    Add-Check "FALTA" "Diagnostico" $_.Exception.Message
    Write-Host "No se llamo a ninguna API ni se mostro ninguna clave." -ForegroundColor Gray
    exit 1
}
