// Nettoyage par liste blanche du contenu d'un document.
//
// Tout document qui entre dans la feuille (ouverture, restauration d'une
// sauvegarde) passe d'abord ici. Seules quelques balises et quelques styles
// sont gardés ; tout le reste est supprimé. Ainsi, un fichier de sauvegarde
// modifié à la main ne peut pas introduire de code (<script>, onerror=…).
//
// Le texte est lu avec DOMParser : dans un document créé ainsi, aucun script
// ne s'exécute et aucune image ne se charge. On reconstruit ensuite un
// contenu neuf, élément par élément : rien n'est copié tel quel.

import { policeDepuisCss, versHexa } from './palettes.js';
import { reparerStructure, interligneProche } from './paragraphes.js';
import { INVISIBLE } from './selection.js';

const BALISES_PERMISES = new Set(['P', 'BR', 'H1', 'H2', 'H3', 'UL', 'OL', 'LI', 'STRONG', 'B', 'EM', 'I', 'U', 'S', 'SPAN']);

// Balises équivalentes converties vers une balise permise.
const RENOMMAGES = { STRIKE: 'S', DEL: 'S', INS: 'U', H4: 'H3', H5: 'H3', H6: 'H3' };

// Balises supprimées avec tout leur contenu (code, médias, formulaires…).
const SUPPRIMEES = new Set([
  'SCRIPT', 'STYLE', 'TEMPLATE', 'IFRAME', 'FRAME', 'FRAMESET', 'OBJECT', 'EMBED', 'APPLET',
  'NOSCRIPT', 'NOEMBED', 'NOFRAMES', 'SVG', 'MATH', 'HEAD', 'TITLE', 'META', 'LINK', 'BASE',
  'IMG', 'PICTURE', 'VIDEO', 'AUDIO', 'SOURCE', 'TRACK', 'CANVAS', 'MAP', 'AREA',
  'FORM', 'INPUT', 'TEXTAREA', 'SELECT', 'OPTION', 'BUTTON', 'XMP', 'PLAINTEXT', 'DIALOG', 'SLOT',
]);

// Au-delà de cette profondeur, on ne garde que le texte (protection contre
// un fichier piégé contenant des milliers de balises imbriquées).
const PROFONDEUR_MAX = 40;

// Styles permis et vérification de leur valeur. Chaque fonction renvoie la
// valeur propre à garder, ou null pour la rejeter.
const STYLES = {
  'font-size': (v) => {
    const m = v.match(/^(\d{1,4}(?:\.\d+)?)(pt|px)$/);
    if (!m) return null;
    const pt = m[2] === 'px' ? Number(m[1]) * 0.75 : Number(m[1]);
    return pt >= 4 && pt <= 400 ? `${Math.round(pt * 2) / 2}pt` : null;
  },
  'font-family': (v) => policeDepuisCss(v)?.pile ?? null,
  color: (v) => versHexa(v),
  'background-color': (v) => versHexa(v),
  'text-align': (v) => (/^(left|right|center|justify)$/.test(v) ? v : null),
  'font-weight': (v) => (/^(normal|bold|bolder|lighter|[1-9]00)$/.test(v) ? v : null),
  'font-style': (v) => (/^(normal|italic)$/.test(v) ? v : null),
  'text-decoration': (v, source) => {
    const ligne = (source.style.getPropertyValue('text-decoration-line') || v).trim();
    const mots = ligne.split(/\s+/);
    return mots.every((m) => ['underline', 'line-through', 'none'].includes(m)) ? mots.join(' ') : null;
  },
};

// Interligne : seulement sur un paragraphe, un titre ou un élément de liste,
// et seulement l'une des valeurs proposées (simple ou double).
const BLOCS_AVEC_INTERLIGNE = new Set(['P', 'H1', 'H2', 'H3', 'LI']);

function interligne(v) {
  return /^\d(\.\d+)?$/.test(v) ? interligneProche(Number(v)) : null;
}

function copierStyles(source, cible) {
  if (!source.getAttribute('style') || !source.style) return;
  for (const [propriete, verifier] of Object.entries(STYLES)) {
    const valeur = source.style.getPropertyValue(propriete).trim().toLowerCase();
    if (!valeur) continue;
    const propre = verifier(valeur, source);
    if (propre) cible.style.setProperty(propriete, propre);
  }
  if (BLOCS_AVEC_INTERLIGNE.has(cible.nodeName)) {
    const propre = interligne(source.style.getPropertyValue('line-height').trim());
    if (propre) cible.style.setProperty('line-height', propre);
  }
}

function copier(depuis, vers, profondeur) {
  for (const noeud of depuis.childNodes) {
    if (noeud.nodeType === 3) {
      const texte = noeud.data.replaceAll(INVISIBLE, '');
      if (texte) vers.appendChild(document.createTextNode(texte));
      continue;
    }
    if (noeud.nodeType !== 1) continue; // commentaires, etc.
    const original = noeud.nodeName.toUpperCase();
    if (SUPPRIMEES.has(original)) continue;
    if (profondeur >= PROFONDEUR_MAX) {
      vers.appendChild(document.createTextNode(noeud.textContent.replaceAll(INVISIBLE, '')));
      continue;
    }
    const nom = RENOMMAGES[original] ?? original;
    if (nom === 'HR') {
      // Saut de page : gardé seulement au premier niveau du document (le
      // conteneur final n'a pas de parent), toujours vide et sans attribut.
      if (!vers.parentNode) vers.appendChild(document.createElement('hr'));
      continue;
    }
    if (!BALISES_PERMISES.has(nom)) {
      // Balise inconnue : on garde seulement son contenu.
      copier(noeud, vers, profondeur + 1);
      continue;
    }
    const element = document.createElement(nom.toLowerCase());
    copierStyles(noeud, element);
    vers.appendChild(element);
    if (nom !== 'BR') copier(noeud, element, profondeur + 1);
  }
}

/** Renvoie un <div> (non affiché) contenant le document nettoyé. */
export function contenuPropre(html) {
  const source = new DOMParser().parseFromString(String(html ?? ''), 'text/html');
  const conteneur = document.createElement('div');
  copier(source.body, conteneur, 0);
  reparerStructure(conteneur);
  return conteneur;
}

/** Version texte : renvoie le code HTML nettoyé. */
export function nettoyerHtml(html) {
  return contenuPropre(html).innerHTML;
}
