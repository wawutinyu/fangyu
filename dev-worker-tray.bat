@echo off
REM 方隅·行 — 系统托盘版（推荐 Windows 用户）
cd /d "%~dp0"

if not exist node_modules (
  echo [fangyu] 安装依赖...
  call npm install
)

call fangyu-worker\tray\start-tray.bat
