// Mixage : voix + musique (avec « ducking » sous les voix) + bruitages -> WAV final.
import fs from 'node:fs';
import { renderMusic, renderSfx, wavBuffer, SR } from './audio-synth.js';
import { spawnSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
// dossiers de musique (morceaux libres de droits déposés par l'utilisateur), par ambiance
const MOOD_DIRS = { chill: ['detente', 'chill'], tense: ['tension', 'tense'], drama: ['drame', 'drama'], happy: ['joie', 'happy'], theme: ['generique', 'theme'], outro: ['fin', 'outro'] };
function musicFile(mood, seed) {
  for (const d of MOOD_DIRS[mood] || []) {
    const dir = path.join(ROOT, 'musique', d);
    if (!fs.existsSync(dir)) continue;
    const files = fs.readdirSync(dir).filter((f) => /\.(mp3|wav|ogg|m4a|flac)$/i.test(f)).sort();
    if (files.length) return path.join(dir, files[seed % files.length]);
  }
  return null;
}
function decodeStereo44(file) {
  const r = spawnSync('ffmpeg', ['-v', 'error', '-i', file, '-f', 'f32le', '-ac', '2', '-ar', String(SR), 'pipe:1'], { maxBuffer: 1 << 31 });
  if (r.status !== 0) return null;
  const b = r.stdout; const f = new Float32Array(b.buffer, b.byteOffset, b.length / 4);
  const L = new Float32Array(f.length / 2), R = new Float32Array(f.length / 2);
  for (let i = 0; i < L.length; i++) { L[i] = f[i * 2]; R[i] = f[i * 2 + 1]; }
  return { L, R };
}
/** Remplace la musique synthétisée par les morceaux du dossier musique/ quand il y en a. */
function overlayUserMusic(music, segments, duration, seed) {
  const segs = segments.slice().sort((a, c) => a.t0 - c.t0); let used = 0;
  for (let s = 0; s < segs.length; s++) {
    const f = musicFile(segs[s].mood, seed + s); if (!f) continue;
    const trk = decodeStereo44(f); if (!trk || !trk.L.length) continue;
    const i0 = Math.floor(segs[s].t0 * SR), i1 = Math.min(music.L.length, Math.floor((s + 1 < segs.length ? segs[s + 1].t0 : duration + 1.5) * SR));
    const fade = Math.floor(0.5 * SR);
    // niveau du morceau ramené vers celui de la musique synthétisée
    let pk = 0; for (let i = 0; i < Math.min(trk.L.length, SR * 30); i++) pk = Math.max(pk, Math.abs(trk.L[i]));
    const g = pk > 0 ? 0.6 / pk : 1;
    for (let i = i0; i < i1; i++) {
      const k = (i - i0) % trk.L.length;
      const a = Math.min(1, (i - i0) / fade, (i1 - i) / fade);
      music.L[i] = music.L[i] * (1 - a) + trk.L[k] * g * a; music.R[i] = music.R[i] * (1 - a) + trk.R[k] * g * a;
    }
    used++;
  }
  return used;
}

function decodeStereo(file) {
  const r = spawnSync('ffmpeg', ['-v', 'error', '-i', file, '-f', 'f32le', '-ac', '1', '-ar', String(SR), 'pipe:1'], { maxBuffer: 1 << 30 });
  if (r.status !== 0) return null;
  const b = r.stdout; return new Float32Array(b.buffer, b.byteOffset, b.length / 4);
}

export function mixEpisode(tl, speech, outWav, { musicGain = 0.32, sfxGain = 0.75, voiceGain = 1.0 } = {}) {
  const dur = tl.meta.duration + 0.5;
  const n = Math.ceil(dur * SR);
  const VL = new Float32Array(n);
  for (const v of tl.audio.voices) {
    const s = speech[v.key]; if (!s?.file) continue;
    const pcm = decodeStereo(s.file); if (!pcm) continue;
    const i0 = Math.floor(v.t * SR);
    for (let i = 0; i < pcm.length && i0 + i < n; i++) VL[i0 + i] += pcm[i] * voiceGain;
  }
  // enveloppe de voix lissée -> atténuation de la musique
  const duck = new Float32Array(n); let e = 0;
  for (let i = 0; i < n; i++) { const a = Math.abs(VL[i]); e = a > e ? e + (a - e) * 0.01 : e * 0.99993; duck[i] = 1 - Math.min(0.62, e * 3.2); }
  const music = renderMusic(tl.audio.music, dur);
  const seed = Array.from(tl.meta.title || '').reduce((a, c) => a + c.charCodeAt(0), 0);
  const userTracks = overlayUserMusic(music, tl.audio.music, dur, seed);
  if (userTracks) console.log(`🎵 ${userTracks} passage(s) avec tes morceaux du dossier musique/.`);
  const fx = renderSfx(tl.audio.sfx, dur);
  const L = new Float32Array(n), R = new Float32Array(n);
  let peak = 0;
  for (let i = 0; i < n; i++) {
    const fade = Math.min(1, i / (SR * 0.3)) * Math.min(1, (n - i) / (SR * 1.2));
    L[i] = (VL[i] + music.L[i] * musicGain * duck[i] + fx.L[i] * sfxGain) * fade;
    R[i] = (VL[i] + music.R[i] * musicGain * duck[i] + fx.R[i] * sfxGain) * fade;
    peak = Math.max(peak, Math.abs(L[i]), Math.abs(R[i]));
  }
  // limiteur doux
  const g = peak > 0.95 ? 0.95 / peak : 1;
  for (let i = 0; i < n; i++) { L[i] = Math.tanh(L[i] * g * 1.1) / Math.tanh(1.1); R[i] = Math.tanh(R[i] * g * 1.1) / Math.tanh(1.1); }
  fs.writeFileSync(outWav, wavBuffer(L, R));
  return outWav;
}
