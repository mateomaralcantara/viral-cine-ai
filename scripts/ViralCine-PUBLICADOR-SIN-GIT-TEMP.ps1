# ViralCine Maestro: publicar solo codigo usando un repositorio Git local existente.
# No crea repositorios, no ejecuta checkout, no modifica main ni toca datos privados.
$ErrorActionPreference = 'Stop'
$base = 'C:\Users\martin\Desktop\VSC\BestS'
$fuente = Join-Path $base 'ViralCine-UNICO-20261101-170708'
$repoLocal = Join-Path $base 'viral-cine-v7-cinema-core'
$remoto = 'https://github.com/mateomaralcantara/viral-cine-ai.git'
$rama = 'consolidacion/viral-cine-unico-20261101'

if (!(Test-Path -LiteralPath (Join-Path $fuente 'package.json') -PathType Leaf)) {
    throw ('Falta la carpeta ViralCine Maestro: ' + $fuente)
}
if (!(Test-Path -LiteralPath $repoLocal -PathType Container)) { throw 'No existe la carpeta Git original.' }
if (!(Get-Command git.exe -ErrorAction SilentlyContinue)) { throw 'Git no esta instalado.' }

$antiguas = @{}
foreach ($var in @('GIT_DIR','GIT_WORK_TREE','GIT_COMMON_DIR','GIT_INDEX_FILE')) {
    $antiguas[$var] = [Environment]::GetEnvironmentVariable($var,'Process')
    [Environment]::SetEnvironmentVariable($var,$null,'Process')
}

$indice = $null
$temporal = $null

function Git {
    param([string[]]$Params)
    $r = @(& git.exe -C $repoLocal @Params 2>&1)
    if ($LASTEXITCODE -ne 0) {
        throw ('Error Git en ' + $Params[0] + ': ' + ($r -join ' '))
    }
    return (($r | Out-String).Trim())
}

try {
    Write-Host 'VIRALCINE MAESTRO: SIN GIT TEMPORAL' -ForegroundColor Cyan
    $gitDir = Git @('rev-parse','--absolute-git-dir')
    $bare = Git @('rev-parse','--is-bare-repository')
    if ($bare -ne 'false' -or !(Test-Path -LiteralPath $gitDir -PathType Container)) {
        throw 'La carpeta original no es un repositorio Git de trabajo valido.'
    }

    # Fetch no cambia la rama actual, el indice original ni los archivos del trabajo.
    [void](Git @('fetch','--quiet','--no-tags',$remoto,('refs/heads/' + $rama)))
    $baseSha = Git @('rev-parse','FETCH_HEAD')
    if ($baseSha -notmatch '^[0-9a-f]{40}$') { throw 'No se pudo verificar la rama remota.' }

    $id = [Guid]::NewGuid().ToString('N')
    $indice = Join-Path $gitDir ('index-viral-' + $id)
    $temporal = Join-Path $gitDir ('contenido-viral-' + $id + '.tmp')
    $env:GIT_INDEX_FILE = $indice
    [void](Git @('read-tree',$baseSha))

    $rutas = @('app','components','lib','scripts','tests','docs','db','supabase','.github','public')
    $archivos = [System.Collections.Generic.List[IO.FileInfo]]::new()
    foreach ($carpeta in $rutas) {
        $ruta = Join-Path $fuente $carpeta
        if (Test-Path -LiteralPath $ruta -PathType Container) {
            Get-ChildItem -LiteralPath $ruta -Recurse -File -ErrorAction Stop |
                ForEach-Object { $archivos.Add($_) }
        }
    }
    Get-ChildItem -LiteralPath $fuente -File | ForEach-Object { $archivos.Add($_) }

    $permitidas = @('.ts','.tsx','.js','.jsx','.mjs','.cjs','.json','.md','.mdx','.css','.scss','.ps1','.yml','.yaml','.sql','.html','.svg')
    $retenidas = @('app/api/v8/scene2/route.ts','components/V7E02RunwayLauncher.tsx','scripts/GENERAR-E02-AUTONOMO.mjs')
    $patronSecretos = '(?i)(sk-(?:proj-)?[A-Za-z0-9_-]{20,}|sb_secret_[A-Za-z0-9_-]{12,}|github_pat_[A-Za-z0-9_]{25,}|gh[pousr]_[A-Za-z0-9]{30,}|AIza[A-Za-z0-9_-]{30,}|-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----)'
    $seleccion = [System.Collections.Generic.List[object]]::new()

    foreach ($archivo in $archivos) {
        $rel = $archivo.FullName.Substring($fuente.Length).TrimStart([char]'\').Replace('\','/')
        if ($rel -match '(?i)(^|/)(AUDITORIA_LOCAL|node_modules|\.git|\.next|\.vercel|\.data[^/]*|backups|reports|logs)(/|$)') { continue }
        if ($rel -match '(?i)(^|/)\.env($|\.)') { continue }
        if ($rel -match '(?i)\.(mp4|mov|mp3|wav|jpg|jpeg|png|webp|gif|zip|pem|key|p12|pfx|sqlite|db|bak|log|txt)$') { continue }
        if ($retenidas -ccontains $rel) { continue }
        if ($permitidas -notcontains $archivo.Extension.ToLowerInvariant() -and $rel -notin @('.gitignore','.gitattributes')) { continue }
        if ($archivo.Length -gt 2MB) { throw ('Archivo de codigo demasiado grande: ' + $rel) }
        $contenido = [IO.File]::ReadAllText($archivo.FullName)
        if ([regex]::IsMatch($contenido,$patronSecretos)) {
            throw ('Posible secreto en ' + $rel + '. No se publico nada.')
        }
        $seleccion.Add([pscustomobject]@{ Rel = $rel; Content = $contenido })
    }

    if ($seleccion.Count -lt 200) { throw ('Solo se encontraron ' + $seleccion.Count + ' archivos: detenido para proteger el proyecto.') }
    Write-Host ('Codigo revisado: ' + $seleccion.Count + ' archivos') -ForegroundColor Green

    $n = 0
    foreach ($elemento in $seleccion) {
        # Normaliza CRLF -> LF para evitar cambios falsos de Windows.
        $valor = $elemento.Content.Replace(([string][char]13 + [string][char]10),[string][char]10)
        [IO.File]::WriteAllText($temporal,$valor,[Text.UTF8Encoding]::new($false))
        $blob = Git @('hash-object','-w','--',$temporal)
        if ($blob -notmatch '^[0-9a-f]{40}$') { throw ('SHA invalido: ' + $elemento.Rel) }
        [void](Git @('update-index','--add','--cacheinfo',('100644,' + $blob + ',' + $elemento.Rel)))
        $n++
        if (($n % 100) -eq 0) { Write-Host ('Preparados: ' + $n + '/' + $seleccion.Count) }
    }

    $diff = Git @('diff','--cached','--name-status',$baseSha)
    if (!$diff) {
        Write-Host 'EL CODIGO MAESTRO SELECCIONADO YA COINCIDE CON GITHUB.' -ForegroundColor Green
        return
    }
    $cambios = @($diff -split '\r?\n' | Where-Object { $_ })
    $borrados = @($cambios | Where-Object { $_ -match '^D\s' })
    if ($borrados.Count -gt 0) { throw 'Se detectaron eliminaciones. No se publico nada.' }
    if ($cambios.Count -gt 80) {
        $cambios | Select-Object -First 25 | ForEach-Object { Write-Host $_ }
        throw ('Demasiadas diferencias (' + $cambios.Count + '). No se publica sin revision.')
    }
    Write-Host ('Archivos modificados/nuevos: ' + $cambios.Count) -ForegroundColor Yellow
    $cambios | Select-Object -First 30 | ForEach-Object { Write-Host $_ }

    $autor = Git @('config','user.name')
    $correo = Git @('config','user.email')
    if (!$autor -or !$correo) { throw 'Configura user.name y user.email en Git.' }

    $arbol = Git @('write-tree')
    $commit = Git @('commit-tree',$arbol,'-p',$baseSha,'-m','chore: sincronizar ViralCine Maestro sin archivos privados')
    if ($commit -notmatch '^[0-9a-f]{40}$') { throw 'Commit invalido.' }

    # Push sin fuerza; falla si otra persona actualiza la rama.
    [void](Git @('push',$remoto,($commit + ':refs/heads/' + $rama)))
    Write-Host 'CODIGO PUBLICADO EN GITHUB' -ForegroundColor Green
    Write-Host ('Rama: ' + $rama)
    Write-Host ('Commit: ' + $commit)
    Write-Host 'main, MP4, bundles, videos y codigo pendiente siguen intactos.'
}
finally {
    foreach ($var in $antiguas.Keys) {
        [Environment]::SetEnvironmentVariable($var,$antiguas[$var],'Process')
    }
    if ($indice -and (Test-Path -LiteralPath $indice)) {
        Remove-Item -LiteralPath $indice -Force -ErrorAction SilentlyContinue
    }
    if ($temporal -and (Test-Path -LiteralPath $temporal)) {
        Remove-Item -LiteralPath $temporal -Force -ErrorAction SilentlyContinue
    }
}