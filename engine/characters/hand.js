// Main de dessin animé à 4 doigts, poses : ouverte, poing, pointe, tient un objet.
import * as THREE from 'three';
import { lerp } from '../core/geo.js';

export class Hand {
  constructor(size, material, side = 1) {
    this.side = side;
    this.group = new THREE.Group();
    const palm = new THREE.Mesh(new THREE.SphereGeometry(size, 32, 24), material);
    palm.scale.set(1, 1.05, 0.62); palm.position.y = -size * 0.55; palm.castShadow = true;
    this.group.add(palm);
    this.fingers = [];
    const fl = size * 0.95, fr = size * 0.27;
    const fingerGeo = new THREE.CapsuleGeometry(fr, fl, 8, 16); fingerGeo.translate(0, -fl / 2 - fr * 0.4, 0);
    for (let i = 0; i < 3; i++) {
      const pivot = new THREE.Group();
      pivot.position.set((i - 1) * size * 0.58, -size * 1.25, 0);
      pivot.rotation.z = (i - 1) * 0.12;
      const f = new THREE.Mesh(fingerGeo, material); f.castShadow = true;
      f.scale.y = i === 1 ? 1.08 : 0.95;
      pivot.add(f); this.group.add(pivot); this.fingers.push(pivot);
    }
    // pouce
    this.thumb = new THREE.Group();
    this.thumb.position.set(-side * size * 0.8, -size * 0.6, size * 0.2);
    const th = new THREE.Mesh(new THREE.CapsuleGeometry(fr * 1.05, fl * 0.7, 8, 16).translate(0, -fl * 0.35, 0), material); th.castShadow = true;
    this.thumb.add(th); this.thumb.rotation.z = side * 0.7; this.group.add(this.thumb);
    this.grip = new THREE.Group(); this.grip.position.set(0, -size * 1.35, size * 0.2); this.group.add(this.grip);
    this.size = size;
    this.set('open');
  }
  set(pose = 'open', amt = 1) {
    const P = {
      open: [0.15, 0.1, 0.12, 0.2], relaxed: [0.6, 0.5, 0.55, 0.4], fist: [2.2, 2.2, 2.2, 1.4],
      point: [2.2, 0.0, 2.2, 1.2], hold: [1.75, 1.75, 1.75, 1.3], spread: [0.05, 0.0, 0.05, -0.1],
    }[pose] || [0.4, 0.4, 0.4, 0.4];
    this.fingers.forEach((f, i) => { f.rotation.x = -P[i] * amt; });
    this.thumb.rotation.x = -P[3] * 0.6 * amt;
    // la position « point » n'utilise que l'index du milieu
  }
}
