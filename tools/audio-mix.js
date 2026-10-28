// Mixage : voix + musique (avec « ducking » sous les voix) + bruitages -> WAV final.
import fs from 'node:fs';
import { renderMusic, renderSfx, wavBuffer, SR } from './audio-synth.js';
import { spawnSync } from 'node:child_process';

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
