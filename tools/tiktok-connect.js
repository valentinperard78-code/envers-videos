#!/usr/bin/env node
// Connexion du compte TikTok (une seule fois, sur ton PC) : ouvre TikTok dans le navigateur, tu acceptes,
// puis le logiciel affiche les 4 « secrets » à coller dans GitHub (Settings → Secrets → Actions).
// Usage : node tools/tiktok-connect.js   (ou CONNECTER-TIKTOK.bat)
import fs from 'node:fs';
import path from 'node:path';
import http from 'node:http';
import crypto from 'node:crypto';
import readline from 'node:readline/promises';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import * as T from '../publisher/tiktok.js';
import * as coffre from '../publisher/coffre.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const LOCAL = path.join(ROOT, '.tiktok-app.json'); // reste sur ton PC (ignoré par git)
export const PORT = 3455;
export const REDIRECT = `http://127.0.0.1:${PORT}/callback/`;

export function loadApp() { try { return JSON.parse(fs.readFileSync(LOCAL, 'utf8')); } catch { return {}; } }
export function saveApp(a) { fs.writeFileSync(LOCAL, JSON.stringify(a, null, 2)); }
function openBrowser(url) {
  const cmd = process.platform === 'win32' ? ['cmd', ['/c', 'start', '', url]] : process.platform === 'darwin' ? ['open', [url]] : ['xdg-open', [url]];
  try { spawn(cmd[0], cmd[1], { stdio: 'ignore', detached: true }).unref(); } catch {}
}

/** Lance la connexion ; renvoie { user, secrets } une fois que l'utilisateur a accepté sur TikTok. */
export async function connect({ clientKey, clientSecret, log = console.log }) {
  const app = loadApp();
  app.clientKey = clientKey || app.clientKey; app.clientSecret = clientSecret || app.clientSecret;
  if (!app.clientKey || !app.clientSecret) throw new Error('Client key et client secret TikTok requis (developers.tiktok.com → ton application).');
  app.cle = app.cle || coffre.newKey();
  saveApp(app);
  const { verifier, challenge } = T.pkce();
  const state = crypto.randomBytes(16).toString('hex');
  const url = T.authorizeUrl({ clientKey: app.clientKey, redirectUri: REDIRECT, state, challenge });
  const code = await new Promise((resolve, reject) => {
    const srv = http.createServer((req, res) => {
      const u = new URL(req.url, REDIRECT);
      if (!u.pathname.startsWith('/callback')) { res.writeHead(404); res.end(); return; }
      const ok = u.searchParams.get('state') === state && u.searchParams.get('code');
      res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
      res.end(`<meta charset="utf-8"><body style="font-family:system-ui;background:#1a0630;color:#fff;display:grid;place-items:center;height:100vh;margin:0"><div style="text-align:center"><h1>${ok ? '✅ TikTok connecté' : '❌ Connexion refusée'}</h1><p>${ok ? 'Tu peux fermer cet onglet et revenir au studio.' : (u.searchParams.get('error_description') || 'Réessaie.')}</p></div>`);
      srv.close();
      ok ? resolve(u.searchParams.get('code')) : reject(new Error(u.searchParams.get('error_description') || 'Connexion TikTok refusée.'));
    });
    srv.listen(PORT, '127.0.0.1', () => { log(`🌐 Ouverture de TikTok pour autoriser Villa Publisher…\n   (si rien ne s'ouvre : ${url})`); openBrowser(url); });
    setTimeout(() => { srv.close(); reject(new Error('Délai dépassé (10 min).')); }, 600000);
  });
  const tok = await T.exchangeCode({ clientKey: app.clientKey, clientSecret: app.clientSecret, code, redirectUri: REDIRECT, verifier });
  const user = await T.userInfo(tok.access_token).catch(() => ({}));
  const vault = coffre.encrypt(tok, app.cle);
  fs.writeFileSync(path.join(ROOT, 'villa', 'tiktok-jeton.chiffre'), vault + '\n');
  const secrets = { TIKTOK_CLIENT_KEY: app.clientKey, TIKTOK_CLIENT_SECRET: app.clientSecret, TIKTOK_CLE: app.cle, TIKTOK_JETON: vault };
  return { user, scopes: tok.scope, secrets };
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  (async () => {
    const app = loadApp();
    const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
    const clientKey = app.clientKey || (await rl.question('Client key TikTok : ')).trim();
    const clientSecret = app.clientSecret || (await rl.question('Client secret TikTok : ')).trim();
    rl.close();
    const r = await connect({ clientKey, clientSecret });
    console.log(`\n✅ Compte connecté : ${r.user.display_name || '(nom non disponible)'} — autorisations : ${r.scopes}`);
    console.log('\nColle ces 4 secrets dans GitHub → https://github.com/valentinperard78-code/envers-videos/settings/secrets/actions (bouton « New repository secret ») :\n');
    for (const [k, v] of Object.entries(r.secrets)) console.log(`${k}\n${v}\n`);
  })().catch((e) => { console.error('❌', e.message); process.exit(1); });
}
