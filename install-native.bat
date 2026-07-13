@echo off
REM 方隅 — Windows 原生一键安装（依赖检查 + 桌面/开始菜单「Fangyu」快捷方式）
cd /d "%~dp0"
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0fangyu-worker-tauri\install-native.ps1"
if errorlevel 1 pause
