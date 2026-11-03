param([switch]$KeepDocker)
$ErrorActionPreference = 'Stop'
$repoRoot = Split-Path -Parent $PSScriptRoot
$stateFile = Join-Path $repoRoot '.deps/public-demo/tunnel.json'
Remove-Item -LiteralPath (Join-Path $repoRoot '.deps/public-demo/current-url.txt') -ErrorAction SilentlyContinue
if (Test-Path -LiteralPath $stateFile) {
    $state = Get-Content -LiteralPath $stateFile -Raw | ConvertFrom-Json
    $process = Get-Process -Id $state.pid -ErrorAction SilentlyContinue
    $expectedTicks = if ($state.startedAtTicks) { [long]$state.startedAtTicks } else { ([datetime]$state.startedAt).ToUniversalTime().Ticks }
    if ($process -and $process.ProcessName -eq 'cloudflared' -and $process.StartTime.ToUniversalTime().Ticks -eq $expectedTicks) {
        Stop-Process -Id $process.Id
    }
    Remove-Item -LiteralPath $stateFile
}
if (-not $KeepDocker) {
    Push-Location $repoRoot
    try {
        & docker compose --env-file NUL -f compose.public.yaml down
        if ($LASTEXITCODE -ne 0) { throw '停止公网演示 Docker 失败' }
    } finally { Pop-Location }
}
Write-Output '公网演示已停止。Docker 数据卷保留。'
