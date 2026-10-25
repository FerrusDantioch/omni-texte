// Fabrique la liste de mots du correcteur orthographique
// (correcteur/mots-fr-7.5.txt) à partir du dictionnaire Hunspell français.
//
// Pourquoi ? Un dictionnaire Hunspell ne contient pas les mots eux-mêmes,
// mais des racines (« manger ») et des règles (« -ais, -ait, -aient… »).
// Déplier tout cela sur un téléphone, à chaque ouverture, prend de longues
// secondes et des centaines de mégaoctets. On le fait donc UNE fois, ici, sur
// l'ordinateur, et l'application n'a plus qu'à lire la liste obtenue.
//
// Utilisation, depuis le dossier omni-texte :
//   cd outils/dictionnaire && npm install && node construire.mjs
// puis recopier le correcteur dans Omni-Romancier :
//   node outils/copier-commun.mjs
//
// Le dictionnaire d'origine (dossier source/) est celui de Grammalecte
// (Dicollecte), variante « Classique » 7.5, sous licence MPL 2.0.
//
// Format du fichier produit (texte UTF-8, une entrée par ligne) :
//   - d'abord l'en-tête : les lignes qui commencent par « # » sont des
//     commentaires, la ligne « @elisions … » donne les débuts de mots élidés
//     (l', qu'…), chaque ligne « @rep a b » un remplacement fréquent pour
//     les suggestions (« a » peut être remplacé par « b ») ;
//   - puis les mots, triés (le premier commence toujours par « 0 », c'est
//     ainsi qu'on reconnaît la fin de l'en-tête). Pour gagner de la place, chaque mot ne répète
//     pas le début qu'il partage avec le mot précédent : le premier
//     caractère dit combien de lettres reprendre (« 0 » = 0, « 1 » = 1…),
//     la suite est la fin du mot. Exemple : « maison », « maisons » donne
//     les lignes « 0maison » et « 6s ».

import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import nspell from 'nspell';

const ici = (f) => fileURLToPath(new URL(f, import.meta.url));
const VERSION = '7.5';
const SORTIE = ici(`../../correcteur/mots-fr-${VERSION}.txt`);
const PREFIXE_MAX = 40; // un mot reprend au plus 40 lettres du précédent

const aff = readFileSync(ici('source/fr-classique.aff'), 'utf8');
const dic = readFileSync(ici('source/fr-classique.dic'), 'utf8');

console.log('Lecture du dictionnaire Hunspell (quelques secondes)…');
const hunspell = nspell(aff, dic);

// Les débuts élidés (l', d', qu', jusqu'…) : ce sont les préfixes du fichier
// .aff qui se terminent par une apostrophe. L'application les reconnaît
// seule (« l'ami » = « l' » + « ami »), inutile de stocker « l'ami ».
const elisions = new Set();
for (const ligne of aff.split('\n')) {
  const morceaux = ligne.trim().split(/\s+/);
  if (morceaux[0] === 'PFX' && morceaux.length >= 5 && morceaux[3].endsWith("'")) {
    elisions.add(morceaux[3].toLowerCase().slice(0, -1));
  }
}

// Les remplacements fréquents (table REP du fichier .aff : « ph » ↔ « f »,
// lettres doublées, « ai » ↔ « é »…) : l'application s'en sert pour ses
// suggestions. On laisse ceux des élisions (« l » → « l' »), déjà traitées.
const remplacements = [];
for (const ligne of aff.split('\n')) {
  const morceaux = ligne.trim().split(/\s+/);
  if (morceaux[0] !== 'REP' || morceaux.length < 3 || morceaux[2].endsWith("'")) continue;
  remplacements.push(`${morceaux[1]} ${morceaux[2]}`.replace(/_/g, '\u00a0'));
}

// Toutes les formes connues de nspell, gardées seulement si Hunspell les
// accepte vraiment (certaines entrées internes ne sont que des racines).
const apostrophe = (m) => m.replace(/’/g, "'");
const toutes = new Set();
for (const forme of Object.keys(hunspell.data)) {
  const mot = apostrophe(forme);
  if (mot && hunspell.correct(mot)) toutes.add(mot);
}

// On retire les formes élidées que l'application retrouve seule
const retenus = [];
for (const mot of toutes) {
  const i = mot.indexOf("'");
  if (i > 0) {
    const debut = mot.slice(0, i).toLowerCase();
    const reste = mot.slice(i + 1);
    // (« l'Effacée » : après l'apostrophe, une majuscule est permise, comme en début de phrase)
    const minuscule = reste.charAt(0).toLowerCase() + reste.slice(1);
    if (elisions.has(debut) && (reste === '' || toutes.has(reste) || toutes.has(minuscule))) continue;
  }
  retenus.push(mot);
}
retenus.sort();

// Écriture avec la compression « début commun »
const lignes = [
  `# Liste de mots française tirée du dictionnaire « Classique » ${VERSION} de Grammalecte (Dicollecte)`,
  '# par Olivier R. et ses contributeurs — https://grammalecte.net/',
  '# This Source Code Form is subject to the terms of the Mozilla Public',
  '# License, v. 2.0. If a copy of the MPL was not distributed with this',
  '# file, You can obtain one at http://mozilla.org/MPL/2.0/.',
  '# Fabriquée par outils/dictionnaire/construire.mjs (dépôt FerrusDantioch/omni-texte).',
  `@elisions ${[...elisions].sort().join(' ')}`,
  ...remplacements.map((r) => `@rep ${r}`),
];
let precedent = '';
for (const mot of retenus) {
  let commun = 0;
  while (commun < PREFIXE_MAX && commun < mot.length && commun < precedent.length && mot[commun] === precedent[commun]) commun++;
  lignes.push(String.fromCharCode(48 + commun) + mot.slice(commun));
  precedent = mot;
}
writeFileSync(SORTIE, lignes.join('\n') + '\n');

console.log(`${retenus.length} mots écrits dans ${SORTIE}`);
console.log(`Élisions : ${[...elisions].sort().join(' ')}`);
