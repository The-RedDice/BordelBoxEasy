@echo off
title BordelBoxEasy - Serveur & Bot
cd /d "%~dp0"

:: Ajoute Node.js au PATH de la session au cas où l'IDE n'a pas encore redémarré
set "PATH=%PATH%;C:\Program Files\nodejs;%APPDATA%\npm"

echo ====================================================
echo  Lancement de BordelBoxEasy...
echo ====================================================

where node >nul 2>nul
if %errorlevel% neq 0 (
    echo [ERREUR] Node.js est introuvable dans C:\Program Files\nodejs.
    echo Veuillez verifier votre installation.
    pause
    exit /b 1
)

npm start
if %errorlevel% neq 0 (
    echo.
    echo [INFO] Une erreur est survenue lors du demarrage.
    pause
)
