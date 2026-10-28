@echo off
chcp 65001 >nul
title Villa Studio
cd /d "%~dp0"
set VILLA_GPU=1
node tools\studio-server.js
pause
