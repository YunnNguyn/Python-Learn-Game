@echo off
setlocal
cd /d "%~dp0"
where py >nul 2>nul
if %ERRORLEVEL% EQU 0 (
  py -3 -m python_learn_runtime %*
) else (
  python -m python_learn_runtime %*
)
