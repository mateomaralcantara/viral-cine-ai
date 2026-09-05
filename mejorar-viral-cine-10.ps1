param(
  [switch]$NoAbrirInforme,
  [switch]$OmitirSmoke
)

Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'
[Console]::OutputEncoding = [System.Text.Encoding]::UTF8
$OutputEncoding = [System.Text.Encoding]::UTF8
Set-Location $PSScriptRoot

function Run-Step {
  param([string]$Title, [string[]]$Arguments)
  Write-Host "`n[ViralCine 3.0] $Title" -ForegroundColor Cyan
  & npm.cmd @Arguments
  if ($LASTEXITCODE -ne 0) { throw "$Title fallo con codigo $LASTEXITCODE." }
  Write-Host "[OK] $Title" -ForegroundColor Green
}

$packagePath = Join-Path $PSScriptRoot 'package.json'
if (-not (Test-Path -LiteralPath $packagePath)) { throw 'Ejecuta este script desde la raiz de ViralCine.' }
$package = Get-Content -LiteralPath $packagePath -Raw | ConvertFrom-Json
if ($package.name -ne 'viralcine-studio-pro') { throw 'La carpeta no contiene ViralCine Studio Pro.' }
if (-not (Get-Command node.exe -ErrorAction SilentlyContinue)) { throw 'Falta Node.js 22 o superior.' }
if (-not (Get-Command npm.cmd -ErrorAction SilentlyContinue)) { throw 'Falta npm.' }
if (-not (Get-Command ffmpeg.exe -ErrorAction SilentlyContinue)) { throw 'Falta FFmpeg en PATH.' }

Write-Host "`nViralCine Studio Pro $($package.version) - puerta tecnica 10/10" -ForegroundColor Magenta
Run-Step 'Instalacion consistente de dependencias' @('install')
Run-Step 'TypeScript' @('run', 'typecheck')
Run-Step 'Pruebas automatizadas' @('test')
Run-Step 'Build de produccion' @('run', 'build')
if (-not $OmitirSmoke) { Run-Step 'Prueba audiovisual reanudable' @('run', 'smoke') }

$evaluator = Join-Path $PSScriptRoot 'evaluar-proyecto.ps1'
if (Test-Path -LiteralPath $evaluator) {
  $arguments = @('-ExecutionPolicy', 'Bypass', '-File', $evaluator)
  if (-not $NoAbrirInforme) { $arguments += '-AbrirInforme' }
  & powershell.exe @arguments
  if ($LASTEXITCODE -ne 0) { throw "La evaluacion final termino con codigo $LASTEXITCODE." }
}

Write-Host "`n[LISTO] El codigo, las pruebas, el build y el pipeline audiovisual pasaron." -ForegroundColor Green
Write-Host 'Este script no cambia .env.local, claves ni proyectos.' -ForegroundColor DarkGray
