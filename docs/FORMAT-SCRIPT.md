# Format des scripts — La Villa des Pathologies

Un script est un simple fichier texte (`.md`) dans le dossier `scripts/`. Le logiciel le lit et décide seul des décors, des déplacements, des émotions, des gestes, des plans caméra, des bruitages et de la musique.

## Squelette

```markdown
# La Villa des Pathologies — Épisode 2 : « Sous pression » (hypertension)

## Casting
- **Tensia** : la pression artérielle. Une diva rouge, toujours à cran.
- **Artie** : une artère. Il en a marre d'être serré.

## Teaser
- VOIX OFF : « Cette semaine dans la Villa des Pathologies… »
- TENSIA (confessionnal) : « Moi, je monte. Et je redescends quand je veux. »
- → GÉNÉRIQUE

## Scène 1 : l'arrivée
- VOIX OFF : « … »
- TENSIA (entrée stylée) : « Coucou les artères ! »
- Encadré à l'écran : TENSION = la force du sang sur la paroi des artères.
- Carton : « 10 ANS PLUS TARD… »
- À l'écran : la jauge de tension passe au rouge.

## Récap et appel à l'abonnement
- VOIX OFF : « À retenir : … »
- VOIX OFF : « Prochain épisode… Abonne-toi ! » (teaser : cholestérol)
```

## Continuité de la série

- **Personnages** : tout personnage créé est enregistré dans `villa/bible.json` (apparence, couleur, voix). S'il revient dans un autre épisode, sous son nom ou sous l'organe qu'il incarne (« le pancréas » → Pancho), le logiciel réutilise **exactement** le même. La liste : `node tools/bible.js`.
- **Décors** : la villa, le confessionnal, le sang et la cuisine sont générés de façon fixe ; ils sont identiques d'un épisode à l'autre.
- **Planning** : `villa/serie.json` et `villa/SAISON-1.md` (30 épisodes, chacun avec son teaser du lendemain).
- **Précédemment** : une section `## Précédemment dans la villa` en tête d'épisode crée un rappel nerveux avec le bandeau « PRÉCÉDEMMENT DANS LA VILLA… ».
- **Teaser du lendemain** : la dernière réplique « … Abonne-toi ! » (teaser : X) affiche « Demain dans la villa : X ». Sans teaser écrit, le logiciel prend l'épisode suivant du planning.
- **Sources** : section `## Sources` en fin de script (une ligne par source : `- Nom — titre : URL`). Elles s'affichent pendant le récap. Règles : `docs/SOURCES.md`.

## Règles obligatoires de chaque épisode (consignes de Valentin)

1. **La villa est le décor principal** : les personnages parlent dans la villa ou au confessionnal ; corps, cuisine, cabinet seulement en courts plans de coupe.
2. **Nouveaux personnages pour chaque nouvelle pathologie**, mêmes personnages (look et voix) quand un organe revient (bible).
3. **≈ 2 minutes** (1 min 45 à 2 min 25 au rendu final).
4. **Accroche + Question** dans le teaser, **générique** juste après, puis **« Précédemment »** (sauf épisode 1).
5. **Scène « le traitement » obligatoire** : en 2 à 4 répliques, le traitement principal ET pourquoi il marche, raconté avec les personnages
   (ex. ép. 1 : « Pancho est cramé, il ne fabrique plus assez d'Insuline → on injecte de l'insuline pour la remplacer »).
   Ordre habituel : hygiène de vie → médicament de 1re intention (nommé si la source le nomme) → traitement de recours ; pour une urgence : le 15, puis ce que fait l'hôpital.
6. **Sources officielles uniquement** (`docs/SOURCES.md`), y compris pour le traitement.
7. **« À retenir »** + **teaser du lendemain** = pathologie suivante du planning (`villa/serie.json`).

## Éléments reconnus

| Ligne | Effet |
|---|---|
| `# Titre — Épisode N : « Nom » (pathologie)` | Générique, badge « ÉP. N · PATHOLOGIE » |
| `## Casting` puis `- **Nom** : description` | Crée les personnages (voir plus bas) |
| `## Teaser…` | Montage nerveux : gros plans, coups de zoom, flashs |
| `## Scène N : titre` | Nouvelle scène ; le titre choisit l'humeur musicale (arrivée → détendu, clash → tendu, twist/verdict → dramatique, riposte → joyeux) |
| `## Récap…` | Plan d'ensemble joyeux, encadré « À RETENIR » si la réplique commence par « À retenir : » |
| `- NOM (didascalie) : « réplique »` | Le personnage parle (voix, synchro labiale, sous-titres colorés) |
| `- VOIX OFF : « texte »` | Narrateur ; la caméra montre les personnages cités |
| `- Encadré à l'écran : MOT = explication` | Carte explicative animée pendant la réplique suivante |
| `- Carton : « texte »` | Plein écran façon télé (ellipse temporelle : la porte se referme, les émotions repartent à zéro) |
| `- À l'écran : la jauge de X passe au rouge` | Jauge animée (vert → rouge) ; dans le sang, la foule de sucres apparaît |
| `- Accroche : texte court` | Texte choc des 2 premières secondes et de la miniature (40 caractères max.) |
| `- Question : …` | Question affichée à la fin pour faire réagir en commentaires |
| `[lieu : …]` dans un titre de scène | Force le décor (vaisseau, cabinet médical, cœur, cerveau…) |
| `- → GÉNÉRIQUE` | Générique animé « LA VILLA DES PATHOLOGIES » |
| `« Abonne-toi ! » (teaser : X)` | Bouton « ABONNE-TOI ! » + « Prochain épisode : X » |

## Didascalies et mots qui déclenchent le jeu d'acteur

| Didascalie / mots | Jeu |
|---|---|
| `(confessionnal)` | Plan face caméra dans le confessionnal (rideau rouge, cœur néon, bandeau REC) |
| `(épuisé)`, `(en sueur)`, « cramé », « à bout », « nuits blanches » | Fatigué, gouttes de sueur, épaules basses |
| `(entrée stylée)`, « Coucou » | Entrée en marchant depuis le bord du plateau, coucou de la main |
| `(à la porte de Cellia)`, « Toc toc » | Va jusqu'à la porte de la cellule et frappe |
| `(ouvre la porte avec sa clé)` | Plan serré sur la serrure : la clé entre, tourne (clic), la porte s'ouvre, puis la caméra recule |
| `(la clé ne tourne pas)` | Secoue la clé, colère, bruit de serrure, coup de zoom |
| `(bloquée dans le sang…)` | Décor : intérieur d'un vaisseau sanguin |
| « Entre », « viens, y a de la place » (dit par la cellule) | La porte s'ouvre, l'invité s'approche |
| VOIX OFF « le sucre entre » (porte ouverte) | Sucrette passe la porte et disparaît |
| « se prend pour qui », « redescendre », « sérieux » | Attitude « diva », mains sur les hanches, gros plan |
| « Attends… », « ?! », « red flag » | Choc, mains sur les joues, scratch de vinyle |
| « pas personnel », « plus envie de répondre » | Bras croisés, regard méfiant |
| « je souffle », « enfin » | Soulagement |
| Voix off « danger », « abîme », « pire », « silencieux » | Les candidats s'inquiètent, battements de cœur |
| Voix off citant Josh | Plan sur Josh dans sa cuisine |

Les autres personnages réagissent seuls à celui qui parle (inquiets face à la colère, méfiants face à une diva, contents face à la joie).

## Créer de nouveaux personnages

Les 5 personnages de l'épisode 1 ont un modèle dédié : **Sucrette, Cellia, Insuline, Pancho, Josh**. Pour tout autre nom, le logiciel fabrique le personnage à partir de sa **description dans le casting** :

- **Forme** selon les mots : cœur, artère / vaisseau, globule rouge, globule blanc, plaquette, virus, bactérie, cellule, rein, foie, poumon, cerveau, estomac, pancréas, os, sel / sodium, sucre / glucose, cholestérol / graisse, médicament / pilule / traitement, hormone / protéine / enzyme, pression / tension, humain / patient / médecin.
- **Couleur** : rouge, bleu, vert, jaune, orange, rose, violet, doré, blanc, noir, gris, marron, turquoise, beige.
- **Accessoires** : lunettes de soleil, lunettes, chignon, créoles, clé, couronne / reine, nœud, moustache, casquette, cravate, sueur, paillettes.
- **Voix et genre** devinés (« une diva », « la nouvelle candidate », « il », « le daron »…), chacun avec une voix différente.

Exemple : `- **Choco** : le cholestérol. Un gros dur jaune avec des lunettes de soleil.` donne un personnage jaune brillant, avec lunettes de soleil et voix masculine.

## Conseils pour TikTok

- Viser **environ 2 min** (1 min 45 à 2 min 15) : environ 14 caractères de texte par seconde de vidéo. Le logiciel affiche la durée estimée.
- Une réplique courte et percutante vaut mieux qu'une longue ; les répliques longues sont automatiquement découpées en plusieurs plans (réaction, gros plan…).
- Mettre l'encadré juste après la réplique qu'il explique.
