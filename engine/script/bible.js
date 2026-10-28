// « Bible » de la série : mémoire des personnages (apparence, voix, couleur) d'un épisode à l'autre.
// Un personnage créé une fois est réutilisé À L'IDENTIQUE ensuite, retrouvé par son nom
// ou par l'organe / la notion qu'il incarne (ex. « le pancréas » -> Pancho).
import { slug } from './parser.js';

const norm = (s) => String(s || '').toLowerCase().replace(/œ/g, 'oe').replace(/æ/g, 'ae').normalize('NFD').replace(/[̀-ͯ]/g, '');

// Notions médicales servant à reconnaître un personnage déjà existant.
export const NOTIONS = [
  'pancreas', 'insuline', 'glucose', 'sucre', 'cellule', 'coeur', 'artere', 'veine', 'vaisseau', 'globule rouge', 'globule blanc', 'plaquette',
  'rein', 'foie', 'poumon', 'bronche', 'cerveau', 'neurone', 'estomac', 'intestin', 'os', 'calcium', 'sel', 'sodium', 'cholesterol', 'graisse',
  'pression', 'tension', 'thyroide', 'hormone', 'fer', 'hemoglobine', 'virus', 'bacterie', 'antibiotique', 'histamine', 'pollen', 'peau',
  'vessie', 'appendice', 'articulation', 'cartilage', 'muscle', 'oxygene', 'medicament', 'vaccin', 'anticorps', 'lymphocyte', 'macrophage', 'josh',
];
export function notionsOf(text) {
  const t = ` ${norm(text)} `;
  // triées par ordre d'apparition dans le texte
  return NOTIONS.map((n) => [n, t.search(new RegExp(`[^a-z]${n}s?[^a-z]`))]).filter(([, i]) => i >= 0).sort((a, b) => a[1] - b[1]).map(([n]) => n);
}

export function emptyBible() { return { version: 1, personnages: {}, maj: null }; }

/** Cherche un personnage de la bible par nom, alias ou notion incarnée. */
export function findInBible(bible, name, description = '') {
  if (!bible?.personnages) return null;
  const id = slug(name);
  if (bible.personnages[id]) return bible.personnages[id];
  for (const p of Object.values(bible.personnages)) if ((p.alias || []).some((a) => slug(a) === id)) return p;
  // par notion : ce que le personnage EST (nom + première phrase de la description)
  const mine = notionsOf(String(description).split(/[.!?]/)[0]);
  if (mine.length) {
    for (const p of Object.values(bible.personnages)) {
      const theirs = p.notions || [];
      if (mine[0] && theirs.includes(mine[0])) return p;
    }
  }
  return null;
}

/** Ajoute / met à jour les personnages d'un épisode. Renvoie la liste des nouveaux. */
export function registerCast(bible, castList, episode) {
  const added = [];
  for (const e of castList) {
    const p = bible.personnages[e.id];
    if (p) {
      if (episode && !(p.apparitions || []).includes(episode)) p.apparitions = [...(p.apparitions || []), episode];
      if (e.alias && !p.alias?.includes(e.alias)) p.alias = [...(p.alias || []), e.alias];
      continue;
    }
    bible.personnages[e.id] = {
      id: e.id, nom: e.name, role: e.role, description: e.description || '', couleur: e.color, genre: e.gender,
      notions: notionsOf(`${e.name} ${e.role} ${e.description}`), def: e.def, voix: e.voice,
      premierEpisode: episode ?? null, apparitions: episode ? [episode] : [], alias: [],
    };
    added.push(e.name);
  }
  bible.maj = new Date().toISOString().slice(0, 10);
  return added;
}
