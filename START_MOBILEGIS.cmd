@echo off
setlocal
cd /d "%~dp0"
set "TASK_PYTHON=%LOCALAPPDATA%\Programs\Python\Python312\python.exe"
if exist "%USERPROFILE%\.cache\codex-runtimes\codex-primary-runtime\dependencies\python\python.exe" (
  set "TASK_PYTHON=%USERPROFILE%\.cache\codex-runtimes\codex-primary-runtime\dependencies\python\python.exe"
)
if exist "%~dp0.venv\Scripts\python.exe" set "TASK_PYTHON=%~dp0.venv\Scripts\python.exe"
if exist "%TASK_PYTHON%" (
  "%TASK_PYTHON%" -X utf8 scripts/manage_postgres.py start
  if errorlevel 1 goto end
  "%TASK_PYTHON%" -X utf8 server.py --port 5379 --auto-port
) else (
  python -X utf8 scripts/manage_postgres.py start
  if errorlevel 1 goto end
  python -X utf8 server.py --port 5379 --auto-port
)
:end
pause
