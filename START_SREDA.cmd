@echo off
setlocal
cd /d "%~dp0sreda"

set "PYTHONW_EXE=C:\Users\divan\AppData\Local\Python\pythoncore-3.14-64\pythonw.exe"
set "PYTHON_EXE=C:\Users\divan\AppData\Local\Python\pythoncore-3.14-64\python.exe"

if exist "%PYTHONW_EXE%" (
    start "" "%PYTHONW_EXE%" "%~dp0sreda\start_sreda.pyw"
    exit /b
)

if exist "%PYTHON_EXE%" (
    start "" "%PYTHON_EXE%" "%~dp0sreda\start_sreda.pyw"
    exit /b
)

where pythonw >nul 2>nul
if %errorlevel%==0 (
    start "" pythonw "%~dp0sreda\start_sreda.pyw"
    exit /b
)

where python >nul 2>nul
if %errorlevel%==0 (
    start "" python "%~dp0sreda\start_sreda.pyw"
    exit /b
)

msg * Python launcher not found. Install Python or fix PATH.
