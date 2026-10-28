// Moteur de rendu : renderer WebGL, post-traitement cinéma et profils de qualité.
import * as THREE from 'three';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';
import { GTAOPass } from 'three/addons/postprocessing/GTAOPass.js';
import { BokehPass } from 'three/addons/postprocessing/BokehPass.js';
import { SMAAPass } from 'three/addons/postprocessing/SMAAPass.js';
import { ShaderPass } from 'three/addons/postprocessing/ShaderPass.js';

// Profils : « brouillon » (rapide), « standard » (sans carte graphique), « max » (carte graphique)
export const QUALITY = {
  brouillon: { width: 540, shadow: 1024, ao: false, dof: false, smaa: false, bloom: true, fps: 24, transmission: false, iridescence: false, extraLights: false, hdr: false },
  standard: { width: 720, shadow: 2048, ao: false, dof: true, smaa: true, bloom: true, fps: 30, transmission: false, iridescence: false, extraLights: false, hdr: true },
  haute: { width: 720, shadow: 2048, ao: false, dof: true, smaa: true, bloom: true, fps: 25, transmission: true, iridescence: true, extraLights: true, hdr: true },
  max: { width: 1080, shadow: 4096, ao: true, dof: true, smaa: true, bloom: true, fps: 30, transmission: true, iridescence: true, extraLights: true, hdr: true },
};

// Étalonnage final : vignette, grain fin, légère courbe de contraste et chaleur.
const GradeShader = {
  uniforms: { tDiffuse: { value: null }, uTime: { value: 0 }, uVignette: { value: 0.32 }, uGrain: { value: 0.035 }, uWarm: { value: 0.03 }, uSat: { value: 1.08 }, uFlash: { value: 0 } },
  vertexShader: 'varying vec2 vUv; void main(){ vUv=uv; gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.); }',
  fragmentShader: `uniform sampler2D tDiffuse; uniform float uTime,uVignette,uGrain,uWarm,uSat,uFlash; varying vec2 vUv;
    float h(vec2 p){ return fract(sin(dot(p, vec2(12.9898,78.233)))*43758.5453); }
    void main(){ vec4 c = texture2D(tDiffuse, vUv);
      vec3 col = c.rgb;
      float l = dot(col, vec3(0.2126,0.7152,0.0722));
      col = mix(vec3(l), col, uSat);
      col.r += uWarm*0.5; col.b -= uWarm*0.5;
      col = mix(col, col*col*(3.0-2.0*col), 0.18);
      vec2 d = vUv-0.5; d.x *= 0.62; float v = smoothstep(0.85, 0.2, length(d)*1.6);
      col *= mix(1.0-uVignette, 1.0, v);
      col += (h(vUv*1000.0+uTime)-0.5)*uGrain;
      col = mix(col, vec3(1.0), uFlash);
      gl_FragColor = vec4(col, c.a); }`,
};

export class Renderer3D {
  constructor({ quality = 'standard', width, height, canvas } = {}) {
    this.q = { ...QUALITY[quality] || QUALITY.standard };
    this.W = width || this.q.width; this.H = height || Math.round(this.W * 16 / 9);
    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: false, preserveDrawingBuffer: true, powerPreference: 'high-performance', alpha: false });
    const r = this.renderer;
    r.setPixelRatio(1); r.setSize(this.W, this.H, false);
    r.shadowMap.enabled = true; r.shadowMap.type = this.q.extraLights ? THREE.PCFSoftShadowMap : THREE.PCFShadowMap;
    r.toneMapping = THREE.AgXToneMapping; r.toneMappingExposure = 1.0;
    r.outputColorSpace = THREE.SRGBColorSpace;
    this.camera = new THREE.PerspectiveCamera(32, this.W / this.H, 0.05, 200);
    this.scene = new THREE.Scene();
    this.pmrem = new THREE.PMREMGenerator(r);
    this.buildComposer();
  }

  buildComposer() {
    const { W, H, q } = this;
    const c = new EffectComposer(this.renderer, new THREE.WebGLRenderTarget(W, H, { type: q.hdr ? THREE.HalfFloatType : THREE.UnsignedByteType }));
    c.setPixelRatio(1); c.setSize(W, H);
    this.renderPass = new RenderPass(this.scene, this.camera); c.addPass(this.renderPass);
    if (q.ao) { this.ao = new GTAOPass(this.scene, this.camera, W, H); this.ao.blendIntensity = 0.85; c.addPass(this.ao); }
    if (q.dof) { this.bokeh = new BokehPass(this.scene, this.camera, { focus: 4, aperture: 0.0025, maxblur: 0.006 }); c.addPass(this.bokeh); }
    if (q.bloom) { const bd = q.hdr && q.extraLights ? 2 : 4; this.bloom = new UnrealBloomPass(new THREE.Vector2(W / bd, H / bd), 0.28, 0.45, 0.92); c.addPass(this.bloom); }
    c.addPass(new OutputPass());
    if (q.smaa) c.addPass(new SMAAPass(W, H));
    this.grade = new ShaderPass(GradeShader); c.addPass(this.grade);
    this.composer = c;
  }

  /** Adapte les matériaux / lumières au profil (transparence physique, irisation, lumières d'appoint). */
  optimize(root, isSet = false) {
    const q = this.q;
    root.traverse((o) => {
      if (isSet && !q.extraLights && o.isMesh && o.material && !Array.isArray(o.material) && o.material.isMeshPhysicalMaterial && !o.material.userData._lite) {
        // décors : un matériau standard suffit (le vernis/velours reste sur les personnages)
        const m = o.material; m.userData._lite = true;
        if (m.transmission === 0 && !m.transparent) { m.clearcoat = 0; m.sheen = 0; m.needsUpdate = true; }
      }
      if (o.isLight && o.userData.optional && !q.extraLights) o.visible = false;
      if (isSet && !q.extraLights) {
        // ombres : seule la lumière principale en projette, et seulement les objets proches des candidats
        if (o.isLight && o.castShadow && !o.userData.mainShadow) o.castShadow = false;
        if (o.isMesh && o.castShadow) { const p = new THREE.Vector3(); o.getWorldPosition(p); if (p.length() > 5.5 || (o.material && (o.material.emissiveIntensity > 2 || o.material.transparent))) o.castShadow = false; }
      }
      const mats = o.material ? (Array.isArray(o.material) ? o.material : [o.material]) : [];
      for (const m of mats) {
        if (m.userData._opt) continue; m.userData._opt = true;
        if (!q.transmission && m.transmission > 0) {
          const tr = m.transmission; m.transmission = 0;
          if (tr > 0.5) { m.transparent = true; m.opacity = 0.93; m.emissiveIntensity = (m.emissiveIntensity || 0) + 0.05; }
          else if (tr > 0.3) { m.transparent = true; m.opacity = 1 - tr * 0.5; }
          m.needsUpdate = true;
        }
        if (!q.iridescence && m.iridescence > 0) { m.iridescence = 0; m.needsUpdate = true; }
      }
    });
  }

  setEnvironment(envScene, intensity = 1) {
    if (this.envRT) this.envRT.dispose();
    this.envRT = this.pmrem.fromScene(envScene, 0.04);
    this.scene.environment = this.envRT.texture;
    this.scene.environmentIntensity = intensity;
  }

  setLook({ bloom, bloomRadius, bloomThreshold, exposure, vignette, warm, sat, grain } = {}) {
    if (this.bloom) { if (bloom !== undefined) this.bloom.strength = bloom; if (bloomRadius !== undefined) this.bloom.radius = bloomRadius; if (bloomThreshold !== undefined) this.bloom.threshold = bloomThreshold; }
    if (exposure !== undefined) this.renderer.toneMappingExposure = exposure;
    const u = this.grade.uniforms;
    if (vignette !== undefined) u.uVignette.value = vignette; if (warm !== undefined) u.uWarm.value = warm; if (sat !== undefined) u.uSat.value = sat; if (grain !== undefined) u.uGrain.value = grain;
  }

  setFocus(distance, aperture) {
    if (!this.bokeh) return;
    this.bokeh.uniforms.focus.value = distance;
    if (aperture !== undefined) this.bokeh.uniforms.aperture.value = aperture;
  }

  render(t = 0, flash = 0) {
    this.grade.uniforms.uTime.value = t * 37.0 % 100;
    this.grade.uniforms.uFlash.value = flash;
    this.composer.render();
  }
}
