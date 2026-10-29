# Villa Publisher — publication TikTok automatique (gratuite)

Villa Publisher publie les épisodes de « La Villa des Pathologies » sur TikTok aux heures du calendrier, **sans crédits ni abonnement** : il utilise l'API officielle de TikTok (Content Posting API) et tourne gratuitement sur GitHub Actions (toutes les heures, le script vérifie si un créneau est arrivé).

## Ce que TikTok autorise (important)
- **Mode « brouillon » (par défaut)** : la vidéo est envoyée dans les brouillons de ton compte TikTok (boîte de réception), tu reçois une notification sur ton téléphone avec le texte et les hashtags, et tu publies en public dans l'appli en ~10 secondes. Fonctionne sans audit. Maximum **5 vidéos en attente** à la fois.
- **Mode « direct »** : publication directe. Tant que l'application n'est pas **auditée** par TikTok, la publication est forcément **privée** (SELF_ONLY), sur un compte privé. Les règles TikTok indiquent qu'un outil qui ne publie que sur ses propres comptes n'est pas accepté à l'audit : le mode brouillon reste donc le mode recommandé.
- Limite TikTok : environ **15 publications par jour** par compte, tous outils confondus.
- Pas de robot qui clique sur le site TikTok : c'est interdit par les conditions d'utilisation (risque de bannissement).

## Mise en route (une seule fois, ~10 min)
1. **developers.tiktok.com** → connecte-toi avec ton compte TikTok → *Manage apps* → *Connect an app* (nom : Villa Publisher).
   - URL des conditions : https://github.com/valentinperard78-code/envers-videos/blob/villa-studio/docs/legal/conditions.md
   - URL de confidentialité : https://github.com/valentinperard78-code/envers-videos/blob/villa-studio/docs/legal/confidentialite.md
2. Ajoute les produits **Login Kit** et **Content Posting API** (active *Direct Post* si tu veux le mode direct).
3. Login Kit → plateforme **Desktop** → Redirect URI : `http://127.0.0.1:3455/callback/`
4. Scopes : `user.info.basic`, `video.upload`, `video.publish`. Onglet **Sandbox** : ajoute ton compte TikTok en « target user ».
5. Lance le studio (`LANCER-STUDIO.bat`) → **📅 Publication TikTok** → colle *Client key* et *Client secret* → **Connecter mon compte TikTok** → accepte sur TikTok. (Ou `CONNECTER-TIKTOK.bat`.)
6. Colle les 4 secrets affichés dans **GitHub → Settings → Secrets and variables → Actions** : `TIKTOK_CLIENT_KEY`, `TIKTOK_CLIENT_SECRET`, `TIKTOK_CLE`, `TIKTOK_JETON`.
7. Notifications (recommandé) : installe l'appli gratuite **ntfy** (Android/iOS), abonne-toi à un nom secret (ex. `villa-valentin-7k2p`) et ajoute ce nom en secret GitHub `NTFY_TOPIC`.
8. Passe `"actif": true` dans `villa/publication.json` (ou demande-le à Claude).

## Calendrier et file
`villa/publication.json` (branche `villa-studio`) :
- `horaires` : heures de Paris par jour (autant que tu veux, dans la limite `maxParJour`) ;
- `file` : ordre des épisodes à publier ; `historique` : ce qui a été envoyé (rempli automatiquement) ;
- `mode` : `brouillon` ou `direct` ; `confidentialiteDirect` : `SELF_ONLY` tant que l'appli n'est pas auditée.

Publication immédiate : GitHub → *Actions* → **Villa — publication TikTok** → *Run workflow* (champ épisode optionnel, case « essai » pour tester sans rien envoyer).

## Sécurité
- Les jetons TikTok sont chiffrés (AES-256-GCM) dans `villa/tiktok-jeton.chiffre` ; la clé (`TIKTOK_CLE`) n'existe que dans tes secrets GitHub et sur ton PC (`.tiktok-app.json`, jamais envoyé sur GitHub).
- Le jeton de renouvellement est valable 365 jours ; il est renouvelé et ré-enregistré automatiquement à chaque publication. Après un an sans publication, il faut reconnecter le compte.
