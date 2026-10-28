// Évalue la timeline à l'instant t : état de chaque personnage, décor actif, caméra.
import * as THREE from 'three';
import { clamp, lerp, smooth } from '../core/geo.js';
import { computeShot } from './camera.js';

// ---------------------------------------------------------------- synchro labiale
const VIS = {
  a: { open: 0.9, wide: 0.62, round: 0 }, e: { open: 0.55, wide: 0.78, round: 0 }, i: { open: 0.3, wide: 0.95, round: 0 },
  o: { open: 0.62, wide: 0.4, round: 0.8 }, u: { open: 0.34, wide: 0.3, round: 1 }, m: { open: 0, wide: 0.5, round: 0 },
  f: { open: 0.12, wide: 0.62, round: 0 }, c: { open: 0.32, wide: 0.6, round: 0 }, s: { open: 0.2, wide: 0.78, round: 0 }, _: { open: 0, wide: 0.5, round: 0 },
};
function charVis(ch) {
  ch = ch.toLowerCase().replace(/œ/g, 'oe').replace(/æ/g, 'ae').normalize('NFD').replace(/[̀-ͯ]/g, '');
  if ('a'.includes(ch)) return 'a';
  if ('e'.includes(ch)) return 'e';
  if ('iy'.includes(ch)) return 'i';
  if ('o'.includes(ch)) return 'o';
  if ('u'.includes(ch)) return 'u';
  if ('mbp'.includes(ch)) return 'm';
  if ('fv'.includes(ch)) return 'f';
  if ('szcjgx'.includes(ch)) return 's';
  if (/[a-z]/.test(ch)) return 'c';
  return '_';
}
function wordVisemes(w) {
  const s = w.toLowerCase().replace(/ou/g, 'u').replace(/eau|au/g, 'o').replace(/ai|ei/g, 'e').replace(/oi/g, 'a').replace(/[^a-zàâäéèêëîïôöùûüç]/g, '');
  return s.length ? Array.from(s).map(charVis) : ['_'];
}

export function mouthAt(speech, t) {
  if (!speech || t < speech.t0 || t > speech.t1 + 0.05) return null;
  // enveloppe d'amplitude (issue de l'audio réel si disponible)
  let env = 1;
  if (speech.env && speech.env.length) {
    const i = (t - speech.t0) * (speech.rate || 50);
    const i0 = Math.floor(i), f = i - i0;
    const a = speech.env[clamp(i0, 0, speech.env.length - 1)] || 0, b = speech.env[clamp(i0 + 1, 0, speech.env.length - 1)] || 0;
    env = clamp((a + (b - a) * f) * 1.6);
  }
  const words = speech.words || [];
  let w = null;
  for (const x of words) if (t >= x.t && t < x.t + x.d) { w = x; break; }
  if (!w) return { open: env * 0.15, wide: 0.5, round: 0, talk: env * 0.5 };
  const vis = w.vis || (w.vis = wordVisemes(w.w));
  const f = clamp((t - w.t) / w.d) * vis.length;
  const i0 = Math.min(vis.length - 1, Math.floor(f)), i1 = Math.min(vis.length - 1, i0 + 1), k = smooth(f - Math.floor(f));
  const A = VIS[vis[i0]], B = VIS[vis[i1]];
  const open = lerp(A.open, B.open, k);
  const envK = speech.env && speech.env.length ? 0.35 + 0.65 * env : 0.75 + 0.25 * Math.sin(t * 22);
  return { open: open * envK, wide: lerp(A.wide, B.wide, k), round: lerp(A.round, B.round, k), talk: speech.env && speech.env.length ? env : 0.8 };
}

// ---------------------------------------------------------------- utilitaires
const findBeat = (beats, t) => {
  let lo = 0, hi = beats.length - 1, ans = 0;
  while (lo <= hi) { const m = (lo + hi) >> 1; if (beats[m].t0 <= t) { ans = m; lo = m + 1; } else hi = m - 1; }
  return ans;
};
function resolvePos(spec, set) {
  if (!spec) return null;
  if (Array.isArray(spec)) return new THREE.Vector3(spec[0], 0, spec[1]);
  if (typeof spec === 'string' && set?.marks?.[spec]) return set.marks[spec].clone();
  if (spec.x !== undefined) return new THREE.Vector3(spec.x, 0, spec.z);
  return null;
}
function angleLerp(a, b, k) { let d = ((b - a + Math.PI) % (Math.PI * 2) + Math.PI * 2) % (Math.PI * 2) - Math.PI; return a + d * k; }

/** Position d'un acteur dans un battement à l'instant t (avec marche éventuelle). */
function actorPos(a, b, t, set) {
  const to = resolvePos(a.pos, set) || new THREE.Vector3();
  if (!a.from) return { p: to, walk: 0, dir: null, dist: 0 };
  const from = resolvePos(a.from, set) || to;
  const t0 = b.t0 + (a.walkDelay || 0), dur = a.walkDur || Math.max(0.6, from.distanceTo(to) / (a.speed || 1.1));
  const k = clamp((t - t0) / dur);
  const e = k * k * (3 - 2 * k);
  const p = from.clone().lerp(to, e);
  const moving = k > 0 && k < 1;
  return { p, walk: moving ? Math.min(1, Math.sin(k * Math.PI) * 2.5) : 0, dir: to.clone().sub(from), dist: from.distanceTo(to) * e };
}

// ---------------------------------------------------------------- évaluation principale
export function evaluate(tl, t, world) {
  const beats = tl.beats;
  const bi = findBeat(beats, t);
  const b = beats[bi];
  const prev = bi > 0 && beats[bi - 1].set === b.set ? beats[bi - 1] : null;
  const set = world.ensureSet(b.set);
  const local = t - b.t0;
  const blendK = smooth(clamp(local / 0.32));

  // 1) positions
  const infos = {}, actors = {};
  for (const id in b.actors) {
    const a = b.actors[id];
    if (a.visible === false) continue;
    const ch = world.chars[id]; if (!ch) continue;
    const ap = actorPos(a, b, t, set);
    let sc = (a.scale ?? 1) * (ch.def.scale ?? 1);
    if (a.shrink) { sc *= 1 - smooth(clamp((t - b.t0 - a.shrink.at) / a.shrink.dur)); if (sc < 0.02) continue; }
    infos[id] = { id, pos: ap.p, ap, a, ch, sc, headTop: ch.headTop * sc, faceY: (ch.def.faceY ?? ch.height * 0.7) * sc, faceSize: (ch.face?.cfg?.eyeR ?? 0.08) * 4 * sc, radius: ch.radius * sc };
  }
  // 2) caméra
  const shot = b.shot || { type: 'wide' };
  const subs = [shot.subject, shot.other].filter((s) => s && infos[s]).map((s) => infos[s]);
  const all = Object.values(infos).filter((i) => !i.a.offstage);
  const st0 = shot.start ?? b.t0, st1 = shot.end ?? b.t1;
  const cam = computeShot(shot, t - st0, st1 - st0, subs, all, t, set.obstacles || []);

  // 3) états des personnages
  for (const id in infos) {
    const I = infos[id], a = I.a, ch = I.ch;
    const pa = prev && prev.actors[id] && prev.actors[id].visible !== false ? prev.actors[id] : null;
    // orientation
    let yaw = 0;
    const faceTarget = (spec) => {
      if (spec === undefined || spec === null) spec = 'camera';
      if (typeof spec === 'number') return spec;
      let tgt = null;
      if (spec === 'camera') tgt = cam.pos;
      else if (infos[spec]) tgt = infos[spec].pos;
      else if (set.marks?.[spec]) tgt = set.marks[spec];
      if (!tgt) return 0;
      // mélange : on garde une ouverture vers la caméra (« cheat » de théâtre)
      const toT = Math.atan2(tgt.x - I.pos.x, tgt.z - I.pos.z);
      if (spec === 'camera') return toT;
      // « tricher » vers la caméra : jamais plus de ~30-45° de dos, comme au théâtre / en télé
      const toCam = Math.atan2(cam.pos.x - I.pos.x, cam.pos.z - I.pos.z);
      const diff = angleLerp(0, toT - toCam, 1);
      if (a.faceStrict) return toT;
      const maxAway = b.speaker === id ? 0.5 : 0.8;
      return toCam + clamp(diff * 0.6, -maxAway, maxAway);
    };
    yaw = faceTarget(a.face);
    if (I.ap.walk > 0.05 && I.ap.dir) yaw = Math.atan2(I.ap.dir.x, I.ap.dir.z);
    if (pa && !a.from && local < 0.4) { const py = faceTarget(pa.face); yaw = angleLerp(py, yaw, smooth(clamp(local / 0.4))); }
    if (a.from && I.ap.walk <= 0.05) {
      const tw = faceTarget(a.face); const moveYaw = I.ap.dir ? Math.atan2(I.ap.dir.x, I.ap.dir.z) : tw;
      // après la marche : se retourner progressivement
      yaw = angleLerp(moveYaw, tw, I.ap.dist > 0.01 ? clamp((t - b.t0 - (a.walkDelay || 0) - (a.walkDur || 1)) / 0.4 + 0.5) : 1);
    }
    // émotions et poses (fondus depuis le battement précédent)
    const emotions = {}; const poses = {};
    const add = (o, k, w) => { if (!k) return; o[k] = (o[k] || 0) + w; };
    if (pa) { add(emotions, pa.emotion || 'neutral', 1 - blendK); add(poses, pa.pose || 'idle', 1 - blendK); }
    add(emotions, a.emotion || 'neutral', pa ? blendK : 1);
    // pose temporaire (ex. frapper pendant 1,2 s puis revenir)
    let pose = a.pose || 'idle';
    if (a.poseUntil !== undefined && local > a.poseUntil) pose = a.poseAfter || 'idle';
    add(poses, pose, pa ? blendK : 1);
    if (I.ap.walk > 0.2 && poses.idle === undefined) add(poses, 'idle', 0.5);
    // parole
    const speaking = b.speaker === id && b.speech;
    const m = speaking ? mouthAt(b.speech, t) : null;
    // regard
    let look = null;
    const lk = a.look ?? (speaking ? 'camera' : (b.speaker && infos[b.speaker] && b.speaker !== id ? b.speaker : 'camera'));
    if (lk === 'camera') look = cam.pos.clone();
    else if (infos[lk]) { const o = infos[lk]; look = new THREE.Vector3(o.pos.x, o.faceY, o.pos.z); }
    else if (Array.isArray(lk)) look = new THREE.Vector3(...lk);
    const stepLen = 0.32 * I.sc;
    const doorOpen = a.door !== undefined ? (typeof a.door === 'number' ? a.door : lerp(a.door.from, a.door.to, smooth(clamp((local - (a.door.at || 0)) / (a.door.dur || 0.8))))) : 0;
    const sweat = a.sweat ?? 0;
    const hop = a.hop ? Math.max(0, Math.sin(clamp((local - (a.hopAt || 0)) / 0.45) * Math.PI)) * a.hop : 0;
    actors[id] = {
      visible: true, x: I.pos.x, y: (a.y ?? 0) + (a.float ? Math.sin(t * 1.6 + I.pos.x) * 0.04 + 0.05 : 0), z: I.pos.z, yaw, scale: I.sc / (ch.def.scale ?? 1),
      emotions, poses, mouth: m || { open: 0 }, talk: m ? m.talk : 0,
      walk: I.ap.walk, walkPhase: (I.ap.dist / stepLen) * Math.PI, look, sweat, doorOpen, hop,
      lean: a.lean || 0, tilt: a.tilt || 0, squash: a.squash || 0, gestureAmt: a.gesture ?? 1,
    };
  }

  // lumière de flash / transitions
  const flash = b.flash ? Math.max(0, 1 - local / 0.18) * 0.9 : 0;
  return {
    beat: b, set: b.set, actors, setState: b.setState || {}, flash,
    focus: cam.pos.distanceTo(cam.target), aperture: shot.aperture,
    applyCamera(camera) {
      camera.position.copy(cam.pos);
      camera.fov = cam.fov; camera.updateProjectionMatrix();
      camera.up.set(Math.sin(cam.roll * 0.15), 1, 0).normalize();
      camera.lookAt(cam.target);
    },
  };
}
