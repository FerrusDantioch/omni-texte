// L'éditeur : la feuille (élément contenteditable) et toutes les commandes
// de mise en forme, l'historique, le collage et le compteur de mots.
//
// Rappel des pièges traités ici :
// - toute la mise en forme est faite à la main (mise-en-forme.js,
//   paragraphes.js) : document.execCommand ne sert plus qu'à insérer et
//   supprimer du texte (collage, couper) ;
// - l'annulation du navigateur est remplacée par notre historique ;
// - le collage insère toujours du texte brut ;
// - quand une commande est lancée depuis un menu, on restaure d'abord la
//   sélection mémorisée.

import {
  INVISIBLE, blocDe, blocsDe, couperAuxBornes, ecrirePositions, estBloc, lirePositions,
  parcourir, plageDans, positionDe, selectionner, textesDe, avecSelectionConservee,
} from './selection.js';
import {
  styler, effacerFormat, barrer, estBarre, aLeFormat, appliquerFormat, insererSupportInvisible, nettoyerEnLigne,
  nettoyerStylesAjoutes, taillePt,
} from './mise-en-forme.js';
import {
  appliquerStyleParagraphe, basculerListe, aligner, espacer, copierReglagesBloc, reparerStructure, estSautDePage,
} from './paragraphes.js';
import { estSautDePage as estLigneSautDePage } from '../commun/saut-de-page.js';
import { contenuPropre } from './sanitize.js';
import { Historique } from './historique.js';
import { corrigerTypographie } from './typographie.js';
import { TAILLES, POLICES, policeDepuisCss, versHexa } from './palettes.js';

const DELAI_FRAPPE = 600; // ms sans frappe avant de créer une étape d'annulation
const FRAPPE_MAX = 4000; // au-delà, on crée une étape même si la frappe continue

export class Editeur {
  /**
   * @param {HTMLElement} racine  la feuille (contenteditable)
   * @param {object} rappels
   * @param {() => void} rappels.surModification  le contenu a changé
   * @param {(etat: object) => void} rappels.surEtat  la mise en forme sous le curseur a changé
   */
  constructor(racine, { surModification = () => {}, surEtat = () => {} } = {}) {
    this.racine = racine;
    this.surModification = surModification;
    this.surEtat = surEtat;
    this.memoire = null; // dernière sélection faite dans la feuille
    this.composition = false; // saisie en cours avec un clavier de téléphone
    this.debutFrappe = 0;
    this.minuterieFrappe = 0;
    this.minuterieMenage = 0;
    this.demandeEtat = 0;
    this.typographie = true; // typographie française automatique (voir typographie.js)
    this.collageEnCours = false;
    this.segmenteur = 'Segmenter' in Intl ? new Intl.Segmenter('fr', { granularity: 'grapheme' }) : null;

    this.historique = new Historique({
      lire: () => ({ html: racine.innerHTML, selection: lirePositions(racine) }),
      ecrire: (etat) => {
        racine.innerHTML = etat.html; // contenu produit par l'éditeur lui-même
        this.focaliser();
        ecrirePositions(racine, etat.selection ?? { debut: 1, fin: 1 });
      },
    });

    try {
      document.execCommand('defaultParagraphSeparator', false, 'p');
      document.execCommand('styleWithCSS', false, false);
    } catch {
      // Navigateur sans ces réglages : sans conséquence.
    }
    this.ecouter();
  }

  // --- Événements -----------------------------------------------------------

  ecouter() {
    const r = this.racine;
    r.addEventListener('beforeinput', (e) => this.avantSaisie(e));
    r.addEventListener('input', (e) => this.apresSaisie(e));
    r.addEventListener('keydown', (e) => this.touche(e));
    r.addEventListener('paste', (e) => this.surCollage(e));
    r.addEventListener('copy', (e) => this.surCopie(e, false));
    r.addEventListener('cut', (e) => this.surCopie(e, true));
    // Pas de glisser-déposer de texte mis en forme : seul le texte brut est accepté.
    r.addEventListener('dragstart', (e) => e.preventDefault());
    r.addEventListener('dragover', (e) => e.preventDefault());
    r.addEventListener('drop', (e) => this.surDepot(e));
    r.addEventListener('compositionstart', () => {
      this.composition = true;
    });
    r.addEventListener('compositionend', (e) => {
      this.composition = false;
      if (this.typographie && e.data) corrigerTypographie(this.racine, e.data.at(-1));
      this.reparer();
      this.planifierEtape();
    });
    document.addEventListener('selectionchange', () => this.surSelection());
  }

  avantSaisie(e) {
    const commandes = {
      historyUndo: () => this.annuler(),
      historyRedo: () => this.retablir(),
      formatBold: () => this.gras(),
      formatItalic: () => this.italique(),
      formatUnderline: () => this.souligne(),
      formatStrikeThrough: () => this.barre(),
    };
    if (commandes[e.inputType]) {
      e.preventDefault();
      commandes[e.inputType]();
      return;
    }
    // Collage ou dépôt qui n'est pas passé par l'événement « paste ».
    if (e.inputType.startsWith('insertFrom') && e.dataTransfer && e.cancelable) {
      e.preventDefault();
      this.collerTexte(e.dataTransfer.getData('text/plain'));
      return;
    }
    // Retour arrière au début d'un paragraphe, ou Suppr à la fin : on fusionne
    // nous-mêmes les deux paragraphes (Chrome ajouterait des styles parasites).
    if (e.cancelable && !this.composition && (e.inputType === 'deleteContentBackward' || e.inputType === 'deleteContentForward')) {
      if (this.fusionnerParagraphes(e.inputType === 'deleteContentBackward' ? 'arriere' : 'avant')) {
        e.preventDefault();
        return;
      }
    }
    // Début d'une frappe : on note où était le curseur, pour l'annulation.
    if (!this.debutFrappe) this.historique.noterSelection();
  }

  apresSaisie(e) {
    if (this.typographie && !this.composition && !this.collageEnCours && e.inputType === 'insertText' && e.data) {
      corrigerTypographie(this.racine, e.data.at(-1));
    }
    if (!this.composition && (e.inputType !== 'insertText' || !this.racine.firstElementChild)) this.reparer();
    this.planifierEtape();
    this.surModification();
    this.planifierEtat();
    this.majIndicationVide();
  }

  touche(e) {
    if (!(e.ctrlKey || e.metaKey) || e.altKey || e.isComposing) return;
    // Ctrl+Entrée : saut de page (le même raccourci que Word et LibreOffice).
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      this.insererSautDePage();
      return;
    }
    const actions = { b: () => this.gras(), i: () => this.italique(), u: () => this.souligne() };
    const action = actions[e.key.toLowerCase()];
    if (action && !e.shiftKey) {
      e.preventDefault();
      action();
    }
  }

  surSelection() {
    const plage = plageDans(this.racine);
    if (!plage) return;
    this.memoire = plage.cloneRange();
    this.planifierEtat();
    clearTimeout(this.minuterieMenage);
    this.minuterieMenage = setTimeout(() => this.menageInvisibles(), 300);
  }

  // --- Chargement et lecture du contenu -------------------------------------

  /** Affiche un document (le contenu est d'abord nettoyé). */
  charger(html) {
    clearTimeout(this.minuterieFrappe);
    this.debutFrappe = 0;
    const propre = contenuPropre(html);
    // Les blocs passent par un fragment : les donner un par un à
    // replaceChildren(...) dépasserait la limite du navigateur au-delà
    // d'environ 100 000 paragraphes.
    const fragment = document.createDocumentFragment();
    while (propre.firstChild) fragment.appendChild(propre.firstChild);
    this.racine.replaceChildren(fragment);
    this.memoire = null;
    this.historique.reinitialiser();
    this.majIndicationVide();
    this.planifierEtat(true);
  }

  /** Code HTML du document, sans caractère invisible, prêt à enregistrer. */
  html() {
    const copie = this.racine.cloneNode(true);
    const marcheur = document.createTreeWalker(copie, NodeFilter.SHOW_TEXT);
    for (let n = marcheur.nextNode(); n; n = marcheur.nextNode()) {
      if (n.data.includes(INVISIBLE)) n.data = n.data.replaceAll(INVISIBLE, '');
    }
    for (const bloc of copie.querySelectorAll('p, h1, h2, h3, li')) nettoyerEnLigne(bloc);
    reparerStructure(copie);
    return copie.innerHTML;
  }

  /** Texte brut du document (un saut de ligne entre deux blocs). */
  texte() {
    let texte = '';
    let premier = true;
    for (const n of parcourir(this.racine)) {
      if (n.nodeType === 3) texte += n.data;
      else if (n.nodeName === 'BR') texte += '\n';
      else if (estBloc(n)) {
        if (!premier) texte += '\n';
        premier = false;
      }
    }
    return texte.replaceAll(INVISIBLE, '');
  }

  /** Nombre de mots et de caractères (espaces compris, sans les sauts de ligne). */
  compter() {
    const texte = this.texte();
    const mots = texte.split(/\s+/).filter((m) => /[\p{L}\p{N}]/u.test(m)).length;
    const sansSauts = texte.replace(/\n/g, '');
    // Un emoji composé ou une lettre accentuée décomposée compte pour un seul caractère.
    const caracteres = this.segmenteur ? [...this.segmenteur.segment(sansSauts)].length : [...sansSauts].length;
    return { mots, caracteres };
  }

  activer(actif) {
    this.racine.setAttribute('contenteditable', actif ? 'true' : 'false');
  }

  focaliser() {
    if (document.activeElement !== this.racine) this.racine.focus({ preventScroll: true });
  }

  // --- Exécution d'une commande ---------------------------------------------

  /**
   * Exécute une modification : restaure la sélection, applique l'action,
   * répare la structure, puis enregistre une étape d'annulation.
   */
  executer(action) {
    this.validerFrappe();
    const plage = this.preparerSelection();
    if (!plage) return false;
    this.historique.noterSelection();
    const avant = this.racine.innerHTML;
    action(plage);
    this.reparer();
    const change = this.racine.innerHTML !== avant;
    if (change) {
      this.historique.enregistrer();
      this.surModification();
    }
    this.majIndicationVide();
    this.planifierEtat(true);
    return change;
  }

  /** Remet le focus dans la feuille avec la dernière sélection connue. */
  preparerSelection() {
    const actuelle = plageDans(this.racine);
    if (actuelle && document.activeElement === this.racine) return actuelle;
    this.focaliser();
    const m = this.memoire;
    if (m && this.racine.contains(m.startContainer) && this.racine.contains(m.endContainer)) {
      selectionner(m.cloneRange());
    } else {
      const plage = document.createRange();
      plage.setStart(this.racine.firstElementChild ?? this.racine, 0);
      selectionner(plage);
    }
    return plageDans(this.racine);
  }

  /** Répare la structure et retire les styles parasites, sans perdre la sélection. */
  reparer() {
    return avecSelectionConservee(this.racine, () => {
      const structure = reparerStructure(this.racine);
      const styles = nettoyerStylesAjoutes(this.racine);
      return structure || styles;
    });
  }

  // --- Commandes : caractères -----------------------------------------------

  gras() {
    this.basculerFormat('gras');
  }

  italique() {
    this.basculerFormat('italique');
  }

  souligne() {
    this.basculerFormat('souligne');
  }

  /** Gras, italique ou souligné : retiré si tout le texte l'a déjà, sinon ajouté. */
  basculerFormat(nom) {
    this.surTextes((textes) => {
      const activer = !textes.every((t) => aLeFormat(t, nom, this.racine));
      for (const texte of textes) appliquerFormat(texte, nom, activer, this.racine);
    });
  }

  /** Barré : fait à la main, car les navigateurs le traitent différemment. */
  barre() {
    this.surTextes((textes) => {
      const activer = !textes.every((t) => estBarre(t, this.racine));
      for (const texte of textes) barrer(texte, activer, this.racine);
    });
  }

  /** Taille en points (nombre). */
  taille(points) {
    this.styleEnLigne('font-size', `${points}pt`);
  }

  /** A+ (sens = 1) ou A− (sens = -1) : passe à la taille voisine de la liste. */
  tailleVoisine(sens) {
    const voisine = (actuelle) =>
      sens > 0
        ? (TAILLES.find((t) => t > actuelle + 0.01) ?? TAILLES.at(-1))
        : ([...TAILLES].reverse().find((t) => t < actuelle - 0.01) ?? TAILLES[0]);
    this.styleEnLigne('font-size', (texte) => `${voisine(taillePt(texte.parentNode))}pt`);
  }

  /** Police : 'literata', 'sans' ou 'machine'. */
  police(id) {
    const police = POLICES.find((p) => p.id === id) ?? POLICES[0];
    this.styleEnLigne('font-family', police.pile);
  }

  /** Couleur du texte (« #e5484d ») ou null pour « Automatique ». */
  couleur(valeur) {
    this.styleEnLigne('color', valeur);
  }

  /** Couleur de surlignage ou null pour « Aucun ». */
  surlignage(valeur) {
    this.styleEnLigne('background-color', valeur);
  }

  styleEnLigne(propriete, valeur) {
    this.surTextes((textes) => {
      for (const texte of textes) styler(texte, propriete, valeur, this.racine);
    });
  }

  effacerMiseEnForme() {
    this.surTextes((textes) => {
      for (const texte of textes) effacerFormat(texte, this.racine);
    });
  }

  /**
   * Applique `traiter` aux morceaux de texte sélectionnés. Sans sélection,
   * un caractère invisible est inséré au curseur : la mise en forme lui est
   * appliquée, et le texte tapé ensuite la reprend.
   */
  surTextes(traiter) {
    this.executer((plage) => {
      const racine = this.racine;
      const positions = lirePositions(racine);
      let textes;
      if (plage.collapsed) {
        const { texte, ajoute } = insererSupportInvisible(plage);
        textes = [texte];
        const p = positions.debut + (ajoute ? 1 : 0);
        positions.debut = p;
        positions.fin = p;
      } else {
        couperAuxBornes(plage);
        textes = textesDe(plage);
      }
      const blocs = new Set(textes.map((t) => blocDe(t, racine) ?? racine));
      traiter(textes);
      for (const bloc of blocs) nettoyerEnLigne(bloc);
      ecrirePositions(racine, positions);
    });
  }

  // --- Commandes : paragraphes ----------------------------------------------

  /** Style de paragraphe : 'p', 'h1', 'h2' ou 'h3'. */
  styleParagraphe(balise) {
    this.surBlocs((blocs) => appliquerStyleParagraphe(blocs, balise));
  }

  /** Alignement : 'left', 'center', 'right' ou 'justify'. */
  alignement(valeur) {
    this.surBlocs((blocs) => aligner(blocs, valeur));
  }

  /** Interligne : '1.15' (simple), '2' (double) ou null (1,5, par défaut). */
  interligne(valeur) {
    this.surBlocs((blocs) => espacer(blocs, valeur));
  }

  /** Liste : 'UL' (puces) ou 'OL' (numérotée). */
  liste(type) {
    this.surBlocs((blocs) => basculerListe(blocs, type));
  }

  surBlocs(action) {
    this.executer((plage) => {
      const positions = lirePositions(this.racine);
      action(blocsDe(plage, this.racine));
      ecrirePositions(this.racine, positions);
    });
  }

  // --- Commande : saut de page ----------------------------------------------

  /**
   * Insère un saut de page au curseur. Le paragraphe est coupé en deux à cet
   * endroit (une liste aussi), le saut de page se place entre les deux
   * morceaux, et le curseur va au début de la nouvelle page. Une sélection
   * est d'abord effacée, comme quand on tape du texte.
   */
  insererSautDePage() {
    this.executer((plage) => {
      const racine = this.racine;
      if (!plage.collapsed) document.execCommand('delete');
      const curseur = plageDans(racine);
      if (!curseur) return;
      const saut = document.createElement('hr');
      const bloc = blocDe(curseur.startContainer, racine);
      if (!bloc) {
        // Curseur posé entre deux blocs (par exemple entre deux sauts de page).
        curseur.insertNode(saut);
        placerCurseurApres(saut, racine);
        return;
      }
      // Ce qui suit le curseur part dans un nouveau bloc du même genre.
      const fin = document.createRange();
      fin.setStart(curseur.startContainer, curseur.startOffset);
      fin.setEnd(bloc, bloc.childNodes.length);
      const suite = document.createElement(bloc.nodeName.toLowerCase());
      copierReglagesBloc(bloc, suite);
      suite.appendChild(fin.extractContents());

      const liste = bloc.nodeName === 'LI' ? bloc.parentNode : null;
      const haut = liste ?? bloc; // l'élément placé directement dans la feuille
      // Dans une liste, les éléments suivants forment une seconde liste,
      // après le saut de page.
      let apres = suite;
      if (liste) {
        apres = document.createElement(liste.nodeName.toLowerCase());
        apres.appendChild(suite);
        while (bloc.nextSibling) apres.appendChild(bloc.nextSibling);
      }
      haut.after(saut);
      saut.after(apres);

      // Pas de bloc vide inutile : un saut de page au tout début d'un
      // paragraphe ne laisse pas de paragraphe vide avant lui, et à la fin, le
      // curseur va au paragraphe suivant s'il existe déjà.
      if (estBlocVide(bloc)) {
        bloc.remove();
        if (liste && !liste.firstElementChild) liste.remove();
      }
      if (estBlocVide(suite) && (suite.nextElementSibling || apres.nextElementSibling)) {
        suite.remove();
        if (liste && !apres.firstElementChild) apres.remove();
      } else if (estBlocVide(suite) && suite.nodeName !== 'P') {
        // Rien après le saut de page : on continue en texte normal (pas en
        // titre, ni dans une liste), comme avec Entrée après un titre.
        const p = document.createElement('p');
        p.appendChild(document.createElement('br'));
        apres.replaceWith(p);
      }
      placerCurseurApres(saut, racine);
    });
  }

  /**
   * Fusionne le paragraphe courant avec le précédent (« arriere ») ou le
   * suivant (« avant »), comme un traitement de texte classique : le texte
   * rejoint le paragraphe du dessus et en prend le style. Un paragraphe vide
   * est simplement supprimé. Renvoie false si le cas n'est pas concerné (le
   * navigateur s'en occupe alors).
   */
  fusionnerParagraphes(sens) {
    const plage = plageDans(this.racine);
    if (!plage || !plage.collapsed) return false;
    const bloc = blocDe(plage.startContainer, this.racine);
    if (this.effacerSautDePageVoisin(plage, bloc, sens)) return true;
    if (!bloc || bloc.nodeName === 'LI' || bloc.parentNode !== this.racine) return false;
    const voisin = sens === 'arriere' ? bloc.previousElementSibling : bloc.nextElementSibling;
    if (!voisin || !/^(P|H[123])$/.test(voisin.nodeName)) return false;
    if (sens === 'arriere' ? !estAuDebut(plage, bloc) : !estALaFin(plage, bloc)) return false;
    const [haut, bas] = sens === 'arriere' ? [voisin, bloc] : [bloc, voisin];
    this.executer(() => {
      const racine = this.racine;
      if (estBlocVide(haut)) {
        haut.remove();
        placerCurseur(premierTexte(bas) ?? bas, 0);
        return;
      }
      if (estBlocVide(bas)) {
        bas.remove();
        const dernier = dernierTexte(haut);
        placerCurseur(dernier ?? haut, dernier ? dernier.length : 0);
        return;
      }
      if (haut.lastChild?.nodeName === 'BR') haut.lastChild.remove(); // saut de ligne réservé
      const jonction = haut.childNodes.length;
      while (bas.firstChild) haut.appendChild(bas.firstChild);
      bas.remove();
      const position = positionDe(racine, haut, jonction);
      nettoyerEnLigne(haut);
      ecrirePositions(racine, { debut: position, fin: position });
    });
    return true;
  }

  /**
   * Retour arrière au début du bloc qui suit un saut de page (ou Suppr à la
   * fin du bloc qui le précède) : le saut de page est effacé d'un coup.
   * « Annuler » le fait revenir. Renvoie false si aucun saut de page n'est
   * concerné.
   */
  effacerSautDePageVoisin(plage, bloc, sens) {
    if (!bloc) return false;
    let haut = bloc;
    if (bloc.nodeName === 'LI') {
      // Seulement depuis le premier élément d'une liste (ou le dernier, pour Suppr).
      if (sens === 'arriere' ? bloc.previousElementSibling : bloc.nextElementSibling) return false;
      haut = bloc.parentNode;
    }
    if (haut.parentNode !== this.racine) return false;
    const voisin = sens === 'arriere' ? haut.previousElementSibling : haut.nextElementSibling;
    if (!estSautDePage(voisin)) return false;
    if (sens === 'arriere' ? !estAuDebut(plage, bloc) : !estALaFin(plage, bloc)) return false;
    this.executer(() => voisin.remove());
    return true;
  }

  // --- Historique -------------------------------------------------------------

  annuler() {
    this.validerFrappe();
    if (this.historique.annuler()) this.apresHistorique();
  }

  retablir() {
    this.validerFrappe();
    if (this.historique.retablir()) this.apresHistorique();
  }

  apresHistorique() {
    this.memoire = null;
    this.surModification();
    this.majIndicationVide();
    this.planifierEtat(true);
  }

  /** Une étape d'annulation est créée après une courte pause dans la frappe. */
  planifierEtape() {
    const maintenant = Date.now();
    if (!this.debutFrappe) this.debutFrappe = maintenant;
    clearTimeout(this.minuterieFrappe);
    const delai = maintenant - this.debutFrappe >= FRAPPE_MAX ? 0 : DELAI_FRAPPE;
    this.minuterieFrappe = setTimeout(() => this.validerFrappe(), delai);
  }

  /** Enregistre tout de suite la frappe en attente comme étape d'annulation. */
  validerFrappe() {
    clearTimeout(this.minuterieFrappe);
    if (!this.debutFrappe) return;
    if (this.composition) {
      this.minuterieFrappe = setTimeout(() => this.validerFrappe(), DELAI_FRAPPE);
      return;
    }
    this.debutFrappe = 0;
    if (this.historique.enregistrer()) this.planifierEtat();
  }

  // --- Remplacement (rechercher et remplacer) ---------------------------------

  /**
   * Remplace le texte de plusieurs plages (résultats d'une recherche) par
   * `texte`, en une seule étape d'annulation. Chaque plage commence et finit
   * dans un nœud de texte d'un même bloc. Le texte de remplacement prend la
   * mise en forme du début du passage remplacé. Le focus ne bouge pas (il
   * reste dans le panneau de recherche).
   */
  remplacerTexte(plages, texte) {
    if (plages.length === 0) return false;
    this.validerFrappe();
    const racine = this.racine;
    const premiere = plages[0];
    const debut = positionDe(racine, premiere.startContainer, premiere.startOffset);
    this.historique.noterSelection({ debut, fin: positionDe(racine, premiere.endContainer, premiere.endOffset) });
    const blocs = new Set();
    // De la dernière à la première : les positions des plages précédentes
    // ne bougent pas pendant le remplacement.
    for (const plage of [...plages].reverse()) {
      const bloc = blocDe(plage.startContainer, racine) ?? racine;
      blocs.add(bloc);
      remplacerPlage(plage, texte, bloc);
    }
    for (const bloc of blocs) if (bloc.isConnected) nettoyerEnLigne(bloc);
    reparerStructure(racine);
    nettoyerStylesAjoutes(racine);
    const apres = debut + texte.length;
    this.historique.enregistrer({ debut: apres, fin: apres });
    this.memoire = null;
    this.surModification();
    this.majIndicationVide();
    this.planifierEtat(true);
    return true;
  }

  // --- Collage, copie, dépôt ----------------------------------------------------

  surCollage(e) {
    e.preventDefault();
    const texte = e.clipboardData?.getData('text/plain') ?? '';
    if (texte) this.collerTexte(texte);
  }

  /** Insère du texte brut ; chaque retour à la ligne crée un paragraphe. */
  collerTexte(texte) {
    if (!texte) return;
    const lignes = texte.replace(/\r\n?/g, '\n').replaceAll(INVISIBLE, '').split('\n');
    // Un texte collé est inséré tel quel (pas de typographie automatique).
    this.collageEnCours = true;
    try {
      this.executer((plage) => {
        if (!plage.collapsed) document.execCommand('delete');
        if (lignes[0]) document.execCommand('insertText', false, lignes[0]);
        if (lignes.length > 1) insererLignes(this.racine, lignes.slice(1));
        // Un repère « ──── Saut de page ──── » collé (venant d'Omni-Romancier
        // ou d'un fichier .txt exporté) redevient un vrai saut de page.
        if (lignes.some(estLigneSautDePage)) convertirReperesColles(this.racine);
      });
    } finally {
      this.collageEnCours = false;
    }
  }

  surCopie(e, couper) {
    const plage = plageDans(this.racine);
    if (!plage || plage.collapsed || !e.clipboardData) return;
    e.preventDefault();
    const conteneur = document.createElement('div');
    conteneur.appendChild(plage.cloneContents());
    const marcheur = document.createTreeWalker(conteneur, NodeFilter.SHOW_TEXT);
    for (let n = marcheur.nextNode(); n; n = marcheur.nextNode()) n.data = n.data.replaceAll(INVISIBLE, '');
    e.clipboardData.setData('text/html', conteneur.innerHTML);
    e.clipboardData.setData('text/plain', document.getSelection().toString().replaceAll(INVISIBLE, ''));
    if (couper) this.executer(() => document.execCommand('delete'));
  }

  surDepot(e) {
    e.preventDefault();
    const texte = e.dataTransfer?.getData('text/plain');
    if (!texte) return;
    const point = pointSousLePointeur(e.clientX, e.clientY);
    if (point && this.racine.contains(point.noeud)) {
      this.focaliser();
      const plage = document.createRange();
      plage.setStart(point.noeud, point.decalage);
      selectionner(plage);
    }
    this.collerTexte(texte);
  }

  // --- Ménage des caractères invisibles -------------------------------------

  /**
   * Retire les caractères invisibles devenus inutiles (le curseur est parti
   * ailleurs sans rien taper). Ne crée pas d'étape d'annulation.
   */
  menageInvisibles() {
    if (this.composition) return;
    const selection = document.getSelection();
    const proteges = new Set([selection.anchorNode, selection.focusNode]);
    const aNettoyer = [];
    const marcheur = document.createTreeWalker(this.racine, NodeFilter.SHOW_TEXT);
    for (let n = marcheur.nextNode(); n; n = marcheur.nextNode()) {
      if (n.data.includes(INVISIBLE) && !proteges.has(n) && !proteges.has(n.parentNode)) aNettoyer.push(n);
    }
    if (aNettoyer.length === 0) return;
    // Une frappe en attente devient d'abord une étape d'annulation : le ménage
    // ne doit pas se mélanger avec elle.
    this.validerFrappe();
    avecSelectionConservee(this.racine, () => {
      for (const n of aNettoyer) {
        n.data = n.data.replaceAll(INVISIBLE, '');
        let parent = n.parentNode;
        if (n.length > 0) continue;
        n.remove();
        while (parent !== this.racine && !estBloc(parent) && !parent.firstChild) {
          const suivant = parent.parentNode;
          parent.remove();
          parent = suivant;
        }
      }
      reparerStructure(this.racine);
      return true;
    });
    this.historique.remplacerCourant();
    this.majIndicationVide();
  }

  // --- État de la mise en forme (pour la barre d'outils) --------------------

  planifierEtat(immediat = false) {
    cancelAnimationFrame(this.demandeEtat);
    if (immediat) this.surEtat(this.etat());
    else this.demandeEtat = requestAnimationFrame(() => this.surEtat(this.etat()));
  }

  etat() {
    const base = { peutAnnuler: this.historique.peutAnnuler, peutRetablir: this.historique.peutRetablir };
    const enDirect = plageDans(this.racine);
    const m = this.memoire;
    const plage = enDirect ?? (m && this.racine.contains(m.startContainer) ? m : null);
    if (!plage) return { ...base, actif: false };

    const textes = plage.collapsed ? [] : textesDe(plage);
    const element = elementDeReference(plage, textes);
    const styles = getComputedStyle(element);
    let taille = taillePt(element);
    if (textes.length > 1) {
      const tailles = new Set(textes.slice(0, 400).map((t) => taillePt(t.parentNode)));
      if (tailles.size > 1) taille = null; // tailles mélangées
    }
    const bloc = blocDe(element, this.racine);
    return {
      ...base,
      actif: true,
      gras: aLeFormat(element, 'gras', this.racine),
      italique: aLeFormat(element, 'italique', this.racine),
      souligne: aLeFormat(element, 'souligne', this.racine),
      barre: Boolean(element.closest('s, strike')) && this.racine.contains(element.closest('s, strike')),
      taille,
      police: (policeDepuisCss(styles.fontFamily) ?? POLICES[0]).id,
      couleur: styleExplicite(element, bloc, 'color'),
      surlignage: styleExplicite(element, bloc, 'background-color'),
      style: bloc && /^H[123]$/.test(bloc.nodeName) ? bloc.nodeName.toLowerCase() : 'p',
      alignement: nomAlignement(bloc ? getComputedStyle(bloc).textAlign : 'left'),
      interligne: bloc?.style.lineHeight || null,
      liste: bloc?.nodeName === 'LI' ? bloc.parentNode.nodeName : null,
    };
  }

  /** Affiche l'indication « Commence à écrire ici… » si le document est vide. */
  majIndicationVide() {
    const r = this.racine;
    const vide = r.children.length === 1 && r.firstElementChild.nodeName === 'P' && r.textContent === '';
    r.toggleAttribute('data-vide', vide);
  }
}

// --- Fonctions utilitaires -------------------------------------------------

/** Insère les lignes suivantes d'un collage, chacune dans un nouveau bloc. */
function insererLignes(racine, lignes) {
  const plage = plageDans(racine);
  const bloc = plage && blocDe(plage.startContainer, racine);
  if (!bloc) {
    document.execCommand('insertText', false, '\n' + lignes.join('\n'));
    return;
  }
  // La fin du bloc (après le curseur) part dans un nouveau bloc.
  const fin = document.createRange();
  fin.setStart(plage.startContainer, plage.startOffset);
  fin.setEnd(bloc, bloc.childNodes.length);
  const queue = fin.extractContents();
  const baliseMilieu = bloc.nodeName === 'LI' ? 'li' : 'p';
  let precedent = bloc;
  for (const ligne of lignes.slice(0, -1)) {
    const element = document.createElement(baliseMilieu);
    copierReglagesBloc(bloc, element);
    if (ligne) element.textContent = ligne;
    else element.appendChild(document.createElement('br'));
    precedent.after(element);
    precedent = element;
  }
  const dernier = document.createElement(bloc.nodeName.toLowerCase());
  copierReglagesBloc(bloc, dernier);
  const texteFinal = document.createTextNode(lignes.at(-1));
  dernier.append(texteFinal, queue);
  precedent.after(dernier);
  const curseur = document.createRange();
  curseur.setStart(texteFinal, texteFinal.length);
  selectionner(curseur);
}

/**
 * Remplace le contenu d'une plage (bornée par des nœuds de texte d'un même
 * bloc) par un texte. La plage peut être figée (StaticRange).
 */
function remplacerPlage(plage, texte, bloc) {
  const { startContainer: a, startOffset: da, endContainer: b, endOffset: db } = plage;
  if (a === b) {
    a.replaceData(da, db - da, texte);
    return;
  }
  // Les nœuds de texte situés entre les deux bornes sont vidés.
  const entre = [];
  const marcheur = document.createTreeWalker(bloc, NodeFilter.SHOW_TEXT);
  marcheur.currentNode = a;
  for (let n = marcheur.nextNode(); n && n !== b; n = marcheur.nextNode()) entre.push(n);
  a.replaceData(da, a.length - da, texte);
  for (const n of entre) n.data = '';
  b.deleteData(0, db);
}

/** Vrai si rien de visible ne précède le curseur dans le bloc. */
function estAuDebut(plage, bloc) {
  const avant = document.createRange();
  avant.setStart(bloc, 0);
  avant.setEnd(plage.startContainer, plage.startOffset);
  return avant.toString().replaceAll(INVISIBLE, '') === '' && !avant.cloneContents().querySelector('br');
}

/** Vrai si rien de visible ne suit le curseur dans le bloc. */
function estALaFin(plage, bloc) {
  const apres = document.createRange();
  apres.setStart(plage.startContainer, plage.startOffset);
  apres.setEnd(bloc, bloc.childNodes.length);
  if (apres.toString().replaceAll(INVISIBLE, '') !== '') return false;
  // Seul un <br> final (qui ne crée pas de ligne) est toléré.
  const sauts = apres.cloneContents().querySelectorAll('br');
  return sauts.length === 0 || (sauts.length === 1 && bloc.lastChild?.nodeName === 'BR');
}

function estBlocVide(bloc) {
  return bloc.textContent.replaceAll(INVISIBLE, '') === '' && bloc.querySelectorAll('br').length <= 1;
}

function premierTexte(element) {
  return document.createTreeWalker(element, NodeFilter.SHOW_TEXT).nextNode();
}

function dernierTexte(element) {
  const marcheur = document.createTreeWalker(element, NodeFilter.SHOW_TEXT);
  let dernier = null;
  for (let n = marcheur.nextNode(); n; n = marcheur.nextNode()) dernier = n;
  return dernier;
}

/** Les paragraphes qui ne contiennent que le repère texte deviennent des sauts de page. */
function convertirReperesColles(racine) {
  for (const p of [...racine.children]) {
    if (p.nodeName === 'P' && estLigneSautDePage(p.textContent.replaceAll(INVISIBLE, ''))) {
      const saut = document.createElement('hr');
      p.replaceWith(saut);
      if (!saut.nextElementSibling) placerCurseurApres(saut, racine);
    }
  }
}

/** Place le curseur au début du bloc qui suit un saut de page (créé s'il manque). */
function placerCurseurApres(saut, racine) {
  let suivant = saut.nextElementSibling;
  if (!suivant || estSautDePage(suivant)) {
    suivant = document.createElement('p');
    suivant.appendChild(document.createElement('br'));
    saut.after(suivant);
  }
  const bloc = suivant.nodeName === 'UL' || suivant.nodeName === 'OL' ? suivant.firstElementChild : suivant;
  placerCurseur(premierTexte(bloc) ?? bloc, 0);
}

function placerCurseur(noeud, decalage) {
  const plage = document.createRange();
  plage.setStart(noeud, decalage);
  selectionner(plage);
}

function pointSousLePointeur(x, y) {
  if (document.caretPositionFromPoint) {
    const p = document.caretPositionFromPoint(x, y);
    return p && { noeud: p.offsetNode, decalage: p.offset };
  }
  if (document.caretRangeFromPoint) {
    const r = document.caretRangeFromPoint(x, y);
    return r && { noeud: r.startContainer, decalage: r.startOffset };
  }
  return null;
}

/** Élément dont on lit la mise en forme pour une sélection donnée. */
function elementDeReference(plage, textes) {
  if (textes.length) return textes[0].parentNode;
  const n = plage.startContainer;
  if (n.nodeType === 3) return n.parentNode;
  return n;
}

/** Valeur choisie explicitement (hexadécimal) pour une propriété, ou null. */
function styleExplicite(element, bloc, propriete) {
  for (let n = element; n && n !== bloc?.parentNode; n = n.parentNode) {
    const valeur = n.style?.getPropertyValue(propriete);
    if (valeur) return versHexa(valeur);
  }
  return null;
}

function nomAlignement(valeur) {
  if (valeur === 'center' || valeur === '-webkit-center') return 'center';
  if (valeur === 'right' || valeur === 'end' || valeur === '-webkit-right') return 'right';
  if (valeur === 'justify') return 'justify';
  return 'left';
}
