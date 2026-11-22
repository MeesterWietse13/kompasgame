@echo off
rem Start De Verdwaalde Koerier: opent Chrome/de browser en draait het lokale servertje.
rem Sluit dit zwarte venster om het spel te stoppen.
cd /d "%~dp0"
start "" http://localhost:5173
python serve.py 5173
if errorlevel 1 (
  echo.
  echo Python werd niet gevonden of de poort is bezet.
  echo Installeer Python via https://www.python.org/downloads/ en probeer opnieuw.
  pause
)
