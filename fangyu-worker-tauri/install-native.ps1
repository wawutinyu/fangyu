# 方隅 — Windows 原生一键安装（依赖检查 + 桌面/开始菜单快捷方式）
# 用法（仓库根目录）:
#   powershell -ExecutionPolicy Bypass -File fangyu-worker-tauri/install-native.ps1
# 或双击根目录 install-native.bat
# 非交互: $env:FANGYU_INSTALL_NONINTERACTIVE='1'

$ErrorActionPreference = 'Stop'

$TauriRoot = $PSScriptRoot
$RepoRoot = Split-Path $TauriRoot -Parent

Write-Host ''
Write-Host '=== Fangyu Native install check ===' -ForegroundColor Cyan
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
            Write-Host "[OK] Python ($py)" -ForegroundColor Green
            $pyOk = $true
            break
        }
    }
}
if (-not $pyOk) {
    Write-Host '[X] Python 3.10+ required for API' -ForegroundColor Red
    $failed = $true
}

if (-not (Test-Command 'rustc')) {
    Write-Host '[X] Rust not found — install https://rustup.rs/ (MSVC toolchain)' -ForegroundColor Red
    $failed = $true
} else {
    Write-Host "[OK] rustc $(rustc --version)" -ForegroundColor Green
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

    $tauriNm = Join-Path $TauriRoot 'node_modules'
    if (-not (Test-Path $tauriNm)) {
        Write-Host '[..] npm install (fangyu-worker-tauri) ...' -ForegroundColor Cyan
        Push-Location $TauriRoot
        try {
            npm install
            if ($LASTEXITCODE -ne 0) { throw 'tauri npm install failed' }
        } finally {
            Pop-Location
        }
    }

    Write-Host '[..] pip install -e . ...' -ForegroundColor Cyan
    $pipCmd = if (Test-Command 'py') { 'py' } else { 'python' }
    $prevEa = $ErrorActionPreference
    $ErrorActionPreference = 'Continue'
    & $pipCmd -m pip install -e . -q 2>&1 | Out-Null
    $ErrorActionPreference = $prevEa
    Write-Host '[OK] fangyu Python package' -ForegroundColor Green
} finally {
    Pop-Location
}

$startBat = Join-Path $RepoRoot 'dev-native.bat'
if (-not (Test-Path $startBat)) {
    Write-Host "[X] missing $startBat" -ForegroundColor Red
    exit 1
}

$WshShell = New-Object -ComObject WScript.Shell

function New-FangyuNativeShortcut([string]$Path, [string]$Target) {
    $dir = Split-Path $Path -Parent
    if (-not (Test-Path $dir)) { New-Item -ItemType Directory -Path $dir -Force | Out-Null }
    $sc = $WshShell.CreateShortcut($Path)
    $sc.TargetPath = $Target
    $sc.WorkingDirectory = $RepoRoot
    $sc.Description = 'Fangyu Native (序 UI + API + Worker)'
    $sc.WindowStyle = 1
    $ico = Join-Path $TauriRoot 'src-tauri\icons\icon.ico'
    if (Test-Path $ico) { $sc.IconLocation = $ico }
    $sc.Save()
    Write-Host "[OK] shortcut: $Path" -ForegroundColor Green
}

$desktop = [Environment]::GetFolderPath('Desktop')
$startMenu = Join-Path ([Environment]::GetFolderPath('StartMenu')) 'Programs\Fangyu'
New-FangyuNativeShortcut (Join-Path $desktop 'Fangyu.lnk') $startBat
New-FangyuNativeShortcut (Join-Path $startMenu 'Fangyu.lnk') $startBat

# 持久化仓库根，供打包 exe / 非常规 cwd 启动
$configDir = Join-Path $env:LOCALAPPDATA 'Fangyu'
if (-not (Test-Path $configDir)) { New-Item -ItemType Directory -Path $configDir -Force | Out-Null }
$configPath = Join-Path $configDir 'native.json'
$config = @{
  repo_root = $RepoRoot
  data_dir  = (Join-Path $RepoRoot 'data')
} | ConvertTo-Json
[System.IO.File]::WriteAllText($configPath, $config, [System.Text.UTF8Encoding]::new($false))
Write-Host "[OK] config: $configPath" -ForegroundColor Green

Write-Host ''
Write-Host '=== Install done ===' -ForegroundColor Cyan
Write-Host 'Daily use: Desktop Fangyu.lnk  (or  install-native.bat once, then Fangyu.lnk)'
Write-Host '  Opens native window = Studio UI 1:1 + API + Worker tray'
Write-Host '  Config: %LOCALAPPDATA%\Fangyu\native.json'
Write-Host '  Build installer: build-native.bat'
Write-Host ''

if ($env:FANGYU_INSTALL_NONINTERACTIVE -ne '1') {
    $ans = Read-Host 'Start Fangyu now? [Y/n]'
    if ($ans -eq '' -or $ans -match '^[Yy]') {
        Start-Process -FilePath $startBat -WorkingDirectory $RepoRoot
    }
}
