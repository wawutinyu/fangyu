# 方隅·行 — Windows 系统托盘启动器（无需 Electron / 无需 Rust）
# 用法: powershell -ExecutionPolicy Bypass -File tray/worker-tray.ps1

$ErrorActionPreference = 'Stop'
$WorkerRoot = Split-Path $PSScriptRoot -Parent
$RepoRoot = Split-Path $WorkerRoot -Parent

$ApiBase = if ($env:FANGYU_API_BASE) { $env:FANGYU_API_BASE } else { 'http://127.0.0.1:8000' }
$StudioUrl = if ($env:FANGYU_STUDIO_URL) { $env:FANGYU_STUDIO_URL } else { 'http://localhost:5173' }
$WorkerProc = $null

Add-Type -AssemblyName System.Windows.Forms
Add-Type -AssemblyName System.Drawing

function Test-Api {
    try {
        $r = Invoke-WebRequest -Uri "$ApiBase/api/health" -UseBasicParsing -TimeoutSec 2
        return $r.StatusCode -eq 200
    } catch { return $false }
}

function Start-WorkerProcess {
    if ($script:WorkerProc -and -not $script:WorkerProc.HasExited) { return }
    $psi = New-Object System.Diagnostics.ProcessStartInfo
    $psi.FileName = 'node'
    $psi.Arguments = 'src/cli.mjs'
    $psi.WorkingDirectory = $WorkerRoot
    $psi.UseShellExecute = $false
    $psi.CreateNoWindow = $true
    $env:FANGYU_API_BASE = $ApiBase
    $script:WorkerProc = [System.Diagnostics.Process]::Start($psi)
}

function Stop-WorkerProcess {
    if ($script:WorkerProc -and -not $script:WorkerProc.HasExited) {
        $script:WorkerProc.Kill()
        $script:WorkerProc.WaitForExit(3000)
    }
    $script:WorkerProc = $null
}

$icon = [System.Drawing.SystemIcons]::Application
$tray = New-Object System.Windows.Forms.NotifyIcon
$tray.Icon = $icon
$tray.Text = '方隅·行 Worker'
$tray.Visible = $true

$menu = New-Object System.Windows.Forms.ContextMenuStrip
$miStatus = $menu.Items.Add('状态: 启动中…')
$miStatus.Enabled = $false
$menu.Items.Add('─') | Out-Null
$menu.Items.Add('打开方隅·序 (浏览器)', $null, { Start-Process $StudioUrl }) | Out-Null
$menu.Items.Add('重启 Worker', $null, {
    Stop-WorkerProcess
    Start-WorkerProcess
}) | Out-Null
$menu.Items.Add('退出', $null, {
    Stop-WorkerProcess
    $tray.Visible = $false
    [System.Windows.Forms.Application]::Exit()
}) | Out-Null
$tray.ContextMenuStrip = $menu

$tray.Add_DoubleClick({ Start-Process $StudioUrl })

Start-WorkerProcess

$timer = New-Object System.Windows.Forms.Timer
$timer.Interval = 5000
$timer.Add_Tick({
    $apiOk = Test-Api
    $workerOk = $script:WorkerProc -and -not $script:WorkerProc.HasExited
    if ($apiOk -and $workerOk) {
        $miStatus.Text = '状态: 运行中 (API + Worker)'
        $tray.Text = '方隅·行 — 运行中'
    } elseif ($workerOk) {
        $miStatus.Text = '状态: Worker 运行，API 未就绪'
        $tray.Text = '方隅·行 — 等待 API'
    } else {
        $miStatus.Text = '状态: Worker 已停止'
        $tray.Text = '方隅·行 — 已停止'
    }
})
$timer.Start()

[System.Windows.Forms.Application]::Run()

Stop-WorkerProcess
$tray.Dispose()
