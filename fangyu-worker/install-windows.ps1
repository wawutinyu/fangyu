# 方隅·行 — Windows 一键安装 / 注册快捷方式（无需 Electron / Rust）
# 用法（仓库根目录）:
#   powershell -ExecutionPolicy Bypass -File fangyu-worker/install-windows.ps1
# 或双击根目录 install-worker.bat
# 非交互: $env:FANGYU_INSTALL_NONINTERACTIVE='1'

$ErrorActionPreference = 'Stop'

$WorkerRoot = $PSScriptRoot
$RepoRoot = Split-Path $WorkerRoot -Parent

Write-Host ''
Write-Host '=== Fangyu Worker install check ===' -ForegroundColor Cyan
Write-Host "Repo: $RepoRoot"
Write-Host ''

function Test-Command($Name) {
    return [bool](Get-Command $Name -ErrorAction SilentlyContinue)
}

$failed = $false

if (-not (Test-Command 'node')) {
    Write-Host '[X] node not found — install Node.js 18+: https://nodejs.org/' -ForegroundColor Red
    $failed = $true
} else {
    $ver = (node -v) -replace '^v', ''
    $major = [int]($ver.Split('.')[0])
    if ($major -lt 18) {
        Write-Host "[X] Node $ver too old, need >= 18" -ForegroundColor Red
        $failed = $true
    } else {
        Write-Host "[OK] Node $ver" -ForegroundColor Green
    }
}

if (-not (Test-Command 'npm')) {
    Write-Host '[X] npm not found' -ForegroundColor Red
    $failed = $true
} else {
    Write-Host "[OK] npm $(npm -v)" -ForegroundColor Green
}

$pyOk = $false
foreach ($py in @('py', 'python')) {
    if (Test-Command $py) {
        & $py -c "import sys; raise SystemExit(0 if sys.version_info >= (3, 10) else 1)" 2>$null
        if ($LASTEXITCODE -eq 0) {
            Write-Host "[OK] Python ($py) ready for Studio API" -ForegroundColor Green
            $pyOk = $true
            break
        }
    }
}
if (-not $pyOk) {
    Write-Host '[!] Python 3.10+ not found — Worker can start, but run_flow needs Studio API' -ForegroundColor Yellow
}

if ($failed) {
    Write-Host ''
    Write-Host 'Install aborted. Fix dependencies and re-run.' -ForegroundColor Red
    exit 1
}

Push-Location $RepoRoot
try {
    if (-not (Test-Path (Join-Path $RepoRoot 'node_modules'))) {
        Write-Host ''
        Write-Host '[..] npm install ...' -ForegroundColor Cyan
        npm install
        if ($LASTEXITCODE -ne 0) { throw 'npm install failed' }
    } else {
        Write-Host '[OK] node_modules present' -ForegroundColor Green
    }

    if ($pyOk) {
        Write-Host '[..] pip install -e . ...' -ForegroundColor Cyan
        $pipCmd = if (Test-Command 'py') { 'py' } else { 'python' }
        $prevEa = $ErrorActionPreference
        $ErrorActionPreference = 'Continue'
        & $pipCmd -m pip install -e . -q 2>&1 | Out-Null
        $ErrorActionPreference = $prevEa
    }
} finally {
    Pop-Location
}

$startBat = Join-Path $WorkerRoot 'tray\start-tray.bat'
if (-not (Test-Path $startBat)) {
    Write-Host "[X] missing $startBat" -ForegroundColor Red
    exit 1
}

$WshShell = New-Object -ComObject WScript.Shell

function New-FangyuShortcut([string]$Path, [string]$Target) {
    $dir = Split-Path $Path -Parent
    if (-not (Test-Path $dir)) { New-Item -ItemType Directory -Path $dir -Force | Out-Null }
    $sc = $WshShell.CreateShortcut($Path)
    $sc.TargetPath = $Target
    $sc.WorkingDirectory = $WorkerRoot
    $sc.Description = 'Fangyu Worker (system tray)'
    $sc.WindowStyle = 7
    $sc.Save()
    Write-Host "[OK] shortcut: $Path" -ForegroundColor Green
}

$desktop = [Environment]::GetFolderPath('Desktop')
$startMenu = Join-Path ([Environment]::GetFolderPath('StartMenu')) 'Programs\Fangyu'
New-FangyuShortcut (Join-Path $desktop 'Fangyu-Worker.lnk') $startBat
New-FangyuShortcut (Join-Path $startMenu 'Fangyu-Worker.lnk') $startBat

Write-Host ''
Write-Host '=== Install done ===' -ForegroundColor Cyan
Write-Host 'Daily use:'
Write-Host '  1. Studio:  repo root  dev.bat'
Write-Host '  2. Worker:  Desktop Fangyu-Worker.lnk  or  dev-worker-tray.bat'
Write-Host '  3. Verify:  py scripts/worker_happy_path.py --spawn-worker'
Write-Host ''
Write-Host 'Electron retirement checklist: docs/ELECTRON_RETIREMENT.md'
Write-Host ''

$ans = 'n'
if (-not $env:FANGYU_INSTALL_NONINTERACTIVE) {
    $ans = Read-Host 'Start Worker tray now? (Y/n)'
}
if ($ans -eq '' -or $ans -match '^[Yy]') {
    Start-Process -FilePath $startBat -WorkingDirectory $WorkerRoot
    Write-Host '[OK] tray started' -ForegroundColor Green
}
