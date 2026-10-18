@echo off
setlocal
cd /d "%~dp0"
set "TASK_PYTHON=%USERPROFILE%\.cache\codex-runtimes\codex-primary-runtime\dependencies\python\python.exe"
if not exist "%TASK_PYTHON%" set "TASK_PYTHON=python"
"%TASK_PYTHON%" -m venv .venv
if errorlevel 1 goto end
".venv\Scripts\python.exe" -m pip install -r requirements-server.txt
:end
pause
