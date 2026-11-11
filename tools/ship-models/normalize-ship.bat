@echo off
rem KOSMOS - normalizator modeli statkow (ARC COMBAT VISUALS, krok CV-1b).
rem Przeciagnij plik .glb (z Meshy) na ten plik. Nazwa pliku = nazwa slotu (np. warp_frigate.glb);
rem inna nazwa - program zapyta o slot. Opis: assets\models\ships\README_modele_statkow.md
chcp 65001 >nul
setlocal
cd /d "%~dp0..\.."
where node >nul 2>nul
if errorlevel 1 (
  echo Brak programu Node.js - zainstaluj go z https://nodejs.org albo popros Claude o pomoc.
  pause
  exit /b 1
)
if "%~1"=="" (
  node tools\ship-models\normalize-ship.mjs --help
  pause
  exit /b 0
)
:next
if "%~1"=="" goto done
node tools\ship-models\normalize-ship.mjs --from "%~1"
shift
goto next
:done
echo.
pause
