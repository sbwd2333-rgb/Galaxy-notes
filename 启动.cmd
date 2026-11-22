@echo off
chcp 65001 >nul
rem 启动已安装的 Galaxy Notes。
rem 首次使用或重新打包后，请先运行「安装并启动.cmd」。

set "EXE=%LOCALAPPDATA%\GalaxyNotesApp\Galaxy Notes.exe"
if not exist "%EXE%" (
  echo 还没安装。先运行「安装并启动.cmd」。
  pause
  exit /b 1
)
start "" "%EXE%"
