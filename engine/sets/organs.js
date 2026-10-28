// Décors « à l'intérieur du corps » + cabinet médical.
// cœur (cavité qui bat, valve), cerveau (neurones et influx), poumons (bronches, alvéoles, oxygène),
// estomac/intestin (plis, acide, villosités), cabinet médical (diagnostic, prise de sang).
import * as THREE from 'three';
import { sculpt, rng, TAU, clamp, smooth, varTube, roundedBox, fbm3 } from '../core/geo.js';
import * as M from '../core/materials.js';
import { fbmField, heightToNormal, fieldToTexture, makeCanvas, tileTexture, woodTextures, skinNormal } from '../core/textures.js';
import { redCellGeometry, plantPot } from './props.js';

const V = (x, y, z) => new THREE.Vector3(x, y, z);
function envFrom(panels, bg) {
  const s = new THREE.Scene(); s.background = new THREE.Color(bg);
  for (const p of panels) { const m = new THREE.Mesh(new THREE.PlaneGeometry(p.w, p.h), new THREE.MeshBasicMaterial({ color: new THREE.Color(p.color).multiplyScalar(p.i ?? 3), side: THREE.DoubleSide })); m.position.set(...p.pos); m.lookAt(0, 1, 0); s.add(m); }
  return s;
}
function keySpot(color, intensity, pos, target, quality) {
  const l = new THREE.SpotLight(color, intensity, 30, 0.6, 0.9, 1.5); l.position.copy(pos); l.target.position.copy(target);
  l.castShadow = true; l.shadow.mapSize.set(quality.shadow, quality.shadow); l.shadow.bias = -0.0002; l.shadow.normalBias = 0.025; l.userData.mainShadow = true;
  return l;
}
/** Paroi organique vue de l'intérieur : sphère déformée, sol aplati là où se tiennent les personnages. */
function chamber(radius, mat, { bumps = 0.08, scale = 2.2, floorY = 0, squashY = 0.75, seed = 1, ridges = 0 } = {}) {
  const g = sculpt((n) => {
    let k = 1 + fbm3(n.x * scale + seed, n.y * scale, n.z * scale, 4) * bumps;
    if (ridges) k += Math.abs(Math.sin(Math.atan2(n.z, n.x) * ridges + n.y * 3)) * 0.04;
    const v = V(n.x * radius * k, n.y * radius * squashY * k, n.z * radius * k);
    if (v.y < floorY) v.y = floorY - 0.05; // sous le sol
    return v;
  }, 160, 120);
  const m = new THREE.Mesh(g, mat); m.material.side = THREE.BackSide; m.receiveShadow = true;
  // sol propre (évite les stries de la calotte aplatie)
  const fm = mat.clone(); fm.side = THREE.FrontSide;
  if (fm.normalMap) { fm.normalMap = fm.normalMap.clone(); fm.normalMap.repeat.set(3, 3); fm.normalMap.needsUpdate = true; }
  const floor = new THREE.Mesh(new THREE.CircleGeometry(radius * 1.05, 96), fm); floor.rotation.x = -Math.PI / 2; floor.position.y = floorY + 0.005; floor.receiveShadow = true;
  m.add(floor);
  return m;
}
function organMat(color, normal, opts = {}) {
  return new THREE.MeshPhysicalMaterial({ color, roughness: opts.rough ?? 0.35, clearcoat: 1, clearcoatRoughness: 0.15, sheen: 0.8, sheenColor: opts.sheen || '#ffb0a8', normalMap: normal, normalScale: new THREE.Vector2(opts.ns ?? 0.8, opts.ns ?? 0.8), emissive: opts.emissive || '#3a0008', emissiveIntensity: opts.ei ?? 0.4 });
}
const ridgeNormal = (seed, per = 6, str = 5) => { const s = 256, f = fbmField(s, per, 5, seed); for (let i = 0; i < f.length; i++) f[i] = 1 - Math.abs(f[i] * 2 - 1); return heightToNormal(f, s, str); };
function marks() { return { center: V(0, 0, 0.6), left: V(-0.95, 0, 0.75), right: V(0.95, 0, 0.75), farLeft: V(-1.8, 0, 0.5), farRight: V(1.8, 0, 0.5), back: V(0, 0, -0.6) }; }

// ============================================================== CŒUR
export function heartSet(quality) {
  const g = new THREE.Group(); g.name = 'heart'; const upd = [];
  const nrm = ridgeNormal(91, 5, 6); nrm.repeat.set(6, 3);
  const wallMat = organMat('#a3121e', nrm, { emissive: '#4a0006', ei: 0.5 });
  const wall = chamber(6, wallMat, { bumps: 0.12, ridges: 9, seed: 3, squashY: 0.7 }); wall.position.set(0, 0, -1); g.add(wall);
  // valve (trois feuillets) au fond
  const valve = new THREE.Group(); valve.position.set(0, 2.2, -5.2); g.add(valve);
  const leafMat = new THREE.MeshPhysicalMaterial({ color: '#f2c2b8', roughness: 0.3, clearcoat: 1, sheen: 1, sheenColor: '#fff', transparent: true, opacity: 0.92, side: THREE.DoubleSide, emissive: '#5a1a1a', emissiveIntensity: 0.3 });
  const ring = new THREE.Mesh(new THREE.TorusGeometry(1.25, 0.18, 24, 64), organMat('#c8323c', nrm)); valve.add(ring);
  const leaves = [];
  for (let i = 0; i < 3; i++) {
    const piv = new THREE.Group(); piv.rotation.z = (i / 3) * TAU; valve.add(piv);
    const leaf = new THREE.Mesh(new THREE.CircleGeometry(1.2, 32, 0, Math.PI * 0.67), leafMat); leaf.rotation.z = -Math.PI * 0.33; piv.add(leaf); leaves.push(leaf);
  }
  // cordages tendineux (piliers)
  for (const [x, z] of [[-3, -2.5], [3.2, -2.2], [-2.2, -4], [2.4, -4.2]]) {
    const pts = [V(x, 0, z), V(x * 0.9, 1.6, z - 0.3), V(x * 0.6, 3.2, z - 1)];
    const m = new THREE.Mesh(varTube(new THREE.CatmullRomCurve3(pts), (t) => 0.22 - t * 0.14, 48, 16), organMat('#b01c28', nrm)); m.castShadow = true; g.add(m);
  }
  // globules
  const rbc = new THREE.MeshPhysicalMaterial({ color: '#d61f2c', roughness: 0.28, clearcoat: 1, sheen: 0.8, sheenColor: '#ff8a8a', emissive: '#5a0008', emissiveIntensity: 0.4 });
  const rg = redCellGeometry(0.35), r = rng(4), cells = [];
  for (let i = 0; i < 18; i++) { const m = new THREE.Mesh(rg, rbc); cells.push({ m, a: r() * TAU, rad: 2 + r() * 2.5, y: 0.8 + r() * 3, sp: 0.2 + r() * 0.3 }); g.add(m); }
  const beat = (t) => { const p = (t * 1.15) % 1; return Math.exp(-Math.pow((p - 0.1) * 22, 2)) + 0.6 * Math.exp(-Math.pow((p - 0.28) * 22, 2)); };
  const lights = new THREE.Group();
  lights.add(keySpot('#ffe0d8', 60, V(-2, 4.5, 6), V(0, 0.8, 0), quality));
  const pulse = new THREE.PointLight('#ff3040', 14, 14, 1.4); pulse.position.set(0, 3, -2); lights.add(pulse);
  const rim = new THREE.SpotLight('#ff9a7a', 30, 15, 0.7, 0.8, 1.4); rim.position.set(3, 3, -3); rim.target.position.set(0, 0.8, 0.5); lights.add(rim, rim.target);
  lights.add(new THREE.HemisphereLight('#ff8a8a', '#3a0008', 0.45)); g.add(lights);
  upd.push((t) => {
    const b = beat(t);
    wall.scale.setScalar(1 + b * 0.025); pulse.intensity = 10 + b * 14;
    leaves.forEach((l) => { l.parent.rotation.x = 0; l.rotation.x = -0.9 * (0.5 + 0.5 * Math.sin(t * 7.2)); });
    cells.forEach((c, i) => { const a = c.a + t * c.sp; c.m.position.set(Math.cos(a) * c.rad, c.y + Math.sin(t + i) * 0.2, -2 + Math.sin(a) * c.rad * 0.6 - 1); c.m.rotation.set(t * 0.4 + i, t * 0.3, 0); });
  });
  return {
    id: 'heart', group: g, env: envFrom([{ w: 10, h: 6, pos: [0, 4, -8], color: '#ff2a3a', i: 2.5 }, { w: 6, h: 3, pos: [-5, 5, 6], color: '#ffe2dc', i: 3 }], '#1a0204'),
    envIntensity: 0.8, background: new THREE.Color('#2a0408'), fog: new THREE.FogExp2('#2a0408', 0.05),
    look: { exposure: 1.0, bloom: 0.5, bloomRadius: 0.6, bloomThreshold: 0.85, vignette: 0.42, warm: 0.03, sat: 1.15 },
    marks: marks(), obstacles: [{ x: -3, z: -2.5, r: 0.4 }, { x: 3.2, z: -2.2, r: 0.4 }], update: (t) => upd.forEach((f) => f(t)), heartbeat: true,
  };
}

// ============================================================== CERVEAU
export function brainSet(quality) {
  const g = new THREE.Group(); g.name = 'brain'; const upd = [];
  // sol en circonvolutions
  const floorGeo = new THREE.PlaneGeometry(30, 30, 200, 200);
  const p = floorGeo.attributes.position;
  for (let i = 0; i < p.count; i++) { const x = p.getX(i), y = p.getY(i); const d = Math.hypot(x, y); p.setZ(i, (Math.sin(x * 1.3 + Math.sin(y * 0.9) * 2) * 0.18 + fbm3(x * 0.4, y * 0.4, 0, 3) * 0.3) * smooth(clamp((d - 2.2) / 2))); }
  floorGeo.computeVertexNormals();
  const gyri = organMat('#e7a1b4', skinNormal(1.2, 10), { emissive: '#3a0a24', ei: 0.3, sheen: '#ffd6e6', ns: 0.4 });
  const floor = new THREE.Mesh(floorGeo, gyri); floor.rotation.x = -Math.PI / 2; floor.receiveShadow = true; g.add(floor);
  // neurones (corps + dendrites) et influx lumineux
  const r = rng(21), somaMat = new THREE.MeshPhysicalMaterial({ color: '#b48cff', roughness: 0.25, clearcoat: 1, emissive: '#6a2cff', emissiveIntensity: 0.6, sheen: 1, sheenColor: '#e8d8ff' });
  const axons = [];
  for (let i = 0; i < 9; i++) {
    const c = V((r() - 0.5) * 12, 1.5 + r() * 3.5, -3 - r() * 7);
    const soma = new THREE.Mesh(new THREE.SphereGeometry(0.35 + r() * 0.2, 32, 24), somaMat); soma.position.copy(c); g.add(soma);
    for (let k = 0; k < 5; k++) {
      const dir = V(r() - 0.5, r() - 0.5, r() - 0.5).normalize();
      const pts = [c.clone(), c.clone().addScaledVector(dir, 1 + r()), c.clone().addScaledVector(dir, 2 + r() * 2).add(V((r() - 0.5) * 1.5, (r() - 0.5), (r() - 0.5)))];
      const curve = new THREE.CatmullRomCurve3(pts);
      g.add(new THREE.Mesh(varTube(curve, (t) => 0.1 * (1 - t * 0.8), 40, 10), somaMat));
      axons.push({ curve, off: r() });
    }
  }
  const spark = new THREE.MeshBasicMaterial({ color: new THREE.Color(3, 2.6, 4) });
  const sparks = axons.map(() => { const s = new THREE.Mesh(new THREE.SphereGeometry(0.06, 12, 8), spark); g.add(s); return s; });
  upd.push((t) => axons.forEach((a, i) => { const u = (t * 0.6 + a.off) % 1; sparks[i].position.copy(a.curve.getPointAt(u)); sparks[i].scale.setScalar(0.6 + Math.sin(u * Math.PI) * 0.8); }));
  const lights = new THREE.Group();
  lights.add(keySpot('#fff0ff', 60, V(-2, 4.5, 6), V(0, 0.8, 0), quality));
  const purple = new THREE.PointLight('#a060ff', 14, 16, 1.4); purple.position.set(0, 3.5, -4); lights.add(purple);
  const rim = new THREE.SpotLight('#ff7ad0', 30, 15, 0.7, 0.8, 1.4); rim.position.set(3, 3, -3); rim.target.position.set(0, 0.8, 0.5); lights.add(rim, rim.target);
  lights.add(new THREE.HemisphereLight('#c8a0ff', '#1a0a24', 0.5)); g.add(lights);
  return {
    id: 'brain', group: g, env: envFrom([{ w: 10, h: 6, pos: [0, 4, -8], color: '#a060ff', i: 2.5 }, { w: 6, h: 3, pos: [-5, 5, 6], color: '#fff0ff', i: 3 }], '#0c0418'),
    envIntensity: 0.8, background: new THREE.Color('#120622'), fog: new THREE.FogExp2('#120622', 0.06),
    look: { exposure: 1.0, bloom: 0.65, bloomRadius: 0.6, bloomThreshold: 0.8, vignette: 0.42, warm: 0, sat: 1.15 },
    marks: marks(), update: (t) => { upd.forEach((f) => f(t)); purple.intensity = 12 + Math.sin(t * 3) * 3; },
  };
}

// ============================================================== POUMONS
export function lungsSet(quality) {
  const g = new THREE.Group(); g.name = 'lungs'; const upd = [];
  const nrm = ridgeNormal(51, 8, 3); nrm.repeat.set(5, 3);
  const wallMat = organMat('#f08aa0', nrm, { emissive: '#4a1020', ei: 0.3, sheen: '#ffe0ea', ns: 0.5 });
  // bronche : tunnel annelé
  const R = 3.2, L = 40;
  const tube = new THREE.Mesh(new THREE.CylinderGeometry(R, R, L, 96, 80, true), wallMat);
  const tp = tube.geometry.attributes.position;
  for (let i = 0; i < tp.count; i++) { const x = tp.getX(i), y = tp.getY(i), z = tp.getZ(i); const k = 1 - 0.05 * Math.pow(Math.max(0, Math.sin(y * 2.2)), 8); tp.setX(i, x * k); tp.setZ(i, z * k); }
  tube.geometry.computeVertexNormals(); tube.material.side = THREE.BackSide;
  tube.rotation.x = Math.PI / 2; tube.position.set(0, R - 0.25, -L / 2 + 6); tube.receiveShadow = true; g.add(tube);
  // grappes d'alvéoles au fond
  const alvMat = organMat('#ff9fb4', skinNormal(1, 6), { emissive: '#5a1828', ei: 0.4, ns: 0.3 });
  const r = rng(61);
  for (let c = 0; c < 4; c++) {
    const cg = new THREE.Group(); cg.position.set((c - 1.5) * 2.4, 1.5 + r() * 2, -14 - r() * 4); g.add(cg);
    for (let i = 0; i < 14; i++) { const s = new THREE.Mesh(new THREE.SphereGeometry(0.35 + r() * 0.25, 24, 16), alvMat); s.position.set((r() - 0.5) * 1.8, (r() - 0.5) * 1.8, (r() - 0.5) * 1.2); cg.add(s); }
  }
  // bulles d'oxygène
  const o2 = new THREE.MeshPhysicalMaterial({ color: '#bfe8ff', roughness: 0.05, transparent: true, opacity: 0.55, clearcoat: 1, emissive: '#3aa0ff', emissiveIntensity: 0.4 });
  const bubbles = [];
  for (let i = 0; i < 40; i++) { const b = new THREE.Mesh(new THREE.SphereGeometry(0.06 + r() * 0.08, 16, 12), o2); bubbles.push({ b, x: (r() - 0.5) * 5, y: 0.5 + r() * 4.5, z0: r() * 30, sp: 0.8 + r() }); g.add(b); }
  const lights = new THREE.Group();
  lights.add(keySpot('#fff2f4', 60, V(-2, 4.5, 6), V(0, 0.8, 0), quality));
  const blue = new THREE.PointLight('#8ad0ff', 10, 14, 1.4); blue.position.set(0, 3, -6); lights.add(blue);
  const rim = new THREE.SpotLight('#ffc0d0', 30, 15, 0.7, 0.8, 1.4); rim.position.set(3, 3, -3); rim.target.position.set(0, 0.8, 0.5); lights.add(rim, rim.target);
  lights.add(new THREE.HemisphereLight('#ffd0dc', '#3a1020', 0.5)); g.add(lights);
  return {
    id: 'lungs', group: g, env: envFrom([{ w: 10, h: 6, pos: [0, 4, -8], color: '#8ad0ff', i: 2 }, { w: 6, h: 3, pos: [-5, 5, 6], color: '#fff2f4', i: 3 }], '#1a0610'),
    envIntensity: 0.8, background: new THREE.Color('#3a1424'), fog: new THREE.FogExp2('#3a1424', 0.06),
    look: { exposure: 1.02, bloom: 0.45, bloomRadius: 0.55, bloomThreshold: 0.86, vignette: 0.4, warm: 0.02, sat: 1.1 },
    marks: marks(),
    update: (t, st = {}) => {
      // respiration (et resserrement en cas de crise : setState.constriction 0..1)
      const breath = 1 + Math.sin(t * 1.4) * 0.03 - (st.constriction || 0) * 0.35;
      tube.scale.set(breath, 1, breath);
      bubbles.forEach((o) => { o.b.position.set(o.x, o.y + Math.sin(t + o.z0) * 0.1, ((o.z0 + t * o.sp) % 30) - 24); });
    },
  };
}

// ============================================================== ESTOMAC / INTESTIN
export function gutSet(quality) {
  const g = new THREE.Group(); g.name = 'gut'; const upd = [];
  const nrm = ridgeNormal(71, 4, 7); nrm.repeat.set(4, 2);
  const wallMat = organMat('#e9766f', nrm, { emissive: '#4a0e0a', ei: 0.35, sheen: '#ffd0c8', ns: 0.9 });
  const wall = chamber(6.5, wallMat, { bumps: 0.14, ridges: 14, seed: 9, squashY: 0.65 }); wall.position.set(0, 0, -1.5); g.add(wall);
  // lac d'acide au fond
  const acid = new THREE.Mesh(new THREE.CircleGeometry(3.2, 64), new THREE.MeshPhysicalMaterial({ color: '#b6e04a', roughness: 0.05, clearcoat: 1, emissive: '#5a8a10', emissiveIntensity: 0.8, transparent: true, opacity: 0.85 }));
  acid.rotation.x = -Math.PI / 2; acid.position.set(0.5, 0.03, -4.5); g.add(acid);
  const bubMat = new THREE.MeshPhysicalMaterial({ color: '#e4ff8a', roughness: 0.1, clearcoat: 1, emissive: '#8acc20', emissiveIntensity: 0.6, transparent: true, opacity: 0.8 });
  const r = rng(81), bubs = [];
  for (let i = 0; i < 16; i++) { const b = new THREE.Mesh(new THREE.SphereGeometry(0.08 + r() * 0.12, 16, 12), bubMat); bubs.push({ b, x: 0.5 + (r() - 0.5) * 4, z: -4.5 + (r() - 0.5) * 3, off: r() }); g.add(b); }
  // villosités sur les côtés
  const villMat = organMat('#f39088', skinNormal(1, 6), { ns: 0.3 });
  for (let i = 0; i < 60; i++) { const a = (r() - 0.5) * 2.4 + (r() > 0.5 ? Math.PI : 0); const rad = 3.6 + r() * 0.8; const v = new THREE.Mesh(new THREE.CapsuleGeometry(0.08, 0.5 + r() * 0.4, 6, 10), villMat); v.position.set(Math.sin(a) * rad, 0.3, -2 + Math.cos(a) * rad * 0.6); v.rotation.set((r() - 0.5) * 0.4, 0, (r() - 0.5) * 0.4); g.add(v); }
  // morceaux de nourriture
  const food = [M.skin('#f2cf6b'), M.skin('#7cc45a'), M.skin('#c9733a')];
  const chunks = [];
  for (let i = 0; i < 8; i++) { const c = new THREE.Mesh(new THREE.DodecahedronGeometry(0.15 + r() * 0.1, 1), food[i % 3]); chunks.push({ c, a: r() * TAU, y: 1 + r() * 3 }); g.add(c); }
  const lights = new THREE.Group();
  lights.add(keySpot('#fff0e6', 60, V(-2, 4.5, 6), V(0, 0.8, 0), quality));
  const green = new THREE.PointLight('#b6ff4a', 10, 10, 1.4); green.position.set(0.5, 0.8, -4.5); lights.add(green);
  const rim = new THREE.SpotLight('#ffb090', 30, 15, 0.7, 0.8, 1.4); rim.position.set(3, 3, -3); rim.target.position.set(0, 0.8, 0.5); lights.add(rim, rim.target);
  lights.add(new THREE.HemisphereLight('#ffb0a0', '#2a0806', 0.5)); g.add(lights);
  return {
    id: 'gut', group: g, env: envFrom([{ w: 10, h: 6, pos: [0, 4, -8], color: '#e9766f', i: 2 }, { w: 4, h: 3, pos: [0, -1, -6], color: '#b6ff4a', i: 2 }, { w: 6, h: 3, pos: [-5, 5, 6], color: '#fff0e6', i: 3 }], '#1a0604'),
    envIntensity: 0.8, background: new THREE.Color('#2a0a08'), fog: new THREE.FogExp2('#2a0a08', 0.05),
    look: { exposure: 1.0, bloom: 0.5, bloomRadius: 0.55, bloomThreshold: 0.85, vignette: 0.42, warm: 0.04, sat: 1.12 },
    marks: marks(), obstacles: [{ x: 0.5, z: -4.5, r: 3.2 }],
    update: (t) => {
      wall.scale.setScalar(1 + Math.sin(t * 0.8) * 0.02);
      bubs.forEach((o) => { const u = (t * 0.5 + o.off) % 1; o.b.position.set(o.x, u * 0.5, o.z); o.b.scale.setScalar(u < 0.9 ? 1 : (1 - u) * 10); });
      chunks.forEach((o, i) => { const a = o.a + t * 0.15; o.c.position.set(Math.cos(a) * 3, o.y + Math.sin(t + i) * 0.3, -3 + Math.sin(a) * 2); o.c.rotation.set(t, t * 0.7, 0); });
    },
  };
}

// ============================================================== CABINET MÉDICAL
function screenTexture() {
  const [c, x] = makeCanvas(512, 320);
  const tex = new THREE.CanvasTexture(c); tex.colorSpace = THREE.SRGBColorSpace;
  const draw = (t) => {
    x.fillStyle = '#071a24'; x.fillRect(0, 0, 512, 320);
    x.fillStyle = '#2fe0ff'; x.font = '700 30px Montserrat, Arial'; x.fillText('RÉSULTATS', 24, 46);
    x.strokeStyle = 'rgba(47,224,255,0.25)'; x.lineWidth = 1; for (let i = 0; i < 12; i++) { x.beginPath(); x.moveTo(0, 80 + i * 20); x.lineTo(512, 80 + i * 20); x.stroke(); }
    x.strokeStyle = '#3dff8a'; x.lineWidth = 4; x.beginPath();
    for (let i = 0; i <= 512; i += 4) { const ph = ((i / 512) * 3 + t * 1.2) % 1; const y = 200 - (ph > 0.42 && ph < 0.47 ? -90 : ph > 0.47 && ph < 0.5 ? 60 : Math.sin(ph * 30) * 4); if (i === 0) x.moveTo(i, y); else x.lineTo(i, y); }
    x.stroke();
    tex.needsUpdate = true;
  };
  draw(0); return { tex, draw };
}
export function clinicSet(quality) {
  const g = new THREE.Group(); g.name = 'clinic'; const upd = [];
  const wallMat = M.skin('#dfe8ee', { roughness: 0.85, clearcoat: 0, sheen: 0.1, bump: 1 });
  const back = new THREE.Mesh(new THREE.PlaneGeometry(10, 4.5), wallMat); back.position.set(0, 2.25, -2.2); back.receiveShadow = true; g.add(back);
  const side = new THREE.Mesh(new THREE.PlaneGeometry(8, 4.5), wallMat); side.position.set(-3.5, 2.25, 1); side.rotation.y = Math.PI / 2; side.receiveShadow = true; g.add(side);
  const stripe = new THREE.Mesh(new THREE.PlaneGeometry(10, 0.25), new THREE.MeshStandardMaterial({ color: '#2fa7c9' })); stripe.position.set(0, 1.0, -2.19); g.add(stripe);
  const tiles = tileTexture('#d8dee2', '#b8c0c6', 10); tiles.repeat.set(4, 4);
  const floor = new THREE.Mesh(new THREE.PlaneGeometry(12, 10), new THREE.MeshPhysicalMaterial({ map: tiles, roughness: 0.3, clearcoat: 0.5 })); floor.rotation.x = -Math.PI / 2; floor.receiveShadow = true; g.add(floor);
  // bureau + écran animé
  const { map, rough } = woodTextures([170, 120, 80], 6, false, 7);
  const desk = new THREE.Mesh(roundedBox(2.2, 0.08, 0.9, 0.03, 3), new THREE.MeshStandardMaterial({ map, roughnessMap: rough })); desk.position.set(1.6, 0.78, -1.4); desk.castShadow = true; g.add(desk);
  for (const sx of [-1, 1]) { const leg = new THREE.Mesh(roundedBox(0.06, 0.78, 0.8, 0.02, 2), M.metal('#cfd6dc', 0.3)); leg.position.set(1.6 + sx * 1.0, 0.39, -1.4); g.add(leg); }
  const scr = screenTexture();
  const monitor = new THREE.Mesh(roundedBox(1.0, 0.65, 0.05, 0.03, 3), M.glossy('#1d1f24', 0.3)); monitor.position.set(1.6, 1.25, -1.6); g.add(monitor);
  const display = new THREE.Mesh(new THREE.PlaneGeometry(0.92, 0.57), new THREE.MeshBasicMaterial({ map: scr.tex, toneMapped: false })); display.position.set(1.6, 1.25, -1.574); g.add(display);
  upd.push((t) => scr.draw(t));
  // portoir de tubes de prise de sang
  const rack = new THREE.Group(); rack.position.set(0.9, 0.82, -1.25); g.add(rack);
  rack.add(new THREE.Mesh(roundedBox(0.45, 0.06, 0.12, 0.01, 2), M.skin('#ffffff')));
  ['#c0152a', '#7a3cc8', '#2a9b4a', '#e0b020', '#c0152a'].forEach((c, i) => { const tb = new THREE.Mesh(new THREE.CylinderGeometry(0.025, 0.025, 0.22, 16), M.glass('#ffffff', 0.5)); tb.position.set(-0.17 + i * 0.085, 0.1, 0); rack.add(tb); const cap = new THREE.Mesh(new THREE.CylinderGeometry(0.028, 0.028, 0.04, 16), M.glossy(c, 0.3)); cap.position.set(-0.17 + i * 0.085, 0.22, 0); rack.add(cap); const blood = new THREE.Mesh(new THREE.CylinderGeometry(0.022, 0.022, 0.12, 16), M.glossy('#8a0a14', 0.2)); blood.position.set(-0.17 + i * 0.085, 0.05, 0); rack.add(blood); });
  // table d'examen
  const bed = new THREE.Group(); bed.position.set(-2.2, 0, -0.9); bed.rotation.y = 0.3; g.add(bed);
  const pad = new THREE.Mesh(roundedBox(0.8, 0.14, 1.9, 0.05, 4), M.velvet('#3aa0b8')); pad.position.y = 0.75; bed.add(pad);
  const paper = new THREE.Mesh(roundedBox(0.6, 0.01, 1.85, 0.005, 2), M.fabric('#ffffff')); paper.position.y = 0.83; bed.add(paper);
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) { const l = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.03, 0.7, 12), M.metal('#cfd6dc', 0.3)); l.position.set(sx * 0.32, 0.35, sz * 0.8); bed.add(l); }
  // affiche anatomique (silhouette dessinée)
  const [pc, px] = makeCanvas(256, 384);
  px.fillStyle = '#ffffff'; px.fillRect(0, 0, 256, 384); px.fillStyle = '#2fa7c9'; px.font = '800 22px Montserrat, Arial'; px.fillText('LE CORPS HUMAIN', 30, 34);
  px.fillStyle = '#f2c2a8'; px.beginPath(); px.arc(128, 90, 30, 0, TAU); px.fill(); px.fillRect(98, 120, 60, 130); px.fillRect(70, 125, 26, 110); px.fillRect(160, 125, 26, 110); px.fillRect(100, 250, 24, 110); px.fillRect(132, 250, 24, 110);
  px.fillStyle = '#e2394a'; px.beginPath(); px.arc(138, 160, 12, 0, TAU); px.fill(); px.fillStyle = '#f39ab0'; px.fillRect(104, 140, 18, 36); px.fillRect(140, 135, 0, 0); px.fillStyle = '#8e3a2a'; px.fillRect(110, 190, 40, 16); px.fillStyle = '#ef8a76'; px.fillRect(118, 210, 30, 8);
  const ptex = new THREE.CanvasTexture(pc); ptex.colorSpace = THREE.SRGBColorSpace;
  const poster = new THREE.Mesh(new THREE.PlaneGeometry(0.8, 1.2), new THREE.MeshStandardMaterial({ map: ptex, roughness: 0.6 })); poster.position.set(-0.6, 2.2, -2.18); g.add(poster);
  const pl = plantPot(5, '#ffffff'); pl.position.set(3.1, 0, -1.6); g.add(pl);
  // fenêtre lumineuse
  const win = new THREE.Mesh(new THREE.PlaneGeometry(1.6, 1.4), new THREE.MeshStandardMaterial({ color: '#000', emissive: '#cfe8ff', emissiveIntensity: 1.6 })); win.position.set(-3.49, 2.2, 0.6); win.rotation.y = Math.PI / 2; g.add(win);
  const lights = new THREE.Group();
  lights.add(keySpot('#fff6ee', 32, V(-2, 4, 5.5), V(0, 0.9, 0), quality));
  const winL = new THREE.SpotLight('#d8ecff', 25, 12, 0.8, 0.9, 1.4); winL.position.set(-3.2, 2.4, 0.6); winL.target.position.set(0, 0.8, 0); lights.add(winL, winL.target);
  lights.add(new THREE.HemisphereLight('#ffffff', '#8a96a0', 0.32)); g.add(lights);
  return {
    id: 'clinic', group: g, env: envFrom([{ w: 6, h: 4, pos: [-6, 3, 0], color: '#d8ecff', i: 3 }, { w: 10, h: 4, pos: [0, 6, 2], color: '#ffffff', i: 2 }], '#9aa6ae'),
    envIntensity: 0.55, background: new THREE.Color('#c9d3da'), fog: null,
    look: { exposure: 0.85, bloom: 0.25, bloomRadius: 0.4, bloomThreshold: 0.93, vignette: 0.3, warm: 0.02, sat: 1.05 },
    marks: { center: V(0, 0, 0.5), left: V(-0.9, 0, 0.6), right: V(0.9, 0, 0.6), farLeft: V(-1.7, 0, 0.6), farRight: V(1.7, 0, 0.7), back: V(0, 0, -0.5) },
    obstacles: [{ x: 1.6, z: -1.4, r: 1.1 }, { x: -2.2, z: -0.9, r: 1.0 }, { x: 3.1, z: -1.6, r: 0.4 }],
    update: (t) => upd.forEach((f) => f(t)),
  };
}
