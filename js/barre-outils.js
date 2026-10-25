// Barre d'outils de mise en forme : boutons, listes de choix et palettes
// de couleurs. Elle transmet les commandes à l'éditeur et affiche l'état
// de la mise en forme sous le curseur.

import { TAILLES, TAILLE_PAR_DEFAUT, POLICES, COULEURS_TEXTE, COULEURS_SURLIGNAGE } from './palettes.js';
import { INTERLIGNES } from './paragraphes.js';

const COMMANDES = {
  annuler: (e) => e.annuler(),
  retablir: (e) => e.retablir(),
  gras: (e) => e.gras(),
  italique: (e) => e.italique(),
  souligne: (e) => e.souligne(),
  barre: (e) => e.barre(),
  'taille-moins': (e) => e.tailleVoisine(-1),
  'taille-plus': (e) => e.tailleVoisine(1),
  'aligner-gauche': (e) => e.alignement('left'),
  'aligner-centre': (e) => e.alignement('center'),
  'aligner-droite': (e) => e.alignement('right'),
  justifier: (e) => e.alignement('justify'),
  'liste-puces': (e) => e.liste('UL'),
  'liste-numeros': (e) => e.liste('OL'),
  effacer: (e) => e.effacerMiseEnForme(),
  'saut-de-page': (e) => e.insererSautDePage(),
};

export class BarreOutils {
  constructor({ barre, editeur }) {
    this.barre = barre;
    this.editeur = editeur;
    this.paletteOuverte = null;
    this.boutons = Object.fromEntries([...barre.querySelectorAll('[data-commande]')].map((b) => [b.dataset.commande, b]));
    this.choixStyle = barre.querySelector('#choix-style');
    this.choixPolice = barre.querySelector('#choix-police');
    this.choixTaille = barre.querySelector('#choix-taille');

    // Un clic sur un bouton ne doit pas retirer le focus (ni la sélection)
    // de la feuille : on empêche le bouton de prendre le focus à la souris.
    barre.addEventListener('mousedown', (e) => {
      if (e.target.closest('button')) e.preventDefault();
    });
    barre.addEventListener('click', (e) => {
      const bouton = e.target.closest('button[data-commande]');
      if (bouton && !bouton.disabled) COMMANDES[bouton.dataset.commande]?.(editeur);
    });

    this.remplirListes();
    this.choixStyle.addEventListener('change', () => editeur.styleParagraphe(this.choixStyle.value));
    this.choixPolice.addEventListener('change', () => editeur.police(this.choixPolice.value));
    this.choixTaille.addEventListener('change', () => {
      const valeur = Number(this.choixTaille.value);
      if (valeur) editeur.taille(valeur);
    });

    this.paletteCouleur = this.creerPalette({
      bouton: barre.querySelector('#bouton-couleur'),
      titre: 'Couleur du texte',
      choix: COULEURS_TEXTE,
      choisir: (valeur) => editeur.couleur(valeur),
      dessiner: (couleur) => pastilleDeCouleur(couleur, 'auto'),
    });
    this.paletteSurlignage = this.creerPalette({
      bouton: barre.querySelector('#bouton-surlignage'),
      titre: 'Surlignage',
      choix: COULEURS_SURLIGNAGE,
      choisir: (valeur) => editeur.surlignage(valeur),
      dessiner: (couleur) => pastilleDeCouleur(couleur, 'aucun'),
    });
    this.paletteInterligne = this.creerPalette({
      bouton: barre.querySelector('#bouton-interligne'),
      titre: 'Interligne',
      choix: INTERLIGNES,
      choisir: (valeur) => editeur.interligne(valeur),
      colonnes: 1,
      dessiner: (choix) => {
        const nom = document.createElement('span');
        nom.textContent = choix.nom;
        nom.setAttribute('aria-hidden', 'true');
        return [nom, iconeCoche()];
      },
    });

    document.addEventListener('pointerdown', (e) => {
      const p = this.paletteOuverte;
      if (p && !p.element.contains(e.target) && !p.bouton.contains(e.target)) this.fermerPalette();
    });
    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape' && this.paletteOuverte) {
        e.preventDefault();
        this.fermerPalette({ rendreFocus: true });
      }
    });
    window.addEventListener('resize', () => this.fermerPalette());
    barre.addEventListener('scroll', () => this.fermerPalette(), { passive: true });
    this.preparerFlechesDeDefilement();
  }

  /**
   * Sur téléphone, la barre défile horizontalement. Une flèche apparaît sur
   * chaque bord derrière lequel des boutons sont cachés ; la toucher fait
   * avancer la barre d'environ deux tiers de sa largeur.
   */
  preparerFlechesDeDefilement() {
    const barre = this.barre;
    const cadre = barre.parentElement;
    const gauche = cadre.querySelector('.defilement-gauche');
    const droite = cadre.querySelector('.defilement-droite');
    if (!gauche || !droite) return;
    const mettreAJour = () => {
      const reste = barre.scrollWidth - barre.clientWidth - barre.scrollLeft;
      gauche.hidden = barre.scrollLeft <= 2;
      droite.hidden = reste <= 2;
    };
    for (const fleche of [gauche, droite]) {
      // Comme les autres boutons : la feuille garde le focus et la sélection.
      fleche.addEventListener('mousedown', (e) => e.preventDefault());
      fleche.addEventListener('click', () => {
        barre.scrollBy({ left: Number(fleche.dataset.sens) * Math.round(barre.clientWidth * 0.66) });
      });
    }
    barre.addEventListener('scroll', mettreAJour, { passive: true });
    new ResizeObserver(mettreAJour).observe(barre);
    mettreAJour();
  }

  remplirListes() {
    for (const taille of TAILLES) this.choixTaille.add(new Option(String(taille), String(taille)));
    // Option cachée pour une taille absente de la liste, ou des tailles mélangées.
    this.optionTailleAutre = new Option('', 'autre');
    this.optionTailleAutre.hidden = true;
    this.choixTaille.add(this.optionTailleAutre);
    this.choixTaille.value = String(TAILLE_PAR_DEFAUT);
    for (const police of POLICES) this.choixPolice.add(new Option(police.nom, police.id));
  }

  // --- Palettes -----------------------------------------------------------------

  /**
   * Petit panneau de choix ouvert par un bouton de la barre : couleurs
   * (grille de pastilles) ou liste de choix (interligne). `dessiner` crée
   * le contenu visible de chaque choix.
   */
  creerPalette({ bouton, titre, choix, choisir, dessiner, colonnes = 4 }) {
    const element = document.createElement('div');
    element.className = 'palette';
    element.id = `palette-${bouton.id}`;
    element.hidden = true;
    element.setAttribute('role', 'dialog');
    element.setAttribute('aria-label', titre);
    const entete = document.createElement('p');
    entete.className = 'etiquette palette-titre';
    entete.textContent = titre;
    const grille = document.createElement('div');
    grille.className = colonnes === 1 ? 'liste-choix' : 'grille-pastilles';
    grille.setAttribute('role', 'group');
    grille.setAttribute('aria-label', titre);

    const pastilles = choix.map((un) => {
      const pastille = document.createElement('button');
      pastille.type = 'button';
      pastille.className = colonnes === 1 ? 'choix' : 'pastille';
      pastille.setAttribute('aria-label', un.nom);
      pastille.setAttribute('aria-pressed', 'false');
      pastille.title = un.nom;
      pastille.dataset.valeur = un.valeur ?? '';
      pastille.append(...dessiner(un));
      pastille.addEventListener('click', () => {
        choisir(un.valeur);
        this.fermerPalette();
      });
      return pastille;
    });
    grille.append(...pastilles);
    element.append(entete, grille);
    document.body.appendChild(element);

    // À la souris ou au doigt, la feuille garde le focus (clavier du téléphone compris).
    element.addEventListener('mousedown', (e) => e.preventDefault());
    element.addEventListener('keydown', (e) => {
      if (e.key === 'Tab') {
        // Tabulation : on referme la palette et on revient au bouton.
        e.preventDefault();
        this.fermerPalette({ rendreFocus: true });
        return;
      }
      naviguerDansGrille(e, pastilles, colonnes);
    });

    bouton.setAttribute('aria-controls', element.id);
    bouton.setAttribute('aria-expanded', 'false');
    const palette = { element, bouton, pastilles };
    bouton.addEventListener('click', (e) => {
      if (this.paletteOuverte === palette) this.fermerPalette();
      else this.ouvrirPalette(palette, e.detail === 0); // detail 0 : activé au clavier
    });
    return palette;
  }

  ouvrirPalette(palette, auClavier) {
    this.fermerPalette();
    this.paletteOuverte = palette;
    palette.element.hidden = false;
    palette.bouton.setAttribute('aria-expanded', 'true');
    positionnerSous(palette.element, palette.bouton);
    if (auClavier) {
      const choisie = palette.pastilles.find((p) => p.getAttribute('aria-pressed') === 'true') ?? palette.pastilles[0];
      choisie.focus();
    }
  }

  fermerPalette({ rendreFocus = false } = {}) {
    const palette = this.paletteOuverte;
    if (!palette) return;
    this.paletteOuverte = null;
    palette.element.hidden = true;
    palette.bouton.setAttribute('aria-expanded', 'false');
    if (rendreFocus) palette.bouton.focus();
  }

  // --- Affichage de l'état ------------------------------------------------------

  mettreAJour(etat) {
    const b = this.boutons;
    b.annuler.disabled = !etat.peutAnnuler;
    b.retablir.disabled = !etat.peutRetablir;
    const presse = (nom, oui) => b[nom].setAttribute('aria-pressed', oui ? 'true' : 'false');
    presse('gras', etat.gras);
    presse('italique', etat.italique);
    presse('souligne', etat.souligne);
    presse('barre', etat.barre);
    presse('aligner-gauche', !etat.actif || etat.alignement === 'left');
    presse('aligner-centre', etat.alignement === 'center');
    presse('aligner-droite', etat.alignement === 'right');
    presse('justifier', etat.alignement === 'justify');
    presse('liste-puces', etat.liste === 'UL');
    presse('liste-numeros', etat.liste === 'OL');

    if (document.activeElement !== this.choixStyle) this.choixStyle.value = etat.style ?? 'p';
    if (document.activeElement !== this.choixPolice) this.choixPolice.value = etat.police ?? 'literata';
    if (document.activeElement !== this.choixTaille) {
      const taille = etat.actif ? etat.taille : TAILLE_PAR_DEFAUT;
      if (TAILLES.includes(taille)) {
        this.choixTaille.value = String(taille);
      } else {
        this.optionTailleAutre.textContent = taille == null ? '–' : String(taille);
        this.optionTailleAutre.label = taille == null ? 'Tailles mélangées' : `${taille}`;
        this.choixTaille.value = 'autre';
      }
    }

    this.afficherCouleur(this.paletteCouleur, etat.couleur ?? null);
    this.afficherCouleur(this.paletteSurlignage, etat.surlignage ?? null);
    afficherChoix(this.paletteInterligne, etat.interligne ?? null);
  }

  afficherCouleur(palette, valeur) {
    afficherChoix(palette, valeur);
    const temoin = palette.bouton.querySelector('.temoin');
    temoin.style.background = valeur ?? '';
    temoin.toggleAttribute('data-aucun', !valeur && palette === this.paletteSurlignage);
  }
}

/** Marque le choix actuel d'une palette (aria-pressed). */
function afficherChoix(palette, valeur) {
  for (const p of palette.pastilles) p.setAttribute('aria-pressed', (p.dataset.valeur || null) === valeur ? 'true' : 'false');
}

function iconeCoche() {
  const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  svg.setAttribute('class', 'icone coche');
  svg.setAttribute('aria-hidden', 'true');
  const use = document.createElementNS('http://www.w3.org/2000/svg', 'use');
  use.setAttribute('href', '#i-coche');
  svg.append(use);
  return svg;
}

/** Contenu d'une pastille de couleur. `sansValeur` : « auto » (texte) ou « aucun » (surlignage). */
function pastilleDeCouleur(couleur, sansValeur) {
  const echantillon = document.createElement('span');
  echantillon.className = 'echantillon';
  if (couleur.valeur) echantillon.style.background = couleur.valeur;
  else echantillon.dataset[sansValeur] = '';
  echantillon.append(iconeCoche());
  const nom = document.createElement('span');
  nom.textContent = couleur.nom;
  nom.setAttribute('aria-hidden', 'true');
  return [echantillon, nom];
}

/** Place un panneau sous un bouton, sans dépasser de l'écran. */
function positionnerSous(panneau, bouton) {
  const r = bouton.getBoundingClientRect();
  const largeurVue = document.documentElement.clientWidth;
  const hauteurVue = window.visualViewport?.height ?? window.innerHeight;
  const largeur = panneau.offsetWidth;
  const hauteur = panneau.offsetHeight;
  const gauche = Math.max(8, Math.min(r.left, largeurVue - largeur - 8));
  let haut = r.bottom + 6;
  if (haut + hauteur > hauteurVue - 8) haut = Math.max(8, r.top - hauteur - 6);
  panneau.style.left = `${gauche}px`;
  panneau.style.top = `${haut}px`;
}

/** Flèches du clavier pour se déplacer dans une grille de boutons. */
function naviguerDansGrille(e, boutons, colonnes) {
  const i = boutons.indexOf(document.activeElement);
  if (i < 0) return;
  const cibles = { ArrowRight: i + 1, ArrowLeft: i - 1, ArrowDown: i + colonnes, ArrowUp: i - colonnes, Home: 0, End: boutons.length - 1 };
  if (!(e.key in cibles)) return;
  e.preventDefault();
  const j = Math.max(0, Math.min(boutons.length - 1, cibles[e.key]));
  boutons[j].focus();
}
