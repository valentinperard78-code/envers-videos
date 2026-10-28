// Textures procédurales générées au chargement (aucun fichier image requis).
import * as THREE from 'three';
import { rng, clamp, lerp, smooth } from './geo.js';

const cache = new Map();
function memo(key, fn) { if (!cache.has(key)) cache.set(key, fn()); return cache.get(key); }

export function makeCanvas(w, h) {
  const c = document.createElement('canvas'); c.width = w; c.height = h;
  return [c, c.getContext('2d')];
}

// Bruit de valeur 2D périodique (texture répétable sans couture).
function periodicNoise(size, period, seed) {
  const r = rng(seed);
  const grid = new Float32Array(period * period).map(() => r());
  const out = new Float32Array(size * size);
  for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) {
    const fx = (x / size) * period, fy = (y / size) * period;
    const x0 = Math.floor(fx), y0 = Math.floor(fy);
    const tx = smooth(fx - x0), ty = smooth(fy - y0);
    const g = (a, b) => grid[((b % period) * period) + (a % period)];
    out[y * size + x] = lerp(lerp(g(x0, y0), g(x0 + 1, y0), tx), lerp(g(x0, y0 + 1), g(x0 + 1, y0 + 1), tx), ty);
  }
  return out;
}
export function fbmField(size, basePeriod = 4, octaves = 5, seed = 7) {
  const f = new Float32Array(size * size);
  let amp = 0.5, per = basePeriod, tot = 0;
  for (let o = 0; o < octaves; o++) {
    const n = periodicNoise(size, per, seed + o * 31);
    for (let i = 0; i < f.length; i++) f[i] += n[i] * amp;
    tot += amp; amp *= 0.5; per *= 2;
  }
  for (let i = 0; i < f.length; i++) f[i] /= tot;
  return f;
}

/** Convertit un champ de hauteur en normal map (répétable). */
export function heightToNormal(field, size, strength = 2) {
  const [c, ctx] = makeCanvas(size, size);
  const img = ctx.createImageData(size, size);
  const h = (x, y) => field[((y + size) % size) * size + ((x + size) % size)];
  for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) {
    const dx = (h(x + 1, y) - h(x - 1, y)) * strength;
    const dy = (h(x, y + 1) - h(x, y - 1)) * strength;
    const n = new THREE.Vector3(-dx, -dy, 1).normalize();
    const i = (y * size + x) * 4;
    img.data[i] = (n.x * 0.5 + 0.5) * 255; img.data[i + 1] = (n.y * 0.5 + 0.5) * 255; img.data[i + 2] = (n.z * 0.5 + 0.5) * 255; img.data[i + 3] = 255;
  }
  ctx.putImageData(img, 0, 0);
  const t = new THREE.CanvasTexture(c);
  t.wrapS = t.wrapT = THREE.RepeatWrapping; t.colorSpace = THREE.NoColorSpace;
  return t;
}

export function fieldToTexture(field, size, colorFn, srgb = true) {
  const [c, ctx] = makeCanvas(size, size);
  const img = ctx.createImageData(size, size);
  for (let i = 0; i < size * size; i++) {
    const [r, g, b, a = 255] = colorFn(field[i], i % size, Math.floor(i / size));
    img.data[i * 4] = r; img.data[i * 4 + 1] = g; img.data[i * 4 + 2] = b; img.data[i * 4 + 3] = a;
  }
  ctx.putImageData(img, 0, 0);
  const t = new THREE.CanvasTexture(c);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.colorSpace = srgb ? THREE.SRGBColorSpace : THREE.NoColorSpace;
  t.anisotropy = 8;
  return t;
}

/** Micro-relief de peau / surface organique. */
export const skinNormal = (strength = 1.2, period = 8) => memo(`skinN${strength}${period}`, () => {
  const s = 256; return heightToNormal(fbmField(s, period, 5, 11), s, strength);
});

/** Relief lobulé (pancréas, tissus) : cellules arrondies. */
export const lobuleNormal = () => memo('lobN', () => {
  const s = 256, f = new Float32Array(s * s), r = rng(5);
  const pts = Array.from({ length: 160 }, () => [r() * s, r() * s]);
  for (let y = 0; y < s; y++) for (let x = 0; x < s; x++) {
    let d1 = 1e9, d2 = 1e9;
    for (const [px, py] of pts) {
      let dx = Math.abs(x - px), dy = Math.abs(y - py); dx = Math.min(dx, s - dx); dy = Math.min(dy, s - dy);
      const d = Math.hypot(dx, dy); if (d < d1) { d2 = d1; d1 = d; } else if (d < d2) d2 = d;
    }
    f[y * s + x] = Math.sqrt(clamp((d2 - d1) / 9));
  }
  return heightToNormal(f, s, 2.2);
});

/** Facettes cristallines (sucre). */
export const crystalNormal = () => memo('crysN', () => {
  const s = 256, r = rng(9);
  const [c, ctx] = makeCanvas(s, s);
  ctx.fillStyle = 'rgb(128,128,255)'; ctx.fillRect(0, 0, s, s);
  for (let i = 0; i < 900; i++) {
    const x = r() * s, y = r() * s, w = 3 + r() * 9, a = r() * Math.PI;
    const nx = (r() - 0.5) * 1.4, ny = (r() - 0.5) * 1.4;
    const n = new THREE.Vector3(nx, ny, 1).normalize();
    ctx.fillStyle = `rgb(${(n.x * 0.5 + 0.5) * 255 | 0},${(n.y * 0.5 + 0.5) * 255 | 0},${(n.z * 0.5 + 0.5) * 255 | 0})`;
    ctx.save(); ctx.translate(x, y); ctx.rotate(a); ctx.fillRect(-w / 2, -w / 2, w, w * (0.5 + r()));
    ctx.restore();
  }
  const t = new THREE.CanvasTexture(c); t.wrapS = t.wrapT = THREE.RepeatWrapping; t.colorSpace = THREE.NoColorSpace; t.repeat.set(3, 3);
  return t;
});

/** Texture de bois (planches) : couleur + rugosité. */
export const woodTextures = (tone = [150, 92, 50], planks = 5, vertical = true, seed = 3) => memo(`wood${tone}${planks}${vertical}${seed}`, () => {
  const s = 512, r = rng(seed);
  const grain = fbmField(s, 3, 5, seed);
  const offs = Array.from({ length: planks }, () => r());
  const map = fieldToTexture(grain, s, (v, x, y) => {
    const u = vertical ? x : y, w = vertical ? y : x;
    const p = Math.floor((u / s) * planks);
    const local = ((u / s) * planks) % 1;
    const ring = Math.sin((w / s) * 40 + v * 18 + offs[p] * 20) * 0.5 + 0.5;
    let k = 0.78 + ring * 0.16 + (offs[p] - 0.5) * 0.18 + v * 0.1;
    if (local < 0.025 || local > 0.975) k *= 0.45; // joints
    return [tone[0] * k, tone[1] * k, tone[2] * k];
  });
  const rough = fieldToTexture(grain, s, (v, x, y) => { const g = 150 + v * 80; return [g, g, g]; }, false);
  return { map, rough };
});

/** Iris stylisé (dégradé radial + stries + limbe sombre). */
export const irisTexture = (hex = '#5b3a1e') => memo(`iris${hex}`, () => {
  const s = 256, [c, ctx] = makeCanvas(s, s), col = new THREE.Color(hex), r = rng(17);
  ctx.fillStyle = '#ffffff'; ctx.fillRect(0, 0, s, s);
  const cx = s / 2;
  const g = ctx.createRadialGradient(cx, cx, s * 0.05, cx, cx, s * 0.5);
  const lighter = col.clone().lerp(new THREE.Color('#ffffff'), 0.35), darker = col.clone().multiplyScalar(0.35);
  g.addColorStop(0, '#' + lighter.getHexString()); g.addColorStop(0.6, '#' + col.getHexString()); g.addColorStop(0.92, '#' + darker.getHexString()); g.addColorStop(1, '#' + darker.getHexString());
  ctx.fillStyle = g; ctx.beginPath(); ctx.arc(cx, cx, s * 0.5, 0, Math.PI * 2); ctx.fill();
  ctx.globalAlpha = 0.25;
  for (let i = 0; i < 140; i++) {
    const a = r() * Math.PI * 2, l0 = s * (0.12 + r() * 0.1), l1 = s * (0.32 + r() * 0.16);
    ctx.strokeStyle = r() > 0.5 ? '#ffffff' : '#000000'; ctx.lineWidth = 1 + r() * 2;
    ctx.beginPath(); ctx.moveTo(cx + Math.cos(a) * l0, cx + Math.sin(a) * l0); ctx.lineTo(cx + Math.cos(a) * l1, cx + Math.sin(a) * l1); ctx.stroke();
  }
  ctx.globalAlpha = 1;
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; return t;
});

/** Ciel de nuit dégradé avec étoiles (équirectangulaire). */
export const nightSky = (top = '#0b1030', mid = '#2a1e55', horizon = '#7a3d6b') => memo(`sky${top}${mid}${horizon}`, () => {
  const w = 2048, h = 1024, [c, ctx] = makeCanvas(w, h), r = rng(23);
  const g = ctx.createLinearGradient(0, 0, 0, h);
  g.addColorStop(0, top); g.addColorStop(0.42, mid); g.addColorStop(0.5, horizon); g.addColorStop(0.53, '#1a1030'); g.addColorStop(1, '#05040c');
  ctx.fillStyle = g; ctx.fillRect(0, 0, w, h);
  for (let i = 0; i < 1400; i++) {
    const y = r() * h * 0.46, x = r() * w, a = r() * r();
    ctx.fillStyle = `rgba(255,255,255,${0.25 + a * 0.75})`;
    ctx.beginPath(); ctx.arc(x, y, 0.4 + a * 1.4, 0, Math.PI * 2); ctx.fill();
  }
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.mapping = THREE.EquirectangularReflectionMapping;
  return t;
});

/** Carrelage (bord de piscine). */
export const tileTexture = (color = '#e8e2d6', grout = '#a79e8e', n = 8) => memo(`tile${color}${n}`, () => {
  const s = 512, [c, ctx] = makeCanvas(s, s), r = rng(4);
  ctx.fillStyle = grout; ctx.fillRect(0, 0, s, s);
  const t = s / n, base = new THREE.Color(color);
  for (let i = 0; i < n; i++) for (let j = 0; j < n; j++) {
    const k = 0.93 + r() * 0.1, cc = base.clone().multiplyScalar(k);
    ctx.fillStyle = '#' + cc.getHexString(); ctx.fillRect(i * t + 2, j * t + 2, t - 4, t - 4);
  }
  const tex = new THREE.CanvasTexture(c); tex.wrapS = tex.wrapT = THREE.RepeatWrapping; tex.colorSpace = THREE.SRGBColorSpace; tex.anisotropy = 8;
  return tex;
});

/** Normal map d'eau (petites vagues, répétable). */
export const waterNormal = () => memo('waterN', () => { const s = 256; return heightToNormal(fbmField(s, 6, 4, 41), s, 4); });

/** Herbe vue de haut. */
export const grassTexture = () => memo('grass', () => {
  const s = 512, f = fbmField(s, 16, 5, 13), r = rng(3);
  return fieldToTexture(f, s, (v) => { const k = 0.55 + v * 0.6 + (r() - 0.5) * 0.15; return [38 * k, 92 * k, 46 * k]; });
});

/** Texte en texture (néon, panneaux). */
export function textTexture(text, { font = '900 120px Anton', color = '#fff', glow = null, w = 1024, h = 256, bg = null } = {}) {
  const [c, ctx] = makeCanvas(w, h);
  if (bg) { ctx.fillStyle = bg; ctx.fillRect(0, 0, w, h); }
  ctx.font = font; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  if (glow) { ctx.shadowColor = glow; ctx.shadowBlur = 30; }
  ctx.fillStyle = color; ctx.fillText(text, w / 2, h / 2);
  ctx.shadowBlur = 0; ctx.fillText(text, w / 2, h / 2);
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; return t;
}

/** Paroi de vaisseau sanguin. */
export const vesselTextures = () => memo('vessel', () => {
  const s = 512, f = fbmField(s, 6, 6, 77);
  const map = fieldToTexture(f, s, (v, x, y) => {
    const vein = Math.abs(Math.sin((x / s) * 18 + v * 9)) < 0.06 ? 0.7 : 1;
    const k = (0.65 + v * 0.55) * vein; return [170 * k, 28 * k, 38 * k];
  });
  const normal = heightToNormal(f, s, 6);
  return { map, normal };
});
