@echo off
cd /d "%~dp0"
echo ========================================
echo AeroSense AI - setup and launch
echo ========================================
where py >nul 2>nul
if errorlevel 1 (
  echo Python was not found. Install Python 3.11 or newer from python.org and enable Add Python to PATH.
  pause
  exit /b 1
)
if not exist .venv (
  py -m venv .venv
)
call .venv\Scripts\activate.bat
python -m pip install --upgrade pip
pip install -r requirements.txt
if errorlevel 1 (
  echo Dependency installation failed. Check internet and Python installation.
  pause
  exit /b 1
)
start "" http://127.0.0.1:5000
python app.py
pause
