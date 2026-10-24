# Omni-Texte — traitement de texte

Omni-Texte est une application de traitement de texte qui s'installe sur un
ordinateur ou un téléphone Android, comme une application classique.

- Aucun compte, aucun serveur : les documents restent sur l'appareil.
- Fonctionne sans connexion internet, après la première visite.
- Ordinateur (Chrome, Edge, Firefox) et Android (Chrome, Brave), à la souris, au clavier et au doigt.
- Première application de la « Suite Bureautique » de l'Omni-système.

Adresse : `https://ferrusdantioch.github.io/omni-texte/` (dépôt GitHub `FerrusDantioch/omni-texte`).

---

## 1. Ce que l'application sait faire

- Gras, italique, souligné, barré.
- Taille du texte (de 8 à 72 points), boutons « A− » et « A+ ».
- Police : Literata (par défaut), Sans-serif, Machine à écrire.
- Couleur du texte et surlignage (palettes de pastilles).
- Styles de paragraphe : Texte normal, Titre 1, Titre 2, Titre 3.
- Alignement : gauche, centré, droite, justifié. Listes à puces et numérotées.
- Interligne : simple, 1,5 (par défaut) ou double.
- Effacer la mise en forme de la sélection.
- Annuler / Rétablir (boutons, Ctrl+Z, Ctrl+Y, Ctrl+Maj+Z).
- Rechercher et remplacer (loupe de la barre d'outils, ou Ctrl+F) : une fois ou partout.
- Typographie française automatique (réglable dans le menu) : espaces insécables
  avant : ; ! ? et dans les guillemets « », apostrophe ’.
- Correcteur d'orthographe français intégré, qui fonctionne hors ligne (réglable
  dans le menu, activé par défaut) : les mots inconnus sont soulignés d'une vague
  rouge adoucie ; toucher (ou cliquer) un mot souligné propose jusqu'à 5
  corrections, « Ajouter au dictionnaire » et « Ignorer ». Menu → « Dictionnaire
  personnel » : voir, ajouter et retirer ses propres mots.
- Collage toujours en texte brut (chaque ligne devient un paragraphe).
- Enregistrement automatique, plusieurs documents, compteur de mots et de caractères.
- Ouvrir un fichier Word (.docx) ou texte (.txt) : il devient un nouveau document.
- Corbeille : un document supprimé reste récupérable pendant 30 jours.
- Sauvegarde de tous les documents dans un fichier, et restauration.
- Bouton « Exporter » : trois formats, le fichier porte le titre du document.
  - PDF : pour imprimer ou envoyer un document figé (feuille blanche, texte noir, couleurs conservées).
  - Word (.docx) : pour continuer le texte dans Word, Google Docs ou LibreOffice.
  - Texte brut (.txt) : le texte seul, sans mise en forme.
- Trois thèmes : Omni-système (par défaut), Sombre, Clair.

Raccourcis clavier : Ctrl+B (gras), Ctrl+I (italique), Ctrl+U (souligné),
Ctrl+S (enregistrer), Ctrl+P (exporter directement en PDF), Ctrl+Z (annuler),
Ctrl+Y (rétablir), Ctrl+F ou Ctrl+H (rechercher et remplacer ; Entrée : résultat
suivant ; Maj+Entrée : précédent ; Échap : fermer), Maj+Entrée (aller à la ligne
sans changer de paragraphe).

---

## 2. Essayer l'application sur ton ordinateur

Ouvrir `index.html` par un double-clic ne marche pas : le navigateur bloque
les modules JavaScript ouverts depuis un fichier. Il faut un petit serveur
web local. Il est fourni (`outils/serveur.mjs`) et n'a besoin que de Node.js.

**Une seule fois : installer Node.js**

1. Va sur <https://nodejs.org>.
2. Clique sur le bouton de téléchargement marqué « LTS ».
3. Ouvre le fichier téléchargé et clique sur « Suivant » jusqu'à la fin, sans rien changer.

**À chaque essai (Windows)**

1. Ouvre l'Explorateur de fichiers et va dans le dossier `omni-texte`.
2. Clique dans la barre d'adresse en haut de la fenêtre (là où le chemin du dossier est écrit).
3. Efface ce qui est écrit, tape `cmd`, puis appuie sur Entrée. Une fenêtre noire s'ouvre.
4. Dans cette fenêtre, tape : `node outils/serveur.mjs` puis appuie sur Entrée.
5. Le message « Application disponible sur http://localhost:8000/omni-texte/ » s'affiche.
6. Ouvre Chrome et va à l'adresse `http://localhost:8000/omni-texte/`.
7. Pour arrêter : clique dans la fenêtre noire et appuie sur Ctrl+C, puis ferme-la.

**Sur Mac** : ouvre l'application « Terminal », tape `cd ` (avec un espace),
glisse le dossier `omni-texte` dans la fenêtre, appuie sur Entrée,
puis suis les étapes 4 à 7 ci-dessus.

---

## 3. Publier l'application sur GitHub Pages

Le nom du dépôt donne l'adresse : le dépôt `omni-texte` sera publié à
`https://ferrusdantioch.github.io/omni-texte/`. Tous les chemins de l'application
sont relatifs : elle fonctionne dans ce sous-dossier.

**Méthode simple, par le site de GitHub (sans rien installer)**

1. Connecte-toi sur <https://github.com> avec le compte `FerrusDantioch`.
2. Clique sur le bouton « + » en haut à droite, puis sur « New repository ».
3. Dans « Repository name », tape `omni-texte`.
4. Choisis « Public ». Ne coche aucune autre case. Clique sur « Create repository ».
5. Sur la page qui s'affiche, clique sur le lien « uploading an existing file ».
6. Ouvre le dossier `omni-texte` sur ton ordinateur et sélectionne tout son
   contenu, **sauf le dossier `tests`** (il ne sert qu'aux vérifications).
   Glisse cette sélection dans la page de GitHub.
7. Attends la fin du chargement, puis clique sur le bouton vert « Commit changes ».
8. Clique sur l'onglet « Settings » du dépôt, puis sur « Pages » dans la colonne de gauche.
9. Sous « Branch », choisis `main`, puis `/ (root)`, puis clique sur « Save ».
10. Attends une à deux minutes, puis ouvre `https://ferrusdantioch.github.io/omni-texte/`.

**Autre méthode, avec l'application GitHub Desktop** : elle garde l'historique
des modifications (le dossier contient déjà un dépôt git local).

1. Installe GitHub Desktop depuis <https://desktop.github.com> et connecte-toi.
2. Menu « File », puis « Add local repository… », puis choisis le dossier `omni-texte`.
3. Clique sur « Publish repository ». Nom : `omni-texte`. Décoche « Keep this code private ». Clique sur « Publish repository ».
4. Fais ensuite les étapes 8 à 10 de la méthode simple.

**Publier une mise à jour**

1. Augmente le numéro de version dans `js/config.js` (par exemple `1.0.0` devient `1.0.1`).
2. Envoie les fichiers modifiés sur GitHub (étapes 5 à 7 de la méthode simple, sur la page du dépôt :
   bouton « Add file », puis « Upload files »).
3. Les personnes qui utilisent l'application verront : « Une nouvelle version est disponible. Recharger ».

Sans changement de version, les utilisateurs gardent l'ancienne version
(l'application est conservée sur leur appareil pour marcher hors ligne).

---

## 4. Changer le nom ou la version

- **Nom** : dans `js/config.js`, modifie la ligne `nom: 'Omni-Texte',`. Puis, dans
  `manifest.webmanifest`, modifie les lignes `"name"` et `"short_name"`.
  Le manifeste est un fichier de données (JSON) : il ne peut pas lire `config.js`,
  c'est pourquoi le nom y est recopié. Un test automatique vérifie que les deux
  correspondent. Le titre de la page et la fenêtre « À propos » suivent `config.js`.
- **Version** : dans `js/config.js`, ligne `version: '1.1.5',` (version actuelle).
- **Ne change jamais** `idStockage: 'plume'` : c'est le nom de la base de données ;
  le changer rendrait les documents existants invisibles.
- **Icônes** : elles sont créées par `outils/creer-icones.py` (Python et la
  bibliothèque Pillow). Le logo de la fenêtre « À propos » est `assets/logo-omni-systeme.webp` :
  pour le remplacer, garde le même nom de fichier.

---

## 5. Les documents et leur sécurité

- Les documents sont enregistrés dans le navigateur de l'appareil (IndexedDB),
  environ une seconde après la dernière frappe, et aussitôt quand la page est fermée.
- Ils ne quittent jamais l'appareil. Si tu effaces les données du site dans le
  navigateur, ils disparaissent : fais régulièrement « Menu → Sauvegarder tous mes
  documents ». Le fichier `plume-sauvegarde-AAAA-MM-JJ.json` se restaure avec
  « Menu → Restaurer une sauvegarde ».
- Un document supprimé va dans la corbeille (« Documents », puis « Corbeille » en
  bas du panneau). Il peut y être remis pendant 30 jours ; ensuite, il est
  effacé pour de bon au lancement suivant de l'application.
- Sur Firefox, au premier enregistrement, une question peut apparaître
  (« stocker des données de façon persistante ») : réponds « Autoriser ». Cela
  protège les documents contre un effacement automatique quand le disque est plein.

---

## 5 bis. Échanger des documents avec Word ou Google Docs

### Ouvrir dans Word ou Google Docs un document d'Omni-Texte

**Sur Android**

1. Dans Omni-Texte, touche « Exporter », puis « Word (.docx) ».
2. Ouvre l'application « Fichiers » (ou « Mes fichiers »), puis le dossier « Téléchargements ».
3. Touche le fichier. Choisis « Docs » (Google Docs) ou « Word ».

**Sur ordinateur**

- Word ou LibreOffice : double-clique sur le fichier dans le dossier « Téléchargements ».
- Google Docs : ouvre <https://drive.google.com>, clique sur « Nouveau », puis
  « Importer un fichier », choisis le fichier ; ensuite, clique dessus avec le
  bouton droit, puis « Ouvrir avec » et « Google Docs ».

### Ouvrir dans Omni-Texte un document de Word ou de Google Docs

1. Si le document est dans Google Docs : ouvre-le, puis menu « Fichier »,
   « Télécharger », « Microsoft Word (.docx) ». Le fichier arrive dans « Téléchargements ».
2. Dans Omni-Texte, touche « Documents », puis « Ouvrir un fichier ».
3. Choisis le fichier (.docx ou .txt). Il devient un nouveau document d'Omni-Texte ;
   le fichier d'origine n'est pas modifié.
4. Si quelque chose n'a pas pu être repris (images, tableaux), un message le dit.

---

## 6. Décisions prises pendant la réalisation

1. **Logo** : aucun dossier `assets/` n'était fourni. Le logo du d20 a été repris
   du portfolio public de l'Omni-système (`assets/logo-omni-systeme.webp`).
   Il ne sert que dans « À propos ». Les icônes de l'application sont une création originale.
2. **Police** : comme la taille, elle s'applique au texte sélectionné (ou au texte
   tapé ensuite). Pour changer tout le document : Ctrl+A, puis choisir la police.
3. **Titre vide** : un nouveau document a un titre vide qui s'affiche « Sans titre »
   (en gris) ; on peut taper le titre directement, sans effacer.
4. **Restauration** : une confirmation est demandée avant d'ajouter. Un document
   strictement identique à un document existant n'est pas ajouté en double ; un
   document avec le même identifiant mais un contenu différent est ajouté comme
   copie (« (restauré) »). Rien n'est jamais remplacé.
5. **Mise en forme** : toute la mise en forme (gras, italique, souligné, barré,
   taille, police, couleurs, alignement, interligne, listes, styles de paragraphe)
   est faite par le code de l'application, pour un résultat identique dans tous
   les navigateurs. Depuis la version 1.1.0, cela vaut aussi pour gras, italique et
   souligné : la commande du navigateur (`execCommand`) mettait plusieurs minutes à
   mettre en gras un document de 300 pages ; c'est maintenant moins d'une seconde.
6. **Retour arrière au début d'un paragraphe** : le texte rejoint le paragraphe
   du dessus et en prend le style (comme dans Word). Chrome ajoutait sinon des
   styles parasites.
7. **Glisser-déposer** : on ne peut pas faire glisser du texte à l'intérieur de la
   page (évite les déplacements accidentels). Un texte déposé depuis une autre
   application est inséré en texte brut.
8. **Applications voisines** : toutes les applications de `ferrusdantioch.github.io`
   partagent le même espace de stockage. Toutes les clés d'Omni-Texte commencent donc
   par `plume.` (son ancien nom, gardé exprès pour ne rien perdre), et son
   service worker ne supprime que les caches commençant par `plume-`.
   Conseil pour les prochaines applications : suivre la même règle.
9. **Sécurité** : une politique de sécurité (`Content-Security-Policy`) interdit
   tout code extérieur. Le petit script du thème, dans `index.html`, est autorisé
   par son empreinte ; un test signale si elle n'est plus à jour.
10. **Installation** : le bandeau d'installation automatique du navigateur est masqué ;
    l'installation se fait depuis « Menu → Installer l'application ».
11. **Contrastes** : toutes les valeurs de couleurs fournies respectent déjà le
    niveau AA ; aucune n'a été modifiée. Des variables complémentaires ont été
    ajoutées dans `css/themes.css` (fond d'un bouton activé, survol, voile, rouge
    de suppression, texte sur surlignage).
12. **Polices** : téléchargées depuis Fontsource (version 5.3.0, licence SIL OFL,
    fichiers `fonts/LICENCE-*.txt`). Literata « 600 italique » a été ajoutée pour un
    gras-italique net.

13. **Export Word (.docx)** : le fichier est fabriqué sur l'appareil, sans aucun
    service extérieur. Polices : Literata reste Literata (Google Docs la propose ;
    Word la remplace par une police à empattements si elle n'est pas installée),
    « Sans-serif » devient Arial, « Machine à écrire » reste JetBrains Mono (Word la
    remplace par Courier New si elle manque). Le surlignage garde sa couleur exacte
    (dans Word, il apparaît comme une « trame de fond »).
14. **Export texte brut (.txt)** : encodage UTF-8 avec marque d'encodage et fins
    de ligne Windows, pour que les accents s'affichent partout.
15. **Pas d'export Markdown** pour l'instant : ce format pourrait induire certains
    utilisateurs en erreur.
16. **Corbeille** : mettre un document à la corbeille ne demande pas de confirmation
    (il reste récupérable), mais le panneau affiche alors « … est dans la
    corbeille. » avec un bouton « Annuler ». Ce message est dans le panneau
    lui-même (un message en bas de l'écran serait inaccessible tant que le
    panneau est ouvert). La
    suppression définitive et « Vider la corbeille » demandent toujours une
    confirmation. La sauvegarde dans un fichier ne contient pas la corbeille.
17. **Recherche** : les majuscules ne comptent pas (« texte » trouve « Texte »),
    les accents comptent (« a » ne trouve pas « à »). L'apostrophe droite trouve
    aussi l'apostrophe typographique, et une espace trouve aussi les espaces
    insécables. Ctrl+F ouvre la recherche d'Omni-Texte à la place de celle du navigateur.
    Les résultats sont surlignés sans modifier le document. « Tout remplacer »
    s'annule en une seule fois avec « Annuler ».
18. **Ouvrir un fichier** : sont repris le texte, les titres, les listes,
    l'alignement, l'interligne, le gras, l'italique, le souligné, le barré, les
    tailles, les couleurs, le surlignage et la police (rangée parmi les trois
    polices d'Omni-Texte). Ne sont pas repris : les images, les tableaux (leur texte
    devient de simples paragraphes), les notes de bas de page, les en-têtes et
    pieds de page. La police et la taille par défaut du fichier ne sont pas
    reprises : le texte prend celles d'Omni-Texte, sauf là où elles avaient été
    choisies à la main. Les anciens formats (.doc, .odt, .rtf) sont refusés avec
    une explication. Le titre du nouveau document est le nom du fichier.
19. **Typographie française** : appliquée seulement pendant la frappe (un texte
    collé reste tel quel). Espace fine insécable avant ; ! ? et espace insécable
    avant : et dans « ». Pas d'espace dans « 14:30 », dans « https:// », ni entre
    « ?! ». Désactivable dans le menu (« Écriture »).
20. **Interligne** : « Simple » correspond à 1,15 (comme l'interligne simple de
    Word et Google Docs), « 1,5 » est la valeur par défaut, « Double » vaut 2. Les
    titres gardent leur propre interligne, plus serré, tant qu'aucun n'est choisi.
21. **Barre d'outils** : avec la loupe et l'interligne, elle tient sur une ligne à
    partir d'environ 1 360 pixels de large ; en dessous, elle passe sur deux lignes.
22. **Correcteur d'orthographe** (version 1.2.0) : commun avec Omni-Romancier
    (dossier `correcteur/`, voir `correcteur/LISEZ-MOI.md`). Le dictionnaire
    français de Grammalecte a été « déplié » une fois pour toutes en une liste
    de 450 000 mots (1,9 Mo, environ 330 Ko une fois compressé) : les bibliothèques
    Hunspell pour navigateur (nspell, Typo.js) mettaient 6 à 7 secondes et 300 à
    750 Mo de mémoire à se charger sur un ordinateur, beaucoup trop pour un
    téléphone. La vérification tourne en arrière-plan (Web Worker) ; les mots
    sont soulignés sans modifier le document (surlignage CSS), donc
    l'annulation, l'enregistrement et les exports ne sont pas touchés. Le
    correcteur du navigateur est éteint sur la feuille pour éviter un double
    soulignement (il revient si l'on désactive le correcteur de l'application).
    « Ignorer » vaut jusqu'à la fermeture de l'application. Le dictionnaire
    personnel est gardé dans le navigateur, séparé de celui d'Omni-Romancier.

---

## 7. Limites connues

- Firefox n'a pas pu être testé automatiquement (seul Chromium était disponible) :
  voir la liste de contrôle manuelle ci-dessous.
- Le téléphone a été testé en émulation (écran 390 × 844, tactile), pas sur un vrai appareil.
- Si le même document est ouvert dans deux onglets, le dernier enregistrement l'emporte.
- L'historique « Annuler » est vidé quand on change de document ou qu'on ferme la page.
- Dans la fenêtre d'impression, le navigateur peut ajouter la date et l'adresse de
  la page : décocher « En-têtes et pieds de page ».
- Le surlignage des résultats de recherche demande un navigateur récent (Chrome 105,
  Firefox 140 ou plus). Sur un Firefox plus ancien, la recherche fonctionne
  (compteur, défilement, remplacement) mais les résultats ne sont pas colorés.
- Sur un très long document (350 pages), chaque frappe prend environ 20 ms et
  « tout en gras » environ une seconde, sur un ordinateur récent.
- Le correcteur d'orthographe demande lui aussi un navigateur récent (Chrome 105,
  Firefox 140 ou plus) ; sinon, c'est le correcteur du navigateur qui reste utilisé.
  Il ne vérifie que l'orthographe des mots, pas la grammaire ni les accords
  (« les maison » n'est pas signalé). Ses suggestions ne connaissent pas la
  fréquence des mots : la bonne correction n'est pas toujours la première.
- Le dictionnaire personnel n'est pas inclus dans « Sauvegarder tous mes documents ».

---

## 8. Organisation des fichiers

```
index.html             la page (structure de l'interface, icônes)
manifest.webmanifest   carte d'identité de l'application installable
sw.js                  service worker : copie locale pour le mode hors ligne
css/polices.css        déclaration des polices
css/themes.css         les trois thèmes (seul fichier contenant des couleurs)
css/base.css           mise en page et composants communs à la suite
css/redaction.css      barre d'outils, palettes, feuille, compteur
css/print.css          impression et PDF
correcteur/            correcteur d'orthographe, commun avec Omni-Romancier (voir son LISEZ-MOI.md)
js/config.js           nom, version, contact (à modifier ici)
js/app.js              assemblage de l'application
js/theme.js            thèmes                                  (commun à la suite)
js/storage.js          stockage, sauvegarde, restauration      (commun à la suite)
js/ui.js               fenêtres, messages, « À propos »        (commun à la suite)
js/pwa.js              installation et mises à jour            (commun à la suite)
js/editor.js           l'éditeur : commandes, collage, compteur
js/selection.js        outils de sélection
js/mise-en-forme.js    taille, police, couleurs, barré, effacement
js/paragraphes.js      titres, listes, alignement, structure
js/historique.js       Annuler / Rétablir
js/recherche.js        rechercher et remplacer
js/typographie.js      typographie française automatique
js/orthographe.js      correcteur d'orthographe : soulignement dans la feuille
js/sanitize.js         nettoyage par liste blanche
js/palettes.js         tailles, polices et couleurs proposées
js/barre-outils.js     barre d'outils
js/documents.js        documents et enregistrement automatique
js/tiroir-documents.js panneaux « Mes documents » et « Corbeille »
js/importer.js         « Ouvrir un fichier » (Word ou texte)
js/import-docx.js      lecture d'un fichier Word (.docx)
js/impression.js       export PDF
js/exporter.js         fenêtre « Exporter » (choix du format)
js/export-docx.js      export Word (.docx)
js/export-texte.js     export texte brut (.txt)
js/zip.js              fabrication et lecture d'archives ZIP (commun à la suite)
fonts/                 polices (.woff2) et leurs licences
icons/                 icônes de l'application
assets/                logo de l'Omni-système
outils/                serveur local, création des icônes, copie du correcteur
                       vers Omni-Romancier, fabrication du dictionnaire (outils/dictionnaire/)
tests/                 tests automatiques
```

---

## 9. Tests automatiques (pour un développeur)

Les tests ouvrent l'application dans un vrai navigateur (Chromium, avec Playwright)
et vérifient chaque fonction : mise en forme, annulation, collage, enregistrement,
documents, sauvegarde, thèmes et contrastes, PDF, hors ligne, mise à jour,
téléphone, clavier et accessibilité, absence d'erreur dans la console.

```
cd tests
npm install
npx playwright install chromium
npm test
```

L'analyse du PDF demande aussi Python 3 avec `pdfplumber` et `pypdfium2`
(sinon ce test est ignoré). Les fichiers Word d'essai sont dans `tests/fichiers` ;
`tests/fichiers/creer-fichiers.py` les refabrique (python-docx et LibreOffice).

---

## 10. Liste de contrôle manuelle (Firefox et vrai téléphone Android)

À faire une fois sur Firefox (ordinateur), puis sur Chrome Android :

1. Ouvrir l'application. Le thème Omni-système (violet sombre) s'affiche sans flash blanc.
2. Taper « Bonjour le monde ». Le compteur indique « 3 mots · 16 caractères ».
3. Sélectionner « Bonjour », toucher Gras : le mot passe en gras ; toucher à nouveau : il redevient normal.
4. Sélectionner « monde », choisir 24 dans la taille, puis la couleur « Rouge », puis le surlignage « Jaune ».
5. Sélectionner seulement « on » dans « monde », choisir « Automatique » puis « Aucun » : seules ces deux lettres changent.
6. Barrer un mot, recharger la page, sélectionner le mot et retirer le barré.
7. Toucher Annuler plusieurs fois, puis Rétablir : les étapes reviennent dans l'ordre.
8. Copier un texte en couleur depuis une page web et le coller : il arrive sans couleur ni police étrangère.
9. Taper un texte puis fermer l'onglet aussitôt ; rouvrir : le texte est là.
10. Menu → thème Clair, recharger : le thème Clair reste, sans flash.
11. Exporter → PDF : le fichier proposé porte le titre du document ; le PDF est blanc, texte noir, couleurs conservées.
12. Exporter → Word (.docx), puis ouvrir le fichier dans Word ou Google Docs : titres, gras, couleurs, surlignage et listes sont conservés.
13. Exporter → Texte brut (.txt), puis ouvrir le fichier : les accents s'affichent correctement.
14. Couper le réseau (mode avion), recharger : l'application s'ouvre et enregistre.
15. Taper « Bonjour! Il a dit "oui" et l'a fait ». Le texte devient « Bonjour ! Il a dit « oui » et l’a fait » (petites espaces avant ! et dans les guillemets).
16. Ctrl+F (ou la loupe), taper « oui » : le compteur indique « 1 sur 1 » et le mot est coloré. Taper « non » dans « Remplacer par… », cliquer « Tout remplacer », puis « Annuler » : « oui » revient.
17. Sélectionner un paragraphe, bouton Interligne (à droite des alignements), « Double » : les lignes s'écartent.
18. Documents → mettre un document à la corbeille ; « Corbeille » en bas du panneau → « Remettre » : il revient.
19. Documents → « Ouvrir un fichier » → choisir le fichier Word exporté au point 12 : il s'ouvre avec ses titres, couleurs et listes.
20. Ouvrir un fichier Word venant de Google Docs (Fichier → Télécharger → Microsoft Word) : le texte et sa mise en forme apparaissent.
21. Android : pendant la frappe, le clavier ouvert, la barre d'outils reste visible et défile au doigt.
22. Android : Menu → Installer l'application ; l'icône violette apparaît sur l'écran d'accueil.
23. Taper « Les maizons sont bele. » : après une demi-seconde, « maizons » et « bele » sont soulignés d'une vague rouge.
24. Toucher « maizons » : une bulle propose « maisons » ; la toucher remplace le mot, le clavier reste ouvert.
25. Taper « Kaelith », le toucher, « Ajouter au dictionnaire » : il n'est plus souligné. Fermer l'application, la rouvrir : il ne l'est toujours pas. Menu → Dictionnaire personnel : il y figure, « Retirer » le fait de nouveau souligner.
26. Mode avion, recharger, taper « une biblioteque » : le mot est souligné et la bulle propose « bibliothèque ».

---

## 11. Idées pour plus tard

- Correcteur : inclure le dictionnaire personnel dans « Sauvegarder tous mes
  documents », et tenir compte de la fréquence des mots dans les suggestions.

---

## 12. Licence

**© 2026 Ferrus Dantioch — Creative Commons BY-NC-ND 4.0**
([résumé de la licence en français](https://creativecommons.org/licenses/by-nc-nd/4.0/deed.fr))

En clair : le partage est autorisé, à l'identique et en citant l'auteur ;
l'usage commercial est interdit ; la modification et les œuvres dérivées
sont interdites. Le logiciel est fourni « en l'état », sans aucune garantie.

Texte complet dans le fichier [LICENSE](LICENSE) : le texte officiel en
anglais, suivi de la traduction française officielle publiée par Creative
Commons.

Les polices (dossier `fonts/`) gardent leur propre licence : voir les fichiers
`fonts/LICENCE-*.txt`.

Le dictionnaire du correcteur (`correcteur/mots-fr-7.5.txt`) est tiré des
« Dictionnaires orthographiques français » 7.5 (variante « Classique ») d'Olivier R.
et des contributeurs de [Grammalecte](https://grammalecte.net/) (Dicollecte). Il
reste sous sa propre licence, la **Mozilla Public License 2.0** : texte complet et
provenance dans `correcteur/LICENCE-dictionnaire.txt`. Les fichiers d'origine sont
dans `outils/dictionnaire/source/`.

---

Application réalisée par Ferrus Dantioch, avec l'aide de Claude (Anthropic).
Contact : omni-systeme.choking513@passmail.net
