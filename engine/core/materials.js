// Bibliothèque de matériaux physiques (PBR) pour un rendu « film d'animation ».
import * as THREE from 'three';
import { skinNormal, lobuleNormal, crystalNormal, heightToNormal } from './textures.js';

const C = (c) => new THREE.Color(c);

/** Peau de mascotte : brillante, légère couche de vernis, reflet satiné. */
export function skin(color, opts = {}) {
  const m = new THREE.MeshPhysicalMaterial({
    color: C(color), roughness: opts.roughness ?? 0.42, metalness: opts.metalness ?? 0,
    clearcoat: opts.clearcoat ?? 0.35, clearcoatRoughness: opts.clearcoatRoughness ?? 0.35,
    sheen: opts.sheen ?? 0.6, sheenRoughness: 0.5, sheenColor: C(opts.sheenColor ?? new THREE.Color(color).lerp(C('#ffffff'), 0.5)),
    normalMap: opts.noNormal ? null : skinNormal(opts.bump ?? 0.6, 6), normalScale: new THREE.Vector2(opts.normalScale ?? 0.15, opts.normalScale ?? 0.15),
    iridescence: opts.iridescence ?? 0, iridescenceIOR: 1.6,
    envMapIntensity: opts.env ?? 1,
  });
  if (opts.emissive) { m.emissive = C(opts.emissive); m.emissiveIntensity = opts.emissiveIntensity ?? 0.15; }
  return m;
}

/** Or vivant (Insuline) : métal doré poli + vernis + irisation subtile. */
export function livingGold() {
  return new THREE.MeshPhysicalMaterial({
    color: C('#f7c14a'), metalness: 0.62, roughness: 0.26,
    clearcoat: 1, clearcoatRoughness: 0.08, iridescence: 0.25, iridescenceIOR: 1.7, iridescenceThicknessRange: [200, 500],
    sheen: 0.4, sheenColor: C('#fff1b8'), sheenRoughness: 0.4,
    emissive: C('#7a4a00'), emissiveIntensity: 0.12,
    normalMap: skinNormal(0.5, 5), normalScale: new THREE.Vector2(0.08, 0.08), envMapIntensity: 1.35,
  });
}

/** Membrane de cellule translucide (transmission + irisation). */
export function membrane(color = '#9b4dff', opts = {}) {
  return new THREE.MeshPhysicalMaterial({
    color: C(color), roughness: 0.12, metalness: 0, transmission: opts.transmission ?? 0.72, thickness: opts.thickness ?? 1.4,
    ior: 1.33, attenuationColor: C(opts.attenuation ?? '#6a1fd1'), attenuationDistance: opts.attDist ?? 1.6,
    clearcoat: 1, clearcoatRoughness: 0.05, iridescence: opts.iridescence ?? 0.7, iridescenceIOR: 1.45,
    iridescenceThicknessRange: [100, 700], sheen: 0.5, sheenColor: C('#ffc6ff'),
    normalMap: skinNormal(0.8, 4), normalScale: new THREE.Vector2(0.12, 0.12), envMapIntensity: 1.2,
    specularIntensity: 1,
  });
}

/** Sucre cristallin : blanc nacré, facettes, légère translucidité. */
export function sugar() {
  return new THREE.MeshPhysicalMaterial({
    color: C('#fbf8ff'), roughness: 0.32, metalness: 0, transmission: 0.18, thickness: 0.6, ior: 1.56,
    clearcoat: 0.8, clearcoatRoughness: 0.18, sheen: 0.8, sheenColor: C('#ffd9f2'), sheenRoughness: 0.35,
    normalMap: crystalNormal(), normalScale: new THREE.Vector2(0.16, 0.16), iridescence: 0.35, iridescenceIOR: 1.5,
    envMapIntensity: 1.3, emissive: C('#3a3040'), emissiveIntensity: 0.1,
  });
}

/** Organe humide (pancréas, cœur…) : rosé, lobules, brillance mouillée. */
export function organ(color = '#f08a7a', opts = {}) {
  return new THREE.MeshPhysicalMaterial({
    color: C(color), roughness: 0.38, clearcoat: 0.9, clearcoatRoughness: 0.12,
    sheen: 0.7, sheenColor: C(opts.sheenColor ?? '#ffd0c8'), sheenRoughness: 0.4,
    normalMap: opts.smooth ? skinNormal(0.8, 6) : lobuleNormal(), normalScale: new THREE.Vector2(opts.bump ?? 0.22, opts.bump ?? 0.22),
    emissive: C(color).multiplyScalar(0.25), emissiveIntensity: 0.25, envMapIntensity: 1,
  });
}

export function glossy(color, roughness = 0.2, metalness = 0) {
  return new THREE.MeshPhysicalMaterial({ color: C(color), roughness, metalness, clearcoat: 1, clearcoatRoughness: 0.05 });
}
export function metal(color = '#d9a441', roughness = 0.22) {
  return new THREE.MeshPhysicalMaterial({ color: C(color), metalness: 1, roughness, clearcoat: 0.6, clearcoatRoughness: 0.1, envMapIntensity: 1.5 });
}
export function fabric(color, sheen = 1) {
  return new THREE.MeshPhysicalMaterial({ color: C(color), roughness: 0.85, sheen, sheenColor: C(color).lerp(C('#ffffff'), 0.4), sheenRoughness: 0.6, normalMap: skinNormal(1.5, 24), normalScale: new THREE.Vector2(0.3, 0.3) });
}
export function velvet(color) {
  return new THREE.MeshPhysicalMaterial({ color: C(color), roughness: 0.9, sheen: 1, sheenColor: C(color).lerp(C('#ffb0b0'), 0.55), sheenRoughness: 0.35, normalMap: skinNormal(1.2, 30), normalScale: new THREE.Vector2(0.2, 0.2) });
}
export function emissive(color, intensity = 3) {
  return new THREE.MeshStandardMaterial({ color: C('#000000'), emissive: C(color), emissiveIntensity: intensity, roughness: 1, toneMapped: true });
}
export function glass(color = '#ffffff', opacity = 0.25) {
  return new THREE.MeshPhysicalMaterial({ color: C(color), roughness: 0.02, metalness: 0, transparent: true, opacity, clearcoat: 1, envMapIntensity: 1.6 });
}
export function eyeWhite() {
  return new THREE.MeshPhysicalMaterial({ color: C('#fdfcf8'), roughness: 0.12, clearcoat: 1, clearcoatRoughness: 0.02, sheen: 0.2, emissive: C('#ffffff'), emissiveIntensity: 0.06, envMapIntensity: 1.4 });
}
export function hair(color) {
  // reflets anisotropes simulés : stries fines + vernis
  return new THREE.MeshPhysicalMaterial({ color: C(color), roughness: 0.42, sheen: 1, sheenColor: C(color).lerp(C('#ffd8b0'), 0.55), sheenRoughness: 0.25, clearcoat: 0.45, clearcoatRoughness: 0.3, normalMap: strandNormal(), normalScale: new THREE.Vector2(0.9, 0.9) });
}
let _strand = null;
function strandNormal() {
  if (_strand) return _strand;
  const s = 256, f = new Float32Array(s * s);
  for (let y = 0; y < s; y++) for (let x = 0; x < s; x++) f[y * s + x] = 0.5 + 0.5 * Math.sin(x * 0.9 + Math.sin(y * 0.05) * 6 + Math.sin(x * 0.13) * 3);
  _strand = heightToNormal(f, s, 0.6); _strand.repeat.set(4, 2); return _strand;
}
export function water() {
  return new THREE.MeshPhysicalMaterial({ color: C('#1ec8e8'), roughness: 0.04, metalness: 0, transmission: 0.0, clearcoat: 1, envMapIntensity: 1.8, transparent: true, opacity: 0.86 });
}
