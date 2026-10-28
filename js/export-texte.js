// Export en texte brut (.txt) : le texte seul, sans mise en forme.
// Un paragraphe par ligne ; les éléments de liste commencent par « • » ou
// par leur numéro. Le fichier est en UTF-8 avec une marque d'encodage (BOM)
// et des fins de ligne Windows (CRLF) : les accents s'affichent correctement
// même dans les anciens éditeurs de texte de Windows.
//
// Un saut de page devient la ligne « ──── Saut de page ──── » : elle reste
// lisible dans n'importe quel éditeur (un caractère de saut de page, lui,
// s'affiche souvent comme un carré), et elle redevient un vrai saut de page
// si l'on rouvre le fichier dans Omni-Texte (ou si on la colle).

import { SAUT_DE_PAGE } from '../commun/saut-de-page.js';

const FIN_DE_LIGNE = '\r\n';

/** Texte d'un bloc ; un <br> final (qui ne crée pas de ligne) est ignoré. */
function texteDuBloc(bloc) {
  let texte = '';
  const marcheur = document.createTreeWalker(bloc, NodeFilter.SHOW_ALL);
  for (let n = marcheur.nextNode(); n; n = marcheur.nextNode()) {
    if (n.nodeType === 3) texte += n.data;
    else if (n.nodeName === 'BR') texte += '\n';
  }
  return texte.replace(/\n$/, '').replace(/\u200B/g, '');
}

/**
 * @param {HTMLElement} conteneur  contenu nettoyé (voir sanitize.js : contenuPropre)
 * @returns {string}
 */
export function creerTexte(conteneur) {
  const lignes = [];
  for (const bloc of conteneur.children) {
    if (bloc.nodeName === 'HR') {
      lignes.push(SAUT_DE_PAGE);
    } else if (bloc.nodeName === 'UL' || bloc.nodeName === 'OL') {
      let numero = 1;
      for (const li of bloc.children) {
        lignes.push(`${bloc.nodeName === 'OL' ? `${numero++}.` : '•'} ${texteDuBloc(li)}`);
      }
    } else {
      lignes.push(texteDuBloc(bloc));
    }
  }
  return `\uFEFF${lignes.join('\n').replace(/\n/g, FIN_DE_LIGNE)}${FIN_DE_LIGNE}`;
}
