@echo off
chcp 65001 >nul
rem 带日志启动（日志写到 %LOCALAPPDATA%\GalaxyNotesApp\run.log）。
rem 如果窗口没出现或白屏，把这个 log 发给开发者即可定位。

set "DEST=%LOCALAPPDATA%\GalaxyNotesApp"
if not exist "%DEST%\Galaxy Notes.exe" (
  echo 还没安装。先运行「安装并启动.cmd」。
  pause
  exit /b 1
)
start "" "%DEST%\Galaxy Notes.exe" --enable-logging --log-file="%DEST%\run.log"
