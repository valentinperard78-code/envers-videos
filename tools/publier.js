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
import * as B from '../publisher/buffer.js';

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

// ---------------------------------------------------------------- mode Buffer
// Buffer (gratuit) publie lui-même sur TikTok aux heures de son « Posting schedule ».
// Nous, on garde simplement sa file remplie (10 vidéos max sur l'offre gratuite).
const rawUrl = (ep) => `https://raw.githubusercontent.com/${REPO}/villa-videos/${ep}/${ep}.mp4`;
const MAX_OCTETS = 95e6; // GitHub refuse les fichiers > 100 Mo

/** Prochains épisodes à envoyer à Buffer (dans l'ordre de la file, en s'arrêtant au premier pas encore rendu). */
function aEnvoyer(conf, videos, n) {
  const done = new Set((conf.historique || []).filter((h) => h.statut !== 'echec').map((h) => h.episode));
  const out = [];
  for (const ep of conf.file || []) {
    if (done.has(ep)) continue;
    if (out.length >= n || !fs.existsSync(path.join(videos, ep))) break;
    out.push(ep);
  }
  return out;
}

/** Buffer a besoin d'UN fichier public : recolle les vidéos découpées et les réencode sous 95 Mo. Renvoie la liste des fichiers modifiés. */
export function preparer(conf, videos, n = conf.buffer?.tampon ?? 10) {
  const changed = [];
  for (const ep of aEnvoyer(conf, videos, n)) {
    const d = path.join(videos, ep), mp4 = path.join(d, `${ep}.mp4`);
    if (fs.existsSync(mp4) && fs.statSync(mp4).size <= MAX_OCTETS) continue;
    const src = findVideo(videos, ep);
    if (!src) continue;
    const dur = +spawnSync('ffprobe', ['-v', 'error', '-show_entries', 'format=duration', '-of', 'csv=p=0', src], { encoding: 'utf8' }).stdout || 150;
    const kbps = Math.min(6000, Math.floor((88e6 * 8) / dur / 1000) - 200); // vidéo + 192k audio < 90 Mo
    const tmp = path.join(process.env.RUNNER_TEMP || '/tmp', `${ep}.tiktok.mp4`);
    log(`🎞  ${ep} : réencodage en un seul fichier (${kbps} kb/s)…`);
    const r = spawnSync('ffmpeg', ['-y', '-v', 'error', '-i', src, '-c:v', 'libx264', '-preset', 'medium', '-b:v', `${kbps}k`, '-maxrate', `${kbps}k`, '-bufsize', `${kbps * 2}k`, '-pix_fmt', 'yuv420p', '-c:a', 'copy', '-movflags', '+faststart', tmp], { stdio: 'inherit' });
    if (r.status !== 0 || !fs.existsSync(tmp)) { log(`❌ réencodage impossible pour ${ep}`); continue; }
    for (const f of fs.readdirSync(d)) if (f.startsWith(`${ep}.mp4.part`)) fs.rmSync(path.join(d, f));
    fs.copyFileSync(tmp, mp4);
    changed.push(mp4);
    log(`   → ${(fs.statSync(mp4).size / 1e6).toFixed(1)} Mo`);
  }
  return changed;
}

async function remplirBuffer(conf, videos, now) {
  const key = process.env.BUFFER_API_KEY;
  if (!key) { log('⏸  Secret GitHub BUFFER_API_KEY pas encore ajouté (clé à créer sur https://publish.buffer.com/settings/api) : rien à faire.'); return; }
  const org = await B.organizationId(key);
  const ch = await B.tiktokChannel(key, org, conf.buffer?.chaine);
  const deja = await B.scheduled(key, org, ch.id);
  const tampon = conf.buffer?.tampon ?? 10;
  log(`📚 Buffer : chaîne « ${ch.displayName || ch.name} » — ${deja.length} vidéo(s) déjà en file (max ${tampon}).${ch.isQueuePaused ? ' ⚠ file en PAUSE dans Buffer !' : ''}`);
  const eps = aEnvoyer(conf, videos, Math.max(0, tampon - deja.length));
  const ajout = [];
  for (const ep of eps) {
    const mp4 = path.join(videos, ep, `${ep}.mp4`);
    if (!fs.existsSync(mp4)) { log(`⏭  ${ep} : pas encore de fichier unique, il sera prêt au prochain passage.`); break; }
    const text = caption(videos, ep);
    if (has('--essai')) { log(`(essai) ${ep} → ${rawUrl(ep)}`); continue; }
    const entry = { episode: ep, date: now.date, heure: now.hhmm, mode: 'buffer' };
    try {
      entry.buffer = await B.queueVideo(key, { channelId: ch.id, text, url: rawUrl(ep) });
      entry.statut = 'en-file'; ajout.push(ep);
      log(`✅ ${ep} ajouté à la file Buffer.`);
    } catch (e) {
      entry.statut = 'echec'; entry.raison = e.message; log(`❌ ${ep} : ${e.message}`);
      await notify(conf, { title: `❌ Buffer a refusé ${ep}`, message: e.message, ep, tags: 'warning' });
      process.exitCode = 1;
    }
    conf.historique = [...(conf.historique || []), entry].slice(-500);
    if (entry.statut === 'echec') break;
  }
  if (ajout.length) await notify(conf, { title: `🎬 ${ajout.length} épisode(s) programmé(s) dans Buffer`, message: `${ajout.join(', ')}\nBuffer les publiera tout seul sur TikTok aux heures prévues.`, ep: ajout[0] });
  const reste = aEnvoyer(conf, videos, 99).length;
  if (!has('--essai') && deja.length + ajout.length <= 2 && !reste) await notify(conf, { title: 'Villa : bientôt plus d\'épisodes', message: `Il ne reste que ${deja.length + ajout.length} vidéo(s) en file dans Buffer. Lance la production des prochains épisodes.`, ep: 'none', tags: 'warning' });
}

async function main() {
  const conf = JSON.parse(fs.readFileSync(CONF, 'utf8'));
  const videos = get('--videos', path.join(ROOT, '..', 'villa-videos'));
  const now = parisNow();
  if (has('--preparer')) { const c = preparer(conf, videos); log(c.length ? `${c.length} vidéo(s) préparée(s) pour Buffer.` : 'Rien à préparer.'); return; }
  if (conf.mode === 'buffer') {
    if (!conf.actif && !has('--maintenant')) { log('Publication automatique désactivée (« actif »: false).'); return; }
    await remplirBuffer(conf, videos, now);
    if (!has('--essai')) fs.writeFileSync(CONF, JSON.stringify(conf, null, 2) + '\n');
    return;
  }
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
