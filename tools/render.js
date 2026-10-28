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
import { coverAndQC } from './publication.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

// ------------------------------------------------------------------ étape 1 : préparer (voix, timeline, son)
export async function prepare(scriptPath, opts = {}) {
  const log = opts.log || console.log;
  const quality = opts.quality || 'standard';
  const qDefaults = { brouillon: 24, standard: 25, haute: 25, max: 30 };
  const fps = +(opts.fps || qDefaults[quality] || 30);
  const src = fs.readFileSync(scriptPath, 'utf8');
  const base = path.basename(scriptPath).replace(/\.[^.]+$/, '') + (opts.part ? `-partie${String(opts.part).replace('/', 'sur')}` : '');
  const outFile = path.resolve(opts.out || path.join(ROOT, 'sorties', `${base}.mp4`));
  fs.mkdirSync(path.dirname(outFile), { recursive: true });
  const work = path.resolve(opts.work || path.join(ROOT, '.cache', 'rendu', `${base}-${quality}-${fps}`));
  fs.mkdirSync(work, { recursive: true });

  let doc = parseScript(src);
  if (opts.part) doc = splitDoc(doc, opts.part);
  const bible = opts.bible || loadBible();
  const casting = buildCasting(doc, bible);
  log(`📜 « ${doc.title || base} » : ${doc.sections.length} sections, ${casting.list.length} personnages.`);
  const lines = collectLines(doc, casting);
  let speech = {}, mode = 'estimated';
  if (opts.noVoice) { for (const l of lines) speech[l.key] = estimateSpeech(l.text); }
  else ({ speech, mode } = await synthesizeAll(lines, path.join(ROOT, '.cache', 'voix'), log));

  const tl = buildTimeline(doc, { speech, fps, bible, next: opts.next ?? nextEpisodeTitle(doc.episode) });
  if (opts.saveBible !== false) {
    const added = registerCast(bible, tl.castEntries, doc.episode);
    saveBible(bible);
    if (added.length) log(`💾 Nouveaux personnages ajoutés à la bible de la série : ${added.join(', ')}`);
  }
  fs.writeFileSync(path.join(work, 'timeline.json'), JSON.stringify(tl));
  fs.writeFileSync(outFile.replace(/\.mp4$/, '.timeline.json'), JSON.stringify(tl));
  log(`🎬 Timeline : ${tl.beats.length} plans, ${tl.meta.duration.toFixed(1)} s (${mode === 'tts' ? 'voix réelles' : mode === 'partial' ? 'voix réelles, quelques répliques sans voix' : 'sans voix'}).`);
  mixEpisode(tl, speech, path.join(work, 'audio.wav'));
  log('🎵 Musique, bruitages et voix mixés.');
  const meta = { quality, fps, outName: path.basename(outFile), duration: tl.meta.duration, frames: Math.ceil(tl.meta.duration * fps), mode };
  fs.writeFileSync(path.join(work, 'meta.json'), JSON.stringify(meta));
  return { work, tl, meta, outFile, mode };
}

// ------------------------------------------------------------------ étape 2 : images 3D d'une plage [f0, f1)
export async function renderFrames(work, { f0, f1, workers, log = console.log, onProgress = () => {}, clean = false } = {}) {
  const tl = JSON.parse(fs.readFileSync(path.join(work, 'timeline.json'), 'utf8'));
  const meta = JSON.parse(fs.readFileSync(path.join(work, 'meta.json'), 'utf8'));
  const { fps, quality } = meta;
  f0 = Math.max(0, f0 ?? 0); f1 = Math.min(meta.frames, f1 ?? meta.frames);
  const frameDir = path.join(work, 'images');
  if (clean) fs.rmSync(frameDir, { recursive: true, force: true });
  fs.mkdirSync(frameDir, { recursive: true });
  const total = f1 - f0, todo = [];
  for (let f = f0; f < f1; f++) if (!fs.existsSync(path.join(frameDir, `f${String(f).padStart(6, '0')}.jpg`))) todo.push(f);
  if (todo.length < total) log(`↻ Reprise : ${total - todo.length} images déjà rendues.`);
  if (!todo.length) return;
  workers = Math.max(1, Math.min(+(workers || defaultWorkers()), 8));
  const srv = await startStaticServer(ROOT, 0);
  const url = `http://127.0.0.1:${srv.address().port}/app/render.html?q=${quality}`;
  const browser = await (await import('puppeteer-core')).default.launch({ executablePath: findChrome(), args: chromeArgs(), protocolTimeout: 600000 });
  const t0 = Date.now(); let done = 0;
  const queue = todo.slice();
  // les onglets démarrent l'un après l'autre (la compilation des shaders est lourde sans carte graphique)
  let starting = Promise.resolve();
  async function worker(w) {
    const page = await browser.newPage();
    page.on('pageerror', (e) => log(`⚠ [onglet ${w}] ${e.message}`));
    const prev = starting; let release; starting = new Promise((r) => (release = r));
    try {
      await prev;
      await page.goto(url, { timeout: 0 });
      await page.waitForFunction('window.ready===true', { timeout: 0 });
      await page.evaluate((json) => window.loadTimeline(JSON.parse(json)), JSON.stringify(tl));
      await page.evaluate((t) => window.renderFrame(t), (queue[0] ?? 0) / fps); // préchauffage
    } finally { release(); }
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
  try {
    const res = await Promise.allSettled(Array.from({ length: workers }, (_, w) => worker(w)));
    const failed = res.filter((r) => r.status === 'rejected');
    failed.forEach((r) => log(`⚠ un onglet de rendu s'est arrêté : ${r.reason?.message}`));
    if (failed.length === res.length) throw failed[0].reason;
    if (queue.length) await worker(99);
  } finally { await browser.close(); srv.close(); }
}

// ------------------------------------------------------------------ étape 3 : encoder un morceau (vidéo seule)
export function encodeSegment(work, f0, f1, out) {
  const meta = JSON.parse(fs.readFileSync(path.join(work, 'meta.json'), 'utf8'));
  const args = ['-y', '-v', 'error', '-framerate', String(meta.fps), '-start_number', String(f0), '-i', path.join(work, 'images', 'f%06d.jpg'),
    '-frames:v', String(f1 - f0), '-vf', 'scale=1080:1920:flags=lanczos', '-c:v', 'libx264', '-preset', 'veryfast', '-crf', '18', '-pix_fmt', 'yuv420p', '-r', String(meta.fps), '-an', out];
  return run('ffmpeg', args);
}

// ------------------------------------------------------------------ étape 4 : assembler morceaux + son
export async function assemble(work, segments, outFile) {
  const list = path.join(work, 'morceaux.txt');
  fs.writeFileSync(list, segments.map((s) => `file '${path.resolve(s).replace(/'/g, "'\\''")}'`).join('\n') + '\n');
  await run('ffmpeg', ['-y', '-v', 'error', '-f', 'concat', '-safe', '0', '-i', list, '-i', path.join(work, 'audio.wav'),
    '-map', '0:v', '-map', '1:a', '-c:v', 'libx264', '-preset', 'medium', '-crf', '20', '-maxrate', '6M', '-bufsize', '12M', '-pix_fmt', 'yuv420p', '-af', 'loudnorm=I=-14:TP=-1.5:LRA=11', '-ar', '48000', '-c:a', 'aac', '-b:a', '192k', '-movflags', '+faststart', '-shortest', outFile]);
  return outFile;
}

function run(cmd, args) {
  return new Promise((res, rej) => { const p = spawn(cmd, args, { stdio: ['ignore', 'inherit', 'inherit'] }); p.on('close', (c) => (c === 0 ? res() : rej(new Error(`${cmd} a échoué`)))); });
}
export function segmentRange(frames, k, n) { return [Math.floor((k * frames) / n), Math.floor(((k + 1) * frames) / n)]; }

// ------------------------------------------------------------------ tout-en-un (PC, interface)
export async function renderEpisode(scriptPath, opts = {}, onProgress = () => {}) {
  const log = opts.log || ((m) => { console.log(m); onProgress({ type: 'log', message: m }); });
  const t0 = Date.now();
  const { work, tl, meta, outFile, mode } = await prepare(scriptPath, { ...opts, log });
  onProgress({ type: 'stage', stage: 'audio', done: true, mode });
  if (opts.cover !== false && !opts.from && !opts.to) { try { await coverAndQC(work, scriptPath, outFile, log); } catch (e) { log(`⚠ miniature / contrôle : ${e.message}`); } }
  const from = Math.max(0, +(opts.from ?? 0)), to = Math.min(meta.duration, +(opts.to ?? meta.duration));
  const f0 = Math.floor(from * meta.fps), f1 = Math.min(meta.frames, Math.ceil(to * meta.fps));
  await renderFrames(work, { f0, f1, workers: opts.workers, log, onProgress, clean: opts.clean });
  log('📦 Encodage de la vidéo…');
  const seg = path.join(work, 'video-seule.mp4');
  await encodeSegment(work, f0, f1, seg);
  if (from > 0 || to < meta.duration - 0.01) {
    // extrait : on découpe le son à la même plage
    await run('ffmpeg', ['-y', '-v', 'error', '-i', seg, '-ss', String(f0 / meta.fps), '-t', String((f1 - f0) / meta.fps), '-i', path.join(work, 'audio.wav'), '-map', '0:v', '-map', '1:a', '-c:v', 'copy', '-c:a', 'aac', '-b:a', '192k', '-movflags', '+faststart', '-shortest', outFile]);
  } else await assemble(work, [seg], outFile);
  if (!opts.keepFrames && from === 0 && to >= meta.duration - 0.01) fs.rmSync(path.join(work, 'images'), { recursive: true, force: true });
  log(`✅ Vidéo prête : ${outFile}  (${fmtTime((Date.now() - t0) / 1000)} au total)`);
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
  const stage = get('--etape');
  const work = get('--travail');
  const common = { quality: get('--qualite', get('--quality', 'standard')), out: get('--sortie', get('--out')), fps: get('--fps'), workers: get('--workers'),
    from: get('--de'), to: get('--a'), part: get('--partie'), noVoice: has('--sans-voix'), clean: has('--propre'), keepFrames: has('--garder-images'), work };
  const fail = (e) => { console.error('❌', e.message); process.exit(1); };
  if (!stage) renderEpisode(script, common).catch(fail);
  else if (stage === 'preparer') prepare(script, common).then((r) => console.log(`Préparé : ${r.meta.frames} images à ${r.meta.fps} i/s -> ${r.work}`)).catch(fail);
  else if (stage === 'couverture') {
    (async () => { const meta = JSON.parse(fs.readFileSync(path.join(work, 'meta.json'), 'utf8')); const out = path.resolve(common.out || path.join(ROOT, 'sorties', meta.outName)); fs.mkdirSync(path.dirname(out), { recursive: true }); await coverAndQC(work, script, out); })().catch(fail);
  }
  else if (stage === 'images') {
    // --morceau k/N : rend la k-ième part des images et encode le morceau vidéo correspondant
    (async () => {
      const meta = JSON.parse(fs.readFileSync(path.join(work, 'meta.json'), 'utf8'));
      const [k, n] = (get('--morceau', '0/1')).split('/').map(Number);
      const [f0, f1] = segmentRange(meta.frames, k, n);
      console.log(`Morceau ${k + 1}/${n} : images ${f0} à ${f1 - 1}`);
      await renderFrames(work, { f0, f1, workers: common.workers });
      const out = path.join(work, `morceau-${String(k).padStart(3, '0')}.mp4`);
      await encodeSegment(work, f0, f1, out);
      console.log(`✅ ${out}`);
    })().catch(fail);
  } else if (stage === 'assembler') {
    (async () => {
      const meta = JSON.parse(fs.readFileSync(path.join(work, 'meta.json'), 'utf8'));
      const segs = fs.readdirSync(work).filter((f) => /^morceau-\d+\.mp4$/.test(f)).sort().map((f) => path.join(work, f));
      const out = path.resolve(common.out || path.join(ROOT, 'sorties', meta.outName));
      fs.mkdirSync(path.dirname(out), { recursive: true });
      await assemble(work, segs, out);
      console.log(`✅ Vidéo prête : ${out} (${segs.length} morceaux)`);
    })().catch(fail);
  }
}
