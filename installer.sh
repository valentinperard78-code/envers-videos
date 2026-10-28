#!/usr/bin/env bash
# Installation Mac / Linux (une seule fois)
set -e
cd "$(dirname "$0")"
command -v node >/dev/null || { echo "Installe Node.js (https://nodejs.org) puis relance."; exit 1; }
command -v ffmpeg >/dev/null || { if command -v brew >/dev/null; then brew install ffmpeg; else sudo apt-get install -y ffmpeg; fi; }
python3 -m pip install --upgrade edge-tts || pip3 install --upgrade edge-tts
npm install --no-audit --no-fund
echo "Terminé ! Lance ./lancer.sh"
