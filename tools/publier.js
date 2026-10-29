#!/usr/bin/env node
// Villa Publisher : publie automatiquement les épisodes sur TikTok selon le calendrier villa/publication.json.
// Utilisé par GitHub Actions toutes les heures (workflow « villa-publier » sur la branche principale),
// et utilisable à la main :  node tools/publier.js --videos <dossier villa-videos> [--maintenant] [--episode ep02-...] [--essai]
import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import * as T from '../publisher/tiktok.js';
import * as coffre from '../publisher/coffre.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const CONF = path.join(ROOT, 'villa', 'publication.json');
const VAULT = path.join(ROOT, 'villa', 'tiktok-jeton.chiffre');
const REPO = process.env.GITHUB_REPOSITORY || 'valentinperard78-code/envers-videos';
const argv = process.argv.slice(2);
const get = (k, d) => { const i = argv.indexOf(k); return i >= 0 ? argv[i + 1] : d; };
const has = (k) => argv.includes(k);
const log = (m) => console.log(m);

// ---------------------------------------------------------------- heure de Paris
const JOURS = ['dimanche', 'lundi', 'mardi', 'mercredi', 'jeudi', 'vendredi', 'samedi'];
function parisNow(d = new Date()) {
  const p = Object.fromEntries(new Intl.DateTimeFormat('fr-FR', { timeZone: 'Europe/Paris', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', weekday: 'long', hour12: false }).formatToParts(d).map((x) => [x.type, x.value]));
  return { date: `${p.year}-${p.month}-${p.day}`, jour: p.weekday.toLowerCase(), minutes: (+p.hour % 24) * 60 + +p.minute, hhmm: `${p.hour}:${p.minute}` };
}
const toMin = (s) => { const [h, m] = s.split(':').map(Number); return h * 60 + m; };

/** Créneau à publier maintenant ? (créneau passé depuis moins de 90 min, pas encore utilisé, quota du jour non atteint) */
export function dueSlot(conf, now = parisNow()) {
  const slots = (conf.horaires?.[now.jour] || []).slice().sort();
  const today = (conf.historique || []).filter((h) => h.date === now.date && h.statut !== 'echec');
  if (today.length >= (conf.maxParJour ?? 2)) return null;
  for (const s of slots) {
    const dm = now.minutes - toMin(s);
    if (dm >= 0 && dm < 90 && !today.some((h) => h.creneau === s)) return s;
  }
  return null;
}
export function nextEpisode(conf) {
  const done = new Set((conf.historique || []).filter((h) => h.statut !== 'echec').map((h) => h.episode));
  return (conf.file || []).find((e) => !done.has(e)) || null;
}

function findVideo(dir, ep) {
  const d = path.join(dir, ep), mp4 = path.join(d, `${ep}.mp4`);
  if (fs.existsSync(mp4)) return mp4;
  if (!fs.existsSync(d)) return null;
  const parts = fs.readdirSync(d).filter((f) => f.startsWith(`${ep}.mp4.part`)).sort();
  if (!parts.length) return null;
  const out = path.join(process.env.RUNNER_TEMP || '/tmp', `${ep}.mp4`);
  fs.writeFileSync(out, Buffer.concat(parts.map((p) => fs.readFileSync(path.join(d, p)))));
  return out;
}
function caption(dir, ep) {
  const f = path.join(dir, ep, `${ep}.publication.txt`);
  return fs.existsSync(f) ? fs.readFileSync(f, 'utf8').trim() : `La Villa des Pathologies — ${ep}`;
}

async function notify(conf, { title, message, ep, tags = 'tv' }) {
  const topic = process.env.NTFY_TOPIC || conf.notification?.ntfy;
  if (!topic) return;
  const cover = `https://raw.githubusercontent.com/${REPO}/villa-videos/${ep}/${ep}.couverture.jpg`;
  const headers = { Title: encodeURIComponent(title).length === title.length ? title : `=?UTF-8?B?${Buffer.from(title).toString('base64')}?=`, Tags: tags, Click: 'https://www.tiktok.com/', Attach: cover, Filename: 'miniature.jpg' };
  await fetch(`https://ntfy.sh/${encodeURIComponent(topic)}`, { method: 'POST', headers, body: message }).then((r) => log(`🔔 Notification envoyée (${r.status}).`)).catch((e) => log(`⚠ notification : ${e.message}`));
}

async function token() {
  const clientKey = process.env.TIKTOK_CLIENT_KEY, clientSecret = process.env.TIKTOK_CLIENT_SECRET, key = process.env.TIKTOK_CLE;
  if (!clientKey || !clientSecret || !key) throw new Error('Secrets manquants : TIKTOK_CLIENT_KEY, TIKTOK_CLIENT_SECRET et TIKTOK_CLE (voir docs/PUBLICATION-TIKTOK.md).');
  let tok = coffre.load(VAULT, key);
  if (!tok) throw new Error("Aucun compte TikTok connecté : lance CONNECTER-TIKTOK sur ton PC (voir docs/PUBLICATION-TIKTOK.md).");
  const expires = tok.obtained_at + (tok.expires_in || 0) * 1000 - 10 * 60 * 1000;
  if (Date.now() > expires) {
    log('🔑 Renouvellement du jeton TikTok…');
    const fresh = await T.refresh({ clientKey, clientSecret, refreshToken: tok.refresh_token });
    tok = { ...tok, ...fresh };
    coffre.save(VAULT, tok, key); // le jeton de renouvellement peut changer : on garde toujours le dernier
  }
  return tok.access_token;
}

async function main() {
  const conf = JSON.parse(fs.readFileSync(CONF, 'utf8'));
  const videos = get('--videos', path.join(ROOT, '..', 'villa-videos'));
  const now = parisNow();
  const forced = has('--maintenant') || has('--episode');
  if (!conf.actif && !forced) { log('Publication automatique désactivée (« actif »: false dans villa/publication.json).'); return; }
  const slot = forced ? now.hhmm : dueSlot(conf, now);
  if (!slot) { log(`Aucun créneau à publier maintenant (${now.jour} ${now.hhmm}, heure de Paris).`); return; }
  const ep = get('--episode') || nextEpisode(conf);
  if (!ep) { log('📭 File de publication vide : ajoute des épisodes dans villa/publication.json.'); await notify(conf, { title: 'Villa : file vide', message: "Plus aucun épisode prêt à publier. Ajoute-en dans la file de publication.", ep: 'none', tags: 'warning' }); return; }
  const file = findVideo(videos, ep);
  if (!file) { log(`❌ Vidéo introuvable pour ${ep} dans ${videos}.`); process.exitCode = 1; return; }
  const text = caption(videos, ep);
  log(`📤 ${ep} → TikTok (mode ${conf.mode}, créneau ${slot})`);
  if (has('--essai')) { log(`(essai) ${file} — ${(fs.statSync(file).size / 1e6).toFixed(1)} Mo\n${text}`); return; }

  const entry = { episode: ep, date: now.date, creneau: slot, mode: conf.mode, heure: now.hhmm };
  try {
    const tok = await token();
    let publishId;
    if (conf.mode === 'direct') publishId = await T.directPost(tok, file, { title: text, privacy: conf.confidentialiteDirect || 'SELF_ONLY' }, log);
    else publishId = await T.uploadDraft(tok, file, log);
    entry.publish_id = publishId;
    const st = await T.waitStatus(tok, publishId, log);
    entry.statut = st?.status === 'FAILED' ? 'echec' : 'ok'; entry.tiktok = st?.status; if (st?.fail_reason) entry.raison = st.fail_reason;
    if (entry.statut === 'ok') {
      const msg = conf.mode === 'direct'
        ? `Publié sur TikTok (${conf.confidentialiteDirect}).\n\n${text}`
        : `Vidéo arrivée dans tes brouillons TikTok. Ouvre TikTok → notifications → termine la publication.\nTexte à coller :\n\n${text}`;
      await notify(conf, { title: `🎬 ${ep} prêt sur TikTok`, message: msg, ep });
      log('✅ Envoyé.');
    } else {
      await notify(conf, { title: `❌ Échec TikTok : ${ep}`, message: `${st?.fail_reason || 'raison inconnue'} — nouvel essai au prochain créneau.`, ep, tags: 'warning' });
      process.exitCode = 1;
    }
  } catch (e) {
    entry.statut = 'echec'; entry.raison = e.message;
    log(`❌ ${e.message}`);
    await notify(conf, { title: `❌ Publication impossible : ${ep}`, message: e.message, ep, tags: 'warning' });
    process.exitCode = 1;
  }
  conf.historique = [...(conf.historique || []), entry].slice(-500);
  fs.writeFileSync(CONF, JSON.stringify(conf, null, 2) + '\n');
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) main().catch((e) => { console.error('❌', e.message); process.exit(1); });
