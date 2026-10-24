// Correcteur orthographique : soulignement, suggestions, dictionnaire
// personnel, hors ligne, réglage, et le moteur lui-même (sans navigateur).

import { readFile, readdir } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { test, expect, ouvrir, contenu, remplir, curseurApres } from './aides.js';

const RACINE = fileURLToPath(new URL('..', import.meta.url));

/** Les mots soulignés dans la feuille. */
function soulignes(page) {
  return page.evaluate(() => [...(CSS.highlights.get('correcteur-faute') ?? [])].map((p) => p.toString()));
}

/** Remplit la feuille comme un document ouvert, puis prévient l'éditeur. */
async function ecrire(page, html) {
  await remplir(page, html);
  await page.evaluate(() => document.getElementById('feuille').dispatchEvent(new InputEvent('input', { inputType: 'insertText' })));
}

/** Touche un mot souligné (le curseur se place au milieu du mot, comme au doigt). */
async function toucher(page, mot) {
  const r = await page.evaluate((mot) => {
    const plage = [...CSS.highlights.get('correcteur-faute')].find((p) => p.toString() === mot);
    const b = plage.getBoundingClientRect();
    return { x: b.left + b.width / 2, y: b.top + b.height / 2 };
  }, mot);
  await page.mouse.click(r.x, r.y);
}

// --- Le moteur seul ----------------------------------------------------------

test.describe('le moteur', () => {
  let moteur;
  test.beforeAll(async () => {
    // (moteur.js est un module du navigateur : Node le charge tel quel, sans son dossier)
    const source = await readFile(`${RACINE}/correcteur/moteur.js`, 'utf8');
    const { Moteur } = await import(`data:text/javascript,${encodeURIComponent(source)}`);
    moteur = new Moteur(await readFile(`${RACINE}/correcteur/mots-fr-7.5.txt`, 'utf8'));
  });
  const fautes = (texte) => moteur.verifier(texte).map((f) => f.mot);

  test('un texte correct n’a aucune faute (apostrophes, traits d’union, majuscules)', () => {
    expect(fautes("L'ami qu'il a vu hier, peut-être. Est-ce lui ? Dit-il vrai ; a-t-elle menti ? Va-t-en !")).toEqual([]);
    expect(fautes('Aujourd’hui, jusqu’à midi, l’école du XIXe siècle. C’est-à-dire quelqu’un, prud’homme.')).toEqual([]);
    expect(fautes('Maison, MAISON, État, Paris, œuvre, celui-ci, là-bas, rendez-vous.')).toEqual([]);
  });

  test('nombres, adresses web, e-mails et mots d’une lettre sont ignorés', () => {
    expect(fautes('42 chats, 3,5 km, 2CV, A4, n°3, x y z.')).toEqual([]);
    expect(fautes('Va sur https://www.exmple.fr/pagge-testt ou www.sitte.org, écris à jjean.dupnt@exmple.fr.')).toEqual([]);
  });

  test('les fautes sont trouvées, à la bonne place', () => {
    const texte = "Les maizons sont bele, l'amiie qu'ell connaît. Etat, peut-etre.";
    const trouvees = moteur.verifier(texte);
    expect(trouvees.map((f) => f.mot)).toEqual(['maizons', 'bele', 'amiie', 'ell', 'Etat', 'etre']);
    for (const f of trouvees) expect(texte.slice(f.debut, f.fin)).toBe(f.mot);
  });

  test('les suggestions sont pertinentes et gardent la majuscule', () => {
    expect(moteur.suggerer('maizon')[0]).toBe('maison');
    expect(moteur.suggerer('biblioteque')[0]).toBe('bibliothèque');
    expect(moteur.suggerer('etaient')[0]).toBe('étaient');
    expect(moteur.suggerer('oeuvre')[0]).toBe('œuvre');
    expect(moteur.suggerer('Ecole')[0]).toBe('École');
    expect(moteur.suggerer('MAIZON')[0]).toBe('MAISON');
    expect(moteur.suggerer('alorsque')).toContain('alors que');
    expect(moteur.suggerer('gouvernemant').length).toBeLessThanOrEqual(5);
  });

  test('un mot accepté (dictionnaire personnel) n’est plus une faute, majuscules comprises', () => {
    expect(fautes('Kaelith arrive.')).toEqual(['Kaelith']);
    moteur.accepter(['Kaelith']);
    expect(fautes('Kaelith arrive. KAELITH ! Jean-Kaelith, d’Kaelith.')).toEqual([]);
    moteur.accepter([]);
  });

  test('un chapitre de roman (60 000 mots) est vérifié en moins d’une seconde', () => {
    const phrase = "Il marchait lentement vers la maison de son enfance, où l'attendaient des souvenirs oubliés. ";
    const long = phrase.repeat(4000);
    const debut = Date.now();
    moteur.memoire.clear();
    expect(moteur.verifier(long)).toEqual([]);
    expect(Date.now() - debut).toBeLessThan(1000);
  });
});

// --- Dans l'application -------------------------------------------------------

test('les mots inconnus sont soulignés, pas les mots corrects', async ({ page }) => {
  await ouvrir(page);
  await ecrire(page, "<p>Les maizons sont bele.</p><p>L'ami qu'il a vu, peut-être. Écris à jean@exemple.fr, 42 fois.</p>");
  await expect.poll(() => soulignes(page)).toEqual(['maizons', 'bele']);
  // Le correcteur du navigateur est éteint : pas de double soulignement
  await expect(page.locator('#feuille')).toHaveAttribute('spellcheck', 'false');
});

test('le mot en cours de frappe n’est souligné qu’une fois le curseur parti', async ({ page }) => {
  await ouvrir(page);
  await page.locator('#feuille').click();
  await page.keyboard.type('Une maizon');
  await page.waitForTimeout(900);
  expect(await soulignes(page)).toEqual([]);
  await page.keyboard.type(' bleue');
  await expect.poll(() => soulignes(page)).toEqual(['maizon']);
});

test('toucher un mot souligné propose des corrections ; en choisir une remplace le mot', async ({ page }) => {
  await ouvrir(page);
  await ecrire(page, '<p>Une <b>maizon</b> bleue.</p>');
  await expect.poll(() => soulignes(page)).toEqual(['maizon']);
  await toucher(page, 'maizon');
  const bulle = page.locator('.correcteur-bulle');
  await expect(bulle).toBeVisible();
  const premiere = bulle.locator('.correcteur-suggestion').first();
  await expect(premiere).toHaveText('maison');
  expect(await bulle.locator('.correcteur-suggestion').count()).toBeLessThanOrEqual(5);
  await premiere.click();
  await expect(bulle).toBeHidden();
  // La mise en forme du mot est gardée, et le curseur reste dans le texte
  expect(await contenu(page)).toBe('<p>Une <b>maison</b> bleue.</p>');
  await expect(page.locator('#feuille')).toBeFocused();
  await expect.poll(() => soulignes(page)).toEqual([]);
  // « Annuler » revient au mot d'origine
  await page.keyboard.press('Control+z');
  expect(await contenu(page)).toBe('<p>Une <b>maizon</b> bleue.</p>');
});

test('Échap ou un toucher ailleurs referme la bulle', async ({ page }) => {
  await ouvrir(page);
  await ecrire(page, '<p>Une maizon bleue.</p>');
  await expect.poll(() => soulignes(page)).toEqual(['maizon']);
  await toucher(page, 'maizon');
  await expect(page.locator('.correcteur-bulle')).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(page.locator('.correcteur-bulle')).toBeHidden();
  await toucher(page, 'maizon');
  await expect(page.locator('.correcteur-bulle')).toBeVisible();
  await page.locator('#compteur').click();
  await expect(page.locator('.correcteur-bulle')).toBeHidden();
});

test('« Ajouter au dictionnaire » : le mot n’est plus souligné, même après redémarrage', async ({ page }) => {
  await ouvrir(page);
  await ecrire(page, '<p>Kaelith regarde Ombrepierre.</p>');
  await expect.poll(() => soulignes(page)).toEqual(['Kaelith', 'Ombrepierre']);
  await toucher(page, 'Kaelith');
  await page.locator('.correcteur-bulle').getByRole('button', { name: 'Ajouter au dictionnaire' }).click();
  await expect.poll(() => soulignes(page)).toEqual(['Ombrepierre']);

  // L'application est relancée : le mot est toujours accepté
  await page.reload();
  await page.locator('#feuille[contenteditable="true"]').waitFor();
  await expect.poll(() => soulignes(page)).toEqual(['Ombrepierre']);

  // L'écran du dictionnaire personnel le montre, et permet de le retirer
  await page.click('#bouton-menu');
  await page.click('#bouton-dictionnaire');
  const fenetre = page.locator('#fenetre-dictionnaire');
  await expect(fenetre).toBeVisible();
  await expect(fenetre.locator('.correcteur-liste li')).toHaveText(['KaelithRetirer']);
  await fenetre.getByLabel('Mot à ajouter au dictionnaire personnel').fill('Ombrepierre');
  await fenetre.getByRole('button', { name: 'Ajouter', exact: true }).click();
  await expect(fenetre.locator('.correcteur-mot')).toHaveText(['Kaelith', 'Ombrepierre']);
  await fenetre.getByRole('button', { name: 'Retirer « Kaelith »' }).click();
  await expect(fenetre.locator('.correcteur-mot')).toHaveText(['Ombrepierre']);
  await fenetre.getByRole('button', { name: 'Fermer' }).last().click();
  await page.keyboard.press('Escape'); // (le menu)
  await expect.poll(() => soulignes(page)).toEqual(['Kaelith']);
});

test('« Ignorer » : le mot n’est plus souligné jusqu’à la fermeture', async ({ page }) => {
  await ouvrir(page);
  await ecrire(page, '<p>Le bzzt du néon, encore un bzzt.</p>');
  await expect.poll(() => soulignes(page)).toEqual(['bzzt', 'bzzt']);
  await toucher(page, 'bzzt');
  await page.locator('.correcteur-bulle').getByRole('button', { name: 'Ignorer' }).click();
  await expect.poll(() => soulignes(page)).toEqual([]);
  await page.reload();
  await page.locator('#feuille[contenteditable="true"]').waitFor();
  await expect.poll(() => soulignes(page)).toEqual(['bzzt', 'bzzt']);
});

test('le réglage éteint la correction (et rallume celui du navigateur), même après redémarrage', async ({ page }) => {
  await ouvrir(page);
  await ecrire(page, '<p>Une maizon.</p>');
  await expect.poll(() => soulignes(page)).toEqual(['maizon']);
  await page.click('#bouton-menu');
  await expect(page.locator('#case-orthographe')).toBeChecked();
  await page.locator('#case-orthographe').uncheck();
  await page.keyboard.press('Escape');
  await expect.poll(() => soulignes(page)).toEqual([]);
  await expect(page.locator('#feuille')).toHaveAttribute('spellcheck', 'true');
  await page.reload();
  await page.locator('#feuille[contenteditable="true"]').waitFor();
  await page.waitForTimeout(800);
  expect(await soulignes(page)).toEqual([]);
  await page.click('#bouton-menu');
  await expect(page.locator('#case-orthographe')).not.toBeChecked();
  await page.locator('#case-orthographe').check();
  await page.keyboard.press('Escape');
  await expect.poll(() => soulignes(page)).toEqual(['maizon']);
});

test('un très long texte ne fige pas l’écriture', async ({ page }) => {
  await ouvrir(page);
  // Un chapitre de 60 000 mots, avec une faute par paragraphe
  const paragraphe = "<p>Il marchait lentement vers la maizon de son enfance, où l'attendaient des souvenirs oubliés depuis longtemps.</p>";
  await ecrire(page, paragraphe.repeat(4000));
  await expect.poll(() => page.evaluate(() => CSS.highlights.get('correcteur-faute')?.size), { timeout: 15_000 }).toBe(4000);
  // Pendant ce temps, l'écriture reste fluide : aucune tâche ne bloque la page plus d'une demi-seconde
  const plusLongue = await page.evaluate(async () => {
    let max = 0;
    const observateur = new PerformanceObserver((liste) => {
      for (const t of liste.getEntries()) max = Math.max(max, t.duration);
    });
    observateur.observe({ type: 'longtask' });
    const feuille = document.getElementById('feuille');
    feuille.dispatchEvent(new InputEvent('input', { inputType: 'insertText' }));
    await new Promise((r) => setTimeout(r, 2500));
    observateur.disconnect();
    return max;
  });
  expect(plusLongue).toBeLessThan(500);
  await curseurApres(page, 'longtemps.');
  await page.keyboard.type(' Fin');
  await expect(page.locator('#feuille p').first()).toContainText('longtemps. Fin');
});

test('hors ligne après la première visite : la correction fonctionne toujours', async ({ page, context }) => {
  await ouvrir(page);
  await page.evaluate(() => navigator.serviceWorker.ready);
  await expect.poll(() => page.evaluate(() => Boolean(navigator.serviceWorker.controller))).toBe(true);
  await ecrire(page, '<p>Une maizon.</p>');
  await expect.poll(() => soulignes(page)).toEqual(['maizon']);
  // Le dictionnaire est dans le cache de l'application
  expect(await page.evaluate(async () => Boolean(await caches.match('correcteur/mots-fr-7.5.txt')))).toBe(true);

  await context.setOffline(true);
  await page.reload();
  await page.locator('#feuille[contenteditable="true"]').waitFor();
  await ecrire(page, '<p>Hors ligne, une biblioteque.</p>');
  await expect.poll(() => soulignes(page)).toEqual(['biblioteque']);
  await toucher(page, 'biblioteque');
  await expect(page.locator('.correcteur-suggestion').first()).toHaveText('bibliothèque');
  await context.setOffline(false);
});

test('le correcteur est identique dans Omni-Romancier (s’il est à côté)', async () => {
  const autre = `${RACINE}/../omni-romancier/correcteur`;
  test.skip(!existsSync(autre), 'Omni-Romancier n’est pas à côté de ce dossier');
  const ici = (await readdir(`${RACINE}/correcteur`)).sort();
  expect((await readdir(autre)).sort()).toEqual(ici);
  for (const f of ici) {
    expect((await readFile(`${autre}/${f}`)).equals(await readFile(`${RACINE}/correcteur/${f}`)), f).toBe(true);
  }
});
