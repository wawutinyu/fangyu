@echo off
REM 方隅·行 — Windows 系统托盘（原生 Shell MVP）
cd /d "%~dp0\.."

echo [方隅·行] 启动系统托盘…
echo   需 API: py -m fangyu --server
echo   右键托盘: 打开序 / 重启 Worker / 退出
powershell -ExecutionPolicy Bypass -File "%~dp0worker-tray.ps1"
