[CmdletBinding()]
param(
    [string]$ProjectRoot = "",
    [ValidateSet("auto", "omni", "veo")]
    [string]$Proveedor = "auto",
    [switch]$PruebaFacturable,
    [switch]$AbrirInforme
)

$ErrorActionPreference = "Stop"
$ProgressPreference = "SilentlyContinue"

function Write-Title {
    param([string]$Text)
    Write-Host ""
    Write-Host ("=" * 72) -ForegroundColor DarkCyan
    Write-Host ("  " + $Text) -ForegroundColor Cyan
    Write-Host ("=" * 72) -ForegroundColor DarkCyan
}

function Write-Check {
    param(
        [ValidateSet("OK", "INFO", "AVISO", "FALTA")]
        [string]$Level,
        [string]$Name,
        [string]$Message
    )

    $color = switch ($Level) {
        "OK"    { "Green" }
        "INFO"  { "Cyan" }
        "AVISO" { "Yellow" }
        "FALTA" { "Red" }
    }

    Write-Host ("[{0,-6}] {1,-24} {2}" -f $Level, $Name, $Message) -ForegroundColor $color
}

function Get-EnvValue {
    param(
        [string[]]$Lines,
        [string]$Name
    )

    $pattern = "^\s*" + [regex]::Escape($Name) + "\s*="
    $matches = @($Lines | Where-Object { $_ -match $pattern })
    if ($matches.Count -eq 0) {
        return ""
    }

    $value = (($matches[-1] -split "=", 2)[1]).Trim()
    if ($value.Length -ge 2) {
        if (($value.StartsWith('"') -and $value.EndsWith('"')) -or
            ($value.StartsWith("'") -and $value.EndsWith("'"))) {
            $value = $value.Substring(1, $value.Length - 2)
        }
    }
    return $value.Trim()
}

function Set-EnvValues {
    param(
        [string[]]$Lines,
        [System.Collections.IDictionary]$Values,
        [string]$Destination
    )

    $result = New-Object System.Collections.Generic.List[string]

    foreach ($line in $Lines) {
        $managed = $false
        foreach ($name in $Values.Keys) {
            $pattern = "^\s*" + [regex]::Escape([string]$name) + "\s*="
            if ($line -match $pattern) {
                $managed = $true
                break
            }
        }

        if (-not $managed) {
            [void]$result.Add($line)
        }
    }

    if ($result.Count -gt 0 -and -not [string]::IsNullOrWhiteSpace($result[$result.Count - 1])) {
        [void]$result.Add("")
    }

    [void]$result.Add("# Google/Gemini: configuracion administrada por configurar-google-y-verificar-saldo.ps1")
    foreach ($name in $Values.Keys) {
        $value = [string]$Values[$name]
        if ($value.Contains("`r") -or $value.Contains("`n")) {
            throw "La variable $name contiene un salto de linea no permitido."
        }
        [void]$result.Add(("{0}={1}" -f $name, $value))
    }

    $encoding = New-Object System.Text.UTF8Encoding($false)
    [System.IO.File]::WriteAllLines($Destination, $result.ToArray(), $encoding)
}

function Get-HttpFailure {
    param([System.Management.Automation.ErrorRecord]$Record)

    $statusCode = $null
    $body = ""

    try {
        $statusCode = [int]$Record.Exception.Response.StatusCode
    } catch {}

    if ($Record.ErrorDetails -and $Record.ErrorDetails.Message) {
        $body = [string]$Record.ErrorDetails.Message
    }

    if ([string]::IsNullOrWhiteSpace($body)) {
        try {
            $stream = $Record.Exception.Response.GetResponseStream()
            if ($stream) {
                $reader = New-Object System.IO.StreamReader($stream)
                try {
                    $body = $reader.ReadToEnd()
                } finally {
                    $reader.Dispose()
                }
            }
        } catch {}
    }

    if ([string]::IsNullOrWhiteSpace($body)) {
        $body = [string]$Record.Exception.Message
    }

    [PSCustomObject]@{
        StatusCode = $statusCode
        Body       = $body
    }
}

function Get-FriendlyGoogleError {
    param($Failure)

    $text = [string]$Failure.Body
    $lower = $text.ToLowerInvariant()

    if ($Failure.StatusCode -eq 429 -or $lower.Contains("resource_exhausted") -or
        $lower.Contains("prepayment credits are depleted")) {
        return "Google acepto la solicitud, pero esta clave no tiene saldo Prepay positivo o su cuota esta agotada. Los US$300 del Free Trial de Google Cloud no pagan Gemini API en AI Studio."
    }

    if ($Failure.StatusCode -eq 400 -and $lower.Contains("billing")) {
        return "La facturacion de Gemini no esta activa para el proyecto asociado a esta clave."
    }

    if ($Failure.StatusCode -eq 401) {
        return "La clave no es valida o fue revocada (HTTP 401)."
    }

    if ($Failure.StatusCode -eq 403) {
        return "Google rechazo el acceso (HTTP 403). Revisa restricciones de la clave, API habilitada y permisos del proyecto."
    }

    if ($Failure.StatusCode -eq 404 -or $lower.Contains("not found")) {
        return "El modelo configurado no esta disponible para esta clave o region."
    }

    $compact = ($text -replace "\s+", " ").Trim()
    if ($compact.Length -gt 360) {
        $compact = $compact.Substring(0, 360) + "..."
    }
    return ("Google devolvio HTTP {0}: {1}" -f $Failure.StatusCode, $compact)
}

function Find-VideoUri {
    param($Operation)

    $candidates = @()
    try { $candidates += [string]$Operation.response.generateVideoResponse.generatedSamples[0].video.uri } catch {}
    try { $candidates += [string]$Operation.response.generatedVideos[0].video.uri } catch {}
    try { $candidates += [string]$Operation.response.generatedSamples[0].video.uri } catch {}

    return @($candidates | Where-Object { -not [string]::IsNullOrWhiteSpace($_) } | Select-Object -First 1)[0]
}

$script:ReportLines = New-Object System.Collections.Generic.List[string]
function Add-ReportLine {
    param([string]$Line)
    [void]$script:ReportLines.Add($Line)
}

function Save-Report {
    param(
        [string]$Path,
        [string]$Result
    )

    Add-ReportLine ""
    Add-ReportLine ("Resultado final: **{0}**" -f $Result)
    Add-ReportLine ""
    Add-ReportLine "Notas:"
    Add-ReportLine "- Este informe no contiene la clave API."
    Add-ReportLine "- La API no ofrece un endpoint que devuelva el saldo exacto en dolares."
    Add-ReportLine "- Los US$300 del Free Trial de Google Cloud no son elegibles para pagar Gemini API en AI Studio."

    $encoding = New-Object System.Text.UTF8Encoding($false)
    [System.IO.File]::WriteAllLines($Path, $script:ReportLines.ToArray(), $encoding)
}

try {
    Write-Title "VIRALCINE - GOOGLE PREDETERMINADO Y VERIFICACION DE SALDO"

    if ([string]::IsNullOrWhiteSpace($ProjectRoot)) {
        $scriptFolder = Split-Path -Parent $MyInvocation.MyCommand.Path
        if (Test-Path -LiteralPath (Join-Path $scriptFolder "package.json")) {
            $ProjectRoot = $scriptFolder
        } else {
            $ProjectRoot = (Get-Location).Path
        }
    }

    if (-not (Test-Path -LiteralPath $ProjectRoot -PathType Container)) {
        throw "No existe la carpeta del proyecto: $ProjectRoot"
    }

    $ProjectRoot = (Resolve-Path -LiteralPath $ProjectRoot).Path
    $packagePath = Join-Path $ProjectRoot "package.json"
    $envPath = Join-Path $ProjectRoot ".env.local"
    $reportsFolder = Join-Path $ProjectRoot "reports"
    $googleReportsFolder = Join-Path $reportsFolder "google"

    if (-not (Test-Path -LiteralPath $packagePath -PathType Leaf)) {
        throw "No se encontro package.json. Usa -ProjectRoot con la carpeta viral-cine-ai."
    }

    if (-not (Test-Path -LiteralPath $envPath -PathType Leaf)) {
        throw "No se encontro .env.local. Crealo dentro de viral-cine-ai y agrega GEMINI_API_KEY."
    }

    New-Item -ItemType Directory -Path $googleReportsFolder -Force | Out-Null
    $timestamp = Get-Date -Format "yyyyMMdd-HHmmss"
    $reportPath = Join-Path $googleReportsFolder ("verificacion-google-{0}.md" -f $timestamp)

    Add-ReportLine "# ViralCine - verificacion de Google"
    Add-ReportLine ""
    Add-ReportLine ("Fecha: {0}" -f (Get-Date -Format "yyyy-MM-dd HH:mm:ss"))
    Add-ReportLine ("Proyecto: {0}" -f $ProjectRoot)

    Write-Host ("Proyecto: {0}" -f $ProjectRoot) -ForegroundColor Gray
    Write-Host ("Proveedor solicitado: {0}" -f $Proveedor) -ForegroundColor Gray

    Write-Title "1. Configurar Google como proveedor predeterminado"

    $lines = @(Get-Content -LiteralPath $envPath)
    $geminiKey = Get-EnvValue -Lines $lines -Name "GEMINI_API_KEY"

    if ([string]::IsNullOrWhiteSpace($geminiKey)) {
        throw "GEMINI_API_KEY no existe o esta vacia en .env.local."
    }

    $backupPath = $envPath + (".backup-google-{0}" -f $timestamp)
    Copy-Item -LiteralPath $envPath -Destination $backupPath -Force

    $managedValues = [ordered]@{
        "PRODUCTION_MODE"          = "real"
        "VIDEO_PROVIDER"           = $Proveedor
        "GEMINI_API_KEY"           = $geminiKey
        "GEMINI_OMNI_VIDEO_MODEL"  = "gemini-omni-flash-preview"
        "GEMINI_VIDEO_MODEL"       = "veo-3.1-fast-generate-preview"
        "GEMINI_VIDEO_RESOLUTION"  = "720p"
        "COST_AI_VIDEO_SECOND"     = "0.10"
    }

    Set-EnvValues -Lines $lines -Values $managedValues -Destination $envPath

    Write-Check "OK" "Configuracion" "Google quedo primero en el router de video."
    if ($Proveedor -eq "auto") {
        Write-Check "INFO" "Orden" "Gemini Omni -> Google Veo -> Fal.ai como respaldo."
    } elseif ($Proveedor -eq "omni") {
        Write-Check "INFO" "Orden" "Solo Gemini Omni; no se usara Veo ni Fal.ai."
    } else {
        Write-Check "INFO" "Orden" "Solo Google Veo; no se usara Omni ni Fal.ai."
    }
    Write-Check "OK" "Respaldo .env" (Split-Path -Leaf $backupPath)
    Write-Check "AVISO" "Reinicio" "Cierra ViralCine y vuelve a iniciarlo para cargar la configuracion."

    Add-ReportLine ""
    Add-ReportLine "## Configuracion"
    Add-ReportLine ("- VIDEO_PROVIDER={0}" -f $Proveedor)
    Add-ReportLine "- GEMINI_VIDEO_MODEL=veo-3.1-fast-generate-preview"
    Add-ReportLine "- GEMINI_VIDEO_RESOLUTION=720p"
    Add-ReportLine ("- Respaldo: {0}" -f $backupPath)

    Write-Title "2. Validar clave y modelos sin generar contenido"

    $headers = @{ "x-goog-api-key" = $geminiKey }
    $modelsUrl = "https://generativelanguage.googleapis.com/v1beta/models?pageSize=1000"

    try {
        $modelsResponse = Invoke-RestMethod -Method Get -Uri $modelsUrl -Headers $headers -TimeoutSec 45
    } catch {
        $failure = Get-HttpFailure -Record $_
        throw (Get-FriendlyGoogleError -Failure $failure)
    }

    $modelNames = @($modelsResponse.models | ForEach-Object {
        ([string]$_.name) -replace "^models/", ""
    })

    Write-Check "OK" "GEMINI_API_KEY" "Google acepto la clave; no se mostrara ni se guardara en el informe."
    Write-Check "INFO" "Modelos visibles" ("Google devolvio {0} modelos." -f $modelNames.Count)

    $veoModel = "veo-3.1-fast-generate-preview"
    if ($modelNames -contains $veoModel) {
        Write-Check "OK" "Google Veo" ("Modelo disponible: {0}" -f $veoModel)
    } else {
        Write-Check "AVISO" "Google Veo" "El modelo no aparece en la lista; la prueba facturable podria fallar por acceso."
    }

    Add-ReportLine ""
    Add-ReportLine "## Autenticacion"
    Add-ReportLine "- Clave aceptada: si"
    Add-ReportLine ("- Modelos visibles: {0}" -f $modelNames.Count)
    Add-ReportLine ("- Veo 3.1 Fast visible: {0}" -f ($modelNames -contains $veoModel))

    Write-Title "3. Comprobar credito y saldo"
    Write-Check "INFO" "Credito US$300" "NO paga Gemini API en AI Studio; Google lo excluye del Free Trial."
    Write-Check "INFO" "Saldo exacto" "La API no permite consultar el monto numerico de Prepay."

    if (-not $PruebaFacturable) {
        Write-Check "AVISO" "Saldo Prepay" "Aun no confirmado. La autenticacion por si sola no demuestra saldo."
        Write-Host ""
        Write-Host "Para confirmar saldo positivo, ejecuta la prueba facturable minima:" -ForegroundColor Yellow
        Write-Host ("powershell -ExecutionPolicy Bypass -File `"{0}`" -ProjectRoot `"{1}`" -PruebaFacturable" -f $MyInvocation.MyCommand.Path, $ProjectRoot) -ForegroundColor White

        Add-ReportLine ""
        Add-ReportLine "## Prueba pagada"
        Add-ReportLine "- No ejecutada."
        Save-Report -Path $reportPath -Result "CLAVE VALIDA; SALDO NO CONFIRMADO"
        Write-Host ""
        Write-Check "INFO" "Informe" $reportPath
        if ($AbrirInforme) { Start-Process notepad.exe -ArgumentList $reportPath }
        exit 0
    }

    Write-Host "PRUEBA FACTURABLE AUTORIZADA" -ForegroundColor Yellow
    Write-Host "Veo 3.1 Fast, 4 segundos, 720p. Costo estimado si genera: US$0.40." -ForegroundColor Yellow
    Write-Host "Esta prueba confirma acceso pagado, pero no revela el saldo restante." -ForegroundColor Yellow

    $generationUrl = "https://generativelanguage.googleapis.com/v1beta/models/$($veoModel):predictLongRunning"
    $requestBody = @{
        instances = @(
            @{
                prompt = "A four-second cinematic shot of gentle ocean waves at sunrise, slow camera movement, natural ambient sound, no people, no text, widescreen."
            }
        )
        parameters = @{
            aspectRatio   = "16:9"
            resolution    = "720p"
            durationSeconds = "4"
            numberOfVideos  = 1
        }
    } | ConvertTo-Json -Depth 8

    try {
        $operation = Invoke-RestMethod -Method Post -Uri $generationUrl -Headers $headers `
            -ContentType "application/json" -Body $requestBody -TimeoutSec 60
    } catch {
        $failure = Get-HttpFailure -Record $_
        $friendly = Get-FriendlyGoogleError -Failure $failure
        Write-Check "FALTA" "Prueba pagada" $friendly
        Add-ReportLine ""
        Add-ReportLine "## Prueba pagada"
        Add-ReportLine ("- Fallo al enviar: {0}" -f $friendly)
        Save-Report -Path $reportPath -Result "SIN SALDO PAGADO CONFIRMADO"
        Write-Check "INFO" "Informe" $reportPath
        if ($AbrirInforme) { Start-Process notepad.exe -ArgumentList $reportPath }
        exit 2
    }

    if (-not $operation.name) {
        throw "Google acepto la llamada, pero no devolvio un nombre de operacion."
    }

    Write-Check "OK" "Solicitud Veo" "Aceptada. Esto indica acceso al servicio pagado; esperando el resultado."
    Add-ReportLine ""
    Add-ReportLine "## Prueba pagada"
    Add-ReportLine "- Solicitud Veo aceptada: si"

    $operationUrl = "https://generativelanguage.googleapis.com/v1beta/$($operation.name)"
    $completedOperation = $null
    $maxPolls = 60

    for ($attempt = 1; $attempt -le $maxPolls; $attempt++) {
        try {
            $currentOperation = Invoke-RestMethod -Method Get -Uri $operationUrl -Headers $headers -TimeoutSec 45
        } catch {
            $failure = Get-HttpFailure -Record $_
            $friendly = Get-FriendlyGoogleError -Failure $failure
            Write-Check "AVISO" "Seguimiento" $friendly
            Start-Sleep -Seconds 10
            continue
        }

        if ($currentOperation.done -eq $true) {
            $completedOperation = $currentOperation
            break
        }

        $percent = [Math]::Min(99, [Math]::Round(($attempt / $maxPolls) * 100))
        Write-Progress -Activity "Google Veo esta generando la prueba" -Status "Esperando resultado" -PercentComplete $percent
        Start-Sleep -Seconds 10
    }
    Write-Progress -Activity "Google Veo esta generando la prueba" -Completed

    if (-not $completedOperation) {
        Write-Check "AVISO" "Tiempo de espera" "La operacion sigue en Google despues de 10 minutos. Puede terminar y facturarse mas tarde."
        Add-ReportLine "- Estado: aceptada, aun no terminada despues de 10 minutos."
        Save-Report -Path $reportPath -Result "ACCESO PAGADO CONFIRMADO; GENERACION PENDIENTE"
        Write-Check "INFO" "Informe" $reportPath
        if ($AbrirInforme) { Start-Process notepad.exe -ArgumentList $reportPath }
        exit 0
    }

    if ($completedOperation.error) {
        $message = [string]$completedOperation.error.message
        if ([string]::IsNullOrWhiteSpace($message)) { $message = "La operacion termino con error." }
        Write-Check "FALTA" "Generacion" $message
        Add-ReportLine ("- Generacion terminada con error: {0}" -f $message)
        Save-Report -Path $reportPath -Result "SOLICITUD PAGADA ACEPTADA; VIDEO NO GENERADO"
        Write-Check "INFO" "Informe" $reportPath
        if ($AbrirInforme) { Start-Process notepad.exe -ArgumentList $reportPath }
        exit 2
    }

    $videoUri = Find-VideoUri -Operation $completedOperation
    $videoPath = Join-Path $googleReportsFolder ("prueba-saldo-veo-{0}.mp4" -f $timestamp)

    if (-not [string]::IsNullOrWhiteSpace($videoUri)) {
        try {
            Invoke-WebRequest -Method Get -Uri $videoUri -Headers $headers -OutFile $videoPath -UseBasicParsing -TimeoutSec 180
            Write-Check "OK" "Video de prueba" $videoPath
            Add-ReportLine ("- Video guardado: {0}" -f $videoPath)
        } catch {
            Write-Check "AVISO" "Descarga" "El video se genero, pero no se pudo descargar automaticamente."
            Add-ReportLine "- Video generado; descarga automatica fallida."
        }
    } else {
        Write-Check "AVISO" "Respuesta" "Google marco la operacion como terminada, pero no se encontro la URL del video."
        Add-ReportLine "- Operacion terminada sin URL de video reconocible."
    }

    Write-Host ""
    Write-Check "OK" "SALDO PREPAY" "CONFIRMADO: esta clave pudo completar una operacion facturable de Gemini."
    Write-Check "INFO" "Importante" "Esto NO significa que se usaron los US$300 de Google Cloud; esos creditos no aplican a Gemini API en AI Studio."
    Write-Check "INFO" "Monto restante" "Consultalo en AI Studio > Billing; la API no devuelve el saldo numerico."

    Add-ReportLine "- Acceso pagado confirmado: si"
    Add-ReportLine "- Costo estimado de la prueba: US$0.40 si el video se genero correctamente."
    Save-Report -Path $reportPath -Result "SALDO PREPAY POSITIVO CONFIRMADO"

    Write-Host ""
    Write-Check "INFO" "Informe" $reportPath
    Write-Check "AVISO" "Siguiente paso" "Reinicia ViralCine con .\run-dev.ps1 y crea una pelicula nueva."

    if ($AbrirInforme) { Start-Process notepad.exe -ArgumentList $reportPath }
    exit 0
} catch {
    Write-Host ""
    Write-Check "FALTA" "Diagnostico" $_.Exception.Message
    Write-Host "No se mostro ninguna clave secreta." -ForegroundColor Gray
    exit 1
}
