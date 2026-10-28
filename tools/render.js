#!/usr/bin/env node
// Rendu complet : script -> voix -> timeline -> images 3D -> MP4 vertical 1080x1920.
// Usage : node tools/render.js scripts/mon-episode.md [--qualite standard|brouillon|max] [--sortie sorties/x.mp4]
//         [--fps 30] [--workers 2] [--de 0] [--a 999] [--sans-voix] [--apercu]
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { parseScript } from '../engine/script/parser.js';
import { buildCasting } from '../engine/script/casting.js';
import { buildTimeline, collectLines, estimateSpeech, splitDoc } from '../engine/script/director.js';
import { synthesizeAll } from './tts.js';
import { mixEpisode } from './audio-mix.js';
import { registerCast } from '../engine/script/bible.js';
import { loadBible, saveBible, nextEpisodeTitle } from './serie.js';
import { startStaticServer } from './static-server.js';
import { findChrome, chromeArgs } from './chrome.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

export async function renderEpisode(scriptPath, opts = {}, onProgress = () => {}) {
  const log = opts.log || ((m) => { console.log(m); onProgress({ type: 'log', message: m }); });
  const quality = opts.quality || 'standard';
  const qDefaults = { brouillon: 24, standard: 30, max: 30 };
  const fps = +(opts.fps || qDefaults[quality] || 30);
  const src = fs.readFileSync(scriptPath, 'utf8');
  const base = path.basename(scriptPath).replace(/\.[^.]+$/, '') + (opts.part ? `-partie${String(opts.part).replace('/', 'sur')}` : '');
  const outFile = path.resolve(opts.out || path.join(ROOT, 'sorties', `${base}.mp4`));
  fs.mkdirSync(path.dirname(outFile), { recursive: true });
  const work = path.join(ROOT, '.cache', 'rendu', `${base}-${quality}-${fps}`);
  fs.mkdirSync(work, { recursive: true });

  // 1) analyse + voix
  let doc = parseScript(src);
  if (opts.part) { doc = splitDoc(doc, opts.part); }
  const bible = opts.bible || loadBible();
  const casting = buildCasting(doc, bible);
  log(`📜 « ${doc.title || base} » : ${doc.sections.length} sections, ${casting.list.length} personnages.`);
  const lines = collectLines(doc, casting);
  let speech = {}, mode = 'estimated';
  if (opts.noVoice) { for (const l of lines) speech[l.key] = estimateSpeech(l.text); }
  else ({ speech, mode } = await synthesizeAll(lines, path.join(ROOT, '.cache', 'voix'), log));
  onProgress({ type: 'stage', stage: 'voix', done: true, mode });

  // 2) timeline
  const tl = buildTimeline(doc, { speech, fps, bible, next: opts.next ?? nextEpisodeTitle(doc.episode) });  // doc déjà découpé si --partie
  // mémoire de la série : les nouveaux personnages sont enregistrés pour les prochains épisodes
  if (opts.saveBible !== false) {
    const added = registerCast(bible, tl.castEntries, doc.episode);
    saveBible(bible);
    if (added.length) log(`💾 Nouveaux personnages ajoutés à la bible de la série : ${added.join(', ')}`);
  }
  fs.writeFileSync(path.join(work, 'timeline.json'), JSON.stringify(tl));
  fs.writeFileSync(outFile.replace(/\.mp4$/, '.timeline.json'), JSON.stringify(tl));
  const from = Math.max(0, +(opts.from ?? 0)), to = Math.min(tl.meta.duration, +(opts.to ?? tl.meta.duration));
  log(`🎬 Timeline : ${tl.beats.length} plans, ${tl.meta.duration.toFixed(1)} s (${mode === 'tts' ? 'voix réelles' : 'sans voix'}).`);

  // 3) audio
  const wav = path.join(work, 'audio.wav');
  mixEpisode(tl, speech, wav);
  log('🎵 Musique, bruitages et voix mixés.');
  onProgress({ type: 'stage', stage: 'audio', done: true });

  // 4) images 3D (plusieurs onglets en parallèle, reprise possible)
  const frameDir = path.join(work, 'images');
  if (opts.clean) fs.rmSync(frameDir, { recursive: true, force: true });
  fs.mkdirSync(frameDir, { recursive: true });
  const f0 = Math.floor(from * fps), f1 = Math.ceil(to * fps);
  const total = f1 - f0;
  const todo = [];
  for (let f = f0; f < f1; f++) if (!fs.existsSync(path.join(frameDir, `f${String(f).padStart(6, '0')}.jpg`))) todo.push(f);
  if (todo.length < total) log(`↻ Reprise : ${total - todo.length} images déjà rendues.`);
  const workers = Math.max(1, Math.min(+(opts.workers || defaultWorkers()), 8));
  const srv = await startStaticServer(ROOT, 0);
  const url = `http://127.0.0.1:${srv.address().port}/app/render.html?q=${quality}`;
  const browser = await (await import('puppeteer-core')).default.launch({ executablePath: findChrome(), args: chromeArgs(), protocolTimeout: 600000 });
  const t0 = Date.now(); let done = 0;
  const queue = todo.slice();
  async function worker(w) {
    const page = await browser.newPage();
    page.on('pageerror', (e) => log(`⚠ [onglet ${w}] ${e.message}`));
    await page.goto(url);
    await page.waitForFunction('window.ready===true', { timeout: 300000 });
    await page.evaluate((json) => window.loadTimeline(JSON.parse(json)), JSON.stringify(tl));
    while (queue.length) {
      const f = queue.shift();
      const b64 = await page.evaluate((t) => window.renderFrame(t), f / fps);
      fs.writeFileSync(path.join(frameDir, `f${String(f).padStart(6, '0')}.jpg`), Buffer.from(b64, 'base64'));
      done++;
      if (done % 10 === 0 || !queue.length) {
        const el = (Date.now() - t0) / 1000, rate = done / el, eta = (todo.length - done) / rate;
        const pct = ((total - todo.length + done) / total) * 100;
        onProgress({ type: 'frames', done: total - todo.length + done, total, pct, eta });
        if (done % 60 === 0 || !queue.length) log(`🖼  ${pct.toFixed(1)} %  (${(1 / rate).toFixed(2)} s/image, reste ~${fmtTime(eta)})`);
      }
    }
    await page.close();
  }
  try { await Promise.all(Array.from({ length: workers }, (_, w) => worker(w))); }
  finally { await browser.close(); srv.close(); }

  // 5) encodage MP4 (H.264 + AAC, 1080x1920)
  log('📦 Encodage de la vidéo…');
  const list = path.join(work, 'images.txt');
  fs.writeFileSync(list, Array.from({ length: total }, (_, i) => `file 'images/f${String(f0 + i).padStart(6, '0')}.jpg'\nduration ${1 / fps}`).join('\n') + '\n');
  const args = ['-y', '-v', 'error', '-f', 'concat', '-safe', '0', '-i', list, '-ss', String(from), '-t', String(to - from), '-i', wav,
    '-vf', `scale=1080:1920:flags=lanczos,fps=${fps}`, '-c:v', 'libx264', '-preset', opts.preset || 'veryfast', '-crf', String(opts.crf || 18), '-pix_fmt', 'yuv420p',
    '-c:a', 'aac', '-b:a', '192k', '-movflags', '+faststart', '-shortest', outFile];
  await new Promise((res, rej) => { const p = spawn('ffmpeg', args, { cwd: work, stdio: ['ignore', 'inherit', 'inherit'] }); p.on('close', (c) => (c === 0 ? res() : rej(new Error('ffmpeg a échoué')))); });
  if (!opts.keepFrames && from === 0 && to >= tl.meta.duration - 0.01) fs.rmSync(frameDir, { recursive: true, force: true });
  log(`✅ Vidéo prête : ${outFile}  (${fmtTime((Date.now() - t0) / 1000)} de rendu)`);
  onProgress({ type: 'done', file: outFile, duration: to - from });
  return { file: outFile, timeline: tl, mode };
}

function defaultWorkers() { const c = os.cpus().length; return process.platform === 'linux' && process.env.VILLA_GPU !== '1' ? Math.max(1, Math.floor(c / 2)) : Math.min(4, Math.max(1, c - 1)); }
function fmtTime(s) { s = Math.max(0, Math.round(s)); const m = Math.floor(s / 60); return m ? `${m} min ${s % 60} s` : `${s} s`; }

// ------------------------------------------------------------------ ligne de commande
if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const argv = process.argv.slice(2);
  const get = (k, d) => { const i = argv.indexOf(k); return i >= 0 ? argv[i + 1] : d; };
  const has = (k) => argv.includes(k);
  const script = argv.find((a) => !a.startsWith('--') && /\.(md|txt)$/i.test(a));
  if (!script) {
    console.log('Usage : node tools/render.js scripts/episode.md [--qualite brouillon|standard|max] [--sortie fichier.mp4] [--fps 30] [--workers N] [--de S] [--a S] [--partie 1/2] [--sans-voix]');
    process.exit(1);
  }
  renderEpisode(script, {
    quality: get('--qualite', get('--quality', 'standard')), out: get('--sortie', get('--out')), fps: get('--fps'), workers: get('--workers'),
    from: get('--de'), to: get('--a'), part: get('--partie'), noVoice: has('--sans-voix'), clean: has('--propre'), keepFrames: has('--garder-images'),
  }).catch((e) => { console.error('❌', e.message); process.exit(1); });
}
