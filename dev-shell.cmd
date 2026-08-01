@echo off
setlocal
set "PROJECT_ROOT=%~dp0"
powershell -NoLogo -NoExit -ExecutionPolicy Bypass -Command ". '%PROJECT_ROOT%dev-shell.ps1'"
