// Export au format Word (.docx), lisible par Word, Google Docs et LibreOffice.
//
// Le document (déjà nettoyé par sanitize.js) est traduit en « WordprocessingML »,
// le langage XML de Word, puis rangé dans une archive ZIP (zip.js).
// Correspondances :
//   <p>, <h1>…<h3>  → paragraphes (styles « Normal », « heading 1 »…)
//   <ul>, <ol>      → paragraphes de liste à puces ou numérotée
//   <b> <i> <u> <s> → gras, italique, souligné, barré
//   styles <span>   → taille, police, couleur, surlignage
//   styles de bloc  → alignement, interligne
// Attention : Word refuse un fichier dont les balises ne sont pas dans
// l'ordre prévu par la norme. L'ordre ci-dessous est volontaire.

import { creerZip } from './zip.js';
import { policeDepuisCss, versHexa } from './palettes.js';

const TYPE_DOCX = 'application/vnd.openxmlformats-officedocument.wordprocessingml.document';
const NS_W = 'http://schemas.openxmlformats.org/wordprocessingml/2006/main';
const NS_REL = 'http://schemas.openxmlformats.org/package/2006/relationships';
const NS_TYPE_REL = 'http://schemas.openxmlformats.org/officeDocument/2006/relationships';
const ENTETE = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n';

// Noms des polices dans Word. « Sans-serif » devient Arial, présente partout.
const POLICES_WORD = { literata: 'Literata', sans: 'Arial', machine: 'JetBrains Mono' };
const STYLES_TITRE = { H1: 'Heading1', H2: 'Heading2', H3: 'Heading3' };
const ALIGNEMENTS = { center: 'center', right: 'right', justify: 'both' };

/** Échappe un texte pour le XML et retire les caractères interdits. */
function xml(texte) {
  return String(texte)
    .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F￾￿]/g, '')
    .replace(/[\uD800-\uDBFF](?![\uDC00-\uDFFF])|(?<![\uD800-\uDBFF])[\uDC00-\uDFFF]/g, '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

// --- Mise en forme des caractères ------------------------------------------

/** Lit la mise en forme apportée par un élément et l'ajoute à `format`. */
function lireFormat(element, format) {
  const f = { ...format };
  const nom = element.nodeName;
  if (nom === 'B' || nom === 'STRONG') f.gras = true;
  if (nom === 'I' || nom === 'EM') f.italique = true;
  if (nom === 'U') f.souligne = true;
  if (nom === 'S' || nom === 'STRIKE') f.barre = true;
  const s = element.style;
  if (!s || s.length === 0) return f;
  const taille = s.getPropertyValue('font-size');
  if (taille.endsWith('pt')) f.taille = parseFloat(taille);
  const police = s.getPropertyValue('font-family');
  if (police) f.police = POLICES_WORD[policeDepuisCss(police)?.id] ?? f.police;
  const couleur = versHexa(s.getPropertyValue('color'));
  if (couleur) f.couleur = couleur.slice(1).toUpperCase();
  const fond = versHexa(s.getPropertyValue('background-color'));
  if (fond) f.fond = fond.slice(1).toUpperCase();
  const graisse = s.getPropertyValue('font-weight');
  if (graisse) f.gras = graisse === 'bold' || graisse === 'bolder' || Number(graisse) >= 600;
  const style = s.getPropertyValue('font-style');
  if (style) f.italique = style === 'italic';
  // Les traits s'additionnent (un soulignement dans un texte barré garde le barré).
  const decoration = s.getPropertyValue('text-decoration-line') || s.getPropertyValue('text-decoration');
  if (decoration.includes('underline')) f.souligne = true;
  if (decoration.includes('line-through')) f.barre = true;
  return f;
}

/** Propriétés d'un morceau de texte (<w:rPr>), dans l'ordre exigé par Word. */
function proprietesTexte(f) {
  const p = [];
  if (f.police) p.push(`<w:rFonts w:ascii="${xml(f.police)}" w:hAnsi="${xml(f.police)}" w:cs="${xml(f.police)}"/>`);
  if (f.gras !== undefined) p.push(f.gras ? '<w:b/><w:bCs/>' : '<w:b w:val="0"/><w:bCs w:val="0"/>');
  if (f.italique !== undefined) p.push(f.italique ? '<w:i/><w:iCs/>' : '<w:i w:val="0"/><w:iCs w:val="0"/>');
  if (f.barre) p.push('<w:strike/>');
  if (f.couleur) p.push(`<w:color w:val="${f.couleur}"/>`);
  if (f.taille) {
    const demiPoints = Math.round(f.taille * 2);
    p.push(`<w:sz w:val="${demiPoints}"/><w:szCs w:val="${demiPoints}"/>`);
  }
  if (f.souligne) p.push('<w:u w:val="single"/>');
  if (f.fond) p.push(`<w:shd w:val="clear" w:color="auto" w:fill="${f.fond}"/>`);
  return p.length ? `<w:rPr>${p.join('')}</w:rPr>` : '';
}

/** Un morceau de texte : les retours à la ligne et tabulations sont traduits. */
function morceau(texte, format) {
  const contenu = texte
    .split(/(\n|\t)/)
    .filter((partie) => partie !== '')
    .map((partie) => {
      if (partie === '\n') return '<w:br/>';
      if (partie === '\t') return '<w:tab/>';
      return `<w:t xml:space="preserve">${xml(partie)}</w:t>`;
    })
    .join('');
  return contenu ? `<w:r>${proprietesTexte(format)}${contenu}</w:r>` : '';
}

/** Parcourt le contenu d'un bloc et produit ses morceaux de texte. */
function morceauxDe(bloc) {
  // Un <br> placé tout à la fin d'un bloc ne crée pas de ligne : on l'ignore.
  const feuilles = [];
  const marcheur = document.createTreeWalker(bloc, NodeFilter.SHOW_ALL);
  for (let n = marcheur.nextNode(); n; n = marcheur.nextNode()) {
    if (n.nodeType === 3 || n.nodeName === 'BR') feuilles.push(n);
  }
  const brFinal = feuilles.at(-1)?.nodeName === 'BR' ? feuilles.at(-1) : null;

  const sortie = [];
  const parcourir = (noeud, format) => {
    for (const enfant of noeud.childNodes) {
      if (enfant.nodeType === 3) sortie.push(morceau(enfant.data, format));
      else if (enfant.nodeName === 'BR') {
        if (enfant !== brFinal) sortie.push(`<w:r>${proprietesTexte(format)}<w:br/></w:r>`);
      } else if (enfant.nodeType === 1) parcourir(enfant, lireFormat(enfant, format));
    }
  };
  parcourir(bloc, lireFormat(bloc, {}));
  return sortie.join('');
}

// --- Paragraphes ----------------------------------------------------------------

function paragraphe(bloc, { style = null, numero = null, nouvellePage = false } = {}) {
  const p = [];
  if (style) p.push(`<w:pStyle w:val="${style}"/>`);
  // Saut de page : ce paragraphe commence une nouvelle page.
  if (nouvellePage) p.push('<w:pageBreakBefore/>');
  if (numero) p.push(`<w:numPr><w:ilvl w:val="0"/><w:numId w:val="${numero}"/></w:numPr>`);
  // Interligne : 240 = une ligne (1,5 → 360, comme le style par défaut).
  const interligne = Number(bloc.style?.lineHeight);
  if (interligne > 0) p.push(`<w:spacing w:line="${Math.round(interligne * 240)}" w:lineRule="auto"/>`);
  const alignement = ALIGNEMENTS[bloc.style?.textAlign];
  if (alignement) p.push(`<w:jc w:val="${alignement}"/>`);
  const proprietes = p.length ? `<w:pPr>${p.join('')}</w:pPr>` : '';
  return `<w:p>${proprietes}${morceauxDe(bloc)}</w:p>`;
}

/** Corps du document et nombre de listes numérotées. */
function corpsDu(conteneur) {
  const paragraphes = [];
  let listesNumerotees = 0;
  // Un saut de page (<hr>) n'est pas un paragraphe : il fait commencer le
  // paragraphe suivant sur une nouvelle page (plusieurs à la suite n'en font qu'un).
  let nouvellePage = false;
  for (const bloc of conteneur.children) {
    if (bloc.nodeName === 'HR') {
      nouvellePage = paragraphes.length > 0; // tout au début : rien à faire
    } else if (bloc.nodeName === 'UL' || bloc.nodeName === 'OL') {
      // Liste à puces : numérotation n° 1. Chaque liste numérotée a la sienne
      // (n° 2, 3…), pour que la numérotation reparte de 1.
      const numero = bloc.nodeName === 'UL' ? 1 : 2 + listesNumerotees++;
      for (const li of bloc.children) {
        paragraphes.push(paragraphe(li, { style: 'ListParagraph', numero, nouvellePage }));
        nouvellePage = false;
      }
    } else {
      paragraphes.push(paragraphe(bloc, { style: STYLES_TITRE[bloc.nodeName] ?? null, nouvellePage }));
      nouvellePage = false;
    }
  }
  return { paragraphes: paragraphes.join('\n'), listesNumerotees };
}

// --- Fichiers de l'archive ----------------------------------------------------------

function documentXml(paragraphes) {
  // Page A4 (21 × 29,7 cm) et marges de 2 cm, comme l'export PDF (1 cm = 567).
  return `${ENTETE}<w:document xmlns:w="${NS_W}" xmlns:r="${NS_TYPE_REL}"><w:body>
${paragraphes}
<w:sectPr><w:pgSz w:w="11906" w:h="16838"/><w:pgMar w:top="1134" w:right="1134" w:bottom="1134" w:left="1134" w:header="567" w:footer="567" w:gutter="0"/></w:sectPr>
</w:body></w:document>`;
}

function stylesXml() {
  // Mêmes réglages que la feuille : Literata 12 pt, interligne 1,5,
  // espace après les paragraphes, titres de 24, 18 et 14 pt en gras.
  const titre = (niveau, taille, avant, apres) =>
    `<w:style w:type="paragraph" w:styleId="Heading${niveau}"><w:name w:val="heading ${niveau}"/><w:basedOn w:val="Normal"/><w:next w:val="Normal"/><w:uiPriority w:val="9"/><w:qFormat/>` +
    `<w:pPr><w:keepNext/><w:keepLines/><w:spacing w:before="${avant}" w:after="${apres}" w:line="300" w:lineRule="auto"/><w:outlineLvl w:val="${niveau - 1}"/></w:pPr>` +
    `<w:rPr><w:b/><w:bCs/><w:sz w:val="${taille * 2}"/><w:szCs w:val="${taille * 2}"/></w:rPr></w:style>`;
  return `${ENTETE}<w:styles xmlns:w="${NS_W}">
<w:docDefaults><w:rPrDefault><w:rPr><w:rFonts w:ascii="Literata" w:hAnsi="Literata" w:eastAsia="Literata" w:cs="Literata"/><w:sz w:val="24"/><w:szCs w:val="24"/><w:lang w:val="fr-FR" w:eastAsia="fr-FR" w:bidi="ar-SA"/></w:rPr></w:rPrDefault>
<w:pPrDefault><w:pPr><w:spacing w:after="132" w:line="360" w:lineRule="auto"/></w:pPr></w:pPrDefault></w:docDefaults>
<w:style w:type="paragraph" w:default="1" w:styleId="Normal"><w:name w:val="Normal"/><w:qFormat/></w:style>
${titre(1, 24, 432, 192)}
${titre(2, 18, 324, 144)}
${titre(3, 14, 252, 112)}
<w:style w:type="paragraph" w:styleId="ListParagraph"><w:name w:val="List Paragraph"/><w:basedOn w:val="Normal"/><w:uiPriority w:val="34"/><w:qFormat/><w:pPr><w:spacing w:after="48"/><w:ind w:left="720"/><w:contextualSpacing/></w:pPr></w:style>
</w:styles>`;
}

function numerotationXml(listesNumerotees) {
  const niveau = (format, texte) =>
    `<w:lvl w:ilvl="0"><w:start w:val="1"/><w:numFmt w:val="${format}"/><w:lvlText w:val="${texte}"/><w:lvlJc w:val="left"/><w:pPr><w:ind w:left="720" w:hanging="360"/></w:pPr></w:lvl>`;
  let numeros = '<w:num w:numId="1"><w:abstractNumId w:val="0"/></w:num>';
  for (let i = 0; i < listesNumerotees; i++) {
    numeros += `<w:num w:numId="${2 + i}"><w:abstractNumId w:val="1"/><w:lvlOverride w:ilvl="0"><w:startOverride w:val="1"/></w:lvlOverride></w:num>`;
  }
  return `${ENTETE}<w:numbering xmlns:w="${NS_W}">
<w:abstractNum w:abstractNumId="0"><w:multiLevelType w:val="singleLevel"/>${niveau('bullet', '•')}</w:abstractNum>
<w:abstractNum w:abstractNumId="1"><w:multiLevelType w:val="singleLevel"/>${niveau('decimal', '%1.')}</w:abstractNum>
${numeros}
</w:numbering>`;
}

function reglagesXml() {
  // « compatibilityMode 15 » : Word ouvre le fichier normalement, sans
  // afficher « Mode de compatibilité ».
  return `${ENTETE}<w:settings xmlns:w="${NS_W}"><w:defaultTabStop w:val="709"/><w:characterSpacingControl w:val="doNotCompress"/><w:compat><w:compatSetting w:name="compatibilityMode" w:uri="http://schemas.microsoft.com/office/word" w:val="15"/></w:compat></w:settings>`;
}

function policesXml() {
  // Si une police manque sur l'appareil, Word choisit une police du même
  // genre (avec empattements, sans empattements, ou à chasse fixe).
  return `${ENTETE}<w:fonts xmlns:w="${NS_W}">
<w:font w:name="Literata"><w:altName w:val="Georgia"/><w:family w:val="roman"/><w:pitch w:val="variable"/></w:font>
<w:font w:name="Arial"><w:family w:val="swiss"/><w:pitch w:val="variable"/></w:font>
<w:font w:name="JetBrains Mono"><w:altName w:val="Courier New"/><w:family w:val="modern"/><w:pitch w:val="fixed"/></w:font>
</w:fonts>`;
}

const TYPES_XML = `${ENTETE}<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">
<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>
<Default Extension="xml" ContentType="application/xml"/>
<Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/>
<Override PartName="/word/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.styles+xml"/>
<Override PartName="/word/numbering.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.numbering+xml"/>
<Override PartName="/word/settings.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.settings+xml"/>
<Override PartName="/word/fontTable.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.fontTable+xml"/>
<Override PartName="/docProps/core.xml" ContentType="application/vnd.openxmlformats-package.core-properties+xml"/>
<Override PartName="/docProps/app.xml" ContentType="application/vnd.openxmlformats-officedocument.extended-properties+xml"/>
</Types>`;

const RELATIONS_XML = `${ENTETE}<Relationships xmlns="${NS_REL}">
<Relationship Id="rId1" Type="${NS_TYPE_REL}/officeDocument" Target="word/document.xml"/>
<Relationship Id="rId2" Type="http://schemas.openxmlformats.org/package/2006/relationships/metadata/core-properties" Target="docProps/core.xml"/>
<Relationship Id="rId3" Type="${NS_TYPE_REL}/extended-properties" Target="docProps/app.xml"/>
</Relationships>`;

const RELATIONS_DOCUMENT_XML = `${ENTETE}<Relationships xmlns="${NS_REL}">
<Relationship Id="rId1" Type="${NS_TYPE_REL}/styles" Target="styles.xml"/>
<Relationship Id="rId2" Type="${NS_TYPE_REL}/numbering" Target="numbering.xml"/>
<Relationship Id="rId3" Type="${NS_TYPE_REL}/settings" Target="settings.xml"/>
<Relationship Id="rId4" Type="${NS_TYPE_REL}/fontTable" Target="fontTable.xml"/>
</Relationships>`;

function proprietesDocumentXml(titre, date) {
  const quand = date.toISOString().replace(/\.\d{3}Z$/, 'Z');
  return `${ENTETE}<cp:coreProperties xmlns:cp="http://schemas.openxmlformats.org/package/2006/metadata/core-properties" xmlns:dc="http://purl.org/dc/elements/1.1/" xmlns:dcterms="http://purl.org/dc/terms/" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance">` +
    `<dc:title>${xml(titre)}</dc:title><dcterms:created xsi:type="dcterms:W3CDTF">${quand}</dcterms:created><dcterms:modified xsi:type="dcterms:W3CDTF">${quand}</dcterms:modified></cp:coreProperties>`;
}

function applicationXml(application) {
  return `${ENTETE}<Properties xmlns="http://schemas.openxmlformats.org/officeDocument/2006/extended-properties"><Application>${xml(application)}</Application></Properties>`;
}

/**
 * Crée le fichier Word d'un document.
 * @param {HTMLElement} conteneur  contenu nettoyé (voir sanitize.js : contenuPropre)
 * @param {{titre: string, application: string}} infos
 * @returns {Blob}
 */
export function creerDocx(conteneur, { titre, application }) {
  const date = new Date();
  const { paragraphes, listesNumerotees } = corpsDu(conteneur);
  return creerZip(
    [
      { nom: '[Content_Types].xml', contenu: TYPES_XML },
      { nom: '_rels/.rels', contenu: RELATIONS_XML },
      { nom: 'docProps/core.xml', contenu: proprietesDocumentXml(titre, date) },
      { nom: 'docProps/app.xml', contenu: applicationXml(application) },
      { nom: 'word/document.xml', contenu: documentXml(paragraphes) },
      { nom: 'word/_rels/document.xml.rels', contenu: RELATIONS_DOCUMENT_XML },
      { nom: 'word/styles.xml', contenu: stylesXml() },
      { nom: 'word/numbering.xml', contenu: numerotationXml(listesNumerotees) },
      { nom: 'word/settings.xml', contenu: reglagesXml() },
      { nom: 'word/fontTable.xml', contenu: policesXml() },
    ],
    TYPE_DOCX,
    date,
  );
}
