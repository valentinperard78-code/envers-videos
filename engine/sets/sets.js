// Décors : villa de nuit, confessionnal, circulation sanguine, cuisine, plateau neutre.
// Chaque décor fournit : group, lights, environnement (reflets), réglages d'image, repères de mise en scène.
import * as THREE from 'three';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import { roundedBox, rng, sculpt, TAU, clamp, varTube } from '../core/geo.js';
import * as M from '../core/materials.js';
import { woodTextures, tileTexture, waterNormal, grassTexture, nightSky, vesselTextures, skinNormal, makeCanvas } from '../core/textures.js';
import { palmTree, stringLights, sofa, lounger, plantPot, lantern, neonText, neonHeart, redCellGeometry, crowdSugar } from './props.js';

function shadowLight(light, size, res, near = 0.5, far = 40) {
  light.castShadow = true;
  light.shadow.mapSize.set(res, res);
  const c = light.shadow.camera;
  if (c.isOrthographicCamera) Object.assign(c, { left: -size, right: size, top: size, bottom: -size, near, far });
  else { c.near = near; c.far = far; }
  light.shadow.bias = -0.0002; light.shadow.normalBias = 0.025; light.shadow.radius = 5; light.shadow.blurSamples = 16;
  return light;
}

function envFromPanels(panels, bg = '#05060c') {
  // Petite scène d'environnement : boîte sombre + panneaux lumineux colorés -> reflets cohérents.
  const s = new THREE.Scene();
  s.background = new THREE.Color(bg);
  const room = new THREE.Mesh(new THREE.BoxGeometry(20, 12, 20), new THREE.MeshBasicMaterial({ color: bg, side: THREE.BackSide }));
  room.position.y = 4; s.add(room);
  for (const p of panels) {
    const m = new THREE.Mesh(new THREE.PlaneGeometry(p.w, p.h), new THREE.MeshBasicMaterial({ color: new THREE.Color(p.color).multiplyScalar(p.i ?? 4), side: THREE.DoubleSide }));
    m.position.set(...p.pos); m.lookAt(0, 1, 0); s.add(m);
  }
  return s;
}

// ============================================================== VILLA DE NUIT
export function villaSet(quality) {
  const g = new THREE.Group(); g.name = 'villa';
  const upd = [];
  // terrasse en bois
  const { map, rough } = woodTextures([150, 104, 70], 10, false, 9);
  map.repeat.set(4, 4); rough.repeat.set(4, 4);
  const deck = new THREE.Mesh(new THREE.PlaneGeometry(30, 30), new THREE.MeshPhysicalMaterial({ map, roughnessMap: rough, roughness: 0.75, clearcoat: 0.25, clearcoatRoughness: 0.4 }));
  deck.rotation.x = -Math.PI / 2; deck.receiveShadow = true; g.add(deck);
  // piscine (derrière les candidats)
  const poolW = 7, poolD = 3.4, pz = -4.6;
  const coping = M.skin('#efe9dd', { roughness: 0.65, clearcoat: 0.1, sheen: 0.1 });
  for (const [w, d, x, z] of [[poolW + 0.6, 0.3, 0, pz + poolD / 2 + 0.15], [poolW + 0.6, 0.3, 0, pz - poolD / 2 - 0.15], [0.3, poolD, -poolW / 2 - 0.15, pz], [0.3, poolD, poolW / 2 + 0.15, pz]]) {
    const c = new THREE.Mesh(roundedBox(w, 0.1, d, 0.03, 3), coping); c.position.set(x, 0.03, z); c.receiveShadow = true; c.castShadow = true; g.add(c);
  }
  const tiles = tileTexture('#7fd6e6', '#4aa7bb', 10); tiles.repeat.set(6, 2);
  const basinMat = new THREE.MeshStandardMaterial({ map: tiles, roughness: 0.3, emissive: '#1aa7c9', emissiveIntensity: 0.55 });
  const basin = new THREE.Mesh(new THREE.BoxGeometry(poolW, 1.4, poolD), [basinMat, basinMat, basinMat, basinMat, basinMat, basinMat].map((m) => { const c = m.clone(); c.side = THREE.BackSide; return c; }));
  basin.position.set(0, -0.72, pz); g.add(basin);
  const wn = waterNormal(); wn.repeat.set(3, 1.5);
  const water = new THREE.Mesh(new THREE.PlaneGeometry(poolW, poolD, 1, 1), new THREE.MeshPhysicalMaterial({ color: '#28c6e6', roughness: 0.05, transparent: true, opacity: 0.78, normalMap: wn, normalScale: new THREE.Vector2(0.35, 0.35), clearcoat: 1, envMapIntensity: 2.2, emissive: '#0b8fb0', emissiveIntensity: 0.5 }));
  water.rotation.x = -Math.PI / 2; water.position.set(0, -0.06, pz); g.add(water);
  upd.push((t) => { wn.offset.set(t * 0.02, t * 0.013); });
  const poolLight = new THREE.PointLight('#39d6ff', 6, 7, 1.6); poolLight.position.set(0, -0.3, pz); poolLight.userData.optional = true; g.add(poolLight);
  // bouée licorne… version simple : bouée rose
  const ring = new THREE.Mesh(new THREE.TorusGeometry(0.45, 0.17, 24, 48), M.glossy('#ff6fae', 0.25)); ring.rotation.x = -Math.PI / 2; ring.position.set(1.6, 0.02, pz + 0.3); ring.castShadow = true; g.add(ring);
  upd.push((t) => { ring.position.y = 0.0 + Math.sin(t * 1.3) * 0.02; ring.rotation.z = t * 0.05; });
  // pelouse au loin
  const grass = grassTexture(); grass.repeat.set(10, 4);
  const lawn = new THREE.Mesh(new THREE.PlaneGeometry(40, 14), new THREE.MeshStandardMaterial({ map: grass, roughness: 0.95 }));
  lawn.rotation.x = -Math.PI / 2; lawn.position.set(0, 0.005, -13); lawn.receiveShadow = true; g.add(lawn);
  // façade de la villa
  const stucco = M.skin('#f4efe6', { roughness: 0.85, clearcoat: 0, sheen: 0.1, bump: 1.5 });
  const win = new THREE.MeshStandardMaterial({ color: '#2b1a10', emissive: '#ffb066', emissiveIntensity: 1.6, roughness: 0.2 });
  const frame = M.metal('#1d1d22', 0.45);
  const house = new THREE.Group(); house.position.set(0, 0, -11.5); g.add(house);
  const blocks = [[-4.5, 2.2, 6, 4.4, 3], [2.8, 1.6, 7, 3.2, 3.4], [1.5, 4.6, 5, 1.8, 2.6]];
  for (const [x, y, w, h, d] of blocks) { const b = new THREE.Mesh(roundedBox(w, h, d, 0.08, 3), stucco); b.position.set(x, y, 0); b.castShadow = true; b.receiveShadow = true; house.add(b); }
  const windows = [[-5.6, 1.4, 1.4, 2.0], [-3.5, 1.4, 1.4, 2.0], [-4.5, 3.5, 3.8, 0.9], [0.6, 1.2, 2.2, 2.0], [3.2, 1.2, 2.2, 2.0], [5.4, 1.2, 1.2, 2.0], [1.5, 4.6, 3.6, 1.0]];
  for (const [x, y, w, h] of windows) {
    const wm = new THREE.Mesh(new THREE.PlaneGeometry(w, h), win); wm.position.set(x, y, 1.745); house.add(wm);
    const fr = new THREE.Mesh(roundedBox(w + 0.12, h + 0.12, 0.06, 0.02, 2), frame); fr.position.set(x, y, 1.69); house.add(fr);
    const mull = new THREE.Mesh(new THREE.BoxGeometry(0.05, h, 0.04), frame); mull.position.set(x, y, 1.77); house.add(mull);
  }
  const sign = neonText('LA VILLA', '#ff3da8', 0.7); sign.position.set(-4.5, 3.6, 1.8); house.add(sign);
  const signGlow = new THREE.PointLight('#ff3da8', 4, 6, 1.5); signGlow.position.set(-4.5, 3.6, 2.6); signGlow.userData.optional = true; house.add(signGlow);
  // palmiers
  const palms = [[-3.6, -7.4, 4.8, 1, 0.5], [4.4, -7.0, 5.4, 2, -0.6], [-6.5, -2.6, 4.2, 3, 0.7], [6.2, -2.2, 4.6, 4, -0.5], [-1.0, -9.8, 6, 5, 0.3]];
  for (const [x, z, h, s, l] of palms) { const p = palmTree(h, s, l); p.position.set(x, 0, z); g.add(p); upd.push(p.userData.update); }
  // guirlandes au-dessus de la terrasse
  const poles = [[-3.2, 3.2, 1.2], [3.2, 3.2, 1.2], [-3.4, 3.4, -2.8], [3.4, 3.4, -2.8]];
  const poleMat = M.metal('#2a2a2e', 0.5);
  for (const [x, h, z] of poles) { const p = new THREE.Mesh(new THREE.CylinderGeometry(0.04, 0.05, h, 12), poleMat); p.position.set(x, h / 2, z); p.castShadow = true; g.add(p); }
  const v = (x, y, z) => new THREE.Vector3(x, y, z);
  for (const [a, b, sag] of [[v(-3.2, 3.1, 1.2), v(3.2, 3.1, 1.2), 0.7], [v(-3.4, 3.3, -2.8), v(3.4, 3.3, -2.8), 0.8], [v(-3.2, 3.1, 1.2), v(3.4, 3.3, -2.8), 0.6], [v(3.2, 3.1, 1.2), v(-3.4, 3.3, -2.8), 0.6]]) {
    const sl = stringLights(a, b, sag, 18); g.add(sl); upd.push(sl.userData.update);
  }
  // mobilier
  const so = sofa('#e2477c'); so.position.set(-2.6, 0, -1.6); so.rotation.y = 0.5; g.add(so);
  for (const [x, rz] of [[3.0, -0.2], [4.0, -0.25]]) { const l = lounger(); l.position.set(x, 0, -2.2); l.rotation.y = rz; g.add(l); }
  for (const [x, z, s] of [[-4.2, 0.6, 1], [4.6, 0.4, 2], [-1.5, -2.9, 3], [5.2, -3.3, 4]]) { const p = plantPot(s); p.position.set(x, 0, z); g.add(p); }
  for (const [x, z] of [[-5, -4.6], [5, -4.6], [-5, 2.5], [5, 2.5]]) { const l = lantern(); l.position.set(x, 0, z); g.add(l); }
  // ciel
  const sky = nightSky();
  // lune
  const moon = new THREE.Mesh(new THREE.SphereGeometry(1.4, 32, 24), new THREE.MeshBasicMaterial({ color: new THREE.Color('#fff4d8').multiplyScalar(2.2), toneMapped: true }));
  moon.position.set(14, 22, -60); g.add(moon);

  // éclairage
  const lights = new THREE.Group();
  const moonL = shadowLight(new THREE.DirectionalLight('#9fb6ff', 0.9), 9, quality.shadow, 1, 80); moonL.position.set(8, 14, -6); lights.add(moonL);
  const key = shadowLight(new THREE.SpotLight('#ffe0bd', 70, 30, 0.55, 0.85, 1.6), 0, quality.shadow, 1, 30); key.userData.mainShadow = true; key.position.set(-4, 6.5, 8); key.target.position.set(0, 0.8, 0); lights.add(key, key.target);
  const rim = new THREE.SpotLight('#ff5fc8', 45, 25, 0.6, 0.8, 1.6); rim.position.set(5, 4, -6); rim.target.position.set(0, 0.8, 0.3); lights.add(rim, rim.target);
  const rim2 = new THREE.SpotLight('#5fd0ff', 30, 25, 0.6, 0.8, 1.6); rim2.position.set(-6, 3, -6); rim2.target.position.set(0, 0.8, 0.3); rim2.userData.optional = true; lights.add(rim2, rim2.target);
  const warm1 = new THREE.PointLight('#ffc27a', 5, 8, 1.6); warm1.position.set(0, 2.6, 1.0); lights.add(warm1);
  const warm2 = new THREE.PointLight('#ffc27a', 4, 8, 1.6); warm2.position.set(0, 2.8, -2.6); warm2.userData.optional = true; lights.add(warm2);
  lights.add(new THREE.HemisphereLight('#4b5ea8', '#2a1b2e', 0.55));
  g.add(lights);

  const env = envFromPanels([
    { w: 14, h: 1.2, pos: [0, 7, 3], color: '#ffc27a', i: 3 },
    { w: 8, h: 4, pos: [0, -2, -8], color: '#33d1ff', i: 2.2 },
    { w: 5, h: 3, pos: [-8, 3, -2], color: '#ff3da8', i: 2.5 },
    { w: 6, h: 4, pos: [8, 3, 5], color: '#ffe8cc', i: 3 },
    { w: 20, h: 6, pos: [0, 9, -6], color: '#30387a', i: 1.2 },
  ], '#0b0c1c');

  return {
    id: 'villa', group: g, env, envIntensity: 0.9, background: sky, fog: new THREE.FogExp2('#1b1636', 0.02),
    look: { exposure: 1.05, bloom: 0.42, bloomRadius: 0.5, bloomThreshold: 0.88, vignette: 0.35, warm: 0.03, sat: 1.12 },
    // repères de mise en scène
    obstacles: [...poles.map(([x, h, z]) => ({ x, z, r: 0.12 })), ...palms.map(([x, z]) => ({ x, z, r: 0.35 })), { x: -2.6, z: -1.6, r: 1.1 }, { x: 3.0, z: -2.2, r: 0.6 }, { x: 4.0, z: -2.2, r: 0.6 }, { x: -4.2, z: 0.6, r: 0.4 }, { x: 4.6, z: 0.4, r: 0.4 }, { x: -1.5, z: -2.9, r: 0.4 }, { x: -5, z: 2.5, r: 0.15 }, { x: 5, z: 2.5, r: 0.15 }],
    marks: { center: v(0, 0, 0.4), left: v(-1.0, 0, 0.6), right: v(1.0, 0, 0.6), farLeft: v(-1.9, 0, 0.3), farRight: v(1.9, 0, 0.3), back: v(0, 0, -1.2), cellia: v(1.75, 0, -1.25), enterLeft: v(-4.5, 0, 1.2), enterRight: v(4.5, 0, 1.2), sofa: v(-2.3, 0, -0.9) },
    update: (t) => upd.forEach((f) => f(t)),
  };
}

// ============================================================== CONFESSIONNAL
export function confessionalSet(quality) {
  const g = new THREE.Group(); g.name = 'confessional';
  // rideau de velours (plis sinusoïdaux)
  const curGeo = new THREE.PlaneGeometry(6, 4.2, 220, 8);
  const p = curGeo.attributes.position;
  for (let i = 0; i < p.count; i++) { const x = p.getX(i), y = p.getY(i); p.setZ(i, Math.sin(x * 9) * 0.07 + Math.sin(x * 23 + 1) * 0.02 + Math.sin(x * 3.1) * 0.05 * (1 - (y + 2.1) / 4.2)); }
  curGeo.computeVertexNormals();
  const curtain = new THREE.Mesh(curGeo, M.velvet('#a0122e')); curtain.position.set(0, 2.1, -1.4); curtain.receiveShadow = true; g.add(curtain);
  const floor = new THREE.Mesh(new THREE.PlaneGeometry(8, 6), new THREE.MeshPhysicalMaterial({ color: '#1a0d12', roughness: 0.35, clearcoat: 0.6 }));
  floor.rotation.x = -Math.PI / 2; floor.receiveShadow = true; g.add(floor);
  const heart = neonHeart(0.55, '#ff2f8f'); heart.position.set(0.95, 2.05, -1.25); heart.rotation.z = -0.12; g.add(heart);
  const hl = new THREE.PointLight('#ff2f8f', 6, 5, 1.6); hl.position.set(0.95, 2.0, -0.8); g.add(hl);
  // fauteuil capitonné doré
  const chair = new THREE.Group();
  const vel = M.velvet('#f2b5c8'), gold = M.metal('#e6b546', 0.25);
  const back = new THREE.Mesh(sculpt((n) => new THREE.Vector3(n.x * 0.75, n.y * 0.85, n.z * 0.18)), vel); back.position.set(0, 1.25, -0.55); chair.add(back);
  const rim = new THREE.Mesh(new THREE.TorusGeometry(0.78, 0.045, 12, 64), gold); rim.scale.set(1, 1.1, 1); rim.position.set(0, 1.25, -0.5); chair.add(rim);
  const seat = new THREE.Mesh(roundedBox(1.3, 0.25, 0.8, 0.1, 5), vel); seat.position.set(0, 0.42, -0.15); chair.add(seat);
  for (let i = 0; i < 9; i++) { const b = new THREE.Mesh(new THREE.SphereGeometry(0.025, 12, 8), gold); b.position.set(((i % 3) - 1) * 0.35, 1.0 + Math.floor(i / 3) * 0.3, -0.39); chair.add(b); }
  chair.traverse((m) => { if (m.isMesh) { m.castShadow = true; m.receiveShadow = true; } });
  chair.position.set(0, 0, -0.35); g.add(chair);
  // plantes et lampe d'appoint
  const pl = plantPot(7, '#2c1b24'); pl.position.set(-1.35, 0, -0.9); g.add(pl);
  const lamp = lantern('#ffc48a'); lamp.position.set(1.4, 0, -0.9); lamp.scale.setScalar(1.2); g.add(lamp);

  const lights = new THREE.Group();
  const key = shadowLight(new THREE.SpotLight('#ffe6d2', 55, 20, 0.5, 0.9, 1.5), 0, quality.shadow, 0.5, 20); key.userData.mainShadow = true; key.position.set(-2.2, 3.4, 4.2); key.target.position.set(0, 1, 0); lights.add(key, key.target);
  const fill = new THREE.SpotLight('#ffd0e4', 18, 20, 0.6, 1, 1.5); fill.position.set(2.5, 1.8, 3.5); fill.target.position.set(0, 1, 0); fill.userData.optional = true; lights.add(fill, fill.target);
  const rimL = new THREE.SpotLight('#ff4fb0', 40, 10, 0.6, 0.7, 1.4); rimL.position.set(1.6, 2.6, -1.0); rimL.target.position.set(0, 1, 0.4); lights.add(rimL, rimL.target);
  lights.add(new THREE.HemisphereLight('#7a3a5a', '#1a0a10', 0.4));
  g.add(lights);
  const env = envFromPanels([{ w: 6, h: 3, pos: [-4, 4, 6], color: '#ffe6d2', i: 3 }, { w: 3, h: 3, pos: [3, 2, -4], color: '#ff2f8f', i: 4 }, { w: 20, h: 8, pos: [0, 2, -8], color: '#5a0a1e', i: 1.5 }], '#12060a');
  return {
    id: 'confessional', group: g, env, envIntensity: 0.8, background: new THREE.Color('#0d0508'), fog: null,
    look: { exposure: 1.0, bloom: 0.5, bloomRadius: 0.55, bloomThreshold: 0.85, vignette: 0.45, warm: 0.05, sat: 1.1 },
    marks: { center: new THREE.Vector3(0, 0, 0.35) },
    update: (t) => { heart.material.emissiveIntensity = 8.5 + Math.sin(t * 3) * 0.6 + (Math.sin(t * 17) > 0.97 ? -5 : 0); },
  };
}

// ============================================================== DANS LE SANG
export function bloodSet(quality) {
  const g = new THREE.Group(); g.name = 'blood';
  const upd = [];
  const { map, normal } = vesselTextures();
  map.repeat.set(6, 2); normal.repeat.set(6, 2);
  const R = 3.6, L = 60;
  const wall = new THREE.Mesh(new THREE.CylinderGeometry(R, R, L, 96, 40, true), new THREE.MeshPhysicalMaterial({ map, normalMap: normal, normalScale: new THREE.Vector2(0.8, 0.8), roughness: 0.32, clearcoat: 1, clearcoatRoughness: 0.15, side: THREE.BackSide, emissive: '#5a0610', emissiveIntensity: 0.45, sheen: 0.6, sheenColor: '#ff9a9a' }));
  // ondulations douces de la paroi
  const p = wall.geometry.attributes.position;
  for (let i = 0; i < p.count; i++) { const x = p.getX(i), y = p.getY(i), z = p.getZ(i); const k = 1 + Math.sin(y * 0.6 + Math.atan2(z, x) * 3) * 0.04; p.setX(i, x * k); p.setZ(i, z * k); }
  wall.geometry.computeVertexNormals();
  wall.rotation.x = Math.PI / 2; wall.position.set(0, R - 0.25, -L / 2 + 8); wall.receiveShadow = true; g.add(wall);
  // globules rouges qui dérivent
  const rbcGeo = redCellGeometry(0.42);
  const rbcMat = new THREE.MeshPhysicalMaterial({ color: '#d61f2c', roughness: 0.28, clearcoat: 1, clearcoatRoughness: 0.1, sheen: 0.8, sheenColor: '#ff8a8a', emissive: '#5a0008', emissiveIntensity: 0.4, transmission: 0.12, thickness: 0.3 });
  const r = rng(77), cells = [];
  for (let i = 0; i < 34; i++) {
    const m = new THREE.Mesh(rbcGeo, rbcMat); m.castShadow = true;
    const a = r() * TAU, rr = 0.8 + r() * (R - 1.4);
    cells.push({ m, x: Math.cos(a) * rr, y: R - 0.25 + Math.sin(a) * rr, z0: r() * (L - 10), sp: 0.6 + r() * 0.8, rx: r() * 3, ry: r() * 3, s: 0.7 + r() * 0.6 });
    g.add(m);
  }
  upd.push((t) => { for (const c of cells) { let z = ((c.z0 + t * c.sp) % (L - 10)) - L + 8; c.m.position.set(c.x + Math.sin(t * 0.5 + c.rx) * 0.2, Math.max(0.35, c.y + Math.cos(t * 0.4 + c.ry) * 0.2), z); c.m.rotation.set(c.rx + t * 0.3, c.ry + t * 0.2, 0); c.m.scale.setScalar(c.s); } });
  // particules de plasma
  const N = 600, pos = new Float32Array(N * 3), base = [];
  for (let i = 0; i < N; i++) { const a = r() * TAU, rr = r() * (R - 0.4); base.push([Math.cos(a) * rr, R - 0.25 + Math.sin(a) * rr, r() * L, 0.3 + r() * 0.6]); }
  const pg = new THREE.BufferGeometry(); pg.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  const pts = new THREE.Points(pg, new THREE.PointsMaterial({ color: '#ffb0a0', size: 0.035, transparent: true, opacity: 0.7, depthWrite: false, blending: THREE.AdditiveBlending }));
  pts.frustumCulled = false; g.add(pts);
  upd.push((t) => { for (let i = 0; i < N; i++) { const b = base[i]; pos[i * 3] = b[0]; pos[i * 3 + 1] = b[1]; pos[i * 3 + 2] = ((b[2] + t * b[3] * 1.5) % L) - L + 8; } pg.attributes.position.needsUpdate = true; });
  // foule de sucres (visible selon le niveau de glycémie)
  const crowd = [];
  for (let i = 0; i < 24; i++) {
    const s = crowdSugar(i + 3); const a = i * 2.39996, rr = 0.9 + (i / 24) * 2.2;
    const x = Math.cos(a) * rr * 1.2, z = -0.6 - Math.abs(Math.sin(a)) * rr * 1.4 + (i % 3) * 0.3;
    s.position.set(x, 0, z); s.rotation.y = -x * 0.2; s.scale.setScalar(0.85 + (i % 5) * 0.08);
    s.userData = { x, z, ph: i * 0.7 }; crowd.push(s); g.add(s);
  }
  const lights = new THREE.Group();
  const key = shadowLight(new THREE.SpotLight('#ffe2dc', 60, 25, 0.6, 0.9, 1.5), 0, quality.shadow, 0.5, 25); key.userData.mainShadow = true; key.position.set(-2, 4.5, 6); key.target.position.set(0, 0.7, 0); lights.add(key, key.target);
  const red1 = new THREE.PointLight('#ff2a3a', 12, 14, 1.4); red1.position.set(2, 3, -5); lights.add(red1);
  const red2 = new THREE.PointLight('#ff5a6a', 8, 12, 1.4); red2.position.set(-2.5, 1.2, -1.5); red2.userData.optional = true; lights.add(red2);
  const rim = new THREE.SpotLight('#ffd0a0', 30, 15, 0.6, 0.8, 1.4); rim.position.set(3, 3, -3); rim.target.position.set(0, 0.7, 0.4); lights.add(rim, rim.target);
  lights.add(new THREE.HemisphereLight('#ff8a8a', '#3a0008', 0.5));
  g.add(lights);
  const env = envFromPanels([{ w: 12, h: 6, pos: [0, 4, -8], color: '#ff2a3a', i: 2.5 }, { w: 6, h: 3, pos: [-5, 5, 6], color: '#ffe2dc', i: 3 }, { w: 20, h: 4, pos: [0, -3, 0], color: '#5a0008', i: 2 }], '#1a0204');
  return {
    id: 'blood', group: g, env, envIntensity: 0.8, background: new THREE.Color('#3a0610'), fog: new THREE.FogExp2('#3a0610', 0.08),
    look: { exposure: 1.0, bloom: 0.5, bloomRadius: 0.6, bloomThreshold: 0.85, vignette: 0.42, warm: 0.02, sat: 1.15 },
    marks: { center: new THREE.Vector3(0, 0, 0.6), left: new THREE.Vector3(-0.9, 0, 0.7), right: new THREE.Vector3(0.9, 0, 0.7) },
    update: (t, st = {}) => {
      upd.forEach((f) => f(t));
      const n = Math.round((st.crowd ?? 0) * crowd.length);
      crowd.forEach((c, i) => { c.visible = i < n; const u = c.userData; c.position.set(u.x + Math.sin(t * 1.5 + u.ph) * 0.05, Math.abs(Math.sin(t * 3 + u.ph)) * 0.05, u.z); c.rotation.z = Math.sin(t * 2 + u.ph) * 0.08; });
    },
  };
}

// ============================================================== CUISINE (Josh)
export function kitchenSet(quality) {
  const g = new THREE.Group(); g.name = 'kitchen';
  const tiles = tileTexture('#f1ead8', '#bfb39a', 12); tiles.repeat.set(3, 2);
  const wall = new THREE.Mesh(new THREE.PlaneGeometry(8, 4), new THREE.MeshStandardMaterial({ map: tiles, roughness: 0.4 })); wall.position.set(0, 2, -1.6); wall.receiveShadow = true; g.add(wall);
  const { map, rough } = woodTextures([120, 80, 52], 8, false, 4); map.repeat.set(3, 3); rough.repeat.set(3, 3);
  const floor = new THREE.Mesh(new THREE.PlaneGeometry(8, 6), new THREE.MeshStandardMaterial({ map, roughnessMap: rough })); floor.rotation.x = -Math.PI / 2; floor.receiveShadow = true; g.add(floor);
  // fenêtre de nuit
  const winM = new THREE.Mesh(new THREE.PlaneGeometry(1.4, 1.1), new THREE.MeshStandardMaterial({ color: '#000', emissive: '#22306a', emissiveIntensity: 1.2 })); winM.position.set(-1.4, 2.2, -1.58); g.add(winM);
  const wf = new THREE.Mesh(roundedBox(1.52, 1.22, 0.05, 0.02, 2), M.skin('#ffffff', { roughness: 0.4 })); wf.position.set(-1.4, 2.2, -1.6); g.add(wf);
  // table + assiette de pâtes
  const table = new THREE.Group();
  const top = new THREE.Mesh(roundedBox(1.6, 0.06, 0.9, 0.02, 3), M.skin('#c98a52', { roughness: 0.5, clearcoat: 0.5 })); top.position.y = 0.75; table.add(top);
  for (const s of [-1, 1]) for (const z of [-1, 1]) { const l = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.03, 0.75, 12), M.skin('#8a5a32')); l.position.set(s * 0.72, 0.375, z * 0.38); table.add(l); }
  const plate = new THREE.Mesh(new THREE.CylinderGeometry(0.2, 0.15, 0.03, 48), M.skin('#ffffff', { roughness: 0.2, clearcoat: 1 })); plate.position.set(0.15, 0.795, 0.15); table.add(plate);
  const pastaMat = M.skin('#f2cf6b', { roughness: 0.45, clearcoat: 0.6, sheen: 0.4 });
  const r = rng(5);
  for (let i = 0; i < 26; i++) {
    const tor = new THREE.Mesh(new THREE.TorusGeometry(0.03 + r() * 0.06, 0.006, 6, 24, Math.PI * (1 + r())), pastaMat);
    tor.position.set(0.15 + (r() - 0.5) * 0.18, 0.82 + r() * 0.03, 0.15 + (r() - 0.5) * 0.16); tor.rotation.set(Math.PI / 2 + (r() - 0.5) * 0.6, r() * 3, r() * 3); table.add(tor);
  }
  const sauce = new THREE.Mesh(new THREE.SphereGeometry(0.07, 24, 16), M.glossy('#c72a1c', 0.3)); sauce.scale.y = 0.35; sauce.position.set(0.15, 0.84, 0.15); table.add(sauce);
  const fork = new THREE.Mesh(roundedBox(0.02, 0.006, 0.22, 0.003, 2), M.metal('#d8d8d8', 0.2)); fork.position.set(0.38, 0.785, 0.15); table.add(fork);
  table.traverse((m) => { if (m.isMesh) { m.castShadow = true; m.receiveShadow = true; } });
  table.position.set(0, 0, 0.75); g.add(table);
  const lamp = new THREE.Mesh(new THREE.SphereGeometry(0.22, 32, 16, 0, TAU, 0, Math.PI / 2), M.skin('#2f6d5a', { roughness: 0.4, clearcoat: 1 })); lamp.material.side = THREE.DoubleSide; lamp.position.set(0, 2.5, 0.6); g.add(lamp);
  const bulb = new THREE.Mesh(new THREE.SphereGeometry(0.06, 16, 12), new THREE.MeshStandardMaterial({ color: '#000', emissive: '#ffd08a', emissiveIntensity: 8 })); bulb.position.set(0, 2.42, 0.6); g.add(bulb);
  const lights = new THREE.Group();
  const lampL = shadowLight(new THREE.SpotLight('#ffd6a0', 20, 10, 0.9, 0.8, 1.5), 0, quality.shadow, 0.2, 10); lampL.userData.mainShadow = true; lampL.position.set(0, 2.4, 0.6); lampL.target.position.set(0, 0.8, 0.5); lights.add(lampL, lampL.target);
  const key = new THREE.SpotLight('#fff0e0', 16, 15, 0.6, 0.9, 1.5); key.position.set(-2.5, 2.2, 4); key.target.position.set(0, 1, 0); lights.add(key, key.target);
  const rim = new THREE.SpotLight('#6aa0ff', 20, 10, 0.6, 0.8, 1.5); rim.position.set(-1.4, 2.2, -1.4); rim.target.position.set(0, 1.2, 0.4); rim.userData.optional = true; lights.add(rim, rim.target);
  lights.add(new THREE.HemisphereLight('#ffe7c8', '#40281a', 0.35));
  g.add(lights);
  const env = envFromPanels([{ w: 4, h: 2, pos: [0, 6, 1], color: '#ffd6a0', i: 3 }, { w: 3, h: 2, pos: [-4, 3, -3], color: '#4a6ad0', i: 2 }, { w: 20, h: 6, pos: [0, 2, -6], color: '#d8c7a8', i: 1 }], '#1a120c');
  return {
    id: 'kitchen', group: g, env, envIntensity: 0.9, background: new THREE.Color('#14100c'), fog: null,
    look: { exposure: 1.05, bloom: 0.35, bloomRadius: 0.5, bloomThreshold: 0.9, vignette: 0.4, warm: 0.06, sat: 1.08 },
    marks: { center: new THREE.Vector3(0, 0, 0.1) },
    update: () => {},
  };
}

// ============================================================== PLATEAU NEUTRE (portraits, récap)
export function stageSet(quality) {
  const g = new THREE.Group(); g.name = 'stage';
  const floor = new THREE.Mesh(new THREE.CircleGeometry(10, 64), new THREE.MeshPhysicalMaterial({ color: '#2a1f3d', roughness: 0.35, clearcoat: 0.8 }));
  floor.rotation.x = -Math.PI / 2; floor.receiveShadow = true; g.add(floor);
  const ring = new THREE.Mesh(new THREE.TorusGeometry(1.6, 0.03, 8, 96), new THREE.MeshStandardMaterial({ color: '#000', emissive: '#ff3da8', emissiveIntensity: 5 })); ring.rotation.x = -Math.PI / 2; ring.position.y = 0.01; g.add(ring);
  const lights = new THREE.Group();
  const key = shadowLight(new THREE.SpotLight('#fff0e0', 70, 20, 0.5, 0.8, 1.5), 0, quality.shadow, 0.5, 20); key.userData.mainShadow = true; key.position.set(-3, 5, 5); key.target.position.set(0, 0.8, 0); lights.add(key, key.target);
  const rim = new THREE.SpotLight('#b06aff', 50, 15, 0.6, 0.8, 1.5); rim.position.set(3, 3, -4); rim.target.position.set(0, 0.8, 0); lights.add(rim, rim.target);
  lights.add(new THREE.HemisphereLight('#6a5aa8', '#1a1020', 0.6));
  g.add(lights);
  return {
    id: 'stage', group: g, env: new RoomEnvironment(), envIntensity: 0.5, background: new THREE.Color('#120c1c'), fog: new THREE.FogExp2('#120c1c', 0.06),
    look: { exposure: 1.0, bloom: 0.45, bloomRadius: 0.5, bloomThreshold: 0.88, vignette: 0.45, warm: 0.02, sat: 1.1 },
    marks: { center: new THREE.Vector3(0, 0, 0.3), left: new THREE.Vector3(-0.9, 0, 0.4), right: new THREE.Vector3(0.9, 0, 0.4) },
    update: (t) => { ring.material.emissiveIntensity = 4.5 + Math.sin(t * 2) * 0.8; },
  };
}

export const SET_BUILDERS = { villa: villaSet, confessional: confessionalSet, blood: bloodSet, kitchen: kitchenSet, stage: stageSet };
