// Coffre-fort des jetons TikTok : chiffré (AES-256-GCM) avec une clé qui ne quitte jamais tes secrets GitHub / ton PC.
// Le fichier chiffré (villa/tiktok-jeton.chiffre) peut être versionné sans risque : sans la clé, il est illisible.
import fs from 'node:fs';
import crypto from 'node:crypto';

export const newKey = () => crypto.randomBytes(32).toString('base64');

export function encrypt(obj, keyB64) {
  const key = Buffer.from(keyB64, 'base64'); if (key.length !== 32) throw new Error('Clé TIKTOK_CLE invalide (32 octets en base64 attendus).');
  const iv = crypto.randomBytes(12);
  const c = crypto.createCipheriv('aes-256-gcm', key, iv);
  const data = Buffer.concat([c.update(JSON.stringify(obj), 'utf8'), c.final()]);
  return JSON.stringify({ v: 1, iv: iv.toString('base64'), tag: c.getAuthTag().toString('base64'), data: data.toString('base64') });
}
export function decrypt(text, keyB64) {
  const o = JSON.parse(text); const key = Buffer.from(keyB64, 'base64');
  const d = crypto.createDecipheriv('aes-256-gcm', key, Buffer.from(o.iv, 'base64'));
  d.setAuthTag(Buffer.from(o.tag, 'base64'));
  return JSON.parse(Buffer.concat([d.update(Buffer.from(o.data, 'base64')), d.final()]).toString('utf8'));
}
export const load = (file, key) => (fs.existsSync(file) ? decrypt(fs.readFileSync(file, 'utf8'), key) : null);
export const save = (file, obj, key) => fs.writeFileSync(file, encrypt(obj, key) + '\n');
