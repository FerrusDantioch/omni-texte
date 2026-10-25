// Fenêtre « Exporter » : Word (.docx) et texte brut (.txt).
// (L'export PDF est vérifié dans pdf.spec.js.)

import { execFileSync } from 'node:child_process';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { test, expect, ouvrir, DOCUMENT_ESSAI } from './aides.js';

const ANALYSEUR = fileURLToPath(new URL('./analyser-docx.py', import.meta.url));

async function preparer(page) {
  await ouvrir(page);
  await page.fill('#titre-document', 'Mon rapport');
  await page.evaluate((html) => {
    const feuille = document.getElementById('feuille');
    feuille.innerHTML = html;
    feuille.dispatchEvent(new InputEvent('input', { inputType: 'insertText', bubbles: true }));
  }, DOCUMENT_ESSAI);
}

async function exporter(page, format) {
  await page.click('#bouton-exporter');
  const [telechargement] = await Promise.all([
    page.waitForEvent('download'),
    page.locator(`#fenetre-export [data-format="${format}"]`).click(),
  ]);
  return { nom: telechargement.suggestedFilename(), chemin: await telechargement.path() };
}

function outilsDisponibles() {
  try {
    execFileSync('python3', ['-c', 'import docx, pdfplumber'], { stdio: 'ignore' });
    execFileSync('soffice', ['--version'], { stdio: 'ignore' });
    return true;
  } catch {
    return false;
  }
}

test('la fenêtre « Exporter » propose trois formats et se ferme avec Échap', async ({ page }) => {
  await ouvrir(page);
  await page.click('#bouton-exporter');
  const fenetre = page.locator('#fenetre-export');
  await expect(fenetre).toBeVisible();
  await expect(fenetre.getByRole('button', { name: 'PDF' })).toHaveAccessibleDescription('Pour imprimer ou envoyer un document figé. Respecte les sauts de page.');
  await expect(fenetre.getByRole('button', { name: 'Word (.docx)' })).toHaveAccessibleDescription('Pour continuer le texte dans Word ou Google Docs.');
  await expect(fenetre.getByRole('button', { name: 'Texte brut (.txt)' })).toHaveAccessibleDescription(
    'Le texte seul, sans mise en forme, lisible partout.',
  );
  await page.keyboard.press('Escape');
  await expect(fenetre).toBeHidden();
  await expect(page.locator('#bouton-exporter')).toBeFocused();
});

test('export Word : fichier valide, lu par python-docx et ouvert par LibreOffice', async ({ page }, infos) => {
  test.skip(!outilsDisponibles(), 'Python (python-docx, pdfplumber) et LibreOffice sont nécessaires pour vérifier le fichier Word');
  test.setTimeout(120_000);
  await preparer(page);
  const { nom, chemin } = await exporter(page, 'docx');
  expect(nom).toBe('Mon rapport.docx');
  await expect(page.locator('.message', { hasText: 'Fichier « Mon rapport.docx » créé.' })).toBeVisible();
  const analyse = JSON.parse(
    execFileSync('python3', [ANALYSEUR, chemin], {
      encoding: 'utf8',
      env: { ...process.env, APERCU_DOCX: infos.outputPath('apercu-docx.png') },
      timeout: 180_000,
    }),
  );
  infos.attach('analyse', { body: JSON.stringify(analyse, null, 2), contentType: 'application/json' });

  expect(analyse.archive_intacte).toBe(true);
  expect(analyse.fichiers).toContain('word/document.xml');
  expect(analyse.titre).toBe('Mon rapport');
  expect(analyse.page_cm).toEqual([21, 29.7, 2]);

  const p = analyse.paragraphes;
  expect(p.map((x) => x.style)).toEqual([
    'Heading 1', 'Normal', 'Normal', 'Normal', 'Normal', 'Heading 2',
    'List Paragraph', 'List Paragraph', 'List Paragraph', 'List Paragraph', 'Normal', 'List Paragraph', 'Heading 3', 'Normal',
  ]);
  expect(p[0].texte).toBe('Titre principal');
  expect(p[2].texte).toBe('Centré & spécial <ok> « guillemets » 😀');
  expect(p[2].alignement).toContain('CENTER');
  expect(p[3].texte).toBe('Ligne un\nLigne deux');
  expect(p[4].texte).toBe('');

  // Mise en forme des caractères.
  const morceau = (texte) => p[1].morceaux.find((m) => m.texte === texte);
  expect(morceau('gras').gras).toBe(true);
  expect(morceau('italique').italique).toBe(true);
  expect(morceau('souligné').souligne).toBe(true);
  expect(morceau('barré').barre).toBe(true);
  expect(morceau('rouge').couleur).toBe('E5484D');
  expect(morceau('surligné').fond).toBe('FFE066');
  expect(morceau('grand').taille).toBe(18);
  expect(morceau('machine').police).toBe('JetBrains Mono');
  expect(p[13].morceaux.map((m) => [m.texte, m.gras])).toEqual([['Gras ', true], ['puis normal', false]]);

  // Listes : puces (n° 1), puis deux listes numérotées distinctes (2 et 3).
  expect(p.slice(6, 10).map((x) => [x.texte, x.liste])).toEqual([['premier', '1'], ['second', '1'], ['un', '2'], ['deux', '2']]);
  expect([p[11].texte, p[11].liste]).toEqual(['reprise', '3']);

  // LibreOffice a ouvert le fichier et retrouvé le texte.
  expect(analyse.libreoffice_pages).toBe(1);
  for (const texte of ['Titre principal', 'Centré & spécial <ok>', 'Ligne deux', 'Entre deux listes', 'puis normal']) {
    expect(analyse.libreoffice_texte).toContain(texte);
  }
  expect(analyse.libreoffice_texte).toMatch(/1\.\s*un/);
  expect(analyse.libreoffice_texte).toMatch(/1\.\s*reprise/);
});

test('export texte brut : UTF-8, une ligne par paragraphe, puces et numéros', async ({ page }) => {
  await preparer(page);
  const { nom, chemin } = await exporter(page, 'txt');
  expect(nom).toBe('Mon rapport.txt');
  const octets = await readFile(chemin);
  expect([...octets.subarray(0, 3)]).toEqual([0xef, 0xbb, 0xbf]); // marque UTF-8
  const texte = octets.toString('utf8').slice(1);
  expect(texte).toBe(
    [
      'Titre principal',
      'Un texte gras, italique, souligné, barré, rouge, surligné, grand et machine.',
      'Centré & spécial <ok> « guillemets » 😀',
      'Ligne un',
      'Ligne deux',
      '',
      'Listes',
      '• premier',
      '• second',
      '1. un',
      '2. deux',
      'Entre deux listes',
      '1. reprise',
      'Fin',
      'Gras puis normal',
      '',
    ].join('\r\n'),
  );
});

test('Ctrl+P lance toujours directement l’export PDF', async ({ page }) => {
  await preparer(page);
  await page.evaluate(() => {
    window.print = () => {
      window.__impression = document.title;
    };
  });
  await page.locator('#feuille').click();
  await page.keyboard.press('Control+p');
  await expect(page.locator('#fenetre-aide-pdf')).toBeVisible();
  await expect(page.locator('#fenetre-export')).toBeHidden();
});
