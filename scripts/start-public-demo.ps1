param([switch]$NoBuild, [switch]$LocalOnly)
$ErrorActionPreference = 'Stop'
$repoRoot = Split-Path -Parent $PSScriptRoot
$runtimeDir = Join-Path $repoRoot '.deps/public-demo'
$stateFile = Join-Path $runtimeDir 'tunnel.json'
New-Item -ItemType Directory -Path $runtimeDir -Force | Out-Null
Push-Location $repoRoot
try {
    $composeArgs = @('compose', '--env-file', 'NUL', '-f', 'compose.public.yaml', 'up', '-d')
    if ($NoBuild) { $composeArgs += '--no-build' } else { $composeArgs += '--build' }
    & docker @composeArgs
    if ($LASTEXITCODE -ne 0) { throw '公网演示 Docker 启动失败' }
    $healthy = $false
    for ($attempt = 0; $attempt -lt 20; $attempt++) {
        try {
            $health = Invoke-RestMethod 'http://127.0.0.1:18081/api/health' -TimeoutSec 2
            if ($health.public_demo -eq $true) { $healthy = $true; break }
        } catch { }
        Start-Sleep -Milliseconds 500
    }
    if (-not $healthy) { throw '未检测到隔离的公网演示实例，未创建隧道' }
    if ($LocalOnly) { Write-Output 'http://127.0.0.1:18081'; return }
    if (Test-Path -LiteralPath $stateFile) {
        $previous = Get-Content -LiteralPath $stateFile -Raw | ConvertFrom-Json
        $existing = Get-Process -Id $previous.pid -ErrorAction SilentlyContinue
        $expectedTicks = if ($previous.startedAtTicks) { [long]$previous.startedAtTicks } else { ([datetime]$previous.startedAt).ToUniversalTime().Ticks }
        if ($existing -and $existing.ProcessName -eq 'cloudflared' -and $existing.StartTime.ToUniversalTime().Ticks -eq $expectedTicks) {
            Write-Output $previous.url
            return
        }
    }
    $cloudflared = Get-Command cloudflared -ErrorAction SilentlyContinue
    $binary = if ($cloudflared) { $cloudflared.Source } else { 'C:\Program Files (x86)\cloudflared\cloudflared.exe' }
    if (-not (Test-Path -LiteralPath $binary)) { throw '请先安装 cloudflared，Docker 本地演示已运行于 18081' }
    $stamp = Get-Date -Format 'yyyyMMdd-HHmmss'
    $stdout = Join-Path $runtimeDir "$stamp.stdout.log"
    $stderr = Join-Path $runtimeDir "$stamp.stderr.log"
    $process = Start-Process -FilePath $binary -ArgumentList @('tunnel', '--no-autoupdate', '--protocol', 'http2', '--url', 'http://127.0.0.1:18081') -WindowStyle Hidden -PassThru -RedirectStandardOutput $stdout -RedirectStandardError $stderr
    for ($attempt = 0; $attempt -lt 50; $attempt++) {
        Start-Sleep -Milliseconds 1000
        $logs = (Get-Content -LiteralPath $stdout -Raw -ErrorAction SilentlyContinue) + (Get-Content -LiteralPath $stderr -Raw -ErrorAction SilentlyContinue)
        $match = [regex]::Match($logs, 'https://[a-z0-9-]+\.trycloudflare\.com')
        if ($match.Success) {
            $state = @{ pid=$process.Id; startedAtTicks=$process.StartTime.ToUniversalTime().Ticks; url=$match.Value }
            $state | ConvertTo-Json | Set-Content -LiteralPath $stateFile -Encoding utf8
            Write-Output $match.Value
            Write-Output '临时链接：需要此电脑、Docker 和隧道进程持续在线。请再运行公网浏览器验证。'
            return
        }
        if ($process.HasExited) { break }
    }
    if (-not $process.HasExited) { Stop-Process -Id $process.Id }
    throw "未获得临时公网地址，日志位于 $runtimeDir；本地演示仍可使用"
} finally { Pop-Location }
