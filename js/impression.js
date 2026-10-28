// Export PDF par l'impression du navigateur (window.print).
// Le navigateur propose « Enregistrer au format PDF » : cela marche hors
// ligne, garde le texte sélectionnable et ne demande aucune bibliothèque.
// La mise en page d'impression est dans css/print.css.

import { ouvrirFenetre } from './ui.js';
import { INVISIBLE } from './selection.js';

/** Nom de fichier propre à partir du titre du document. */
export function nomDeFichier(titre) {
  const propre = String(titre ?? '')
    .replace(/[\\/:*?"<>|\u0000-\u001f]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 120);
  return propre || 'Sans titre';
}

export class ExportPdf {
  /**
   * @param {object} options
   * @param {object} options.preferences
   * @param {HTMLDialogElement} options.fenetreAide  aide affichée avant la première impression
   * @param {() => string} options.titre  titre du document ouvert
   * @param {() => Promise<unknown>} options.avant  à faire avant d'imprimer (enregistrer)
   * @param {HTMLElement} options.feuille  la feuille du document
   */
  constructor({ preferences, fenetreAide, titre, avant, feuille }) {
    this.preferences = preferences;
    this.fenetreAide = fenetreAide;
    this.titre = titre;
    this.avant = avant;
    this.feuille = feuille;
    this.titreOrigine = null;
    this.styleFin = null;
    // Aussi quand l'impression est lancée depuis le menu du navigateur.
    window.addEventListener('beforeprint', () => this.preparer());
    window.addEventListener('afterprint', () => this.terminer());
  }

  async exporter(declencheur) {
    await this.avant();
    if (!this.preferences.lire('aidePdfMasquee', false)) {
      const continuer = await this.montrerAide(declencheur);
      if (!continuer) return;
    }
    // Laisse le temps à la fenêtre d'aide de disparaître avant l'impression.
    setTimeout(() => {
      this.preparer();
      window.print();
      // Chrome sur ordinateur attend la fin de l'impression ; ailleurs,
      // « afterprint » remettra le titre en place.
    }, 60);
  }

  montrerAide(declencheur) {
    const fenetre = this.fenetreAide;
    const caseMasquer = fenetre.querySelector('input[type="checkbox"]');
    caseMasquer.checked = false;
    return new Promise((resoudre) => {
      fenetre.returnValue = '';
      fenetre.addEventListener(
        'close',
        () => {
          const continuer = fenetre.returnValue === 'continuer';
          if (continuer && caseMasquer.checked) this.preferences.ecrire('aidePdfMasquee', true);
          resoudre(continuer);
        },
        { once: true },
      );
      ouvrirFenetre(fenetre, { declencheur });
      fenetre.querySelector('[data-fermer="continuer"]').focus();
    });
  }

  /** Le navigateur nomme le fichier PDF d'après le titre de la page. */
  preparer() {
    if (this.titreOrigine !== null) return;
    this.titreOrigine = document.title;
    document.title = nomDeFichier(this.titre());
    this.masquerLaFinVide();
  }

  terminer() {
    if (this.titreOrigine === null) return;
    document.title = this.titreOrigine;
    this.titreOrigine = null;
    this.styleFin?.remove();
    this.styleFin = null;
  }

  /**
   * Les paragraphes vides et les sauts de page de la fin du document ne sont
   * pas imprimés : un saut de page tout à la fin (suivi du paragraphe vide où
   * l'on écrirait la suite) ne donne pas de page blanche. Le document n'est
   * pas modifié : une règle de style est ajoutée le temps de l'impression.
   */
  masquerLaFinVide() {
    const blocs = this.feuille ? [...this.feuille.children] : [];
    let dernierPlein = blocs.length - 1;
    while (dernierPlein >= 0 && blocs[dernierPlein].textContent.replaceAll(INVISIBLE, '').trim() === '') dernierPlein--;
    if (dernierPlein === blocs.length - 1) return;
    this.styleFin = document.createElement('style');
    this.styleFin.media = 'print';
    this.styleFin.textContent = dernierPlein < 0
      ? '.feuille > * { display: none !important; }'
      : `.feuille > :nth-child(${dernierPlein + 1}) ~ * { display: none !important; }`;
    document.head.append(this.styleFin);
  }
}
