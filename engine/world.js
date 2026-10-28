// Le « monde » : décors + personnages + caméra, piloté par une timeline déterministe.
import * as THREE from 'three';
import { Renderer3D } from './core/studio.js';
import { SET_BUILDERS } from './sets/sets.js';
import { createCharacter, PRESETS } from './characters/cast.js';
import * as TX from './core/textures.js';
import { evaluate } from './animation/evaluate.js';
import { Overlay } from './overlay/overlay.js';

export async function loadFonts(base = '/assets/fonts/') {
  const fonts = [['Anton', 'Anton-Regular.ttf', '400'], ['Montserrat', 'Montserrat.ttf', '100 900'], ['Baloo2', 'Baloo2.ttf', '400 800']];
  for (const [fam, file, weight] of fonts) {
    try { const f = new FontFace(fam, `url(${base}${file})`, { weight }); await f.load(); document.fonts.add(f); } catch (e) { console.warn('police', fam, e.message); }
  }
}

export class World {
  constructor({ quality = 'standard', width, height, canvas } = {}) {
    this.r3d = new Renderer3D({ quality, width, height });
    this.W = this.r3d.W; this.H = this.r3d.H;
    this.scene = this.r3d.scene; this.camera = this.r3d.camera;
    this.sets = {}; this.chars = {}; this.activeSet = null;
    // toile finale (3D + habillage 2D)
    this.canvas = canvas || document.createElement('canvas');
    this.canvas.width = this.W; this.canvas.height = this.H;
    this.ctx = this.canvas.getContext('2d');
    this.overlay = new Overlay(this.W, this.H);
  }

  ensureSet(id) {
    if (this.sets[id]) return this.sets[id];
    const builder = SET_BUILDERS[id] || SET_BUILDERS.villa;
    const set = builder(this.r3d.q);
    set.group.visible = false;
    this.r3d.optimize(set.group, true);
    this.scene.add(set.group);
    const envScene = set.env;
    set.envRT = this.r3d.pmrem.fromScene(envScene, 0.04);
    this.sets[id] = set;
    return set;
  }

  activate(id) {
    const set = this.ensureSet(id);
    if (this.activeSet === set) return set;
    for (const s of Object.values(this.sets)) s.group.visible = false;
    set.group.visible = true;
    this.scene.environment = set.envRT.texture; this.scene.environmentIntensity = set.envIntensity ?? 1;
    this.scene.background = set.background; this.scene.backgroundIntensity = 1;
    this.scene.fog = set.fog || null;
    this.r3d.setLook(set.look || {});
    this.activeSet = set;
    return set;
  }

  addCharacter(id, def) {
    const preset = typeof def === 'string' ? PRESETS[def] : def;
    const ch = createCharacter({ ...(PRESETS[id] || {}), ...(preset || {}) }, TX);
    ch.visible = false; this.r3d.optimize(ch); this.scene.add(ch); this.chars[id] = ch;
    return ch;
  }

  load(timeline) {
    this.tl = timeline;
    for (const c of timeline.cast) if (!this.chars[c.id]) this.addCharacter(c.id, c.def || c.id);
    const used = new Set(timeline.beats.map((b) => b.set));
    for (const id of used) this.ensureSet(id);
    this.overlay.load(timeline);
  }

  /** Miniature : image 3D à l'instant t + titre accrocheur (sans sous-titres ni bandeaux). */
  renderCover(t, cover) {
    const ev = evaluate(this.tl, t, this);
    const set = this.activate(ev.set); set.update(t, ev.setState || {});
    for (const id in this.chars) { const st = ev.actors[id]; const ch = this.chars[id]; if (!st) { ch.visible = false; continue; } ch.applyState(st, t, {}); }
    ev.applyCamera(this.camera); this.r3d.setFocus(ev.focus ?? 4); this.r3d.render(t, 0);
    this.ctx.drawImage(this.r3d.renderer.domElement, 0, 0, this.W, this.H);
    this.overlay.cover(this.ctx, cover);
  }

  /** Contrôle qualité : pour chaque plan, vérifie que le sujet est bien cadré (tête et pieds visibles, pas masqué). */
  qualityCheck() {
    const issues = [];
    const v = new THREE.Vector3();
    for (const b of this.tl.beats) {
      if (b.kind === 'title' || b.kind === 'card') continue;
      const t = (b.t0 + b.t1) / 2;
      const ev = evaluate(this.tl, t, this);
      const setObj = this.activate(ev.set); setObj.update?.(t, ev.setState || {}); setObj.group.updateMatrixWorld(true);
      for (const id in this.chars) { const st = ev.actors[id]; const ch = this.chars[id]; if (!st) { ch.visible = false; continue; } ch.applyState(st, t, {}); ch.updateMatrixWorld(true); }
      ev.applyCamera(this.camera); this.camera.updateMatrixWorld(true);
      const subj = b.shot?.subject && this.chars[b.shot.subject]?.visible ? this.chars[b.shot.subject] : null;
      if (!subj) continue;
      const head = subj.localToWorld(v.set(0, subj.def.faceY ?? subj.height * 0.7, 0)).clone().project(this.camera);
      const top = subj.localToWorld(new THREE.Vector3(0, subj.headTop, 0)).project(this.camera);
      const where = `${b.t0.toFixed(1)} s (${b.set}, ${b.shot.type}, ${b.shot.subject})`;
      if (Math.abs(head.x) > 0.92 || head.y > 0.95 || head.y < -0.6) issues.push({ t: b.t0, level: 'erreur', msg: `visage hors cadre à ${where}` });
      else if (top.y > 1.08 && b.shot.type !== 'close') issues.push({ t: b.t0, level: 'info', msg: `haut de la tête coupé à ${where}` });
      if (head.z > 1 || head.z < -1) issues.push({ t: b.t0, level: 'erreur', msg: `caméra derrière ou dans le sujet à ${where}` });
      // occultation : un autre personnage entre la caméra et le visage ?
      const camPos = this.camera.position, faceW = subj.localToWorld(new THREE.Vector3(0, subj.def.faceY ?? subj.height * 0.7, 0));
      const ray = new THREE.Raycaster(camPos, faceW.clone().sub(camPos).normalize(), 0.05, camPos.distanceTo(faceW) - 0.3);
      const blockers = Object.values(this.chars).filter((c) => c !== subj && c.visible && c.body);
      const hit = ray.intersectObjects(blockers.map((c) => c.body), false)[0];
      if (hit) issues.push({ t: b.t0, level: 'avertissement', msg: `visage masqué par un autre personnage à ${where}` });
      // occultation par le décor (table, meuble…) : rayons vers le visage et vers le haut de la tête
      const solid = (h) => h.object.visible && h.object.isMesh && !h.object.material?.transparent && !(h.object.material?.opacity < 0.9);
      const decor = [faceW, subj.localToWorld(new THREE.Vector3(0, subj.headTop * 0.92, 0))].filter((p) => {
        const r = new THREE.Raycaster(camPos, p.clone().sub(camPos).normalize(), 0.05, camPos.distanceTo(p) - 0.15);
        return r.intersectObject(setObj.group, true).some(solid);
      }).length;
      if (decor === 2) issues.push({ t: b.t0, level: 'erreur', msg: `visage caché par le décor à ${where}` });
    }
    return issues;
  }

  /** Rend l'image à l'instant t (secondes) et compose l'habillage. */
  renderAt(t) {
    if (this.overlay.covers(t)) { this.ctx.fillStyle = '#000'; this.ctx.fillRect(0, 0, this.W, this.H); this.overlay.draw(this.ctx, t, {}); return null; }
    const ev = evaluate(this.tl, t, this);
    const set = this.activate(ev.set);
    set.update(t, ev.setState || {});
    for (const id in this.chars) {
      const st = ev.actors[id];
      const ch = this.chars[id];
      if (!st) { ch.visible = false; continue; }
      ch.applyState(st, t, { camera: this.camera });
    }
    // caméra (après placement des personnages)
    ev.applyCamera(this.camera);
    this.camera.updateMatrixWorld(true);
    ev.heads = {};
    for (const id in ev.actors) { const ch = this.chars[id]; if (!ch?.visible) continue; ch.updateMatrixWorld(true); const p = ch.localToWorld(new THREE.Vector3(0, ch.headTop ?? ch.height, 0)).project(this.camera); ev.heads[id] = { x: (p.x * 0.5 + 0.5) * this.W, y: (-p.y * 0.5 + 0.5) * this.H, visible: p.z < 1 && Math.abs(p.x) < 1.1 && Math.abs(p.y) < 1.1 }; }
    this.r3d.setFocus(ev.focus ?? 4, ev.aperture);
    this.r3d.render(t, ev.flash || 0);
    this.ctx.drawImage(this.r3d.renderer.domElement, 0, 0, this.W, this.H);
    this.overlay.draw(this.ctx, t, ev);
    return ev;
  }
}
