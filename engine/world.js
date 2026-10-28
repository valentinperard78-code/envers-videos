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
    this.r3d.setFocus(ev.focus ?? 4, ev.aperture);
    this.r3d.render(t, ev.flash || 0);
    this.ctx.drawImage(this.r3d.renderer.domElement, 0, 0, this.W, this.H);
    this.overlay.draw(this.ctx, t, ev);
    return ev;
  }
}
