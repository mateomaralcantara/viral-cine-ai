# ViralCine · Iniciar el estudio local (todas las películas). No genera ni cobra nada.
#
# Uso (PowerShell, dentro de viral-cine-v7-cinema-core):
#   powershell -ExecutionPolicy Bypass -File .\scripts\INICIAR-ESTUDIO.ps1
# Opcional:
#   -Pelicula episodio1|episodio2|convidados|primera|dos-toques   (por defecto: episodio1)
#   -Pestana personajes|studio|scenes|master             (por defecto: personajes)
param([string]$Pelicula = 'episodio1', [string]$Pestana = 'personajes')
$ErrorActionPreference = 'Stop'
$root = Split-Path -Parent $PSScriptRoot
Set-Location $root
$films = @{
  'episodio1' = 'film-convidados-ep01-v7'; 'episodio2' = 'film-convidados-ep02-v7'; 'convidados' = 'film-los-convidados-al-agape-v7'
  'primera' = 'film-la-primera-pagina-v7'; 'dos-toques' = 'film-dos-toques-de-bocina-v7'
}
if (-not $films.ContainsKey($Pelicula)) { throw ('Película desconocida. Usa: ' + ($films.Keys -join ', ')) }
if (Get-NetTCPConnection -LocalPort 3010 -State Listen -ErrorAction SilentlyContinue) {
  throw 'El puerto 3010 ya está ocupado: hay otro servidor abierto. Ciérralo con Ctrl+C en su ventana y vuelve a intentarlo.'
}

# Token administrativo: el de .env.local si es válido; si no, el guardado cifrado en Windows.
$line = Get-Content (Join-Path $root '.env.local') -ErrorAction SilentlyContinue | Where-Object { $_ -match '^\s*V7_CINEMA_ADMIN_TOKEN\s*=' } | Select-Object -Last 1
$fromEnv = if ($line) { $line.Substring($line.IndexOf('=') + 1).Trim().Trim([char]34, [char]39) } else { '' }
if ($fromEnv -notmatch '^[a-fA-F0-9]{64}$') {
  $env:V7_CINEMA_ADMIN_TOKEN = (& (Join-Path $PSScriptRoot 'V7-ADMIN-TOKEN.ps1') -Mode Get).Trim()
}
# Código de un solo uso para enlazar este navegador (NO es la clave administrativa). Caduca en 10 min.
$env:V7_STUDIO_PAIR_CODE = [guid]::NewGuid().ToString('N') + [guid]::NewGuid().ToString('N')
$env:V7_STUDIO_PAIR_EXPIRES = [DateTimeOffset]::UtcNow.AddMinutes(10).ToUnixTimeSeconds().ToString()

$url = "http://127.0.0.1:3010/v7/films/$($films[$Pelicula])?tab=$Pestana"
Write-Host ''
Write-Host '=== VIRALCINE · ESTUDIO LOCAL ===' -ForegroundColor Cyan
Write-Host "Película: $($films[$Pelicula])"
Write-Host "Se abrirá solo en el navegador cuando esté listo: $url" -ForegroundColor Green
Write-Host 'Para apagarlo: Ctrl + C en esta ventana.' -ForegroundColor DarkGray
Write-Host ''
Start-Job -Name 'ViralCine-Abrir' -ArgumentList ($url + '#studio-pair=' + $env:V7_STUDIO_PAIR_CODE) -ScriptBlock {
  param($link)
  for ($i = 0; $i -lt 90; $i++) {
    try { if ((Invoke-WebRequest -Uri 'http://127.0.0.1:3010/' -UseBasicParsing -TimeoutSec 2).StatusCode -ge 200) { Start-Process $link; return } } catch {}
    Start-Sleep -Seconds 2
  }
} | Out-Null
# Solo en 127.0.0.1: el estudio nunca queda expuesto a la red.
npm run dev -- -p 3010 -H 127.0.0.1
