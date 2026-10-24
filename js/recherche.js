// Panneau « Rechercher et remplacer » (loupe de la barre d'outils, ou Ctrl+F).
//
// - La recherche ignore les majuscules : « texte » trouve aussi « Texte ».
// - Les accents comptent : « a » ne trouve pas « à ».
// - L'apostrophe droite (') trouve aussi l'apostrophe typographique (’), et
//   une espace trouve aussi les espaces insécables (ajoutées avant « ! », etc.).
// - Les résultats sont surlignés sans modifier le document (API « CSS Custom
//   Highlight » ; si le navigateur ne la connaît pas, seul le compteur et le
//   défilement jusqu'au résultat fonctionnent).
// - Remplacer et Tout remplacer s'annulent avec « Annuler » (une seule étape).

import { BALISES_BLOC, INVISIBLE, pointDe, positionDe, selectionner } from './selection.js';

const MAX_RESULTATS = 10000;
const DELAI = 150; // ms : nouvelle recherche après une modification du document
const formatNombre = new Intl.NumberFormat('fr-FR');

const surlignagePossible = typeof CSS !== 'undefined' && 'highlights' in CSS && typeof Highlight === 'function';

/** Forme simplifiée d'un caractère pour la comparaison (toujours un seul caractère). */
function simplifier(c) {
  if (c === '’' || c === '‘' || c === 'ʼ') return "'";
  if (c === '\u00A0' || c === '\u202F') return ' ';
  const minuscule = c.toLowerCase();
  return minuscule.length === 1 ? minuscule : c;
}

/** Forme simplifiée d'un texte, de même longueur (un caractère pour un caractère). */
function simplifierTexte(texte) {
  const minuscules = texte.toLowerCase();
  if (minuscules.length === texte.length) return minuscules.replace(/[’‘ʼ]/g, "'").replace(/[\u00A0\u202F]/g, ' ');
  let resultat = ''; // rare : une lettre dont la minuscule s'écrit en deux caractères
  for (let i = 0; i < texte.length; i++) resultat += simplifier(texte[i]);
  return resultat;
}

/**
 * Texte simplifié d'un bloc, et les morceaux qui le composent : pour chaque
 * nœud de texte, sa place dans le texte simplifié (et, s'il contient des
 * caractères invisibles, la position d'origine de chaque caractère gardé).
 * Un saut de ligne (<br>) coupe la recherche.
 * Avec `simplifie = false`, le texte est gardé tel quel (majuscules
 * comprises) : c'est ce que lit le correcteur orthographique.
 */
export function indexerBloc(bloc, simplifie = true) {
  let texte = '';
  const morceaux = [];
  const marcheur = document.createTreeWalker(bloc, NodeFilter.SHOW_TEXT | NodeFilter.SHOW_ELEMENT);
  for (let n = marcheur.nextNode(); n; n = marcheur.nextNode()) {
    if (n.nodeName === 'BR') texte += '\n';
    else if (n.nodeType === 3 && n.length) {
      let visible = n.data;
      let decalages = null;
      if (visible.includes(INVISIBLE)) {
        decalages = [];
        for (let i = 0; i < n.length; i++) if (n.data[i] !== INVISIBLE) decalages.push(i);
        visible = visible.replaceAll(INVISIBLE, '');
      }
      morceaux.push({ debut: texte.length, noeud: n, decalages });
      texte += simplifie ? simplifierTexte(visible) : visible;
    }
  }
  return { texte, morceaux };
}

/** Nœud de texte et position correspondant au caractère n° `index` du texte simplifié. */
export function pointDuTexte(morceaux, index) {
  let bas = 0;
  let haut = morceaux.length - 1;
  while (bas < haut) {
    const milieu = (bas + haut + 1) >> 1;
    if (morceaux[milieu].debut <= index) bas = milieu;
    else haut = milieu - 1;
  }
  const { noeud, debut, decalages } = morceaux[bas];
  const i = index - debut;
  return { noeud, decalage: decalages ? decalages[i] : i };
}

/**
 * Toutes les apparitions de `recherche` dans la racine. Ce sont des plages
 * « figées » (StaticRange) : rapides, mais à recalculer après une modification.
 */
export function trouver(racine, recherche) {
  const cible = simplifierTexte(recherche);
  const plages = [];
  if (!cible) return plages;
  for (const bloc of racine.querySelectorAll([...BALISES_BLOC].join(','))) {
    const { texte, morceaux } = indexerBloc(bloc);
    for (let i = texte.indexOf(cible); i >= 0; i = texte.indexOf(cible, i + cible.length)) {
      const debut = pointDuTexte(morceaux, i);
      const fin = pointDuTexte(morceaux, i + cible.length - 1);
      plages.push(
        new StaticRange({ startContainer: debut.noeud, startOffset: debut.decalage, endContainer: fin.noeud, endOffset: fin.decalage + 1 }),
      );
      if (plages.length >= MAX_RESULTATS) return plages;
    }
  }
  return plages;
}

/** Plage ordinaire (Range) à partir d'une plage figée. */
function vraiePlage(figee) {
  const plage = document.createRange();
  plage.setStart(figee.startContainer, figee.startOffset);
  plage.setEnd(figee.endContainer, figee.endOffset);
  return plage;
}

/** Vrai si la plage figée existe encore telle quelle dans la racine. */
function estValide(figee, racine) {
  return (
    racine.contains(figee.startContainer) && racine.contains(figee.endContainer) &&
    figee.startOffset <= figee.startContainer.length && figee.endOffset <= figee.endContainer.length
  );
}

export class Recherche {
  /**
   * @param {object} options
   * @param {HTMLElement} options.panneau
   * @param {HTMLButtonElement} options.bouton  la loupe de la barre d'outils
   * @param {import('./editor.js').Editeur} options.editeur
   * @param {HTMLElement} options.zone  la zone qui défile autour de la feuille
   * @param {(texte: string) => void} options.informer  affiche un message
   */
  constructor({ panneau, bouton, editeur, zone, informer }) {
    Object.assign(this, { panneau, bouton, editeur, zone, informer });
    this.champ = panneau.querySelector('#champ-recherche');
    this.remplacement = panneau.querySelector('#champ-remplacement');
    this.resultat = panneau.querySelector('#resultat-recherche');
    this.plages = [];
    this.actuel = -1;
    this.minuterie = 0;
    this.rechercheEnAttente = false;

    bouton.addEventListener('click', () => (this.ouvert ? this.fermer() : this.ouvrir()));
    // Courte attente pendant la frappe : sur un très long document, chercher
    // « c », puis « ch », puis « cha »… ralentirait la saisie.
    this.champ.addEventListener('input', () => {
      clearTimeout(this.minuterie);
      this.rechercheEnAttente = true;
      this.minuterie = setTimeout(() => this.chercher({ depuisLeCurseur: true }), 80);
    });
    this.champ.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' && !e.isComposing) {
        e.preventDefault();
        this.aller(e.shiftKey ? -1 : 1);
      }
    });
    this.remplacement.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' && !e.isComposing) {
        e.preventDefault();
        this.remplacer();
      }
    });
    panneau.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        this.fermer();
      }
    });
    const actions = {
      precedent: () => this.aller(-1),
      suivant: () => this.aller(1),
      remplacer: () => this.remplacer(),
      'tout-remplacer': () => this.toutRemplacer(),
      fermer: () => this.fermer(),
    };
    panneau.addEventListener('click', (e) => {
      const bouton = e.target.closest('button[data-action]');
      if (bouton) actions[bouton.dataset.action]?.();
    });
  }

  get ouvert() {
    return !this.panneau.hidden;
  }

  /** Ouvre le panneau. Un mot sélectionné dans le document devient la recherche. */
  ouvrir() {
    const selection = document.getSelection();
    const plage = selection?.rangeCount ? selection.getRangeAt(0) : null;
    if (plage && !plage.collapsed && this.editeur.racine.contains(plage.commonAncestorContainer)) {
      const texte = plage.toString().replaceAll(INVISIBLE, '');
      if (texte.trim() && !texte.includes('\n') && texte.length <= 200) this.champ.value = texte;
    }
    this.panneau.hidden = false;
    this.bouton.setAttribute('aria-expanded', 'true');
    this.champ.focus();
    this.champ.select();
    this.chercher({ depuisLeCurseur: true });
  }

  /** Ferme le panneau ; le résultat actuel est sélectionné dans le document. */
  fermer() {
    if (!this.ouvert) return;
    const plage = this.plages[this.actuel];
    this.panneau.hidden = true;
    this.bouton.setAttribute('aria-expanded', 'false');
    clearTimeout(this.minuterie);
    this.effacerSurlignage();
    if (plage && estValide(plage, this.editeur.racine)) {
      this.editeur.focaliser();
      selectionner(vraiePlage(plage));
    } else {
      this.editeur.preparerSelection();
    }
  }

  /** À appeler quand le document change : les résultats sont recalculés. */
  planifier() {
    if (!this.ouvert) return;
    clearTimeout(this.minuterie);
    // Pas de défilement : la personne écrit ailleurs dans le document.
    this.minuterie = setTimeout(() => this.chercher({ defiler: false }), DELAI);
  }

  /**
   * Recalcule les résultats. Avec `depuisLeCurseur`, le résultat actuel est
   * le premier qui suit le curseur ; sinon, on garde le même numéro. Avec
   * `defiler`, la feuille défile jusqu'au résultat actuel.
   */
  chercher({ depuisLeCurseur = false, defiler = true } = {}) {
    clearTimeout(this.minuterie);
    if (this.rechercheEnAttente) depuisLeCurseur = true;
    this.rechercheEnAttente = false;
    this.plages = trouver(this.editeur.racine, this.champ.value);
    if (this.plages.length === 0) this.actuel = -1;
    else if (depuisLeCurseur || this.actuel < 0) this.actuel = this.premierApresLeCurseur();
    else this.actuel = Math.min(this.actuel, this.plages.length - 1);
    this.afficher({ defiler });
  }

  premierApresLeCurseur() {
    const curseur = this.editeur.memoire;
    if (!curseur || !this.editeur.racine.contains(curseur.startContainer)) return 0;
    return this.premierApres(curseur);
  }

  /** Numéro du premier résultat qui commence dans la plage `repere` ou après elle (en boucle). */
  premierApres(repere) {
    const i = this.plages.findIndex((p) => repere.comparePoint(p.startContainer, p.startOffset) >= 0);
    return i < 0 ? 0 : i;
  }

  /** Résultat suivant (sens = 1) ou précédent (sens = -1), en boucle. */
  aller(sens) {
    // Entrée juste après la frappe : on montre d'abord le premier résultat.
    if (this.rechercheEnAttente || this.plages.length === 0) {
      this.chercher();
      return;
    }
    const n = this.plages.length;
    this.actuel = (this.actuel + sens + n) % n;
    this.afficher();
  }

  remplacer() {
    this.chercher(); // résultats à jour (le document a pu changer)
    const plage = this.plages[this.actuel];
    if (!plage) return;
    const racine = this.editeur.racine;
    const texte = this.remplacement.value;
    const fin = positionDe(racine, plage.startContainer, plage.startOffset) + texte.length;
    this.editeur.remplacerTexte([plage], texte);
    this.plages = trouver(racine, this.champ.value);
    if (this.plages.length === 0) this.actuel = -1;
    else {
      // Résultat suivant : le premier APRÈS le texte inséré (qui peut lui-même
      // contenir la recherche, par exemple « paris » remplacé par « Paris »).
      const point = pointDe(racine, fin);
      const repere = document.createRange();
      repere.setStart(point.noeud, point.decalage);
      this.actuel = this.premierApres(repere);
    }
    this.afficher();
  }

  toutRemplacer() {
    this.chercher();
    const nombre = this.plages.length;
    if (nombre === 0) return;
    this.editeur.remplacerTexte(this.plages, this.remplacement.value);
    this.chercher();
    this.informer(`${formatNombre.format(nombre)} ${nombre > 1 ? 'remplacements effectués' : 'remplacement effectué'}. « Annuler » permet de revenir en arrière.`);
  }

  // --- Affichage ----------------------------------------------------------------

  afficher({ defiler = true } = {}) {
    const n = this.plages.length;
    if (!this.champ.value) this.resultat.textContent = '';
    else if (n === 0) this.resultat.textContent = 'Aucun résultat';
    else {
      const total = n >= MAX_RESULTATS ? `plus de ${formatNombre.format(MAX_RESULTATS)}` : formatNombre.format(n);
      this.resultat.textContent = `${formatNombre.format(this.actuel + 1)} sur ${total}`;
    }
    this.resultat.dataset.vide = String(Boolean(this.champ.value) && n === 0);
    this.surligner();
    const plage = this.plages[this.actuel];
    if (plage && defiler) this.montrer(plage);
  }

  surligner() {
    if (!surlignagePossible) return;
    const actuelle = this.plages[this.actuel];
    CSS.highlights.set('recherche', new Highlight(...this.plages.filter((p) => p !== actuelle)));
    if (actuelle) CSS.highlights.set('recherche-actuelle', new Highlight(actuelle));
    else CSS.highlights.delete('recherche-actuelle');
  }

  effacerSurlignage() {
    if (!surlignagePossible) return;
    CSS.highlights.delete('recherche');
    CSS.highlights.delete('recherche-actuelle');
  }

  /** Fait défiler la feuille pour que le résultat soit visible. */
  montrer(plage) {
    if (!estValide(plage, this.editeur.racine)) return;
    const rect = vraiePlage(plage).getBoundingClientRect();
    const zone = this.zone.getBoundingClientRect();
    if (rect.height === 0 && rect.top === 0) return;
    if (rect.top < zone.top + 16 || rect.bottom > zone.bottom - 16) {
      this.zone.scrollBy({ top: rect.top - zone.top - zone.height / 3 });
    }
  }
}
