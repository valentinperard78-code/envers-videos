// Client TikTok (API officielle « Content Posting » + Login Kit desktop).
// Docs : developers.tiktok.com — content-posting-api-get-started, -reference-direct-post,
//        -reference-upload-video, -media-transfer-guide, login-kit-desktop, oauth-user-access-token-management.
//
// Deux façons de publier :
//  - « brouillon » (scope video.upload) : la vidéo arrive dans la boîte de réception TikTok du compte,
//    on termine la publication dans l'appli (≈ 10 s). Fonctionne sans audit. Max 5 envois en attente / 24 h.
//  - « direct » (scope video.publish) : publication directe. Sans audit TikTok, uniquement en privé (SELF_ONLY).
import fs from 'node:fs';
import crypto from 'node:crypto';

export const API = process.env.TIKTOK_API_BASE || 'https://open.tiktokapis.com'; // (surcharge possible pour les tests)
export const AUTH_URL = 'https://www.tiktok.com/v2/auth/authorize/';
export const SCOPES = ['user.info.basic', 'video.upload', 'video.publish'];

// ---------------------------------------------------------------- OAuth (desktop, PKCE S256 en hexadécimal)
export function pkce() {
  const verifier = crypto.randomBytes(48).toString('base64url').slice(0, 64); // 43..128 caractères non réservés
  const challenge = crypto.createHash('sha256').update(verifier).digest('hex');
  return { verifier, challenge };
}
export function authorizeUrl({ clientKey, redirectUri, state, challenge, scopes = SCOPES }) {
  const q = new URLSearchParams({ client_key: clientKey, response_type: 'code', scope: scopes.join(','), redirect_uri: redirectUri, state, code_challenge: challenge, code_challenge_method: 'S256' });
  return `${AUTH_URL}?${q}`;
}
async function tokenRequest(params) {
  const res = await fetch(`${API}/v2/oauth/token/`, { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded', 'Cache-Control': 'no-cache' }, body: new URLSearchParams(params) });
  const j = await res.json().catch(() => ({}));
  if (!res.ok || j.error || !j.access_token) throw new Error(`TikTok (jeton) : ${j.error_description || j.error || res.status}`);
  return { ...j, obtained_at: Date.now() };
}
export const exchangeCode = ({ clientKey, clientSecret, code, redirectUri, verifier }) =>
  tokenRequest({ client_key: clientKey, client_secret: clientSecret, code, grant_type: 'authorization_code', redirect_uri: redirectUri, code_verifier: verifier });
export const refresh = ({ clientKey, clientSecret, refreshToken }) =>
  tokenRequest({ client_key: clientKey, client_secret: clientSecret, grant_type: 'refresh_token', refresh_token: refreshToken });

// ---------------------------------------------------------------- appels authentifiés
async function call(token, path, body) {
  const res = await fetch(`${API}${path}`, { method: 'POST', headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json; charset=UTF-8' }, body: JSON.stringify(body || {}) });
  const j = await res.json().catch(() => ({}));
  const code = j?.error?.code;
  if (!res.ok || (code && code !== 'ok')) {
    const hints = {
      spam_risk_too_many_posts: 'TikTok a atteint la limite de publications du jour pour ce compte (≈ 15/jour, tous outils confondus).',
      spam_risk_too_many_pending_share: 'Déjà 5 vidéos en attente dans tes brouillons TikTok : publie-les ou supprime-les, puis réessaie.',
      reached_active_user_cap: "L'application TikTok n'est pas encore validée (audit) : nombre d'utilisateurs limité.",
      unaudited_client_can_only_post_to_private_accounts: "Application non auditée : la publication directe n'est possible qu'en privé, sur un compte privé. Utilise le mode « brouillon ».",
      scope_not_authorized: "Autorisation manquante : reconnecte le compte TikTok (CONNECTER-TIKTOK).",
      access_token_invalid: 'Jeton expiré ou invalide : reconnecte le compte TikTok.',
    };
    throw new Error(`TikTok ${path} : ${code || res.status} — ${hints[code] || j?.error?.message || ''}`);
  }
  return j.data || {};
}
export const userInfo = (token) => fetch(`${API}/v2/user/info/?fields=open_id,display_name,avatar_url`, { headers: { Authorization: `Bearer ${token}` } }).then((r) => r.json()).then((j) => j.data?.user || {});
export const creatorInfo = (token) => call(token, '/v2/post/publish/creator_info/query/', {});
export const status = (token, publishId) => call(token, '/v2/post/publish/status/fetch/', { publish_id: publishId });

// ---------------------------------------------------------------- envoi du fichier (découpage officiel : 5–64 Mo par morceau)
function chunking(size) {
  const MB = 1024 * 1024;
  if (size <= 64 * MB) return { chunkSize: size, count: 1 }; // un seul morceau jusqu'à 64 Mo
  const chunkSize = 20 * MB; // sinon morceaux de 20 Mo (le dernier absorbe le reste, ≤ 128 Mo)
  return { chunkSize, count: Math.floor(size / chunkSize) };
}
async function putChunks(uploadUrl, file, size, chunkSize, count, log) {
  const fd = fs.openSync(file, 'r');
  try {
    for (let i = 0; i < count; i++) {
      const start = i * chunkSize, end = i === count - 1 ? size - 1 : start + chunkSize - 1; // le dernier morceau absorbe le reste
      const len = end - start + 1, buf = Buffer.alloc(len);
      fs.readSync(fd, buf, 0, len, start);
      const res = await fetch(uploadUrl, { method: 'PUT', headers: { 'Content-Type': 'video/mp4', 'Content-Length': String(len), 'Content-Range': `bytes ${start}-${end}/${size}` }, body: buf });
      if (![200, 201, 206].includes(res.status)) throw new Error(`Envoi du morceau ${i + 1}/${count} refusé (${res.status}) : ${await res.text().catch(() => '')}`);
      log?.(`   ⬆ morceau ${i + 1}/${count} envoyé`);
    }
  } finally { fs.closeSync(fd); }
}

/** Mode brouillon : la vidéo arrive dans la boîte de réception TikTok (publication finale dans l'appli). */
export async function uploadDraft(token, file, log) {
  const size = fs.statSync(file).size; const { chunkSize, count } = chunking(size);
  const d = await call(token, '/v2/post/publish/inbox/video/init/', { source_info: { source: 'FILE_UPLOAD', video_size: size, chunk_size: chunkSize, total_chunk_count: count } });
  await putChunks(d.upload_url, file, size, chunkSize, count, log);
  return d.publish_id;
}

/** Mode direct : publication immédiate (en privé tant que l'application n'est pas auditée par TikTok). */
export async function directPost(token, file, { title, privacy, allowComment = true, coverMs = 1000, aigc = true }, log) {
  const info = await creatorInfo(token);
  const options = info.privacy_level_options || [];
  if (!options.includes(privacy)) throw new Error(`Confidentialité « ${privacy} » non proposée par TikTok pour ce compte (possibles : ${options.join(', ')}).`);
  const size = fs.statSync(file).size; const { chunkSize, count } = chunking(size);
  const d = await call(token, '/v2/post/publish/video/init/', {
    post_info: { title: String(title || '').slice(0, 2200), privacy_level: privacy, disable_comment: !allowComment || !!info.comment_disabled, disable_duet: true, disable_stitch: true, video_cover_timestamp_ms: coverMs, brand_content_toggle: false, brand_organic_toggle: false, is_aigc: aigc },
    source_info: { source: 'FILE_UPLOAD', video_size: size, chunk_size: chunkSize, total_chunk_count: count },
  });
  await putChunks(d.upload_url, file, size, chunkSize, count, log);
  return d.publish_id;
}

/** Attend la fin du traitement TikTok (≤ ~5 min). */
export async function waitStatus(token, publishId, log, tries = 30) {
  let last = null;
  for (let i = 0; i < tries; i++) {
    await new Promise((r) => setTimeout(r, 10000 + i * 1000)); // 6 requêtes/min max par jeton
    last = await status(token, publishId).catch((e) => ({ status: 'ERREUR', fail_reason: e.message }));
    log?.(`   ⏳ statut TikTok : ${last.status}${last.fail_reason ? ' (' + last.fail_reason + ')' : ''}`);
    if (['PUBLISH_COMPLETE', 'SEND_TO_USER_INBOX', 'FAILED'].includes(last.status)) break;
  }
  return last;
}
