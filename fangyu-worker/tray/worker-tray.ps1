# Fangyu Worker — Windows tray (no Electron / Rust)
# Usage: powershell -ExecutionPolicy Bypass -File tray/worker-tray.ps1
# Saved as UTF-8 with BOM for Windows PowerShell 5.x

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
$tray.Text = 'Fangyu Worker'
$tray.Visible = $true

$menu = New-Object System.Windows.Forms.ContextMenuStrip
$miStatus = New-Object System.Windows.Forms.ToolStripMenuItem
$miStatus.Text = 'Status: starting...'
$miStatus.Enabled = $false
[void]$menu.Items.Add($miStatus)
[void]$menu.Items.Add((New-Object System.Windows.Forms.ToolStripSeparator))

$miOpen = New-Object System.Windows.Forms.ToolStripMenuItem
$miOpen.Text = 'Open Studio (browser)'
$miOpen.Add_Click({ Start-Process $StudioUrl })
[void]$menu.Items.Add($miOpen)

$miRestart = New-Object System.Windows.Forms.ToolStripMenuItem
$miRestart.Text = 'Restart Worker'
$miRestart.Add_Click({
    Stop-WorkerProcess
    Start-WorkerProcess
})
[void]$menu.Items.Add($miRestart)

$miExit = New-Object System.Windows.Forms.ToolStripMenuItem
$miExit.Text = 'Exit'
$miExit.Add_Click({
    Stop-WorkerProcess
    $tray.Visible = $false
    [System.Windows.Forms.Application]::Exit()
})
[void]$menu.Items.Add($miExit)

$tray.ContextMenuStrip = $menu
$tray.Add_DoubleClick({ Start-Process $StudioUrl })

Start-WorkerProcess

$timer = New-Object System.Windows.Forms.Timer
$timer.Interval = 5000
$timer.Add_Tick({
    $apiOk = Test-Api
    $workerOk = $script:WorkerProc -and -not $script:WorkerProc.HasExited
    if ($apiOk -and $workerOk) {
        $miStatus.Text = 'Status: running (API + Worker)'
        $tray.Text = 'Fangyu Worker - running'
    } elseif ($workerOk) {
        $miStatus.Text = 'Status: Worker up, API down'
        $tray.Text = 'Fangyu Worker - waiting API'
    } else {
        $miStatus.Text = 'Status: Worker stopped'
        $tray.Text = 'Fangyu Worker - stopped'
    }
})
$timer.Start()

[System.Windows.Forms.Application]::Run()

Stop-WorkerProcess
$tray.Dispose()
