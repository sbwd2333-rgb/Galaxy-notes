@echo off
chcp 65001 >nul
rem 把 release\win-unpacked 同步安装到 %LOCALAPPDATA%\GalaxyNotesApp 并启动。
rem
rem 为什么不直接从 release 目录跑：
rem   这台机器的 Documents 目录上有安全软件在拦 Chromium 的初始化，
rem   放在 Documents 下的 Electron 会在启动瞬间 0xc0000005 崩掉；
rem   复制到 %LOCALAPPDATA% 下就正常了。所以每次重新打包后都要跑一次这个脚本。

set "SRC=%~dp0release\win-unpacked"
set "DEST=%LOCALAPPDATA%\GalaxyNotesApp"

if not exist "%SRC%\Galaxy Notes.exe" (
  echo 找不到 "%SRC%\Galaxy Notes.exe"。
  echo 先运行一次打包：pnpm pack
  pause
  exit /b 1
)

echo 正在安装到 %DEST% ...
robocopy "%SRC%" "%DEST%" /MIR /NFL /NDL /NJH /NJS /NP >nul
if errorlevel 8 (
  echo 复制失败，请关闭正在运行的 Galaxy Notes 后重试。
  pause
  exit /b 1
)

echo 已安装。正在启动...
start "" "%DEST%\Galaxy Notes.exe"
