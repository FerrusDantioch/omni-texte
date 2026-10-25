// Réglages généraux de l'application : c'est le SEUL endroit où changer le
// nom, la version ou l'adresse de contact.
//
// Ce fichier est un script « classique » (pas un module) : il est lu à la
// fois par la page (index.html) et par le service worker (sw.js), qui s'en
// sert pour nommer son cache. Changer la version ici déclenche donc la mise
// à jour de l'application chez les utilisateurs.

self.CONFIG_APP = Object.freeze({
  // Nom affiché partout (titre de l'onglet, fenêtre « À propos »…).
  // Attention : le fichier manifest.webmanifest contient aussi le nom
  // (voir le README, section « Changer le nom »).
  nom: 'Omni-Texte',

  // Numéro de version : à augmenter à chaque publication (ex. 1.0.1).
  version: '1.3.0',

  // Auteur affiché et contact.
  auteur: 'Ferrus Dantioch',
  contact: 'omni-systeme.choking513@passmail.net',
  siteOmni: 'https://ferrusdantioch.github.io/omni-systeme/',

  // Identifiant technique du stockage (base de données, préférences, cache).
  // NE PAS CHANGER : les documents déjà enregistrés deviendraient invisibles.
  idStockage: 'plume',
});
