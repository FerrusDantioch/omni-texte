// Fenêtre « À propos », clavier, lecteurs d'écran, animations.

import { test, expect, ouvrir, remplir, VERSION } from './aides.js';

test.beforeEach(async ({ page }) => {
  await ouvrir(page);
});

test('fenêtre « À propos » : contenu exact, Échap et bouton « Fermer », retour du focus', async ({ page }) => {
  await page.click('#bouton-menu');
  await page.click('#bouton-a-propos');
  const fenetre = page.locator('#fenetre-a-propos');
  await expect(fenetre).toBeVisible();
  await expect(fenetre.locator('img')).toHaveAttribute('src', 'assets/logo-omni-systeme.webp');
  await expect(fenetre.locator('.nom-application')).toHaveText('Omni-Texte');
  await expect(fenetre.locator('.version')).toHaveText(`Version ${VERSION}`);
  await expect(fenetre).toContainText('Application réalisée par Ferrus Dantioch, avec l\'aide de Claude (Anthropic).');
  await expect(fenetre).toContainText('Tes documents restent sur cet appareil. Aucun compte, aucune donnée envoyée.');
  const contact = fenetre.locator('a.contact');
  await expect(contact).toHaveAttribute('href', 'mailto:omni-systeme.choking513@passmail.net');
  await expect(contact).toHaveText('omni-systeme.choking513@passmail.net');
  const lien = fenetre.locator('a.lien-omni');
  await expect(lien).toHaveAttribute('href', 'https://ferrusdantioch.github.io/omni-systeme/');
  await expect(lien).toHaveAttribute('target', '_blank');
  await expect(lien).toHaveAttribute('rel', 'noopener');
  // Échap ferme, le focus revient sur le bouton « À propos ».
  await page.keyboard.press('Escape');
  await expect(fenetre).toBeHidden();
  await expect(page.locator('#bouton-a-propos')).toBeFocused();
  // Bouton « Fermer » visible.
  await page.click('#bouton-a-propos');
  await fenetre.getByRole('button', { name: 'Fermer' }).click();
  await expect(fenetre).toBeHidden();
  await expect(page.locator('#bouton-a-propos')).toBeFocused();
  // Échap ferme ensuite le menu, le focus revient sur « Menu ».
  await page.keyboard.press('Escape');
  await expect(page.locator('#fenetre-menu')).toBeHidden();
  await expect(page.locator('#bouton-menu')).toBeFocused();
});

test('tout s’utilise au clavier : lien d’évitement, menu, thème, retour du focus', async ({ page }) => {
  // Première pression sur Tab après l'ouverture : le lien d'évitement.
  await page.keyboard.press('Tab');
  await expect(page.locator('#lien-evitement')).toBeFocused();
  await expect(page.locator('#lien-evitement')).toBeInViewport();
  await page.keyboard.press('Enter');
  await expect(page.locator('#feuille')).toBeFocused();
  // Ouvrir le menu au clavier et changer de thème avec les flèches.
  await page.locator('#bouton-menu').focus();
  await page.keyboard.press('Enter');
  await expect(page.getByRole('radio', { name: 'Omni-système' })).toBeFocused();
  await page.keyboard.press('ArrowDown');
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'sombre');
  // La touche Tab reste dans la fenêtre.
  for (let i = 0; i < 8; i++) await page.keyboard.press('Tab');
  expect(await page.evaluate(() => Boolean(document.activeElement.closest('#fenetre-menu')))).toBe(true);
  await page.keyboard.press('Escape');
  await expect(page.locator('#bouton-menu')).toBeFocused();
});

test('palette au clavier : flèches, Entrée, Échap', async ({ page }) => {
  await remplir(page, '<p>mot</p>');
  await page.evaluate(() => {
    const plage = document.createRange();
    plage.selectNodeContents(document.querySelector('#feuille p'));
    getSelection().removeAllRanges();
    getSelection().addRange(plage);
  });
  await page.locator('#bouton-couleur').focus();
  await page.keyboard.press('Enter');
  await expect(page.locator('.palette:not([hidden]) .pastille[aria-label="Automatique"]')).toBeFocused();
  await page.keyboard.press('ArrowDown'); // Rouge (2e ligne)
  await expect(page.locator('.palette:not([hidden]) .pastille[aria-label="Rouge"]')).toBeFocused();
  await page.keyboard.press('Enter');
  await expect(page.locator('.palette:not([hidden])')).toHaveCount(0);
  expect(await page.locator('#feuille').innerHTML()).toBe('<p><span style="color: rgb(229, 72, 77);">mot</span></p>');
  await page.locator('#bouton-couleur').focus();
  await page.keyboard.press('Enter');
  await page.keyboard.press('Escape');
  await expect(page.locator('.palette:not([hidden])')).toHaveCount(0);
  await expect(page.locator('#bouton-couleur')).toBeFocused();
});

test('chaque bouton a un nom en français, l’enregistrement est annoncé', async ({ page }) => {
  const sansNom = await page.evaluate(() =>
    [...document.querySelectorAll('button, select, input:not([type="file"])')]
      .filter((e) => !(e.getAttribute('aria-label') || e.textContent.trim() || e.labels?.[0]?.textContent.trim()))
      .map((e) => e.outerHTML.slice(0, 80)),
  );
  expect(sansNom).toEqual([]);
  await expect(page.locator('#etat-enregistrement')).toHaveAttribute('role', 'status');
  await expect(page.locator('#feuille')).toHaveAttribute('role', 'textbox');
  await expect(page.locator('#feuille')).toHaveAttribute('lang', 'fr');
  // Le correcteur de l'application remplace celui du navigateur (pas de double soulignement).
  await expect(page.locator('#feuille')).toHaveAttribute('spellcheck', 'false');
});

test('sur ordinateur, la barre d’outils passe à la ligne : pas de flèches de défilement', async ({ page }) => {
  await expect(page.locator('.defilement-gauche')).toBeHidden();
  await expect(page.locator('.defilement-droite')).toBeHidden();
  await expect(page.locator('[data-commande="effacer"]')).toBeInViewport();
});

test('focus visible : contour de 2 px couleur halo, décalé de 3 px', async ({ page }) => {
  await page.locator('#bouton-menu').focus();
  await page.keyboard.press('Shift+Tab');
  await page.keyboard.press('Tab');
  const contour = await page.locator('#bouton-menu').evaluate((b) => {
    const s = getComputedStyle(b);
    return { style: s.outlineStyle, largeur: s.outlineWidth, decalage: s.outlineOffset, couleur: s.outlineColor };
  });
  expect(contour).toEqual({ style: 'solid', largeur: '2px', decalage: '3px', couleur: 'rgb(214, 194, 255)' });
});

test('animations : 150 ms au plus, aucune si « réduire les animations » est demandé', async ({ page }) => {
  const durees = await page.evaluate(() =>
    [...document.querySelectorAll('.bouton, .champ-titre, .pastille, .choix-theme')].flatMap((e) =>
      getComputedStyle(e).transitionDuration.split(',').map((d) => parseFloat(d) * 1000),
    ),
  );
  expect(Math.max(...durees)).toBeLessThanOrEqual(150);
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.click('#bouton-menu');
  expect(await page.locator('#fenetre-menu').evaluate((m) => getComputedStyle(m).animationName)).toBe('none');
  expect(await page.locator('.bouton').first().evaluate((b) => getComputedStyle(b).transitionDuration)).toBe('0s');
});
