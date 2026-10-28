// Mémoire de la série : bible des personnages + planning des épisodes (dossier villa/).
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { emptyBible } from '../engine/script/bible.js';

export const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
export const BIBLE = path.join(ROOT, 'villa', 'bible.json');
export const SERIE = path.join(ROOT, 'villa', 'serie.json');

export function loadBible() { try { return JSON.parse(fs.readFileSync(BIBLE, 'utf8')); } catch { return emptyBible(); } }
export function saveBible(b) { fs.mkdirSync(path.dirname(BIBLE), { recursive: true }); fs.writeFileSync(BIBLE, JSON.stringify(b, null, 2) + '\n'); }
export function loadSerie() { try { return JSON.parse(fs.readFileSync(SERIE, 'utf8')); } catch { return { episodes: [] }; } }
export function saveSerie(s) { fs.writeFileSync(SERIE, JSON.stringify(s, null, 2) + '\n'); }

/** Titre court de l'épisode suivant prévu (pour le « Demain dans la villa : … »). */
export function nextEpisodeTitle(num) {
  const s = loadSerie(); const n = s.episodes.find((e) => e.numero === (num ?? 0) + 1);
  return n ? n.pathologie : '';
}
