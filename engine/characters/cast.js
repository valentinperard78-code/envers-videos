// Fabrique de personnages : formes, matériaux et accessoires combinables.
// Les 5 personnages de l'épisode 1 sont des « préréglages » ; toute nouvelle pathologie
// peut créer ses personnages à partir d'un archétype (cœur, virus, globule, artère…).
import * as THREE from 'three';
import { Character } from './character.js';
import { sculpt, blobBody, varTube, roundedBox, clamp, lerp, smooth, TAU, mergeGeoms, rng, fbm3 } from '../core/geo.js';
import * as M from '../core/materials.js';

// ---------------------------------------------------------------- formes de corps
function placeOnGround(geo) {
  geo.computeBoundingBox();
  const b = geo.boundingBox; geo.translate(-(b.min.x + b.max.x) / 2, -b.min.y, -(b.min.z + b.max.z) / 2);
  geo.computeBoundingBox(); return geo.boundingBox;
}

const SHAPES = {
  blob: (o) => blobBody({ w: 0.42 * o.w, h: 0.5 * o.h, d: 0.37 * o.d, belly: 0.22, top: 0.08 }),
  tall: (o) => blobBody({ w: 0.36 * o.w, h: 0.62 * o.h, d: 0.32 * o.d, belly: 0.05, top: -0.12, lumps: o.lumps ?? 0.025, lumpScale: 2.6 }),
  sphere: (o) => sculpt((n) => new THREE.Vector3(n.x * 0.82 * o.w, n.y * 0.8 * o.h, n.z * 0.82 * o.d)),
  cube: (o) => { const g = roundedBox(0.56 * o.w, 0.56 * o.h, 0.54 * o.d, 0.1, 8); return g; },
  // pancréas réaliste : allongé, tête large (à droite) avec son crochet, corps, queue effilée qui remonte ; surface en lobules
  pancreas: (o) => sculpt((n) => {
    const x = n.x; // -1 = queue, +1 = tête
    const k = (x + 1) / 2;
    const r = 0.15 + 0.17 * smooth(clamp((k - 0.15) / 0.75)) + 0.05 * Math.exp(-Math.pow((k - 0.86) * 6, 2));
    const yc = 0.2 * Math.pow(Math.max(0, -x - 0.15), 2); // la queue remonte, crochet de la tête vers le bas
    const lob = 1 + 0.06 * fbm3(n.x * 5.5, n.y * 5.5, n.z * 5.5, 3) + 0.025 * fbm3(n.x * 14, n.y * 14, n.z * 14, 2);
    const ry = n.y < 0 ? Math.max(r, 0.26 * Math.sqrt(Math.max(0, 1 - Math.pow(Math.max(0, -x - 0.2) / 0.8, 2)))) : r * 1.05; // ventre plat pour poser les jambes
    return new THREE.Vector3(x * 0.7 * o.w, (yc + n.y * ry) * o.h * lob, n.z * r * 0.9 * o.d * lob);
  }),
  crystal: (o) => roundedBox(0.58 * o.w, 0.6 * o.h, 0.56 * o.d, 0.035, 4),
  heart: (o) => sculpt((n) => {
    // cœur (organe stylisé) : deux lobes en haut, pointe arrondie en bas
    const y = n.y, x = n.x;
    const lobe = Math.exp(-Math.pow((y - 0.55) * 3, 2)) * 0.18 * (1 - Math.abs(Math.abs(x) - 0.55) * 1.6);
    const taper = 1 - smooth(clamp(-y * 0.9 - 0.05)) * 0.55;
    return new THREE.Vector3(x * 0.55 * taper * o.w, (y * 0.55 + (y > 0.6 && Math.abs(x) < 0.25 ? -(0.25 - Math.abs(x)) * 0.35 : 0) + lobe * 0.2) * o.h, n.z * 0.42 * taper * o.d);
  }),
  disc: (o) => sculpt((n) => {
    // globule rouge : disque biconcave posé debout
    const r = Math.hypot(n.x, n.y);
    const thick = 0.12 + 0.2 * smooth(clamp(r * 1.2)) - 0.05;
    return new THREE.Vector3(n.x * 0.6 * o.w, n.y * 0.6 * o.h, n.z * thick * o.d);
  }),
  capsule: (o) => sculpt((n) => new THREE.Vector3(n.x * 0.3 * o.w, n.y * 0.62 * o.h + Math.sign(n.y) * 0.0, n.z * 0.3 * o.d)),
  virus: (o) => sculpt((n) => { const k = 1 + fbm3(n.x * 3, n.y * 3, n.z * 3, 2) * 0.06; return new THREE.Vector3(n.x * 0.55 * k * o.w, n.y * 0.55 * k * o.h, n.z * 0.55 * k * o.d); }),
  bean: (o) => sculpt((n) => { const bend = -0.18 * Math.cos(n.y * Math.PI * 0.5); return new THREE.Vector3(n.x * 0.36 * o.w + (n.x < 0 ? bend * (1 - Math.abs(n.y)) : 0), n.y * 0.55 * o.h, n.z * 0.3 * o.d); }),
  tube: (o) => sculpt((n) => new THREE.Vector3(n.x * 0.26 * o.w, n.y * 0.75 * o.h, n.z * 0.26 * o.d)),
};

// ---------------------------------------------------------------- matériaux par nom
export function materialFor(kind, color) {
  switch (kind) {
    case 'gold': return M.livingGold();
    case 'membrane': return M.membrane(color);
    case 'sugar': return M.sugar();
    case 'salt': return M.salt(color);
    case 'organ': return M.organ(color);
    case 'organ-lobules': return M.organ(color, { lobules: true });
    case 'organ-smooth': return M.organ(color, { smooth: true, bump: 0.2 });
    case 'metal': return M.metal(color);
    default: return M.skin(color);
  }
}

// ---------------------------------------------------------------- outils de pose d'accessoires
function sampler(geo) {
  const mesh = new THREE.Mesh(geo, new THREE.MeshBasicMaterial({ side: THREE.DoubleSide })); mesh.updateMatrixWorld(true);
  const ray = new THREE.Raycaster();
  const hit = (o, d) => { ray.set(o, d.normalize()); const h = ray.intersectObject(mesh, false); return h.length ? h[0] : null; };
  return {
    front: (x, y) => hit(new THREE.Vector3(x, y, 5), new THREE.Vector3(0, 0, -1)),
    top: (x, z) => hit(new THREE.Vector3(x, 10, z), new THREE.Vector3(0, -1, 0)),
    side: (s, y, z = 0) => hit(new THREE.Vector3(s * 5, y, z), new THREE.Vector3(-s, 0, 0)),
    dir: (o, d) => hit(o, d),
  };
}

// ---------------------------------------------------------------- accessoires
const ACC = {
  bun(ch, ctx) {
    const top = ctx.S.top(0, -0.04); const y = top ? top.point.y : ctx.H;
    const mat = M.livingGold(); mat.normalScale.set(0.3, 0.3);
    const g = new THREE.Group(); g.position.set(0, y - 0.03, -0.05);
    const ball = new THREE.Mesh(new THREE.SphereGeometry(0.13, 48, 32), mat); ball.position.y = 0.1; ball.scale.set(1, 0.92, 1);
    const ring = new THREE.Mesh(new THREE.TorusGeometry(0.115, 0.05, 24, 64), mat); ring.rotation.x = Math.PI / 2; ring.position.y = 0.035;
    const tie = new THREE.Mesh(new THREE.TorusGeometry(0.1, 0.018, 16, 48), M.glossy('#d6247a', 0.25)); tie.rotation.x = Math.PI / 2; tie.position.y = 0.055;
    // mèches enroulées
    for (let i = 0; i < 3; i++) { const sw = new THREE.Mesh(new THREE.TorusGeometry(0.07 + i * 0.02, 0.012, 8, 40, Math.PI * 1.3), mat); sw.position.y = 0.1 + i * 0.015; sw.rotation.set(Math.PI / 2 + 0.3, 0, i * 2); ball.add(sw); sw.position.set(0, 0, 0); }
    [ball, ring, tie].forEach((m) => { m.castShadow = true; g.add(m); });
    ch.bodyPivot.add(g); ctx.headTop = y + 0.22;
  },
  hoops(ch, ctx) {
    const y = ctx.face.eyeY - 0.06;
    for (const s of [1, -1]) {
      const h = ctx.S.side(s, y, 0.02); if (!h) continue;
      const g = new THREE.Group(); g.position.copy(h.point).add(new THREE.Vector3(s * 0.012, 0, 0));
      const stud = new THREE.Mesh(new THREE.SphereGeometry(0.018, 16, 12), M.metal('#ffd56a', 0.15)); g.add(stud);
      const hoop = new THREE.Mesh(new THREE.TorusGeometry(0.075, 0.011, 16, 64), M.metal('#ffcf4d', 0.12));
      hoop.position.y = -0.075; hoop.rotation.y = Math.PI / 2 - s * 0.25; hoop.castShadow = true; g.add(hoop);
      ch.bodyPivot.add(g);
      ch.extras.push((t, st) => { g.rotation.z = Math.sin(t * 3.1 + s) * 0.08 + (st.walk || 0) * Math.sin((st.walkPhase || 0) * 2) * 0.25; });
    }
  },
  sunglasses(ch, ctx, opt = {}) {
    // lunettes de soleil relevées sur la tête
    const onEyes = opt.onEyes;
    const y = onEyes ? ctx.face.eyeY + 0.005 : ctx.face.eyeY + ctx.face.eyeR * 2.6;
    const g = new THREE.Group();
    const lensMat = new THREE.MeshPhysicalMaterial({ color: '#1a0a14', roughness: 0.05, metalness: 0.3, clearcoat: 1, iridescence: 0.8, iridescenceIOR: 1.8, envMapIntensity: 2 });
    const frameMat = M.metal('#ffdf7a', 0.15);
    const ex = ctx.face.eyeX, r = ctx.face.eyeR * 1.35;
    for (const s of [1, -1]) {
      const lens = new THREE.Mesh(new THREE.CylinderGeometry(r, r, 0.012, 48), lensMat);
      lens.rotation.x = Math.PI / 2; lens.scale.set(1.15, 1, 0.85); lens.position.x = s * ex;
      const fr = new THREE.Mesh(new THREE.TorusGeometry(r, 0.012, 12, 48), frameMat); fr.scale.set(1.15, 0.85, 1); fr.position.x = s * ex;
      g.add(lens, fr);
    }
    const bridge = new THREE.Mesh(new THREE.TorusGeometry(ex * 0.35, 0.01, 8, 24, Math.PI), frameMat); bridge.position.y = r * 0.25; g.add(bridge);
    const hz = ctx.S.front(0, y); const z = hz ? hz.point.z : ctx.D / 2;
    g.position.set(0, y, z + 0.03);
    g.rotation.x = onEyes ? 0 : -0.55;
    g.traverse((m) => { if (m.isMesh) m.castShadow = true; });
    ch.facePivot.add(g);
  },
  glasses(ch, ctx) { ACC.sunglasses(ch, ctx, { onEyes: true }); },
  tiara(ch, ctx) {
    const top = ctx.S.top(0, 0.05); const y = top ? top.point.y : ctx.H;
    const g = new THREE.Group(); g.position.set(0, y - 0.06, 0.1); g.rotation.x = -0.25;
    const gold = M.metal('#ffd45e', 0.15), gem = new THREE.MeshPhysicalMaterial({ color: '#ff3d9a', roughness: 0.02, transmission: 0.6, thickness: 0.2, ior: 2.2, clearcoat: 1, emissive: '#ff2a8a', emissiveIntensity: 0.4 });
    const band = new THREE.Mesh(new THREE.TorusGeometry(0.2, 0.014, 12, 64, Math.PI), gold); band.rotation.set(-Math.PI / 2, 0, 0); band.scale.set(1, 0.7, 1); g.add(band);
    for (let i = 0; i < 5; i++) {
      const a = (i / 4) * Math.PI; const h = i === 2 ? 0.13 : (i % 2 ? 0.09 : 0.07);
      const p = new THREE.Mesh(new THREE.ConeGeometry(0.022, h, 4), gold); p.position.set(Math.cos(a) * 0.2, h / 2, Math.sin(a) * 0.14); g.add(p);
      const gm = new THREE.Mesh(new THREE.OctahedronGeometry(i === 2 ? 0.03 : 0.018, 0), gem); gm.position.set(Math.cos(a) * 0.2, h + 0.01, Math.sin(a) * 0.14); g.add(gm);
    }
    g.traverse((m) => { if (m.isMesh) m.castShadow = true; });
    ch.bodyPivot.add(g); ctx.headTop = y + 0.12;
  },
  bow(ch, ctx) {
    const top = ctx.S.top(0.12, 0.05); const y = top ? top.point.y : ctx.H;
    const mat = M.glossy('#ff5fa8', 0.35); mat.sheen = 1; mat.sheenColor = new THREE.Color('#ffc0dd');
    const g = new THREE.Group(); g.position.set(ctx.W * 0.22, y, 0.05); g.rotation.z = -0.35;
    for (const s of [1, -1]) { const l = new THREE.Mesh(new THREE.SphereGeometry(0.075, 32, 24), mat); l.scale.set(1.2, 0.75, 0.45); l.position.x = s * 0.075; l.rotation.z = s * 0.35; g.add(l); }
    const k = new THREE.Mesh(new THREE.SphereGeometry(0.035, 24, 16), mat); g.add(k);
    g.traverse((m) => { if (m.isMesh) m.castShadow = true; });
    ch.bodyPivot.add(g);
  },
  mustache(ch, ctx) {
    // moustache de « daron » : deux mèches charnues qui se rejoignent sous le nez
    const y = ctx.face.mouthY + ctx.face.mouthW * 0.2;
    const mat = M.hair('#4a2e1c'); mat.normalScale.set(0.25, 0.08);
    const g = new THREE.Group();
    for (const s of [1, -1]) {
      for (const [dx, dy, r, sx, rz] of [[0.035, 0.0, 0.05, 1.5, 0.18], [0.085, -0.012, 0.042, 1.35, 0.42], [0.125, -0.03, 0.03, 1.2, 0.75]]) {
        const x = s * dx * (ctx.face.mouthW / 0.3); const yy = y + dy; const h = ctx.S.front(x, yy);
        const m = new THREE.Mesh(new THREE.SphereGeometry(r, 32, 20), mat);
        m.scale.set(sx, 0.62, 0.62); m.rotation.z = -s * rz; m.position.set(x, yy, (h ? h.point.z : 0.3) - r * 0.25);
        m.castShadow = true; g.add(m);
      }
    }
    ch.facePivot.add(g);
  },
  cap(ch, ctx, opt = {}) {
    // casquette ajustée à la forme du personnage : la calotte épouse le haut du corps, visière vers l'avant
    const top = ctx.S.top(0, 0); const y = top ? top.point.y : ctx.H;
    // le bord de la casquette reste au-dessus des sourcils (jamais sur les yeux)
    const yb = Math.min(y - 0.06, Math.max(y - Math.min(0.2, ctx.H * 0.2), ctx.face.eyeY + ctx.face.eyeR * 3.1));
    const side = ctx.S.side(1, yb); const rx = (side ? Math.abs(side.point.x) : ctx.W * 0.42) + 0.012;
    const fr = ctx.S.front(0, yb); const fz = fr ? fr.point.z : rx;
    const mat = M.fabric(opt.color || '#d6262f'); const dark = M.fabric(opt.visor || '#1f1f2b');
    const g = new THREE.Group(); g.position.set(0, yb, 0);
    const dome = new THREE.Mesh(new THREE.SphereGeometry(1, 48, 24, 0, TAU, 0, Math.PI / 2), mat);
    dome.scale.set(rx, (y + 0.035 - yb), Math.max(rx * 0.95, fz + 0.01)); g.add(dome);
    const band = new THREE.Mesh(new THREE.TorusGeometry(1, 0.012, 10, 64), dark); band.rotation.x = Math.PI / 2; band.scale.set(rx, Math.max(rx * 0.95, fz + 0.01), 1); g.add(band);
    const button = new THREE.Mesh(new THREE.SphereGeometry(0.02, 12, 8), mat); button.position.y = y + 0.035 - yb; g.add(button);
    const visor = new THREE.Mesh(new THREE.CylinderGeometry(rx * 0.8, rx * 0.8, 0.03, 48, 1, false, -Math.PI / 2, Math.PI), mat);
    visor.scale.z = 0.8; visor.position.set(0, 0.0, Math.max(rx * 0.95, fz) * 0.88); visor.rotation.x = 0.32; g.add(visor);
    const under = new THREE.Mesh(new THREE.CylinderGeometry(rx * 0.79, rx * 0.79, 0.004, 48, 1, false, -Math.PI / 2, Math.PI), dark);
    under.position.y = -0.017; visor.add(under);
    g.traverse((m) => { if (m.isMesh) m.castShadow = true; }); ch.bodyPivot.add(g);
  },
  tie(ch, ctx) {
    const y = ctx.face.mouthY - 0.14; const h = ctx.S.front(0, y); const z = h ? h.point.z : 0.3;
    const mat = M.glossy('#b3202a', 0.4);
    const knot = new THREE.Mesh(new THREE.SphereGeometry(0.035, 16, 12), mat); knot.scale.set(1, 0.8, 0.5);
    const blade = new THREE.Mesh(new THREE.ConeGeometry(0.05, 0.22, 4), mat); blade.rotation.set(Math.PI, Math.PI / 4, 0.15); blade.scale.z = 0.3; blade.position.set(0.012, -0.12, -0.005);
    const g = new THREE.Group(); g.add(knot, blade); g.position.set(0, y, z + 0.01); g.rotation.z = 0.12; g.rotation.x = -0.15;
    g.traverse((m) => { if (m.isMesh) m.castShadow = true; }); ch.bodyPivot.add(g);
  },
  spikes(ch, ctx, opt = {}) {
    const mat = M.skin(opt.color || '#ff6a3d'), tip = M.glossy(opt.tipColor || '#ffd23d', 0.3);
    const r = rng(3), cy = ctx.H / 2;
    for (let i = 0; i < 26; i++) {
      const d = new THREE.Vector3(r() * 2 - 1, r() * 2 - 1, r() * 2 - 1).normalize();
      if (d.z > 0.55 && Math.abs(d.y) < 0.6) continue; // garde le visage dégagé
      const h = ctx.S.dir(new THREE.Vector3(0, cy, 0).addScaledVector(d, 3), d.clone().negate()); if (!h) continue;
      const s = new THREE.Group(); s.position.copy(h.point); s.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), d);
      const stem = new THREE.Mesh(new THREE.CylinderGeometry(0.015, 0.02, 0.12, 12), mat); stem.position.y = 0.06;
      const ball = new THREE.Mesh(new THREE.SphereGeometry(0.035, 16, 12), tip); ball.position.y = 0.13;
      s.add(stem, ball); ch.bodyPivot.add(s);
    }
  },
  key(ch, ctx) {
    const key = makeKey();
    key.scale.setScalar(1.25);
    key.position.set(0, -0.01, 0.02); key.rotation.set(-0.15, 0.2, 0.0);
    ch.anchors.handR.add(key); ch.anchors.key = key;
    ch.extras.push((t, st) => { key.visible = st.handKey !== 0; });
  },
  sweat(ch, ctx) {
    // gouttes de sueur qui perlent puis glissent (activées par l'état « sweat »)
    const mat = new THREE.MeshPhysicalMaterial({ color: '#cfefff', roughness: 0.02, transmission: 0.9, thickness: 0.05, ior: 1.33, clearcoat: 1, envMapIntensity: 2 });
    const drops = [];
    for (let i = 0; i < 5; i++) {
      const d = new THREE.Mesh(new THREE.SphereGeometry(0.022, 16, 12), mat); d.scale.set(0.8, 1.25, 0.7);
      const x = (i % 2 ? 1 : -1) * (0.08 + i * 0.05), y0 = ctx.face.eyeY + 0.12 - (i % 3) * 0.05;
      drops.push({ d, x, y0, off: i * 0.37 }); ch.facePivot.add(d);
    }
    ch.extras.push((t, st) => {
      const k = st.sweat || 0;
      for (const o of drops) {
        o.d.visible = k > 0.05;
        if (!o.d.visible) continue;
        const u = ((t * 0.35 + o.off) % 1);
        const y = o.y0 - u * 0.28; const h = ctx.S.front(o.x, y);
        o.d.position.set(o.x, y, (h ? h.point.z : 0.3) + 0.01);
        o.d.scale.setScalar(k * (u < 0.15 ? u / 0.15 : 1)); o.d.scale.y *= 1.4;
      }
    });
  },
  sparkles(ch, ctx) {
    // paillettes scintillantes autour (sucre)
    const r = rng(8), N = 26;
    const geo = new THREE.BufferGeometry(), pos = new Float32Array(N * 3), base = [];
    for (let i = 0; i < N; i++) { const d = new THREE.Vector3(r() * 2 - 1, r() * 2 - 1, r() * 2 - 1).normalize(); base.push(d.multiplyScalar(ctx.W * (0.55 + r() * 0.25))); }
    geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    const tex = sparkleTexture();
    const mat = new THREE.PointsMaterial({ size: 0.05, map: tex, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, color: '#fff2fb' });
    const pts = new THREE.Points(geo, mat); pts.frustumCulled = false; ch.bodyPivot.add(pts);
    ch.extras.push((t) => {
      for (let i = 0; i < N; i++) {
        const b = base[i], tw = Math.max(0, Math.sin(t * 3 + i * 1.7));
        pos[i * 3] = b.x * (0.98 + tw * 0.04); pos[i * 3 + 1] = ctx.H * 0.5 + b.y; pos[i * 3 + 2] = b.z;
      }
      geo.attributes.position.needsUpdate = true; mat.size = 0.035 + 0.03 * Math.abs(Math.sin(t * 2.3));
    });
  },
  eyebags(ch, ctx) {
    const mat = M.skin('#d9786a', { sheen: 0.2 });
    for (const e of ch.face.eyes) {
      const bag = new THREE.Mesh(new THREE.TorusGeometry(e.r * 0.85, e.r * 0.12, 10, 32, Math.PI * 0.8), mat);
      bag.rotation.set(0, 0, Math.PI + Math.PI * 0.1); bag.position.set(0, -e.r * 0.25, e.r * 0.55);
      e.group.add(bag);
    }
  },
};

function sparkleTexture() {
  const c = document.createElement('canvas'); c.width = c.height = 64; const g = c.getContext('2d');
  const grd = g.createRadialGradient(32, 32, 0, 32, 32, 32); grd.addColorStop(0, 'rgba(255,255,255,1)'); grd.addColorStop(0.2, 'rgba(255,230,250,0.7)'); grd.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = grd; g.fillRect(0, 0, 64, 64);
  g.fillStyle = 'rgba(255,255,255,0.9)'; g.fillRect(31, 2, 2, 60); g.fillRect(2, 31, 60, 2);
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; return t;
}

/** Grosse clé dorée ornementée. */
export function makeKey() {
  const gold = M.metal('#ffc93c', 0.18);
  const g = new THREE.Group();
  const bow = new THREE.Mesh(new THREE.TorusGeometry(0.055, 0.014, 16, 48), gold); bow.position.y = 0.06; g.add(bow);
  for (let i = 0; i < 4; i++) { const a = i * Math.PI / 2; const l = new THREE.Mesh(new THREE.TorusGeometry(0.022, 0.007, 10, 24), gold); l.position.set(Math.cos(a) * 0.028, 0.06 + Math.sin(a) * 0.028, 0); g.add(l); }
  const gem = new THREE.Mesh(new THREE.OctahedronGeometry(0.018, 1), new THREE.MeshPhysicalMaterial({ color: '#ff2d7a', roughness: 0.02, transmission: 0.5, thickness: 0.1, ior: 2.3, clearcoat: 1, emissive: '#ff1060', emissiveIntensity: 0.6 }));
  gem.position.y = 0.06; g.add(gem);
  const collar = new THREE.Mesh(new THREE.CylinderGeometry(0.018, 0.018, 0.02, 24), gold); collar.position.y = 0.0; g.add(collar);
  const shaft = new THREE.Mesh(new THREE.CylinderGeometry(0.011, 0.011, 0.2, 24), gold); shaft.position.y = -0.1; g.add(shaft);
  const bits = [[-0.17, 0.03], [-0.2, 0.045], [-0.185, 0.02]];
  for (const [y, w] of bits) { const b = new THREE.Mesh(roundedBox(w, 0.022, 0.012, 0.004, 2), gold); b.position.set(w / 2 + 0.005, y, 0); g.add(b); }
  g.traverse((m) => { if (m.isMesh) m.castShadow = true; });
  // tenu par la tige : la clé pointe vers le haut depuis la main
  const holder = new THREE.Group(); g.rotation.z = Math.PI; g.position.y = 0.05; holder.add(g);
  return holder;
}

// ---------------------------------------------------------------- porte de cellule (Cellia)
function addCellDoor(ch, ctx) {
  const R = ctx.R;
  const wood = M.skin('#9a5a2c', { roughness: 0.6, clearcoat: 0.3, sheen: 0.2 });
  const { woodTextures } = ctx.tex;
  const { map, rough } = woodTextures([160, 98, 52], 4, true, 5);
  wood.map = map; wood.roughnessMap = rough; wood.color.set('#ffffff'); wood.normalMap = null;
  const w = 0.42 * ctx.doorScale, h = 0.58 * ctx.doorScale;
  const y0 = 0.1;
  // la membrane recule vers le bas : l'encadrement forme un petit porche qui rentre dans la cellule
  const zAt = (y) => Math.sqrt(Math.max(0.01, R * R - Math.pow(y - ctx.cy, 2))) * ctx.dz;
  const zFront = zAt(Math.min(ctx.cy, y0 + h + 0.05)) + 0.035, zBot = zAt(y0);
  const depth = zFront - zBot + 0.12;
  const door = new THREE.Group(); door.position.set(0, y0, zFront - depth);
  // forme en arche
  const shape = new THREE.Shape();
  shape.moveTo(-w / 2, 0); shape.lineTo(-w / 2, h - w / 2); shape.absarc(0, h - w / 2, w / 2, Math.PI, 0, true); shape.lineTo(w / 2, 0); shape.lineTo(-w / 2, 0);
  const frameShape = new THREE.Shape();
  const fw = w + 0.1, fh = h + 0.05;
  frameShape.moveTo(-fw / 2, 0); frameShape.lineTo(-fw / 2, fh - fw / 2); frameShape.absarc(0, fh - fw / 2, fw / 2, Math.PI, 0, true); frameShape.lineTo(fw / 2, 0); frameShape.lineTo(-fw / 2, 0);
  frameShape.holes.push(new THREE.Path(shape.getPoints(32)));
  const frame = new THREE.Mesh(new THREE.ExtrudeGeometry(frameShape, { depth, bevelEnabled: true, bevelThickness: 0.015, bevelSize: 0.015, bevelSegments: 4, curveSegments: 32 }), M.metal('#e8b53d', 0.3));
  frame.castShadow = true; door.add(frame);
  // intérieur lumineux (visible quand la porte s'ouvre)
  const inside = new THREE.Mesh(new THREE.ShapeGeometry(shape, 32), new THREE.MeshStandardMaterial({ color: '#000', emissive: '#ffb36b', emissiveIntensity: 1.6 }));
  inside.position.z = depth - 0.14; door.add(inside);
  // battant (pivot à gauche)
  const hinge = new THREE.Group(); hinge.position.set(-w / 2, 0, depth - 0.05); door.add(hinge);
  const leafShape = new THREE.Shape(shape.getPoints(32).map((p) => new THREE.Vector2(p.x + w / 2, p.y)));
  const leaf = new THREE.Mesh(new THREE.ExtrudeGeometry(leafShape, { depth: 0.035, bevelEnabled: true, bevelThickness: 0.008, bevelSize: 0.008, bevelSegments: 3, curveSegments: 32 }), wood);
  // UV planaires pour les planches
  const p = leaf.geometry.attributes.position, uv = leaf.geometry.attributes.uv;
  for (let i = 0; i < p.count; i++) uv.setXY(i, p.getX(i) / w, p.getY(i) / h);
  leaf.castShadow = true; hinge.add(leaf);
  // ferrures, poignée, serrure dorée
  const gold = M.metal('#ffcf4a', 0.18);
  for (const yy of [0.12, h - 0.2]) { const band = new THREE.Mesh(roundedBox(w * 0.7, 0.03, 0.012, 0.005, 2), M.metal('#3a2a20', 0.4)); band.position.set(w * 0.35, yy, 0.045); hinge.add(band); }
  const plate = new THREE.Mesh(roundedBox(0.07, 0.12, 0.012, 0.02, 3), gold); plate.position.set(w * 0.82, h * 0.42, 0.05); hinge.add(plate);
  const holeShape = new THREE.Shape(); holeShape.absarc(0, 0.012, 0.012, 0, TAU);
  const hole = new THREE.Mesh(new THREE.ShapeGeometry(holeShape, 16), new THREE.MeshBasicMaterial({ color: '#120808' })); hole.position.set(w * 0.82, h * 0.42 + 0.01, 0.057); hinge.add(hole);
  const slot = new THREE.Mesh(new THREE.PlaneGeometry(0.01, 0.035), new THREE.MeshBasicMaterial({ color: '#120808' })); slot.position.set(w * 0.82, h * 0.42 - 0.015, 0.057); hinge.add(slot);
  const knob = new THREE.Mesh(new THREE.SphereGeometry(0.025, 24, 16), gold); knob.position.set(w * 0.82, h * 0.6, 0.07); hinge.add(knob);
  // petit paillasson
  const mat = new THREE.Mesh(roundedBox(w * 1.1, 0.02, 0.18, 0.01, 2), M.fabric('#c23b6b')); mat.position.set(0, 0.0, depth + 0.1); mat.receiveShadow = true; door.add(mat);
  ch.bodyPivot.add(door);
  // clé de la serrure (apparaît quand Insuline l'insère, puis tourne)
  const lk = new THREE.Group(); lk.position.set(w * 0.82, h * 0.42 + 0.012, 0.06); hinge.add(lk);
  const lkInner = makeKey(); lkInner.scale.setScalar(0.62); lk.add(lkInner); lk.visible = false;
  ch.def.keyhole = [-w / 2 + w * 0.82, y0 + h * 0.42, zFront + 0.02];
  ch.anchors.door = door; ch.anchors.keyhole = plate;
  ch.anchors.doorFront = new THREE.Vector3(0, 0, zFront + 0.32);
  ch.extras.push((t, st) => {
    const v = st.lockKey || 0; lk.visible = v > 0;
    if (v > 0) { const ins = clamp(v), turn = clamp(v - 1); lk.position.z = 0.06 + (1 - smooth(ins)) * 0.2; lkInner.rotation.set(Math.PI / 2, turn * Math.PI / 2, 0); }
  });
  ch.extras.push((t, st) => { hinge.rotation.y = -(st.doorOpen || 0) * 1.9; inside.material.emissiveIntensity = 0.4 + (st.doorOpen || 0) * 2.2; });
}

function addOrganelles(ch, ctx) {
  const R = ctx.R, cy = ctx.cy;
  const nucMat = new THREE.MeshPhysicalMaterial({ color: '#5c1f9e', roughness: 0.25, clearcoat: 1, sheen: 1, sheenColor: '#d08cff', emissive: '#3a0a6e', emissiveIntensity: 0.35, normalMap: M.skin('#000').normalMap, normalScale: new THREE.Vector2(0.3, 0.3) });
  const nucleus = new THREE.Mesh(new THREE.SphereGeometry(R * 0.36, 48, 32), nucMat); nucleus.position.set(R * 0.22, cy + R * 0.05, -R * 0.25);
  const nucleolus = new THREE.Mesh(new THREE.SphereGeometry(R * 0.12, 32, 24), M.glossy('#ff4fd8', 0.2)); nucleolus.position.set(R * 0.06, R * 0.08, R * 0.1); nucleus.add(nucleolus);
  ch.bodyPivot.add(nucleus);
  const r = rng(12);
  const mito = M.organ('#ff8a3d', { smooth: true, bump: 0.2 });
  for (let i = 0; i < 6; i++) {
    const m = new THREE.Mesh(new THREE.CapsuleGeometry(0.035, 0.09, 8, 16), mito);
    const d = new THREE.Vector3(r() * 2 - 1, r() * 2 - 1, -r()).normalize().multiplyScalar(R * (0.45 + r() * 0.3));
    m.position.set(d.x, cy + d.y, d.z); m.rotation.set(r() * 3, r() * 3, r() * 3); ch.bodyPivot.add(m);
  }
  const vesMat = new THREE.MeshPhysicalMaterial({ color: '#4fe3d0', roughness: 0.1, emissive: '#1aa89a', emissiveIntensity: 0.6, clearcoat: 1 });
  for (let i = 0; i < 10; i++) {
    const v = new THREE.Mesh(new THREE.SphereGeometry(0.02 + r() * 0.025, 16, 12), vesMat);
    const d = new THREE.Vector3(r() * 2 - 1, r() * 2 - 1, -r() * 0.8).normalize().multiplyScalar(R * (0.4 + r() * 0.4));
    v.position.set(d.x, cy + d.y, d.z); ch.bodyPivot.add(v);
    ch.extras.push((t) => { v.position.y = cy + d.y + Math.sin(t * 1.3 + i) * 0.02; });
  }
  ch.extras.push((t) => { nucleus.rotation.y = t * 0.2; nucleus.position.y = cy + R * 0.05 + Math.sin(t * 0.9) * 0.015; });
}

// ---------------------------------------------------------------- constructeur générique
/**
 * def: { name, shape, color, material, w,h,d (échelles), face{...}, accessories[], arms, legs, voice… }
 */
export function buildMascot(def, tex) {
  const ch = new Character(def);
  const o = { w: def.w ?? 1, h: def.h ?? 1, d: def.d ?? 1, lumps: def.lumps };
  const mat = def.materialObj || materialFor(def.material, def.color);
  const lidMat = def.lidMaterial ? materialFor(def.lidMaterial, def.lidColor || def.color) : (def.material === 'membrane' ? M.skin(def.lidColor || def.color, { sheen: 0.8 }) : mat);
  const ctx = { tex };
  let geo, box;
  if (def.shape === 'cell') {
    const R = 0.85 * (def.size ?? 1);
    geo = sculpt((n) => new THREE.Vector3(n.x * R, n.y * R * 0.96 + Math.max(0, -n.y - 0.85) * 0.25 * R, n.z * R * 0.97));
    box = placeOnGround(geo);
    Object.assign(ctx, { R, cy: R * 0.96, dz: 0.97, doorScale: def.size ?? 1 });
  } else {
    geo = (SHAPES[def.shape] || SHAPES.blob)(o);
    box = placeOnGround(geo);
  }
  const H = box.max.y, W = box.max.x - box.min.x, D = box.max.z - box.min.z;
  Object.assign(ctx, { H, W, D, S: sampler(geo) });
  const body = new THREE.Mesh(geo, mat); body.castShadow = true; body.receiveShadow = true;
  ch.bodyPivot.add(body); ch.body = body;
  ch.height = H + (def.legs !== false ? (def.legLen ?? 0.17) : 0); ch.radius = Math.max(W, D) / 2;

  // visage (positions relatives à la hauteur du corps)
  const f = { eyeY: 0.66, eyeX: 0.2, eyeR: 0.085, mouthY: 0.4, mouthW: 0.36, ...(def.face || {}) };
  const face = {
    eyeY: H * f.eyeY, eyeX: W * f.eyeX, eyeR: f.eyeR * (def.faceScale ?? 1), mouthY: H * f.mouthY, mouthW: W * f.mouthW,
  };
  ctx.face = face;
  ch.buildFace(geo, {
    eyeY: face.eyeY, eyeX: face.eyeX, eyeR: face.eyeR, iris: f.iris || '#5b3a1e', lashes: !!f.lashes, lidMat,
    browColor: f.browColor || '#2a1a12', browY: face.eyeR * (f.browY ?? 1.5), browThick: face.eyeR * (f.browThick ?? 0.22), browW: face.eyeR * (f.browW ?? 1.8),
    mouthY: face.mouthY, mouthW: face.mouthW, mouthStyle: f.lips || 'line', lipColor: f.lipColor || '#b8233d', lineColor: f.lineColor || '#3d1a10',
    cheeks: f.cheeks ? { x: face.eyeX * 1.25, y: face.eyeY - face.eyeR * 1.9, size: face.eyeR * 0.95, color: f.cheeks === true ? 'rgba(255,90,130,0.55)' : f.cheeks } : null,
    eyeSink: f.eyeSink ?? 0.45,
  });
  ch.def.faceY = face.eyeY + (def.legs !== false ? (def.legLen ?? 0.17) : 0);

  // bras / jambes
  const armMat = def.armMaterial ? materialFor(def.armMaterial, def.armColor || def.color) : (def.material === 'membrane' ? M.skin(def.armColor || def.color, { sheen: 0.8, clearcoat: 0.6 }) : mat);
  if (def.arms !== false) {
    const sy = H * (def.shoulderY ?? 0.42);
    const sh = ctx.S.side(1, sy, 0);
    let sx = (sh ? sh.point.x : W / 2) - 0.032 * (def.limbScale ?? 1) * 1.6, sz = 0;
    if (def.shoulderX) { sx = W * def.shoulderX; const fr = ctx.S.front(sx, sy); sz = fr ? fr.point.z * 0.55 : 0; } // corps très allongé : bras plantés sur l'avant
    const scale = def.limbScale ?? 1;
    ch.buildArms({ shoulderX: sx, shoulderY: sy, shoulderZ: sz, length: (def.armLen ?? 0.36) * scale, r0: 0.032 * scale, r1: 0.026 * scale, handSize: 0.042 * scale, material: armMat });
  }
  if (def.legs !== false) {
    const legMat = def.legMaterial ? materialFor(def.legMaterial, def.legColor || def.color) : armMat;
    ch.buildLegs({ hipX: W * (def.hipX ?? 0.2), length: def.legLen ?? 0.17, r: 0.04 * (def.limbScale ?? 1), material: legMat, footSize: 0.1 * (def.limbScale ?? 1), footColor: def.shoeColor || '#ffffff' });
  }
  if (def.shape === 'cell') { addOrganelles(ch, ctx); if (def.door !== false) addCellDoor(ch, ctx); }
  for (const a of def.accessories || []) { const [name, opt] = Array.isArray(a) ? a : [a, {}]; if (ACC[name]) ACC[name](ch, ctx, opt); }
  ch.headTop = (ctx.headTop ?? H) + (def.legs !== false ? (def.legLen ?? 0.17) : 0);
  ch.ctx = ctx;
  return ch;
}

// ---------------------------------------------------------------- humain (Josh)
// Ado/jeune adulte stylisé façon film d'animation : tête sculptée (pommettes, mâchoire, menton),
// nez modelé, oreilles en conque, mèche, sweat à capuche, jean, baskets.
export function buildHuman(def, tex) {
  const skinMat = M.skin(def.skin || '#e8b090', { roughness: 0.52, sheen: 1, sheenColor: '#ff8f78', sheenRoughness: 0.45, clearcoat: 0.12, clearcoatRoughness: 0.5, normalScale: 0.06, emissive: '#6a1c10', emissiveIntensity: 0.1 });
  const ch = new Character(def);
  const legLen = 0.42;
  const HS = 1.32; // tête un peu plus grande (proportions « film d'animation »)
  // ---- torse (sweat) : épaules arrondies, taille plus fine
  const shirtColor = def.shirt || '#2f7de1';
  const shirt = M.fabric(shirtColor, 0.9); shirt.normalScale.set(0.45, 0.45);
  const torsoGeo = sculpt((n) => {
    const up = smooth(clamp(n.y * 0.5 + 0.5));
    const w = lerp(0.135, 0.178, up) * (n.y > 0.7 ? 1 - (n.y - 0.7) * 1.1 : 1);
    return new THREE.Vector3(n.x * w, n.y * 0.21, n.z * lerp(0.095, 0.11, up) * (n.z < 0 ? 0.92 : 1));
  });
  const tb = placeOnGround(torsoGeo);
  const torso = new THREE.Mesh(torsoGeo, shirt); torso.castShadow = true; torso.receiveShadow = true; ch.bodyPivot.add(torso); ch.body = torso;
  const dark = new THREE.Color(shirtColor).multiplyScalar(0.7);
  const collar = new THREE.Mesh(new THREE.TorusGeometry(0.058, 0.016, 12, 40), M.fabric('#' + dark.getHexString(), 0.8)); collar.rotation.x = Math.PI / 2; collar.position.y = tb.max.y - 0.012; ch.bodyPivot.add(collar);
  const pocket = new THREE.Mesh(roundedBox(0.16, 0.06, 0.02, 0.01, 3), M.fabric('#' + dark.getHexString(), 0.8)); pocket.position.set(0, tb.max.y * 0.28, 0.1); pocket.rotation.x = -0.12; ch.bodyPivot.add(pocket);
  for (const sx of [-1, 1]) { const cord = new THREE.Mesh(new THREE.CylinderGeometry(0.004, 0.004, 0.09, 8), M.skin('#f4f4f4')); cord.position.set(sx * 0.022, tb.max.y - 0.065, 0.098); cord.rotation.x = 0.15; ch.bodyPivot.add(cord); }
  // ---- cou + tête
  const neck = new THREE.Mesh(new THREE.CylinderGeometry(0.045, 0.05, 0.05, 24), skinMat); neck.position.y = tb.max.y + 0.005; ch.bodyPivot.add(neck);
  const head = new THREE.Group(); head.position.y = tb.max.y + 0.005; head.scale.setScalar(HS); ch.bodyPivot.add(head);
  const headGeo = sculpt((n) => {
    const low = smooth(clamp(-n.y * 1.1));             // bas du visage
    const jaw = 1 - 0.3 * low;                          // la mâchoire s'affine
    const cheek = 1 + 0.07 * Math.exp(-Math.pow((n.y + 0.1) * 4, 2)) * smooth(clamp(n.z + 0.2)); // pommettes
    const back = n.z < 0 ? 1.04 : 1;                    // arrière du crâne
    const chin = 0.012 * smooth(clamp((n.z - 0.3) * 3)) * smooth(clamp((-n.y - 0.45) * 3));
    return new THREE.Vector3(n.x * 0.105 * jaw * cheek, n.y * 0.125 + (n.y > 0 ? n.y * n.y * 0.012 : 0), n.z * 0.108 * back * (1 - 0.12 * low) + chin);
  }, 128, 96);
  const hb = placeOnGround(headGeo);
  const headMesh = new THREE.Mesh(headGeo, skinMat); headMesh.castShadow = true; headMesh.receiveShadow = true; head.add(headMesh);
  ch.facePivot = head;
  const S = sampler(headGeo);
  const H = hb.max.y;
  ch.buildFace(headGeo, { eyeY: H * 0.53, eyeX: 0.043, eyeR: 0.026, iris: def.iris || '#5a7fb0', lidMat: skinMat, browColor: def.hairColor || '#3b2414', browY: 0.026 * 1.55, browThick: 0.0075, browW: 0.052,
    mouthY: H * 0.24, mouthW: 0.085, mouthStyle: 'line', lineColor: '#8c3a32', cheeks: { x: 0.062, y: H * 0.36, size: 0.022, color: 'rgba(235,105,95,0.32)' }, eyeSink: 0.5 });
  // nez modelé (arête + bout + narines)
  const nz = S.front(0, H * 0.38);
  const nose = new THREE.Group(); nose.position.set(0, H * 0.4, (nz ? nz.point.z : 0.1) - 0.012); head.add(nose);
  const bridge = new THREE.Mesh(new THREE.SphereGeometry(0.014, 24, 16), skinMat); bridge.scale.set(0.8, 2.1, 1); bridge.position.set(0, 0.012, 0); bridge.rotation.x = -0.35; nose.add(bridge);
  const tip = new THREE.Mesh(new THREE.SphereGeometry(0.016, 24, 16), skinMat); tip.position.set(0, -0.012, 0.014); nose.add(tip);
  for (const sx of [-1, 1]) { const al = new THREE.Mesh(new THREE.SphereGeometry(0.01, 16, 12), skinMat); al.position.set(sx * 0.013, -0.016, 0.006); nose.add(al); }
  nose.traverse((m) => { if (m.isMesh) m.castShadow = true; });
  // oreilles en conque
  for (const s2 of [1, -1]) {
    const e = S.side(s2, H * 0.47, -0.005);
    const ear = new THREE.Group(); if (e) ear.position.copy(e.point); ear.rotation.y = s2 * 0.35; head.add(ear);
    const lobe = new THREE.Mesh(new THREE.SphereGeometry(0.022, 24, 16), skinMat); lobe.scale.set(0.38, 1.25, 0.8); ear.add(lobe);
    const rim = new THREE.Mesh(new THREE.TorusGeometry(0.017, 0.0055, 10, 24, Math.PI * 1.4), skinMat); rim.rotation.set(0, s2 * Math.PI / 2, Math.PI * 0.35); rim.position.x = s2 * 0.006; ear.add(rim);
  }
  // cheveux : coque + mèches volumineuses balayées sur le côté
  const hairMat = M.hair(def.hairColor || '#3b2414');
  const hairGeo = sculpt((n) => {
    const face = smooth(clamp((n.z - 0.02) * 2.6)) * smooth(clamp((0.58 - n.y + Math.sin(n.x * 12) * 0.04) * 5));
    const low = smooth(clamp((-0.12 - n.y) * 4));
    const mask = Math.max(face, low * smooth(clamp((n.z + 0.35) * 2)), low * 0.8);
    const tuft = 1 + 0.06 * Math.max(0, Math.sin(n.x * 13 + n.z * 6) * Math.sin(n.z * 10 - n.y * 5)) * (1 - mask);
    const k = lerp(1.1, 0.86, mask) * tuft;
    return new THREE.Vector3(n.x * 0.105 * k, n.y * 0.125 * k + (n.y > 0.3 ? 0.01 : 0), n.z * 0.11 * k);
  }, 128, 96);
  hairGeo.translate(0, H / 2, 0);
  const hairMesh = new THREE.Mesh(hairGeo, hairMat); hairMesh.castShadow = true; head.add(hairMesh);
  const r = rng(11);
  // mèche avant « coiffée-décoiffée » : quelques volumes qui se fondent dans la coque
  for (let i = 0; i < 6; i++) {
    const a = -0.55 + i * 0.22;
    const lock = new THREE.Mesh(new THREE.SphereGeometry(0.042, 24, 16), hairMat);
    lock.scale.set(0.95, 0.55, 1.25 + r() * 0.25);
    lock.position.set(Math.sin(a) * 0.06 - 0.008, H * 0.9 + Math.cos(a * 2) * 0.008, Math.cos(a) * 0.04 - 0.012);
    lock.rotation.set(-0.35 - r() * 0.15, a * 0.5 + 0.45, 0.3 + r() * 0.1);
    lock.castShadow = true; head.add(lock);
  }
  ch.headPivot = head;
  // ---- bras (manches) + jambes (jean) + baskets
  ch.buildArms({ shoulderX: 0.15, shoulderY: tb.max.y - 0.055, length: 0.36, r0: 0.04, r1: 0.031, handSize: 0.03, material: shirt, handMaterial: skinMat });
  const jean = M.fabric(def.pants || '#2c4566', 0.5); jean.normalScale.set(0.6, 0.6);
  ch.buildLegs({ hipX: 0.065, length: legLen, r: 0.048, material: jean, footSize: 0.095, footColor: '#f5f5f5' });
  for (const L of Object.values(ch.legs)) {
    const sole = new THREE.Mesh(new THREE.CylinderGeometry(0.075, 0.08, 0.02, 32), M.skin('#e04b4b', { roughness: 0.6 })); sole.scale.set(0.75, 1, 1.25); sole.position.set(0, -0.035, 0.03); L.shoe.add(sole);
  }
  // hanches (raccord jean / sweat)
  const hips = new THREE.Mesh(new THREE.SphereGeometry(0.12, 32, 16, 0, Math.PI * 2, 0, Math.PI / 2), jean); hips.rotation.x = Math.PI; hips.scale.set(1.12, 0.6, 0.88); hips.position.y = legLen + 0.06; ch.mover.add(hips);
  ch.bodyPivot.position.y = legLen;
  ch.height = legLen + tb.max.y + 0.005 + H * HS; ch.radius = 0.22;
  ch.def.faceY = legLen + tb.max.y + 0.005 + H * 0.53 * HS;
  ch.headTop = legLen + tb.max.y + 0.005 + (H + 0.03) * HS;
  ch.extras.push((t, st, emo) => { head.rotation.x = (st.headNod || 0) + Math.sin(t * 6.3) * (st.talk || 0) * 0.04 - emo.droop * 0.3; head.rotation.z = Math.sin(t * 0.9) * 0.03 + (st.tilt || 0); });
  return ch;
}

// ---------------------------------------------------------------- préréglages de l'épisode 1
export const PRESETS = {
  insuline: {
    name: 'Insuline', role: "celle qui a les clés", shape: 'blob', material: 'gold', color: '#f7c14a', h: 1.05, w: 1, d: 1,
    face: { eyeY: 0.6, eyeX: 0.22, eyeR: 0.088, iris: '#7a3f12', lashes: true, lips: 'full', lipColor: '#a3123c', browColor: '#3b1d0a', mouthY: 0.33, mouthW: 0.38, cheeks: 'rgba(255,110,90,0.35)' },
    accessories: ['bun', 'hoops', 'sunglasses', 'key', 'sweat'], shoeColor: '#ff3d8b', voice: 'insuline', color2: '#ffcf4d', gender: 'f',
  },
  cellia: {
    name: 'Cellia', role: 'la cellule, reine de la villa', shape: 'cell', material: 'membrane', color: '#a35cff', lidColor: '#9a52f0', armColor: '#9a52f0',
    face: { eyeY: 0.7, eyeX: 0.15, eyeR: 0.095, iris: '#1f9e6a', lashes: true, lips: 'full', lipColor: '#d6338a', browColor: '#3a0f52', mouthY: 0.53, mouthW: 0.22, eyeSink: 0.55 },
    accessories: ['tiara'], legs: false, shoulderY: 0.48, armLen: 0.42, voice: 'cellia', gender: 'f',
  },
  sucrette: {
    name: 'Sucrette', role: 'le glucose', shape: 'cube', material: 'sugar', color: '#ffffff', w: 1, h: 1, d: 1,
    face: { eyeY: 0.6, eyeX: 0.2, eyeR: 0.085, iris: '#3b8be0', lashes: true, lips: 'line', lineColor: '#7a2a3a', browColor: '#a86a4a', mouthY: 0.33, mouthW: 0.36, cheeks: true, eyeSink: 0.5 },
    accessories: ['bow', 'sparkles'], legMaterial: 'skin', legColor: '#f7f2fa', armMaterial: 'skin', armColor: '#f7f2fa', shoeColor: '#ff6fb0', legLen: 0.15, limbScale: 0.85, voice: 'sucrette', gender: 'f',
  },
  pancho: {
    name: 'Pancho', role: 'le pancréas', shape: 'pancreas', material: 'organ-lobules', color: '#f2a58e', w: 1.05, h: 1.55, d: 1,
    face: { eyeY: 0.63, eyeX: 0.115, eyeR: 0.092, iris: '#5a3420', lips: 'line', lineColor: '#5a1a14', browColor: '#4a2e1c', browThick: 0.32, mouthY: 0.33, mouthW: 0.3 },
    accessories: ['mustache', 'sweat', 'eyebags'], shoeColor: '#3a3a3a', voice: 'pancho', gender: 'm', lumps: 0.02, shoulderX: 0.24, shoulderY: 0.45, hipX: 0.12, legLen: 0.2,
  },
  josh: { name: 'Josh', role: "l'humain", human: true, shirt: '#2f7de1', hairColor: '#3b2414', skin: '#f0c2a0', voice: 'josh', gender: 'm' },
};

/** Construit un personnage depuis un préréglage ou une définition libre. */
export function createCharacter(def, tex) {
  const d = { ...def };
  d.phase = d.phase ?? (Array.from(d.name || 'x').reduce((a, c) => a + c.charCodeAt(0), 0) % 100) / 10;
  return d.human ? buildHuman(d, tex) : buildMascot(d, tex);
}
