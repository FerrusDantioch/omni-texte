// Opérations sur les paragraphes : style (texte normal, titres), listes,
// alignement, et réparation de la structure du document.
//
// Structure attendue de la feuille : une suite de <p>, <h1>, <h2>, <h3>,
// <ul> et <ol> (ces deux derniers ne contenant que des <li>), et de <hr>,
// les sauts de page (voir estSautDePage).

import { estListe, estEnLigne, INVISIBLE } from './selection.js';
import { isoler, deballer } from './mise-en-forme.js';

const BALISES_HAUT_NIVEAU = new Set(['P', 'H1', 'H2', 'H3', 'UL', 'OL', 'HR']);

/**
 * Un saut de page est un <hr>, toujours placé directement dans la feuille
 * (jamais dans un paragraphe). Il ne contient aucun texte : le libellé
 * « Saut de page » affiché à l'écran est dessiné par la feuille de style
 * (css/redaction.css). Le correcteur, la recherche et le compteur de mots,
 * qui ne lisent que le texte, ne le voient donc jamais.
 */
export const estSautDePage = (n) => n?.nodeName === 'HR';

/** Recopie les réglages de paragraphe (alignement, interligne) d'un bloc à l'autre. */
export function copierReglagesBloc(source, cible) {
  if (source.style?.textAlign) cible.style.textAlign = source.style.textAlign;
  if (source.style?.lineHeight) cible.style.lineHeight = source.style.lineHeight;
}

/** Remplace un bloc par un autre type de bloc, en gardant contenu, alignement et interligne. */
export function changerBalise(bloc, balise) {
  const nouveau = document.createElement(balise);
  copierReglagesBloc(bloc, nouveau);
  while (bloc.firstChild) nouveau.appendChild(bloc.firstChild);
  bloc.parentNode.replaceChild(nouveau, bloc);
  return nouveau;
}

/** Sort un élément de sa liste (la liste est coupée en deux si besoin). */
function sortirDeLaListe(li, balise) {
  const liste = li.parentNode;
  isoler(li, liste.parentNode);
  const bloc = changerBalise(li, balise);
  liste.parentNode.insertBefore(bloc, liste);
  liste.remove();
  return bloc;
}

/** Style de paragraphe : 'p' (texte normal), 'h1', 'h2' ou 'h3'. */
export function appliquerStyleParagraphe(blocs, balise) {
  for (const bloc of blocs) {
    if (bloc.nodeName === 'LI') {
      // Un titre ne peut pas être un élément de liste : il en sort.
      if (balise !== 'p') sortirDeLaListe(bloc, balise);
    } else if (bloc.nodeName !== balise.toUpperCase()) {
      changerBalise(bloc, balise);
    }
  }
}

/** Active ou retire une liste ('UL' à puces, 'OL' numérotée). */
export function basculerListe(blocs, type) {
  const dejaDansCetteListe = blocs.length > 0 && blocs.every((b) => b.nodeName === 'LI' && b.parentNode.nodeName === type);
  const listes = new Set();
  for (const bloc of blocs) {
    if (dejaDansCetteListe) {
      sortirDeLaListe(bloc, 'p');
    } else if (bloc.nodeName === 'LI') {
      let liste = bloc.parentNode;
      isoler(bloc, liste.parentNode);
      if (liste.nodeName !== type) {
        const nouvelle = document.createElement(type);
        liste.parentNode.replaceChild(nouvelle, liste);
        nouvelle.appendChild(bloc);
        liste = nouvelle;
      }
      listes.add(liste);
    } else {
      const liste = document.createElement(type);
      bloc.parentNode.insertBefore(liste, bloc);
      liste.appendChild(changerBalise(bloc, 'li'));
      listes.add(liste);
    }
  }
  for (const liste of listes) fusionnerListesVoisines(liste);
}

function fusionnerListesVoisines(liste) {
  if (!liste.isConnected) return;
  let courante = liste;
  const precedente = courante.previousSibling;
  if (precedente && precedente.nodeName === courante.nodeName) {
    while (courante.firstChild) precedente.appendChild(courante.firstChild);
    courante.remove();
    courante = precedente;
  }
  const suivante = courante.nextSibling;
  if (suivante && suivante.nodeName === courante.nodeName) {
    while (suivante.firstChild) courante.appendChild(suivante.firstChild);
    suivante.remove();
  }
}

/** Alignement : 'left', 'center', 'right' ou 'justify'. */
export function aligner(blocs, valeur) {
  for (const bloc of blocs) {
    if (valeur === 'left') bloc.style.removeProperty('text-align');
    else bloc.style.textAlign = valeur;
    if (bloc.style.length === 0) bloc.removeAttribute('style');
  }
}

// Interlignes proposés. null : interligne par défaut (1,5).
export const INTERLIGNES = [
  { nom: 'Simple', valeur: '1.15' },
  { nom: '1,5 (par défaut)', valeur: null },
  { nom: 'Double', valeur: '2' },
];

/** Interligne permis le plus proche d'un rapport (ex. 1.08 → '1.15'), ou null pour 1,5. */
export function interligneProche(rapport) {
  if (!(rapport > 0)) return null;
  if (rapport < 1.33) return '1.15';
  if (rapport < 1.75) return null;
  return '2';
}

/** Interligne : '1.15', '2', ou null (par défaut). */
export function espacer(blocs, valeur) {
  for (const bloc of blocs) {
    if (valeur) bloc.style.lineHeight = valeur;
    else bloc.style.removeProperty('line-height');
    if (bloc.style.length === 0) bloc.removeAttribute('style');
  }
}

/** Vrai si le bloc ne contient ni texte visible ni saut de ligne. */
function estVide(bloc) {
  return !bloc.querySelector('br') && bloc.textContent === '';
}

/**
 * Répare la structure : chaque morceau de texte doit être dans un bloc, il
 * doit toujours y avoir au moins un paragraphe, et un bloc vide contient un
 * <br> pour garder sa hauteur. Renvoie true si quelque chose a changé.
 */
export function reparerStructure(racine) {
  let change = deballerConteneurs(racine);

  // Le texte et les balises en ligne isolés sont regroupés dans des <p>.
  let paragraphe = null;
  for (let enfant = racine.firstChild; enfant; ) {
    const suivant = enfant.nextSibling;
    if (BALISES_HAUT_NIVEAU.has(enfant.nodeName)) {
      paragraphe = null;
      change = reparerBloc(enfant) || change;
    } else if (estEspaceEntreBlocs(enfant)) {
      enfant.remove(); // espace laissé par du code HTML mis en forme
      change = true;
    } else {
      if (!paragraphe) {
        paragraphe = document.createElement('p');
        racine.insertBefore(paragraphe, enfant);
      }
      paragraphe.appendChild(enfant);
      change = true;
    }
    enfant = suivant;
  }
  for (const p of racine.children) {
    if (p.nodeName === 'P' && estVide(p)) {
      p.appendChild(document.createElement('br'));
      change = true;
    }
  }
  // Toujours un paragraphe après le dernier saut de page, pour pouvoir écrire
  // sur la nouvelle page (et un document n'est jamais vide).
  if (!racine.lastElementChild || estSautDePage(racine.lastElementChild)) {
    const p = document.createElement('p');
    p.appendChild(document.createElement('br'));
    racine.appendChild(p);
    change = true;
  }
  return change;
}

/** Les conteneurs inattendus (<div>…) sont déballés ou deviennent des <p>. */
function deballerConteneurs(racine) {
  let change = false;
  let encore = true;
  while (encore) {
    encore = false;
    for (const enfant of [...racine.childNodes]) {
      if (enfant.nodeType !== 1) continue;
      if (BALISES_HAUT_NIVEAU.has(enfant.nodeName) || estEnLigne(enfant) || enfant.nodeName === 'BR') continue;
      if (enfant.querySelector('p, h1, h2, h3, ul, ol, li, div')) deballer(enfant);
      else changerBalise(enfant, 'p');
      encore = true;
      change = true;
    }
  }
  return change;
}

function estEspaceEntreBlocs(noeud) {
  if (noeud.nodeType !== 3 || noeud.data.trim() !== '' || noeud.data.includes(INVISIBLE)) return false;
  const avant = noeud.previousSibling;
  const apres = noeud.nextSibling;
  return (!avant || BALISES_HAUT_NIVEAU.has(avant.nodeName)) && (!apres || BALISES_HAUT_NIVEAU.has(apres.nodeName));
}

/** Répare un bloc de haut niveau (paragraphe, titre, liste ou saut de page). */
function reparerBloc(bloc) {
  let change = false;
  if (estSautDePage(bloc)) {
    // Un saut de page reste vide (le navigateur y glisse parfois un <br>).
    if (!bloc.firstChild) return false;
    bloc.replaceChildren();
    return true;
  }
  if (estListe(bloc)) {
    for (let enfant = bloc.firstChild; enfant; ) {
      const suivant = enfant.nextSibling;
      if (enfant.nodeName === 'LI') {
        change = aplatirBlocsInternes(enfant) || change;
        if (estVide(enfant)) {
          enfant.appendChild(document.createElement('br'));
          change = true;
        }
      } else if (estListe(enfant)) {
        // Liste dans une liste : on la remonte au même niveau, puis on
        // reprend l'examen depuis le début de la liste.
        deballer(enfant);
        change = true;
        enfant = bloc.firstChild;
        continue;
      } else if (enfant.nodeType === 3 && enfant.data.trim() === '' && !enfant.data.includes(INVISIBLE)) {
        enfant.remove(); // espace entre deux éléments de liste
        change = true;
      } else {
        const li = document.createElement('li');
        bloc.insertBefore(li, enfant);
        li.appendChild(enfant);
        change = true;
      }
      enfant = suivant;
    }
    if (!bloc.firstChild) {
      bloc.remove();
      return true;
    }
    return change;
  }
  change = aplatirBlocsInternes(bloc);
  if (estVide(bloc)) {
    bloc.appendChild(document.createElement('br'));
    change = true;
  }
  return change;
}

/** Un bloc ne doit contenir que du texte et des balises en ligne. */
function aplatirBlocsInternes(bloc) {
  let change = false;
  for (const interne of [...bloc.querySelectorAll('p, h1, h2, h3, div, ul, ol, li')]) {
    if (interne.previousSibling && interne.previousSibling.nodeName !== 'BR') {
      interne.parentNode.insertBefore(document.createElement('br'), interne);
    }
    deballer(interne);
    change = true;
  }
  return change;
}
