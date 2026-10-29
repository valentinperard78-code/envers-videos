@echo off
chcp 65001 >nul
cd /d "%~dp0"
echo Connexion de ton compte TikTok a Villa Publisher...
node tools\tiktok-connect.js
pause
