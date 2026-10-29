#!/usr/bin/env node
// Serveur local du logiciel Villa Studio : interface web + API (préparation, rendu, fichiers).
// Lancer : node tools/studio-server.js   puis ouvrir http://localhost:5173
import fs from 'node:fs';
import path from 'node:path';
import { spawn, spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { startStaticServer } from './static-server.js';
import { parseScript } from '../engine/script/parser.js';
import { buildCasting } from '../engine/script/casting.js';
import { buildTimeline, collectLines, splitDoc } from '../engine/script/director.js';
import { synthesizeAll, ttsAvailable } from './tts.js';
import { mixEpisode } from './audio-mix.js';
import { renderEpisode } from './render.js';
import { findChrome } from './chrome.js';
import { loadBible, nextEpisodeTitle } from './serie.js';
import { connect as tiktokConnect, loadApp as tiktokApp } from './tiktok-connect.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const PORT = +(process.env.PORT || 5173);
const SCRIPTS = path.join(ROOT, 'scripts'), OUT = path.join(ROOT, 'sorties'), PREVIEW = path.join(ROOT, '.cache', 'apercu');
for (const d of [SCRIPTS, OUT, PREVIEW]) fs.mkdirSync(d, { recursive: true });

const clients = new Set();
let job = null; // rendu en cours
const history = [];
function broadcast(ev) { history.push(ev); if (history.length > 400) history.shift(); const s = `data: ${JSON.stringify(ev)}\n\n`; for (const c of clients) c.write(s); }

const safeName = (n) => String(n || 'episode').replace(/\.(md|txt)$/i, '').replace(/[^\p{L}\p{N}_\- ]/gu, '').trim().replace(/\s+/g, '-').slice(0, 60) || 'episode';
async function body(req) { let b = ''; for await (const c of req) b += c; return b ? JSON.parse(b) : {}; }
function json(res, obj, code = 200) { res.writeHead(code, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' }); res.end(JSON.stringify(obj)); }

function status() {
  let chrome = null; try { chrome = findChrome(); } catch {}
  const ff = spawnSync('ffmpeg', ['-version']).status === 0;
  return { tts: ttsAvailable(), ffmpeg: ff, chrome, busy: !!job, platform: process.platform };
}

async function api(req, res) {
  const url = new URL(req.url, 'http://x');
  if (!url.pathname.startsWith('/api/')) return false;
  const p = url.pathname.slice(5);
  try {
    if (p === 'status') return json(res, status()), true;
    if (p === 'scripts') return json(res, fs.readdirSync(SCRIPTS).filter((f) => /\.(md|txt)$/i.test(f)).sort()), true;
    if (p === 'script' && req.method === 'GET') { const f = path.join(SCRIPTS, path.basename(url.searchParams.get('name') || '')); return json(res, { content: fs.existsSync(f) ? fs.readFileSync(f, 'utf8') : '' }), true; }
    if (p === 'script' && req.method === 'POST') { const b = await body(req); const name = safeName(b.name) + '.md'; fs.writeFileSync(path.join(SCRIPTS, name), b.content || ''); return json(res, { ok: true, name }), true; }
    if (p === 'bible') return json(res, loadBible()), true;
    // ---- publication TikTok (Villa Publisher)
    if (p === 'publication') {
      // calendrier « officiel » = celui de GitHub (c'est lui que l'automatisme utilise) ; sinon copie locale
      const remote = await fetch('https://raw.githubusercontent.com/valentinperard78-code/envers-videos/villa-studio/villa/publication.json', { cache: 'no-store' }).then((r) => (r.ok ? r.json() : null)).catch(() => null);
      const local = JSON.parse(fs.readFileSync(path.join(ROOT, 'villa', 'publication.json'), 'utf8'));
      const app = tiktokApp();
      return json(res, { conf: remote || local, source: remote ? 'github' : 'local', app: { clientKey: app.clientKey || '', connected: fs.existsSync(path.join(ROOT, 'villa', 'tiktok-jeton.chiffre')) } }), true;
    }
    if (p === 'tiktok/connect' && req.method === 'POST') {
      const b = await body(req);
      const r = await tiktokConnect({ clientKey: b.clientKey, clientSecret: b.clientSecret, log: (m) => broadcast({ type: 'log', message: m }) });
      return json(res, r), true;
    }
    if (p === 'outputs') {
      const list = fs.readdirSync(OUT).filter((f) => f.endsWith('.mp4')).map((f) => ({ name: f, url: `/sorties/${encodeURIComponent(f)}`, size: fs.statSync(path.join(OUT, f)).size, date: fs.statSync(path.join(OUT, f)).mtimeMs })).sort((a, b) => b.date - a.date);
      return json(res, list), true;
    }
    if (p === 'analyse' && req.method === 'POST') {
      const b = await body(req); const doc = parseScript(b.content || ''); const bible = loadBible(); const casting = buildCasting(doc, bible);
      const tl = buildTimeline(doc, { bible });
      return json(res, { title: doc.title, sections: doc.sections.length, lines: collectLines(doc, casting).length, cast: casting.list.map((e) => ({ id: e.id, name: e.name, color: e.color, role: e.role, voice: e.voice.voice, preset: typeof e.def === 'string', known: !!e.fromBible })), duration: tl.meta.duration }), true;
    }
    if (p === 'prepare' && req.method === 'POST') {
      // timeline + voix + mixage pour l'aperçu temps réel (avec le son)
      const b = await body(req); let doc = parseScript(b.content || ''); if (b.part) doc = splitDoc(doc, b.part); const bible = loadBible(); const casting = buildCasting(doc, bible);
      const lines = collectLines(doc, casting);
      let speech = {}, mode = 'estimated';
      if (b.voices !== false) ({ speech, mode } = await synthesizeAll(lines, path.join(ROOT, '.cache', 'voix'), (m) => broadcast({ type: 'log', message: m })));
      const tl = buildTimeline(doc, { speech, bible, next: nextEpisodeTitle(doc.episode) });
      const name = `apercu-${Date.now()}.wav`;
      for (const f of fs.readdirSync(PREVIEW)) if (f.startsWith('apercu-')) fs.rmSync(path.join(PREVIEW, f), { force: true });
      mixEpisode(tl, speech, path.join(PREVIEW, name));
      return json(res, { timeline: tl, audio: `/.cache/apercu/${name}`, mode }), true;
    }
    if (p === 'render' && req.method === 'POST') {
      if (job) return json(res, { error: 'Un rendu est déjà en cours.' }, 409), true;
      const b = await body(req); const name = safeName(b.name);
      const file = path.join(SCRIPTS, name + '.md'); fs.writeFileSync(file, b.content || '');
      const out = path.join(OUT, `${name}${b.part ? '-partie' + b.part.replace('/', 'sur') : ''}-${b.quality || 'standard'}.mp4`);
      history.length = 0;
      job = { name, started: Date.now() };
      broadcast({ type: 'start', name, quality: b.quality });
      renderEpisode(file, { quality: b.quality || 'standard', out, part: b.part, noVoice: b.voices === false, workers: b.workers, log: (m) => broadcast({ type: 'log', message: m }) }, (ev) => { if (ev.type !== 'log') broadcast(ev); })
        .then((r) => broadcast({ type: 'finished', url: `/sorties/${encodeURIComponent(path.basename(r.file))}` }))
        .catch((e) => broadcast({ type: 'error', message: e.message }))
        .finally(() => { job = null; });
      return json(res, { ok: true, out: path.basename(out) }), true;
    }
    if (p === 'events') {
      res.writeHead(200, { 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-store', Connection: 'keep-alive' });
      res.write(`data: ${JSON.stringify({ type: 'hello', busy: !!job })}\n\n`);
      for (const ev of history) res.write(`data: ${JSON.stringify(ev)}\n\n`);
      clients.add(res); req.on('close', () => clients.delete(res));
      return true;
    }
  } catch (e) { console.error(e); json(res, { error: e.message }, 500); return true; }
  json(res, { error: 'inconnu' }, 404); return true;
}

const server = await startStaticServer(ROOT, PORT, api);
const url = `http://localhost:${server.address().port}`;
console.log(`\n  🌴 Villa Studio est lancé : ${url}\n  (laisse cette fenêtre ouverte ; Ctrl+C pour arrêter)\n`);
const st = status();
if (!st.tts) console.log('  ⚠ Voix : edge-tts non installé -> vidéos sans voix. Installe-le : pip install edge-tts');
if (!st.ffmpeg) console.log('  ⚠ ffmpeg introuvable : impossible de produire le MP4.');
if (!st.chrome) console.log('  ⚠ Chrome/Edge introuvable : impossible de produire le MP4.');
if (!process.argv.includes('--pas-de-navigateur')) {
  const opener = process.platform === 'win32' ? ['cmd', ['/c', 'start', '', url]] : process.platform === 'darwin' ? ['open', [url]] : ['xdg-open', [url]];
  try { spawn(opener[0], opener[1], { stdio: 'ignore', detached: true }).unref(); } catch {}
}
