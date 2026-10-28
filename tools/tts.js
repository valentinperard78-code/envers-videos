// Voix : synthèse edge-tts (gratuite) avec cache ; repli « timings estimés » si indisponible.
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { spawnSync, spawn } from 'node:child_process';
import { estimateSpeech } from '../engine/script/director.js';

const PY = process.env.PYTHON || (process.platform === 'win32' ? 'python' : 'python3');

export function ttsAvailable() {
  const r = spawnSync(PY, ['-c', 'import edge_tts; print(edge_tts.__version__ if hasattr(edge_tts, "__version__") else "ok")'], { encoding: 'utf8' });
  return r.status === 0;
}

/** Décode un fichier audio en PCM mono float (16 kHz) via ffmpeg. */
export function decodePCM(file, rate = 16000) {
  const r = spawnSync('ffmpeg', ['-v', 'error', '-i', file, '-f', 'f32le', '-ac', '1', '-ar', String(rate), 'pipe:1'], { maxBuffer: 1 << 30 });
  if (r.status !== 0) throw new Error('ffmpeg: ' + r.stderr?.toString());
  const b = r.stdout; return new Float32Array(b.buffer, b.byteOffset, b.length / 4);
}

/** Enveloppe d'amplitude (50 valeurs/s) normalisée, pour la synchro labiale. */
export function envelope(pcm, rate = 16000, fps = 50) {
  const hop = Math.floor(rate / fps), out = [];
  for (let i = 0; i < pcm.length; i += hop) { let s = 0; for (let k = i; k < Math.min(pcm.length, i + hop); k++) s += pcm[k] * pcm[k]; out.push(Math.sqrt(s / hop)); }
  const sorted = [...out].sort((a, b) => a - b); const ref = sorted[Math.floor(sorted.length * 0.95)] || 1;
  return out.map((v) => Math.round(Math.min(1, v / ref) * 1000) / 1000);
}

/**
 * Synthétise toutes les répliques. Renvoie { speech: {key: {dur, words, env, file}}, mode }.
 */
export async function synthesizeAll(lines, cacheDir, log = console.log) {
  fs.mkdirSync(cacheDir, { recursive: true });
  const speech = {};
  const ok = ttsAvailable();
  if (!ok) {
    log('⚠ edge-tts introuvable : vidéo SANS voix (timings estimés). Installe-le avec : pip install edge-tts');
    for (const l of lines) speech[l.key] = estimateSpeech(l.text);
    return { speech, mode: 'estimated' };
  }
  const jobs = [];
  for (const l of lines) {
    const h = crypto.createHash('sha1').update([l.text, l.voice, l.rate, l.pitch].join('|')).digest('hex').slice(0, 16);
    const out = path.join(cacheDir, `${h}.mp3`);
    l.file = out;
    if (!fs.existsSync(out) || !fs.existsSync(out + '.json')) jobs.push({ key: l.key, text: l.text, voice: l.voice, rate: l.rate, pitch: l.pitch, out });
  }
  if (jobs.length) {
    log(`🎙 Synthèse de ${jobs.length} réplique(s)…`);
    await new Promise((res, rej) => {
      const p = spawn(PY, [path.join(path.dirname(new URL(import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1')), 'tts_edge.py')], { stdio: ['pipe', 'pipe', 'inherit'] });
      p.stdout.on('data', (d) => String(d).split('\n').filter(Boolean).forEach((s) => log('   ' + s)));
      p.on('close', (c) => (c === 0 ? res() : rej(new Error('tts_edge.py a échoué'))));
      p.stdin.end(JSON.stringify(jobs));
    });
  }
  let missing = 0;
  for (const l of lines) {
    if (!fs.existsSync(l.file)) { missing++; speech[l.key] = estimateSpeech(l.text); continue; }
    const meta = JSON.parse(fs.readFileSync(l.file + '.json', 'utf8'));
    const pcm = decodePCM(l.file);
    const dur = pcm.length / 16000;
    let words = meta.words || [];
    if (!words.length) words = estimateSpeech(l.text).words.map((w) => ({ ...w, t: (w.t / estimateSpeech(l.text).dur) * dur, d: (w.d / estimateSpeech(l.text).dur) * dur }));
    // on ré-aligne les mots sur le texte affiché (ponctuation comprise) pour les sous-titres
    words = alignWords(l.text, words);
    speech[l.key] = { dur, words, env: envelope(pcm), rate: 50, file: l.file };
  }
  if (missing) log(`⚠ ${missing} réplique(s) sans voix (échec réseau) : timings estimés.`);
  return { speech, mode: missing ? 'partial' : 'tts' };
}

function alignWords(text, words) {
  const disp = String(text).split(/\s+/).filter(Boolean);
  const out = []; let j = 0;
  const clean = (s) => s.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9]/g, '');
  for (const w of words) {
    const c = clean(w.w);
    let k = j; while (k < disp.length && clean(disp[k]) !== c && !clean(disp[k]).startsWith(c) && !c.startsWith(clean(disp[k]))) k++;
    if (k < disp.length) {
      // mots affichés sautés (ex. « … ») : rattachés au précédent
      for (let s = j; s < k; s++) if (out.length) out[out.length - 1].w += ' ' + disp[s];
      out.push({ t: w.t, d: w.d, w: disp[k] }); j = k + 1;
    }
  }
  for (let s = j; s < disp.length; s++) if (out.length) out[out.length - 1].w += ' ' + disp[s];
  return out.length ? out : words;
}
