// Lecture d'un fichier Word (.docx) : le texte et sa mise en forme deviennent
// un document Omni-Texte.
//
// Le fichier est une archive ZIP (zip.js) contenant du XML « WordprocessingML ».
// Ce qui est repris :
//   paragraphes, titres (styles « heading 1 » à 3, « Title »), listes à puces
//   et numérotées, alignement, interligne (simple, 1,5 ou double) ;
//   gras, italique, souligné, barré, taille, police (rangée dans l'une des
//   trois polices d'Omni-Texte), couleur, surlignage, sauts de ligne, tabulations.
// Ce qui ne l'est pas (signalé à l'utilisateur) : images, tableaux (leur
// texte devient de simples paragraphes), notes de bas de page.
// La police et la taille par défaut du fichier ne sont pas reprises : le texte
// prend celles d'Omni-Texte, sauf là où elles avaient été choisies à la main.
//
// Le résultat est ensuite nettoyé par sanitize.js, comme tout document.

import { lireZip, ErreurArchive } from './zip.js';
import { POLICES } from './palettes.js';
import { interligneProche } from './paragraphes.js';

const TAILLE_MAX_XML = 60 * 1024 * 1024;

// Couleurs de surlignage nommées de Word.
const SURLIGNAGES = {
  yellow: 'ffff00', green: '00ff00', cyan: '00ffff', magenta: 'ff00ff', blue: '0000ff', red: 'ff0000',
  darkBlue: '000080', darkCyan: '008080', darkGreen: '008000', darkMagenta: '800080', darkRed: '800000',
  darkYellow: '808000', darkGray: '808080', lightGray: 'c0c0c0', black: '000000', white: 'ffffff',
};

/** Range une police de Word dans l'une des trois polices d'Omni-Texte (null : police par défaut). */
export function familleDePolice(nom) {
  const n = String(nom ?? '').toLowerCase();
  if (!n) return null;
  if (/mono|courier|consolas|menlo|monaco|typewriter|lucida console|lucida sans typewriter|fixedsys|terminal/.test(n)) return POLICES[2];
  if (/sans|arial|helvetica|calibri|verdana|tahoma|segoe|roboto|lato|montserrat|aptos|carlito|trebuchet|gill|futura|franklin|candara|corbel|ubuntu|inter\b|poppins|nunito|raleway|oxanium|system-ui/.test(n)) return POLICES[1];
  return null;
}

/** Valeur booléenne d'une propriété (<w:b/>, <w:b w:val="0"/>…), ou undefined si absente. */
function interrupteur(element, W) {
  if (!element) return undefined;
  const v = element.getAttributeNS(W, 'val');
  return !(v === '0' || v === 'false' || v === 'off' || v === 'none');
}

class LecteurDocx {
  constructor(documentXml, stylesXml, numerotationXml) {
    this.document = documentXml;
    this.W = documentXml.documentElement.namespaceURI;
    this.styles = new Map();
    this.styleParDefaut = null;
    this.defautsParagraphe = null;
    this.numerotation = new Map(); // numId → { ilvl → 'UL' | 'OL' | null }
    this.remarques = { images: 0, tableaux: 0, notes: 0 };
    if (stylesXml) this.lireStyles(stylesXml);
    if (numerotationXml) this.lireNumerotation(numerotationXml);
  }

  // --- Accès au XML -------------------------------------------------------------

  enfants(element, nom) {
    return element ? [...element.children].filter((e) => e.namespaceURI === this.W && e.localName === nom) : [];
  }

  enfant(element, nom) {
    if (!element) return null;
    for (const e of element.children) if (e.namespaceURI === this.W && e.localName === nom) return e;
    return null;
  }

  val(element) {
    return element?.getAttributeNS(this.W, 'val') ?? null;
  }

  // --- Styles et numérotation ---------------------------------------------------

  lireStyles(xml) {
    const racine = xml.documentElement;
    const defauts = this.enfant(racine, 'docDefaults');
    this.defautsParagraphe = this.enfant(this.enfant(defauts, 'pPrDefault'), 'pPr');
    for (const style of this.enfants(racine, 'style')) {
      const id = style.getAttributeNS(this.W, 'styleId');
      if (!id) continue;
      const parDefaut = ['1', 'true', 'on'].includes(style.getAttributeNS(this.W, 'default'));
      if (parDefaut && style.getAttributeNS(this.W, 'type') === 'paragraph') this.styleParDefaut = id;
      this.styles.set(id, {
        nom: (this.val(this.enfant(style, 'name')) ?? '').toLowerCase(),
        parent: this.val(this.enfant(style, 'basedOn')),
        pPr: this.enfant(style, 'pPr'),
        rPr: this.enfant(style, 'rPr'),
      });
    }
  }

  /** Le style et ses parents (basedOn), du plus proche au plus lointain. */
  chaine(id) {
    const chaine = [];
    for (let i = 0; id && i < 12; i++) {
      const style = this.styles.get(id);
      if (!style || chaine.includes(style)) break;
      chaine.push(style);
      id = style.parent;
    }
    return chaine;
  }

  lireNumerotation(xml) {
    const racine = xml.documentElement;
    const abstraits = new Map();
    for (const a of this.enfants(racine, 'abstractNum')) {
      const niveaux = {};
      for (const lvl of this.enfants(a, 'lvl')) {
        const format = this.val(this.enfant(lvl, 'numFmt'));
        niveaux[lvl.getAttributeNS(this.W, 'ilvl') ?? '0'] = format === 'none' ? null : format === 'bullet' ? 'UL' : 'OL';
      }
      abstraits.set(a.getAttributeNS(this.W, 'abstractNumId'), niveaux);
    }
    for (const num of this.enfants(racine, 'num')) {
      const abstrait = abstraits.get(this.val(this.enfant(num, 'abstractNumId')));
      if (abstrait) this.numerotation.set(num.getAttributeNS(this.W, 'numId'), abstrait);
    }
  }

  /** Première propriété de paragraphe trouvée : paragraphe, puis styles, puis valeurs par défaut. */
  propriete(pPr, nom, { defauts = false } = {}) {
    const direct = this.enfant(pPr, nom);
    if (direct) return direct;
    for (const style of this.chaine(this.val(this.enfant(pPr, 'pStyle')) ?? this.styleParDefaut)) {
      const trouve = this.enfant(style.pPr, nom);
      if (trouve) return trouve;
    }
    return defauts ? this.enfant(this.defautsParagraphe, nom) : null;
  }

  /** Niveau de titre (1 à 3) d'un paragraphe, ou 0. */
  niveauDeTitre(pPr) {
    for (const style of this.chaine(this.val(this.enfant(pPr, 'pStyle')))) {
      if (style.nom === 'title') return 1;
      if (style.nom === 'subtitle') return 2;
      const m = style.nom.match(/^heading ([1-9])$/);
      if (m) return Math.min(3, Number(m[1]));
      const contour = this.val(this.enfant(style.pPr, 'outlineLvl'));
      if (contour !== null && Number(contour) < 9) return Math.min(3, Number(contour) + 1);
    }
    const contour = this.val(this.enfant(pPr, 'outlineLvl'));
    return contour !== null && Number(contour) < 9 ? Math.min(3, Number(contour) + 1) : 0;
  }

  /** Liste du paragraphe : { type: 'UL' | 'OL', numero } ou null. */
  liste(pPr) {
    const numPr = this.propriete(pPr, 'numPr');
    const numero = this.val(this.enfant(numPr, 'numId'));
    if (!numero || numero === '0') return null;
    const niveau = this.val(this.enfant(numPr, 'ilvl')) ?? '0';
    const niveaux = this.numerotation.get(numero);
    const type = niveaux ? (niveaux[niveau] ?? niveaux['0']) : 'UL';
    return type ? { type, numero } : null;
  }

  // --- Mise en forme des caractères ---------------------------------------------

  /** Mise en forme d'un morceau de texte : style de caractère, puis mise en forme directe. */
  formatDu(rPr) {
    const f = {};
    const sources = this.chaine(this.val(this.enfant(rPr, 'rStyle'))).reverse().map((s) => s.rPr);
    sources.push(rPr);
    for (const source of sources) {
      if (!source) continue;
      const W = this.W;
      const gras = interrupteur(this.enfant(source, 'b'), W);
      if (gras !== undefined) f.gras = gras;
      const italique = interrupteur(this.enfant(source, 'i'), W);
      if (italique !== undefined) f.italique = italique;
      const barre = interrupteur(this.enfant(source, 'strike'), W) ?? interrupteur(this.enfant(source, 'dstrike'), W);
      if (barre !== undefined) f.barre = barre;
      const u = this.enfant(source, 'u');
      if (u) f.souligne = this.val(u) !== 'none' && this.val(u) !== '0';
      const couleur = this.val(this.enfant(source, 'color'));
      if (couleur && /^[0-9a-f]{6}$/i.test(couleur)) f.couleur = `#${couleur.toLowerCase()}`;
      else if (couleur === 'auto') delete f.couleur;
      const taille = Number(this.val(this.enfant(source, 'sz')));
      if (taille > 0) f.taille = taille / 2;
      const polices = this.enfant(source, 'rFonts');
      if (polices) {
        const nom = polices.getAttributeNS(W, 'ascii') || polices.getAttributeNS(W, 'hAnsi') || polices.getAttributeNS(W, 'cs');
        if (nom) f.police = familleDePolice(nom)?.pile ?? null;
      }
      const surlignage = this.val(this.enfant(source, 'highlight'));
      if (surlignage && SURLIGNAGES[surlignage]) f.fond = `#${SURLIGNAGES[surlignage]}`;
      else if (surlignage === 'none') delete f.fond;
      const trame = this.enfant(source, 'shd')?.getAttributeNS(W, 'fill');
      if (trame && /^[0-9a-f]{6}$/i.test(trame) && !f.fond) f.fond = `#${trame.toLowerCase()}`;
    }
    return f;
  }

  // --- Contenu --------------------------------------------------------------------

  /** Convertit le corps du document. Renvoie un élément <div> contenant le HTML. */
  convertir() {
    const corps = this.enfant(this.document.documentElement, 'body');
    const blocs = [];
    this.lireBlocs(corps, blocs);
    const sortie = document.createElement('div');
    let liste = null;
    for (const bloc of blocs) {
      if (bloc.saut) {
        // Saut de page : un <hr> entre deux blocs (voir paragraphes.js).
        liste = null;
        sortie.append(document.createElement('hr'));
      } else if (bloc.liste) {
        const memeListe = liste && liste.nodeName === bloc.liste.type && liste.dataset.numero === bloc.liste.numero;
        if (!memeListe) {
          liste = document.createElement(bloc.liste.type);
          liste.dataset.numero = bloc.liste.numero;
          sortie.append(liste);
        }
        liste.append(bloc.element);
      } else {
        liste = null;
        sortie.append(bloc.element);
      }
    }
    for (const l of sortie.querySelectorAll('[data-numero]')) delete l.dataset.numero;
    return sortie;
  }

  lireBlocs(conteneur, blocs) {
    for (const element of conteneur?.children ?? []) {
      if (element.namespaceURI !== this.W) continue;
      if (element.localName === 'p') blocs.push(...this.paragraphe(element));
      else if (element.localName === 'tbl') {
        // Tableau : le texte de chaque case devient un ou plusieurs paragraphes.
        this.remarques.tableaux++;
        for (const ligne of this.enfants(element, 'tr')) {
          for (const cellule of this.enfants(ligne, 'tc')) this.lireBlocs(cellule, blocs);
        }
      } else if (element.localName === 'sdt') this.lireBlocs(this.enfant(element, 'sdtContent'), blocs);
      else if (element.localName === 'customXml') this.lireBlocs(element, blocs);
    }
  }

  /**
   * Un paragraphe Word devient un bloc, ou plusieurs s'il contient des sauts
   * de page : [{ element, liste }, { saut: true }, { element, liste }…].
   */
  paragraphe(p) {
    const pPr = this.enfant(p, 'pPr');
    const niveau = this.niveauDeTitre(pPr);
    const liste = niveau ? null : this.liste(pPr);
    const element = document.createElement(niveau ? `h${niveau}` : liste ? 'li' : 'p');

    const jc = this.val(this.propriete(pPr, 'jc'));
    const alignement = { center: 'center', right: 'right', end: 'right', both: 'justify', distribute: 'justify' }[jc];
    if (alignement) element.style.textAlign = alignement;
    if (!niveau) {
      const espacement = this.propriete(pPr, 'spacing', { defauts: true });
      const ligne = Number(espacement?.getAttributeNS(this.W, 'line'));
      const regle = espacement?.getAttributeNS(this.W, 'lineRule') || 'auto';
      const interligne = regle === 'auto' && ligne > 0 ? interligneProche(ligne / 240) : null;
      if (interligne) element.style.lineHeight = interligne;
    }

    this.morceaux = [];
    this.champs = []; // champs Word (numéros de page…) : on garde le résultat, pas le code
    this.lireEnLigne(p);

    const blocs = [];
    // « Saut de page avant » (réglage du paragraphe ou de son style).
    if (interrupteur(this.propriete(pPr, 'pageBreakBefore'), this.W)) blocs.push({ saut: true });
    // Les sauts de page placés dans le texte coupent le paragraphe en morceaux.
    const groupes = [[]];
    for (const m of this.morceaux) {
      if (m.saut) groupes.push([]);
      else groupes.at(-1).push(m);
    }
    groupes.forEach((groupe, i) => {
      if (i > 0) blocs.push({ saut: true });
      // Rien d'écrit avant ou après le saut de page : pas de paragraphe vide.
      if (groupes.length > 1 && groupe.every((m) => m.texte.trim() === '')) return;
      const bloc = i === 0 ? element : element.cloneNode(false);
      this.morceaux = groupe;
      this.ecrireMorceaux(bloc);
      blocs.push({ element: bloc, liste });
    });
    return blocs;
  }

  /** Parcourt le contenu d'un paragraphe (morceaux de texte, liens, modifications suivies…). */
  lireEnLigne(conteneur) {
    for (const element of conteneur.children) {
      if (element.namespaceURI !== this.W) {
        // mc:AlternateContent (dessins, formes…) : non repris.
        if (element.localName === 'AlternateContent') this.remarques.images++;
        continue;
      }
      switch (element.localName) {
        case 'r':
          this.morceau(element);
          break;
        case 'hyperlink':
        case 'ins':
        case 'moveTo':
        case 'smartTag':
        case 'customXml':
        case 'fldSimple':
        case 'dir':
        case 'bdo':
          this.lireEnLigne(element);
          break;
        case 'sdt':
          this.lireEnLigne(this.enfant(element, 'sdtContent') ?? element);
          break;
        default:
          break; // pPr, del, moveFrom, signets, commentaires… : ignorés
      }
    }
  }

  morceau(r) {
    const format = this.formatDu(this.enfant(r, 'rPr'));
    for (const element of r.children) {
      if (element.namespaceURI !== this.W) {
        if (element.localName === 'AlternateContent') this.remarques.images++;
        continue;
      }
      const nom = element.localName;
      if (nom === 'fldChar') {
        const type = element.getAttributeNS(this.W, 'fldCharType');
        if (type === 'begin') this.champs.push('code');
        else if (type === 'separate' && this.champs.length) this.champs[this.champs.length - 1] = 'resultat';
        else if (type === 'end') this.champs.pop();
        continue;
      }
      if (this.champs.includes('code')) continue; // code d'un champ : ignoré
      if (nom === 't') this.ajouter(element.textContent, format);
      else if (nom === 'tab' || nom === 'ptab') this.ajouter('\t', format);
      else if (nom === 'br' && element.getAttributeNS(this.W, 'type') === 'page') this.morceaux.push({ saut: true });
      else if (nom === 'br' || nom === 'cr') this.ajouter('\n', format);
      else if (nom === 'noBreakHyphen') this.ajouter('‑', format);
      else if (nom === 'drawing' || nom === 'pict' || nom === 'object') this.remarques.images++;
      else if (nom === 'footnoteReference' || nom === 'endnoteReference') this.remarques.notes++;
    }
  }

  /** Ajoute du texte ; deux morceaux voisins de même mise en forme sont réunis. */
  ajouter(texte, format) {
    if (!texte) return;
    const cle = JSON.stringify(format);
    const dernier = this.morceaux.at(-1);
    if (dernier && dernier.cle === cle) dernier.texte += texte;
    else this.morceaux.push({ cle, format, texte });
  }

  ecrireMorceaux(bloc) {
    for (const { format, texte } of this.morceaux) {
      const lignes = texte.split('\n');
      lignes.forEach((ligne, i) => {
        if (i > 0) bloc.append(document.createElement('br'));
        if (ligne) bloc.append(habiller(document.createTextNode(ligne), format));
      });
    }
  }
}

/** Entoure un texte des balises de sa mise en forme. */
function habiller(noeud, f) {
  let resultat = noeud;
  const styles = [
    ['font-size', f.taille && f.taille !== 12 ? `${f.taille}pt` : null],
    ['font-family', f.police],
    ['color', f.couleur],
    ['background-color', f.fond],
  ].filter(([, valeur]) => valeur);
  if (styles.length) {
    const span = document.createElement('span');
    for (const [propriete, valeur] of styles) span.style.setProperty(propriete, valeur);
    span.append(resultat);
    resultat = span;
  }
  for (const [actif, balise] of [[f.barre, 's'], [f.souligne, 'u'], [f.italique, 'i'], [f.gras, 'b']]) {
    if (!actif) continue;
    const element = document.createElement(balise);
    element.append(resultat);
    resultat = element;
  }
  return resultat;
}

function lireXml(octets) {
  if (!octets) return null;
  if (octets.length > TAILLE_MAX_XML) throw new ErreurArchive('Ce fichier est trop volumineux.');
  const xml = new DOMParser().parseFromString(new TextDecoder().decode(octets), 'application/xml');
  if (xml.querySelector('parsererror')) throw new ErreurArchive("Ce fichier Word est abîmé : son contenu n'est pas lisible.");
  return xml;
}

/** Cible d'une relation (fichier .rels) d'un type donné, relative au dossier `dossier`. */
function cibleDeRelation(relsXml, type, dossier) {
  if (!relsXml) return null;
  for (const rel of relsXml.getElementsByTagName('Relationship')) {
    if (!rel.getAttribute('Type')?.endsWith(`/${type}`)) continue;
    const cible = rel.getAttribute('Target') ?? '';
    if (rel.getAttribute('TargetMode') === 'External') continue;
    return cible.startsWith('/') ? cible.slice(1) : `${dossier}${cible}`;
  }
  return null;
}

/**
 * Lit un fichier Word.
 * @param {Uint8Array} octets
 * @returns {Promise<{html: string, remarques: {images: number, tableaux: number, notes: number}}>}
 */
export async function lireDocx(octets) {
  const archive = lireZip(octets, TAILLE_MAX_XML);
  const relations = lireXml(await archive.lire('_rels/.rels'));
  const chemin = cibleDeRelation(relations, 'officeDocument', '') ?? 'word/document.xml';
  const documentXml = lireXml(await archive.lire(chemin));
  if (!documentXml) throw new ErreurArchive("Ce fichier n'est pas un document Word.");
  const dossier = chemin.includes('/') ? chemin.slice(0, chemin.lastIndexOf('/') + 1) : '';
  const nomRelations = `${dossier}_rels/${chemin.slice(dossier.length)}.rels`;
  const relationsDocument = lireXml(await archive.lire(nomRelations));
  const styles = lireXml(await archive.lire(cibleDeRelation(relationsDocument, 'styles', dossier) ?? `${dossier}styles.xml`));
  const numerotation = lireXml(await archive.lire(cibleDeRelation(relationsDocument, 'numbering', dossier) ?? `${dossier}numbering.xml`));
  const lecteur = new LecteurDocx(documentXml, styles, numerotation);
  const html = lecteur.convertir().innerHTML;
  return { html, remarques: lecteur.remarques };
}
