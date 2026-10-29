// Outils de géométrie procédurale : formes lisses, tubes à rayon variable, membres souples.
import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import { mergeVertices } from 'three/addons/utils/BufferGeometryUtils.js';

export const TAU = Math.PI * 2;
export const clamp = (v, a = 0, b = 1) => Math.min(b, Math.max(a, v));
export const lerp = (a, b, t) => a + (b - a) * t;
export const smooth = (t) => t * t * (3 - 2 * t);
export const smoother = (t) => t * t * t * (t * (t * 6 - 15) + 10);
export const easeOutBack = (t, s = 1.70158) => 1 + (s + 1) * Math.pow(t - 1, 3) + s * Math.pow(t - 1, 2);
export const easeInOut = (t) => (t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2);

// Bruit de valeur 3D déterministe (suffisant pour déformer des surfaces).
function hash3(x, y, z) {
  let h = x * 374761393 + y * 668265263 + z * 2147483647;
  h = (h ^ (h >>> 13)) * 1274126177;
  return ((h ^ (h >>> 16)) >>> 0) / 4294967295;
}
export function noise3(x, y, z) {
  const xi = Math.floor(x), yi = Math.floor(y), zi = Math.floor(z);
  const xf = smooth(x - xi), yf = smooth(y - yi), zf = smooth(z - zi);
  const c = (a, b, d) => hash3(xi + a, yi + b, zi + d);
  const x00 = lerp(c(0, 0, 0), c(1, 0, 0), xf), x10 = lerp(c(0, 1, 0), c(1, 1, 0), xf);
  const x01 = lerp(c(0, 0, 1), c(1, 0, 1), xf), x11 = lerp(c(0, 1, 1), c(1, 1, 1), xf);
  return lerp(lerp(x00, x10, yf), lerp(x01, x11, yf), zf) * 2 - 1;
}
export function fbm3(x, y, z, oct = 4) {
  let a = 0.5, f = 1, s = 0;
  for (let i = 0; i < oct; i++) { s += a * noise3(x * f, y * f, z * f); f *= 2.03; a *= 0.5; }
  return s;
}

// Générateur pseudo-aléatoire reproductible.
export function rng(seed = 1) {
  let s = seed >>> 0 || 1;
  return () => { s ^= s << 13; s ^= s >>> 17; s ^= s << 5; return ((s >>> 0) % 1e9) / 1e9; };
}

/**
 * Sphère sculptée : chaque sommet (direction unitaire d) est déplacé par fn(d) -> Vector3.
 * Donne des corps lisses (poire, haricot, cœur…) sans facettes.
 */
export function sculpt(fn, wSeg = 192, hSeg = 144) { // maillage fin : silhouettes lisses, pas de facettes
  const g = new THREE.SphereGeometry(1, wSeg, hSeg);
  const p = g.attributes.position;
  const d = new THREE.Vector3();
  for (let i = 0; i < p.count; i++) {
    d.fromBufferAttribute(p, i).normalize();
    const v = fn(d.clone());
    p.setXYZ(i, v.x, v.y, v.z);
  }
  const m = mergeVertices(g.deleteAttribute('normal').deleteAttribute('uv') && g, 1e-5);
  m.computeVertexNormals();
  // UV sphériques simples (utiles pour les textures procédurales)
  const pos = m.attributes.position, uv = new Float32Array(pos.count * 2);
  for (let i = 0; i < pos.count; i++) {
    d.fromBufferAttribute(pos, i).normalize();
    uv[i * 2] = 0.5 + Math.atan2(d.x, d.z) / TAU; uv[i * 2 + 1] = 0.5 + Math.asin(clamp(d.y, -1, 1)) / Math.PI;
  }
  m.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
  return m;
}

/**
 * Corps « mascotte » : ellipsoïde avec ventre plus large en bas, aplati à l'arrière.
 * opts: { w, h, d, belly (élargissement bas), top (rétrécissement haut), lean }
 */
export function blobBody({ w = 0.5, h = 0.6, d = 0.45, belly = 0.18, top = 0.12, flatBack = 0.1, lumps = 0, lumpScale = 3, seed = 0 } = {}) {
  return sculpt((n) => {
    const y = n.y;
    const widen = 1 + belly * smooth(clamp(-y * 0.9 + 0.2)) - top * smooth(clamp(y));
    let x = n.x * w * widen, z = n.z * d * widen;
    if (n.z < 0) z *= 1 - flatBack;
    let yy = y * h;
    if (y < -0.6) yy = -h * 0.6 + (y + 0.6) * h * 0.75; // base un peu aplatie (tient debout)
    const v = new THREE.Vector3(x, yy, z);
    if (lumps) { const k = fbm3(n.x * lumpScale + seed, n.y * lumpScale, n.z * lumpScale, 3); v.multiplyScalar(1 + k * lumps); }
    return v;
  });
}

/** Tube lisse le long d'une courbe, rayon variable radiusAt(t), extrémités arrondies. */
export function varTube(curve, radiusAt, tubular = 96, radial = 32, caps = true) {
  const frames = curve.computeFrenetFrames(tubular, false);
  const verts = [], norms = [], uvs = [], idx = [];
  const P = new THREE.Vector3(), N = new THREE.Vector3();
  const ring = (i, t) => {
    curve.getPointAt(t, P);
    const r = Math.max(1e-4, radiusAt(t));
    for (let j = 0; j <= radial; j++) {
      const a = (j / radial) * TAU;
      N.copy(frames.normals[i]).multiplyScalar(Math.cos(a)).addScaledVector(frames.binormals[i], Math.sin(a)).normalize();
      verts.push(P.x + N.x * r, P.y + N.y * r, P.z + N.z * r); norms.push(N.x, N.y, N.z); uvs.push(j / radial, t);
    }
  };
  for (let i = 0; i <= tubular; i++) ring(i, i / tubular);
  for (let i = 0; i < tubular; i++) for (let j = 0; j < radial; j++) {
    const a = i * (radial + 1) + j, b = a + radial + 1;
    idx.push(a, b, a + 1, b, b + 1, a + 1);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(verts, 3));
  g.setAttribute('normal', new THREE.Float32BufferAttribute(norms, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
  g.setIndex(idx);
  if (!caps) return g;
  const group = [g];
  for (const end of [0, 1]) {
    const r = Math.max(1e-4, radiusAt(end));
    const cap = new THREE.SphereGeometry(r, radial, Math.max(8, radial / 2));
    const p = curve.getPointAt(end);
    cap.translate(p.x, p.y, p.z);
    group.push(cap);
  }
  return mergeGeoms(group);
}

export function mergeGeoms(list) {
  // Fusion simple de géométries indexées (position / normal / uv).
  let vCount = 0; const pos = [], nor = [], uv = [], idx = [];
  for (let g of list) {
    if (!g.index) g = g.toNonIndexed();
    const p = g.attributes.position, n = g.attributes.normal, u = g.attributes.uv;
    for (let i = 0; i < p.count; i++) {
      pos.push(p.getX(i), p.getY(i), p.getZ(i));
      nor.push(n ? n.getX(i) : 0, n ? n.getY(i) : 1, n ? n.getZ(i) : 0);
      uv.push(u ? u.getX(i) : 0, u ? u.getY(i) : 0);
    }
    if (g.index) for (let i = 0; i < g.index.count; i++) idx.push(g.index.getX(i) + vCount);
    else for (let i = 0; i < p.count; i++) idx.push(i + vCount);
    vCount += p.count;
  }
  const out = new THREE.BufferGeometry();
  out.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  out.setAttribute('normal', new THREE.Float32BufferAttribute(nor, 3));
  out.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  out.setIndex(idx);
  return out;
}

export function roundedBox(w, h, d, r, seg = 6) { return new RoundedBoxGeometry(w, h, d, seg, r); }

/**
 * Membre souple (bras/jambe « nouille ») : SkinnedMesh le long de Y négatif, n os.
 * Renvoie { mesh, bones, root, tip, length }. tip = Object3D au bout (pour la main / le pied).
 */
export function noodleLimb(length, rStart, rEnd, material, nBones = 4, radial = 20) {
  const segs = 40;
  const geo = new THREE.CylinderGeometry(1, 1, length, radial, segs, true);
  geo.translate(0, -length / 2, 0);
  const p = geo.attributes.position;
  const skinIndex = [], skinWeight = [];
  const seg = length / nBones;
  for (let i = 0; i < p.count; i++) {
    const y = -p.getY(i);
    const t = y / length;
    const r = lerp(rStart, rEnd, t) * (1 + 0.06 * Math.sin(t * Math.PI));
    const x = p.getX(i), z = p.getZ(i);
    p.setXYZ(i, x * r, -y, z * r);
    // chaque sommet est partagé entre l'os du début et l'os de la fin de son segment (l'os du bout existe : index nBones)
    const f = clamp(y / seg, 0, nBones);
    const b0 = Math.min(nBones - 1, Math.floor(f)), w1 = f - b0;
    skinIndex.push(b0, b0 + 1, 0, 0); skinWeight.push(1 - w1, w1, 0, 0);
  }
  geo.computeVertexNormals();
  geo.setAttribute('skinIndex', new THREE.Uint16BufferAttribute(skinIndex, 4));
  geo.setAttribute('skinWeight', new THREE.Float32BufferAttribute(skinWeight, 4));
  const bones = [];
  let parent = null;
  for (let i = 0; i <= nBones; i++) {
    const b = new THREE.Bone();
    b.position.y = i === 0 ? 0 : -seg;
    if (parent) parent.add(b);
    bones.push(b); parent = b;
  }
  const mesh = new THREE.SkinnedMesh(geo, material);
  mesh.add(bones[0]);
  mesh.updateMatrixWorld(true);
  mesh.bind(new THREE.Skeleton(bones));
  mesh.castShadow = true; mesh.receiveShadow = true;
  mesh.frustumCulled = false;
  // bouchon arrondi à l'épaule
  const capTop = new THREE.Mesh(new THREE.SphereGeometry(rStart, radial, 12), material);
  capTop.castShadow = true; bones[0].add(capTop);
  return { mesh, bones, root: bones[0], tip: bones[nBones], length, segLen: seg };
}

/**
 * Pose un membre souple : swing (avant/arrière, X), raise (écart latéral, Z), bend (courbure totale),
 * twist (Y), bendDir (angle de la direction de courbure autour de l'axe).
 */
export function poseLimb(limb, { swing = 0, raise = 0, bend = 0, twist = 0, bendSide = 0 }) {
  const n = limb.bones.length - 1;
  limb.root.rotation.set(swing, twist, raise, 'YXZ');
  for (let i = 1; i < n; i++) limb.bones[i].rotation.set(bend / (n - 1), 0, bendSide / (n - 1));
  limb.bones[n].rotation.set(0, 0, 0);
}

/** Projette une géométrie plane (XY) sur une surface décrite par surfaceZ(x,y). */
export function projectOnSurface(geo, surfaceZ, offset = 0.004) {
  const p = geo.attributes.position;
  for (let i = 0; i < p.count; i++) {
    const x = p.getX(i), y = p.getY(i);
    p.setZ(i, surfaceZ(x, y) + offset);
  }
  p.needsUpdate = true; geo.computeVertexNormals();
  return geo;
}

/** Courbe de chaînette (guirlandes) entre deux points. */
export function catenary(a, b, sag = 0.5, n = 32) {
  const pts = [];
  for (let i = 0; i <= n; i++) {
    const t = i / n;
    const p = new THREE.Vector3().lerpVectors(a, b, t);
    p.y -= sag * 4 * t * (1 - t);
    pts.push(p);
  }
  return pts;
}

/** Trouve la profondeur d'une surface sculptée en (x,y) par lancer de rayon (pour poser yeux/bouche). */
export function surfaceDepthFn(geometry, zFront = 5) {
  const ray = new THREE.Raycaster();
  const cache = new Map();
  const mesh = new THREE.Mesh(geometry, new THREE.MeshBasicMaterial({ side: THREE.DoubleSide }));
  mesh.updateMatrixWorld(true);
  return (x, y) => {
    const k = `${x.toFixed(3)},${y.toFixed(3)}`;
    if (cache.has(k)) return cache.get(k);
    // rayon en coordonnées locales du mesh (pas de transformation parente supposée)
    ray.set(new THREE.Vector3(x, y, zFront), new THREE.Vector3(0, 0, -1));
    const hits = ray.intersectObject(mesh, false);
    const z = hits.length ? hits[0].point.z : 0;
    cache.set(k, z); return z;
  };
}
