// Accessoires de décor procéduraux : palmiers, guirlandes, mobilier, néons, globules…
import * as THREE from 'three';
import { varTube, roundedBox, catenary, rng, sculpt, clamp, smooth, TAU } from '../core/geo.js';
import * as M from '../core/materials.js';
import { makeCanvas, skinNormal } from '../core/textures.js';

// ---------------------------------------------------------------- palmier
let frondTex = null;
function frondTexture() {
  if (frondTex) return frondTex;
  const [c, g] = makeCanvas(256, 1024);
  const r = rng(31);
  // nervure centrale
  g.strokeStyle = '#7da34a'; g.lineWidth = 10; g.beginPath(); g.moveTo(128, 1024); g.lineTo(128, 0); g.stroke();
  // folioles en peigne
  for (let y = 20; y < 1000; y += 14) {
    const len = 118 * Math.sin((y / 1024) * Math.PI) ** 0.6 + 6;
    for (const s of [1, -1]) {
      const grad = g.createLinearGradient(128, y, 128 + s * len, y - 40);
      const k = 0.85 + r() * 0.3;
      grad.addColorStop(0, `rgb(${46 * k | 0},${110 * k | 0},${40 * k | 0})`); grad.addColorStop(1, `rgb(${70 * k | 0},${150 * k | 0},${55 * k | 0})`);
      g.fillStyle = grad; g.beginPath();
      g.moveTo(128, y); g.quadraticCurveTo(128 + s * len * 0.5, y - 26, 128 + s * len, y - 46 - r() * 8);
      g.quadraticCurveTo(128 + s * len * 0.5, y - 14, 128, y + 8); g.fill();
    }
  }
  frondTex = new THREE.CanvasTexture(c); frondTex.colorSpace = THREE.SRGBColorSpace; frondTex.anisotropy = 8;
  return frondTex;
}
function frondGeometry(len = 2.2, width = 0.8, droop = 0.9) {
  const segs = 30, g = new THREE.BufferGeometry(), pos = [], uv = [], idx = [];
  for (let i = 0; i <= segs; i++) {
    const t = i / segs, x = t * len, y = -droop * t * t * len * 0.5 + t * 0.35;
    for (let j = 0; j <= 2; j++) {
      const u = j / 2, w = (u - 0.5) * width;
      pos.push(x, y + (j === 1 ? 0.06 : -Math.abs(w) * 0.25), w); uv.push(u, t);
    }
  }
  for (let i = 0; i < segs; i++) for (let j = 0; j < 2; j++) { const a = i * 3 + j, b = a + 3; idx.push(a, b, a + 1, b, b + 1, a + 1); }
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2)); g.setIndex(idx); g.computeVertexNormals();
  return g;
}
export function palmTree(height = 4.5, seed = 1, lean = 0.4) {
  const r = rng(seed), grp = new THREE.Group();
  const pts = [];
  for (let i = 0; i <= 6; i++) { const t = i / 6; pts.push(new THREE.Vector3(Math.sin(t * 1.6) * lean, t * height, Math.sin(t * 2.3 + seed) * lean * 0.3)); }
  const curve = new THREE.CatmullRomCurve3(pts);
  const bark = M.skin('#8a6a48', { roughness: 0.85, clearcoat: 0, sheen: 0.2 });
  bark.normalMap = skinNormal(2, 12); bark.normalScale.set(0.8, 0.8);
  const trunk = new THREE.Mesh(varTube(curve, (t) => (0.2 - t * 0.08) * (1 + 0.08 * Math.max(0, Math.sin(t * 90))), 140, 20, true), bark);
  trunk.castShadow = true; trunk.receiveShadow = true; grp.add(trunk);
  const top = curve.getPointAt(1);
  const crown = new THREE.Group(); crown.position.copy(top); grp.add(crown);
  const leafMat = new THREE.MeshStandardMaterial({ map: frondTexture(), alphaTest: 0.45, side: THREE.DoubleSide, roughness: 0.6 });
  const n = 10;
  for (let i = 0; i < n; i++) {
    const f = new THREE.Mesh(frondGeometry(1.7 + r() * 0.6, 0.85, 0.7 + r() * 0.5), leafMat);
    f.rotation.set(0, (i / n) * TAU + r() * 0.3, (r() - 0.5) * 0.3);
    f.castShadow = true; crown.add(f);
  }
  const coco = M.skin('#5a3a1e', { roughness: 0.7 });
  for (let i = 0; i < 4; i++) { const c = new THREE.Mesh(new THREE.SphereGeometry(0.1, 16, 12), coco); c.position.set(Math.cos(i * 1.7) * 0.15, -0.12, Math.sin(i * 1.7) * 0.15); crown.add(c); }
  grp.userData.update = (t) => { crown.rotation.z = Math.sin(t * 0.7 + seed) * 0.04; crown.rotation.x = Math.cos(t * 0.5 + seed) * 0.03; };
  return grp;
}

// ---------------------------------------------------------------- guirlande guinguette
export function stringLights(a, b, sag = 0.6, count = 16, color = '#ffd28a') {
  const grp = new THREE.Group();
  const pts = catenary(a, b, sag, 48);
  const wire = new THREE.Mesh(varTube(new THREE.CatmullRomCurve3(pts), () => 0.008, 96, 6, false), new THREE.MeshStandardMaterial({ color: '#111', roughness: 0.6 }));
  grp.add(wire);
  const bulbMat = new THREE.MeshStandardMaterial({ color: '#000', emissive: color, emissiveIntensity: 7, roughness: 0.3 });
  const glass = M.glass('#fff4d6', 0.35);
  const curve = new THREE.CatmullRomCurve3(pts);
  const bulbs = [];
  for (let i = 1; i < count; i++) {
    const p = curve.getPointAt(i / count);
    const bulb = new THREE.Mesh(new THREE.SphereGeometry(0.05, 16, 12), bulbMat); bulb.position.copy(p).add(new THREE.Vector3(0, -0.07, 0)); bulb.scale.y = 1.25;
    const shell = new THREE.Mesh(new THREE.SphereGeometry(0.062, 16, 12), glass); shell.position.copy(bulb.position); shell.scale.y = 1.25;
    grp.add(bulb, shell); bulbs.push(bulb);
  }
  grp.userData.update = (t) => { bulbMat.emissiveIntensity = 6.5 + Math.sin(t * 2.2) * 0.4; };
  return grp;
}

// ---------------------------------------------------------------- mobilier
export function sofa(color = '#e2477c') {
  const g = new THREE.Group(), v = M.velvet(color);
  const seat = new THREE.Mesh(roundedBox(2.0, 0.35, 0.85, 0.12, 6), v); seat.position.y = 0.32;
  const back = new THREE.Mesh(roundedBox(2.0, 0.65, 0.25, 0.12, 6), v); back.position.set(0, 0.7, -0.33);
  const armL = new THREE.Mesh(roundedBox(0.25, 0.5, 0.85, 0.1, 6), v); armL.position.set(-1.0, 0.55, 0);
  const armR = armL.clone(); armR.position.x = 1.0;
  for (let i = -1; i <= 1; i += 2) { const cush = new THREE.Mesh(roundedBox(0.9, 0.18, 0.72, 0.08, 6), v); cush.position.set(i * 0.47, 0.57, 0.04); g.add(cush); }
  const pil = new THREE.Mesh(roundedBox(0.42, 0.42, 0.12, 0.06, 4), M.velvet('#ffd166')); pil.position.set(-0.6, 0.85, -0.12); pil.rotation.set(-0.2, 0.2, 0.15);
  g.add(seat, back, armL, armR, pil);
  for (const s of [-1, 1]) for (const z of [-1, 1]) { const leg = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.02, 0.15, 12), M.metal('#d4a63a')); leg.position.set(s * 0.95, 0.075, z * 0.35); g.add(leg); }
  g.traverse((m) => { if (m.isMesh) { m.castShadow = true; m.receiveShadow = true; } });
  return g;
}
export function lounger() {
  const g = new THREE.Group(), w = M.skin('#f3efe8', { roughness: 0.55, clearcoat: 0.3 }), cush = M.fabric('#fff6ea');
  const base = new THREE.Mesh(roundedBox(0.7, 0.12, 1.9, 0.05, 4), w); base.position.y = 0.3; g.add(base);
  const pad = new THREE.Mesh(roundedBox(0.66, 0.1, 1.3, 0.05, 4), cush); pad.position.set(0, 0.41, 0.28); g.add(pad);
  const backPad = new THREE.Mesh(roundedBox(0.66, 0.1, 0.65, 0.05, 4), cush); backPad.position.set(0, 0.6, -0.6); backPad.rotation.x = 0.7; g.add(backPad);
  const towel = new THREE.Mesh(roundedBox(0.5, 0.03, 0.9, 0.015, 3), M.fabric('#ff6f91')); towel.position.set(0, 0.47, 0.3); g.add(towel);
  for (const s of [-1, 1]) for (const z of [-1, 1]) { const leg = new THREE.Mesh(roundedBox(0.06, 0.25, 0.06, 0.02, 2), w); leg.position.set(s * 0.3, 0.12, z * 0.8); g.add(leg); }
  g.traverse((m) => { if (m.isMesh) { m.castShadow = true; m.receiveShadow = true; } });
  return g;
}
export function plantPot(seed = 1, color = '#e9e2d6') {
  const g = new THREE.Group(), r = rng(seed);
  const pot = new THREE.Mesh(new THREE.CylinderGeometry(0.28, 0.2, 0.55, 32), M.skin(color, { roughness: 0.6 })); pot.position.y = 0.275; g.add(pot);
  const leaf = M.skin('#2f7d3a', { roughness: 0.5, clearcoat: 0.5, sheen: 0.3 });
  for (let i = 0; i < 7; i++) {
    const b = new THREE.Mesh(sculpt((n) => new THREE.Vector3(n.x * 0.32, n.y * 0.3, n.z * 0.32).multiplyScalar(1 + 0.15 * Math.sin(n.x * 9 + i) * Math.sin(n.y * 7))), leaf);
    b.position.set((r() - 0.5) * 0.35, 0.75 + r() * 0.5, (r() - 0.5) * 0.35); b.scale.setScalar(0.7 + r() * 0.5); g.add(b);
  }
  g.traverse((m) => { if (m.isMesh) { m.castShadow = true; m.receiveShadow = true; } });
  return g;
}
export function lantern(color = '#ffb35a') {
  const g = new THREE.Group();
  const post = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.04, 1.0, 12), M.metal('#2c2c2c', 0.5)); post.position.y = 0.5; g.add(post);
  const glow = new THREE.Mesh(new THREE.SphereGeometry(0.12, 24, 16), new THREE.MeshStandardMaterial({ color: '#000', emissive: color, emissiveIntensity: 4 })); glow.position.y = 1.08; g.add(glow);
  return g;
}

// ---------------------------------------------------------------- néon
export function neonText(text, color = '#ff3da8', height = 0.5, font = 'Baloo2') {
  const [c, g] = makeCanvas(2048, 512);
  g.font = `800 300px ${font}, Arial`; g.textAlign = 'center'; g.textBaseline = 'middle';
  g.shadowColor = color; g.shadowBlur = 40; g.fillStyle = color; g.fillText(text, 1024, 270);
  g.shadowBlur = 0; g.fillStyle = '#fff'; g.globalAlpha = 0.9; g.lineWidth = 6; g.strokeStyle = '#fff'; g.strokeText(text, 1024, 270);
  const tex = new THREE.CanvasTexture(c); tex.colorSpace = THREE.SRGBColorSpace;
  const m = new THREE.Mesh(new THREE.PlaneGeometry(height * 4, height), new THREE.MeshBasicMaterial({ map: tex, transparent: true, toneMapped: false, depthWrite: false, color: new THREE.Color(1.6, 1.6, 1.6) }));
  return m;
}
export function neonHeart(size = 0.6, color = '#ff2f8f') {
  const pts = [];
  for (let i = 0; i <= 120; i++) {
    const t = (i / 120) * TAU;
    const x = 16 * Math.sin(t) ** 3, y = 13 * Math.cos(t) - 5 * Math.cos(2 * t) - 2 * Math.cos(3 * t) - Math.cos(4 * t);
    pts.push(new THREE.Vector3((x / 17) * size, (y / 17) * size, 0));
  }
  const curve = new THREE.CatmullRomCurve3(pts, true);
  const mat = new THREE.MeshStandardMaterial({ color: '#000', emissive: color, emissiveIntensity: 9 });
  const m = new THREE.Mesh(new THREE.TubeGeometry(curve, 240, size * 0.035, 12, true), mat);
  return m;
}

// ---------------------------------------------------------------- globule rouge
export function redCellGeometry(r = 0.35) {
  return sculpt((n) => {
    const rr = Math.hypot(n.x, n.z);
    const thick = 0.18 + 0.32 * smooth(clamp((rr - 0.25) * 1.6));
    return new THREE.Vector3(n.x * r, n.y * r * thick, n.z * r);
  }, 64, 48);
}

// ---------------------------------------------------------------- petit sucre de foule (léger)
export function crowdSugar(seed = 1) {
  const g = new THREE.Group(), r = rng(seed);
  const body = new THREE.Mesh(roundedBox(0.3, 0.3, 0.3, 0.05, 4), M.sugar()); body.position.y = 0.15; body.castShadow = true; g.add(body);
  const white = M.eyeWhite(), black = new THREE.MeshPhysicalMaterial({ color: '#050307', roughness: 0.1, clearcoat: 1 });
  for (const s of [1, -1]) {
    const e = new THREE.Mesh(new THREE.SphereGeometry(0.045, 20, 14), white); e.position.set(s * 0.06, 0.2, 0.135); g.add(e);
    const p = new THREE.Mesh(new THREE.SphereGeometry(0.022, 12, 10), black); p.position.set(s * 0.06 + (r() - 0.5) * 0.01, 0.2, 0.172); g.add(p);
  }
  const mouth = new THREE.Mesh(new THREE.TorusGeometry(0.025, 0.006, 6, 16, Math.PI), new THREE.MeshBasicMaterial({ color: '#5a2030' })); mouth.position.set(0, 0.12, 0.151); mouth.rotation.z = r() > 0.5 ? Math.PI : 0; g.add(mouth);
  return g;
}
