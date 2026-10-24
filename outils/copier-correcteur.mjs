// Recopie le correcteur orthographique (dossier correcteur/) dans
// Omni-Romancier, pour que les deux applications aient exactement le même.
//
// Le correcteur est écrit une seule fois, ici, dans omni-texte. On ne le
// modifie JAMAIS directement dans omni-romancier : on le modifie ici, puis
// on lance ce script.
//
// Utilisation, depuis le dossier omni-texte (les deux dépôts côte à côte) :
//   node outils/copier-correcteur.mjs             → recopie
//   node outils/copier-correcteur.mjs --verifier  → vérifie seulement que
//                                                   les deux sont identiques
// Un autre emplacement pour Omni-Romancier peut être donné à la fin :
//   node outils/copier-correcteur.mjs ../autre-dossier/omni-romancier

import { copyFileSync, existsSync, mkdirSync, readdirSync, readFileSync, rmSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const verifierSeulement = process.argv.includes('--verifier');
const autre = process.argv.slice(2).find((a) => !a.startsWith('--'));
const SOURCE = fileURLToPath(new URL('../correcteur/', import.meta.url));
const DESTINATION = join(resolve(autre ?? fileURLToPath(new URL('../../omni-romancier/', import.meta.url))), 'correcteur');

if (!existsSync(join(DESTINATION, '..', 'index.html'))) {
  console.error(`Omni-Romancier introuvable : ${join(DESTINATION, '..')}`);
  process.exit(1);
}

const fichiers = readdirSync(SOURCE).filter((f) => !f.startsWith('.'));
const differences = [];
for (const f of fichiers) {
  const cible = join(DESTINATION, f);
  if (!existsSync(cible) || !readFileSync(cible).equals(readFileSync(join(SOURCE, f)))) differences.push(f);
}
const enTrop = existsSync(DESTINATION) ? readdirSync(DESTINATION).filter((f) => !f.startsWith('.') && !fichiers.includes(f)) : [];

if (verifierSeulement) {
  if (differences.length || enTrop.length) {
    console.error('Les deux correcteurs sont différents :', [...differences, ...enTrop].join(', '));
    process.exit(1);
  }
  console.log('Les deux correcteurs sont identiques.');
  process.exit(0);
}

mkdirSync(DESTINATION, { recursive: true });
for (const f of differences) copyFileSync(join(SOURCE, f), join(DESTINATION, f));
for (const f of enTrop) rmSync(join(DESTINATION, f));
console.log(differences.length || enTrop.length
  ? `Correcteur recopié dans ${DESTINATION} (${differences.length} fichier(s) mis à jour, ${enTrop.length} retiré(s)).`
  : 'Rien à faire : les deux correcteurs sont déjà identiques.');
if (differences.length || enTrop.length) {
  console.log("Pensez à ajouter les nouveaux fichiers dans la liste du service worker d'Omni-Romancier (sw.js), et à changer sa version.");
}
