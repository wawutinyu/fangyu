@echo off
REM 方隅·行 — Windows 一键安装（依赖检查 + 桌面/开始菜单快捷方式）
cd /d "%~dp0"
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0fangyu-worker\install-windows.ps1"
if errorlevel 1 pause
