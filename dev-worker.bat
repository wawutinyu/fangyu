@echo off
REM 方隅·行 Worker — 本机守护进程（需序 API 已启动）
cd /d "%~dp0"

if not exist node_modules (
  echo [fangyu] 首次安装前端依赖...
  call npm install
)

echo [方隅·行] 连接序 API http://127.0.0.1:8000 ...
echo [方隅·行] 在画布点「派发至行」即可下发任务
echo.
npm run dev:worker
