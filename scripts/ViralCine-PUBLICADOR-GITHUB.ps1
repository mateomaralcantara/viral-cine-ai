# ViralCine Maestro: publica codigo en la rama de consolidacion existente.
# No cambia main, no incluye .data, MP4, claves, ni auditorias.
$ErrorActionPreference = 'Stop'
$root = 'C:\Users\martin\Desktop\VSC\BestS\ViralCine-UNICO-20261101-170708'
$remote = 'https://github.com/mateomaralcantara/viral-cine-ai.git'
$branch = 'consolidacion/viral-cine-unico-20261101'
$bare = Join-Path $env:TEMP ('viralcine-github-bare-' + (Get-Date -Format 'yyyyMMdd-HHmmss'))

if (!(Test-Path -LiteralPath (Join-Path $root 'package.json') -PathType Leaf)) {
    throw ('Proyecto maestro no encontrado: ' + $root)
}
if (!(Get-Command git.exe -ErrorAction SilentlyContinue)) {
    throw 'No se encuentra Git en PATH.'
}
if (Test-Path -LiteralPath $bare) { throw 'Ruta temporal existente. No sobrescribir.' }

$gitEnv = @{}
foreach ($key in @('GIT_DIR','GIT_WORK_TREE','GIT_COMMON_DIR','GIT_INDEX_FILE')) {
    $gitEnv[$key] = [Environment]::GetEnvironmentVariable($key,'Process')
    [Environment]::SetEnvironmentVariable($key,$null,'Process')
}
function G {
    param([string[]]$ArgsGit)
    $result = @(& git.exe ('--git-dir=' + $bare) @ArgsGit 2>&1)
    if ($LASTEXITCODE -ne 0) {
        throw ('Fallo Git ' + $ArgsGit[0] + ': ' + ($result -join ' '))
    }
    return (($result | Out-String).Trim())
}
try {
    Write-Host 'VIRALCINE MAESTRO: PREPARANDO PUBLICACION SEGURA' -ForegroundColor Cyan
    & git.exe init --bare --quiet $bare
    if ($LASTEXITCODE -ne 0) { throw 'git init --bare fallo.' }
    [void](G @('config','core.autocrlf','false'))
    [void](G @('remote','add','origin',$remote))
    [void](G @('fetch','--quiet','--no-tags','--depth=1','origin',('refs/heads/' + $branch)))
    $parent = G @('rev-parse','FETCH_HEAD')
    if ($parent -notmatch '^[0-9a-f]{40}$') { throw 'Ref remota invalida.' }
    [void](G @('read-tree',$parent))

    $dirs = @('app','components','lib','scripts','tests','docs','db','supabase','.github','public')
    $files = [System.Collections.Generic.List[IO.FileInfo]]::new()
    foreach ($d in $dirs) {
        $p = Join-Path $root $d
        if (Test-Path -LiteralPath $p -PathType Container) {
            Get-ChildItem -LiteralPath $p -File -Recurse -ErrorAction Stop |
                ForEach-Object { $files.Add($_) }
        }
    }
    Get-ChildItem -LiteralPath $root -File | ForEach-Object { $files.Add($_) }

    $allowed = @('.ts','.tsx','.js','.jsx','.mjs','.cjs','.json','.md','.css','.scss','.ps1','.yml','.yaml','.sql','.html','.svg')
    $blocked = @('app/api/v8/scene2/route.ts','components/V7E02RunwayLauncher.tsx','scripts/GENERAR-E02-AUTONOMO.mjs')
    $secretPattern = '(?i)(sk-(?:proj-)?[A-Za-z0-9_-]{20,}|sb_secret_[A-Za-z0-9_-]{12,}|github_pat_[A-Za-z0-9_]{25,}|gh[pousr]_[A-Za-z0-9]{30,}|AIza[A-Za-z0-9_-]{30,}|-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----)'
    $selected = [System.Collections.Generic.List[object]]::new()

    foreach ($file in $files) {
        $rel = $file.FullName.Substring($root.Length).TrimStart([char]'\').Replace('\','/')
        if ($rel -match '(^|/)(AUDITORIA_LOCAL|node_modules|\.git|\.next|\.vercel|\.data[^/]*|backups|reports|logs)(/|$)') { continue }
        if ($rel -match '(^|/)\.env($|\.)') { continue }
        if ($rel -match '(?i)\.(mp4|mov|mp3|wav|jpg|jpeg|png|webp|gif|zip|pem|key|p12|pfx|sqlite|db|bak|log|txt)$') { continue }
        if ($blocked -ccontains $rel) { continue }
        if ($allowed -notcontains $file.Extension.ToLowerInvariant() -and $rel -notin @('.gitignore','.gitattributes')) { continue }
        if ($file.Length -gt 2097152) { throw ('Archivo demasiado grande: ' + $rel) }
        $value = [IO.File]::ReadAllText($file.FullName)
        if ([regex]::IsMatch($value,$secretPattern)) { throw ('Posible clave: ' + $rel + '. Detenido antes de publicar.') }
        $selected.Add([pscustomobject]@{Rel=$rel;Content=$value})
    }
    if ($selected.Count -lt 200) { throw ('Incompleto: solo ' + $selected.Count + ' archivos. No publicar.') }

    Write-Host ('Archivos de codigo: ' + $selected.Count) -ForegroundColor Green
    $scratch = Join-Path $bare 'viral-normalized.tmp'
    foreach ($item in $selected) {
        $normalized = $item.Content.Replace(([string][char]13 + [string][char]10),[string][char]10)
        [IO.File]::WriteAllText($scratch,$normalized,[Text.UTF8Encoding]::new($false))
        $sha = G @('hash-object','-w','--',$scratch)
        if ($sha -notmatch '^[0-9a-f]{40}$') { throw ('Hash invalido: ' + $item.Rel) }
        [void](G @('update-index','--add','--cacheinfo',('100644,' + $sha + ',' + $item.Rel)))
    }
    $diff = G @('diff','--cached','--name-status',$parent)
    if ([string]::IsNullOrWhiteSpace($diff)) {
        Write-Host 'El codigo seleccionado coincide con GitHub; no hay nada que subir.' -ForegroundColor Green
    } else {
        if ($diff -match '(?m)^D\s') { throw 'Cambios eliminan archivos. Publicacion detenida.' }
        $count = @($diff -split '\r?\n' | Where-Object { $_ }).Count
        Write-Host ('Archivos que cambian: ' + $count) -ForegroundColor Cyan
        $tree = G @('write-tree')
        $author = (& git.exe config --get user.name 2>$null)
        $email = (& git.exe config --get user.email 2>$null)
        if (!$author -or !$email) { throw 'Configura user.name y user.email en Git antes de publicar.' }
        $commit = G @('commit-tree',$tree,'-p',$parent,'-m','chore: sincronizar codigo maestro ViralCine sin datos privados')
        if ($commit -notmatch '^[0-9a-f]{40}$') { throw 'Commit invalido.' }
        $push = G @('push','origin',($commit + ':refs/heads/' + $branch))
        Write-Host 'CODIGO PUBLICADO EN GITHUB' -ForegroundColor Green
        Write-Host ('Commit: ' + $commit)
        Write-Host ('Rama: ' + $branch)
        Write-Host 'main permanece sin modificar; correcciones pendientes y medios privados no se publicaron.'
    }
}
finally {
    foreach ($key in $gitEnv.Keys) {
        [Environment]::SetEnvironmentVariable($key,$gitEnv[$key],'Process')
    }
}