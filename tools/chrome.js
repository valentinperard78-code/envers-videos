// Localise Chrome / Edge / Chromium sur Windows, macOS et Linux, et choisit les options GPU.
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
export function findChrome() {
  if (process.env.CHROME_PATH && fs.existsSync(process.env.CHROME_PATH)) return process.env.CHROME_PATH;
  const home = os.homedir();
  const cands = [];
  if (process.platform === 'win32') {
    const pf = [process.env['PROGRAMFILES'], process.env['PROGRAMFILES(X86)'], process.env.LOCALAPPDATA].filter(Boolean);
    for (const base of pf) cands.push(
      path.join(base, 'Google/Chrome/Application/chrome.exe'),
      path.join(base, 'Microsoft/Edge/Application/msedge.exe'),
      path.join(base, 'Chromium/Application/chrome.exe'));
  } else if (process.platform === 'darwin') {
    cands.push('/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', '/Applications/Microsoft Edge.app/Contents/MacOS/Microsoft Edge', '/Applications/Chromium.app/Contents/MacOS/Chromium');
  } else {
    cands.push('/usr/bin/google-chrome', '/usr/bin/google-chrome-stable', '/usr/bin/chromium', '/usr/bin/chromium-browser', '/snap/bin/chromium', '/usr/bin/microsoft-edge');
    // navigateurs de Playwright éventuellement installés
    for (const root of ['/opt/pw-browsers', path.join(home, '.cache/ms-playwright')]) {
      if (!fs.existsSync(root)) continue;
      for (const d of fs.readdirSync(root).sort().reverse()) {
        cands.push(path.join(root, d, 'chrome-linux/chrome'), path.join(root, d, 'chrome-linux64/chrome'), path.join(root, d, 'chrome-headless-shell-linux64/chrome-headless-shell'));
      }
    }
  }
  const hit = cands.find((p) => p && fs.existsSync(p));
  if (!hit) throw new Error("Chrome ou Edge introuvable. Installe Google Chrome, ou indique son chemin dans la variable CHROME_PATH.");
  return hit;
}
export function chromeArgs({ gpu = process.env.VILLA_GPU } = {}) {
  const base = ['--no-sandbox', '--ignore-gpu-blocklist', '--disable-dev-shm-usage', '--autoplay-policy=no-user-gesture-required', '--hide-scrollbars', '--mute-audio'];
  // Sans carte graphique (serveurs, GitHub Actions) : rendu logiciel SwiftShader.
  if (gpu === '0' || (process.platform === 'linux' && gpu !== '1')) return [...base, '--use-angle=swiftshader', '--enable-unsafe-swiftshader'];
  return [...base, '--enable-gpu', '--use-angle=default', '--enable-gpu-rasterization'];
}
