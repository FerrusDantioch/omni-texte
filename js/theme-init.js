// Applique le thème mémorisé AVANT le premier affichage (pas de flash).
(function () {
  try {
    var config = self.CONFIG_APP, racine = document.documentElement, theme = 'omni';
    var lu = JSON.parse(localStorage.getItem(config.idStockage + '.theme'));
    if (lu === 'sombre' || lu === 'clair') theme = lu;
    racine.setAttribute('data-theme', theme);
    var styles = getComputedStyle(racine);
    document.querySelector('meta[name="theme-color"]').setAttribute('content', styles.getPropertyValue('--surface').trim());
    document.querySelector('meta[name="color-scheme"]').setAttribute('content', styles.getPropertyValue('color-scheme').trim());
    document.title = config.nom;
  } catch (e) {}
})();
