// Fenêtre « Exporter le document » : PDF, Word (.docx), texte brut (.txt) ou HTML (.html).
// Le fichier produit porte le titre du document.

import { ouvrirFenetre, afficherMessage } from './ui.js';
import { telecharger } from './storage.js';
import { nomDeFichier } from './impression.js';
import { contenuPropre } from './sanitize.js';
import { creerDocx } from './export-docx.js';
import { creerTexte } from './export-texte.js';
import { creerHtml, creerHtmlBrut } from './export-html.js';

export class Exporteur {
  /**
   * @param {object} options
   * @param {HTMLDialogElement} options.fenetre  la fenêtre de choix du format
   * @param {HTMLButtonElement} options.bouton  le bouton « Exporter »
   * @param {import('./impression.js').ExportPdf} options.exportPdf
   * @param {import('./editor.js').Editeur} options.editeur
   * @param {() => string} options.titre  titre du document ouvert
   * @param {() => Promise<unknown>} options.avant  à faire avant d'exporter (enregistrer)
   * @param {string} options.application  nom de l'application (inscrit dans le fichier Word)
   */
  constructor({ fenetre, bouton, exportPdf, editeur, titre, avant, application }) {
    Object.assign(this, { fenetre, bouton, exportPdf, editeur, titre, avant, application });
    bouton.addEventListener('click', () => ouvrirFenetre(fenetre, { declencheur: bouton }));
    for (const choix of fenetre.querySelectorAll('[data-format]')) {
      choix.addEventListener('click', () => {
        fenetre.close();
        this.exporter(choix.dataset.format);
      });
    }
  }

  async exporter(format) {
    if (format === 'pdf') {
      await this.exportPdf.exporter(this.bouton);
      return;
    }
    await this.avant();
    const contenu = contenuPropre(this.editeur.html());
    const titre = this.titre();
    const extension = format === 'html' || format === 'html-brut' ? 'html' : format;
    const nom = `${nomDeFichier(titre)}.${extension}`;
    if (format === 'docx') {
      telecharger(nom, creerDocx(contenu, { titre, application: this.application }), 'application/vnd.openxmlformats-officedocument.wordprocessingml.document');
    } else if (format === 'html') {
      telecharger(nom, creerHtml(contenu, { titre }), 'text/html;charset=utf-8');
    } else if (format === 'html-brut') {
      telecharger(nom, creerHtmlBrut(contenu), 'text/html;charset=utf-8');
    } else {
      telecharger(nom, creerTexte(contenu), 'text/plain;charset=utf-8');
    }
    afficherMessage(`Fichier « ${nom} » créé. Tu le trouveras dans tes téléchargements.`, { duree: 6000 });
  }
}
