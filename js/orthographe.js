// Correcteur orthographique de la feuille (le moteur, la bulle et le
// dictionnaire personnel sont dans le dossier correcteur/, commun avec
// Omni-Romancier).
//
// - Les mots inconnus sont soulignés SANS modifier le document : on utilise
//   l'API « CSS Custom Highlight » (comme les résultats de la recherche).
//   L'annulation, l'enregistrement et les exports ne voient donc rien.
//   Si le navigateur ne connaît pas cette API, le correcteur du navigateur
//   reste utilisé, comme avant.
// - La vérification a lieu une demi-seconde après la dernière frappe, en
//   arrière-plan (travailleur du correcteur) : l'écriture ne ralentit pas.
// - Le mot en train d'être tapé n'est pas souligné tant que le curseur y est.
// - Toucher un mot souligné ouvre la bulle de suggestions.

import { creerCorrecteur } from '../correcteur/correcteur.js';
import { ouvrirBulle, fermerBulle, replacerBulle } from '../correcteur/bulle.js';
import { afficherDictionnaire } from '../correcteur/liste.js';
import { indexerBloc, pointDuTexte } from './recherche.js';
import { BALISES_BLOC, INVISIBLE, plageDans, positionDe, ecrirePositions } from './selection.js';

const DELAI = 500; // ms sans frappe avant de vérifier
const MAX_FAUTES = 5000; // au-delà, les suivantes ne sont pas soulignées (texte d'une autre langue…)
const NOM = 'correcteur-faute'; // nom du surlignage (voir correcteur/correcteur.css)

export const correctionPossible = typeof CSS !== 'undefined' && 'highlights' in CSS && typeof Highlight === 'function';

export class Orthographe {
  /**
   * @param {object} options
   * @param {import('./editor.js').Editeur} options.editeur
   * @param {HTMLElement} options.zone  la zone qui défile autour de la feuille
   * @param {ReturnType<import('./storage.js').creerPreferences>} options.preferences
   */
  constructor({ editeur, zone, preferences }) {
    this.editeur = editeur;
    this.racine = editeur.racine;
    this.correcteur = creerCorrecteur({ stockage: preferences });
    this.plages = []; // les mots soulignés (plages « vivantes » : elles suivent les modifications)
    this.enCours = null; // le mot inconnu où se trouve le curseur (souligné quand le curseur en sort)
    this.version = 0; // augmente à chaque modification : un résultat en retard est ignoré
    this.minuterie = 0;
    this.frappe = false;
    this.surlignage = correctionPossible ? new Highlight() : null;
    if (this.surlignage) CSS.highlights.set(NOM, this.surlignage);

    this.correcteur.ecouter((raison) => {
      if (raison === 'actif') this.majCorrecteurNatif();
      if (raison !== 'erreur') this.planifier({ immediat: true });
    });
    this.racine.addEventListener('click', (e) => this.surClic(e));
    zone.addEventListener('scroll', () => replacerBulle(), { passive: true });
    document.addEventListener('selectionchange', () => this.surSelection());
    this.majCorrecteurNatif();
  }

  get actif() {
    return correctionPossible && this.correcteur.actif;
  }

  /** Notre correcteur remplace celui du navigateur (sinon : double soulignement). */
  majCorrecteurNatif() {
    this.racine.spellcheck = !this.actif;
  }

  /**
   * À appeler quand le document change. `frappe` : true si la modification
   * vient de l'écriture (le mot sous le curseur attend alors avant d'être
   * souligné), false sinon ; sans `frappe` (nouvelle vérification d'un texte
   * inchangé), on garde ce qui était connu.
   */
  planifier({ immediat = false, frappe } = {}) {
    clearTimeout(this.minuterie);
    this.version++;
    if (frappe !== undefined) this.frappe = frappe;
    if (!immediat) fermerBulle();
    this.minuterie = setTimeout(() => this.verifier(), immediat ? 0 : DELAI);
  }

  async verifier() {
    if (!this.actif) {
      this.effacer();
      return;
    }
    const version = this.version;
    // Tout le texte, un bloc par ligne, et de quoi retrouver chaque caractère dans la page
    const blocs = [];
    let texte = '';
    for (const bloc of this.racine.querySelectorAll([...BALISES_BLOC].join(','))) {
      const index = indexerBloc(bloc, false);
      if (!index.morceaux.length) continue;
      blocs.push({ debut: texte.length, fin: texte.length + index.texte.length, morceaux: index.morceaux });
      texte += index.texte + '\n';
    }
    let fautes;
    try {
      fautes = await this.correcteur.verifier(texte);
    } catch {
      return; // dictionnaire indisponible (ou correcteur relancé) : rien à souligner pour l'instant
    }
    if (version !== this.version) return; // le texte a changé entre-temps : une autre vérification est prévue

    const plages = [];
    let b = 0;
    for (const faute of fautes.slice(0, MAX_FAUTES)) {
      while (b < blocs.length && blocs[b].fin < faute.fin) b++;
      const bloc = blocs[b];
      if (!bloc || faute.debut < bloc.debut) continue;
      const debut = pointDuTexte(bloc.morceaux, faute.debut - bloc.debut);
      const fin = pointDuTexte(bloc.morceaux, faute.fin - bloc.debut - 1);
      const plage = document.createRange();
      plage.setStart(debut.noeud, debut.decalage);
      plage.setEnd(fin.noeud, fin.decalage + 1);
      plages.push(plage);
    }
    this.plages = plages;
    // Le mot que l'on est en train de taper (le curseur est juste à sa fin) : souligné plus tard
    this.enCours = null;
    const curseur = this.frappe && document.activeElement === this.racine ? plageDans(this.racine) : null;
    if (curseur?.collapsed) this.enCours = plages.find((p) => auBout(p, curseur)) ?? null;
    this.dessiner();
  }

  dessiner() {
    if (!this.surlignage) return;
    this.surlignage.clear();
    for (const p of this.plages) if (p !== this.enCours) this.surlignage.add(p);
  }

  effacer() {
    this.plages = [];
    this.enCours = null;
    this.surlignage?.clear();
    fermerBulle();
  }

  // Le curseur a quitté le mot en cours : il est souligné
  surSelection() {
    if (!this.enCours) return;
    const curseur = plageDans(this.racine);
    if (curseur && contient(this.enCours, curseur)) return;
    this.enCours = null;
    this.dessiner();
  }

  /** La faute sous le curseur (après un toucher ou un clic), sinon null. */
  fauteSousLeCurseur() {
    const curseur = plageDans(this.racine);
    if (!curseur?.collapsed) return null;
    return this.plages.find((p) => p !== this.enCours && !p.collapsed && contient(p, curseur)) ?? null;
  }

  surClic() {
    if (!this.actif) return;
    const plage = this.fauteSousLeCurseur();
    if (!plage) return;
    const mot = plage.toString().replaceAll(INVISIBLE, '');
    if (!mot) return;
    ouvrirBulle({
      position: () => (plage.collapsed || !this.racine.contains(plage.startContainer) ? null : plage.getClientRects()[0] ?? null),
      mot,
      suggestions: this.correcteur.suggerer(mot),
      remplacer: (correction) => this.remplacer(plage, mot, correction),
      ajouter: () => this.correcteur.ajouter(mot),
      ignorer: () => this.correcteur.ignorer(mot),
    });
  }

  /** Remplace le mot par la correction choisie (une étape d'annulation). */
  remplacer(plage, mot, correction) {
    if (plage.toString().replaceAll(INVISIBLE, '') !== mot) return; // le texte a changé entre-temps
    const debut = positionDe(this.racine, plage.startContainer, plage.startOffset);
    this.editeur.remplacerTexte([plage], correction);
    // Le curseur se place juste après le mot corrigé : on peut continuer à écrire
    this.editeur.focaliser();
    ecrirePositions(this.racine, { debut: debut + correction.length, fin: debut + correction.length });
    this.planifier({ immediat: true, frappe: false });
  }

  /** Remplit la fenêtre « Dictionnaire personnel ». Renvoie de quoi arrêter sa mise à jour. */
  afficherDictionnaire(conteneur) {
    return afficherDictionnaire(conteneur, this.correcteur, {
      bouton: 'bouton bouton-principal',
      boutonDiscret: 'bouton bouton-discret',
      champ: 'champ',
    });
  }
}

// Le curseur est-il juste à la fin de la plage ?
function auBout(plage, curseur) {
  try {
    return curseur.compareBoundaryPoints(Range.END_TO_END, plage) === 0;
  } catch {
    return false;
  }
}

// Le point (curseur) est-il dans la plage, bords compris ?
function contient(plage, point) {
  try {
    return plage.comparePoint(point.startContainer, point.startOffset) === 0;
  } catch {
    return false; // pas dans le même document (plage devenue invalide)
  }
}
