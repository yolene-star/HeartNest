# Creates a local review package; never reads .env or runtime databases.
$ErrorActionPreference = 'Stop'
$projectRoot = Split-Path -Parent $PSScriptRoot
$outputDir = Join-Path $projectRoot 'delivery'
New-Item -ItemType Directory -Force -Path $outputDir | Out-Null
$archivePath = Join-Path $outputDir 'HeartNest-source-review.zip'
$roots = @('backend/app', 'backend/tests', 'frontend/src', 'frontend/public', 'frontend/tests', 'data/public-emotion', 'docs/public-classification', 'docs/issue-drafts', 'docs/demo', 'docs/completion-validation', 'docs/design', 'docs/diary-acceptance', 'docs/diary-acceptance-llm')
$backendFiles = @('backend/Dockerfile', 'backend/requirements.txt', 'backend/pytest.ini', 'backend/classification.py', 'backend/public_classification.py')
$singles = @('.env.example', '.gitignore', '.dockerignore', 'AGENTS.md', 'README.md', 'compose.yaml', 'compose.acceptance.yaml', 'frontend/package.json', 'frontend/package-lock.json', 'frontend/Dockerfile', 'frontend/nginx.conf', 'frontend/index.html', 'frontend/vite.config.js', 'data/README.md', 'data/activities.json', 'data/profiles.json', 'data/diaries.json', 'data/synthetic_diaries.json', 'data/classification_metrics.json', 'docs/DOCKER.md', 'docs/verification.md', 'docs/llm-understanding.md', 'docs/synthetic-diary-review.md', 'docs/data-preprocessing.md', 'docs/classification-report.md', 'scripts/package-source.ps1')
function Get-PackageFiles([string]$directory) {
    foreach ($entry in Get-ChildItem -LiteralPath $directory -Force) {
        if ($entry.PSIsContainer) {
            if ($entry.Name -notin @('__pycache__', 'node_modules', 'dist', '.pytest_cache', '.git', 'runtime')) { Get-PackageFiles $entry.FullName }
        } else { $entry }
    }
}
$files = @(
    foreach ($root in $roots) {
        Get-PackageFiles (Join-Path $projectRoot $root)
    }
    foreach ($relative in ($singles + $backendFiles)) { Get-Item -LiteralPath (Join-Path $projectRoot $relative) }
)
Add-Type -AssemblyName System.IO.Compression
Add-Type -AssemblyName System.IO.Compression.FileSystem
$stream = [System.IO.File]::Open($archivePath, [System.IO.FileMode]::Create)
$zip = [System.IO.Compression.ZipArchive]::new($stream, [System.IO.Compression.ZipArchiveMode]::Create)
try {
    foreach ($file in ($files | Sort-Object FullName -Unique)) {
        $relative = $file.FullName.Substring($projectRoot.Length + 1).Replace('\', '/')
        if ($relative -match '(^|/)(\.env(\..+)?|runtime)(/|$)' -and $relative -ne '.env.example') { throw "Forbidden package entry: $relative" }
        if ($relative -match '\.(sqlite3|db)(-|$)|\.pyc$') { throw "Forbidden package entry: $relative" }
        [System.IO.Compression.ZipFileExtensions]::CreateEntryFromFile($zip, $file.FullName, "HeartNest/$relative", [System.IO.Compression.CompressionLevel]::Optimal) | Out-Null
    }
} finally { $zip.Dispose(); $stream.Dispose() }
$check = [System.IO.Compression.ZipFile]::OpenRead($archivePath)
try {
    $names = @($check.Entries.FullName)
    foreach ($required in @('compose.yaml', '.env.example', 'backend/app/main.py', 'frontend/src/ProductApp.jsx', 'frontend/package-lock.json', 'frontend/Dockerfile')) {
        if ($names -notcontains "HeartNest/$required") { throw "Missing required entry: $required" }
    }
    if ($names | Where-Object { $_ -match '(^|/)\.env$|/runtime/|\.sqlite3|/node_modules/|/\.git/' }) { throw 'Archive contains private/runtime content' }
    [PSCustomObject]@{ archive = $archivePath; entries = $names.Count; bytes = (Get-Item $archivePath).Length; verified = $true } | ConvertTo-Json
} finally { $check.Dispose() }
