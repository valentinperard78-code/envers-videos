// Caméra automatique : plans « télé-réalité » calculés à partir des positions des personnages.
import * as THREE from 'three';
import { clamp, lerp, smooth, easeInOut } from '../core/geo.js';

const V = (x = 0, y = 0, z = 0) => new THREE.Vector3(x, y, z);

function handheld(t, amt, seed = 0) {
  return V(
    (Math.sin(t * 1.3 + seed) + Math.sin(t * 2.9 + seed * 2) * 0.5) * 0.012 * amt,
    (Math.sin(t * 1.7 + seed * 3) + Math.sin(t * 3.7) * 0.4) * 0.01 * amt,
    0,
  );
}

/**
 * shot : { type, angle, push, shake, fovStart, … } ; subs : infos des personnages concernés.
 * Retourne { pos, target, fov }.
 */
export function computeShot(shot, u, dur, subs, all, tAbs, obstacles = []) {
  const type = shot.type || 'medium';
  const a = (shot.angle ?? 0) * 0.42; // angle 3/4 (radians)
  const p = clamp(u / Math.max(0.01, dur));
  const pushK = 1 - (shot.push ?? 0.07) * smooth(p);
  const S = subs[0];
  let pos, target, fov = shot.fov ?? 30;
  const dirFrom = (ang, base = 0) => V(Math.sin(ang + base), 0, Math.cos(ang + base));
  const fit = (h) => h / (2 * Math.tan(THREE.MathUtils.degToRad(fov) / 2)); // distance pour cadrer une hauteur h

  if (!S && type !== 'wide') return computeShot({ ...shot, type: 'wide' }, u, dur, subs, all, tAbs, obstacles);

  switch (type) {
    case 'close': {
      const h = S.headTop - S.faceY + S.faceSize * 1.6;
      const d = fit(Math.max(0.65, h * 2.3)) * pushK;
      target = V(S.pos.x, S.faceY - S.faceSize * 0.35, S.pos.z);
      pos = target.clone().addScaledVector(dirFrom(a * 0.6), d); pos.y = S.faceY + 0.02;
      break;
    }
    case 'confession': {
      const h = Math.max(1.15, S.headTop * 1.12);
      const d = fit(h * 1.5) * pushK;
      target = V(S.pos.x, S.headTop * 0.52, S.pos.z);
      pos = target.clone().add(V(0, 0, d)); pos.y = S.faceY * 0.92;
      break;
    }
    case 'low': {
      const d = fit(S.headTop * 1.55) * pushK;
      target = V(S.pos.x, S.headTop * 0.6, S.pos.z);
      pos = target.clone().addScaledVector(dirFrom(a), d); pos.y = 0.35;
      break;
    }
    case 'two': {
      const O = subs[1] || S;
      const mid = S.pos.clone().lerp(O.pos, 0.5);
      const sep = S.pos.distanceTo(O.pos);
      const hh = Math.max(S.headTop, O.headTop);
      const d = Math.max(fit(hh * 1.5), (sep + 1.2) / (2 * Math.tan(THREE.MathUtils.degToRad(fov) / 2) * (9 / 16))) * pushK;
      target = V(mid.x, hh * 0.55, mid.z);
      pos = target.clone().addScaledVector(dirFrom(a * 0.5), d); pos.y = hh * 0.62;
      break;
    }
    case 'door': {
      // plan de dos/3/4 sur le personnage devant une porte (la porte au centre)
      const O = subs[1] || S;
      target = V(lerp(S.pos.x, O.pos.x, 0.55), S.headTop * 0.6, lerp(S.pos.z, O.pos.z, 0.55));
      const d = fit(Math.max(S.headTop, 1.4) * 1.5) * pushK;
      pos = target.clone().addScaledVector(dirFrom(-0.55 * Math.sign(shot.angle || 1)), d); pos.y = S.headTop * 0.75;
      break;
    }
    case 'wide': {
      const pts = all.length ? all : subs;
      const c = V(); let maxH = 1.2;
      pts.forEach((s) => { c.add(s.pos); maxH = Math.max(maxH, s.headTop); });
      if (pts.length) c.multiplyScalar(1 / pts.length);
      let spread = 0; pts.forEach((s) => { spread = Math.max(spread, Math.abs(s.pos.x - c.x) + s.radius); });
      const d = Math.max(fit(maxH * 2.3), (spread * 2 + 0.8) / (2 * Math.tan(THREE.MathUtils.degToRad(fov) / 2) * (9 / 16))) * (1 - 0.05 * smooth(p));
      target = V(c.x + Math.sin(p * 1.2) * 0.15, maxH * 0.55, c.z);
      pos = target.clone().addScaledVector(dirFrom(a * 0.6 + (p - 0.5) * 0.12), d); pos.y = maxH * 0.95;
      break;
    }
    case 'establish': {
      // grand plan d'ensemble du décor, mouvement de grue
      target = V(0, 1.2 - p * 0.3, -2.5);
      pos = V(Math.sin(p * 0.6 - 0.3) * 3, 3.2 - p * 1.2, 9.5 - p * 2.5);
      fov = 38;
      break;
    }
    default: { // medium
      const h = S.headTop;
      const d = fit(Math.max(1.45, h * 1.72)) * pushK;
      target = V(S.pos.x, h * 0.5, S.pos.z);
      pos = target.clone().addScaledVector(dirFrom(a), d); pos.y = h * 0.62;
    }
  }
  // évitement des obstacles : si un autre personnage masque le sujet, on tourne autour de la cible
  if (subs.length && type !== 'establish') {
    const ids = new Set(subs.map((x) => x.id));
    const blockers = all.filter((x) => !ids.has(x.id));
    const obst = obstacles.map((o) => ({ pos: V(o.x, 0, o.z), headTop: 9, radius: o.r, fixed: true }));
    const blocked = (P) => obst.some((o) => Math.hypot(P.x - o.pos.x, P.z - o.pos.z) < o.radius + 0.35) || [...blockers, ...obst].some((o) => {
      const c = V(o.pos.x, Math.min(o.headTop * 0.6, P.y), o.pos.z);
      const d = V().subVectors(target, P), len = d.length(); d.normalize();
      const u = V().subVectors(c, P).dot(d);
      if (u < 0.15 || u > len - 0.25) return false;
      const closest = P.clone().addScaledVector(d, u);
      return closest.distanceTo(c) < o.radius * 0.95 + 0.06;
    });
    if (blocked(pos)) {
      const rel = V().subVectors(pos, target);
      for (const ang of [0.3, -0.3, 0.6, -0.6, 0.9, -0.9, 1.2, -1.2]) {
        const cand = target.clone().add(rel.clone().applyAxisAngle(V(0, 1, 0), ang));
        if (!blocked(cand)) { pos = cand; break; }
      }
    }
  }
  // zoom « coup de théâtre » (crash zoom) au début du plan
  if (shot.crash) {
    const k = smooth(clamp(u / 0.28));
    pos = target.clone().lerp(pos, lerp(1.9, 1, k));
  }
  // caméra portée
  const shake = (shot.shake ?? 0.6) + (shot.crash ? 2.5 * Math.max(0, 1 - u / 0.6) : 0);
  const off = handheld(tAbs, shake, shot.seed || 0);
  const right = V().subVectors(pos, target).cross(V(0, 1, 0)).normalize();
  pos.addScaledVector(right, off.x); pos.y += off.y;
  return { pos, target, fov, roll: (shot.roll ?? 0) + off.x * 0.4 };
}
