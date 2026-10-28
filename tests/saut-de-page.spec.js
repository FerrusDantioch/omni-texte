// Saut de page : insertion au curseur, effacement d'un coup, enregistrement,
// correcteur, exports (texte, Word), ouverture de fichiers, impression (PDF).

import { execFileSync } from 'node:child_process';
import { readFile, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { test, expect, ouvrir, contenu, remplir, curseurApres, commande, attendreEnregistrement } from './aides.js';

const ANALYSEUR_PDF = fileURLToPath(new URL('./analyser-pdf.py', import.meta.url));
const REPERE = '──── Saut de page ────';

/** Remplit la feuille comme un document ouvert, puis prévient l'éditeur. */
async function ecrire(page, html) {
  await remplir(page, html);
  await page.evaluate(() => document.getElementById('feuille').dispatchEvent(new InputEvent('input', { inputType: 'insertText' })));
}

/** Place le curseur au début du paragraphe qui contient ce texte. */
async function curseurAuDebutDe(page, texte) {
  await page.evaluate((texte) => {
    const feuille = document.getElementById('feuille');
    const bloc = [...feuille.querySelectorAll('p, h1, h2, h3, li')].find((b) => b.textContent.includes(texte));
    feuille.focus();
    const plage = document.createRange();
    plage.setStart(bloc.firstChild, 0);
    getSelection().removeAllRanges();
    getSelection().addRange(plage);
  }, texte);
}

/** Produit le PDF de l'impression et l'analyse (texte de chaque page). */
async function imprimerEnPdf(page, infos) {
  const chemin = infos.outputPath('document.pdf');
  // Ce que fait le bouton « Imprimer / PDF » juste avant l'impression.
  await page.evaluate(() => window.dispatchEvent(new Event('beforeprint')));
  await page.evaluate(() => document.fonts.ready);
  await page.pdf({ path: chemin, preferCSSPageSize: true });
  await page.evaluate(() => window.dispatchEvent(new Event('afterprint')));
  return JSON.parse(execFileSync('python3', [ANALYSEUR_PDF, chemin], { encoding: 'utf8' }));
}

function pythonDisponible() {
  try {
    execFileSync('python3', ['-c', 'import pdfplumber, pypdfium2, docx'], { stdio: 'ignore' });
    return true;
  } catch {
    return false;
  }
}

async function exporter(page, format) {
  await page.click('#bouton-exporter');
  const [telechargement] = await Promise.all([
    page.waitForEvent('download'),
    page.locator(`#fenetre-export [data-format="${format}"]`).click(),
  ]);
  return telechargement.path();
}

async function ouvrirFichier(page, fichier) {
  await page.click('#bouton-documents');
  const [choix] = await Promise.all([page.waitForEvent('filechooser'), page.click('#bouton-ouvrir-fichier')]);
  await choix.setFiles(fichier);
}

// --- Insertion et effacement -------------------------------------------------

test('le bouton coupe le paragraphe au curseur ; le texte tapé va sur la nouvelle page', async ({ page }) => {
  await ouvrir(page);
  await ecrire(page, '<p>Avant la coupure. Après la coupure.</p>');
  await curseurApres(page, 'Avant la coupure.');
  await page.keyboard.press('Delete'); // l'espace
  await commande(page, 'saut-de-page');
  expect(await contenu(page)).toBe('<p>Avant la coupure.</p><hr><p>Après la coupure.</p>');
  await page.keyboard.type('Ici ');
  expect(await contenu(page)).toBe('<p>Avant la coupure.</p><hr><p>Ici Après la coupure.</p>');
  // Le repère est visible, discret, et son libellé n'est pas du texte du document.
  const saut = page.locator('#feuille > hr');
  await expect(saut).toBeVisible();
  expect(await saut.evaluate((hr) => getComputedStyle(hr, '::before').content)).toBe('"Saut de page"');
  expect(await page.locator('#feuille').evaluate((f) => f.textContent)).not.toContain('Saut de page');
  await expect(page.locator('#compteur')).toContainText('7 mots');
});

test('saut de page au tout début, à la fin, dans un titre et dans une liste', async ({ page }) => {
  await ouvrir(page);
  await ecrire(page, '<h1>Titre</h1><p>Texte</p><ul><li>un</li><li>deux</li><li>trois</li></ul>');
  // Au début : pas de paragraphe vide avant le saut de page.
  await curseurAuDebutDe(page, 'Titre');
  await commande(page, 'saut-de-page');
  expect(await contenu(page)).toBe('<hr><h1>Titre</h1><p>Texte</p><ul><li>un</li><li>deux</li><li>trois</li></ul>');
  // À la fin d'un titre suivi d'un paragraphe : le curseur va au paragraphe suivant.
  await curseurApres(page, 'Titre');
  await commande(page, 'saut-de-page');
  expect(await contenu(page)).toBe('<hr><h1>Titre</h1><hr><p>Texte</p><ul><li>un</li><li>deux</li><li>trois</li></ul>');
  // Dans une liste : la liste est coupée en deux.
  await curseurApres(page, 'deux');
  await commande(page, 'saut-de-page');
  expect(await contenu(page)).toBe('<hr><h1>Titre</h1><hr><p>Texte</p><ul><li>un</li><li>deux</li></ul><hr><ul><li>trois</li></ul>');
  // Tout à la fin : un paragraphe vide attend la suite, le curseur y est.
  await curseurApres(page, 'trois');
  await page.keyboard.press('Control+Enter'); // même raccourci que Word
  expect(await contenu(page)).toBe(
    '<hr><h1>Titre</h1><hr><p>Texte</p><ul><li>un</li><li>deux</li></ul><hr><ul><li>trois</li></ul><hr><p><br></p>',
  );
  await page.keyboard.type('Fin');
  expect(await contenu(page)).toMatch(/<hr><p>Fin(<br>)?<\/p>$/);
});

test('retour arrière ou Suppr efface le saut de page d’un coup ; Annuler le remet', async ({ page }) => {
  await ouvrir(page);
  await ecrire(page, '<p>Un</p><hr><p>Deux</p><hr><ul><li>Trois</li></ul>');
  await curseurAuDebutDe(page, 'Deux');
  await page.keyboard.press('Backspace');
  expect(await contenu(page)).toBe('<p>Un</p><p>Deux</p><hr><ul><li>Trois</li></ul>');
  await page.keyboard.press('Control+z');
  expect(await contenu(page)).toBe('<p>Un</p><hr><p>Deux</p><hr><ul><li>Trois</li></ul>');
  // Suppr à la fin du paragraphe qui précède.
  await curseurApres(page, 'Deux');
  await page.keyboard.press('Delete');
  expect(await contenu(page)).toBe('<p>Un</p><hr><p>Deux</p><ul><li>Trois</li></ul>');
  // Le paragraphe suivant n'est pas fusionné : un second retour arrière, si.
  await curseurAuDebutDe(page, 'Deux');
  await page.keyboard.press('Backspace');
  await page.keyboard.press('Backspace');
  expect(await contenu(page)).toBe('<p>UnDeux</p><ul><li>Trois</li></ul>');
});

test('le repère ne peut pas être tapé, mais un repère collé redevient un saut de page', async ({ page }) => {
  await ouvrir(page);
  await ecrire(page, '<p>Début</p>');
  await curseurApres(page, 'Début');
  // Des tirets tapés au clavier restent du texte.
  await page.keyboard.press('Enter');
  await page.keyboard.type('---- Saut de page ----');
  expect(await page.locator('#feuille > hr').count()).toBe(0);
  // Un texte collé qui contient le repère (venant d'Omni-Romancier, d'un .txt…).
  await page.evaluate((repere) => {
    const donnees = new DataTransfer();
    donnees.setData('text/plain', `\n${repere}\nSuite collée`);
    document.getElementById('feuille').dispatchEvent(new ClipboardEvent('paste', { clipboardData: donnees, bubbles: true, cancelable: true }));
  }, REPERE);
  expect(await contenu(page)).toBe('<p>Début</p><p>---- Saut de page ----</p><hr><p>Suite collée</p>');
});

// --- Enregistrement et correcteur ---------------------------------------------

test('le saut de page est enregistré : il est toujours là après fermeture et réouverture', async ({ page }) => {
  await ouvrir(page);
  await page.locator('#feuille').click();
  await page.keyboard.type('Page un');
  await commande(page, 'saut-de-page');
  await page.keyboard.type('Page deux');
  await attendreEnregistrement(page);
  await page.reload();
  await page.locator('#feuille[contenteditable="true"]').waitFor();
  expect(await contenu(page)).toBe('<p>Page un</p><hr><p>Page deux</p>');
});

test('un saut de page venant d’une sauvegarde est gardé, mais seulement au premier niveau', async ({ page }) => {
  await ouvrir(page);
  const propre = await page.evaluate(async () => {
    const { nettoyerHtml } = await import('./js/sanitize.js');
    return nettoyerHtml('<p>a</p><hr class="x" onclick="alert(1)"><p>b<hr>c</p><ul><li>d<hr></li></ul><div><hr></div>');
  });
  // (le <hr> dans <p> ferme le paragraphe : c'est la règle du HTML)
  // (et le « </p> » orphelin qui suit devient un paragraphe vide)
  expect(propre).toBe('<p>a</p><hr><p>b</p><hr><p>c</p><p><br></p><ul><li>d</li></ul><hr><p><br></p>');
});

test('le correcteur souligne les fautes, jamais le saut de page', async ({ page }) => {
  await ouvrir(page);
  await ecrire(page, '<p>Les maizons sont bele.</p><hr><p>Une biblioteque.</p>');
  await expect
    .poll(() => page.evaluate(() => [...(CSS.highlights.get('correcteur-faute') ?? [])].map((p) => p.toString())))
    .toEqual(['maizons', 'bele', 'biblioteque']);
  // Aucun soulignement ne touche le saut de page.
  const touche = await page.evaluate(() => {
    const hr = document.querySelector('#feuille > hr');
    return [...CSS.highlights.get('correcteur-faute')].some((p) => p.intersectsNode(hr));
  });
  expect(touche).toBe(false);
});

// --- Exports et ouverture de fichiers -------------------------------------------

test('export texte : le saut de page devient la ligne repère, et le fichier rouvert le retrouve', async ({ page }, infos) => {
  await ouvrir(page);
  await page.fill('#titre-document', 'Essai');
  await ecrire(page, '<p>Un</p><hr><p>Deux</p>');
  const chemin = await exporter(page, 'txt');
  const texte = (await readFile(chemin)).toString('utf8').slice(1);
  expect(texte).toBe(['Un', REPERE, 'Deux', ''].join('\r\n'));
  // Rouvert dans Omni-Texte : un vrai saut de page.
  const copie = infos.outputPath('Essai.txt');
  await writeFile(copie, await readFile(chemin));
  await ouvrirFichier(page, copie);
  await expect.poll(() => contenu(page)).toBe('<p>Un</p><hr><p>Deux</p>');
  // Le caractère « saut de page » des anciens fichiers texte est reconnu aussi.
  const ancien = infos.outputPath('ancien.txt');
  await writeFile(ancien, 'Page 1\r\n\fPage 2\r\n');
  await ouvrirFichier(page, ancien);
  await expect.poll(() => contenu(page)).toBe('<p>Page 1</p><hr><p>Page 2</p>');
});

test('export Word : vrai saut de page, retrouvé quand on rouvre le fichier', async ({ page }, infos) => {
  test.skip(!pythonDisponible(), 'Python 3 avec python-docx est nécessaire');
  await ouvrir(page);
  await page.fill('#titre-document', 'Essai Word');
  await ecrire(page, '<hr><h1>Titre</h1><p>Un</p><hr><hr><ul><li>liste</li></ul><hr><p>Deux</p>');
  const chemin = await exporter(page, 'docx');
  const sauts = execFileSync(
    'python3',
    ['-c', 'import docx,sys; d=docx.Document(sys.argv[1]); print([(p.text, bool(p.paragraph_format.page_break_before)) for p in d.paragraphs])', chemin],
    { encoding: 'utf8' },
  ).trim();
  // Un saut tout au début ne fait rien ; deux à la suite n'en font qu'un.
  expect(sauts).toBe("[('Titre', False), ('Un', False), ('liste', True), ('Deux', True)]");
  const copie = infos.outputPath('Essai Word.docx');
  await writeFile(copie, await readFile(chemin));
  await ouvrirFichier(page, copie);
  await expect.poll(() => contenu(page)).toBe('<h1>Titre</h1><p>Un</p><hr><ul><li>liste</li></ul><hr><p>Deux</p>');
});

// --- Impression -------------------------------------------------------------------

test('le bouton « Imprimer / PDF » ouvre la fenêtre d’impression', async ({ page }) => {
  await ouvrir(page);
  await page.evaluate(() => {
    window.print = () => {
      window.__imprime = true;
      window.dispatchEvent(new Event('afterprint'));
    };
  });
  const bouton = page.getByRole('button', { name: 'Imprimer / PDF' });
  await expect(bouton).toBeVisible();
  await bouton.click();
  // Première fois : l'aide « Enregistrer au format PDF » s'affiche d'abord.
  await page.locator('#fenetre-aide-pdf').getByRole('button', { name: 'Continuer' }).click();
  await expect.poll(() => page.evaluate(() => window.__imprime)).toBe(true);
});

test('PDF : chaque saut de page commence une nouvelle page, le repère n’est pas imprimé', async ({ page }, infos) => {
  test.skip(!pythonDisponible(), 'Python 3 avec pdfplumber et pypdfium2 est nécessaire pour analyser le PDF');
  await ouvrir(page);
  await ecrire(page, '<p>Page une.</p><hr><h1>Chapitre deux</h1><p>Page deux.</p><hr><p>Page trois.</p>');
  const sansSaut = await imprimerEnPdf(page, infos);
  expect(sansSaut.pages).toBe(3);
  expect(sansSaut.textes_pages.map((t) => t.replace(/\s+/g, ' ').trim())).toEqual(['Page une.', 'Chapitre deux Page deux.', 'Page trois.']);
  expect(sansSaut.texte).not.toContain('Saut de page');
  expect(sansSaut.texte).not.toContain('Imprimer');
});

test('PDF : saut de page au début, à la fin, ou deux à la suite : jamais de page blanche', async ({ page }, infos) => {
  test.skip(!pythonDisponible(), 'Python 3 avec pdfplumber et pypdfium2 est nécessaire pour analyser le PDF');
  await ouvrir(page);
  await ecrire(page, '<hr><p>Première.</p><hr><hr><p>Deuxième.</p><hr><p><br></p>');
  const analyse = await imprimerEnPdf(page, infos);
  expect(analyse.textes_pages.map((t) => t.trim())).toEqual(['Première.', 'Deuxième.']);
  // Après l'impression, plus aucune règle temporaire.
  expect(await page.evaluate(() => document.head.querySelectorAll('style[media="print"]').length)).toBe(0);
  // Texte sans aucun saut de page : une seule page, comme avant.
  await ecrire(page, '<p>Simple texte.</p>');
  expect((await imprimerEnPdf(page, infos)).pages).toBe(1);
});

test('PDF : très long texte avec des sauts de page, jamais une ligne seule en haut ou en bas de page', async ({ page }, infos) => {
  test.skip(!pythonDisponible(), 'Python 3 avec pdfplumber et pypdfium2 est nécessaire pour analyser le PDF');
  await ouvrir(page);
  const phrase = 'Une phrase assez longue pour remplir la ligne, encore et encore, jusqu’au bout de la page imprimée. ';
  const chapitre = (n) => `<h1>Partie ${n}</h1>` + Array.from({ length: 40 }, (_, i) => `<p>${n}.${i + 1} ${phrase.repeat(3)}</p>`).join('');
  const html = Array.from({ length: 8 }, (_, i) => chapitre(i + 1)).join('<hr>');
  await ecrire(page, html);
  // Insérer un saut de page dans un long document reste instantané.
  await curseurApres(page, '8.20 ');
  const debut = Date.now();
  await commande(page, 'saut-de-page');
  expect(Date.now() - debut).toBeLessThan(2000);
  const analyse = await imprimerEnPdf(page, infos);
  // Chaque partie commence en haut d'une page.
  for (let n = 1; n <= 8; n++) {
    expect(analyse.textes_pages.some((t) => t.trim().startsWith(`Partie ${n}`)), `Partie ${n}`).toBe(true);
  }
  // Le saut inséré à la main fait commencer une page par la suite du paragraphe 8.20.
  expect(analyse.textes_pages.some((t) => t.trim().startsWith('Une phrase'))).toBe(true);
  // Jamais une ligne seule : quand un paragraphe est coupé entre deux pages,
  // il en reste au moins 2 lignes de chaque côté. (Chaque paragraphe commence
  // par son numéro « n.m », chaque partie par « Partie n ».)
  const lignes = analyse.textes_pages.map((t) => t.trim().split('\n'));
  const estUnDebut = (ligne) => /^(\d+\.\d+ |Partie |Une phrase)/.test(ligne);
  let coupures = 0;
  for (let i = 1; i < lignes.length; i++) {
    const enHaut = lignes[i].findIndex(estUnDebut); // lignes d'un paragraphe commencé à la page d'avant
    if (enHaut === 0) continue;
    coupures++;
    expect(enHaut, `haut de la page ${i + 1}`).toBeGreaterThanOrEqual(2);
    expect(lignes[i - 1].length - lignes[i - 1].findLastIndex(estUnDebut), `bas de la page ${i}`).toBeGreaterThanOrEqual(2);
  }
  expect(coupures, 'des paragraphes sont bien coupés entre deux pages').toBeGreaterThan(0);
});

test('mode avion : après la première visite, le saut de page et ses exports fonctionnent sans réseau', async ({ page, context }) => {
  await ouvrir(page);
  await page.evaluate(() => navigator.serviceWorker.ready);
  await expect.poll(() => page.evaluate(() => Boolean(navigator.serviceWorker.controller))).toBe(true);
  // Le module commun est dans le cache de l'application.
  expect(await page.evaluate(async () => Boolean(await caches.match('commun/saut-de-page.js')))).toBe(true);
  await context.setOffline(true);
  await page.reload();
  await page.locator('#feuille[contenteditable="true"]').waitFor();
  await page.locator('#feuille').click();
  await page.keyboard.type('Hors ligne');
  await commande(page, 'saut-de-page');
  await page.keyboard.type('Suite');
  expect(await contenu(page)).toBe('<p>Hors ligne</p><hr><p>Suite</p>');
  const texte = (await readFile(await exporter(page, 'txt'))).toString('utf8').slice(1);
  expect(texte).toBe(['Hors ligne', REPERE, 'Suite', ''].join('\r\n'));
  await attendreEnregistrement(page);
  await page.reload();
  await page.locator('#feuille[contenteditable="true"]').waitFor();
  expect(await contenu(page)).toBe('<p>Hors ligne</p><hr><p>Suite</p>');
  await context.setOffline(false);
});

test('le code commun est identique dans Omni-Romancier (s’il est à côté)', async () => {
  const { readdir } = await import('node:fs/promises');
  const { existsSync } = await import('node:fs');
  const ici = fileURLToPath(new URL('../commun', import.meta.url));
  const autre = fileURLToPath(new URL('../../omni-romancier/commun', import.meta.url));
  test.skip(!existsSync(autre), 'Omni-Romancier n’est pas à côté de ce dossier');
  const fichiers = (await readdir(ici)).sort();
  expect((await readdir(autre)).sort()).toEqual(fichiers);
  for (const f of fichiers) expect((await readFile(`${autre}/${f}`)).equals(await readFile(`${ici}/${f}`)), f).toBe(true);
});
