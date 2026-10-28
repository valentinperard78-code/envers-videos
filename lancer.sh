#!/usr/bin/env bash
cd "$(dirname "$0")"
VILLA_GPU=${VILLA_GPU:-1} node tools/studio-server.js
