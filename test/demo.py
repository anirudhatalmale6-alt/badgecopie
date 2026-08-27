#!/usr/bin/env python3
"""Jeu de donnees de demonstration + captures d'ecran.

Ce script n'assure AUCUNE verification : il sert uniquement a montrer le site.
Les controles sont dans test/e2e.py.
"""
import json
import os
import re
import subprocess
import sys
import urllib.request

from playwright.sync_api import sync_playwright

BASE = os.environ.get("BASE", "http://127.0.0.1:3012")
RACINE = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
SORTIE = os.environ.get("SORTIE", os.path.join(RACINE, "captures"))
os.makedirs(SORTIE, exist_ok=True)

MYSQL = ["mysql", "--protocol=TCP", "-h", "127.0.0.1", "-P", "3399", "-u", "root", "badge", "-e"]


def sql(requete):
    subprocess.run(MYSQL + [requete], check=True, capture_output=True)


def env(cle, defaut=""):
    chemin = os.path.join(RACINE, ".env")
    if os.path.exists(chemin):
        for ligne in open(chemin, encoding="utf-8"):
            if ligne.strip().startswith(cle + "="):
                return ligne.split("=", 1)[1].strip()
    return defaut


def commande(champs):
    limite = "----demo"
    corps = b""
    for k, v in champs.items():
        corps += (f"--{limite}\r\nContent-Disposition: form-data; name=\"{k}\"\r\n\r\n{v}\r\n").encode()
    corps += f"--{limite}--\r\n".encode()
    req = urllib.request.Request(
        BASE + "/api/commande", data=corps,
        headers={"Content-Type": f"multipart/form-data; boundary={limite}"}, method="POST")
    with urllib.request.urlopen(req) as r:
        return json.loads(r.read().decode())


GENS = [
    ("Marie Dupont", "marie.dupont@exemple.fr", "12 rue des Lilas", "75011", "Paris", "intratone", "porte_cle", 2, "copie_faite"),
    ("Karim Benali", "k.benali@exemple.fr", "8 avenue Jean Jaures", "69007", "Lyon", "hexact", "carte", 1, "attente_badge"),
    ("Sophie Marchand", "s.marchand@exemple.fr", "45 rue Sainte", "13001", "Marseille", "urmet", "cylindre", 4, "expedie"),
    ("Thomas Leroy", "t.leroy@exemple.fr", "3 place du Capitole", "31000", "Toulouse", "comelit", "porte_cle", 1, "badge_recu"),
    ("Amelie Roux", "a.roux@exemple.fr", "17 rue de la Gare", "44000", "Nantes", "noralsy", "porte_cle", 10, "livre"),
    ("Julien Petit", "j.petit@exemple.fr", "22 cours Berriat", "38000", "Grenoble", "deny", "carte", 1, "non_copiable"),
    ("Claire Fontaine", "c.fontaine@exemple.fr", "6 rue Nationale", "59000", "Lille", "aiphone", "carte", 2, "attente_badge"),
]


def seed():
    print("Jeu de donnees…")
    sql("DELETE FROM commandes")
    # Reglages realistes pour la demonstration.
    # On remet AUSSI la grille tarifaire : test/e2e.py la modifie, et sans
    # cette remise a zero les captures affichaient le prix d'un test.
    sql("DELETE FROM reglages WHERE cle = 'paliers'")
    for cle, valeur in [
        ("adresse_retour", "BadgeCopie\\n15 rue des Artisans\\n69003 Lyon"),
        ("frais_port", "0"),
        ("delai_jours", "2 a 3 jours ouvres apres reception de votre badge"),
        ("garantie", "2 ans"),
    ]:
        sql(f"INSERT INTO reglages (cle, valeur) VALUES ('{cle}', '{valeur}') "
            f"ON DUPLICATE KEY UPDATE valeur = VALUES(valeur)")

    refs = []
    for nom, email, adresse, cp, ville, marque, forme, qte, statut in GENS:
        champs = {
            "marque": marque, "forme": forme, "quantite": str(qte),
            "methode": "code" if forme == "cylindre" else "poste",
            "nom": nom, "email": email, "telephone": "06 12 34 56 78",
            "adresse": adresse, "complement": "", "cp": cp, "ville": ville,
            "att_nom": nom, "qualite": "locataire",
            "adresse_immeuble": f"{adresse}, {cp} {ville}",
            "accepte_att": "1", "accepte_cgv": "1",
        }
        if forme == "cylindre":
            champs["code_badge"] = "012A3B4C5D6E"
        r = commande(champs)
        ref = r["reference"]
        refs.append(ref)
        # On force le statut directement : le but est l'illustration, pas le
        # parcours (deja couvert par e2e.py), et cela evite d'envoyer sept
        # series d'e-mails.
        sql(f"UPDATE commandes SET statut='{statut}', paye_le=NOW(), "
            f"paiement_ref='SIMULE-{ref}' WHERE reference='{ref}'")
        sql(f"INSERT INTO historique (commande_id, statut, auteur) "
            f"SELECT id, 'paye', 'paiement' FROM commandes WHERE reference='{ref}'")
        sql(f"INSERT INTO historique (commande_id, statut, auteur) "
            f"SELECT id, '{statut}', 'admin' FROM commandes WHERE reference='{ref}'")
        if statut == "expedie":
            sql(f"UPDATE commandes SET suivi='6X12345678901' WHERE reference='{ref}'")
        sql(f"UPDATE commandes SET note_interne='Mifare Classic 1K, cles du secteur 3 retrouvees.' "
            f"WHERE reference='{ref}'")
    print(f"  {len(refs)} commandes creees")
    return refs


def capture(page, nom, chemin=None):
    if chemin:
        page.goto(BASE + chemin)
    page.wait_for_timeout(450)
    f = os.path.join(SORTIE, nom + ".png")
    page.screenshot(path=f)
    print("  " + f)


def main():
    refs = seed()

    with sync_playwright() as p:
        nav = p.chromium.launch()
        page = nav.new_page()
        # Jamais full_page : une page longue depasse 2000 px de haut.
        page.set_viewport_size({"width": 1280, "height": 860})

        print("Captures…")
        capture(page, "01-accueil", "/")

        page.goto(BASE + "/")
        page.evaluate("window.scrollTo(0, 780)")
        capture(page, "02-tarifs")

        page.goto(BASE + "/commander")
        page.check("input[name=marque][value=intratone]")
        page.check("input[name=forme][value=porte_cle]")
        page.wait_for_selector("#verdict.oui")
        capture(page, "03-assistant-oui")

        page.check("input[name=marque][value=stid]")
        page.check("input[name=forme][value=carte]")
        page.wait_for_selector("#verdict.non")
        capture(page, "04-assistant-refus")

        page.check("input[name=marque][value=intratone]")
        page.check("input[name=forme][value=porte_cle]")
        page.wait_for_selector("#verdict.oui")
        page.click("button[data-suivant='2']")
        page.wait_for_selector("section[data-etape='2']:not([hidden])")
        for _ in range(4):
            page.click("button[data-q='1']")
        page.wait_for_function("document.querySelector('#prix').textContent.includes('55,00')")
        capture(page, "05-quantite-degressif")

        page.click("button[data-suivant='3']")
        page.wait_for_selector("section[data-etape='3']:not([hidden])")
        capture(page, "06-methode-envoi")

        page.click("button[data-suivant='4']")
        page.wait_for_selector("section[data-etape='4']:not([hidden])")
        for cle, val in [("nom", "Marie Dupont"), ("email", "marie.dupont@exemple.fr"),
                         ("telephone", "06 12 34 56 78"), ("adresse", "12 rue des Lilas"),
                         ("complement", "Batiment B, 3e etage"), ("cp", "75011"), ("ville", "Paris")]:
            page.fill("#" + cle, val)
        page.click("button[data-suivant='5']")
        page.wait_for_selector("section[data-etape='5']:not([hidden])")
        page.click("#copier-adresse")
        page.select_option("#qualite", "locataire")
        page.wait_for_function("document.querySelector('#apercu').textContent.includes('locataire')")
        page.check("#accepte_att")
        page.check("#accepte_cgv")
        capture(page, "07-attestation")

        page.click("button[data-suivant='6']")
        page.wait_for_selector("section[data-etape='6']:not([hidden])")
        capture(page, "08-recapitulatif")

        capture(page, "09-compatibilite", "/compatibilite")

        # Suivi d'une commande expediee.
        expediee = None
        for r in refs:
            out = subprocess.run(MYSQL + [
                f"SELECT reference, jeton FROM commandes WHERE reference='{r}' AND statut='expedie'"],
                capture_output=True, text=True)
            if r in out.stdout:
                expediee = out.stdout.strip().split("\n")[1].split("\t")
        if expediee:
            capture(page, "10-suivi", f"/suivi/{expediee[0]}?j={expediee[1]}")

        # Back-office.
        page.goto(BASE + "/admin/connexion")
        page.fill("#mdp", env("ADMIN_PASSWORD", "demo-admin-2026"))
        page.click("button[type=submit]")
        page.wait_for_url(re.compile(r"/admin$"))
        capture(page, "11-admin-tableau")
        capture(page, "12-admin-commandes", "/admin/commandes")
        capture(page, "13-admin-fiche", "/admin/commandes/" + refs[0])
        page.evaluate("window.scrollTo(0, 620)")
        capture(page, "14-admin-fiche-bas")
        capture(page, "15-admin-reglages", "/admin/reglages")

        # Theme sombre.
        page.goto(BASE + "/")
        page.evaluate("localStorage.setItem('bc-theme','sombre')")
        page.reload()
        capture(page, "16-accueil-sombre")

        page.goto(BASE + "/commander")
        page.check("input[name=marque][value=intratone]")
        page.check("input[name=forme][value=porte_cle]")
        page.wait_for_selector("#verdict.oui")
        capture(page, "17-assistant-sombre")

        # Telephone.
        tel = nav.new_page()
        tel.set_viewport_size({"width": 390, "height": 800})
        capture(tel, "18-mobile-accueil", "/")
        tel.goto(BASE + "/commander")
        tel.check("input[name=marque][value=hexact]")
        tel.check("input[name=forme][value=carte]")
        tel.wait_for_selector("#verdict")
        capture(tel, "19-mobile-assistant")

        nav.close()

    print("\nTermine. Captures dans " + SORTIE)
    return 0


if __name__ == "__main__":
    sys.exit(main())
