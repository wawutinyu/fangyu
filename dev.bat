@echo off
REM fangyu 开发服务器
REM 同时启动后端 API + fangyu-flow 画布

echo [fangyu] Installing Python package...
cd /d "%~dp0"
py -m pip install -e . -q

echo [fangyu] Starting backend on port 8000...
start "fangyu-api" cmd /c "cd /d %~dp0 && py -m fangyu --server"

echo [fangyu-flow] Starting canvas on port 5173...
cd /d "%~dp0fangyu-flow"
start "fangyu-flow" cmd /c "npm run dev"

echo.
echo   API:    http://localhost:8000
echo   Canvas: http://localhost:5173
echo   Docs:   http://localhost:8000/docs
pause
