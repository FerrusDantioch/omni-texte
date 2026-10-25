// Recopie le code commun aux deux applications dans Omni-Romancier, pour
// qu'elles aient exactement le même :
// - le correcteur orthographique (dossier correcteur/) ;
// - le saut de page en texte simple (dossier commun/).
//
// Ce code est écrit une seule fois, ici, dans omni-texte. On ne le modifie
// JAMAIS directement dans omni-romancier : on le modifie ici, puis on lance
// ce script.
//
// Utilisation, depuis le dossier omni-texte (les deux dépôts côte à côte) :
//   node outils/copier-commun.mjs             → recopie
//   node outils/copier-commun.mjs --verifier  → vérifie seulement que
//                                                   les deux copies sont identiques
// Un autre emplacement pour Omni-Romancier peut être donné à la fin :
//   node outils/copier-commun.mjs ../autre-dossier/omni-romancier

import { copyFileSync, existsSync, mkdirSync, readdirSync, readFileSync, rmSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const verifierSeulement = process.argv.includes('--verifier');
const autre = process.argv.slice(2).find((a) => !a.startsWith('--'));
const DOSSIERS = ['correcteur', 'commun'];
const ROMANCIER = resolve(autre ?? fileURLToPath(new URL('../../omni-romancier/', import.meta.url)));

if (!existsSync(join(ROMANCIER, 'index.html'))) {
  console.error(`Omni-Romancier introuvable : ${ROMANCIER}`);
  process.exit(1);
}

let toutIdentique = true;
let changements = 0;
for (const dossier of DOSSIERS) {
  const source = fileURLToPath(new URL(`../${dossier}/`, import.meta.url));
  const destination = join(ROMANCIER, dossier);
  const fichiers = readdirSync(source).filter((f) => !f.startsWith('.'));
  const differences = [];
  for (const f of fichiers) {
    const cible = join(destination, f);
    if (!existsSync(cible) || !readFileSync(cible).equals(readFileSync(join(source, f)))) differences.push(f);
  }
  const enTrop = existsSync(destination) ? readdirSync(destination).filter((f) => !f.startsWith('.') && !fichiers.includes(f)) : [];

  if (verifierSeulement) {
    if (differences.length || enTrop.length) {
      toutIdentique = false;
      console.error(`Dossier ${dossier}/ : les deux copies sont différentes :`, [...differences, ...enTrop].join(', '));
    }
    continue;
  }
  mkdirSync(destination, { recursive: true });
  for (const f of differences) copyFileSync(join(source, f), join(destination, f));
  for (const f of enTrop) rmSync(join(destination, f));
  changements += differences.length + enTrop.length;
  console.log(differences.length || enTrop.length
    ? `Dossier ${dossier}/ recopié dans ${destination} (${differences.length} fichier(s) mis à jour, ${enTrop.length} retiré(s)).`
    : `Dossier ${dossier}/ : rien à faire, les deux copies sont déjà identiques.`);
}

if (verifierSeulement) {
  if (!toutIdentique) process.exit(1);
  console.log('Les deux copies sont identiques.');
} else if (changements) {
  console.log("Pensez à ajouter les nouveaux fichiers dans la liste du service worker d'Omni-Romancier (sw.js), et à changer sa version.");
}
