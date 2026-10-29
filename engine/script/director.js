// Le « réalisateur » : transforme le script analysé en timeline complète
// (décors, placements, déplacements, émotions, gestes, plans caméra, habillage, bruitages, musique).
// Fonctionne dans Node (rendu automatique) et dans le navigateur (aperçu).
import { parseScript, slug } from './parser.js';
import { buildCasting, findMentions, PRESET_META } from './casting.js';

const norm = (s) => String(s || '').toLowerCase().replace(/œ/g, 'oe').replace(/æ/g, 'ae').normalize('NFD').replace(/[̀-ͯ]/g, '');

// ------------------------------------------------------------------ règles de jeu d'acteur
// Chaque règle : motif (sur didascalie + texte) -> émotion, pose, effets, plan.
const ACTING = [
  { re: /confessionnal/, loc: 'confessional' },
  { re: /(epuise|en sueur|crame|a bout|heures sup|nuits blanches|fatigu)/, emotion: 'tired', pose: 'droop', sweat: 1 },
  { re: /(sueur|transpir)/, sweat: 1, pose: 'wipe' },
  { re: /entree stylee|entre en scene|fait son entree/, emotion: 'proud', pose: 'hips', enter: true, sfx: 'sting' },
  { re: /(la cle ne tourne pas|cle bloquee|serrure bloquee)/, emotion: 'angry', pose: 'shakeKey', sfx: 'rattle', atDoor: true, crash: true },
  { re: /(avec sa cle|met la cle|tourne la cle|deverrouille|ouvre la porte avec)/, emotion: 'proud', pose: 'holdKey', sfx: 'unlock', atDoor: true, unlock: true },
  { re: /(toc toc|frappe a la porte|a la porte de)/, emotion: 'happy', pose: 'knock', sfx: 'knock', atDoor: true },
  { re: /(bloquee?|coince|dehors|a la rue|en pls)/, emotion: 'annoyed', pose: 'shrug' },
  { re: /\?!|\battends\b|c'est moi qui fais|red flag/, emotion: 'shocked', pose: 'cheeks', sfx: 'record', crash: true },
  { re: /\bcoucou\b|salut la villa|bonjour la villa/, emotion: 'excited', pose: 'wave', sfx: 'sparkle', enter: true },
  { re: /(se prend pour qui|pour une folle|redescendre|n'importe qui|serieux)/, emotion: 'sassy', pose: 'hips', sfx: 'sting', crash: true },
  { re: /\|\| entre\b|entre, ma|entre !|viens,? y a de la place|bienvenue/, emotion: 'happy', pose: 'welcome', openDoor: true },
  { re: /(pas personnel|plus envie|j'entends qu'on frappe|je reponds pas)/, emotion: 'suspicious', pose: 'cross' },
  { re: /(je souffle|enfin|soulage|ca va mieux)/, emotion: 'relieved', pose: 'idle' },
  { re: /(ouverte|je bouge|depuis que|equilibre)/, emotion: 'happy', pose: 'gesture' },
  { re: /(daron|c'est moi le|j'envoie)/, emotion: 'proud', pose: 'selfPoint' },
  { re: /(pas de moi, pas d'entree|c'est simple|enchantee)/, emotion: 'proud', pose: 'holdKey' },
  { re: /(ok \?|moi j'ouvre)/, emotion: 'proud', pose: 'cross' },
  { re: /(abonne|a retenir)/, emotion: 'happy', pose: 'point' },
  { re: /!/, emotion: 'excited' },
];
const VO_MOOD = [
  { re: /(danger|abime|abiment|pire|silencieu|complication)/, emotion: 'worried', music: 'drama', sfx: 'heartbeat' },
  { re: /(clash|trahison)/, emotion: 'shocked', sfx: 'boom', crash: true },
  { re: /(match parfait|bonne sante|redescend|se relever|riposte)/, emotion: 'happy' },
  { re: /(s'epuise|epuise|de moins en moins)/, emotion: 'tired' },
  { re: /(resistance|ne repond plus|grippee|s'accumule|hyperglycemie)/, emotion: 'worried' },
  { re: /(verdict|diabete)/, emotion: 'shocked', sfx: 'boom' },
];
const SECTION_MUSIC = [
  [/teaser/, 'drama'], [/arrivee|regle|couple|parfait|accueil/, 'chill'], [/clash|rue|craque|conflit|dispute/, 'tense'],
  [/twist|verdict|diagnostic|danger/, 'drama'], [/riposte|solution|traitement|victoire|happy/, 'happy'], [/recap|abonne/, 'outro'],
];

// Lieux : mots-clés (dans les didascalies, les titres de scène ou une balise [lieu : …]).
const LOCS = [
  ['confessional', /confessionnal/],
  ['clinic', /(cabinet|medecin|consultation|diagnostic|verdict|prise de sang|analyse|hopital|urgences|labo)/],
  ['heart', /(dans le coeur|^coeur|\bcoeur\b|cardiaque|ventricule|oreillette)/],
  ['brain', /(cerveau|neurone|cerebr|crane)/],
  ['lungs', /(poumon|bronche|alveole|respir|trachee)/],
  ['gut', /(estomac|intestin|ventre|digest|colon)/],
  ['blood', /(dans le sang|^sang$|vaisseau|artere|circulation|veine)/],
  ['kitchen', /(cuisine|chez josh|appartement)/],
  ['villa', /(villa|piscine|jardin|terrasse|salon)/],
];
export const ORGAN_SETS = new Set(['blood', 'heart', 'brain', 'lungs', 'gut', 'clinic']);
function locFrom(text) { const s = norm(text).trim(); if (!s) return null; for (const [id, re] of LOCS) if (re.test(s)) return id; return null; }

function actingFor(text, direction) {
  const s = norm(`${direction} || ${text}`);
  const res = {};
  for (const r of ACTING) if (r.re.test(s)) { for (const k in r) if (k !== 're' && res[k] === undefined) res[k] = r[k]; }
  return res;
}

// Mots-clés médicaux mis en valeur (sous-titres colorés + petit coup de zoom)
export const KEYWORDS = ['insuline', 'glucose', 'glycemie', 'hyperglycemie', 'hypoglycemie', 'pancreas', 'diabete', 'cellule', 'resistance', 'cholesterol', 'tension', 'pression', 'artere', 'coeur', 'infarctus', 'avc', 'cerveau', 'poumon', 'bronche', 'asthme', 'virus', 'bacterie', 'antibiotique', 'vaccin', 'allergie', 'histamine', 'hormone', 'thyroide', 'anemie', 'fer', 'rein', 'foie', 'urgence', 'medecin', 'symptome', 'traitement', 'sel', 'sodium', 'inflammation', 'immunite', 'globule', 'plaquette', 'oxygene', 'sang'];
const KEYWORD_RE = new RegExp(`^(${KEYWORDS.join('|')})s?[^a-z]*$`);

// ------------------------------------------------------------------ durées de parole
/** Estimation sans voix réelle : ~14 caractères/s + pauses de ponctuation. */
export function estimateSpeech(text, rate = 1) {
  const words = String(text).split(/\s+/).filter(Boolean);
  let t = 0; const out = [];
  for (const w of words) {
    const d = (Math.max(2, w.replace(/[^\p{L}\p{N}]/gu, '').length) / 14.5 + 0.06) / rate;
    out.push({ t, d, w }); t += d;
    if (/[.!?]$/.test(w)) t += 0.28; else if (/[,;:…]$/.test(w)) t += 0.16;
  }
  return { dur: t, words: out, env: null, estimated: true };
}

/** Liste des répliques à vocaliser (pour la synthèse vocale). */
// Jeu vocal : la vitesse et la hauteur de la voix suivent l'émotion de la réplique.
const PROSODY = {
  angry: [12, 6], sassy: [6, 4], excited: [10, 10], shocked: [8, 14], happy: [5, 5], proud: [-2, 2],
  tired: [-14, -7], sad: [-10, -5], worried: [-4, 2], suspicious: [-6, -3], relieved: [-6, 0], annoyed: [6, -2], neutral: [0, 0],
};
function shiftPct(base, d) { const v = parseFloat(String(base || '+0%')) || 0; const r = Math.max(-18, Math.min(16, Math.round(v + d))); return `${r >= 0 ? '+' : ''}${r}%`; }
function shiftHz(base, d) { const v = parseFloat(String(base || '+0Hz')) || 0; const r = Math.max(-15, Math.min(22, Math.round(v + d))); return `${r >= 0 ? '+' : ''}${r}Hz`; }
export function voiceFor(voice, emotion, { teaser = false, vo = false, mood = null } = {}) {
  let [dr, dp] = PROSODY[emotion] || [0, 0];
  if (vo) { dr = mood === 'drama' ? -5 : mood === 'happy' ? 4 : 0; dp = mood === 'drama' ? -3 : 0; }
  if (teaser) dr += 6;
  dr += 7; // rythme TikTok : on parle un peu plus vite partout (épisodes d'environ 2 min)
  return { voice: voice.voice, rate: shiftPct(voice.rate, dr), pitch: shiftHz(voice.pitch, dp) };
}

export function collectLines(doc, casting) {
  // (casting construit avec la même bible que la timeline)
  const out = [];
  for (const s of doc.sections) for (const it of s.items) {
    if (it.type === 'title' && it.vo) { const v = voiceFor(casting.narrator.voice, 'excited', { vo: true, mood: 'happy' }); out.push({ key: `L${it.line}`, text: ttsText(it.vo), voice: v.voice, rate: v.rate, pitch: v.pitch, speaker: 'narrator', gender: 'm', emotion: 'excited' }); continue; }
    if (it.type !== 'line') continue;
    const who = it.voiceOver ? casting.narrator : casting.byName[it.speaker.toUpperCase()] || casting.byName[slug(it.speaker)];
    const base = who?.voice || casting.narrator.voice;
    const acting = it.voiceOver ? {} : actingFor(it.text, it.direction);
    const voMood = it.voiceOver ? (VO_MOOD.find((r) => r.re.test(norm(it.text))) || {}) : {};
    const emotion = acting.emotion || (/!/.test(it.text) ? 'excited' : 'neutral');
    const v = voiceFor(base, emotion, { teaser: s.kind === 'teaser' || s.kind === 'previously', vo: it.voiceOver, mood: voMood.music || (voMood.emotion === 'worried' ? 'drama' : voMood.emotion === 'happy' ? 'happy' : null) });
    out.push({ key: `L${it.line}`, text: ttsText(it.text), voice: v.voice, rate: v.rate, pitch: v.pitch, speaker: who?.id || 'narrator', gender: who?.gender || 'm', emotion });
  }
  return out;
}
export function ttsText(t) {
  return String(t).replace(/[«»"“”]/g, '').replace(/\bOK\b/g, 'O.K.').replace(/\bPLS\b/g, 'P.L.S.')
    .replace(/≥\s*/g, 'supérieur ou égal à ').replace(/≤\s*/g, 'inférieur ou égal à ').replace(/\bg\/L\b/g, 'gramme par litre').replace(/\bmmHg\b/g, 'millimètres de mercure')
    .replace(/\bAVC\b/g, 'A.V.C.').replace(/\bIRM\b/g, 'I.R.M.').replace(/\bECG\b/g, 'électrocardiogramme').replace(/\bHbA1c\b/gi, 'hémoglobine glyquée')
    .replace(/\s+/g, ' ').trim();
}

// ------------------------------------------------------------------ construction de la timeline
/**
 * Découpe un épisode en parties (ex. part = '2/2') à une frontière de scène, en équilibrant la durée.
 * Partie 1 : teaser + générique + premières scènes + carton « À SUIVRE ». Parties suivantes : générique « Partie N » + suite.
 */
export function splitDoc(doc, part) {
  const m = String(part || '').match(/^(\d+)\s*\/\s*(\d+)$/); if (!m) return doc;
  const k = +m[1], n = +m[2]; if (n < 2 || k < 1 || k > n) return doc;
  const est = (sec) => sec.items.reduce((a, it) => a + (it.type === 'line' ? estimateSpeech(ttsText(it.text)).dur + 0.4 : it.type === 'card' || it.type === 'title' ? 2.6 : 0), 0);
  const head = [], body = [];
  let seenTitle = false;
  for (const sec of doc.sections) { if (!seenTitle) head.push(sec); else body.push(sec); if (sec.items.some((i) => i.type === 'title')) seenTitle = true; }
  if (!seenTitle) { body.push(...head.splice(0)); }
  const total = body.reduce((a, s) => a + est(s), 0) + head.reduce((a, s) => a + est(s), 0);
  // frontières : on remplit chaque partie jusqu'à ~total/n
  const groups = Array.from({ length: n }, () => []);
  let acc = head.reduce((a, s) => a + est(s), 0), g = 0;
  for (const sec of body) {
    if (g < n - 1 && acc + est(sec) / 2 > (total / n) * (g + 1) && groups[g].length) g++;
    groups[g].push(sec); acc += est(sec);
  }
  const out = { ...doc, part: k, parts: n };
  const label = `Partie ${k}/${n}`;
  const titleSec = { kind: 'scene', title: label, name: label, items: [{ type: 'title', line: 99001 }] };
  out.sections = k === 1 ? [...head, ...groups[0]] : [titleSec, ...groups[k - 1]];
  if (k < n) out.sections = [...out.sections, { kind: 'scene', title: 'suite', name: 'suite', items: [{ type: 'card', text: `À SUIVRE… PARTIE ${k + 1}`, line: 99002 }] }];
  out.episodeName = doc.episodeName ? `${doc.episodeName} · ${label}` : label;
  return out;
}

export function buildTimeline(src, opts = {}) {
  let doc = typeof src === 'string' ? parseScript(src) : src;
  if (opts.part) doc = splitDoc(doc, opts.part);
  const casting = buildCasting(doc, opts.bible || null);
  // personnages préréglés cités par la voix off mais absents du casting (ex. Josh)
  for (const s of doc.sections) for (const it of s.items) if (it.type === 'line') {
    for (const id of Object.keys(PRESET_META)) if (!casting.list.find((e) => e.id === id) && new RegExp(`\\b${id}\\b`).test(norm(it.text))) {
      const P = PRESET_META[id];
      const e = { id, name: id[0].toUpperCase() + id.slice(1), def: id, color: P.color, role: P.role, gender: P.gender, voice: P.voice, description: '' };
      casting.list.push(e); casting.byName[e.name.toUpperCase()] = e; casting.byName[id] = e;
    }
  }
  // retire un éventuel « narrateur » listé dans le casting
  casting.list = casting.list.filter((e) => !/voix|narrat/.test(norm(e.name + ' ' + e.description)));

  const speech = opts.speech || {};
  const fps = opts.fps || 30;
  const beats = [], overlays = [], sfx = [], music = [], voices = [];
  let cutaways = 0; // plans de coupe hors villa consécutifs
  let lastSpan = null; // dernière réplique (pour y accrocher l'encadré qui l'explique)
  let t = 0;
  const villa = { present: new Set(), pos: {}, door: 0, hidden: new Set(), keyIn: false, keyHolder: null };
  const marksOrder = ['center', 'left', 'right', 'farLeft', 'farRight'];
  const introduced = new Set();
  let lastSet = null, angleFlip = 1, lastSpeaker = null;
  const lastEmotion = {};
  const cellia = casting.list.find((e) => e.big || e.home === 'cellia' || e.def === 'cellia' || e.def?.shape === 'cell');
  const epLabel = `ÉP. ${doc.episode ?? 1} · ${(doc.pathology || doc.episodeName || '').toUpperCase()}`.trim();
  const sweatOf = {};
  let gauge = null, crowd = 0;
  let hookText = null, questionText = null;

  const entryOf = (name) => casting.byName[String(name).toUpperCase()] || casting.byName[slug(name)];
  const doorSpot = (side = -1) => cellia ? { x: side * 0.78, dz: 1.0 } : null; // à côté de la porte (ne masque pas la cellule)
  const cpos = () => ({ x: 1.75, z: -1.25 }); // repère « cellia » du décor villa
  const nextMark = () => marksOrder.find((m) => !Object.values(villa.pos).includes(m)) || 'center';

  function placeVilla(id) { if (!villa.pos[id]) villa.pos[id] = cellia && id === cellia.id ? 'cellia' : nextMark(); return villa.pos[id]; }
  function villaActors(extra = {}) {
    const actors = {};
    if (cellia) { villa.present.add(cellia.id); placeVilla(cellia.id); }
    for (const id of villa.present) {
      if (villa.hidden.has(id)) continue;
      const p = villa.pos[id];
      const isCell = cellia && id === cellia.id;
      actors[id] = { pos: typeof p === 'string' ? p : [p.x, p.z], emotion: lastEmotion[id] || (isCell ? 'proud' : 'neutral'), pose: isCell ? 'cross' : 'idle', face: isCell ? 0 : undefined, door: isCell ? villa.door : undefined, sweat: sweatOf[id] || 0 };
      if (villa.keyIn && isCell) actors[id].lockKey = 2;
      if (villa.keyIn && id === villa.keyHolder) actors[id].giveKeyAt = -1;
    }
    for (const id in extra) actors[id] = { ...(actors[id] || {}), ...extra[id] };
    return actors;
  }
  function pushBeat(b) {
    b.t1 = b.t0 + b.dur;
    if (lastSet && b.set !== lastSet && !b.noWhoosh) sfx.push({ type: 'whoosh', t: Math.max(0, b.t0 - 0.12) });
    lastSet = b.set;
    beats.push(b); t = b.t1; return b;
  }
  function speechFor(it) {
    const s = speech[`L${it.line}`] || estimateSpeech(ttsText(it.text));
    return s;
  }

  // ---------------------------------------------------------------- sections
  doc.sections.forEach((sec, si) => {
    const secNorm = norm(sec.title);
    const mood = (SECTION_MUSIC.find(([re]) => re.test(secNorm)) || [null, sec.kind === 'teaser' ? 'drama' : 'chill'])[1];
    music.push({ t0: t, mood });
    const previously = sec.kind === 'previously';
    const teaser = sec.kind === 'teaser' || previously, recap = sec.kind === 'recap';
    const secStart = t;
    // décor par défaut de la section
    const secText = norm(sec.items.map((i) => (i.type === 'line' ? (i.direction || '') : i.type === 'screen' ? i.text : '')).join(' '));
    const secBlood = /dans le sang|circulation|vaisseau/.test(secText);
    const secLoc = locFrom(sec.location || '') || (sec.kind === 'scene' ? (locFrom(sec.name || '') !== 'villa' ? locFrom(sec.name || '') : null) : null);
    const organPos = {};
    gauge = null;
    if (secBlood && /(diabet|glyc|sucre|glucose)/.test(norm(doc.pathology || ''))) crowd = Math.max(crowd, 1);
    let firstInSection = true;
    const savedVilla = teaser ? { present: new Set(villa.present), pos: { ...villa.pos } } : null;
    let pendingBox = null; lastSpan = null;
    const items = sec.items;

    items.forEach((it, ii) => {
      if (it.type === 'title') {
        // générique : logo + promesse de la série, avec la voix off (≈ 5 s)
        const gsp = it.vo ? speechFor({ line: it.line, text: it.vo }) : null;
        const gdur = gsp ? Math.max(3.6, gsp.dur + 0.9) : 2.5;
        const b = pushBeat({ t0: t, dur: gdur, set: 'stage', shot: { type: 'wide' }, actors: {}, kind: 'title', noWhoosh: true });
        overlays.push({ type: 'title', t0: b.t0, t1: b.t1, subtitle: doc.episodeName ? `Épisode ${doc.episode ?? 1} · ${doc.episodeName}` : '', generic: !!gsp });
        if (gsp) {
          voices.push({ key: `L${it.line}`, t: b.t0 + 0.45, speaker: 'narrator', dur: gsp.dur });
          const words = (gsp.words || []).map((w) => ({ t: b.t0 + 0.45 + w.t, d: w.d, w: w.w }));
          overlays.push({ type: 'subtitle', t0: b.t0 + 0.45, t1: b.t0 + 0.45 + gsp.dur + 0.1, text: it.vo, words, color: '#ffe44d', low: true });
        }
        sfx.push({ type: 'title', t: b.t0 }); music.push({ t0: b.t0, mood: 'theme' }); music.push({ t0: b.t1, mood: 'chill' });
        return;
      }
      if (it.type === 'card') {
        const b = pushBeat({ t0: t, dur: 1.9, set: lastSet || 'villa', shot: { type: 'wide' }, actors: {}, kind: 'card', noWhoosh: true });
        overlays.push({ type: 'card', t0: b.t0, t1: b.t1, text: it.text });
        sfx.push({ type: 'riser', t: b.t0 - 0.6 }, { type: 'boom', t: b.t0 });
        // ellipse temporelle : la porte se referme, tout le monde ressort
        villa.door = 0; villa.hidden.clear(); villa.keyIn = false;
        for (const k in lastEmotion) delete lastEmotion[k]; for (const k in sweatOf) delete sweatOf[k];
        return;
      }
      if (it.type === 'box') {
        // l'encadré explique la réplique qu'il suit : il s'affiche sur cette réplique (et déborde un peu sur la suivante)
        if (lastSpan) { overlays.push({ type: 'box', t0: lastSpan.t0 + 0.5, t1: Math.max(lastSpan.t1 + 0.2, lastSpan.t0 + 2.6), title: it.title, text: it.text, color: lastSpan.color || '#7b2cff' }); sfx.push({ type: 'ding', t: lastSpan.t0 + 0.5 }); }
        else pendingBox = it;
        return;
      }
      if (it.type === 'hook') { hookText = it.text; return; }
      if (it.type === 'question') { questionText = it.text; return; }
      if (it.type === 'screen') {
        const s = norm(it.text);
        const m = s.match(/jauge (?:de |du |d')?([a-z ]+?)(?: passe| monte| baisse| descend| au | est|$)/);
        const label = m ? m[1].trim() : 'niveau';
        const to = /rouge|danger|explose|max/.test(s) ? 0.96 : /monte|augmente/.test(s) ? 0.75 : /vert|normal|baisse|descend/.test(s) ? 0.35 : 0.8;
        gauge = { label: label.replace(/glycemie/, 'glycémie').toUpperCase(), from: 0.45, to, t0: Math.max(0, t - (beats.at(-1)?.dur || 0) * 0.5) };
        if (to > 0.7) { if (/(glyc|sucre|glucose)/.test(label)) crowd = 1; sfx.push({ type: 'alarm', t: gauge.t0 + 0.4 }); }
        // l'indication s'applique au plan précédent si on est encore dedans
        return;
      }
      if (it.type !== 'line') return;

      // ---------------------------------------------- réplique
      const vo = it.voiceOver;
      const who = vo ? null : entryOf(it.speaker);
      const id = who?.id;
      const sp = speechFor(it);
      const acting = vo ? {} : actingFor(it.text, it.direction);
      const voMood = vo ? (VO_MOOD.find((r) => r.re.test(norm(it.text))) || {}) : {};
      const mentions = findMentions(`${it.text} ${it.direction}`, casting).filter((m) => m !== id);
      let set = 'villa';
      const tagLoc = locFrom(it.location || '') || null;
      const dirLoc = locFrom(it.direction || '');
      if (acting.loc === 'confessional') set = 'confessional';
      else if (tagLoc) set = tagLoc;
      else if (dirLoc && dirLoc !== 'confessional') set = dirLoc;
      else if (secLoc) set = secLoc;
      else if ((secBlood && !vo) || (vo && secBlood)) set = 'blood';
      else if (vo && mentions.includes('josh')) set = 'kitchen';
      // LA VILLA EST LE DÉCOR DE LA SÉRIE : les personnages parlent dans la villa (ou au confessionnal).
      // Les autres décors (intérieur du corps, cuisine de Josh, cabinet) ne sont que de courts plans de coupe
      // pendant la voix off — jamais deux d'affilée — sauf didascalie explicite (« bloquée dans le sang »).
      if (!teaser && set !== 'villa' && set !== 'confessional') {
        if (!vo && dirLoc !== set) set = 'villa';
        else if (vo && cutaways >= 1) set = 'villa';
      }
      cutaways = set !== 'villa' && set !== 'confessional' ? cutaways + 1 : 0;

      const lead = 0.08, tail = teaser ? 0.12 : 0.17;
      let dur = Math.max(1.2, sp.dur + lead + tail);
      const t0 = t;
      const actors = {};
      let shot = { type: 'medium', subject: id, angle: angleFlip, seed: beats.length };
      const extra = [];

      if (set === 'confessional') {
        actors[id] = { pos: 'center', emotion: acting.emotion || 'neutral', pose: acting.pose === 'droop' ? 'wipe' : acting.pose || 'gesture', sweat: acting.sweat || 0, look: 'camera' };
        shot = { type: 'confession', subject: id, seed: beats.length, push: 0.1 };
        if (acting.sweat) sweatOf[id] = 1;
      } else if (set === 'kitchen') {
        actors.josh = { pos: 'center', emotion: /(ne sent rien|silencieu)/.test(norm(it.text)) ? 'neutral' : 'happy', pose: 'idle', look: 'camera' };
        shot = { type: 'medium', subject: 'josh', angle: 0.4, push: 0.12 };
      } else if (ORGAN_SETS.has(set)) {
        // ---- intérieur du corps / cabinet médical : le locuteur et les personnages cités
        let present = vo ? mentions.filter((m) => m !== 'josh' || set === 'clinic') : [id, ...mentions.filter((m) => m !== 'josh' || set === 'clinic')];
        if (set === 'blood' && /(sucre|glucose|glyc|diabet)/.test(norm(`${doc.pathology || ''} ${it.text || ''}`))) { const sugarId = casting.list.find((e) => /glucose|sucre/.test(norm(e.role + ' ' + e.description)))?.id; if (sugarId) present.push(sugarId); }
        if (!present.length) present = Object.keys(organPos).length ? Object.keys(organPos) : set === 'clinic' && casting.list.find((e) => e.id === 'josh') ? ['josh'] : [...villa.present].filter((x) => !cellia || x !== cellia.id).slice(0, 1);
        const ids = [...new Set(present)].filter(Boolean).slice(0, 3);
        const slots = ['center', 'left', 'right'];
        ids.forEach((x) => { if (!organPos[x]) organPos[x] = slots.find((sl) => !Object.values(organPos).includes(sl)) || 'center'; });
        ids.forEach((x) => { actors[x] = { pos: organPos[x], emotion: x === id ? (acting.emotion || (/!/.test(it.text) ? 'excited' : 'neutral')) : (voMood.emotion || 'worried'), pose: x === id ? (acting.pose || 'gesture') : 'idle', float: set !== 'clinic', sweat: acting.sweat || sweatOf[x] || 0 }; });
        shot = vo ? (mentions[0] && actors[mentions[0]] ? { type: 'medium', subject: mentions[0], angle: angleFlip * 0.6, seed: beats.length } : { type: 'wide', angle: 0.3, seed: beats.length }) : { type: acting.crash ? 'close' : 'medium', subject: id, angle: angleFlip, crash: !!acting.crash && !teaser, seed: beats.length };
      } else {
        // ---- villa
        if (teaser) { for (const e of casting.list) if (e.id !== 'josh') { villa.present.add(e.id); placeVilla(e.id); } }
        if (id && !villa.present.has(id)) {
          villa.present.add(id); placeVilla(id);
          if (!teaser) acting.enter = true;
        }
        Object.assign(actors, villaActors());
        if (id) {
          const a = actors[id] = { ...(actors[id] || { pos: villa.pos[id] }) };
          a.emotion = acting.emotion || (/[!]/.test(it.text) ? 'excited' : 'neutral');
          a.pose = acting.pose || 'idle';
          if (acting.sweat) { a.sweat = 1; sweatOf[id] = 1; }
          // entrée en scène : arrive depuis le bord du plateau
          if (acting.enter && !introduced.has(`walk-${id}`) && !teaser) {
            introduced.add(`walk-${id}`);
            a.from = beats.length % 2 ? 'enterRight' : 'enterLeft'; a.walkDur = 1.7; a.speed = 2.2;
            dur = Math.max(dur, 2.4 + sp.dur * 0.6);
            if (acting.pose === 'wave' || acting.pose === 'hips') { a.pose = acting.pose; }
            a.entering = true;
          }
          // aller à la porte de la cellule
          if (acting.atDoor && cellia && id !== cellia.id) {
            const c = cpos(), ds = doorSpot(-1);
            const target = { x: c.x + ds.x, z: c.z + ds.dz };
            const cur = villa.pos[id];
            if (typeof cur === 'string') a.from = cur; else if (cur) a.from = [cur.x, cur.z];
            if (!(cur && cur.x === target.x && cur.z === target.z)) { a.walkDur = 1.1; }
            else delete a.from;
            a.pos = [target.x, target.z]; villa.pos[id] = target;
            a.face = cellia.id; a.faceStrict = true;
            shot = { type: 'two', subject: id, other: cellia.id, angle: -1, seed: beats.length };
            if (acting.unlock) {
              // la clé entre dans la serrure, tourne (clic), puis la porte s'ouvre — plan d'insert puis recul
              const tIn = 1.0, tTurn = 2.0, tOpen = 2.75;
              // côté serrure (à droite de la porte), loin du battant qui s'ouvre vers la gauche
              const dsR = doorSpot(1); a.pos = [c.x + dsR.x * 0.95, c.z + dsR.dz * 1.12]; villa.pos[id] = { x: c.x + dsR.x * 0.95, z: c.z + dsR.dz * 1.12 }; a.walkDur = 1.0;
              a.giveKeyAt = tIn; a.pose = 'holdKey';
              if (!actors[cellia.id]) actors[cellia.id] = { pos: 'cellia', emotion: 'proud', pose: 'cross', face: 0 };
              actors[cellia.id] = { ...actors[cellia.id], lockKey: { at: tIn, dur: (tTurn + 0.6 - tIn) }, door: { from: 0, to: 1, at: tOpen, dur: 1.0 }, emotion: 'happy' };
              villa.door = 1; villa.keyIn = true; villa.keyHolder = id;
              sfx.push({ type: 'unlock', t: t0 + tIn }, { type: 'door', t: t0 + tOpen });
              shot = { type: 'keyhole', subject: cellia.id, other: id, pullAt: tOpen - 0.2, seed: beats.length, shake: 0.25, side: -1 };
              dur = Math.max(dur, tOpen + 1.6); shot.noSplit = true;
            }
          }
          // la cellule ouvre sa porte
          if (acting.openDoor && cellia && id === cellia.id) {
            if (villa.door >= 1) a.door = 1; // déjà ouverte par la clé d'Insuline
            else {
              a.door = { from: 0, to: 1, at: Math.min(0.6, sp.dur * 0.3), dur: 0.9 };
              sfx.push({ type: 'door', t: t0 + Math.min(0.6, sp.dur * 0.3) });
            }
            villa.door = 1;
            // celle qui a ouvert avec la clé s'écarte pour laisser passer
            if (villa.keyHolder && actors[villa.keyHolder] && villa.keyHolder !== id) {
              const c = cpos(); const kh = villa.keyHolder; const cur = villa.pos[kh];
              const to = { x: c.x + 1.5, z: c.z + 1.3 };
              actors[kh] = { ...actors[kh], from: typeof cur === 'string' ? cur : [cur.x, cur.z], pos: [to.x, to.z], walkDur: 0.9, walkDelay: 0.1, face: cellia.id, emotion: 'happy' };
              villa.pos[kh] = to;
            }
            // l'invité mentionné s'approche
            for (const m of mentions) if (actors[m] && m !== cellia.id) {
              const c = cpos(), ds = doorSpot(1);
              const cur = villa.pos[m];
              // l'invité vient se placer face à la porte (un peu à droite), prêt à entrer
              const gx = villa.keyHolder ? c.x + 0.2 : c.x + ds.x, gz = villa.keyHolder ? c.z + 1.4 : c.z + ds.dz + 0.15;
              actors[m] = { ...actors[m], from: typeof cur === 'string' ? cur : [cur.x, cur.z], pos: [gx, gz], walkDelay: 0.6, walkDur: 1.2, emotion: 'excited', pose: 'idle' };
              villa.pos[m] = { x: gx, z: gz };
            }
            shot = { type: 'two', subject: id, other: mentions[0] || id, angle: -0.5, seed: beats.length };
          }
          if (cellia && id === cellia.id) { a.face = 0; a.door = a.door ?? villa.door; }
          if (!acting.atDoor && !acting.openDoor) {
            const punch = acting.crash && sp.dur < 5;
            shot = { type: punch ? 'close' : 'medium', subject: id, angle: angleFlip, crash: !!acting.crash && !teaser, seed: beats.length };
            if (a.entering) shot = { type: 'wide', angle: a.from === 'enterLeft' ? -0.5 : 0.5, seed: beats.length };
          }
          // émotion positive : fin de la sueur
          if (/happy|relieved|excited|proud/.test(a.emotion)) { a.sweat = 0; sweatOf[id] = 0; }
          lastEmotion[id] = a.emotion === 'excited' ? 'happy' : a.emotion;
          // jeu physique du locuteur
          if (!a.from) {
            if (a.emotion === 'shocked') { a.react = 'doubleTake'; a.reactAt = 0.15; a.hop = 0.06; a.hopAt = 0.42; }
            else if (a.emotion === 'excited') { a.hop = 0.1; a.hopAt = 0.12; }
            else if (a.emotion === 'angry') { a.react = 'stomp'; a.reactAt = 0.1; }
            else if (a.emotion === 'tired' || a.emotion === 'sad') { a.react = 'deflate'; a.reactAt = 0.2; }
            else if (a.emotion === 'sassy' || a.emotion === 'suspicious') { a.react = 'tilt'; a.reactAt = 0.1; a.tilt = (beats.length % 2 ? 1 : -1) * 0.02; }
          }
          // réactions des autres candidats
          const REACT = { angry: 'worried', sassy: 'suspicious', shocked: 'shocked', tired: 'worried', excited: 'happy', happy: 'happy', proud: 'neutral', relieved: 'happy', suspicious: 'worried', annoyed: 'worried' };
          const r = REACT[a.emotion];
          for (const pid in actors) if (pid !== id && r) {
            actors[pid].emotion = cellia && pid === cellia.id && /angry|sassy/.test(a.emotion) ? 'suspicious' : r; actors[pid].look = id; lastEmotion[pid] = actors[pid].emotion;
            // réaction des autres : double regard sur un choc / une colère, petit saut de joie
            if (/shocked|angry/.test(a.emotion) && !(cellia && pid === cellia.id)) { actors[pid].react = 'doubleTake'; actors[pid].reactAt = 0.35 + (pid.length % 3) * 0.12; }
            else if (a.emotion === 'excited' && r === 'happy' && !(cellia && pid === cellia.id)) { actors[pid].hop = 0.05; actors[pid].hopAt = 0.3 + (pid.length % 3) * 0.1; }
          }
        } else {
          // voix off : réactions des personnages présents
          for (const pid in actors) if (voMood.emotion && pid !== cellia?.id) actors[pid].emotion = voMood.emotion;
          if (voMood.emotion === 'tired') for (const m of mentions) if (actors[m]) { actors[m].sweat = 1; actors[m].pose = 'droop'; sweatOf[m] = 1; }
          // « le sucre entre » : l'invité passe la porte ouverte
          const enterer = mentions.find((m) => actors[m] && villa.door > 0.5 && /\bentre\b/.test(norm(it.text)));
          const sugarWord = /(le sucre|glucose) entre/.test(norm(it.text));
          const ent = enterer || (sugarWord && villa.door > 0.5 ? casting.list.find((e) => /glucose|sucre/.test(norm(e.role + e.description)))?.id : null);
          if (ent && actors[ent] && cellia) {
            const c = cpos();
            const cur = villa.pos[ent];
            // il marche jusqu'au seuil, passe la porte et disparaît dans la cellule (lumière + étincelles)
            actors[ent] = { ...actors[ent], from: typeof cur === 'string' ? cur : [cur.x, cur.z], pos: [c.x, c.z + 0.5], walkDur: 2.0, walkDelay: 0.15, emotion: 'excited', pose: 'wave', shrink: { at: 1.15, dur: 1.0 } };
            dur = Math.max(dur, 2.6);
            villa.hidden.add(ent);
            shot = { type: 'two', subject: ent, other: cellia.id, angle: 0.45, seed: beats.length, push: 0.15, noSplit: true };
            sfx.push({ type: 'sparkle', t: t0 + 1.8 });
          } else if (firstInSection && !teaser) shot = { type: 'establish', seed: beats.length };
          else if (mentions.length && actors[mentions[0]]) shot = { type: mentions[1] && actors[mentions[1]] ? 'two' : 'medium', subject: mentions[0], other: mentions[1], angle: angleFlip, seed: beats.length };
          else shot = { type: 'wide', angle: angleFlip * 0.6, seed: beats.length };
          if (teaser && /cette semaine/.test(norm(it.text))) shot = { type: 'establish', seed: 1 };
          if (voMood.crash) shot.crash = true;
          if (recap) { for (const pid in actors) { actors[pid].emotion = 'happy'; if (pid !== cellia?.id) actors[pid].pose = /abonne/.test(norm(it.text)) ? 'celebrate' : 'idle'; } }
        }
      }
      // teaser : plans serrés et coups de zoom
      if (teaser && !vo && set !== 'confessional') shot = { type: 'close', subject: id, crash: true, seed: beats.length };
      if (teaser && shot.type !== 'establish') { shot.crash = shot.crash ?? (beats.length % 2 === 0); }

      // voix off sans personne à l'image : on montre Josh (c'est son corps) plutôt qu'un décor vide
      if (vo && !Object.keys(actors).some((k) => actors[k] && actors[k].visible !== false) && casting.list.find((e) => e.id === 'josh')) {
        set = 'kitchen';
        actors.josh = { pos: 'center', emotion: /(douleur|serre|malaise|essouffl|fatigue)/.test(norm(it.text)) ? 'tired' : 'worried', pose: /(douleur|serre|poitrine)/.test(norm(it.text)) ? 'droop' : 'idle', look: 'camera' };
        shot = { type: beats.length % 2 ? 'close' : 'medium', subject: 'josh', angle: beats.length % 2 ? -0.45 : 0.4, push: 0.1, seed: beats.length };
      }
      const b = { t0, dur, set, speaker: id || null, kind: vo ? 'vo' : 'line', shot, actors, line: it.line, flash: teaser && ii > 0, isRecap: recap };
      if (set === 'blood') b.setState = { crowd, plaque: /(cholest|athero|infarctus|avc|arteriopathie|arterite)/.test(norm(doc.pathology || '')) || /(plaque|depot|athero|se colle|squatte)/.test(norm(it.text)) ? 1 : 0 };
      b.speech = { t0: t0 + lead, t1: t0 + lead + sp.dur, words: sp.words.map((w) => ({ t: t0 + lead + w.t, d: w.d, w: w.w })), env: sp.env || null, rate: sp.rate || 50 };
      shot.punches = b.speech.words.filter((w) => /[!]/.test(w.w) || KEYWORD_RE.test(norm(w.w))).map((w) => w.t).filter((x, i, arr) => i === 0 || x - arr[i - 1] > 0.9).slice(0, 4);
      // découpage des longues répliques en plusieurs plans (rythme TikTok : un plan toutes les ~3,5 s)
      const nShots = teaser || shot.noSplit ? 1 : Math.min(4, Math.max(1, Math.round(dur / 3.6)));
      if (nShots > 1) {
        const listeners = Object.keys(actors).filter((k) => k !== id && actors[k].visible !== false);
        const alts = [];
        if (set === 'confessional') alts.push({ type: 'close', subject: id, push: 0.06 }, { type: 'confession', subject: id, push: -0.05 });
        else if (set === 'kitchen') alts.push({ type: 'close', subject: 'josh', push: 0.08 }, { type: 'medium', subject: 'josh', angle: -0.45, push: 0.06 });
        else if (vo) {
          if (mentions[0] && actors[mentions[0]]) alts.push({ type: 'medium', subject: mentions[0], angle: -angleFlip });
          if (listeners[0]) alts.push({ type: 'close', subject: listeners[listeners.length - 1], angle: angleFlip });
          alts.push({ type: 'wide', angle: -angleFlip * 0.7 });
        } else {
          if (listeners.length) alts.push({ type: 'medium', subject: listeners.find((l) => l !== cellia?.id) || listeners[0], angle: -angleFlip, reaction: true });
          alts.push({ type: shot.type === 'close' ? 'medium' : 'close', subject: id, angle: -angleFlip });
          alts.push({ type: 'two', subject: id, other: listeners[0] || id, angle: angleFlip * 0.5 });
        }
        let tt = t0; const seg = dur / nShots;
        for (let k = 0; k < nShots; k++) {
          const sh = k === 0 ? shot : { ...alts[(k - 1) % alts.length], seed: beats.length + k };
          const bk = { ...b, t0: tt, dur: k === nShots - 1 ? t0 + dur - tt : seg, shot: sh, flash: k === 0 && b.flash, noWhoosh: k > 0 };
          if (k > 0) {
            bk.actors = JSON.parse(JSON.stringify(b.actors));
            // la marche commencée au premier plan continue (même origine temporelle)
            for (const kk in bk.actors) { const a = bk.actors[kk]; if (a.from) a.walkDelay = (a.walkDelay || 0) - (tt - t0); if (a.door && typeof a.door === 'object') a.door = { ...a.door, at: (a.door.at || 0) - (tt - t0) }; if (a.shrink) a.shrink = { ...a.shrink, at: a.shrink.at - (tt - t0) }; if (a.hopAt !== undefined) a.hopAt -= (tt - t0); if (a.reactAt !== undefined) a.reactAt -= (tt - t0); }
          }
          pushBeat(bk); tt = bk.t1;
        }
      } else pushBeat(b);
      if (id) lastSpeaker = id;
      angleFlip = -angleFlip;
      firstInSection = false;

      // ---------------------------------------------- habillage de la réplique
      const color = vo ? '#ffe44d' : lighten(who?.color || '#ffe44d');
      overlays.push({ type: 'subtitle', t0: b.speech.t0, t1: b.speech.t1 + 0.15, text: it.text, words: b.speech.words, color });
      voices.push({ key: `L${it.line}`, t: b.speech.t0, speaker: id || 'narrator', dur: sp.dur });
      if (set === 'confessional') overlays.push({ type: 'confession', t0, t1: t });
      // qui parle ? nom + organe affichés pendant toute la réplique (grand bandeau au confessionnal, pastille ailleurs)
      // l'étiquette n'apparaît que sur les plans où l'on voit vraiment celui qui parle (jamais sur un plan de réaction d'un autre personnage)
      if (id && who && (!teaser || set === 'confessional')) {
        const wasIntro = introduced.has(id);
        for (const bb of beats) {
          if (bb.line !== it.line || bb.t0 < t0 - 1e-6) continue;
          const sh = bb.shot || {};
          const onSpeaker = sh.subject === id || (sh.type === 'keyhole' && sh.other === id) || (sh.type === 'two' && (sh.subject === id || sh.other === id)) || sh.type === 'confession';
          if (!onSpeaker) continue;
          overlays.push({ type: 'tag', t0: bb.t0 + 0.08, t1: bb.t1, name: who.name, role: who.role, color: who.color, big: set === 'confessional', after: !wasIntro && !teaser && Math.abs(bb.t0 - t0) < 1e-6 ? 2.9 : 0 });
        }
      }
      if (id && !introduced.has(id) && !teaser && who) {
        introduced.add(id);
        overlays.push({ type: 'name', t0: t0 + 0.15, t1: Math.min(t, t0 + 2.9), name: who.name, role: who.role, color: who.color });
        sfx.push({ type: 'pop', t: t0 + 0.15 });
      }
      if (acting.sfx) sfx.push({ type: acting.sfx, t: t0 + (acting.sfx === 'door' ? 0.5 : 0.05) });
      // stickers de réaction façon télé-réalité, près de la tête du personnage
      if (id && !vo) {
        const em = (actors[id] || {}).emotion;
        const st = em === 'shocked' ? { text: '?!', color: '#ffe44d' } : em === 'angry' ? { text: 'GRRR !', color: '#ff3b3b' } : em === 'sassy' && acting.crash ? { text: 'OUPS…', color: '#ff3da8' } : em === 'tired' ? { icon: 'drop', text: '', color: '#7ad0ff' } : null;
        if (st) overlays.push({ type: 'sticker', who: id, t0: t0 + 0.2, t1: Math.min(t, t0 + 2.2), ...st });
      }
      if (teaser && vo && /clash|trahison|danger/.test(norm(it.text))) overlays.push({ type: 'sticker', who: null, t0: t0 + 0.1, t1: t, text: 'CLASH !', color: '#ff3b3b', x: 0.72, y: 0.3 });
      if (voMood.sfx) sfx.push({ type: voMood.sfx, t: t0 + 0.05 });
      if (shot.crash) sfx.push({ type: 'zoom', t: t0 });
      lastSpan = { t0, t1: t, color: who?.color || '#7b2cff' };
      if (pendingBox) {
        overlays.push({ type: 'box', t0: t0 + 0.25, t1: Math.max(t, t0 + 4.2), title: pendingBox.title, text: pendingBox.text, color: who?.color || '#7b2cff' });
        sfx.push({ type: 'ding', t: t0 + 0.25 }); pendingBox = null;
      }
      if (gauge && set !== 'confessional') {
        overlays.push({ type: 'gauge', t0: Math.max(gauge.t0, t0), t1: t, label: gauge.label, from: gauge.lastTo ?? gauge.from, to: gauge.to });
        gauge.lastTo = gauge.to; gauge.t0 = t;
      }
      if (recap && /a retenir/.test(norm(it.text))) {
        overlays.push({ type: 'recap', t0: t0 + 0.3, t1: t, text: it.text.replace(/^à retenir\s*:\s*/i, '') });
      }
      if (/abonne/.test(norm(it.text))) {
        const nextT = it.note && /teaser|prochain|demain/.test(norm(it.note)) ? it.note.replace(/^[^:]*:\s*/, '') : (opts.next || '');
        overlays.push({ type: 'cta', t0: t0 + 0.2, t1: t + 1.2, text: 'ABONNE-TOI !', next: nextT ? `Demain dans la villa : ${nextT.toUpperCase()}` : '' });
        sfx.push({ type: 'bell', t: t0 + 0.3 });
      }
    });
    // encadré resté seul en fin de section : on l'accroche au dernier plan
    if (pendingBox && beats.length) {
      const last = beats.at(-1);
      overlays.push({ type: 'box', t0: last.t0, t1: last.t1 + 1, title: pendingBox.title, text: pendingBox.text });
    }
    if (savedVilla) { villa.present = savedVilla.present; villa.pos = savedVilla.pos; }
    if (previously && t > secStart) overlays.push({ type: 'banner', t0: secStart, t1: t, text: 'PRÉCÉDEMMENT DANS LA VILLA…' });
    if (gauge && gauge.t0 < t) overlays.push({ type: 'gauge', t0: gauge.t0, t1: t, label: gauge.label, from: gauge.lastTo ?? gauge.from, to: gauge.to });
  });
  // fin : on prolonge un peu le dernier plan
  if (beats.length) { const last = beats.at(-1); last.dur += 1.2; last.t1 += 1.2; t = last.t1; }
  // accroche des 3 premières secondes (rétention TikTok)
  const hook = hookText || (doc.pathology ? `${doc.pathology} : ce qui se passe VRAIMENT dans ton corps` : null);
  if (hook && beats.length) overlays.push({ type: 'hook', t0: 0.05, t1: Math.min(2.9, beats[0].t1 + 0.4), text: hook });
  // question finale pour les commentaires
  const q = questionText || 'Quel organe tu veux voir débarquer dans la villa ?';
  overlays.push({ type: 'question', t0: Math.max(0, t - 3.4), t1: t, text: q });
  // sources affichées pendant le récap (crédibilité)
  if (doc.sources?.length) {
    const recapStart = beats.find((b) => doc.sections.find((sec) => sec.kind === 'recap') && b.t0 >= 0 && b.kind === 'vo' && b.isRecap)?.t0;
    const names = [...new Set(doc.sources.map((s) => s.name.split(/[—–:(]/)[0].trim()).filter(Boolean))].slice(0, 4);
    const t0s = recapStart ?? Math.max(0, t - 8);
    overlays.push({ type: 'sources', t0: t0s, t1: t, text: `Sources : ${names.join(' · ')}` });
  }
  // badge d'épisode (hors générique et cartons)
  const titleEnd = beats.find((b) => b.kind === 'title')?.t1 ?? 0;
  if (epLabel.length > 6) overlays.push({ type: 'badge', t0: titleEnd + 0.3, t1: t, text: epLabel });

  const usedIds = new Set(); beats.forEach((b) => Object.keys(b.actors).forEach((k) => usedIds.add(k)));
  const cast = casting.list.filter((e) => usedIds.has(e.id)).map((e) => ({ id: e.id, def: e.def, name: e.name, color: e.color, voice: e.voice }));
  return {
    version: 1,
    newCharacters: cast.filter((c) => casting.list.find((e) => e.id === c.id)?.isNew).map((c) => c.name),
    castEntries: casting.list.filter((e) => usedIds.has(e.id)),
    meta: { title: doc.title, episode: doc.episode, episodeName: doc.episodeName, pathology: doc.pathology, fps, duration: t },
    cast, beats, overlays: [...overlays, { type: 'progress', t0: 0, t1: t }].filter((o) => o.t1 > o.t0), audio: { voices, sfx: sfx.filter((s) => s.t >= 0).sort((a, b) => a.t - b.t), music },
    narratorVoice: casting.narrator.voice,
  };
}

function lighten(hex) {
  const n = parseInt(hex.slice(1), 16); const r = n >> 16, g = (n >> 8) & 255, b = n & 255;
  // couleur de sous-titre toujours lisible sur fond sombre : les couleurs foncées (caillot noir…) sont fortement éclaircies
  const L = (0.2126 * r + 0.7152 * g + 0.0722 * b) / 255;
  const k = L < 0.25 ? 0.72 : L < 0.45 ? 0.5 : 0.35;
  const f = (v) => Math.round(v + (255 - v) * k);
  return `#${[f(r), f(g), f(b)].map((v) => v.toString(16).padStart(2, '0')).join('')}`;
}
