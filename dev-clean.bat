@echo off
REM 清理 fangyu 开发占用端口，避免旧 fangyu-web / 重复 API 进程干扰
cd /d "%~dp0"

echo [fangyu] 正在释放端口 5173 / 5180 / 8000 ...
for %%P in (5173 5180 8000) do (
  for /f "tokens=5" %%A in ('netstat -ano ^| findstr ":%%P " ^| findstr LISTENING') do (
    echo   终止 PID %%A ^(端口 %%P^)
    taskkill /PID %%A /F >nul 2>&1
  )
)

echo.
echo [fangyu] 端口已清理。请重新启动：
echo   install-native.bat / dev-native.bat  — Windows 原生（推荐）
echo   dev.bat          — 方隅·序 + API
echo   dev-worker.bat   — 方隅·行 Worker
echo.
pause
