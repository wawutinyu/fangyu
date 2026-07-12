@echo off
REM 方隅 序 + 行 + Happy Path 验证（需先 dev-clean 若端口占用）
cd /d "%~dp0"

if not exist node_modules call npm install
py -m pip install -e . -q

echo [1/3] 启动 API...
start "fangyu-api" cmd /c "cd /d %~dp0 && py -m fangyu --server"
timeout /t 3 /nobreak >nul

echo [2/3] 启动方隅·行 Worker...
start "fangyu-worker" cmd /c "cd /d %~dp0 && npm run dev:worker"
timeout /t 3 /nobreak >nul

echo [3/3] 运行 Happy Path...
py scripts/worker_happy_path.py
if errorlevel 1 (
  echo.
  echo Happy Path 失败。请确认 Worker 窗口在运行，或手动: dev.bat + dev-worker.bat
  pause
  exit /b 1
)

echo.
echo 成功！可另开 dev.bat 打开方隅·序: http://localhost:5173
pause
