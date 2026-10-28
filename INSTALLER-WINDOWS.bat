@echo off
chcp 65001 >nul
title Villa Studio - Installation
echo.
echo  ==============================================
echo    VILLA STUDIO - installation (une seule fois)
echo  ==============================================
echo.
cd /d "%~dp0"
where node >nul 2>nul || (echo [1/4] Installation de Node.js... & winget install -e --id OpenJS.NodeJS.LTS --accept-package-agreements --accept-source-agreements)
where ffmpeg >nul 2>nul || (echo [2/4] Installation de ffmpeg... & winget install -e --id Gyan.FFmpeg --accept-package-agreements --accept-source-agreements)
where python >nul 2>nul || (echo [3/4] Installation de Python... & winget install -e --id Python.Python.3.12 --accept-package-agreements --accept-source-agreements)
echo [4/4] Voix (edge-tts) et moteur de rendu...
call python -m pip install --upgrade edge-tts
call npm install --no-audit --no-fund
echo.
echo  Termine ! Ferme cette fenetre puis double-clique sur LANCER-STUDIO.bat
echo  (si une commande est "introuvable", redemarre le PC une fois puis relance ce fichier)
pause
