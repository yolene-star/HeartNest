param([switch]$NoBuild, [switch]$LocalOnly)
$ErrorActionPreference = 'Stop'
& (Join-Path $PSScriptRoot 'scripts/start-public-demo.ps1') -NoBuild:$NoBuild -LocalOnly:$LocalOnly
