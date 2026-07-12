@echo off
REM 方隅·序 + API — 根目录 workspaces，依赖只装一次
cd /d "%~dp0"

if not exist node_modules (
  echo [fangyu] 首次安装前端依赖（workspaces 一次搞定）...
  call npm install
)

echo [fangyu] Installing Python package...
py -m pip install -e . -q

echo [fangyu] Starting backend on port 8000...
start "fangyu-api" cmd /c "cd /d %~dp0 && py -m fangyu --server"

echo [方隅·序] Starting fangyu-studio on port 5173...
start "fangyu-studio" cmd /c "cd /d %~dp0 && npm run dev"

echo.
echo   API:    http://localhost:8000
echo   序 Studio: http://localhost:5173
echo   Docs:   http://localhost:8000/docs
echo.
echo   若端口被占用或界面是旧版，先运行 dev-clean.bat
echo   方隅·行 Worker: dev-worker.bat
pause
