@echo off
REM 删除已废弃目录（需先关闭 dev / Electron 窗口）
cd /d "%~dp0"

echo [fangyu] 先释放端口...
call dev-clean.bat

echo.
echo [fangyu] 删除 fangyu-web / fangyu-flow ...
if exist fangyu-web (
  rd /s /q fangyu-web 2>nul
  if exist fangyu-web (
    echo   [失败] fangyu-web 仍被占用，请关闭 Electron/浏览器/Vite 后重试
  ) else (
    echo   [OK] 已删除 fangyu-web
  )
) else (
  echo   [跳过] fangyu-web 不存在
)

if exist fangyu-flow (
  rd /s /q fangyu-flow 2>nul
  if exist fangyu-flow (
    echo   [失败] fangyu-flow 仍被占用
  ) else (
    echo   [OK] 已删除 fangyu-flow
  )
) else (
  echo   [跳过] fangyu-flow 不存在
)

echo.
echo 完成。请运行 dev.bat 启动方隅·序。
pause
