# Production automatique — La Villa des Pathologies

Objectif fixé par Valentin : **2 épisodes publiés par jour** (12:30 et 19:00, heure de Paris), sans qu'il ait à intervenir.
Claude choisit les pathologies (planning `villa/serie.json`), écrit, fait rendre, contrôle et met en file. Il prévient Valentin
quand le planning arrive au bout.

## La chaîne
1. **Écriture** (Claude) : `scripts/epNN-slug.md`, au format `docs/FORMAT-SCRIPT.md`, en respectant TOUTES les règles obligatoires
   (villa, nouveaux personnages, ~2 min, accroche/question, générique, précédemment, **scène traitement**, sources officielles, à retenir, teaser du lendemain).
   Chaque fait (chiffres, seuils, traitements) est vérifié sur une source autorisée avant d'être écrit.
2. **Contrôle de durée** : `node tools/render.js scripts/X.md --etape preparer --sans-voix --travail /tmp/w` → la timeline « sans voix »
   doit faire **≤ 160 s** (≈ 2 min 25 au rendu final). Sinon, raccourcir.
3. **Rendu** (GitHub Actions, gratuit) : un push qui modifie UN script lance son rendu (20 machines, ~25 min). Un seul script par push ;
   attendre que le rendu précédent ait démarré avant de pousser le suivant (un rendu en attente est annulé par le suivant).
4. **Contrôle qualité** (Claude) sur la branche `villa-videos` : planche d'images toutes les 5 s + miniature + texte de publication.
   Points à vérifier : villa présente, bandeau « ÉP. N | PATHOLOGIE » visible, personnages non pixelisés, étiquettes lisibles,
   rien de coupé en haut (zone TikTok), miniature lisible dans la grille 3:4, texte avec description + hashtags + sources.
   Défaut → corriger le moteur ou le script et relancer le rendu.
5. **Validation** : ajouter l'épisode à `file` ET à `valides` dans `villa/publication.json` (commit « [skip ci] »), statut « vidéo prête » dans `villa/serie.json`.
6. **Publication** : le workflow « Villa — publication TikTok » (branche main) passe toutes les 6 h, prépare la vidéo (miniature
   collée sur les 0,2 dernières secondes) et remplit la file **Buffer** (10 max). Buffer publie seul à 12:30 et 19:00.

## Rythme
- Garder **au moins 6 épisodes validés d'avance** (3 jours). Chaque passage de production écrit et rend jusqu'à 4 épisodes.
- Les épisodes sortent dans l'ordre du planning : le « Précédemment » de l'épisode N résume l'épisode N-1, et le teaser de N annonce N+1.
- Quand il reste moins de 10 pathologies « à écrire » dans le planning : prévenir Valentin (il propose ensuite les syndromes, etc.).
