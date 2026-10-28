// Publication : miniature, description, hashtags, sources + contrôle qualité des cadrages.
import fs from 'node:fs';
import path from 'node:path';
import { parseScript } from '../engine/script/parser.js';
import { startStaticServer } from './static-server.js';
import { findChrome, chromeArgs } from './chrome.js';
import { loadSerie } from './serie.js';

const strip = (s) => String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/œ/g, 'oe');
const tag = (s) => '#' + strip(s).toLowerCase().replace(/[^a-z0-9]+/g, '');

/** Texte prêt à publier (TikTok / Reels / Shorts). */
export function buildPostText(doc, tl) {
  const serie = loadSerie();
  const ep = serie.episodes.find((e) => e.numero === doc.episode) || {};
  const next = serie.episodes.find((e) => e.numero === (doc.episode || 0) + 1);
  const recap = doc.sections.find((s) => s.kind === 'recap')?.items.find((i) => i.type === 'line' && /retenir/i.test(i.text))?.text.replace(/^à retenir\s*:\s*/i, '');
  const patho = doc.pathology || ep.pathologie || '';
  const sources = [...new Set((doc.sources || []).map((s) => s.name.split(/[—–:(]/)[0].trim()).filter(Boolean))];
  const hook = pickHook(doc) || doc.episodeName || patho;
  const lines = [
    `🏠 La Villa des Pathologies — Ép. ${doc.episode ?? '?'} : ${doc.episodeName || patho}`,
    ep.pitch ? `${ep.pitch}` : '',
    recap ? `🧠 À retenir : ${recap}` : '',
    sources.length ? `📚 Sources : ${sources.join(', ')}` : '',
    '⚠️ Contenu éducatif : ne remplace pas l’avis d’un médecin.',
    next ? `👉 Demain dans la villa : ${next.pathologie}` : '',
  ].filter(Boolean);
  const STOP = new Set(['type', 'avec', 'dans', 'chez', 'pour', 'sans', 'syndrome', 'maladie', 'arterielle', 'aigue', 'chronique', 'plaques', 'atherome', 'myocarde', 'cerebral']);
  const words = patho.split(/[\s,()'’]+/).filter((w) => w.length > 3 && !STOP.has(strip(w).toLowerCase()));
  const hashtags = [...new Set(['#villadespathologies', tag(patho), ...words.map(tag), '#sante', '#apprendresurtiktok', '#medecine', '#infirmier', '#education', '#telerealite', '#corpshumain'])].filter((h) => h.length > 2).slice(0, 12);
  return { titre: `${doc.episodeName || patho} — La Villa des Pathologies Ép. ${doc.episode ?? ''}`.trim(), accroche: hook, description: lines.join('\n'), hashtags, sources: doc.sources || [], texteComplet: `${lines.join('\n')}\n\n${hashtags.join(' ')}` };
}
function pickHook(doc) {
  // 1) accroche écrite dans le script (« Accroche : … »)
  const written = doc.hook || doc.sections.flatMap((s) => s.items).find((i) => i.type === 'hook')?.text; if (written && written.length <= 40) return written;
  // 2) sinon une phrase (ou fin de phrase) choc du teaser : question ou exclamation d'abord, phrase complète de préférence
  const teaser = doc.sections.find((s) => s.kind === 'teaser');
  const cands = [];
  for (const i of (teaser?.items || []).filter((i) => i.type === 'line' && !i.voiceOver)) {
    for (const sent of (i.text.match(/[^.!?…]+[.!?…]*/g) || [i.text]).map((t) => t.trim())) {
      if (sent.length >= 8 && sent.length <= 34) cands.push({ t: sent, full: 1 });
      else if (sent.length > 34) { const tail = sent.split(/,\s*/).pop().trim(); if (tail.length >= 8 && tail.length <= 34) cands.push({ t: tail.charAt(0).toUpperCase() + tail.slice(1), full: 0 }); }
    }
  }
  const score = (c) => (/\?/.test(c.t) ? 3 : /!/.test(c.t) ? 2 : 0) + c.full + (c.t.length >= 14 ? 2 : 0);
  cands.sort((a, b) => score(b) - score(a) || a.t.length - b.t.length);
  return cands[0]?.t || '';
}
/** Moment le plus expressif pour la miniature. */
export function pickCoverTime(tl, prefer = null) {
  const after = tl.beats.find((b) => b.kind === 'title')?.t1 ?? 0;
  const emo = (b) => b.actors?.[b.speaker]?.emotion || '';
  let strong = tl.beats.filter((b) => b.speaker && b.shot && b.shot.subject === b.speaker && (b.shot.type === 'close' || b.shot.type === 'medium') && b.set !== 'confessional' && b.t0 >= after);
  // le personnage de l'accroche (ou la vedette de l'épisode) en priorité sur la miniature
  if (prefer) { const own = strong.filter((b) => b.speaker === prefer); if (own.length) strong = own; }
  const pick = strong.find((b) => /sassy|angry|shocked/.test(emo(b))) || strong.find((b) => b.shot.type === 'close') || strong[0] || tl.beats.find((b) => b.speaker) || tl.beats[0];
  return pick.t0 + Math.min(1.2, (pick.t1 - pick.t0) * 0.6);
}

/** Rend la miniature (1080x1920, qualité max) et lance le contrôle qualité des cadrages. */
export async function coverAndQC(work, scriptPath, outFile, log = console.log) {
  const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1')), '..');
  const tl = JSON.parse(fs.readFileSync(path.join(work, 'timeline.json'), 'utf8'));
  const doc = parseScript(fs.readFileSync(scriptPath, 'utf8'));
  const post = buildPostText(doc, tl);
  const base = outFile.replace(/\.mp4$/, '');
  fs.writeFileSync(`${base}.publication.txt`, post.texteComplet + '\n');
  fs.writeFileSync(`${base}.publication.json`, JSON.stringify(post, null, 2));
  const srv = await startStaticServer(ROOT, 0);
  const puppeteer = (await import('puppeteer-core')).default;
  const browser = await puppeteer.launch({ executablePath: findChrome(), args: chromeArgs(), protocolTimeout: 900000 });
  try {
    const page = await browser.newPage();
    await page.goto(`http://127.0.0.1:${srv.address().port}/app/render.html?q=max&w=1080`, { timeout: 0 });
    await page.waitForFunction('window.ready===true', { timeout: 0 });
    await page.evaluate((json) => window.loadTimeline(JSON.parse(json)), JSON.stringify(tl));
    const slug = (n) => String(n || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, '');
    const hookLine = doc.sections.flatMap((x) => x.items).find((i) => i.type === 'line' && !i.voiceOver && post.accroche && i.text.includes(post.accroche.replace(/^./, (c) => c)));
    const star = (doc.casting || []).find((c) => !/voix|narrat/i.test(c.name));
    const t = pickCoverTime(tl, slug(hookLine?.speaker || star?.name));
    const b64 = await page.evaluate((t, c) => window.renderCover(t, c), t, { title: doc.pathology || doc.episodeName, hook: post.accroche, episode: doc.episode });
    fs.writeFileSync(`${base}.couverture.jpg`, Buffer.from(b64, 'base64'));
    log(`🖼  Miniature créée (moment : ${t.toFixed(1)} s).`);
    const issues = await page.evaluate(() => window.qualityCheck());
    fs.writeFileSync(`${base}.controle.json`, JSON.stringify(issues, null, 2));
    const bad = issues.filter((i) => i.level !== 'info');
    log(bad.length ? `🔎 Contrôle qualité : ${bad.length} point(s) à vérifier\n   - ${bad.slice(0, 12).map((i) => i.msg).join('\n   - ')}` : '🔎 Contrôle qualité : aucun problème de cadrage détecté.');
    return { post, issues };
  } finally { await browser.close(); srv.close(); }
}
