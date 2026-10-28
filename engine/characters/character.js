// Classe de base des personnages : hiérarchie, visage, bras/jambes souples, émotions et poses.
import * as THREE from 'three';
import { noodleLimb, clamp, lerp, smooth, surfaceDepthFn, sculpt, easeInOut } from '../core/geo.js';
import { Eye, Brow, Mouth, blush } from './face.js';
import { Hand } from './hand.js';
import { glossy } from '../core/materials.js';

// Expressions du visage : paramètres cibles (mélangés selon l'intensité).
export const EMOTIONS = {
  neutral: { open: 0.85, lower: 0.12, brow: 0, angry: 0, smile: 0.15, asym: 0, browAsym: 0, droop: 0 },
  happy: { open: 0.9, lower: 0.35, brow: 0.25, angry: -0.1, smile: 0.85, asym: 0, browAsym: 0, droop: 0 },
  excited: { open: 1.05, lower: 0.2, brow: 0.6, angry: -0.2, smile: 1, asym: 0, browAsym: 0, droop: -0.05, mouthBonus: 0.15 },
  sassy: { open: 0.62, lower: 0.22, brow: 0.15, angry: 0.15, smile: 0.4, asym: 0.6, browAsym: 0.8, droop: 0 },
  annoyed: { open: 0.55, lower: 0.25, brow: -0.1, angry: 0.6, smile: -0.45, asym: 0.3, browAsym: 0.3, droop: 0 },
  angry: { open: 0.8, lower: 0.3, brow: -0.2, angry: 1, smile: -0.75, asym: 0, browAsym: 0, droop: 0 },
  sad: { open: 0.65, lower: 0.15, brow: 0.3, angry: -1, smile: -0.65, asym: 0, browAsym: 0, droop: 0.1 },
  tired: { open: 0.42, lower: 0.18, brow: 0.15, angry: -0.6, smile: -0.35, asym: 0, browAsym: 0, droop: 0.25 },
  shocked: { open: 1.15, lower: 0.05, brow: 1, angry: -0.3, smile: -0.2, asym: 0, browAsym: 0, droop: -0.05, round: 0.6, mouthBonus: 0.35 },
  worried: { open: 0.85, lower: 0.15, brow: 0.5, angry: -0.85, smile: -0.35, asym: 0, browAsym: 0, droop: 0.05 },
  proud: { open: 0.58, lower: 0.3, brow: 0.3, angry: 0, smile: 0.55, asym: 0.25, browAsym: 0.4, droop: -0.08 },
  relieved: { open: 0.5, lower: 0.35, brow: 0.2, angry: -0.4, smile: 0.6, asym: 0, browAsym: 0, droop: 0.05 },
  suspicious: { open: 0.45, lower: 0.35, brow: -0.1, angry: 0.4, smile: -0.15, asym: 0.5, browAsym: -0.7, droop: 0 },
};

// Poses des bras (out = écart latéral, fwd = vers l'avant, bend = courbure avant, curl = courbure vers le centre).
export const POSES = {
  idle: { L: { out: 0.24, fwd: 0.08, bend: 0.4, curl: 0.15 }, R: { out: 0.24, fwd: 0.08, bend: 0.4, curl: 0.15 }, hand: ['relaxed', 'relaxed'] },
  hips: { L: { out: 1.0, fwd: -0.1, bend: 0.1, curl: 2.0 }, R: { out: 1.0, fwd: -0.1, bend: 0.1, curl: 2.0 }, hand: ['fist', 'fist'], body: { lean: -0.04 } },
  hip: { L: { out: 1.0, fwd: -0.1, bend: 0.1, curl: 2.0 }, R: { out: 0.24, fwd: 0.08, bend: 0.4, curl: 0.15 }, hand: ['fist', 'relaxed'] },
  cross: { L: { out: 0.55, fwd: 1.05, bend: 0.35, curl: 1.7 }, R: { out: 0.45, fwd: 0.95, bend: 0.35, curl: 1.75 }, hand: ['relaxed', 'relaxed'], body: { lean: -0.05 } },
  shrug: { L: { out: 0.75, fwd: 0.55, bend: 1.0, curl: -0.6, tw: 0.6 }, R: { out: 0.75, fwd: 0.55, bend: 1.0, curl: -0.6, tw: 0.6 }, hand: ['open', 'open'] },
  welcome: { L: { out: 1.05, fwd: 0.6, bend: 0.45, curl: -0.2 }, R: { out: 1.05, fwd: 0.6, bend: 0.45, curl: -0.2 }, hand: ['spread', 'spread'] },
  point: { L: { out: 0.24, fwd: 0.08, bend: 0.4, curl: 0.15 }, R: { out: 0.35, fwd: 1.45, bend: 0.1, curl: 0.1 }, hand: ['relaxed', 'point'] },
  wave: { L: { out: 0.24, fwd: 0.08, bend: 0.4, curl: 0.15 }, R: { out: 1.35, fwd: 0.25, bend: 0.1, curl: -1.3 }, hand: ['relaxed', 'spread'], osc: { R: { curl: [0.35, 6] } } },
  holdKey: { L: { out: 0.6, fwd: -0.1, bend: 0.1, curl: 1.9 }, R: { out: 0.35, fwd: 0.95, bend: 1.0, curl: 0.2 }, hand: ['fist', 'hold'] },
  shakeKey: { L: { out: 0.6, fwd: -0.1, bend: 0.1, curl: 1.9 }, R: { out: 0.4, fwd: 1.1, bend: 1.05, curl: 0.2 }, hand: ['fist', 'hold'], osc: { R: { bend: [0.35, 9], tw: [0.4, 9] } } },
  knock: { L: { out: 0.24, fwd: 0.08, bend: 0.4, curl: 0.15 }, R: { out: 0.25, fwd: 1.2, bend: 0.7, curl: 0.1 }, hand: ['relaxed', 'fist'], osc: { R: { fwd: [0.18, 5] } } },
  droop: { L: { out: 0.1, fwd: -0.02, bend: 0.12, curl: 0.05 }, R: { out: 0.1, fwd: -0.02, bend: 0.12, curl: 0.05 }, hand: ['open', 'open'], body: { lean: 0.12 } },
  celebrate: { L: { out: 2.5, fwd: 0.2, bend: 0.3, curl: -0.3 }, R: { out: 2.5, fwd: 0.2, bend: 0.3, curl: -0.3 }, hand: ['spread', 'spread'], osc: { L: { out: [0.12, 5] }, R: { out: [0.12, 5] } } },
  cheeks: { L: { out: 0.45, fwd: 1.15, bend: 1.9, curl: 0.55 }, R: { out: 0.45, fwd: 1.15, bend: 1.9, curl: 0.55 }, hand: ['open', 'open'] },
  facepalm: { L: { out: 0.24, fwd: 0.08, bend: 0.4, curl: 0.15 }, R: { out: 0.4, fwd: 1.25, bend: 2.0, curl: 0.55 }, hand: ['relaxed', 'open'], body: { lean: 0.08 } },
  wipe: { L: { out: 0.24, fwd: 0.08, bend: 0.4, curl: 0.15 }, R: { out: 0.9, fwd: 0.9, bend: 2.0, curl: 0.4 }, hand: ['relaxed', 'open'], osc: { R: { curl: [0.25, 3] } } },
  selfPoint: { L: { out: 0.24, fwd: 0.08, bend: 0.4, curl: 0.15 }, R: { out: 0.3, fwd: 0.9, bend: 1.4, curl: 1.0 }, hand: ['relaxed', 'point'] },
  gesture: { L: { out: 0.45, fwd: 0.65, bend: 0.8, curl: 0.0 }, R: { out: 0.5, fwd: 0.7, bend: 0.85, curl: 0.0 }, hand: ['open', 'open'] },
  run: { L: { out: 0.35, fwd: 0.2, bend: 1.4, curl: 0.2 }, R: { out: 0.35, fwd: 0.2, bend: 1.4, curl: 0.2 }, hand: ['fist', 'fist'] },
};

const ZERO_ARM = { out: 0, fwd: 0, bend: 0, curl: 0, tw: 0 };
function mixArm(a, b, k) { const o = {}; for (const key of ['out', 'fwd', 'bend', 'curl', 'tw']) o[key] = lerp(a[key] ?? 0, b[key] ?? 0, k); return o; }

export class Character extends THREE.Group {
  constructor(def = {}) {
    super();
    this.def = def;
    this.name = def.name || 'Perso';
    this.mover = new THREE.Group(); this.add(this.mover);
    this.bodyPivot = new THREE.Group(); this.mover.add(this.bodyPivot);
    this.facePivot = this.bodyPivot;
    this.height = 1; this.radius = 0.4; this.legLen = 0;
    this.arms = null; this.legs = null; this.face = null;
    this.extras = []; // fonctions d'animation additionnelles (t, state)
    this.anchors = {}; // points d'intérêt (porte, main…)
  }

  /** Construit le visage sur la surface d'un mesh (coordonnées locales du facePivot). */
  buildFace(surfaceGeo, cfg) {
    const z = surfaceDepthFn(surfaceGeo);
    const {
      eyeY, eyeX, eyeR, iris = '#5b3a1e', lashes = false, lidMat, browColor = '#2a1a12', browW = eyeR * 1.7, browThick = eyeR * 0.22,
      mouthY, mouthW, mouthH, mouthStyle = 'line', lipColor = '#b8233d', lineColor = '#3d1a10', cheeks = null, browY = eyeR * 1.45,
      eyeSink = 0.45, eyeToe = 0.12,
    } = cfg;
    const face = { eyes: [], brows: [], mouth: null, z, cfg };
    for (const side of [1, -1]) {
      const x = side * eyeX;
      const e = new Eye({ r: eyeR, iris, lidMat, lashes, side });
      const sz = z(x, eyeY);
      // normale de surface par différences finies
      const dx = (z(x + 0.01, eyeY) - z(x - 0.01, eyeY)) / 0.02, dy = (z(x, eyeY + 0.01) - z(x, eyeY - 0.01)) / 0.02;
      const n = new THREE.Vector3(-dx, -dy, 1).normalize();
      e.group.position.set(x, eyeY, sz).addScaledVector(n, -eyeR * eyeSink);
      e.group.lookAt(e.group.position.clone().add(n.clone().lerp(new THREE.Vector3(side * eyeToe, 0, 1), 0.5)));
      this.facePivot.add(e.group); face.eyes.push(e);
      const b = new Brow({ w: browW, thick: browThick, color: browColor, side });
      const by = eyeY + browY, bx = x + side * eyeR * 0.1;
      b.base.set(bx, by, z(bx, by) + browThick * 0.6);
      b.group.position.copy(b.base);
      const nb = new THREE.Vector3(-(z(bx + 0.01, by) - z(bx - 0.01, by)) / 0.02, -(z(bx, by + 0.01) - z(bx, by - 0.01)) / 0.02, 1).normalize();
      b.mesh.quaternion.setFromUnitVectors(new THREE.Vector3(0, 0, 1), nb);
      b.scale = eyeR * 2.2;
      this.facePivot.add(b.group); face.brows.push(b);
    }
    face.mouth = new Mouth({ w: mouthW, h: mouthH, surfaceZ: z, center: [0, mouthY], style: mouthStyle, lipColor, lineColor });
    this.facePivot.add(face.mouth.mesh);
    if (cheeks) for (const side of [1, -1]) this.facePivot.add(blush(z, side * cheeks.x, cheeks.y, cheeks.size, cheeks.color));
    this.face = face;
    return face;
  }

  buildArms({ shoulderX, shoulderY, shoulderZ = 0, length, r0, r1, handSize, material, handMaterial }) {
    this.arms = {};
    for (const [key, side] of [['L', 1], ['R', -1]]) {
      const limb = noodleLimb(length, r0, r1, material, 4);
      limb.mesh.position.set(side * shoulderX, shoulderY, shoulderZ);
      this.bodyPivot.add(limb.mesh);
      const hand = new Hand(handSize, handMaterial || material, side);
      hand.group.rotation.y = side * Math.PI / 2 * 0.85; // paume tournée vers le corps
      limb.tip.add(hand.group);
      this.arms[key] = { limb, hand, side };
    }
    this.anchors.handR = this.arms.R.hand.grip;
    this.anchors.handL = this.arms.L.hand.grip;
  }

  buildLegs({ hipX, length, r, footMaterial, material, footSize = 0.12, footColor = '#ffffff' }) {
    this.legs = {};
    this.legLen = length;
    for (const [key, side] of [['L', 1], ['R', -1]]) {
      const limb = noodleLimb(length, r, r * 0.9, material, 3, 16);
      limb.mesh.position.set(side * hipX, length + r * 0.3, 0);
      this.mover.add(limb.mesh);
      const shoe = new THREE.Mesh(sculpt((n) => new THREE.Vector3(n.x * footSize * 0.75, n.y * footSize * 0.45 * (n.y < 0 ? 0.6 : 1), n.z * footSize * 1.1 + footSize * 0.35), 40, 24), footMaterial || glossy(footColor, 0.3));
      shoe.castShadow = true; shoe.position.y = -footSize * 0.12;
      limb.tip.add(shoe);
      this.legs[key] = { limb, shoe, side };
    }
  }

  /** Applique un état d'animation complet (déterministe en t). */
  applyState(s, t, ctx = {}) {
    this.visible = s.visible !== false;
    if (!this.visible) return;
    this.position.set(s.x ?? 0, s.y ?? 0, s.z ?? 0);
    this.rotation.y = s.yaw ?? 0;
    const sc = (s.scale ?? 1) * (this.def.scale ?? 1);
    this.scale.setScalar(sc);

    // --- corps : respiration, rebond de marche, inclinaisons
    const breathe = Math.sin(t * 2.1 + (this.def.phase || 0)) * 0.012;
    const emo = this.blendEmotion(s.emotions || { neutral: 1 });
    const walk = s.walk || 0; // 0..1
    const phase = s.walkPhase || 0;
    const talk = s.talk || 0;
    const bob = walk * Math.abs(Math.sin(phase)) * 0.06 * this.height + (s.hop || 0);
    this.mover.position.y = bob;
    const poseBody = s.poseBody || {};
    const lean = (poseBody.lean || 0) + emo.droop * 0.5 + walk * 0.06 + (s.lean || 0);
    this.bodyPivot.rotation.x = lean + Math.sin(t * 7.3) * talk * 0.025;
    this.bodyPivot.rotation.z = Math.sin(phase) * walk * 0.07 + (s.tilt || 0) + Math.sin(t * 1.3 + 1) * 0.015 + emo.asym * 0.04;
    this.bodyPivot.rotation.y = (s.twist || 0) + Math.sin(t * 5.1) * talk * 0.04;
    const squash = 1 + breathe + (s.squash || 0);
    this.bodyPivot.scale.set(1 / Math.sqrt(squash), squash, 1 / Math.sqrt(squash));
    this.bodyPivot.position.y = this.legLen;

    // --- visage
    if (this.face) this.applyFace(s, t, emo, ctx);
    // --- bras
    if (this.arms) this.applyArms(s, t, walk, phase, talk);
    // --- jambes
    if (this.legs) this.applyLegs(walk, phase, s);
    for (const fx of this.extras) fx(t, s, emo, ctx);
  }

  blendEmotion(weights) {
    const out = { ...EMOTIONS.neutral, round: 0, mouthBonus: 0 };
    let tot = 0; for (const k in weights) tot += weights[k];
    if (tot <= 0) return out;
    for (const key in out) out[key] = 0;
    for (const k in weights) {
      const e = { round: 0, mouthBonus: 0, ...(EMOTIONS[k] || EMOTIONS.neutral) }, w = weights[k] / tot;
      for (const key in out) out[key] += (e[key] ?? 0) * w;
    }
    return out;
  }

  applyFace(s, t, emo, ctx) {
    const f = this.face;
    // clignements pseudo-aléatoires déterministes
    const seed = (this.def.phase || 0) * 7.13;
    const period = 3.1 + Math.sin(seed) * 0.8;
    const local = (t + seed) % period;
    let blink = local < 0.14 ? Math.sin((local / 0.14) * Math.PI) : 0;
    if (s.blink) blink = Math.max(blink, s.blink);
    const open = emo.open * (1 - blink) + (s.eyeWide || 0);
    // regard : cible monde -> angles locaux
    let lookX = 0, lookY = 0;
    if (s.look) {
      const tgt = new THREE.Vector3(s.look.x, s.look.y, s.look.z);
      for (const e of f.eyes) {
        const local = e.group.worldToLocal(tgt.clone());
        lookX = clamp(Math.atan2(local.x, local.z), -0.5, 0.5);
        lookY = clamp(Math.atan2(local.y, Math.hypot(local.x, local.z)), -0.35, 0.35);
        // micro-saccades
        lookX += Math.sin(t * 1.7 + seed) * 0.03; lookY += Math.cos(t * 2.3) * 0.02;
        e.set({ open, lower: emo.lower, lookX, lookY, tilt: emo.angry * 0.25 });
      }
    } else for (const e of f.eyes) e.set({ open, lower: emo.lower, tilt: emo.angry * 0.25 });
    f.eyes.forEach((e, i) => { if (emo.browAsym && i === 0) e.upperLid.rotation.x -= emo.browAsym * 0.12; });
    f.brows.forEach((b, i) => {
      const asym = i === 0 ? emo.browAsym : -emo.browAsym * 0.3;
      b.set({ raise: emo.brow + asym * 0.6 + (s.browBoost || 0) + Math.sin(t * 6) * (s.talk || 0) * 0.08, angry: emo.angry }, b.scale);
    });
    const m = s.mouth || {};
    f.mouth.draw({
      open: clamp((m.open || 0) + (emo.mouthBonus || 0) * (m.open > 0.05 || emo.mouthBonus > 0.3 ? 1 : 0)),
      wide: m.wide ?? 0.5, round: Math.max(m.round || 0, emo.round || 0) * (m.open > 0.02 || emo.round ? 1 : 0),
      smile: emo.smile + (m.smile || 0), teeth: 1, tongue: 1, asym: emo.asym,
    });
  }

  applyArms(s, t, walk, phase, talk) {
    const poses = s.poses || { idle: 1 };
    let tot = 0; for (const k in poses) tot += poses[k];
    const res = { L: { ...ZERO_ARM }, R: { ...ZERO_ARM } };
    const handW = { L: {}, R: {} };
    for (const k in poses) {
      const P = POSES[k] || POSES.idle, w = poses[k] / (tot || 1);
      for (const side of ['L', 'R']) {
        const a = { ...ZERO_ARM, ...P[side] };
        if (P.osc && P.osc[side]) for (const key in P.osc[side]) { const [amp, hz] = P.osc[side][key]; a[key] += Math.sin(t * hz * Math.PI * 2 * 0.5) * amp; }
        for (const key in res[side]) res[side][key] += a[key] * w;
        const hp = P.hand[side === 'L' ? 0 : 1];
        handW[side][hp] = (handW[side][hp] || 0) + w;
      }
    }
    // balancement de marche + gestes de parole
    for (const [side, sgn] of [['L', 1], ['R', -1]]) {
      res[side].fwd += Math.sin(phase) * walk * 0.55 * sgn;
      const beat = Math.max(0, Math.sin(t * 3.7 + (sgn > 0 ? 0 : 1.9))) * talk * (s.gestureAmt ?? 1);
      res[side].fwd += beat * 0.45 * (poses.idle || 0) / (tot || 1);
      res[side].bend += beat * 0.55 * (poses.idle || 0) / (tot || 1);
      res[side].out += Math.sin(t * 1.1 + sgn) * 0.03;
      const arm = this.arms[side];
      const r = arm.limb.root, a = res[side], sideS = arm.side;
      r.rotation.order = 'YXZ';
      r.rotation.set(-a.fwd, sideS * (a.tw || 0), sideS * a.out);
      const bones = arm.limb.bones, n = bones.length - 1;
      for (let i = 1; i < n; i++) bones[i].rotation.set(-a.bend / (n - 1), 0, -sideS * a.curl / (n - 1));
      let best = 'relaxed', bw = -1; for (const k in handW[side]) if (handW[side][k] > bw) { bw = handW[side][k]; best = k; }
      arm.hand.set(best);
    }
  }

  applyLegs(walk, phase, s) {
    for (const [side, sgn] of [['L', 1], ['R', -1]]) {
      const leg = this.legs[side];
      const sw = Math.sin(phase) * walk * 0.6 * sgn;
      const r = leg.limb.root; r.rotation.set(-sw, 0, sgn * 0.04);
      const knee = Math.max(0, -Math.sin(phase) * sgn) * walk * 0.9;
      const bones = leg.limb.bones, n = bones.length - 1;
      for (let i = 1; i < n; i++) bones[i].rotation.set(knee / (n - 1), 0, 0);
      leg.shoe.rotation.x = sw - knee * 0.8 + (s.lean || 0) * 0.3;
    }
  }

  /** Hauteur des yeux en coordonnées monde (pour cadrer les gros plans). */
  headWorld(target = new THREE.Vector3()) {
    const y = (this.def.faceY ?? this.height * 0.7);
    return this.localToWorld(target.set(0, y, 0));
  }
}
