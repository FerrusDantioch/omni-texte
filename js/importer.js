// « Ouvrir un fichier » : un fichier Word (.docx) ou texte (.txt) devient un
// nouveau document. Le fichier d'origine n'est jamais modifié.

import { lireDocx } from './import-docx.js';
import { ErreurArchive } from './zip.js';
import { SAUT_DE_PAGE, estSautDePage } from '../commun/saut-de-page.js';

const TAILLE_MAX = 50 * 1024 * 1024; // 50 Mo de fichier
const TAILLE_MAX_DOCUMENT = 50 * 1024 * 1024; // 50 Mo de code HTML (comme dans storage.js)

/** Erreur dont le message s'adresse à l'utilisateur. */
export class ErreurOuverture extends Error {}

/** Titre du nouveau document : le nom du fichier, sans son extension. */
export function titreDuFichier(nom) {
  return String(nom).replace(/\.(docx|txt|text)$/i, '').trim().slice(0, 200);
}

/** Type d'un fichier : 'docx', 'txt', ou un message d'erreur. */
function typeDu(fichier) {
  const nom = fichier.name.toLowerCase();
  if (nom.endsWith('.docx')) return 'docx';
  if (nom.endsWith('.txt') || nom.endsWith('.text') || fichier.type === 'text/plain') return 'txt';
  if (nom.endsWith('.doc') || nom.endsWith('.rtf') || nom.endsWith('.odt')) {
    throw new ErreurOuverture(
      "Ce format n'est pas pris en charge. Ouvre ce fichier dans Word, LibreOffice ou Google Docs, enregistre-le au format Word (.docx), puis réessaie.",
    );
  }
  throw new ErreurOuverture("Ce type de fichier n'est pas pris en charge. Choisis un fichier Word (.docx) ou texte (.txt).");
}

/** Décode un fichier texte : UTF-8 (le plus courant), UTF-16, sinon l'ancien encodage de Windows. */
export function decoderTexte(octets) {
  if (octets[0] === 0xff && octets[1] === 0xfe) return new TextDecoder('utf-16le').decode(octets);
  if (octets[0] === 0xfe && octets[1] === 0xff) return new TextDecoder('utf-16be').decode(octets);
  try {
    return new TextDecoder('utf-8', { fatal: true }).decode(octets);
  } catch {
    return new TextDecoder('windows-1252').decode(octets);
  }
}

/**
 * Texte brut → paragraphes (une ligne = un paragraphe). Une ligne
 * « ──── Saut de page ──── » (export .txt d'Omni-Texte, texte d'Omni-Romancier)
 * et le caractère de saut de page des anciens fichiers texte (\f) deviennent
 * de vrais sauts de page.
 */
export function texteEnHtml(texte) {
  const propre = texte
    .replace(/\r\n?/g, '\n')
    .replace(/\n?\f\n?/g, `\n${SAUT_DE_PAGE}\n`)
    .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, '');
  const lignes = propre.replace(/\n$/, '').split('\n');
  const conteneur = document.createElement('div');
  for (const ligne of lignes) {
    if (estSautDePage(ligne)) {
      conteneur.append(document.createElement('hr'));
      continue;
    }
    const p = document.createElement('p');
    if (ligne) p.textContent = ligne;
    else p.append(document.createElement('br'));
    conteneur.append(p);
  }
  return conteneur.innerHTML;
}

function accorder(n, singulier, pluriel) {
  return n > 1 ? pluriel.replace('%', n) : singulier;
}

/** Phrases qui signalent ce qui n'a pas pu être repris. */
function remarquesLisibles({ images = 0, tableaux = 0, notes = 0 }) {
  const remarques = [];
  if (images) {
    remarques.push(
      accorder(images, "1 image n'a pas été reprise : Omni-Texte ne gère pas les images.", "% images n'ont pas été reprises : Omni-Texte ne gère pas les images."),
    );
  }
  if (tableaux) {
    remarques.push(accorder(tableaux, 'Le tableau a été transformé en simples paragraphes.', 'Les % tableaux ont été transformés en simples paragraphes.'));
  }
  if (notes) remarques.push(accorder(notes, "La note de bas de page n'a pas été reprise.", "Les % notes de bas de page n'ont pas été reprises."));
  return remarques;
}

/**
 * Lit un fichier choisi par l'utilisateur.
 * @param {File} fichier
 * @returns {Promise<{titre: string, html: string, remarques: string[]}>}
 */
export async function lireFichier(fichier) {
  const type = typeDu(fichier);
  if (fichier.size > TAILLE_MAX) throw new ErreurOuverture('Ce fichier est trop volumineux (plus de 50 Mo).');
  const octets = new Uint8Array(await fichier.arrayBuffer());
  const titre = titreDuFichier(fichier.name);
  let lu;
  if (type === 'txt') {
    lu = { titre, html: texteEnHtml(decoderTexte(octets)), remarques: [] };
  } else {
    try {
      const { html, remarques } = await lireDocx(octets);
      lu = { titre, html, remarques: remarquesLisibles(remarques) };
    } catch (erreur) {
      if (erreur instanceof ErreurArchive) throw new ErreurOuverture(erreur.message);
      console.warn('Lecture du fichier Word impossible :', erreur);
      throw new ErreurOuverture("Ce fichier Word n'a pas pu être lu. Il est peut-être abîmé.");
    }
  }
  // Même limite que pour une sauvegarde : un document plus gros ne pourrait pas être restauré.
  if (lu.html.length > TAILLE_MAX_DOCUMENT) throw new ErreurOuverture('Ce fichier contient trop de texte pour un seul document.');
  return lu;
}
