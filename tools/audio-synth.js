// Synthèse audio maison (aucun fichier externe, libre de droits) : musique par humeur + bruitages télé-réalité.
export const SR = 44100;

// ------------------------------------------------------------------ outils DSP
function rng(seed = 1) { let s = seed >>> 0 || 1; return () => { s ^= s << 13; s ^= s >>> 17; s ^= s << 5; return ((s >>> 0) / 4294967296) * 2 - 1; }; }
const mtof = (m) => 440 * Math.pow(2, (m - 69) / 12);
class Buf {
  constructor(sec) { this.n = Math.ceil(sec * SR); this.L = new Float32Array(this.n); this.R = new Float32Array(this.n); }
  add(i, l, r = l) { if (i >= 0 && i < this.n) { this.L[i] += l; this.R[i] += r; } }
}
function env(t, a, d, s, r, len) {
  if (t < 0) return 0;
  if (t < a) return t / a;
  if (t < a + d) return 1 - (1 - s) * ((t - a) / d);
  if (t < len) return s;
  if (t < len + r) return s * (1 - (t - len) / r);
  return 0;
}
function lowpass(arr, cutoff) { const a = 1 - Math.exp(-2 * Math.PI * cutoff / SR); let y = 0; for (let i = 0; i < arr.length; i++) { y += a * (arr[i] - y); arr[i] = y; } return arr; }
function highpass(arr, cutoff) { const a = 1 - Math.exp(-2 * Math.PI * cutoff / SR); let y = 0; for (let i = 0; i < arr.length; i++) { y += a * (arr[i] - y); arr[i] = arr[i] - y; } return arr; }

// ------------------------------------------------------------------ instruments
function kick(b, t0, gain = 1) {
  const n = Math.floor(0.45 * SR), i0 = Math.floor(t0 * SR); let ph = 0;
  for (let i = 0; i < n; i++) { const t = i / SR; const f = 45 + 110 * Math.exp(-t * 28); ph += 2 * Math.PI * f / SR; const v = Math.sin(ph) * Math.exp(-t * 7) * gain * 0.9; b.add(i0 + i, v); }
}
function snare(b, t0, gain = 1, seed = 3) {
  const n = Math.floor(0.25 * SR), i0 = Math.floor(t0 * SR), r = rng(seed); const tmp = new Float32Array(n);
  for (let i = 0; i < n; i++) { const t = i / SR; tmp[i] = r() * Math.exp(-t * 18) * 0.6 + Math.sin(2 * Math.PI * 190 * t) * Math.exp(-t * 30) * 0.4; }
  highpass(tmp, 900); for (let i = 0; i < n; i++) b.add(i0 + i, tmp[i] * gain * 0.8, tmp[i] * gain * 0.75);
}
function clap(b, t0, gain = 1, seed = 5) {
  const n = Math.floor(0.3 * SR), i0 = Math.floor(t0 * SR), r = rng(seed); const tmp = new Float32Array(n);
  for (let i = 0; i < n; i++) { const t = i / SR; const burst = [0, 0.011, 0.022].reduce((a, o) => a + (t >= o ? Math.exp(-(t - o) * 90) : 0), 0) + Math.exp(-t * 14) * 0.4; tmp[i] = r() * burst; }
  highpass(tmp, 1200); lowpass(tmp, 7000); for (let i = 0; i < n; i++) b.add(i0 + i, tmp[i] * gain * 0.55, tmp[i] * gain * 0.6);
}
function hat(b, t0, gain = 1, open = false, seed = 7) {
  const n = Math.floor((open ? 0.25 : 0.06) * SR), i0 = Math.floor(t0 * SR), r = rng(seed + Math.floor(t0 * 100)); const tmp = new Float32Array(n);
  for (let i = 0; i < n; i++) tmp[i] = r() * Math.exp(-(i / SR) * (open ? 12 : 60));
  highpass(tmp, 7000); const pan = 0.2;
  for (let i = 0; i < n; i++) b.add(i0 + i, tmp[i] * gain * 0.35 * (1 - pan), tmp[i] * gain * 0.35 * (1 + pan));
}
function bass(b, t0, dur, midi, gain = 1) {
  const n = Math.floor((dur + 0.05) * SR), i0 = Math.floor(t0 * SR), f = mtof(midi); const tmp = new Float32Array(n);
  let ph = 0;
  for (let i = 0; i < n; i++) { const t = i / SR; ph += f / SR; const saw = 2 * (ph % 1) - 1; tmp[i] = (Math.sin(2 * Math.PI * ph) * 0.7 + saw * 0.3) * env(t, 0.005, 0.1, 0.7, 0.05, dur); }
  lowpass(tmp, 420); for (let i = 0; i < n; i++) b.add(i0 + i, tmp[i] * gain * 0.55);
}
function pad(b, t0, dur, notes, gain = 1, bright = 1200) {
  const n = Math.floor((dur + 0.6) * SR), i0 = Math.floor(t0 * SR); const L = new Float32Array(n), R = new Float32Array(n);
  notes.forEach((m, k) => {
    for (const [det, side] of [[-0.09, 0], [0.09, 1]]) {
      const f = mtof(m + det); let ph = Math.random();
      for (let i = 0; i < n; i++) { const t = i / SR; ph += f / SR; const v = (2 * (ph % 1) - 1) * env(t, 0.35, 0.3, 0.8, 0.6, dur) / notes.length; (side ? R : L)[i] += v; }
    }
  });
  lowpass(L, bright); lowpass(R, bright);
  for (let i = 0; i < n; i++) b.add(i0 + i, L[i] * gain * 0.3, R[i] * gain * 0.3);
}
function pluck(b, t0, midi, gain = 1, dur = 0.5, pan = 0) {
  const f = mtof(midi), p = Math.max(2, Math.round(SR / f)), n = Math.floor(dur * SR * 2), i0 = Math.floor(t0 * SR), r = rng(midi * 13 + Math.floor(t0 * 7));
  const ring = new Float32Array(p).map(() => r());
  let idx = 0;
  for (let i = 0; i < n; i++) { const a = ring[idx], c = ring[(idx + 1) % p]; ring[idx] = (a + c) * 0.5 * 0.996; idx = (idx + 1) % p; const v = a * gain * 0.35 * Math.exp(-(i / SR) * 2.2); b.add(i0 + i, v * (1 - pan), v * (1 + pan)); }
}
function bell(b, t0, midi, gain = 1, dur = 1.2, pan = 0) {
  const f = mtof(midi), n = Math.floor(dur * SR), i0 = Math.floor(t0 * SR);
  for (let i = 0; i < n; i++) { const t = i / SR; const mod = Math.sin(2 * Math.PI * f * 3.5 * t) * 2.2 * Math.exp(-t * 4); const v = Math.sin(2 * Math.PI * f * t + mod) * Math.exp(-t * 3.2) * gain * 0.3; b.add(i0 + i, v * (1 - pan), v * (1 + pan)); }
}
function noiseSweep(b, t0, dur, f0, f1, gain = 1, seed = 11) {
  const n = Math.floor(dur * SR), i0 = Math.floor(t0 * SR), r = rng(seed); let y = 0, y2 = 0;
  for (let i = 0; i < n; i++) {
    const t = i / n; const f = f0 * Math.pow(f1 / f0, t); const a = 1 - Math.exp(-2 * Math.PI * f / SR);
    y += a * (r() - y); y2 += a * (y - y2);
    const e = Math.sin(Math.PI * t) ** 1.5; const v = (y - y2) * 3 * e * gain; b.add(i0 + i, v * (1 - t * 0.6), v * (0.4 + t * 0.6));
  }
}
function brassStab(b, t0, notes, dur = 0.5, gain = 1) {
  const n = Math.floor((dur + 0.3) * SR), i0 = Math.floor(t0 * SR); const tmp = new Float32Array(n);
  for (const m of notes) for (const det of [-0.12, 0, 0.12]) { const f = mtof(m + det); let ph = Math.random(); for (let i = 0; i < n; i++) { const t = i / SR; ph += f / SR; tmp[i] += (2 * (ph % 1) - 1) * env(t, 0.02, 0.15, 0.6, 0.25, dur) / (notes.length * 3); } }
  lowpass(tmp, 1800); for (let i = 0; i < n; i++) b.add(i0 + i, tmp[i] * gain * 0.9);
}
function boom(b, t0, gain = 1) {
  const n = Math.floor(1.6 * SR), i0 = Math.floor(t0 * SR), r = rng(19); let ph = 0; const tmp = new Float32Array(n);
  for (let i = 0; i < n; i++) { const t = i / SR; const f = 32 + 70 * Math.exp(-t * 6); ph += 2 * Math.PI * f / SR; tmp[i] = Math.sin(ph) * Math.exp(-t * 2.2) + r() * Math.exp(-t * 9) * 0.3; }
  lowpass(tmp, 900); for (let i = 0; i < n; i++) b.add(i0 + i, tmp[i] * gain);
}

// ------------------------------------------------------------------ bruitages
export function renderSfx(list, duration) {
  const b = new Buf(duration + 3);
  for (const s of list) {
    const t = s.t;
    switch (s.type) {
      case 'whoosh': noiseSweep(b, t, 0.42, 400, 6000, 0.55, 13); break;
      case 'zoom': noiseSweep(b, t - 0.05, 0.3, 1500, 9000, 0.35, 17); kick(b, t + 0.12, 0.5); break;
      case 'boom': boom(b, t, 0.9); break;
      case 'riser': noiseSweep(b, t, 0.65, 300, 12000, 0.4, 21); break;
      case 'sting': brassStab(b, t, [45, 52, 57], 0.18, 0.7); brassStab(b, t + 0.24, [44, 51, 56], 0.18, 0.7); brassStab(b, t + 0.5, [43, 50, 55, 58], 0.9, 0.8); break;
      case 'ding': bell(b, t, 88, 0.9); bell(b, t + 0.09, 95, 0.6); break;
      case 'pop': { const n = Math.floor(0.09 * SR), i0 = Math.floor(t * SR); for (let i = 0; i < n; i++) { const tt = i / SR; b.add(i0 + i, Math.sin(2 * Math.PI * (600 + 1800 * tt / 0.09) * tt) * Math.exp(-tt * 40) * 0.5); } break; }
      case 'knock': for (const o of [0, 0.22, 0.42]) { const n = Math.floor(0.12 * SR), i0 = Math.floor((t + o) * SR), r = rng(31 + o * 100); const tmp = new Float32Array(n); for (let i = 0; i < n; i++) { const tt = i / SR; tmp[i] = (Math.sin(2 * Math.PI * 170 * tt) * 0.8 + r() * 0.5) * Math.exp(-tt * 45); } lowpass(tmp, 1400); for (let i = 0; i < n; i++) b.add(i0 + i, tmp[i] * 0.9); } break;
      case 'door': { const n = Math.floor(0.9 * SR), i0 = Math.floor(t * SR); for (let i = 0; i < n; i++) { const tt = i / SR; const f = 300 + 180 * Math.sin(tt * 7) + tt * 200; const v = Math.sin(2 * Math.PI * f * tt + Math.sin(2 * Math.PI * 23 * tt) * 3) * 0.18 * Math.sin(Math.PI * tt / 0.9); b.add(i0 + i, v); } bell(b, t + 0.5, 84, 0.4, 0.8); break; }
      case 'rattle': for (let k = 0; k < 8; k++) { const n = Math.floor(0.05 * SR), i0 = Math.floor((t + k * 0.09 + (k % 2) * 0.02) * SR), r = rng(41 + k); for (let i = 0; i < n; i++) { const tt = i / SR; const v = (r() * 0.5 + Math.sin(2 * Math.PI * 2400 * tt) * 0.5) * Math.exp(-tt * 70) * 0.5; b.add(i0 + i, v); } } break;
      case 'record': { const n = Math.floor(0.55 * SR), i0 = Math.floor(t * SR), r = rng(51); const tmp = new Float32Array(n); for (let i = 0; i < n; i++) { const tt = i / SR; const f = 900 * Math.exp(-tt * 5); tmp[i] = (r() * 0.5 + Math.sin(2 * Math.PI * f * tt * (1 + Math.sin(tt * 60) * 0.2)) * 0.6) * Math.exp(-tt * 3); } lowpass(tmp, 3000); for (let i = 0; i < n; i++) b.add(i0 + i, tmp[i] * 0.55); break; }
      case 'heartbeat': for (let k = 0; k < 3; k++) { kick(b, t + k * 0.9, 0.7); kick(b, t + k * 0.9 + 0.22, 0.5); } break;
      case 'sparkle': [84, 88, 91, 96, 100].forEach((m, k) => bell(b, t + k * 0.06, m, 0.35, 0.7, (k % 2 ? 0.4 : -0.4))); break;
      case 'alarm': for (let k = 0; k < 3; k++) for (const [f, o] of [[880, 0], [660, 0.16]]) { const n = Math.floor(0.15 * SR), i0 = Math.floor((t + k * 0.36 + o) * SR); for (let i = 0; i < n; i++) b.add(i0 + i, Math.sign(Math.sin(2 * Math.PI * f * i / SR)) * 0.08); } break;
      case 'bell': bell(b, t, 86, 0.7, 1.4, -0.2); bell(b, t + 0.15, 91, 0.6, 1.4, 0.2); break;
      case 'title': noiseSweep(b, t - 0.5, 0.6, 300, 12000, 0.4, 61); brassStab(b, t, [57, 64, 69, 73], 1.2, 0.8); boom(b, t, 0.6); [81, 85, 88, 93].forEach((m, k) => bell(b, t + 0.3 + k * 0.08, m, 0.3, 1)); break;
      default: break;
    }
  }
  return b;
}

// ------------------------------------------------------------------ musique
const PROG = {
  chill: { bpm: 96, chords: [[57, 60, 64, 67], [53, 57, 60, 64], [48, 52, 55, 59], [55, 59, 62, 65]], bass: [45, 41, 36, 43], drums: 'lofi', lead: true, bright: 1500 },
  happy: { bpm: 108, chords: [[48, 52, 55, 60], [55, 59, 62, 67], [57, 60, 64, 69], [53, 57, 60, 65]], bass: [36, 43, 45, 41], drums: 'pop', lead: true, bright: 2600 },
  tense: { bpm: 104, chords: [[57, 60, 64], [57, 60, 64], [53, 57, 60], [52, 56, 59]], bass: [45, 45, 41, 40], drums: 'tense', lead: false, bright: 900 },
  drama: { bpm: 80, chords: [[45, 52, 57, 60], [44, 51, 56, 60], [41, 48, 53, 57], [40, 47, 52, 56]], bass: [33, 32, 29, 28], drums: 'drama', lead: false, bright: 800 },
  theme: { bpm: 120, chords: [[57, 61, 64, 69], [54, 57, 61, 66], [50, 54, 57, 62], [52, 56, 59, 64]], bass: [45, 42, 38, 40], drums: 'four', lead: true, bright: 3200 },
  outro: { bpm: 104, chords: [[48, 52, 55, 60], [57, 60, 64, 69], [53, 57, 60, 65], [55, 59, 62, 67]], bass: [36, 45, 41, 43], drums: 'pop', lead: true, bright: 2200 },
};

export function renderMusic(segments, duration) {
  const b = new Buf(duration + 3);
  const segs = segments.slice().sort((a, c) => a.t0 - c.t0);
  for (let s = 0; s < segs.length; s++) {
    const seg = segs[s]; const t1 = s + 1 < segs.length ? segs[s + 1].t0 : duration + 1.5;
    if (t1 - seg.t0 < 0.3) continue;
    const P = PROG[seg.mood] || PROG.chill;
    const beat = 60 / P.bpm, bar = beat * 4;
    let barIdx = 0;
    for (let t = seg.t0; t < t1; t += bar, barIdx++) {
      const ci = barIdx % 4, ch = P.chords[ci];
      const fadeIn = Math.min(1, (t - seg.t0) / 1 + 0.4), fadeOut = Math.min(1, (t1 - t) / bar);
      const g = Math.max(0.2, Math.min(fadeIn, fadeOut));
      pad(b, t, Math.min(bar, t1 - t), ch, 0.9 * g, P.bright);
      for (let k = 0; k < 4; k++) {
        const bt = t + k * beat; if (bt >= t1) break;
        // basse
        if (P.drums === 'tense') { bass(b, bt, beat * 0.45, P.bass[ci], g); bass(b, bt + beat / 2, beat * 0.45, P.bass[ci], g * 0.8); }
        else if (P.drums === 'drama') { if (k === 0) bass(b, bt, bar * 0.95, P.bass[ci], g * 1.1); }
        else bass(b, bt, beat * 0.8, P.bass[ci] + (k === 3 ? 7 : 0), g);
        // batterie
        switch (P.drums) {
          case 'lofi': if (k === 0 || k === 2.5) kick(b, bt, 0.55 * g); if (k === 2) kick(b, bt + beat / 2, 0.4 * g); if (k % 2 === 1) snare(b, bt, 0.35 * g); hat(b, bt, 0.5 * g); hat(b, bt + beat / 2, 0.3 * g); break;
          case 'pop': kick(b, bt, (k % 2 === 0 ? 0.7 : 0.35) * g); if (k % 2 === 1) clap(b, bt, 0.6 * g); hat(b, bt + beat / 2, 0.5 * g, k === 3); break;
          case 'four': kick(b, bt, 0.8 * g); if (k % 2 === 1) clap(b, bt, 0.7 * g); hat(b, bt + beat / 2, 0.6 * g, true); break;
          case 'tense': if (k === 0) kick(b, bt, 0.7 * g); if (k === 2) snare(b, bt, 0.4 * g); for (let h = 0; h < 4; h++) hat(b, bt + h * beat / 4, (h % 2 ? 0.25 : 0.4) * g); break;
          case 'drama': if (k === 0) boom(b, bt, 0.45 * g); if (k === 2) kick(b, bt, 0.5 * g); break;
        }
        // mélodie pincée
        if (P.lead && (barIdx + k) % 2 === 0) { const m = ch[(k + barIdx) % ch.length] + 12; pluck(b, bt + (k % 2 ? beat / 2 : 0), m, 0.55 * g, 0.5, k % 2 ? 0.3 : -0.3); }
      }
    }
  }
  return b;
}

// ------------------------------------------------------------------ WAV
export function wavBuffer(L, R) {
  const n = L.length, data = Buffer.alloc(44 + n * 4);
  data.write('RIFF', 0); data.writeUInt32LE(36 + n * 4, 4); data.write('WAVE', 8); data.write('fmt ', 12);
  data.writeUInt32LE(16, 16); data.writeUInt16LE(1, 20); data.writeUInt16LE(2, 22); data.writeUInt32LE(SR, 24); data.writeUInt32LE(SR * 4, 28); data.writeUInt16LE(4, 32); data.writeUInt16LE(16, 34);
  data.write('data', 36); data.writeUInt32LE(n * 4, 40);
  for (let i = 0; i < n; i++) {
    data.writeInt16LE(Math.max(-32767, Math.min(32767, Math.round(L[i] * 32767))), 44 + i * 4);
    data.writeInt16LE(Math.max(-32767, Math.min(32767, Math.round(R[i] * 32767))), 46 + i * 4);
  }
  return data;
}
export { Buf };
