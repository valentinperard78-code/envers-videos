# 🌴 Villa Studio

Logiciel gratuit qui transforme un **script de « La Villa des Pathologies »** en **vidéo 3D verticale** (1080×1920, prête pour TikTok, Reels, Shorts) : personnages animés qui parlent, décors, caméra automatique, sous-titres mot par mot, encadrés, musique et bruitages.

Tout est généré par le code : aucun abonnement, aucun crédit, aucune image à télécharger. La musique et les bruitages sont synthétisés par le logiciel lui-même, donc sans droits d'auteur.

---

## Installation (une seule fois)

**Windows** : double-clique sur `INSTALLER-WINDOWS.bat`. Il installe Node.js, ffmpeg, Python et les voix. Si une commande est « introuvable » à la fin, redémarre le PC et relance-le une fois.

**Mac / Linux** : `./installer.sh`

Il faut aussi **Google Chrome** ou **Microsoft Edge** (déjà présent sur la plupart des PC).

## Utilisation

1. Double-clique sur `LANCER-STUDIO.bat` (Mac/Linux : `./lancer.sh`). Le logiciel s'ouvre dans ton navigateur.
2. Colle ou écris ton script à gauche (ou choisis-en un dans la liste).
3. **⚡ Aperçu 3D** : l'épisode joue en temps réel, sans attendre. **🎙 Aperçu avec voix** : pareil, avec les vraies voix.
4. **🎥 Générer la vidéo** : le MP4 arrive dans le dossier `sorties/`, avec une barre de progression.

### Qualités

| Qualité | Rendu | Pour qui |
|---|---|---|
| Brouillon | 540p agrandi, 24 i/s | vérifier vite la mise en scène |
| Standard | 720p agrandi à 1080p, 30 i/s | publication, sur n'importe quel PC |
| Haute | comme Standard + transparences et irisations (≈ 2× plus lent, différence très faible à l'œil) | si tu as du temps |
| Max | 1080p natif, transparences physiques, irisations, occlusion ambiante, ombres douces | PC avec carte graphique |

Sur un PC avec carte graphique, le rendu est très rapide. Sans carte graphique, il tourne quand même, mais plus lentement.

## Publication TikTok automatique (Villa Publisher)

Calendrier de publication, envoi automatique des épisodes vers TikTok et notification sur le téléphone, gratuitement et sans crédits : voir **[docs/PUBLICATION-TIKTOK.md](docs/PUBLICATION-TIKTOK.md)** et l'onglet **📅 Publication TikTok** du studio.

## Rendu automatique gratuit sur GitHub (sans allumer ton PC)

Le dépôt contient `.github/workflows/rendu.yml`. Dès qu'un script est ajouté ou modifié dans `scripts/`, GitHub calcule la vidéo sur ses serveurs, puis la publie :
- en pièce jointe de l'exécution (onglet **Actions**) ;
- sur la branche **`villa-videos`** du dépôt.

Le calcul est réparti sur **20 machines** en parallèle (~20-25 min pour 3 min de vidéo). En plus du MP4, chaque rendu fournit :
- `*.couverture.jpg` : la miniature TikTok (titre + accroche) ;
- `*.publication.txt` : titre, description, « à retenir », sources, avertissement, hashtags — prêt à copier-coller ;
- `*.controle.json` : contrôle qualité automatique des cadrages ;
- `planche.jpg` : 16 images réparties sur la vidéo pour tout vérifier d'un coup d'œil ;
- `rendu.log` : le journal.

Si la vidéo dépasse 95 Mo, elle est découpée en `*.mp4.part00`, `part01`… (limite GitHub) : recoller avec `cat fichier.mp4.part* > fichier.mp4` (Windows : `copy /b fichier.mp4.part00+fichier.mp4.part01 fichier.mp4`).

Le bouton manuel (onglet **Actions** → **Rendu vidéo** → **Run workflow**) n'apparaît que si le logiciel est sur la branche principale du dépôt. Sinon, il suffit d'ajouter ou modifier un script dans `scripts/`.

C'est ce mode que Claude utilise pour fabriquer les vidéos tout seul : il écrit le script, le dépose dans `scripts/`, et récupère le MP4.

## Ligne de commande

```bash
node tools/render.js scripts/ep01-diabete-type-2.md --qualite standard
#   --sortie sorties/x.mp4   --fps 30   --workers 2   --de 10 --a 40 (extrait)   --sans-voix
#   --partie 1/2  (coupe un épisode trop long en parties, avec carton « À SUIVRE… »)
```

Un rendu interrompu reprend là où il s'était arrêté : il suffit de relancer la même commande.

## Écrire un épisode

Voir **[docs/FORMAT-SCRIPT.md](docs/FORMAT-SCRIPT.md)** : format, didascalies reconnues, création automatique de nouveaux personnages (cœur, virus, globule, artère, rein, médicament…).

## Organisation du code

```
engine/
  core/        rendu 3D (three.js), matériaux PBR, textures procédurales, géométrie
  characters/  visage animé (yeux, paupières, sourcils, bouche), bras/jambes souples, préréglages
  sets/        décors : villa de nuit, confessionnal, circulation sanguine, cuisine, plateau
  animation/   caméra automatique, synchro labiale, évaluation de la timeline
  overlay/     habillage télé-réalité (sous-titres, encadrés, cartons, générique, jauge, CTA)
  script/      lecture du script, distribution, « réalisateur » automatique
tools/         serveur du logiciel, rendu MP4, voix (edge-tts), musique et bruitages synthétisés
app/           interface du logiciel, page de rendu
vendor/three/  moteur 3D three.js (licence MIT) inclus pour fonctionner hors ligne
assets/fonts/  polices Anton, Montserrat, Baloo 2 (licence OFL)
```
