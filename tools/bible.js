#!/usr/bin/env node
// Bible des personnages.  node tools/bible.js            -> liste
//                         node tools/bible.js ajouter scripts/ep02.md   -> enregistre les nouveaux personnages
import fs from 'node:fs';
import { buildTimeline } from '../engine/script/director.js';
import { parseScript } from '../engine/script/parser.js';
import { registerCast } from '../engine/script/bible.js';
import { loadBible, saveBible } from './serie.js';
const [cmd, file] = process.argv.slice(2);
const bible = loadBible();
if (cmd === 'ajouter' && file) {
  const doc = parseScript(fs.readFileSync(file, 'utf8'));
  const tl = buildTimeline(doc, { bible });
  const added = registerCast(bible, tl.castEntries, doc.episode);
  saveBible(bible);
  console.log(added.length ? `Nouveaux personnages enregistrés : ${added.join(', ')}` : 'Aucun nouveau personnage (tous déjà dans la bible).');
} else {
  for (const p of Object.values(bible.personnages)) console.log(`• ${p.nom.padEnd(12)} ${String(p.role || '').padEnd(34)} voix ${p.voix?.voice}  ép. ${(p.apparitions || []).join(', ')}`);
}
