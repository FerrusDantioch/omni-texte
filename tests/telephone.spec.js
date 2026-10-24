// Téléphone : écran étroit (390 × 844) et écran tactile.

import { test, expect, ouvrir, contenu, remplir, selectionner } from './aides.js';

test.beforeEach(async ({ page }) => {
  await ouvrir(page);
});

test('aucun défilement horizontal de la page, feuille sur toute la largeur', async ({ page }) => {
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  const feuille = await page.locator('#feuille').boundingBox();
  expect(feuille.x).toBe(0);
  expect(feuille.width).toBe(390);
  // Texte du document lisible : 12 pt = 16 px.
  expect(await page.locator('#feuille').evaluate((f) => getComputedStyle(f).fontSize)).toBe('16px');
});

test('la barre d’outils tient sur une ligne et défile horizontalement', async ({ page }) => {
  const barre = await page.locator('#barre-outils').evaluate((b) => ({
    defile: b.scrollWidth > b.clientWidth,
    debordement: getComputedStyle(b).overflowX,
    retourALaLigne: getComputedStyle(b).flexWrap,
    hauteur: b.offsetHeight,
  }));
  expect(barre).toMatchObject({ defile: true, debordement: 'auto', retourALaLigne: 'nowrap' });
  expect(barre.hauteur).toBeLessThan(70);
  // Le dernier bouton devient accessible en faisant défiler la barre.
  const dernier = page.locator('[data-commande="effacer"]');
  await dernier.scrollIntoViewIfNeeded();
  await expect(dernier).toBeInViewport();
});

test('des flèches montrent qu’il reste des boutons et font défiler la barre', async ({ page }) => {
  const barre = page.locator('#barre-outils');
  const gauche = page.locator('.defilement-gauche');
  const droite = page.locator('.defilement-droite');
  const position = () => barre.evaluate((b) => b.scrollLeft);
  // Au départ : des boutons sont cachés à droite seulement.
  await expect(droite).toBeVisible();
  await expect(gauche).toBeHidden();
  const zone = await droite.boundingBox();
  expect(zone.width).toBeGreaterThanOrEqual(44);
  expect(zone.height).toBeGreaterThanOrEqual(44);
  expect(zone.x + zone.width).toBeCloseTo(390, 0);

  // Toucher la flèche fait avancer la barre, sans retirer le focus de la feuille.
  await page.locator('#feuille').tap();
  await droite.tap();
  expect(await position()).toBeGreaterThan(150);
  await expect(gauche).toBeVisible();
  expect(await page.evaluate(() => document.activeElement.id)).toBe('feuille');

  // Jusqu'au bout : la flèche de droite disparaît, le dernier bouton est visible.
  const toucherTantQueVisible = async (fleche) => {
    for (let i = 0; i < 10 && (await fleche.isVisible()); i++) {
      await fleche.tap();
      await page.waitForTimeout(150); // le temps que la barre signale son défilement
    }
  };
  await toucherTantQueVisible(droite);
  await expect(droite).toBeHidden();
  await expect(page.locator('[data-commande="effacer"]')).toBeInViewport();

  // Retour au début avec la flèche de gauche.
  await toucherTantQueVisible(gauche);
  await expect(gauche).toBeHidden();
  expect(await position()).toBe(0);

  // Un glissement au doigt met aussi les flèches à jour.
  await barre.evaluate((b) => b.scrollTo({ left: 200 }));
  await expect(gauche).toBeVisible();
  await expect(droite).toBeVisible();
});

test('la fenêtre « Exporter » tient dans l’écran, avec de grandes zones à toucher', async ({ page }) => {
  await page.tap('#bouton-exporter');
  const fenetre = await page.locator('#fenetre-export').boundingBox();
  expect(fenetre.x).toBeGreaterThanOrEqual(0);
  expect(fenetre.x + fenetre.width).toBeLessThanOrEqual(390);
  expect(fenetre.y + fenetre.height).toBeLessThanOrEqual(844);
  for (const choix of await page.locator('.option-export').all()) {
    const zone = await choix.boundingBox();
    expect(zone.height).toBeGreaterThanOrEqual(44);
  }
});

test('rechercher et remplacer tient dans l’écran, sans défilement horizontal', async ({ page }) => {
  await remplir(page, '<p>un mot, un autre mot</p>');
  await page.tap('#bouton-rechercher');
  await expect(page.locator('#champ-recherche')).toBeFocused();
  await page.keyboard.type('mot');
  await expect(page.locator('#resultat-recherche')).toHaveText(/sur 2$/);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  const elements = await page.locator('#panneau-recherche').evaluate((panneau) =>
    [...panneau.querySelectorAll('input, button, .resultat-recherche')].map((e) => {
      const r = e.getBoundingClientRect();
      return { nom: e.getAttribute('aria-label') || e.textContent.trim(), gauche: r.left, droite: r.right, largeur: r.width, hauteur: r.height, bouton: e.nodeName === 'BUTTON' };
    }),
  );
  for (const e of elements) {
    expect(e.gauche, e.nom).toBeGreaterThanOrEqual(0);
    expect(e.droite, e.nom).toBeLessThanOrEqual(390);
    if (e.bouton) expect(Math.min(e.largeur, e.hauteur), e.nom).toBeGreaterThanOrEqual(44);
  }
  // Les champs restent assez larges pour y écrire.
  for (const e of elements.filter((x) => !x.bouton && x.nom !== '' && !/sur/.test(x.nom))) expect(e.largeur, e.nom).toBeGreaterThanOrEqual(100);
  await page.tap('[data-action="tout-remplacer"]');
  expect(await contenu(page)).toBe('<p>un , un autre </p>');
});

test('interligne et corbeille au doigt', async ({ page }) => {
  await remplir(page, '<p>texte</p>');
  await selectionner(page, 'texte');
  const bouton = page.locator('#bouton-interligne');
  await bouton.scrollIntoViewIfNeeded();
  await page.waitForTimeout(200); // la barre a fini de défiler
  await bouton.tap();
  const palette = page.locator('.palette:not([hidden])');
  await expect(palette).toBeVisible();
  const boite = await palette.boundingBox();
  expect(boite.x).toBeGreaterThanOrEqual(0);
  expect(boite.x + boite.width).toBeLessThanOrEqual(390);
  await palette.locator('.choix', { hasText: 'Double' }).tap();
  expect(await contenu(page)).toBe('<p style="line-height: 2;">texte</p>');

  // Corbeille : boutons de 44 px au moins, panneau dans l'écran.
  await page.tap('#bouton-documents');
  await page.getByRole('button', { name: 'Mettre « Sans titre » à la corbeille' }).tap();
  await page.tap('#bouton-corbeille');
  const corbeille = page.locator('#tiroir-corbeille');
  await expect(corbeille).toBeVisible();
  const zone = await corbeille.boundingBox();
  expect(zone.x + zone.width).toBeLessThanOrEqual(390);
  for (const b of await corbeille.locator('button:visible').all()) {
    const r = await b.boundingBox();
    expect(Math.min(r.width, r.height)).toBeGreaterThanOrEqual(44);
    expect(r.x + r.width).toBeLessThanOrEqual(390);
  }
});

test('tous les boutons font au moins 44 × 44 px', async ({ page }) => {
  const trop_petits = await page.evaluate(() =>
    [...document.querySelectorAll('.barre-app button, .barre-app input, .barre-outils button, .barre-outils select')]
      .map((e) => {
        const r = e.getBoundingClientRect();
        return { nom: e.getAttribute('aria-label') || e.textContent.trim() || e.id, largeur: r.width, hauteur: r.height };
      })
      .filter((b) => b.largeur < 44 || b.hauteur < 44),
  );
  expect(trop_petits).toEqual([]);
  // Mêmes règles dans le menu et dans le panneau des documents.
  await page.tap('#bouton-menu');
  const menu = await page.locator('#fenetre-menu').boundingBox();
  expect(menu.x).toBeGreaterThanOrEqual(0);
  expect(menu.x + menu.width).toBeLessThanOrEqual(390);
  const petitsDansMenu = await page.locator('#fenetre-menu button, #fenetre-menu label').evaluateAll((liste) =>
    liste.filter((e) => e.getBoundingClientRect().height < 44).map((e) => e.textContent.trim()),
  );
  expect(petitsDansMenu).toEqual([]);
});

test('au doigt : mise en forme d’une sélection et palette de couleurs', async ({ page }) => {
  await remplir(page, '<p>un deux trois</p>');
  await selectionner(page, 'deux');
  await page.tap('[data-commande="gras"]');
  expect(await contenu(page)).toBe('<p>un <b>deux</b> trois</p>');
  // La feuille garde le focus (le clavier du téléphone ne se ferme pas).
  expect(await page.evaluate(() => document.activeElement.id)).toBe('feuille');

  await selectionner(page, 'trois');
  const couleur = page.locator('#bouton-couleur');
  await couleur.scrollIntoViewIfNeeded();
  await couleur.tap();
  const palette = page.locator('.palette:not([hidden])');
  await expect(palette).toBeVisible();
  const boite = await palette.boundingBox();
  expect(boite.x).toBeGreaterThanOrEqual(0);
  expect(boite.x + boite.width).toBeLessThanOrEqual(390);
  await palette.locator('.pastille[aria-label="Vert"]').tap();
  await expect(palette).toBeHidden();
  expect(await contenu(page)).toBe('<p>un <b>deux</b> <span style="color: rgb(48, 164, 108);">trois</span></p>');
  expect(await page.evaluate(() => document.activeElement.id)).toBe('feuille');
});

test('captures d’écran sur téléphone (contrôle visuel)', async ({ page }, infos) => {
  await page.fill('#titre-document', 'Notes de lecture');
  await page.evaluate(() => {
    const feuille = document.getElementById('feuille');
    feuille.innerHTML =
      '<h1>Chapitre un</h1><p>Il était une fois un <b>texte</b> écrit sur un téléphone, avec un mot <span style="background-color: rgb(140, 233, 154);">surligné</span>.</p>';
    feuille.dispatchEvent(new InputEvent('input', { inputType: 'insertText', bubbles: true }));
  });
  await page.screenshot({ path: infos.outputPath('telephone.png') });
  await page.tap('#bouton-menu');
  await page.waitForTimeout(300);
  await page.screenshot({ path: infos.outputPath('telephone-menu.png') });
  await page.keyboard.press('Escape');
  await page.tap('#bouton-documents');
  await page.waitForTimeout(300);
  await page.screenshot({ path: infos.outputPath('telephone-documents.png') });
});

test('au doigt : toucher un mot souligné ouvre une bulle lisible, aux grandes zones à toucher', async ({ page }, infos) => {
  await remplir(page, '<p>Il était une fois une maizon au bord de la mer.</p>');
  await page.evaluate(() => document.getElementById('feuille').dispatchEvent(new InputEvent('input', { inputType: 'insertText' })));
  await expect.poll(() => page.evaluate(() => [...(CSS.highlights.get('correcteur-faute') ?? [])].map((p) => p.toString()))).toEqual(['maizon']);
  const point = await page.evaluate(() => {
    const b = [...CSS.highlights.get('correcteur-faute')][0].getBoundingClientRect();
    return { x: b.left + b.width / 2, y: b.top + b.height / 2 };
  });
  await page.touchscreen.tap(point.x, point.y);
  const bulle = page.locator('.correcteur-bulle');
  await expect(bulle).toBeVisible();
  await expect(bulle.locator('.correcteur-suggestion').first()).toHaveText('maison');
  const boite = await bulle.boundingBox();
  expect(boite.x).toBeGreaterThanOrEqual(0);
  expect(boite.x + boite.width).toBeLessThanOrEqual(390);
  const petits = await bulle.locator('button').evaluateAll((liste) => liste.filter((b) => b.getBoundingClientRect().height < 44).length);
  expect(petits).toBe(0);
  await page.screenshot({ path: infos.outputPath('telephone-correcteur.png') });
  await bulle.locator('.correcteur-suggestion').first().tap();
  expect(await contenu(page)).toBe('<p>Il était une fois une maison au bord de la mer.</p>');
  expect(await page.evaluate(() => document.activeElement.id)).toBe('feuille');
});
