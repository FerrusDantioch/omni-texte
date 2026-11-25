// Export HTML (.html) :
// - creerHtml : page HTML5 autonome complète avec CSS intégré (sans ressource
//   externe ni script), fidèle à la mise en forme et prête à imprimer en A4.
// - creerHtmlBrut : texte brut des blocs sans échappement ni BOM, en fins de
//   ligne LF, pour enregistrer directement du code HTML/CSS/JS écrit dans
//   l'éditeur et l'ouvrir dans un navigateur.

const STYLE_AUTONOME = `
  *, *::before, *::after { box-sizing: border-box; }
  html { background: #f1eff5; color: #1c1a24; }
  body {
    margin: 0;
    padding: 32px 16px;
    background: #f1eff5;
    color: #1c1a24;
    font-family: Georgia, "Times New Roman", serif;
    font-size: 12pt;
    line-height: 1.5;
  }
  .document {
    max-width: 794px;
    margin: 0 auto;
    padding: 64px 76px;
    background: #ffffff;
    border: 1px solid #d9d6e0;
    border-radius: 4px;
    overflow-wrap: break-word;
  }
  .document > :first-child { margin-top: 0; }
  .document p, .document h1, .document h2, .document h3, .document li { white-space: pre-wrap; }
  .document p { margin: 0 0 0.55em; }
  .document h1, .document h2, .document h3 {
    font-family: inherit;
    font-weight: 600;
    line-height: 1.25;
    margin: 0.9em 0 0.4em;
  }
  .document h1 { font-size: 24pt; }
  .document h2 { font-size: 18pt; }
  .document h3 { font-size: 14pt; }
  .document ul, .document ol { margin: 0 0 0.55em; padding-left: 1.6em; }
  .document li { margin: 0 0 0.2em; }
  .document b, .document strong { font-weight: 600; }
  .document blockquote {
    margin: 0.8em 0;
    padding-left: 1em;
    border-left: 3px solid #a777ff;
    color: #4a455a;
  }
  .document span[style*="background-color"]:not([style^="color:"]):not([style*=" color:"]) {
    color: #14111d;
  }
  .document > hr {
    border: 0;
    border-top: 1px dashed #b8b3c7;
    margin: 1.4em 0;
    height: 0;
  }
  @media (max-width: 700px) {
    body { padding: 0; background: #ffffff; }
    .document { max-width: none; padding: 24px 18px; border: 0; border-radius: 0; }
  }
  @page { size: A4; margin: 2cm; }
  @media print {
    html, body { background: #ffffff; color: #000000; padding: 0; }
    .document {
      max-width: none;
      margin: 0;
      padding: 0;
      border: 0;
      border-radius: 0;
      color: #000000;
      -webkit-print-color-adjust: exact;
      print-color-adjust: exact;
    }
    .document * {
      -webkit-print-color-adjust: exact;
      print-color-adjust: exact;
    }
    .document h1, .document h2, .document h3 {
      break-after: avoid;
      page-break-after: avoid;
      break-inside: avoid;
    }
    .document p, .document li { orphans: 2; widows: 3; }
    .document > hr { display: none; }
    .document > hr + * {
      break-before: page;
      page-break-before: always;
      margin-top: 0;
    }
  }
`.trim();

function echapperHtml(texte) {
  return String(texte)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

/** Texte brut d'un bloc ; un <br> final (qui ne crée pas de ligne) est ignoré. */
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
 * Page web HTML5 autonome, stylée, sans ressource externe ni script.
 * @param {HTMLElement} conteneur  contenu nettoyé (voir sanitize.js : contenuPropre)
 * @param {object} [options]
 * @param {string} [options.titre]  titre du document
 * @returns {string}
 */
export function creerHtml(conteneur, { titre = 'Sans titre' } = {}) {
  const titreEchappe = echapperHtml(titre || 'Sans titre');
  const corps = conteneur.innerHTML.replaceAll('\u200B', '').replace(/\r\n?/g, '\n');
  return [
    '<!DOCTYPE html>',
    '<html lang="fr">',
    '<head>',
    '<meta charset="UTF-8">',
    '<meta name="viewport" content="width=device-width, initial-scale=1.0">',
    `<title>${titreEchappe}</title>`,
    '<style>',
    STYLE_AUTONOME,
    '</style>',
    '</head>',
    '<body>',
    '<main class="document">',
    corps,
    '</main>',
    '</body>',
    '</html>',
    '',
  ].join('\n');
}

/**
 * Code HTML brut : extrait le texte littéral des blocs sans échappement, sans
 * BOM (\uFEFF), sans caractère invisible (\u200B), avec fins de ligne LF.
 * @param {HTMLElement} conteneur  contenu nettoyé (voir sanitize.js : contenuPropre)
 * @returns {string}
 */
export function creerHtmlBrut(conteneur) {
  const lignes = [];
  for (const bloc of conteneur.children) {
    if (bloc.nodeName === 'HR') {
      lignes.push('');
    } else if (bloc.nodeName === 'UL' || bloc.nodeName === 'OL') {
      for (const li of bloc.children) lignes.push(texteDuBloc(li));
    } else {
      lignes.push(texteDuBloc(bloc));
    }
  }
  return lignes.length ? `${lignes.join('\n').replace(/\r\n?/g, '\n')}\n` : '';
}
