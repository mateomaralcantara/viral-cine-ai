$ErrorActionPreference = "Stop"
Set-Location $PSScriptRoot

function Import-DotEnv {
  param([string]$Path)

  foreach ($line in (Get-Content -LiteralPath $Path)) {
    $trimmed = $line.Trim()
    if (-not $trimmed -or $trimmed.StartsWith('#')) { continue }
    if ($trimmed.StartsWith('export ')) { $trimmed = $trimmed.Substring(7).Trim() }
    if ($trimmed -notmatch '^([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)$') { continue }

    $name = $Matches[1]
    $value = $Matches[2].Trim()
    if ($value.Length -ge 2) {
      $first = $value.Substring(0, 1)
      $last = $value.Substring($value.Length - 1, 1)
      if (($first -eq '"' -and $last -eq '"') -or ($first -eq "'" -and $last -eq "'")) {
        $value = $value.Substring(1, $value.Length - 2)
      }
    }

    # .env.local es la configuracion autoritativa del proyecto. Esto evita
    # que una clave antigua guardada en Windows prevalezca sobre la nueva.
    [Environment]::SetEnvironmentVariable($name, $value, 'Process')
  }
}

Write-Host "`n[ViralCine] Verificando sistema..." -ForegroundColor Cyan

if (-not (Get-Command node -ErrorAction SilentlyContinue)) {
  throw "Node.js no está instalado. Instala Node.js 22 LTS o superior."
}

if (-not (Get-Command ffmpeg -ErrorAction SilentlyContinue)) {
  Write-Host "[FALTA] FFmpeg no está instalado o no aparece en PATH." -ForegroundColor Yellow
  Write-Host "Ejecuta: winget install --id Gyan.FFmpeg -e" -ForegroundColor White
  throw "Instala FFmpeg, cierra PowerShell, vuelve a abrirlo y ejecuta este script."
}

if (-not (Test-Path ".env.local")) {
  Copy-Item ".env.example" ".env.local"
  Write-Host "[OK] Se creó .env.local en modo demo." -ForegroundColor Green
}

Import-DotEnv (Join-Path $PSScriptRoot '.env.local')
Write-Host "[OK] .env.local cargado para el panel y el trabajador." -ForegroundColor Green

if (-not (Test-Path "node_modules")) {
  Write-Host "[ViralCine] Instalando dependencias..." -ForegroundColor Cyan
  npm install
}

Write-Host "[ViralCine] Abre http://localhost:3000" -ForegroundColor Green
Write-Host "[ViralCine] El panel y el trabajador se iniciarán juntos.`n" -ForegroundColor Cyan
npm run studio
