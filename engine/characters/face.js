// Visage animé : yeux (globe, iris, pupille, paupières, cils, reflet), sourcils et bouche dynamique.
import * as THREE from 'three';
import { varTube, projectOnSurface, clamp, lerp } from '../core/geo.js';
import { irisTexture, makeCanvas } from '../core/textures.js';
import { eyeWhite } from '../core/materials.js';

const lashMat = new THREE.MeshStandardMaterial({ color: '#140c10', roughness: 0.6 });

export class Eye {
  constructor({ r = 0.1, iris = '#6b3b1a', irisScale = 0.62, lidMat, lashes = false, side = 1, lashColor = '#140c10' }) {
    this.r = r; this.side = side;
    this.group = new THREE.Group();
    // globe oculaire
    this.ball = new THREE.Mesh(new THREE.SphereGeometry(r, 48, 32), eyeWhite());
    this.ball.castShadow = false; this.ball.receiveShadow = true;
    this.group.add(this.ball);
    // iris + pupille (calotte orientée vers +Z, tourne avec le regard)
    this.gaze = new THREE.Group(); this.group.add(this.gaze);
    const irisTheta = 0.62 * irisScale + 0.18;
    const cap = (rad, theta, mat) => {
      const g = new THREE.SphereGeometry(rad, 48, 16, 0, Math.PI * 2, 0, theta);
      g.rotateX(Math.PI / 2);
      const p = g.attributes.position, uv = g.attributes.uv, R = rad * Math.sin(theta);
      for (let i = 0; i < p.count; i++) uv.setXY(i, 0.5 + p.getX(i) / (2 * R), 0.5 + p.getY(i) / (2 * R));
      return new THREE.Mesh(g, mat);
    };
    this.irisMesh = cap(r * 1.004, irisTheta, new THREE.MeshPhysicalMaterial({ map: irisTexture(iris), roughness: 0.15, clearcoat: 1, clearcoatRoughness: 0.03 }));
    this.pupil = cap(r * 1.007, irisTheta * 0.42, new THREE.MeshPhysicalMaterial({ color: '#050307', roughness: 0.1, clearcoat: 1, clearcoatRoughness: 0.02 }));
    this.gaze.add(this.irisMesh, this.pupil);
    // reflets « étincelle » (fixes, typiques des films d'animation)
    const spark = new THREE.MeshBasicMaterial({ color: '#ffffff', toneMapped: false });
    const s1 = new THREE.Mesh(new THREE.SphereGeometry(r * 0.13, 16, 12), spark);
    s1.position.set(-0.32 * r * side, 0.38 * r, 0.9 * r); s1.scale.z = 0.4;
    const s2 = new THREE.Mesh(new THREE.SphereGeometry(r * 0.06, 12, 8), spark);
    s2.position.set(0.22 * r * side, -0.2 * r, 0.97 * r); s2.scale.z = 0.4;
    this.group.add(s1, s2); this.sparks = [s1, s2];
    // paupières (calottes de la matière du corps)
    const lr = r * 1.075;
    this.upperLid = new THREE.Mesh(new THREE.SphereGeometry(lr, 48, 16, 0, Math.PI * 2, 0, Math.PI / 2), lidMat);
    this.lowerLid = new THREE.Mesh(new THREE.SphereGeometry(lr * 0.995, 48, 16, 0, Math.PI * 2, Math.PI / 2, Math.PI / 2), lidMat);
    this.upperLid.castShadow = this.lowerLid.castShadow = false;
    this.group.add(this.upperLid, this.lowerLid);
    // ligne de cils sur le bord de la paupière
    const lashLine = new THREE.Mesh(new THREE.TorusGeometry(lr, r * (lashes ? 0.07 : 0.035), 8, 48, Math.PI), new THREE.MeshStandardMaterial({ color: lashColor, roughness: 0.5 }));
    lashLine.rotation.x = Math.PI / 2; // dans le plan XZ, moitié avant
    this.upperLid.add(lashLine);
    if (lashes) {
      for (let i = 0; i < 4; i++) {
        const a = (0.15 + i * 0.12) * Math.PI; // vers l'extérieur de l'œil
        const ang = side > 0 ? a : Math.PI - a;
        const l = new THREE.Mesh(new THREE.ConeGeometry(r * 0.05, r * (0.5 - i * 0.05), 6), lashMat);
        l.position.set(Math.cos(ang) * lr, 0, Math.sin(ang) * lr);
        l.rotation.set(-0.3, 0, -side * (0.5 + i * 0.25)); l.translateY(r * 0.2);
        this.upperLid.add(l);
      }
    }
    this.set({});
  }
  /** open: 0 fermé .. 1 grand ouvert ; lower: 0..1 (remontée de la paupière inférieure) ; lookX/lookY en radians */
  set({ open = 0.85, lower = 0.1, lookX = 0, lookY = 0, dilate = 1, tilt = 0 }) {
    const o = clamp(open, 0, 1.15);
    this.upperLid.rotation.set(lerp(Math.PI / 2 * 0.98, -1.05, o), 0, tilt * this.side);
    this.lowerLid.rotation.set(lerp(1.35, 0.35, clamp(lower)), 0, 0);
    this.gaze.rotation.set(-lookY, lookX, 0);
    this.pupil.scale.setScalar(dilate);
  }
}

export class Brow {
  constructor({ w = 0.16, thick = 0.022, color = '#2a1a12', side = 1, curve = 0.03 }) {
    this.side = side; this.group = new THREE.Group();
    // sourcil : ellipsoïde allongé, arqué et effilé vers l'extérieur
    const hw = w / 2;
    const geo = new THREE.SphereGeometry(1, 40, 16);
    const p = geo.attributes.position;
    for (let i = 0; i < p.count; i++) {
      const x = p.getX(i), y = p.getY(i), z = p.getZ(i);
      const u = x * side; // -1 intérieur .. +1 extérieur
      const taper = 1 - 0.55 * (u * 0.5 + 0.5);
      p.setXYZ(i, x * hw, y * thick * taper + curve * (1 - x * x) - curve * 0.5, z * thick * 0.55 * taper);
    }
    geo.computeVertexNormals();
    this.mesh = new THREE.Mesh(geo, new THREE.MeshPhysicalMaterial({ color, roughness: 0.55, sheen: 0.6, sheenColor: new THREE.Color(color).lerp(new THREE.Color('#ffffff'), 0.4) }));
    this.mesh.castShadow = false;
    this.group.add(this.mesh);
    this.base = new THREE.Vector3();
  }
  /** raise: -1..1 ; angry: -1 (triste) .. 1 (colère) */
  set({ raise = 0, angry = 0 }, scale = 0.1) {
    this.group.position.copy(this.base);
    this.group.position.y += raise * scale * 0.35;
    this.group.rotation.z = angry * 0.32 * this.side;
    this.group.position.y -= Math.max(0, angry) * scale * 0.08;
  }
}

/** Bouche peinte en direct sur un « patch » épousant la surface du visage. */
export class Mouth {
  constructor({ w = 0.3, h = 0.18, surfaceZ, center = [0, 0], style = 'line', lipColor = '#b8233d', innerColor = '#3a0b14', lineColor = '#3d1a10', material = null }) {
    this.style = style; this.lipColor = lipColor; this.innerColor = innerColor; this.lineColor = lineColor;
    [this.canvas, this.ctx] = makeCanvas(512, 320);
    this.tex = new THREE.CanvasTexture(this.canvas); this.tex.colorSpace = THREE.SRGBColorSpace; this.tex.anisotropy = 8;
    const geo = new THREE.PlaneGeometry(w, w * (320 / 512), 40, 24);
    geo.translate(center[0], center[1], 0);
    projectOnSurface(geo, surfaceZ, 0.003);
    this.mat = material || new THREE.MeshPhysicalMaterial({ map: this.tex, transparent: true, roughness: 0.3, clearcoat: 0.7, clearcoatRoughness: 0.1, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -4 });
    this.mat.map = this.tex;
    this.mesh = new THREE.Mesh(geo, this.mat);
    this.mesh.renderOrder = 2;
    this.last = '';
    this.draw({});
  }
  /** open 0..1, wide 0..1, smile -1..1, round 0..1, teeth 0..1, tongue 0..1, asym -1..1 */
  draw({ open = 0, wide = 0.5, smile = 0.1, round = 0, teeth = 0.7, tongue = 0.6, asym = 0 }) {
    const key = [open, wide, smile, round, asym].map((v) => v.toFixed(3)).join();
    if (key === this.last) return; this.last = key;
    const c = this.ctx, W = 512, H = 320, cx = W / 2, cy = H * 0.42;
    c.clearRect(0, 0, W, H);
    const o = clamp(open, 0, 1), r = clamp(round, 0, 1);
    const hw = 150 * (0.72 + 0.55 * wide) * (1 - 0.42 * r);
    const lift = (s) => -smile * 34 + s * asym * 16;
    const L = [cx - hw, cy + lift(-1)], R = [cx + hw, cy + lift(1)];
    const upY = cy - o * 46 * (1 + 0.5 * r) - 4 - Math.max(0, smile) * 4;
    const loY = cy + o * 120 * (1 + 0.15 * r) + Math.max(0, smile) * 22 * (1 - o * 0.4) - Math.min(0, smile) * -6;
    const full = this.style === 'full';
    const pathInner = () => {
      c.beginPath(); c.moveTo(...L);
      c.bezierCurveTo(cx - hw * 0.5, upY, cx + hw * 0.5, upY, ...R);
      c.bezierCurveTo(cx + hw * 0.55, loY, cx - hw * 0.55, loY, ...L); c.closePath();
    };
    if (full) {
      // lèvres pulpeuses
      const tu = 24 + o * 4, tl = 32;
      c.beginPath(); c.moveTo(L[0] - 10, L[1]);
      c.bezierCurveTo(cx - hw * 0.6, upY - tu * 1.2, cx - 22, upY - tu * 1.25, cx, upY - tu * 0.65);
      c.bezierCurveTo(cx + 22, upY - tu * 1.25, cx + hw * 0.6, upY - tu * 1.2, R[0] + 10, R[1]);
      c.bezierCurveTo(cx + hw * 0.6, loY + tl * 1.3, cx - hw * 0.6, loY + tl * 1.3, L[0] - 10, L[1]);
      c.closePath();
      const g = c.createLinearGradient(0, upY - tu, 0, loY + tl);
      const lc = new THREE.Color(this.lipColor);
      g.addColorStop(0, '#' + lc.clone().multiplyScalar(0.75).getHexString()); g.addColorStop(0.5, '#' + lc.getHexString()); g.addColorStop(1, '#' + lc.clone().multiplyScalar(0.8).getHexString());
      c.fillStyle = g; c.fill();
    }
    if (o > 0.03) {
      pathInner();
      const g = c.createRadialGradient(cx, cy + o * 40, 4, cx, cy + o * 40, hw);
      g.addColorStop(0, '#120306'); g.addColorStop(1, this.innerColor);
      c.fillStyle = g; c.fill();
      c.save(); pathInner(); c.clip();
      // dents du haut
      if (teeth > 0) { c.fillStyle = '#fbf7ef'; c.beginPath(); c.ellipse(cx, upY - 4, hw * 0.78, 16 + o * 14, 0, 0, Math.PI); c.fill(); c.fillStyle = 'rgba(0,0,0,0.08)'; c.fillRect(cx - hw, upY + 18 + o * 10, hw * 2, 4); }
      // langue
      if (tongue > 0) { const tg = c.createRadialGradient(cx, loY - 10, 4, cx, loY, hw * 0.7); tg.addColorStop(0, '#f27a8a'); tg.addColorStop(1, '#b8394d'); c.fillStyle = tg; c.beginPath(); c.ellipse(cx, loY + 4, hw * 0.62, 18 + o * 36, 0, Math.PI, 0); c.fill(); }
      c.restore();
      if (!full) { pathInner(); c.lineWidth = 7; c.strokeStyle = this.lineColor; c.stroke(); }
    } else {
      // bouche fermée : trait (ou jonction des lèvres)
      c.beginPath(); c.moveTo(...L); c.bezierCurveTo(cx - hw * 0.45, cy + smile * 30 + 2, cx + hw * 0.45, cy + smile * 30 + 2, ...R);
      c.lineCap = 'round'; c.lineWidth = full ? 6 : 10; c.strokeStyle = full ? '#4a0a16' : this.lineColor; c.stroke();
    }
    if (!full) {
      // fossettes aux coins
      c.lineWidth = 6; c.lineCap = 'round'; c.strokeStyle = this.lineColor;
      for (const [P, s] of [[L, -1], [R, 1]]) { c.beginPath(); c.arc(P[0] + s * 4, P[1] - 6 * Math.sign(smile || 1), 12, s > 0 ? -0.8 : Math.PI - 0.8 + 1.6, s > 0 ? 0.8 : Math.PI + 0.8, false); c.globalAlpha = 0.55 * clamp(Math.abs(smile) + 0.2); c.stroke(); c.globalAlpha = 1; }
    } else {
      // brillance des lèvres
      c.fillStyle = 'rgba(255,255,255,0.45)'; c.beginPath(); c.ellipse(cx - hw * 0.2, loY + 16, hw * 0.25, 7, -0.05, 0, Math.PI * 2); c.fill();
      c.fillStyle = 'rgba(255,255,255,0.25)'; c.beginPath(); c.ellipse(cx + hw * 0.28, upY - 14, hw * 0.13, 5, 0.1, 0, Math.PI * 2); c.fill();
    }
    this.tex.needsUpdate = true;
  }
}

/** Joues rosées (décalcomanie douce). */
export function blush(surfaceZ, x, y, size = 0.09, color = 'rgba(255,90,120,0.55)') {
  const [c, ctx] = makeCanvas(128, 128);
  const g = ctx.createRadialGradient(64, 64, 2, 64, 64, 64); g.addColorStop(0, color); g.addColorStop(1, 'rgba(255,90,120,0)');
  ctx.fillStyle = g; ctx.fillRect(0, 0, 128, 128);
  const tex = new THREE.CanvasTexture(c); tex.colorSpace = THREE.SRGBColorSpace;
  const geo = new THREE.PlaneGeometry(size * 2, size * 1.4, 12, 8); geo.translate(x, y, 0);
  projectOnSurface(geo, surfaceZ, 0.002);
  const m = new THREE.Mesh(geo, new THREE.MeshStandardMaterial({ map: tex, transparent: true, depthWrite: false, roughness: 0.6, polygonOffset: true, polygonOffsetFactor: -2 }));
  m.renderOrder = 1; return m;
}
