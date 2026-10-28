// Distribution : relie chaque nom du script à un personnage 3D (préréglage ou archétype) et à une voix.
import { slug } from './parser.js';
import { findInBible } from './bible.js';

// Voix françaises neuronales (edge-tts, gratuites).
export const VOICES = {
  narrator: { voice: 'fr-FR-HenriNeural', rate: '-3%', pitch: '-6Hz' },
  f: [
    { voice: 'fr-FR-DeniseNeural', rate: '+6%', pitch: '+0Hz' },
    { voice: 'fr-FR-VivienneMultilingualNeural', rate: '+2%', pitch: '+2Hz' },
    { voice: 'fr-BE-CharlineNeural', rate: '+4%', pitch: '+0Hz' },
    { voice: 'fr-CA-SylvieNeural', rate: '+4%', pitch: '+0Hz' },
    { voice: 'fr-CH-ArianeNeural', rate: '+4%', pitch: '+0Hz' },
  ],
  m: [
    { voice: 'fr-FR-RemyMultilingualNeural', rate: '-5%', pitch: '-8Hz' },
    { voice: 'fr-BE-GerardNeural', rate: '+2%', pitch: '+0Hz' },
    { voice: 'fr-CA-JeanNeural', rate: '+3%', pitch: '-2Hz' },
    { voice: 'fr-CA-AntoineNeural', rate: '+3%', pitch: '+0Hz' },
    { voice: 'fr-CH-FabriceNeural', rate: '+2%', pitch: '+0Hz' },
    { voice: 'fr-FR-HenriNeural', rate: '+6%', pitch: '+4Hz' },
  ],
};

// Préréglages de l'épisode 1 (l'apparence détaillée est dans engine/characters/cast.js).
export const PRESET_META = {
  insuline: { color: '#e8a317', gender: 'f', role: 'celle qui a les clés', voice: VOICES.f[0], keywords: ['insuline'] },
  cellia: { color: '#9b4dff', gender: 'f', role: 'la cellule, reine de la villa', voice: VOICES.f[1], keywords: ['cellule'], big: true, home: 'cellia' },
  sucrette: { color: '#ff6fb0', gender: 'f', role: 'le glucose', voice: { voice: 'fr-BE-CharlineNeural', rate: '+10%', pitch: '+18Hz' }, keywords: ['glucose', 'sucre'] },
  pancho: { color: '#ef6a56', gender: 'm', role: 'le pancréas', voice: VOICES.m[0], keywords: ['pancréas', 'pancreas'] },
  josh: { color: '#2f7de1', gender: 'm', role: "l'humain", voice: VOICES.m[5], keywords: ['humain', 'josh'] },
};

// Archétypes pour les futures pathologies : mots-clés -> forme / matière / couleur / accessoires.
const ARCHETYPES = [
  { k: ['coeur', 'cœur', 'cardiaque'], def: { shape: 'heart', material: 'organ-smooth', color: '#e2394a' } },
  { k: ['artere', 'artère', 'vaisseau', 'veine', 'capillaire'], def: { shape: 'tube', material: 'organ-smooth', color: '#d8434f', h: 0.9 } },
  { k: ['globule rouge', 'hematie', 'hématie', 'hemoglobine', 'hémoglobine'], def: { shape: 'disc', material: 'organ-smooth', color: '#d61f2c', face: { eyeY: 0.6, eyeX: 0.2, mouthY: 0.38 } } },
  { k: ['globule blanc', 'leucocyte', 'lymphocyte', 'macrophage', 'immunit'], def: { shape: 'sphere', material: 'skin', color: '#eef0ff', accessories: ['cap'] } },
  { k: ['plaquette'], def: { shape: 'disc', material: 'skin', color: '#f6c453', w: 0.8, h: 0.8 } },
  { k: ['virus'], def: { shape: 'virus', material: 'skin', color: '#59c96b', accessories: [['spikes', { color: '#3e9b50', tipColor: '#ff4d6d' }]] } },
  { k: ['bacterie', 'bactérie', 'microbe', 'germe'], def: { shape: 'capsule', material: 'skin', color: '#8bd450' } },
  { k: ['cellule', 'neurone'], def: { shape: 'cell', material: 'membrane', color: '#a35cff', door: false, legs: false } },
  { k: ['rein', 'renal', 'rénal'], def: { shape: 'bean', material: 'organ', color: '#b0463e' } },
  { k: ['foie', 'hepat', 'hépat'], def: { shape: 'blob', material: 'organ', color: '#8e3a2a', w: 1.2 } },
  { k: ['poumon', 'pulmon', 'bronche'], def: { shape: 'tall', material: 'organ-smooth', color: '#f39ab0' } },
  { k: ['cerveau', 'cerebr', 'cérébr'], def: { shape: 'blob', material: 'organ', color: '#f0a5b8', lumps: 0.05 } },
  { k: ['estomac', 'intestin'], def: { shape: 'bean', material: 'organ-smooth', color: '#f08d7e' } },
  { k: ['pancreas', 'pancréas'], def: { shape: 'tall', material: 'organ', color: '#ef8a76' } },
  { k: ['os', 'squelette', 'calcium'], def: { shape: 'capsule', material: 'skin', color: '#f4efe2' } },
  { k: ['sel', 'sodium'], def: { shape: 'crystal', material: 'salt', color: '#e6eef7', accessories: ['sparkles'] } },
  { k: ['sucre', 'glucose'], def: { shape: 'cube', material: 'sugar', color: '#ffffff', accessories: ['sparkles'] } },
  { k: ['cholesterol', 'cholestérol', 'graisse', 'lipide', 'gras'], def: { shape: 'blob', material: 'skin', color: '#f6d365', accessories: ['sunglasses'] } },
  { k: ['medicament', 'médicament', 'pilule', 'comprime', 'comprimé', 'gelule', 'gélule', 'traitement', 'vaccin'], def: { shape: 'capsule', material: 'skin', color: '#4a90e2' } },
  { k: ['hormone', 'proteine', 'protéine', 'enzyme', 'anticorps'], def: { shape: 'blob', material: 'skin', color: '#ffb347' } },
  { k: ['pression', 'tension'], def: { shape: 'blob', material: 'skin', color: '#ff5a5f' } },
  { k: ['humain', 'patient', 'patiente', 'homme', 'femme', 'enfant', 'medecin', 'médecin', 'infirmi'], def: { human: true } },
];
const COLORS = { rouge: '#e2394a', bleu: '#3b7ddd', vert: '#4cbf6b', jaune: '#f6d03b', orange: '#ff8a3d', rose: '#ff6fb0', violet: '#9b4dff', mauve: '#b07cff', 'doré': '#f2b632', or: '#f2b632', blanc: '#f4f4f4', noir: '#2a2a2a', gris: '#9aa0a6', marron: '#8a5a32', turquoise: '#2ec4c4', beige: '#e8d5b0' };
const ACC_KW = [['lunettes de soleil', 'sunglasses'], ['lunettes', 'glasses'], ['chignon', 'bun'], ['créoles', 'hoops'], ['boucles', 'hoops'], ['clé', 'key'], ['couronne', 'tiara'], ['diadème', 'tiara'], ['reine', 'tiara'], ['nœud', 'bow'], ['noeud', 'bow'], ['moustache', 'mustache'], ['casquette', 'cap'], ['cravate', 'tie'], ['sueur', 'sweat'], ['épuisé', 'sweat'], ['paillet', 'sparkles']];
const PALETTE = ['#ff6f91', '#4cc9f0', '#ffd166', '#06d6a0', '#ef476f', '#9b5de5', '#f15bb5', '#00bbf9', '#fee440', '#00f5d4'];

function hashStr(s) { let h = 0; for (const c of s) h = (h * 31 + c.charCodeAt(0)) >>> 0; return h; }
function guessGender(name, desc) {
  const d = ` ${desc.toLowerCase()} `.replace(/[.,;:!?]/g, ' ');
  let f = 0, m = 0;
  // un pronom explicite (« Il est… », « Elle… ») l'emporte sur le genre grammatical de l'organe (« une artère »)
  if (/ il(s)? /.test(d) && !/ elle(s)? /.test(d)) return 'm';
  if (/ elle(s)? /.test(d) && !/ il(s)? /.test(d)) return 'f';
  for (const w of [' elle ', ' la nouvelle', ' candidate', ' reine', ' une ', 'pétillante', 'naïve', 'diva', ' sa ', 'heureuse', 'fatiguée', 'énervée']) if (d.includes(w)) f++;
  for (const w of [' il ', ' le daron', ' candidat ', ' roi', ' un ', 'daron', 'heureux', 'fatigué ', 'énervé']) if (d.includes(w)) m++;
  if (f === m) { const n = name.toLowerCase(); f += /(a|e|ette|ine|elle|ia)$/.test(n) ? 1 : 0; m += /(o|us|on|ar|ard|ix)$/.test(n) ? 1 : 0; }
  return f >= m ? 'f' : 'm';
}

/**
 * Construit la distribution à partir du casting du script + des noms qui parlent.
 * Retour : { byName: { 'INSULINE': entry }, list: [entry] } ; entry = { id, name, def, color, role, gender, voice }
 */
export function buildCasting(doc, bible = null) {
  const entries = new Map();
  const usedVoices = { f: 0, m: 0 };
  const aliases = {};
  // voix déjà attribuées dans la série : un nouveau personnage en reçoit une autre
  const takenVoices = new Set(Object.values(bible?.personnages || {}).map((p) => p.voix?.voice));
  for (const P of Object.values(PRESET_META)) if (P.voice) takenVoices.add(P.voice.voice);
  const pickVoice = (gender) => {
    const pool = VOICES[gender];
    for (let i = 0; i < pool.length * 2; i++) {
      const v = pool[(usedVoices[gender]++) % pool.length];
      if (!takenVoices.has(v.voice) || i >= pool.length) { takenVoices.add(v.voice); return v; }
    }
    return pool[0];
  };
  const add = (name, desc = '') => {
    let id = slug(name); if (!id) return null;
    if (entries.has(id)) return entries.get(id);
    if (aliases[id]) return entries.get(aliases[id]);
    // 1) personnage déjà connu de la série -> identique (apparence + voix)
    const B = findInBible(bible, name, `${name} ${desc}`);
    if (B) {
      const entry = { id: B.id, name: B.nom, def: B.def, color: B.couleur, role: B.role, gender: B.genre, voice: B.voix, description: desc || B.description, fromBible: true };
      if (B.id !== id) { aliases[id] = B.id; entry.alias = name; }
      if (!entries.has(B.id)) entries.set(B.id, entry);
      return entries.get(B.id);
    }
    const low = desc.toLowerCase();
    let entry;
    if (PRESET_META[id]) {
      const P = PRESET_META[id];
      entry = { id, name: cap(name), def: id, color: P.color, role: shortRole(desc) || P.role, gender: P.gender, voice: P.voice, home: P.home, big: P.big };
      usedVoices[P.gender]++;
    } else {
      let def = null;
      for (const a of ARCHETYPES) if (a.k.some((k) => low.includes(k))) { def = JSON.parse(JSON.stringify(a.def)); break; }
      if (!def) def = { shape: 'blob', material: 'skin' };
      let color = def.color;
      for (const [w, c] of Object.entries(COLORS)) if (new RegExp(`\\b${w}`, 'i').test(low)) { color = c; break; }
      if (!color) color = PALETTE[hashStr(id) % PALETTE.length];
      def.color = color;
      const acc = new Set((def.accessories || []).map((a) => (Array.isArray(a) ? a[0] : a)));
      const accList = def.accessories ? [...def.accessories] : [];
      for (const [kw, a] of ACC_KW) if (low.includes(kw) && !acc.has(a) && !(a === 'glasses' && acc.has('sunglasses') && !/lunettes(?! de soleil)/.test(low.replace('lunettes de soleil', '')))) { acc.add(a); accList.push(a); }
      def.accessories = accList;
      const gender = guessGender(name, desc);
      def.face = { lashes: gender === 'f', lips: gender === 'f' ? 'full' : 'line', lipColor: '#c2185b', iris: ['#5b3a1e', '#2f7d5a', '#3b6fb0', '#7a3f12'][hashStr(id) % 4], ...(def.face || {}) };
      def.name = cap(name);
      const voice = pickVoice(gender);
      entry = { id, name: cap(name), def, color, role: shortRole(desc), gender, voice, big: def.shape === 'cell', isNew: true };
    }
    entry.description = desc;
    entries.set(id, entry);
    return entry;
  };
  for (const c of doc.casting) { if (/voix|narrat/i.test(c.name + ' ' + c.description.split('.')[0])) continue; add(c.name, c.description); }
  for (const s of doc.sections) for (const it of s.items) if (it.type === 'line' && !it.voiceOver) add(it.speaker, '');
  // personnages mentionnés par la voix off (ex. Josh) : ajoutés s'ils sont au casting
  const list = [...entries.values()];
  const byName = {};
  for (const e of list) { byName[e.name.toUpperCase()] = e; byName[e.id] = e; }
  for (const a in aliases) { const e = entries.get(aliases[a]); byName[a] = e; byName[a.toUpperCase()] = e; }
  for (const it of doc.sections.flatMap((s) => s.items)) if (it.type === 'line' && !it.voiceOver) { const e = add(it.speaker, ''); if (e) byName[it.speaker.toUpperCase()] = e; }
  return { list, byName, narrator: { id: 'narrator', name: 'Voix off', voice: VOICES.narrator, color: '#ffe44d' } };
}

function cap(s) { s = String(s).trim().toLowerCase(); return s.replace(/(^|[\s\-'])(\p{L})/gu, (m, a, b) => a + b.toUpperCase()); }
function shortRole(desc) {
  if (!desc) return '';
  let r = desc.split(/[.!]/)[0].trim();
  if (r.length > 34) r = r.slice(0, 32).replace(/\s+\S*$/, '') + '…';
  return r;
}

/** Retrouve un personnage cité dans un texte (nom ou mot-clé de son rôle). */
export function findMentions(text, casting) {
  const low = ` ${String(text).toLowerCase().replace(/œ/g, 'oe').replace(/æ/g, 'ae').normalize('NFD').replace(/[̀-ͯ]/g, '')} `;
  const out = [];
  for (const e of casting.list) {
    const keys = [e.name, ...(PRESET_META[e.id]?.keywords || [])].map((k) => k.toLowerCase().replace(/œ/g, 'oe').replace(/æ/g, 'ae').normalize('NFD').replace(/[̀-ͯ]/g, ''));
    if (keys.some((k) => k && new RegExp(`[^a-z]${k.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}`).test(low))) out.push(e.id);
  }
  return out;
}
