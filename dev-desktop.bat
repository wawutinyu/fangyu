@echo off
REM 方隅·行 Electron 过渡壳（可选）— 日常开发请用 dev.bat + dev-worker.bat
cd /d "%~dp0"

if not exist node_modules (
  echo [fangyu] 首次安装前端依赖...
  call npm install
)

echo [提示] fangyu-desktop 为过渡壳，长期由 fangyu-worker 原生 App 替代。
echo.
call npm run dev:desktop
