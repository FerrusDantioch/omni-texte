# Analyse un fichier PDF produit par les tests (appelé par pdf.spec.js).
# Affiche un résumé en JSON : format des pages, texte extrait, couleurs du
# texte, couleur du fond, métadonnées.
#
# Nécessite Python 3 avec les bibliothèques pdfplumber et pypdfium2.

import json
import sys

import pdfplumber
import pypdfium2


def couleur(c):
    if c is None:
        return None
    if isinstance(c, (int, float)):
        c = (c,)
    c = tuple(round(float(x), 3) for x in c)
    if len(c) == 1:
        c = c * 3
    return c[:3]


def main(chemin):
    resultat = {}
    with pdfplumber.open(chemin) as pdf:
        page = pdf.pages[0]
        resultat["pages"] = len(pdf.pages)
        resultat["largeur"] = round(page.width, 1)
        resultat["hauteur"] = round(page.height, 1)
        resultat["titre"] = pdf.metadata.get("Title")
        resultat["texte"] = "\n".join((p.extract_text() or "") for p in pdf.pages)
        resultat["textes_pages"] = [(p.extract_text() or "") for p in pdf.pages]
        couleurs = {}
        for p in pdf.pages:
            for car in p.chars:
                if not car["text"].strip():
                    continue
                cle = json.dumps(couleur(car.get("non_stroking_color")))
                couleurs.setdefault(cle, "")
                couleurs[cle] += car["text"]
        resultat["couleurs_texte"] = couleurs
        # Rectangles colorés (surlignages).
        resultat["rectangles"] = [
            json.dumps(couleur(r.get("non_stroking_color")))
            for r in page.rects
            if r.get("fill")
        ]
    # Couleur du fond : pixels des quatre coins de la page rendue en image.
    document = pypdfium2.PdfDocument(chemin)
    image = document[0].render(scale=1).to_pil().convert("RGB")
    w, h = image.size
    resultat["coins"] = [image.getpixel(p) for p in ((2, 2), (w - 3, 2), (2, h - 3), (w - 3, h - 3))]
    print(json.dumps(resultat, ensure_ascii=False))


if __name__ == "__main__":
    main(sys.argv[1])
