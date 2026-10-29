// Habillage 2D « télé-réalité » dessiné par-dessus l'image 3D.
import { clamp, lerp, smooth, easeOutBack } from '../core/geo.js';
import { KEYWORDS } from '../script/director.js';
const KW = new RegExp(`^(${KEYWORDS.join('|')})s?$`);
const normW = (w) => String(w).toLowerCase().replace(/œ/g, 'oe').normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-z0-9]/g, '');

const FONT_TITLE = 'Anton, Impact, sans-serif';
const FONT_TEXT = 'Montserrat, Arial, sans-serif';
const FONT_ROUND = 'Baloo2, Montserrat, sans-serif';

function rr(c, x, y, w, h, r) { c.beginPath(); c.roundRect ? c.roundRect(x, y, w, h, r) : c.rect(x, y, w, h); }
function wrap(c, text, maxW) {
  const words = String(text).split(/[ \t\n]+/); const lines = []; let cur = '';
  for (const w of words) { const test = cur ? cur + ' ' + w : w; if (c.measureText(test).width > maxW && cur) { lines.push(cur); cur = w; } else cur = test; }
  if (cur) lines.push(cur); return lines;
}
const ease = (t) => easeOutBack(clamp(t));
const fadeIO = (t, t0, t1, fi = 0.18, fo = 0.18) => clamp((t - t0) / fi) * clamp((t1 - t) / fo);

export class Overlay {
  constructor(W, H) { this.W = W; this.H = H; this.items = []; this.u = W / 1080; }
  /** Vrai si un carton/générique couvre tout l'écran (inutile de calculer la 3D). */
  covers(t) { return this.items.some((o) => (o.type === 'card' || o.type === 'title') && t >= o.t0 + 0.14 && t <= o.t1 - 0.22); }
  load(tl) { this.items = (tl.overlays || []).slice().sort((a, b) => a.t0 - b.t0); this.meta = tl.meta || {}; }

  draw(c, t, ev) {
    const active = this.items.filter((o) => t >= o.t0 && t <= o.t1);
    this._nameOn = active.some((o) => o.type === 'name' || (o.type === 'tag' && !o.big && t >= o.t0 + (o.after || 0)));
    // ordre : fonds plein écran d'abord, texte ensuite
    const order = { card: 0, title: 0, gauge: 1, badge: 1, banner: 2, sources: 2, sticker: 3, hook: 4, question: 5, confession: 2, tag: 3, name: 3, box: 4, recap: 4, cta: 5, subtitle: 6 };
    active.sort((a, b) => (order[a.type] ?? 3) - (order[b.type] ?? 3));
    for (const o of active) { c.save(); try { (this[o.type] || (() => {})).call(this, c, o, t, ev); } finally { c.restore(); } }
  }

  // ------------------------------------------------ sous-titres dynamiques
  subtitle(c, o, t) {
    const u = this.u, W = this.W, H = this.H;
    const words = o.words?.length ? o.words : fakeWords(o.text, o.t0, o.t1);
    // découpage en groupes de ~3 mots (max 22 caractères)
    if (!o._chunks) {
      o._chunks = []; let cur = [];
      // ponctuation isolée (« Coucou ! ») : recollée au mot précédent pour ne jamais commencer une ligne par « ! »
      const merged = [];
      for (const w of words) { if (/^[!?:;.,…»]+$/.test(w.w) && merged.length) merged[merged.length - 1] = { ...merged[merged.length - 1], w: merged[merged.length - 1].w + ' ' + w.w }; else merged.push(w); }
      for (const w of merged) { cur.push(w); const len = cur.map((x) => x.w).join(' ').length; if (cur.length >= 3 || len > 18 || /[.!?…,]$/.test(w.w)) { o._chunks.push(cur); cur = []; } }
      if (cur.length) o._chunks.push(cur);
    }
    let chunk = o._chunks[0];
    for (const ch of o._chunks) if (t >= ch[0].t - 0.02) chunk = ch;
    const t0 = chunk[0].t;
    const pop = ease((t - t0) / 0.16);
    const size = 74 * u;
    c.font = `900 ${size}px ${FONT_TEXT}`; c.textAlign = 'center'; c.textBaseline = 'middle';
    const y = H * 0.665;
    const text = chunk.map((w) => w.w.toUpperCase());
    const widths = text.map((s) => c.measureText(s).width * 1.06), space = size * 0.3;
    let lines = [[]], lw = [0];
    const maxW = W * 0.84;
    text.forEach((s, i) => { const L = lines.length - 1; if (lw[L] + widths[i] > maxW && lines[L].length) { lines.push([]); lw.push(0); } lines[lines.length - 1].push(i); lw[lines.length - 1] += widths[i] + space; });
    c.translate(W / 2, y); c.scale(0.85 + 0.15 * pop, 0.85 + 0.15 * pop); c.translate(-W / 2, -y);
    lines.forEach((line, li) => {
      let x = W / 2 - (lw[li] - space) / 2;
      const yy = y + (li - (lines.length - 1) / 2) * size * 1.12;
      for (const i of line) {
        const w = chunk[i]; const s = text[i]; const cx = x + widths[i] / 2;
        const on = t >= w.t && t < w.t + w.d + 0.08;
        c.lineJoin = 'round'; c.lineWidth = size * 0.2; c.strokeStyle = '#000';
        c.shadowColor = 'rgba(0,0,0,0.5)'; c.shadowBlur = 12 * u; c.shadowOffsetY = 5 * u;
        c.strokeText(s, cx, yy); c.shadowBlur = 0; c.shadowOffsetY = 0;
        const kw = KW.test(normW(w.w));
        c.fillStyle = on ? (o.color || '#ffe44d') : kw ? '#6ff2ff' : '#ffffff';
        if (on) { c.save(); c.translate(cx, yy); c.scale(1.05, 1.05); c.fillText(s, 0, 0); c.restore(); } else c.fillText(s, cx, yy);
        x += widths[i] + space;
      }
    });
  }

  // ------------------------------------------------ étiquette de nom (entrée en scène)
  name(c, o, t) {
    const u = this.u; const k = fadeIO(t, o.t0, o.t1, 0.25, 0.25); const s = ease((t - o.t0) / 0.35);
    const x = 46 * u - (1 - s) * 500 * u, y = this.H * 0.135;
    c.globalAlpha = k;
    c.font = `${118 * u}px ${FONT_TITLE}`; const nw = c.measureText(o.name.toUpperCase()).width;
    c.font = `700 ${34 * u}px ${FONT_TEXT}`; const rw = c.measureText(o.role || '').width;
    const w = Math.max(nw, rw) + 70 * u, h = 190 * u;
    const g = c.createLinearGradient(x, y, x + w, y + h); g.addColorStop(0, o.color || '#ff3da8'); g.addColorStop(1, shade(o.color || '#ff3da8', -0.35));
    c.shadowColor = 'rgba(0,0,0,0.45)'; c.shadowBlur = 24 * u; c.shadowOffsetY = 8 * u;
    c.fillStyle = g; rr(c, x, y, w, h, 28 * u); c.fill(); c.shadowBlur = 0; c.shadowOffsetY = 0;
    c.fillStyle = '#fff'; c.textAlign = 'left'; c.textBaseline = 'alphabetic';
    c.font = `${118 * u}px ${FONT_TITLE}`; c.fillText(o.name.toUpperCase(), x + 35 * u, y + 122 * u);
    c.font = `700 ${34 * u}px ${FONT_TEXT}`; c.globalAlpha = k * 0.92; c.fillText(o.role || '', x + 37 * u, y + 168 * u);
    // petit cœur
    c.globalAlpha = k; heart(c, x + w - 10 * u, y + 8 * u, 26 * u, '#fff');
  }

  // ------------------------------------------------ bandeau confessionnal
  confession(c, o, t) {
    const u = this.u, W = this.W; const k = fadeIO(t, o.t0, o.t1, 0.2, 0.2);
    c.globalAlpha = k;
    const y = this.H * 0.085, h = 74 * u;
    c.font = `${52 * u}px ${FONT_TITLE}`; const label = 'CONFESSIONNAL'; const lw = c.measureText(label).width;
    const w = lw + 130 * u, x = W / 2 - w / 2;
    c.fillStyle = 'rgba(15,5,12,0.75)'; rr(c, x, y, w, h, h / 2); c.fill();
    c.strokeStyle = '#ff2f8f'; c.lineWidth = 4 * u; c.shadowColor = '#ff2f8f'; c.shadowBlur = 20 * u; rr(c, x, y, w, h, h / 2); c.stroke(); c.shadowBlur = 0;
    heart(c, x + 46 * u, y + 18 * u, 38 * u, '#ff2f8f');
    c.fillStyle = '#fff'; c.textAlign = 'left'; c.textBaseline = 'middle'; c.fillText(label, x + 84 * u, y + h / 2 + 2 * u);
    // point rouge « REC »
    if (Math.floor(t * 2) % 2 === 0) { c.fillStyle = '#ff2a2a'; c.beginPath(); c.arc(W - 70 * u, y + h / 2, 12 * u, 0, Math.PI * 2); c.fill(); }
    c.font = `800 ${28 * u}px ${FONT_TEXT}`; c.fillStyle = '#fff'; c.textAlign = 'right'; c.fillText('REC', W - 92 * u, y + h / 2 + 2 * u);
  }

  // ------------------------------------------------ qui parle (nom + organe), affiché toute la réplique
  tag(c, o, t) {
    const u = this.u, W = this.W, H = this.H;
    if (t < o.t0 + (o.after || 0)) return; // laisse d'abord passer la grande étiquette de présentation
    const t0 = o.t0 + (o.after || 0); const k = fadeIO(t, t0, o.t1, 0.2, 0.2); const s = ease((t - t0) / 0.3);
    c.globalAlpha = k;
    const name = String(o.name || '').toUpperCase(), role = String(o.role || '');
    if (o.big) {
      // bandeau bas façon télé-réalité : NOM + « le pancréas »
      const y = H * 0.755, h = 150 * u;
      c.font = `${92 * u}px ${FONT_TITLE}`; const nw = c.measureText(name).width;
      c.font = `800 ${44 * u}px ${FONT_TEXT}`; const rw = c.measureText(role).width;
      const w = Math.max(nw, rw) + 90 * u; const x = W / 2 - w / 2 + (1 - s) * -W;
      c.save(); c.translate(W / 2, y + h / 2); c.rotate(-0.025); c.translate(-W / 2, -(y + h / 2));
      c.shadowColor = 'rgba(0,0,0,0.45)'; c.shadowBlur = 24 * u; c.shadowOffsetY = 8 * u;
      c.fillStyle = o.color || '#ff2f8f'; rr(c, x, y, w, h * 0.62, [26 * u, 26 * u, 0, 0]); c.fill();
      c.fillStyle = '#ffffff'; rr(c, x, y + h * 0.62, w, h * 0.42, [0, 0, 26 * u, 26 * u]); c.fill();
      c.shadowBlur = 0; c.shadowOffsetY = 0;
      c.textAlign = 'center'; c.textBaseline = 'middle';
      c.font = `${92 * u}px ${FONT_TITLE}`; c.lineWidth = 8 * u; c.strokeStyle = 'rgba(0,0,0,0.25)'; c.strokeText(name, x + w / 2, y + h * 0.33); c.fillStyle = '#fff'; c.fillText(name, x + w / 2, y + h * 0.33);
      c.font = `800 ${44 * u}px ${FONT_TEXT}`; c.fillStyle = '#1d1430'; c.fillText(role, x + w / 2, y + h * 0.83);
      c.restore();
    } else {
      // pastille discrète en haut à gauche
      const x = 40 * u + (1 - s) * -300 * u, y = H * 0.135, h = 92 * u;
      c.font = `${54 * u}px ${FONT_TITLE}`; const nw = c.measureText(name).width;
      c.font = `800 ${30 * u}px ${FONT_TEXT}`; const rw = c.measureText(role).width;
      const w = Math.max(nw, rw) + 56 * u;
      c.shadowColor = 'rgba(0,0,0,0.35)'; c.shadowBlur = 14 * u;
      c.fillStyle = o.color || '#ff2f8f'; rr(c, x, y, w, h, 20 * u); c.fill(); c.shadowBlur = 0;
      c.textAlign = 'left'; c.textBaseline = 'alphabetic';
      c.font = `${54 * u}px ${FONT_TITLE}`; c.fillStyle = '#fff'; c.fillText(name, x + 28 * u, y + 52 * u);
      c.font = `800 ${30 * u}px ${FONT_TEXT}`; c.fillStyle = 'rgba(255,255,255,0.92)'; c.fillText(role, x + 28 * u, y + 82 * u);
    }
  }

  // ------------------------------------------------ encadré explicatif
  box(c, o, t) {
    const u = this.u, W = this.W; const s = ease((t - o.t0) / 0.4); const k = fadeIO(t, o.t0, o.t1, 0.2, 0.25);
    c.globalAlpha = k;
    // sous l'étiquette du nom si elle est affichée (jamais l'une sur l'autre)
    const x = W * 0.07, w = W * 0.86, y = this._nameOn ? this.H * 0.135 + 210 * u : this.H * 0.2;
    c.font = `800 ${46 * u}px ${FONT_TEXT}`;
    const lines = wrap(c, o.text, w - 80 * u);
    const h = 130 * u + lines.length * 58 * u;
    c.translate(W / 2, y + h / 2); c.scale(lerp(0.6, 1, s), lerp(0.6, 1, s)); c.rotate((1 - s) * -0.08); c.translate(-W / 2, -(y + h / 2));
    c.shadowColor = 'rgba(0,0,0,0.5)'; c.shadowBlur = 30 * u; c.shadowOffsetY = 10 * u;
    c.fillStyle = '#ffffff'; rr(c, x, y, w, h, 34 * u); c.fill(); c.shadowBlur = 0; c.shadowOffsetY = 0;
    c.fillStyle = o.color || '#7b2cff'; rr(c, x, y, w, 92 * u, [34 * u, 34 * u, 0, 0]); c.fill();
    c.fillStyle = '#fff'; c.font = `${58 * u}px ${FONT_TITLE}`; c.textAlign = 'left'; c.textBaseline = 'middle';
    c.fillText((o.title || 'À SAVOIR').toUpperCase(), x + 40 * u, y + 48 * u);
    bulb(c, x + w - 70 * u, y + 46 * u, 30 * u);
    c.fillStyle = '#1d1430'; c.font = `800 ${46 * u}px ${FONT_TEXT}`; c.textAlign = 'left'; c.textBaseline = 'alphabetic';
    lines.forEach((l, i) => c.fillText(l, x + 40 * u, y + 160 * u + i * 58 * u));
  }

  recap(c, o, t) { this.box(c, { ...o, title: o.title || 'À RETENIR', color: o.color || '#ff2f8f' }, t); }

  // ------------------------------------------------ carton plein écran
  card(c, o, t) {
    const u = this.u, W = this.W, H = this.H, local = t - o.t0, dur = o.t1 - o.t0;
    const k = fadeIO(t, o.t0, o.t1, 0.12, 0.2);
    c.globalAlpha = k;
    const g = c.createRadialGradient(W / 2, H / 2, 50 * u, W / 2, H / 2, H * 0.7); g.addColorStop(0, '#2a0f3a'); g.addColorStop(1, '#05020a');
    c.fillStyle = g; c.fillRect(0, 0, W, H);
    // lignes de balayage
    c.globalAlpha = k * 0.08; c.fillStyle = '#fff'; for (let y = (local * 120) % 8; y < H; y += 8 * u) c.fillRect(0, y, W, 2 * u);
    c.globalAlpha = k;
    const s = 1 + 0.06 * local / dur;
    c.translate(W / 2, H / 2); c.scale(s, s);
    c.font = `${150 * u}px ${FONT_TITLE}`; c.textAlign = 'center'; c.textBaseline = 'middle';
    const lines = wrap(c, String(o.text).toUpperCase(), W * 0.82);
    const glitch = local < 0.25 ? (Math.sin(local * 90) * 14 * u) : 0;
    lines.forEach((l, i) => {
      const y = (i - (lines.length - 1) / 2) * 160 * u;
      c.fillStyle = '#ff2f8f'; c.fillText(l, glitch + 5 * u, y + 4 * u);
      c.fillStyle = '#2fe0ff'; c.fillText(l, -glitch - 5 * u, y - 4 * u);
      c.fillStyle = '#fff'; c.fillText(l, 0, y);
    });
  }

  // ------------------------------------------------ générique
  title(c, o, t) {
    const u = this.u, W = this.W, H = this.H, local = t - o.t0;
    const k = fadeIO(t, o.t0, o.t1, 0.15, 0.3);
    c.globalAlpha = k;
    const g = c.createLinearGradient(0, 0, 0, H); g.addColorStop(0, '#1a0630'); g.addColorStop(0.55, '#4a0b4f'); g.addColorStop(1, '#0a0214');
    c.fillStyle = g; c.fillRect(0, 0, W, H);
    // rayons lumineux
    c.save(); c.translate(W / 2, H * 0.42); c.rotate(local * 0.15);
    for (let i = 0; i < 16; i++) { c.rotate(Math.PI / 8); c.fillStyle = i % 2 ? 'rgba(255,61,168,0.10)' : 'rgba(255,200,80,0.07)'; c.beginPath(); c.moveTo(0, 0); c.lineTo(-90 * u, -H); c.lineTo(90 * u, -H); c.fill(); }
    c.restore();
    // cœurs flottants
    for (let i = 0; i < 18; i++) { const x = ((i * 137) % 1000) / 1000 * W, y = H - ((local * (80 + i * 9) + i * 211) % (H + 200)); c.globalAlpha = k * 0.6; heart(c, x, y, (20 + (i % 4) * 10) * u, i % 2 ? '#ff3da8' : '#ffd166'); }
    c.globalAlpha = k;
    const s = ease(local / 0.5);
    c.translate(W / 2, H * 0.42); c.scale(s, s); c.rotate(-0.05);
    c.textAlign = 'center'; c.textBaseline = 'middle';
    const neon = (txt, size, y, col) => { c.font = `${size}px ${FONT_TITLE}`; c.shadowColor = col; c.shadowBlur = 40 * u; c.fillStyle = col; c.fillText(txt, 0, y); c.shadowBlur = 0; c.fillStyle = '#fff'; c.fillText(txt, 0, y); };
    c.font = `800 ${56 * u}px ${FONT_ROUND}`; c.fillStyle = '#ffd166'; c.fillText('LA', 0, -305 * u);
    neon('VILLA', 250 * u, -90 * u, '#ff3da8');
    c.font = `800 ${62 * u}px ${FONT_ROUND}`; c.fillStyle = '#ffd166'; c.fillText('DES', 0, 50 * u);
    neon('PATHOLOGIES', 150 * u, 160 * u, '#2fe0ff');
    c.rotate(0.05);
    if (o.subtitle) {
      const sk = clamp((local - 0.5) / 0.4);
      c.globalAlpha = k * sk;
      c.font = `800 ${46 * u}px ${FONT_TEXT}`; const w = c.measureText(o.subtitle.toUpperCase()).width + 80 * u;
      c.fillStyle = '#ffffff'; rr(c, -w / 2, 290 * u, w, 90 * u, 45 * u); c.fill();
      c.fillStyle = '#4a0b4f'; c.fillText(o.subtitle.toUpperCase(), 0, 337 * u);
    }
  }

  // ------------------------------------------------ jauge (ex. glycémie)
  gauge(c, o, t) {
    const u = this.u, W = this.W; const k = fadeIO(t, o.t0, o.t1, 0.3, 0.3);
    const p = smooth(clamp((t - o.t0) / Math.max(0.5, (o.t1 - o.t0) * 0.6)));
    const v = lerp(o.from ?? 0.3, o.to ?? 0.9, p);
    c.globalAlpha = k;
    const x = W * 0.08, y = this.H * 0.4, w = W * 0.84, h = 54 * u;
    c.fillStyle = 'rgba(10,6,20,0.72)'; rr(c, x - 20 * u, y - 70 * u, w + 40 * u, h + 100 * u, 30 * u); c.fill();
    c.fillStyle = '#fff'; c.font = `${44 * u}px ${FONT_TITLE}`; c.textAlign = 'left'; c.textBaseline = 'alphabetic';
    c.fillText((o.label || 'JAUGE').toUpperCase(), x, y - 18 * u);
    const g = c.createLinearGradient(x, 0, x + w, 0); g.addColorStop(0, '#2bd96b'); g.addColorStop(0.5, '#ffd23d'); g.addColorStop(1, '#ff2a3a');
    c.fillStyle = 'rgba(255,255,255,0.15)'; rr(c, x, y, w, h, h / 2); c.fill();
    c.save(); rr(c, x, y, w, h, h / 2); c.clip(); c.fillStyle = g; c.fillRect(x, y, w * v, h); c.restore();
    const danger = v > 0.75;
    c.textAlign = 'right'; c.font = `${44 * u}px ${FONT_TITLE}`;
    c.fillStyle = danger ? (Math.floor(t * 4) % 2 ? '#ff2a3a' : '#fff') : '#fff';
    c.fillText(o.valueText ? o.valueText(v) : (danger ? 'DANGER' : v > 0.5 ? 'ÇA MONTE' : 'NORMAL'), x + w, y - 18 * u);
  }

  /** Miniature : gros titre accrocheur + logo de la série + numéro d'épisode. */
  cover(c, o) {
    // miniature TikTok : gros titre penché, visage choc au centre, accroche dans un bandeau, sticker « ?! »
    const u = this.u, W = this.W, H = this.H;
    const g = c.createLinearGradient(0, 0, 0, H); g.addColorStop(0, 'rgba(10,2,20,0.88)'); g.addColorStop(0.27, 'rgba(10,2,20,0)'); g.addColorStop(0.6, 'rgba(10,2,20,0)'); g.addColorStop(1, 'rgba(10,2,20,0.92)');
    c.fillStyle = g; c.fillRect(0, 0, W, H);
    // vignette colorée sur les bords (couleur du personnage)
    const vg = c.createRadialGradient(W / 2, H * 0.45, W * 0.35, W / 2, H * 0.45, W * 0.95); vg.addColorStop(0, 'rgba(0,0,0,0)'); vg.addColorStop(1, (o.color || '#ff3da8') + '88');
    c.fillStyle = vg; c.fillRect(0, 0, W, H);
    c.textAlign = 'center'; c.textBaseline = 'middle';
    // pastille série + épisode
    const top = `LA VILLA DES PATHOLOGIES${o.episode ? '  ·  ÉP. ' + o.episode : ''}`;
    c.font = `800 ${38 * u}px ${FONT_ROUND}`; const tw = c.measureText(top).width + 60 * u;
    c.fillStyle = '#ff3da8'; rr(c, W / 2 - tw / 2, H * 0.035, tw, 66 * u, 33 * u); c.fill();
    c.fillStyle = '#fff'; c.fillText(top, W / 2, H * 0.035 + 35 * u);
    // titre (pathologie), penché, 1 ou 2 lignes équilibrées
    const words = String(o.title).toUpperCase().split(/\s+/);
    let size = 170 * u, lines = [words.join(' ')];
    const fits = (ls, sz) => { c.font = `${sz}px ${FONT_TITLE}`; return ls.every((l) => c.measureText(l).width <= W * 0.88); };
    if (!fits(lines, size)) {
      let best = null;
      for (let k = 1; k < words.length; k++) { const ls = [words.slice(0, k).join(' '), words.slice(k).join(' ')]; c.font = `${size}px ${FONT_TITLE}`; const m = Math.max(...ls.map((l) => c.measureText(l).width)); if (!best || m < best.m) best = { ls, m }; }
      lines = best ? best.ls : lines;
      while (!fits(lines, size) && size > 70 * u) size -= 6 * u;
    }
    c.save(); c.translate(W / 2, H * 0.105 + size * (lines.length > 1 ? 1.0 : 0.55)); c.rotate(-0.045);
    c.font = `${size}px ${FONT_TITLE}`;
    lines.forEach((l, i) => {
      const y = (i - (lines.length - 1) / 2) * size * 1.0;
      c.lineWidth = size * 0.2; c.strokeStyle = '#000'; c.lineJoin = 'round'; c.strokeText(l, 0, y + 6 * u);
      c.fillStyle = '#ffffff'; c.shadowColor = o.color || '#ff3da8'; c.shadowBlur = 40 * u; c.fillText(l, 0, y); c.shadowBlur = 0;
    });
    c.restore();
    // sticker « ?! » près du visage
    c.save(); c.translate(W * 0.8, H * 0.36); c.rotate(0.18);
    c.fillStyle = '#ffe44d'; c.strokeStyle = '#000'; c.lineWidth = 8 * u; c.beginPath();
    const n = 12; for (let i = 0; i <= n * 2; i++) { const a = (i / (n * 2)) * Math.PI * 2; const r = (i % 2 ? 62 : 100) * u; const px = Math.cos(a) * r * 1.15, py = Math.sin(a) * r; if (i) c.lineTo(px, py); else c.moveTo(px, py); }
    c.closePath(); c.fill(); c.stroke();
    c.font = `${92 * u}px ${FONT_TITLE}`; c.fillStyle = '#e8102a'; c.fillText(o.sticker || '?!', 0, 6 * u);
    c.restore();
    // accroche : bandeau rouge penché, dernier mot surligné en jaune
    if (o.hook) {
      const txt = o.hook.toUpperCase().replace(/[.…]+$/, '').replace(/ ([?!:;»])/g, '\u00a0$1');
      c.font = `${96 * u}px ${FONT_TITLE}`; const hl = wrap(c, txt, W * 0.8);
      const lh = 104 * u, bh = hl.length * lh + 50 * u, by = H * 0.79 - bh / 2;
      c.save(); c.translate(W / 2, by + bh / 2); c.rotate(-0.035); c.translate(-W / 2, -(by + bh / 2));
      c.shadowColor = 'rgba(0,0,0,0.5)'; c.shadowBlur = 30 * u; c.shadowOffsetY = 12 * u;
      c.fillStyle = '#e8102a'; rr(c, W * 0.05, by, W * 0.9, bh, 28 * u); c.fill(); c.shadowBlur = 0; c.shadowOffsetY = 0;
      c.strokeStyle = '#fff'; c.lineWidth = 6 * u; rr(c, W * 0.05, by, W * 0.9, bh, 28 * u); c.stroke();
      const last = hl.length - 1; const lastWords = hl[last].split(' '); const emph = lastWords.pop();
      hl.forEach((l, i) => {
        const y = by + 25 * u + lh * (i + 0.5) + 4 * u;
        if (i !== last) { c.fillStyle = '#fff'; c.fillText(l, W / 2, y); return; }
        const pre = lastWords.join(' '); const pw = pre ? c.measureText(pre + ' ').width : 0, ew = c.measureText(emph).width; const x0 = W / 2 - (pw + ew) / 2;
        c.textAlign = 'left'; c.fillStyle = '#fff'; if (pre) c.fillText(pre + ' ', x0, y); c.fillStyle = '#ffe44d'; c.fillText(emph, x0 + pw, y); c.textAlign = 'center';
      });
      c.restore();
    }
    // flèche « regarde ! » vers le visage
    c.save(); c.translate(W * 0.15, H * 0.62); c.rotate(0.8);
    c.fillStyle = '#ffe44d'; c.strokeStyle = '#000'; c.lineWidth = 7 * u; c.beginPath();
    c.moveTo(-18 * u, 70 * u); c.lineTo(-18 * u, -20 * u); c.lineTo(-48 * u, -20 * u); c.lineTo(0, -80 * u); c.lineTo(48 * u, -20 * u); c.lineTo(18 * u, -20 * u); c.lineTo(18 * u, 70 * u); c.closePath(); c.fill(); c.stroke();
    c.restore();
  }

  // accroche plein cadre des premières secondes
  hook(c, o, t) {
    const u = this.u, W = this.W; const k = fadeIO(t, o.t0, o.t1, 0.12, 0.3); const s = ease((t - o.t0) / 0.35);
    c.globalAlpha = k;
    c.font = `${86 * u}px ${FONT_TITLE}`;
    const lines = wrap(c, String(o.text).toUpperCase(), W * 0.84);
    const h = lines.length * 92 * u + 50 * u, y = this.H * 0.2;
    c.translate(W / 2, y + h / 2); c.scale(lerp(0.7, 1, s), lerp(0.7, 1, s)); c.rotate(-0.025); c.translate(-W / 2, -(y + h / 2));
    c.fillStyle = '#ffe44d'; c.shadowColor = 'rgba(0,0,0,0.5)'; c.shadowBlur = 24 * u; rr(c, W * 0.06, y, W * 0.88, h, 26 * u); c.fill(); c.shadowBlur = 0;
    c.fillStyle = '#1a0a24'; c.textAlign = 'center'; c.textBaseline = 'middle';
    lines.forEach((l, i) => c.fillText(l, W / 2, y + 25 * u + 46 * u + i * 92 * u));
  }

  // question finale (incite à commenter)
  question(c, o, t) {
    const u = this.u, W = this.W; const k = fadeIO(t, o.t0, o.t1, 0.25, 0.2); const s = ease((t - o.t0) / 0.4);
    c.globalAlpha = k;
    c.font = `800 ${44 * u}px ${FONT_TEXT}`;
    const lines = wrap(c, o.text, W * 0.7);
    const w = W * 0.84, h = lines.length * 54 * u + 50 * u, x = W * 0.08, y = this.H * 0.33;
    c.translate(W / 2, y); c.scale(s, s); c.translate(-W / 2, -y);
    c.fillStyle = '#ffffff'; c.shadowColor = 'rgba(0,0,0,0.45)'; c.shadowBlur = 24 * u; rr(c, x, y, w, h, 30 * u); c.fill(); c.shadowBlur = 0;
    c.beginPath(); c.moveTo(x + 70 * u, y + h); c.lineTo(x + 50 * u, y + h + 40 * u); c.lineTo(x + 120 * u, y + h); c.fill();
    // icône bulle
    c.fillStyle = '#ff3da8'; c.beginPath(); c.arc(x + 62 * u, y + h / 2, 30 * u, 0, Math.PI * 2); c.fill();
    c.fillStyle = '#fff'; for (let i = -1; i <= 1; i++) { c.beginPath(); c.arc(x + 62 * u + i * 11 * u, y + h / 2, 4.5 * u, 0, Math.PI * 2); c.fill(); }
    c.fillStyle = '#1d1430'; c.textAlign = 'left'; c.textBaseline = 'middle';
    lines.forEach((l, i) => c.fillText(l, x + 112 * u, y + 25 * u + 27 * u + i * 54 * u));
  }

  // sticker de réaction (près de la tête du personnage quand sa position est connue)
  sticker(c, o, t, ev) {
    const u = this.u, W = this.W, H = this.H; const local = t - o.t0; const k = fadeIO(t, o.t0, o.t1, 0.08, 0.25); const s = ease(local / 0.3);
    let x = (o.x ?? 0.78) * W, y = (o.y ?? 0.32) * H;
    const hp = ev?.heads?.[o.who];
    if (hp && hp.visible) { x = clamp(hp.x + (hp.x < W / 2 ? 1 : -1) * 170 * u, 140 * u, W - 140 * u); y = clamp(hp.y - 150 * u, H * 0.16, H * 0.55); }
    c.globalAlpha = k; c.translate(x, y); c.rotate(Math.sin(local * 9) * 0.05 - 0.12); c.scale(s, s);
    if (o.icon === 'drop') {
      c.fillStyle = o.color; c.beginPath(); c.moveTo(0, -60 * u); c.bezierCurveTo(40 * u, -10 * u, 40 * u, 30 * u, 0, 40 * u); c.bezierCurveTo(-40 * u, 30 * u, -40 * u, -10 * u, 0, -60 * u); c.fill();
      c.fillStyle = 'rgba(255,255,255,0.7)'; c.beginPath(); c.ellipse(-12 * u, 10 * u, 8 * u, 14 * u, 0.3, 0, Math.PI * 2); c.fill();
    } else {
      // étoile « BD »
      c.fillStyle = o.color; c.strokeStyle = '#000'; c.lineWidth = 7 * u; c.beginPath();
      const n = 12; for (let i = 0; i <= n * 2; i++) { const a = (i / (n * 2)) * Math.PI * 2; const r = (i % 2 ? 70 : 110) * u; const px = Math.cos(a) * r * 1.25, py = Math.sin(a) * r; if (i) c.lineTo(px, py); else c.moveTo(px, py); }
      c.closePath(); c.fill(); c.stroke();
    }
    if (o.text) { c.font = `${o.icon ? 46 : 70}px ${FONT_TITLE}`.replace(/^(\d+)px/, (m, n) => `${n * u}px`); c.textAlign = 'center'; c.textBaseline = 'middle'; c.lineWidth = 10 * u; c.strokeStyle = '#000'; const ty = o.icon ? 90 * u : 4 * u; c.strokeText(o.text, 0, ty); c.fillStyle = '#fff'; c.fillText(o.text, 0, ty); }
  }

  sources(c, o, t) {
    const u = this.u; const k = fadeIO(t, o.t0, o.t1, 0.4, 0.4); c.globalAlpha = k * 0.92;
    c.font = `700 ${26 * u}px ${FONT_TEXT}`; const lines = wrap(c, o.text, this.W * 0.6);
    const w = Math.max(...lines.map((l) => c.measureText(l).width)) + 36 * u, h = lines.length * 34 * u + 20 * u;
    const x = 36 * u, y = this.H * 0.085;
    c.fillStyle = 'rgba(0,0,0,0.5)'; rr(c, x, y, w, h, 14 * u); c.fill();
    c.fillStyle = '#fff'; c.textAlign = 'left'; c.textBaseline = 'top';
    lines.forEach((l, i) => c.fillText(l, x + 18 * u, y + 12 * u + i * 34 * u));
  }

  banner(c, o, t) {
    const u = this.u, W = this.W; const k = fadeIO(t, o.t0, o.t1, 0.25, 0.25); c.globalAlpha = k;
    c.font = `${50 * u}px ${FONT_TITLE}`; const w = c.measureText(o.text).width + 80 * u, h = 76 * u, x = W / 2 - w / 2, y = this.H * 0.085;
    c.fillStyle = 'rgba(255,209,102,0.95)'; rr(c, x, y, w, h, 12 * u); c.fill();
    c.fillStyle = '#2a0f3a'; c.textAlign = 'center'; c.textBaseline = 'middle'; c.fillText(o.text, W / 2, y + h / 2 + 2 * u);
    // effet « magnétoscope »
    c.globalAlpha = k * 0.12; c.fillStyle = '#fff'; for (let yy = (t * 90) % 10; yy < this.H; yy += 10 * u) c.fillRect(0, yy, W, 2 * u);
  }

  badge(c, o, t) {
    const u = this.u; const k = fadeIO(t, o.t0, o.t1, 0.3, 0.3); c.globalAlpha = k * 0.95;
    c.font = `800 ${30 * u}px ${FONT_TEXT}`; const w = c.measureText(o.text).width + 50 * u;
    const x = this.W - w - 36 * u, y = this.H * 0.03;
    c.fillStyle = 'rgba(0,0,0,0.45)'; rr(c, x, y, w, 56 * u, 28 * u); c.fill();
    c.fillStyle = '#fff'; c.textAlign = 'center'; c.textBaseline = 'middle'; c.fillText(o.text, x + w / 2, y + 29 * u);
  }

  cta(c, o, t) {
    const u = this.u, W = this.W, local = t - o.t0; const s = ease(local / 0.45); const k = fadeIO(t, o.t0, o.t1, 0.2, 0.3);
    c.globalAlpha = k;
    const y = this.H * 0.49;
    c.translate(W / 2, y); c.scale(s * (1 + Math.sin(local * 6) * 0.025), s * (1 + Math.sin(local * 6) * 0.025));
    c.font = `${96 * u}px ${FONT_TITLE}`; const label = o.text || 'ABONNE-TOI !'; const w = c.measureText(label).width + 150 * u, h = 150 * u;
    c.shadowColor = 'rgba(0,0,0,0.5)'; c.shadowBlur = 30 * u;
    c.fillStyle = '#ff2f5f'; rr(c, -w / 2, -h / 2, w, h, h / 2); c.fill(); c.shadowBlur = 0;
    c.fillStyle = '#fff'; c.textAlign = 'center'; c.textBaseline = 'middle'; c.fillText(label, 30 * u, 6 * u);
    bell(c, -w / 2 + 70 * u, 0, 38 * u, local);
    if (o.next) {
      c.font = `800 ${40 * u}px ${FONT_TEXT}`; const nl = wrap(c, o.next, W * 0.8);
      c.fillStyle = '#fff'; c.strokeStyle = '#000'; c.lineWidth = 10 * u; c.lineJoin = 'round';
      nl.forEach((l, i) => { c.strokeText(l, 0, h / 2 + 70 * u + i * 50 * u); c.fillText(l, 0, h / 2 + 70 * u + i * 50 * u); });
    }
  }
}

function fakeWords(text, t0, t1) {
  const ws = String(text || '').split(/\s+/).filter(Boolean); const tot = ws.reduce((a, w) => a + w.length + 2, 0) || 1;
  let t = t0; return ws.map((w) => { const d = ((w.length + 2) / tot) * (t1 - t0); const o = { w, t, d }; t += d; return o; });
}
function shade(hex, k) { const n = parseInt(hex.slice(1), 16); let r = n >> 16, g = (n >> 8) & 255, b = n & 255; const f = (v) => Math.round(clamp(v + v * k, 0, 255)); return `rgb(${f(r)},${f(g)},${f(b)})`; }
function heart(c, x, y, s, col) {
  c.save(); c.translate(x, y); c.scale(s / 30, s / 30); c.fillStyle = col; c.beginPath();
  c.moveTo(0, 8); c.bezierCurveTo(0, 0, -15, -4, -15, 8); c.bezierCurveTo(-15, 18, 0, 24, 0, 32); c.bezierCurveTo(0, 24, 15, 18, 15, 8); c.bezierCurveTo(15, -4, 0, 0, 0, 8); c.fill(); c.restore();
}
function bulb(c, x, y, s) {
  c.save(); c.translate(x, y); c.fillStyle = '#ffd23d'; c.beginPath(); c.arc(0, -s * 0.2, s * 0.62, 0, Math.PI * 2); c.fill();
  c.fillStyle = '#fff'; c.fillRect(-s * 0.3, s * 0.35, s * 0.6, s * 0.35); c.restore();
}
function bell(c, x, y, s, t) {
  c.save(); c.translate(x, y); c.rotate(Math.sin(t * 14) * 0.25 * Math.max(0, 1 - (t % 1.5))); c.fillStyle = '#fff';
  c.beginPath(); c.moveTo(-s * 0.7, s * 0.45); c.quadraticCurveTo(-s * 0.6, -s * 0.8, 0, -s * 0.8); c.quadraticCurveTo(s * 0.6, -s * 0.8, s * 0.7, s * 0.45); c.closePath(); c.fill();
  c.beginPath(); c.arc(0, s * 0.62, s * 0.18, 0, Math.PI * 2); c.fill(); c.restore();
}
