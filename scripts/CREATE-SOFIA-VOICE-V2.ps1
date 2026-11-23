
param(
    [Parameter(Mandatory=$true)]
    [string]$ProjectId,

    [Parameter(Mandatory=$true)]
    [string]$Confirm
)

$ErrorActionPreference = 'Stop'
$target = Join-Path $PSScriptRoot 'CREATE-SOFIA-VOICE-V2B.ps1'

if (-not (Test-Path $target)) {
    throw 'No encuentro CREATE-SOFIA-VOICE-V2B.ps1.'
}

& powershell -ExecutionPolicy Bypass -File $target -ProjectId $ProjectId -Confirm $Confirm
exit $LASTEXITCODE
