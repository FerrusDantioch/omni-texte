// Application installable et hors ligne : enregistrement du service worker
// (sw.js), annonce des mises à jour, invitation à l'installation.

let invitation = null; // événement « beforeinstallprompt » gardé pour plus tard
const abonnes = new Set();

window.addEventListener('beforeinstallprompt', (e) => {
  // On n'affiche pas le bandeau automatique du navigateur : l'installation
  // se fait depuis le menu, quand la personne le décide.
  e.preventDefault();
  invitation = e;
  abonnes.forEach((f) => f());
});

window.addEventListener('appinstalled', () => {
  invitation = null;
  abonnes.forEach((f) => f());
});

/** Vrai si l'application tourne déjà comme application installée. */
export function estInstallee() {
  return window.matchMedia('(display-mode: standalone)').matches || navigator.standalone === true;
}

export function installationPossible() {
  return invitation !== null;
}

export function surChangementInstallation(fonction) {
  abonnes.add(fonction);
}

/** Ouvre la fenêtre d'installation du navigateur (Chrome, Edge). */
export async function installer() {
  if (!invitation) return false;
  const evenement = invitation;
  invitation = null;
  await evenement.prompt();
  const { outcome } = await evenement.userChoice;
  abonnes.forEach((f) => f());
  return outcome === 'accepted';
}

/**
 * Enregistre le service worker. Quand une nouvelle version est prête,
 * `surMiseAJour(appliquer)` est appelé ; `appliquer()` installe la nouvelle
 * version et recharge la page (après `avantRechargement`).
 */
export function demarrerServiceWorker({ surMiseAJour, avantRechargement }) {
  if (!('serviceWorker' in navigator) || !window.isSecureContext) return;
  let rechargementDemande = false;
  let masquerAnnonce = null;
  navigator.serviceWorker.addEventListener('controllerchange', () => {
    if (rechargementDemande) {
      window.location.reload();
    } else {
      masquerAnnonce?.();
      masquerAnnonce = null;
    }
  });
  navigator.serviceWorker
    .register('sw.js', { updateViaCache: 'none' })
    .then((enregistrement) => {
      const proposer = (travailleur) => {
        masquerAnnonce?.();
        masquerAnnonce = surMiseAJour(async () => {
          rechargementDemande = true;
          await avantRechargement();
          travailleur.postMessage({ type: 'activer' });
        });
      };
      if (enregistrement.waiting && navigator.serviceWorker.controller) proposer(enregistrement.waiting);
      enregistrement.addEventListener('updatefound', () => {
        const nouveau = enregistrement.installing;
        nouveau?.addEventListener('statechange', () => {
          if (nouveau.state === 'installed' && navigator.serviceWorker.controller) proposer(nouveau);
        });
      });
      // Recherche une mise à jour quand l'application revient au premier plan.
      document.addEventListener('visibilitychange', () => {
        if (document.visibilityState === 'visible') enregistrement.update().catch(() => {});
      });
    })
    .catch((erreur) => console.warn('Service worker non enregistré :', erreur));
}
