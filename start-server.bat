@echo off
setlocal
cd /d "%~dp0"
where py >nul 2>&1
if not errorlevel 1 (
    py -3 -c "import sys; assert sys.version_info >= (3,8)" >nul 2>&1
    if not errorlevel 1 goto use_py
)
where python >nul 2>&1
if not errorlevel 1 (
    python -c "import sys; assert sys.version_info >= (3,8)" >nul 2>&1
    if not errorlevel 1 goto use_python
)
echo Python 3.8 or newer was not found.
echo Install Python 3 from https://www.python.org/downloads/windows/
echo Then run start-server.bat again. Do NOT open index.html directly.
echo No npm or extra Python packages are required.
pause
exit /b 1
:use_py
py -3 tools\serve.py
goto done
:use_python
python tools\serve.py
:done
pause
