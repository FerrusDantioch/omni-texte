// Assemblage de l'application : relie l'éditeur, la barre d'outils, les
// documents, les fenêtres, les thèmes, l'export PDF et le mode hors ligne.

import { creerChoixTheme } from './theme.js';
import {
  creerPreferences, ouvrirStockage, creerSauvegarde, lireSauvegarde, nomFichierSauvegarde, telecharger,
} from './storage.js';
import { Editeur } from './editor.js';
import { BarreOutils } from './barre-outils.js';
import { Documents, titreAffiche } from './documents.js';
import { TiroirDocuments, dateLisible } from './tiroir-documents.js';
import { initialiserFenetres, ouvrirFenetre, demander, informer, afficherMessage, remplirAPropos } from './ui.js';
import { ExportPdf } from './impression.js';
import { Exporteur } from './exporter.js';
import { Recherche } from './recherche.js';
import { Orthographe, correctionPossible } from './orthographe.js';
import { lireFichier, ErreurOuverture } from './importer.js';
import { demarrerServiceWorker, estInstallee, installationPossible, installer, surChangementInstallation } from './pwa.js';

const CONFIG = globalThis.CONFIG_APP;
const $ = (id) => document.getElementById(id);
const formatNombre = new Intl.NumberFormat('fr-FR');
const accorder = (n, mot) => `${formatNombre.format(n)} ${mot}${n > 1 ? 's' : ''}`;

async function demarrer() {
  document.title = CONFIG.nom;
  const preferences = creerPreferences(CONFIG.idStockage);
  initialiserFenetres();
  suivreModaliteSaisie();
  suivreZoneVisible();
  empecherOuvertureDeFichiersDeposes();
  creerChoixTheme({ conteneur: $('choix-themes'), preferences });
  remplirAPropos($('fenetre-a-propos'), CONFIG);

  // --- Éditeur et barre d'outils ---
  const feuille = $('feuille');
  let documents = null;
  let recherche = null;
  let orthographe = null;
  const compteur = creerCompteur($('compteur'));
  const editeur = new Editeur(feuille, {
    surModification: () => {
      documents?.signalerModification();
      compteur.planifier(editeur);
      recherche?.planifier();
      orthographe?.planifier({ frappe: true });
    },
  });
  const barre = new BarreOutils({ barre: $('barre-outils'), editeur });
  editeur.surEtat = (etat) => barre.mettreAJour(etat);

  // Typographie française automatique : activée par défaut.
  const caseTypographie = $('case-typographie');
  editeur.typographie = preferences.lire('typographie', true) !== false;
  caseTypographie.checked = editeur.typographie;
  caseTypographie.addEventListener('change', () => {
    editeur.typographie = caseTypographie.checked;
    preferences.ecrire('typographie', caseTypographie.checked);
  });
  // Correction orthographique : activée par défaut (voir js/orthographe.js).
  orthographe = new Orthographe({ editeur, zone: $('zone-ecriture'), preferences });
  const caseOrthographe = $('case-orthographe');
  caseOrthographe.checked = orthographe.actif;
  if (!correctionPossible) {
    caseOrthographe.disabled = true;
    $('bouton-dictionnaire').disabled = true;
    $('detail-orthographe').textContent = "Ce navigateur ne permet pas la correction intégrée : c'est son propre correcteur qui reste utilisé.";
  }
  caseOrthographe.addEventListener('change', () => orthographe.correcteur.activer(caseOrthographe.checked));

  recherche = new Recherche({
    panneau: $('panneau-recherche'),
    bouton: $('bouton-rechercher'),
    editeur,
    zone: $('zone-ecriture'),
    informer: (texte) => afficherMessage(texte, { duree: 6000 }),
  });

  // --- Documents ---
  const stockage = await ouvrirStockage({ nom: CONFIG.idStockage });
  const champTitre = $('titre-document');
  documents = new Documents({
    stockage,
    preferences,
    editeur,
    champTitre,
    indiquer: creerIndicateur($('etat-enregistrement')),
    surAffichage: () => {
      compteur.planifier(editeur, true);
      recherche.planifier();
      orthographe.planifier({ immediat: true, frappe: false });
    },
  });
  await documents.demarrer();
  editeur.activer(true);

  champTitre.addEventListener('input', () => documents.signalerModification());
  champTitre.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      editeur.focaliser();
    }
  });

  if (stockage.mode !== 'indexeddb') avertirStockage(stockage.mode);

  // Enregistrement immédiat quand la page passe en arrière-plan ou se ferme.
  const enregistrerAvantFermeture = () => {
    documents.ecrireSecours();
    documents.enregistrer();
  };
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'hidden') enregistrerAvantFermeture();
  });
  window.addEventListener('pagehide', enregistrerAvantFermeture);

  // --- Panneau « Mes documents » ---
  new TiroirDocuments({
    fenetre: $('tiroir-documents'),
    liste: $('liste-documents'),
    boutonOuvrir: $('bouton-documents'),
    boutonNouveau: $('bouton-nouveau-document'),
    boutonFichier: $('bouton-ouvrir-fichier'),
    corbeille: {
      fenetre: $('tiroir-corbeille'),
      liste: $('liste-corbeille'),
      bouton: $('bouton-corbeille'),
      libelle: $('libelle-corbeille'),
      boutonRetour: $('bouton-retour-documents'),
      boutonVider: $('bouton-vider-corbeille'),
    },
    documents,
    editeur,
    ouvrirFichier: () => ouvrirUnFichier($('fichier-import'), documents, $('bouton-ouvrir-fichier')),
  });

  // --- Export : PDF (impression), Word, texte brut ---
  const titreDuDocument = () => titreAffiche({ titre: champTitre.value });
  const exportPdf = new ExportPdf({
    preferences,
    fenetreAide: $('fenetre-aide-pdf'),
    titre: titreDuDocument,
    avant: () => documents.enregistrer(),
    feuille,
  });
  // Bouton « Imprimer / PDF » de la barre d'outils : la fenêtre d'impression
  // du navigateur, d'où l'on peut aussi « Enregistrer au format PDF ».
  $('bouton-imprimer').addEventListener('click', (e) => exportPdf.exporter(e.currentTarget));
  new Exporteur({
    fenetre: $('fenetre-export'),
    bouton: $('bouton-exporter'),
    exportPdf,
    editeur,
    titre: titreDuDocument,
    avant: () => documents.enregistrer(),
    application: CONFIG.nom,
  });

  // --- Menu ---
  const menu = $('fenetre-menu');
  const boutonMenu = $('bouton-menu');
  boutonMenu.addEventListener('click', () => {
    ouvrirFenetre(menu, { declencheur: boutonMenu });
    placerMenu(menu, boutonMenu);
    menu.querySelector('input[name="theme"]:checked')?.focus();
  });
  $('bouton-sauvegarder').addEventListener('click', async () => {
    menu.close();
    await sauvegarderTout(documents);
  });
  const fichier = $('fichier-restauration');
  $('bouton-restaurer').addEventListener('click', () => {
    menu.close();
    fichier.value = '';
    fichier.click();
  });
  fichier.addEventListener('change', () => {
    if (fichier.files?.[0]) restaurer(fichier.files[0], documents, boutonMenu);
  });
  $('bouton-installer').addEventListener('click', (e) => {
    preparerAideInstallation();
    ouvrirFenetre($('fenetre-installation'), { declencheur: e.currentTarget, repli: boutonMenu });
  });
  $('bouton-installer-maintenant').addEventListener('click', async () => {
    if (await installer()) $('fenetre-installation').close();
  });
  surChangementInstallation(preparerAideInstallation);
  const fenetreDictionnaire = $('fenetre-dictionnaire');
  let arreterDictionnaire = null;
  $('bouton-dictionnaire').addEventListener('click', (e) => {
    arreterDictionnaire = orthographe.afficherDictionnaire($('contenu-dictionnaire'));
    ouvrirFenetre(fenetreDictionnaire, { declencheur: e.currentTarget, repli: boutonMenu });
  });
  fenetreDictionnaire.addEventListener('close', () => arreterDictionnaire?.());
  $('bouton-a-propos').addEventListener('click', (e) => {
    ouvrirFenetre($('fenetre-a-propos'), { declencheur: e.currentTarget, repli: boutonMenu });
  });

  // --- Raccourcis clavier généraux ---
  document.addEventListener('keydown', (e) => {
    if (!(e.ctrlKey || e.metaKey) || e.altKey || e.isComposing) return;
    const touche = e.key.toLowerCase();
    if (touche === 's') {
      e.preventDefault();
      documents.enregistrer({ forcer: true }).then((ok) => {
        if (ok) afficherMessage('Enregistré.', { duree: 2000 });
      });
      return;
    }
    if (touche === 'p') {
      e.preventDefault();
      if (!document.querySelector('dialog[open]')) exportPdf.exporter(document.activeElement);
      return;
    }
    // Ctrl+F : rechercher ; Ctrl+H : remplacer (même panneau).
    if ((touche === 'f' || touche === 'h') && !e.shiftKey) {
      if (document.querySelector('dialog[open]')) return;
      e.preventDefault();
      recherche.ouvrir();
      return;
    }
    // Annuler / Rétablir : sauf dans un champ de saisie (titre…), qui garde
    // son propre historique.
    const dansUnChamp = e.target.closest?.('input, textarea, select');
    if (dansUnChamp || document.querySelector('dialog[open]')) return;
    if (touche === 'z' && !e.shiftKey) {
      e.preventDefault();
      editeur.annuler();
    } else if (touche === 'y' || (touche === 'z' && e.shiftKey)) {
      e.preventDefault();
      editeur.retablir();
    }
  });

  $('lien-evitement').addEventListener('click', (e) => {
    e.preventDefault();
    editeur.focaliser();
  });

  // --- Hors ligne et mises à jour ---
  demarrerServiceWorker({
    surMiseAJour: (appliquer) =>
      afficherMessage('Une nouvelle version est disponible.', { action: 'Recharger', surAction: appliquer, duree: 0 }),
    avantRechargement: () => documents.enregistrer(),
  });
}

// --- Indicateur d'enregistrement et compteur --------------------------------

function creerIndicateur(element) {
  const heure = new Intl.DateTimeFormat('fr-FR', { hour: '2-digit', minute: '2-digit' });
  let dernier = '';
  return (etat, dateIso) => {
    let texte = 'Modification…';
    if (etat === 'erreur') texte = "Erreur d'enregistrement";
    else if (etat === 'enregistre') {
      const date = dateIso ? new Date(dateIso) : new Date();
      const aujourdhui = date.toDateString() === new Date().toDateString();
      texte = aujourdhui ? `Enregistré à ${heure.format(date)}` : `Enregistré le ${dateLisible(dateIso)}`;
    }
    element.dataset.etat = etat;
    // On ne réécrit pas un texte identique (évite des annonces répétées).
    if (texte !== dernier) {
      element.textContent = texte;
      dernier = texte;
    }
    if (etat === 'erreur') {
      afficherMessage("Le document n'a pas pu être enregistré. Fais une sauvegarde depuis le menu par précaution.", { duree: 8000 });
    }
  };
}

function creerCompteur(element) {
  let minuterie = 0;
  const afficher = (editeur) => {
    const { mots, caracteres } = editeur.compter();
    element.textContent = `${accorder(mots, 'mot')} · ${accorder(caracteres, 'caractère')}`;
  };
  return {
    planifier(editeur, immediat = false) {
      clearTimeout(minuterie);
      if (immediat) afficher(editeur);
      else minuterie = setTimeout(() => afficher(editeur), 200);
    },
  };
}

// --- Sauvegarde et restauration par fichier ----------------------------------

async function sauvegarderTout(documents) {
  await documents.enregistrer();
  const tous = await documents.lister();
  const contenu = JSON.stringify(creerSauvegarde(tous, CONFIG), null, 1);
  telecharger(nomFichierSauvegarde(CONFIG), contenu);
  afficherMessage(`Sauvegarde téléchargée : ${accorder(tous.length, 'document')}.`);
}

async function restaurer(fichier, documents, declencheur) {
  let liste;
  try {
    liste = lireSauvegarde(await fichier.text(), CONFIG);
  } catch (erreur) {
    await informer({ titre: 'Restauration impossible', message: erreur.message, declencheur });
    return;
  }
  const confirme = await demander({
    titre: 'Restaurer une sauvegarde',
    message: `Ce fichier contient ${accorder(liste.length, 'document')}. Ils seront ajoutés à tes documents actuels. Aucun document existant ne sera remplacé.`,
    confirmer: 'Ajouter les documents',
    annuler: 'Annuler',
    declencheur,
  });
  if (!confirme) return;
  try {
    const { ajoutes, dejaPresents } = await documents.restaurer(liste);
    let message = `${accorder(ajoutes, 'document')} ${ajoutes > 1 ? 'ajoutés' : 'ajouté'}.`;
    if (dejaPresents > 0) {
      message += ` ${accorder(dejaPresents, 'document')} ${dejaPresents > 1 ? 'étaient' : 'était'} déjà ${dejaPresents > 1 ? 'présents' : 'présent'} à l'identique : rien n'a été ajouté en double.`;
    }
    await informer({ titre: 'Restauration terminée', message, declencheur });
  } catch (erreur) {
    console.warn('Erreur de restauration :', erreur);
    await informer({
      titre: 'Restauration interrompue',
      message: "Une erreur s'est produite pendant l'ajout des documents. Les documents déjà ajoutés sont conservés.",
      declencheur,
    });
  }
}

// --- Ouvrir un fichier Word ou texte -------------------------------------------

let choixEnAttente = null;

/** Ouvre la fenêtre de choix de fichier ; renvoie le fichier choisi, ou null. */
function choisirFichier(champ) {
  choixEnAttente?.(null); // un choix précédent resté sans réponse
  return new Promise((resoudre) => {
    const terminer = () => {
      champ.removeEventListener('change', terminer);
      champ.removeEventListener('cancel', terminer);
      choixEnAttente = null;
      resoudre(champ.files?.[0] ?? null);
    };
    choixEnAttente = (valeur) => {
      champ.removeEventListener('change', terminer);
      champ.removeEventListener('cancel', terminer);
      resoudre(valeur);
    };
    champ.addEventListener('change', terminer);
    champ.addEventListener('cancel', terminer);
    champ.value = '';
    champ.click();
  });
}

/** Choisit un fichier et en fait un nouveau document. Renvoie true si c'est fait. */
async function ouvrirUnFichier(champ, documents, declencheur) {
  const fichier = await choisirFichier(champ);
  if (!fichier) return false;
  let lu;
  try {
    lu = await lireFichier(fichier);
  } catch (erreur) {
    if (!(erreur instanceof ErreurOuverture)) console.warn("Ouverture d'un fichier impossible :", erreur);
    const message = erreur instanceof ErreurOuverture ? erreur.message : "Ce fichier n'a pas pu être ouvert.";
    await informer({ titre: 'Ouverture impossible', message, declencheur });
    return false;
  }
  let doc;
  try {
    doc = await documents.importer(lu);
  } catch (erreur) {
    console.warn("Création du document impossible :", erreur);
    await informer({
      titre: 'Ouverture impossible',
      message: "Le fichier a été lu, mais le document n'a pas pu être créé. L'espace de stockage de l'appareil est peut-être plein.",
      declencheur,
    });
    return false;
  }
  const ouvert = `« ${titreAffiche(doc)} » est ouvert dans un nouveau document. Le fichier d'origine n'est pas modifié.`;
  if (lu.remarques.length) await informer({ titre: 'Fichier ouvert', message: `${ouvert} ${lu.remarques.join(' ')}`, declencheur });
  else afficherMessage(ouvert, { duree: 6000 });
  return true;
}

// --- Aides diverses -------------------------------------------------------------

function avertirStockage(mode) {
  const message =
    mode === 'localstorage'
      ? 'Le stockage principal du navigateur est indisponible. Tes documents sont gardés dans un stockage de secours, plus petit. Pense à faire des sauvegardes depuis le menu.'
      : "Ce navigateur n'autorise pas l'enregistrement (navigation privée ?). Tes documents seront perdus à la fermeture de la page. Utilise « Sauvegarder tous mes documents » dans le menu.";
  afficherMessage(message, { duree: 0 });
}

function preparerAideInstallation() {
  $('installation-deja-faite').hidden = !estInstallee();
  $('bouton-installer-maintenant').hidden = !installationPossible();
}

/** Place le menu sous son bouton, aligné à droite. */
function placerMenu(menu, bouton) {
  const r = bouton.getBoundingClientRect();
  const largeurVue = document.documentElement.clientWidth;
  menu.style.top = `${Math.round(r.bottom + 6)}px`;
  menu.style.right = `${Math.max(8, Math.round(largeurVue - r.right))}px`;
  menu.style.left = 'auto';
  menu.style.maxHeight = `calc(100dvh - ${Math.round(r.bottom + 18)}px)`;
}

/** Clavier ou pointeur ? Sert à n'afficher le contour de la feuille qu'au clavier. */
function suivreModaliteSaisie() {
  const racine = document.documentElement;
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Tab') racine.dataset.modalite = 'clavier';
  });
  document.addEventListener('pointerdown', () => {
    racine.dataset.modalite = 'pointeur';
  });
}

/**
 * Sur téléphone, le clavier virtuel réduit la zone visible : la hauteur de
 * l'application suit cette zone, pour que la barre d'outils reste visible.
 */
function suivreZoneVisible() {
  const zone = window.visualViewport;
  if (!zone) return;
  const racine = document.documentElement;
  const mettreAJour = () => {
    if (Math.abs(zone.scale - 1) > 0.01) return; // zoom manuel : on ne touche à rien
    racine.style.setProperty('--hauteur-visible', `${Math.round(zone.height)}px`);
    racine.style.setProperty('--decalage-visible', `${Math.round(zone.offsetTop)}px`);
    garderCurseurVisible();
  };
  zone.addEventListener('resize', mettreAJour);
  zone.addEventListener('scroll', mettreAJour);
  mettreAJour();
}

function garderCurseurVisible() {
  const selection = document.getSelection();
  const feuille = $('feuille');
  if (!selection?.rangeCount || document.activeElement !== feuille) return;
  const rect = selection.getRangeAt(0).getBoundingClientRect();
  const zone = $('zone-ecriture').getBoundingClientRect();
  if (rect.height === 0 && rect.top === 0) return;
  if (rect.bottom > zone.bottom - 12) $('zone-ecriture').scrollBy({ top: rect.bottom - zone.bottom + 48 });
  else if (rect.top < zone.top + 12) $('zone-ecriture').scrollBy({ top: rect.top - zone.top - 48 });
}

/** Un fichier déposé hors de la feuille ne doit pas remplacer l'application. */
function empecherOuvertureDeFichiersDeposes() {
  window.addEventListener('dragover', (e) => e.preventDefault());
  window.addEventListener('drop', (e) => e.preventDefault());
}

demarrer().catch((erreur) => {
  console.warn('Démarrage impossible :', erreur);
  afficherMessage(
    "L'application n'a pas pu démarrer. Recharge la page. Si le problème continue, écris à l'adresse indiquée dans « À propos ».",
    { duree: 0 },
  );
});
