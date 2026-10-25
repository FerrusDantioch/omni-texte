// Fonctionnement hors ligne (service worker) et liste des fichiers en cache.

import { readFile, readdir, writeFile, mkdtemp, cp, rm } from 'node:fs/promises';
import { spawn } from 'node:child_process';
import { tmpdir } from 'node:os';
import { join, relative, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { test, expect, ouvrir, contenu, attendreEnregistrement, VERSION } from './aides.js';

const RACINE = fileURLToPath(new URL('..', import.meta.url));
const NOUVELLE = `${VERSION}-essai`; // version fictive pour simuler une mise à jour

test('une nouvelle version est annoncée, et « Recharger » l’installe', async ({ page }) => {
  // Copie de l'application dans un dossier temporaire, pour pouvoir
  // changer son numéro de version pendant le test.
  const dossier = await mkdtemp(join(tmpdir(), 'omni-texte-'));
  await cp(RACINE, dossier, {
    recursive: true,
    filter: (source) => {
      const chemin = relative(RACINE, source);
      return !chemin.startsWith('tests') && !chemin.startsWith('.git') && !chemin.split(sep).includes('node_modules');
    },
  });
  const port = 8130 + test.info().parallelIndex;
  const serveur = spawn(process.execPath, [join(dossier, 'outils', 'serveur.mjs')], { env: { ...process.env, PORT: String(port) }, stdio: 'ignore' });
  try {
    const adresse = `http://localhost:${port}/omni-texte/`;
    await expect.poll(() => fetch(adresse).then((r) => r.ok).catch(() => false)).toBe(true);
    await page.goto(adresse);
    await page.locator('#feuille[contenteditable="true"]').waitFor();
    await expect.poll(() => page.evaluate(() => Boolean(navigator.serviceWorker.controller))).toBe(true);
    await page.locator('#feuille').click();
    await page.keyboard.type('Texte gardé pendant la mise à jour');

    const config = join(dossier, 'js', 'config.js');
    await writeFile(config, (await readFile(config, 'utf8')).replace(`version: '${VERSION}'`, `version: '${NOUVELLE}'`));
    await page.evaluate(async () => (await navigator.serviceWorker.getRegistration()).update());
    const annonce = page.locator('.message', { hasText: 'Une nouvelle version est disponible.' });
    await expect(annonce).toBeVisible({ timeout: 10_000 });
    await Promise.all([page.waitForEvent('load'), annonce.getByRole('button', { name: 'Recharger' }).click()]);
    await page.locator('#feuille[contenteditable="true"]').waitFor();
    // L'ancien cache est supprimé, le texte tapé juste avant est conservé.
    await expect.poll(() => page.evaluate(() => caches.keys())).toEqual([`plume-${NOUVELLE}`]);
    expect(await contenu(page)).toBe('<p>Texte gardé pendant la mise à jour</p>');
    await page.click('#bouton-menu');
    await page.click('#bouton-a-propos');
    await expect(page.locator('#fenetre-a-propos .version')).toHaveText(`Version ${NOUVELLE}`);
  } finally {
    serveur.kill();
    await rm(dossier, { recursive: true, force: true });
  }
});

test('après la première visite, l’application se lance et fonctionne sans réseau', async ({ page, context }) => {
  await ouvrir(page);
  await page.evaluate(() => navigator.serviceWorker.ready);
  await expect.poll(() => page.evaluate(() => Boolean(navigator.serviceWorker.controller))).toBe(true);
  expect(await page.evaluate(() => caches.keys())).toEqual([`plume-${VERSION}`]);
  await page.locator('#feuille').click();
  await page.keyboard.type('Écrit en ligne.');
  await attendreEnregistrement(page);

  await context.setOffline(true);
  await page.reload();
  await page.locator('#feuille[contenteditable="true"]').waitFor();
  expect(await contenu(page)).toBe('<p>Écrit en ligne.</p>');
  // Les polices viennent du cache.
  await page.evaluate(() => document.fonts.ready);
  const polices = await page.evaluate(() =>
    [...document.fonts].filter((f) => f.status === 'loaded').map((f) => `${f.family} ${f.weight}`),
  );
  expect(polices).toContain('Literata 400');
  expect(polices).toContain('Oxanium 500');
  // On peut écrire et enregistrer hors ligne.
  await page.locator('#feuille').click();
  await page.keyboard.press('End');
  await page.keyboard.type(' Puis hors ligne.');
  await attendreEnregistrement(page);
  await page.reload();
  await page.locator('#feuille[contenteditable="true"]').waitFor();
  expect(await contenu(page)).toBe('<p>Écrit en ligne. Puis hors ligne.</p>');
  // La fenêtre « À propos » affiche son logo hors ligne.
  await page.click('#bouton-menu');
  await page.click('#bouton-a-propos');
  expect(await page.locator('#fenetre-a-propos img').evaluate((img) => img.complete && img.naturalWidth > 0)).toBe(true);
  await context.setOffline(false);
});

test('la liste des fichiers mis en cache correspond exactement aux fichiers de l’application', async () => {
  const sw = await readFile(`${RACINE}/sw.js`, 'utf8');
  const liste = [...sw.match(/const FICHIERS = \[([\s\S]*?)\];/)[1].matchAll(/'([^']+)'/g)].map((m) => m[1]);
  const surLeDisque = ['index.html', 'manifest.webmanifest'];
  for (const [dossier, extension] of [['css', '.css'], ['js', '.js'], ['fonts', '.woff2'], ['icons', '.png'], ['assets', ''], ['correcteur', ''], ['commun', '']]) {
    for (const nom of await readdir(`${RACINE}/${dossier}`)) {
      // (les modes d'emploi du correcteur et du code commun ne sont pas utiles hors ligne)
      if (nom.endsWith(extension) && nom !== 'LISEZ-MOI.md') surLeDisque.push(`${dossier}/${nom}`);
    }
  }
  expect(liste.filter((f) => f !== './').sort()).toEqual(surLeDisque.sort());
});

test('le nom de l’application est le même dans config.js et dans le manifeste', async () => {
  const config = await readFile(`${RACINE}/js/config.js`, 'utf8');
  const nom = config.match(/nom: '([^']+)'/)[1];
  const manifeste = JSON.parse(await readFile(`${RACINE}/manifest.webmanifest`, 'utf8'));
  expect(manifeste.name).toBe(nom);
  expect(manifeste.short_name).toBe(nom);
  expect(manifeste.start_url).toBe('./');
  expect(manifeste.scope).toBe('./');
  expect(manifeste.lang).toBe('fr');
  expect(manifeste.icons.map((i) => i.purpose)).toContain('maskable');
});

test('aucun chemin absolu ni ressource externe dans les fichiers de l’application', async () => {
  const fichiers = ['index.html', 'manifest.webmanifest', 'sw.js'];
  for (const dossier of ['css', 'js', 'correcteur']) {
    for (const nom of await readdir(`${RACINE}/${dossier}`)) if (/\.(js|css)$/.test(nom)) fichiers.push(`${dossier}/${nom}`);
  }
  for (const fichier of fichiers) {
    const texte = await readFile(`${RACINE}/${fichier}`, 'utf8');
    expect(texte, fichier).not.toMatch(/(?:src|href)="\/(?!\/)/);
    expect(texte, fichier).not.toMatch(/url\(["']?\//);
    expect(texte, fichier).not.toMatch(/fonts\.(googleapis|gstatic)\.com/);
  }
});

test('la politique de sécurité autorise exactement le script de thème', async () => {
  const { createHash } = await import('node:crypto');
  const html = await readFile(`${RACINE}/index.html`, 'utf8');
  const script = html.match(/<script>([\s\S]*?)<\/script>/)[1];
  const empreinte = createHash('sha256').update(script, 'utf8').digest('base64');
  expect(html).toContain(`'sha256-${empreinte}'`);
});
