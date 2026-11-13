# Omni-Texte — notes pour Claude

Traitement de texte hors ligne, en **HTML/CSS/JS pur, sans compilation** :
les fichiers du dépôt sont publiés tels quels. Notes relevées dans le code le
13 novembre 2026. [CONSTATÉ, sauf mention contraire]

## Réglages : un seul fichier, `js/config.js`

Nom, version, auteur, contact et lien vers l'Omni-système se changent **là et
nulle part ailleurs**. Ce fichier est lu à la fois par la page (`index.html`)
et par le service worker (`sw.js`, via `importScripts`), qui en tire le nom de
son cache.

- **`idStockage: 'plume'` ne doit jamais changer** (ancien nom de
  l'application). Il préfixe la base IndexedDB, les clés du localStorage
  (`plume.theme`…), les caches (`plume-1.3.1`) et le format des fichiers de
  sauvegarde (`plume-sauvegarde`). Le changer rendrait invisibles les
  documents déjà enregistrés et refuserait les anciennes sauvegardes.
- Le nom figure aussi dans `manifest.webmanifest` : à changer aux deux
  endroits (voir le README, « Changer le nom »).

## ⚠️ Avant de publier : augmenter la version

Après toute modification d'un fichier de l'application, augmenter `version`
dans `js/config.js` (ex. `1.3.1` → `1.3.2`). Sans ce changement, le nom du
cache ne change pas, le navigateur ne retélécharge rien et **les personnes
gardent l'ancienne version**. Le README cite aussi la version actuelle : le
mettre à jour en même temps (aujourd'hui il annonce 1.3.0, en retard).

## Service worker (`sw.js`)

- **Tout nouveau fichier doit être ajouté à la liste `FICHIERS`**, sinon il
  manque hors ligne. Le test `tests/hors-ligne.spec.js` vérifie que la liste
  est complète.
- Le dictionnaire du correcteur (`correcteur/mots-fr-7.5.txt`, ~1,9 Mo) est
  dans `DURABLES` : à une mise à jour, il est repris de l'ancien cache au lieu
  d'être retéléchargé. Son nom contient sa version : un nouveau dictionnaire
  = un nouveau nom de fichier (à changer aussi dans `correcteur/correcteur.js`
  et dans `FICHIERS`).
- La mise à jour attend un appui sur « Recharger » (message `activer`, puis
  `skipWaiting`). Elle est recherchée chaque fois que l'application revient
  au premier plan.

## ⚠️ CSP et script du `<head>`

`index.html` contient une CSP (règle qui interdit de contacter d'autres
sites). Le petit script en tête de page (thème appliqué avant l'affichage) y
est autorisé **par son empreinte** (`'sha256-…'`). Toute retouche de ce
script, même d'un espace, demande de recalculer cette empreinte, sinon le
navigateur le bloque. Le test `tests/hors-ligne.spec.js` signale une
empreinte périmée.

## Couleurs et thèmes

`css/themes.css` est le **seul** fichier qui contient des couleurs (thèmes
`omni`, `sombre`, `clair`). Ailleurs, utiliser ses variables. Les contrastes
sont vérifiés par `tests/themes.spec.js` (le commentaire de `themes.css` cite
à tort un fichier `contraste.spec.js` qui n'existe pas).

## Code partagé avec Omni-Romancier

Les dossiers `correcteur/` et `commun/` sont **identiques** dans omni-texte et
omni-romancier. On les modifie seulement ici, puis `outils/copier-commun.mjs`
les recopie dans le dépôt omni-romancier, placé à côté.

**Ne jamais lancer ce script (sauf avec `--verifier`, qui ne modifie rien)
sans l'accord explicite de Ferrus** : il modifie une autre application, et
omni-romancier n'a pas encore été lu. [DÉCIDÉ]

## Dictionnaire du correcteur

`correcteur/mots-fr-7.5.txt` est fabriqué par `outils/dictionnaire/`
(`npm run construire`, outil `nspell`) à partir des fichiers source
Dicollecte rangés dans `outils/dictionnaire/source/`. Licence MPL 2.0 : voir
`correcteur/LICENCE-dictionnaire.txt`, citée dans l'« À propos ».

## Publication et tests

- GitHub Pages, branche `main`, racine (fichier `.nojekyll` présent) :
  **tout le contenu du dépôt est en ligne**, y compris `tests/`, `outils/` et
  ce fichier. Le README dit d'envoyer tout « sauf `tests` », mais `tests/`
  est bien dans le dépôt.
- Tests Playwright dans `tests/` (`cd tests && npm install && npm test`) :
  hors ligne, thèmes et contrastes, téléphone, clavier, export PDF et Word…

---

## Règles communes à l'écosystème

> Section ajoutée le 13 novembre 2026 à partir du socle commun des PWA de
> Ferrus. Elle est **adaptée à ce dépôt** : les règles du socle qui ne
> concernent que d'autres applications ont été retirées. Si une règle
> ci-dessous semble contredire les notes propres à ce dépôt (plus haut),
> ne tranche pas : signale-le à Ferrus et attends sa décision.
>
> Version de référence : dépôt privé `omni-socle`, fichier `SOCLE.md`. Toute
> modification d'une règle commune se fait d'abord là-bas, puis est recopiée
> ici.

*Chaque règle porte une étiquette :*

* [DÉCIDÉ] : choix confirmé par Ferrus. À respecter sans discuter.
* [CONSTATÉ] : relevé dans le code des dépôts omni-texte, Refuge, omni-budget et omni-grimoire (novembre 2026). Les autres dépôts n'ont pas été lus.
* [RECOMMANDÉ] : proposition non validée. À proposer, jamais à appliquer d'office.

### 1. Qui, pourquoi, comment travailler

* Ferrus veut comprendre ce qui se passe : explique en français simple, signale chaque terme technique, ne délègue pas dans le dos. [DÉCIDÉ]
* Sois clair, direct, sans édulcorant. Dis ce qui est fragile ou incohérent. [DÉCIDÉ]
* Les outils servent à aider les autres, en priorité les personnes autistes et les personnes en situation de handicap. Refuge et Cap sont des assistances pour personnes autistes ; Soutien-IMC est une fiche de contact très lisible, conçue pour des personnes infirmes moteurs cérébrales. [DÉCIDÉ]
* Objectif de fond : remplacer les outils des grandes entreprises par des outils faits maison, et être indépendant des comptes et d'internet. [DÉCIDÉ]
* Avant tout changement important : explique ce que tu vas faire, attends l'accord. Ne modifie jamais plusieurs applications d'un coup sans demande. [DÉCIDÉ]

### 2. Règles non négociables

1. Pas de compte, pas de backend, pas d'IA intégrée. [DÉCIDÉ]
2. Fonctionnement hors ligne systématique. Tout ce dont l'application a besoin est embarqué dans l'installation, moteur de reconnaissance de texte (OCR) d'omni-budget compris (environ 6 Mo). [DÉCIDÉ]
3. Aucun appel réseau sans en avoir parlé à Ferrus d'abord. Si une fonctionnalité demande internet, arrête-toi, explique pourquoi, propose une alternative locale, attends la décision. [DÉCIDÉ] Cette règle vise l'application. Les outils de développement (`npm install`, GitHub Actions) sont acceptés ; toute nouvelle bibliothèque, tout nouvel outil ou tout nouveau serveur contacté doit être signalé à Ferrus avant. [DÉCIDÉ]
4. Les données restent sur l'appareil. Rien n'est envoyé. Les liens externes ne s'ouvrent que sur action de la personne. [DÉCIDÉ]
5. Pas de police, de bibliothèque ou de script chargés depuis un CDN : tout est embarqué avec sa licence. [CONSTATÉ dans omni-texte ; à étendre]

### 3. Identité, ton, mentions

* Signature : « Ferrus Dantioch », sauf dans Refuge, qui signe d'un prénom seul (celui qui figure dans son « À propos »). C'est voulu : dans le contexte de Refuge, le prénom crée la confiance. Ne pas « corriger ». [DÉCIDÉ]
* Ton : tutoiement partout, y compris dans omni-budget et omni-grimoire. Exception conservée dans Refuge : « vous » pour ce qui est montré à d'autres personnes (message d'urgence, etc.). [DÉCIDÉ pour le tutoiement ; exception CONSTATÉE]
* Chaque application contient un « À propos » avec au minimum : nom, version, « Application réalisée par Ferrus Dantioch, avec l'aide de l'intelligence artificielle », mention de licence, phrase de confidentialité, contact, lien « Découvrir l'Omni-système ». Chaque application garde son texte propre. [DÉCIDÉ pour le fond ; modèle CONSTATÉ dans omni-texte]
* Licence du code : © 2026 Ferrus Dantioch, Creative Commons BY-NC-ND 4.0, avec le fichier LICENSE identique dans tous les dépôts. Règles, fiches, logos et textes de l'Omni-système : tous droits réservés. [DÉCIDÉ]
* Contact dans les applications : l'alias e-mail de l'Omni-système. Le serveur Discord figure sur le portfolio seulement : il n'a pas besoin d'apparaître dans les applications. [DÉCIDÉ]
* Identité visuelle : violet nuit pour l'écosystème Omni. Logo de l'Omni-système (dé à vingt faces violet entouré d'un anneau lumineux) dans l'« À propos ». Exception Refuge : pas de logo Omni ; le violet nuit y est une gamme facultative parmi les autres, pas celle par défaut. [DÉCIDÉ]
* Chaque bibliothèque tierce est créditée avec sa licence (fichier de licences, et lien depuis l'« À propos »). [RECOMMANDÉ ; aujourd'hui le lien manque dans les deux applications React]

### 4. Sécurité et vie privée

* Une CSP (règle de sécurité qui interdit au navigateur de contacter d'autres sites) stricte dans chaque application. [RECOMMANDÉ ; CONSTATÉ : présente dans omni-texte et omni-budget, absente de Refuge et omni-grimoire]
* Données sensibles (journal, notes vocales, finances) : chiffrées au repos quand c'est possible. [RECOMMANDÉ ; CONSTATÉ : seul omni-budget chiffre]
* Origine partagée : toutes les applications vivent sous la même adresse de base, donc chacune pourrait techniquement lire les données des autres. Ne jamais stocker deux applications sous le même nom de base de données ou de préfixe. Préfixe propre à chaque application pour caches, IndexedDB et localStorage. Un préfixe générique (ex. `budget-`) est à éviter. [CONSTATÉ ; hébergement à origines séparées : décision reportée] Cette règle vaut pour les nouveaux noms : les noms déjà publiés (`budget-perso` et `budget-theme` d'omni-budget) restent, car les renommer ferait perdre les données des personnes. [DÉCIDÉ]
* Sur Chrome Android, une seule PWA du même site s'installe. Contournement : utiliser Brave, qui les installe indépendamment. C'est un palliatif d'installation : il ne règle ni l'isolation des données ni le risque de sécurité. À mentionner dans l'aide à l'installation de chaque application. [DÉCIDÉ comme palliatif]
* Ne pas stocker en clair ce qui pourrait nuire à la personne si quelqu'un d'autre ouvre l'appareil. [RECOMMANDÉ]

### 5. Hors ligne et versions

* Service worker (petit programme qui garde une copie de l'application sur l'appareil) : tout est copié à l'installation, puis « cache d'abord ». [CONSTATÉ]
* La mise à jour doit se vérifier au retour au premier plan, avec un message clair. [CONSTATÉ dans 3 apps sur 4 ; manque dans omni-budget] Exception Refuge : le message clair est la note discrète de l'accueil (sans bouton) et le bouton « Mettre à jour » des Réglages ; rien en bouclier, jamais de changement par surprise. [DÉCIDÉ]
* Le service worker gère l'échec réseau (plan B quand un fichier manque). [RECOMMANDÉ ; absent de Refuge]
* Numéro de version : une seule source de vérité, automatique, jamais écrite à la main à deux endroits. [RECOMMANDÉ ; CONSTATÉ : 4 méthodes différentes, dont 2 reposent sur la mémoire]
* Si le numéro de version affiché ne correspond pas au code, le signaler. [RECOMMANDÉ]

### 6. Accessibilité (minimum pour toute application)

* Cibles tactiles : 44 px minimum. Refuge en vise 60 px. [DÉCIDÉ ; CONSTATÉ : plusieurs boutons du grimoire font 34 à 40 px]
* Contraste du texte : 4,5 minimum (WCAG). [RECOMMANDÉ ; CONSTATÉ : Refuge, thème clair, à 3,8–4,3]
* Contour de focus clavier toujours visible, y compris en thème « bouclier noir » de Refuge. [RECOMMANDÉ] Dans le bouclier : contour gris foncé, juste au minimum de la norme (contraste 3:1 sur le noir, environ `#5a5a5a`), seulement autour de l'élément sélectionné, pour éclairer le moins possible. [DÉCIDÉ]
* Respect du réglage « réduire les animations » du téléphone. [CONSTATÉ dans les quatre]
* Un seul `<h1>` par page. Échap ferme les écrans plein écran. Tab ne s'en échappe pas. [RECOMMANDÉ ; CONSTATÉ : manque dans Refuge]
* Vibration : interdite dans Refuge. Ailleurs, toute vibration a un réglage pour la couper. [DÉCIDÉ ; CONSTATÉ : le grimoire vibre sans réglage]
* Thème appliqué avant l'affichage pour éviter l'éclair du mauvais thème : petit script en tête de page. [CONSTATÉ dans omni-texte et Refuge ; manque dans omni-budget et omni-grimoire]
* Thèmes de référence : Omni (violet nuit), Sombre, Clair. [CONSTATÉ] « Auto » (suit le réglage du téléphone) est accepté en plus de ces trois thèmes. [DÉCIDÉ]
* Réglage de luminosité et animation de tournement de page au doigt : prévus pour les applications de lecture et d'écriture, en priorité omni-liseuse et omni-romancier, dépôts pas encore lus. Aucune des quatre applications examinées ne les a. [DÉCIDÉ pour le périmètre ; CONSTATÉ pour leur absence]

### 7. Tests et livraison

* Test automatique de chaque nouvelle fonction. omni-texte a Playwright (hors ligne, contrastes, téléphone) ; omni-budget a Vitest ; Refuge n'en a pas. [CONSTATÉ ; tests pour Refuge : RECOMMANDÉ]
* Avant de dire que c'est terminé : vérifie hors ligne, vérifie sur téléphone et sur tablette, relis le bloc « À propos », vérifie qu'aucune requête réseau ne part.
* Mettre à jour le README et les commentaires quand le code change (omni-texte annonce 1.3.0 alors que le code est en 1.3.1). [CONSTATÉ]

### 8. Technologies

* Pour une petite application : HTML, CSS et JavaScript purs, sans étape de compilation (build). [RECOMMANDÉ par défaut]
* React + Vite (build obligatoire, publication par GitHub Actions) n'est utilisé que si la complexité le justifie. [CONSTATÉ dans omni-budget et omni-grimoire]
* Publication : GitHub Pages. [CONSTATÉ]

### 9. Structure type d'un nouveau projet

[RECOMMANDÉ] Un dossier avec : `index.html`, `manifest.webmanifest`, `sw.js`, `css/` (thèmes inclus), `js/`, `assets/` (icônes, logo), `LICENSE`, `README.md`, `CLAUDE.md`, `licences-tierces.txt` si besoin, un dossier de tests. À ajuster après lecture d'omni-texte, qui est la référence la plus complète.

### 10. Périmètre actuel

Seuls omni-texte, Refuge, omni-budget et omni-grimoire ont été examinés. Cap, Soutien-IMC et les autres dépôts ne le seront pas pour le moment, par décision de Ferrus. Ne pas étendre les règles de ce document à un dépôt non lu sans l'avoir lu. [DÉCIDÉ]

### 11. Dettes connues, par priorité

- **Priorité 2** — Origine partagée : décision d'hébergement à étudier, reportée.
- **Priorité 4** — Méthode de version unique pour toutes les applications.
- **Priorité 6** — Éclair de thème (omni-budget, omni-grimoire), préfixe de cache générique d'omni-budget, documentation périmée.
