#!/usr/bin/env python3
"""Parcours complet, dans un vrai navigateur.

Chaque assertion porte sur un effet OBSERVABLE : une ligne en base, un code
HTTP, un texte affiche. Une assertion qui se contenterait de verifier qu'un
bouton existe ne prouve rien sur ce que fait le serveur.

Lancement : python3 test/e2e.py
"""
import json
import os
import re
import sys
import urllib.request
import urllib.error

from playwright.sync_api import sync_playwright, expect

BASE = os.environ.get("BASE", "http://127.0.0.1:3012")
RACINE = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))

ok = 0
ko = []


def verifie(nom, condition, detail=""):
    global ok
    if condition:
        ok += 1
        print(f"  ok   {nom}")
    else:
        ko.append(nom)
        print(f"  FAIL {nom} {detail}")


def env(cle, defaut=""):
    """Lit .env plutot que d'ecrire le mot de passe dans le test."""
    chemin = os.path.join(RACINE, ".env")
    if os.path.exists(chemin):
        for ligne in open(chemin, encoding="utf-8"):
            if ligne.strip().startswith(cle + "="):
                return ligne.split("=", 1)[1].strip()
    return os.environ.get(cle, defaut)


def poste(chemin, donnees):
    """POST JSON brut, sans navigateur : sert a verifier que le serveur se
    defend tout seul, sans compter sur le script de la page."""
    req = urllib.request.Request(
        BASE + chemin,
        data=json.dumps(donnees).encode(),
        headers={"Content-Type": "application/json"},
        method="POST",
    )
    try:
        with urllib.request.urlopen(req) as r:
            return r.status, json.loads(r.read().decode())
    except urllib.error.HTTPError as e:
        corps = e.read().decode()
        try:
            return e.code, json.loads(corps)
        except Exception:
            return e.code, {"corps": corps}


def poste_formulaire(chemin, champs):
    """multipart/form-data a la main : /api/commande attend un formulaire."""
    limite = "----badgecopie-test"
    corps = b""
    for k, v in champs.items():
        corps += (f"--{limite}\r\nContent-Disposition: form-data; name=\"{k}\"\r\n\r\n{v}\r\n").encode()
    corps += f"--{limite}--\r\n".encode()
    req = urllib.request.Request(
        BASE + chemin, data=corps,
        headers={"Content-Type": f"multipart/form-data; boundary={limite}"},
        method="POST",
    )
    try:
        with urllib.request.urlopen(req) as r:
            return r.status, json.loads(r.read().decode())
    except urllib.error.HTTPError as e:
        try:
            return e.code, json.loads(e.read().decode())
        except Exception:
            return e.code, {}


CLIENT = {
    "nom": "Marie Dupont",
    "email": "marie.dupont@exemple.fr",
    "telephone": "0612345678",
    "adresse": "12 rue des Lilas",
    "complement": "Batiment B, 3e etage",
    "cp": "75011",
    "ville": "Paris",
}


def remplit_coordonnees(page):
    for cle, valeur in CLIENT.items():
        page.fill("#" + cle, valeur)


def main():
    with sync_playwright() as p:
        nav = p.chromium.launch()
        page = nav.new_page()
        page.set_viewport_size({"width": 1280, "height": 800})

        # ---------------------------------------------------------------
        print("\n1. Pages publiques")
        page.goto(BASE + "/")
        verifie("l'accueil s'affiche", "double de votre badge" in page.inner_text("h1"))
        verifie("le prix de depart est annonce", "14,00" in page.inner_text("body"))
        # Le site doit dire ce qu'il ne sait PAS faire : c'est ce qui evite les
        # commandes a rembourser.
        verifie("les technologies non copiables sont nommees",
                "DESFire" in page.inner_text("body"))

        for chemin, attendu in [
            ("/compatibilite", "Quels badges"),
            ("/legalite", "legal"),
            ("/aide", "Questions"),
            ("/cgv", "Conditions generales"),
            ("/mentions-legales", "Mentions legales"),
            ("/confidentialite", "Donnees personnelles"),
        ]:
            r = page.goto(BASE + chemin)
            verifie(f"{chemin} repond 200", r.status == 200, f"({r.status})")
            verifie(f"{chemin} affiche son titre", attendu.lower() in page.inner_text("h1").lower())

        r = page.goto(BASE + "/page-qui-nexiste-pas")
        verifie("une page inconnue renvoie 404", r.status == 404, f"({r.status})")

        # Les documents legaux doivent CRIER qu'ils sont incomplets tant que
        # l'identite de la societe n'est pas saisie : publies tels quels, ils
        # exposent l'exploitant.
        page.goto(BASE + "/mentions-legales")
        verifie("les mentions legales signalent qu'elles sont incompletes",
                "completer" in page.inner_text("body").lower())

        # ---------------------------------------------------------------
        print("\n2. Assistant — identification du badge")
        page.goto(BASE + "/commander")
        verifie("l'etape 1 est visible", page.is_visible("section[data-etape='1']"))
        verifie("l'etape 2 est masquee", not page.is_visible("section[data-etape='2']"))
        verifie("le bouton continuer est desactive tant que rien n'est choisi",
                page.is_disabled("#v1"))

        page.check("input[name=marque][value=intratone]")
        page.check("input[name=forme][value=porte_cle]")
        page.wait_for_selector("#verdict.oui")
        verifie("un verdict favorable debloque le bouton", not page.is_disabled("#v1"))
        verifie("Intratone + porte-cles donne un verdict favorable",
                "Bonne nouvelle" in page.inner_text("#verdict"))
        verifie("la technologie identifiee est nommee au client",
                "Mifare Classic" in page.inner_text("#verdict"))

        # STid ne pose que du DESFire : le site doit le refuser AVANT le paiement.
        page.check("input[name=marque][value=stid]")
        page.check("input[name=forme][value=carte]")
        page.wait_for_selector("#verdict.non")
        verifie("STid est refuse a l'ecran", "ne se copie pas" in page.inner_text("#verdict"))
        verifie("le bouton continuer est desactive sur un refus", page.is_disabled("#v1"))

        # L'attribut disabled ne prouve rien : il se retire depuis la console
        # en une ligne. On le retire donc, et on verifie que le passage a
        # l'etape suivante est refuse quand meme.
        page.evaluate("document.getElementById('v1').disabled = false")
        page.click("button[data-suivant='2']")
        verifie("un refus bloque le passage meme si le bouton est reactive a la main",
                not page.is_visible("section[data-etape='2']"))

        # Le cylindre metallique tranche seul, meme contre la marque annoncee.
        page.check("input[name=forme][value=cylindre]")
        page.wait_for_selector("#verdict.oui")
        verifie("le cylindre metallique l'emporte sur la marque",
                not page.is_disabled("#v1"))
        # On interroge l'ATTRIBUT hidden, pas la visibilite : cette option se
        # trouve a l'etape 3, encore repliee. Playwright la dirait « invisible »
        # a cause de sa section parente, et le test echouerait alors que le
        # code fait exactement ce qu'il faut.
        page.wait_for_function("!document.getElementById('opt-code').hasAttribute('hidden')")
        verifie("l'option « numero grave » s'ouvre pour une cle contact",
                page.get_attribute("#opt-code", "hidden") is None)

        # Retour a un badge ordinaire pour la suite du parcours.
        page.check("input[name=marque][value=intratone]")
        page.check("input[name=forme][value=porte_cle]")
        page.wait_for_selector("#verdict.oui")
        page.wait_for_function("document.getElementById('opt-code').hasAttribute('hidden')")
        verifie("l'option « numero grave » se referme pour un badge ordinaire",
                page.get_attribute("#opt-code", "hidden") is not None)

        # ---------------------------------------------------------------
        print("\n3. Assistant — quantite et prix")
        page.click("button[data-suivant='2']")
        page.wait_for_selector("section[data-etape='2']:not([hidden])")
        page.wait_for_function("document.querySelector('#prix').textContent.includes('14,00')")
        verifie("un badge est facture au tarif de depart", "14,00" in page.inner_text("#prix"))

        for _ in range(6):
            page.click("button[data-q='1']")
        page.wait_for_function("document.querySelector('#quantite').value === '7'")
        page.wait_for_function("document.querySelector('#prix').textContent.includes('77,00')")
        prix = page.inner_text("#prix")
        # 7 badges relevent du palier « a partir de 4 » : 11 euros piece.
        verifie("7 badges passent au bon palier", "11,00" in prix, prix)
        verifie("le total de 7 badges est exact", "77,00" in prix, prix)
        # L'economie est presentee comme une phrase sous le total, et non
        # comme une ligne a soustraire : dans la colonne des montants, elle
        # faisait paraitre l'addition fausse.
        verifie("l'economie realisee est annoncee", "economisez" in prix, prix)
        verifie("mais elle n'est pas soustraite du total", "77,00" in prix and "−" not in prix, prix)

        page.fill("#quantite", "2")
        page.dispatch_event("#quantite", "input")
        page.wait_for_function("document.querySelector('#prix').textContent.includes('24,00')")
        verifie("2 badges reviennent au palier 2", "12,00" in page.inner_text("#prix"))

        # ---------------------------------------------------------------
        print("\n4. Assistant — methode d'envoi")
        page.click("button[data-suivant='3']")
        page.wait_for_selector("section[data-etape='3']:not([hidden])")
        verifie("l'envoi postal est preselectionne", page.is_checked("input[name=methode][value=poste]"))
        verifie("la lecture par telephone est desactivee",
                page.is_disabled("input[name=methode][value=nfc]"))
        verifie("et le site explique pourquoi",
                "navigateur" in page.inner_text("section[data-etape='3']"))
        verifie("le champ numero est masque pour un envoi postal",
                not page.is_visible("#bloc-code"))

        # ---------------------------------------------------------------
        print("\n5. Assistant — coordonnees")
        page.click("button[data-suivant='4']")
        page.wait_for_selector("section[data-etape='4']:not([hidden])")
        page.click("button[data-suivant='5']")
        verifie("un formulaire vide ne passe pas", page.is_visible("#err-coord"))
        verifie("et le message dit ce qui manque", "Il manque" in page.inner_text("#err-coord"))

        remplit_coordonnees(page)
        page.fill("#email", "pas-une-adresse")
        page.click("button[data-suivant='5']")
        verifie("une adresse e-mail invalide est refusee",
                "e-mail" in page.inner_text("#err-coord"))

        page.fill("#email", CLIENT["email"])
        page.click("button[data-suivant='5']")
        page.wait_for_selector("section[data-etape='5']:not([hidden])")
        verifie("des coordonnees valides font avancer", page.is_visible("section[data-etape='5']"))

        # ---------------------------------------------------------------
        print("\n6. Assistant — attestation")
        verifie("le nom est repris de l'etape precedente",
                page.input_value("#att_nom") == CLIENT["nom"])

        page.click("#copier-adresse")
        verifie("le bouton recopie l'adresse de livraison",
                "12 rue des Lilas" in page.input_value("#adresse_immeuble"))

        page.select_option("#qualite", "locataire")
        page.wait_for_function(
            "document.querySelector('#apercu').textContent.includes('locataire du logement')")
        apercu = page.inner_text("#apercu")
        verifie("l'apercu nomme le signataire", CLIENT["nom"] in apercu)
        verifie("l'apercu nomme l'immeuble", "12 rue des Lilas" in apercu)
        verifie("l'apercu porte la qualite choisie", "locataire du logement" in apercu)
        verifie("l'apercu accorde le nombre de copies", "des 2 copies" in apercu, apercu[:200])

        page.click("button[data-suivant='6']")
        verifie("sans case cochee, on ne passe pas", page.is_visible("#err-att"))
        page.check("#accepte_att")
        page.click("button[data-suivant='6']")
        verifie("la case CGV est exigee separement",
                "conditions generales" in page.inner_text("#err-att").lower())
        page.check("#accepte_cgv")
        page.click("button[data-suivant='6']")
        page.wait_for_selector("section[data-etape='6']:not([hidden])")

        recap = page.inner_text("#recap")
        verifie("le recapitulatif reprend le badge", "Intratone" in recap)
        verifie("le recapitulatif reprend le total", "24,00" in recap, recap)
        verifie("le recapitulatif reprend l'attestation", "12 rue des Lilas" in recap)

        # ---------------------------------------------------------------
        print("\n7. Paiement et confirmation")
        page.click("#payer")
        page.wait_for_url(re.compile(r"/paiement/simule/"))
        verifie("on arrive sur la page de paiement", "Paiement" in page.inner_text("h1"))
        verifie("le montant a payer est celui du recapitulatif", "24,00" in page.inner_text("body"))

        # Un refus doit laisser la commande intacte, pas la marquer payee.
        page.click("button[value='ko']")
        page.wait_for_selector("h1")
        verifie("un paiement refuse est annonce comme tel", "refuse" in page.inner_text("h1").lower())

        page.click("a:has-text('Reessayer')")
        page.wait_for_url(re.compile(r"/paiement/simule/"))
        page.click("button[value='ok']")
        page.wait_for_selector("h1")
        verifie("un paiement accepte mene a la confirmation",
                "enregistre" in page.inner_text("h1").lower())

        corps = page.inner_text("body")
        m = re.search(r"BC-\d{2}-[0-9A-Z]{6}", corps)
        verifie("un numero de commande est attribue", m is not None, corps[:200])
        reference = m.group(0) if m else None
        verifie("la reference evite les caracteres confondables",
                reference is not None and not re.search(r"[IO01]", reference.split("-")[2]),
                str(reference))
        verifie("le client sait ou envoyer son badge", "postez" in corps.lower())
        # L'adresse de retour n'etant pas encore reglee, le site doit le dire
        # au lieu d'afficher un vide.
        verifie("l'adresse manquante est signalee, pas laissee vide",
                "adresse a completer" in corps.lower())

        # ---------------------------------------------------------------
        print("\n8. Suivi de commande")
        page.goto(BASE + "/suivi")
        page.fill("#reference", reference)
        page.fill("#email", "quelquun.dautre@exemple.fr")
        page.click("button[type=submit]")
        page.wait_for_selector("body")
        verifie("un e-mail qui ne correspond pas est refuse",
                "Aucune commande" in page.inner_text("body"))
        verifie("et le message ne revele pas que la reference existe",
                "existe" not in page.inner_text(".alerte").lower())

        page.goto(BASE + "/suivi")
        page.fill("#reference", reference.lower())   # le client tape en minuscules
        page.fill("#email", CLIENT["email"].upper())  # et l'e-mail en majuscules
        page.click("button[type=submit]")
        page.wait_for_url(re.compile(r"/suivi/BC-"))
        verifie("la recherche est insensible a la casse", reference in page.inner_text("h1"))
        suivi = page.inner_text("body")
        verifie("le statut affiche est « en attente du badge »",
                "attente de votre badge" in suivi.lower() or "attente du badge" in suivi.lower(), suivi[:300])
        verifie("l'historique montre les deux etapes deja franchies",
                suivi.count("Paye") >= 1 and "En attente du badge" in suivi)

        # Le jeton doit vraiment proteger la page : la reference seule ne suffit pas.
        r = page.goto(BASE + "/suivi/" + reference)
        verifie("le suivi sans jeton est refuse", r.status == 404, f"({r.status})")
        r = page.goto(BASE + "/suivi/" + reference + "?j=" + "0" * 32)
        verifie("un jeton faux est refuse", r.status == 404, f"({r.status})")

        # ---------------------------------------------------------------
        print("\n9. Defenses du serveur, sans passer par la page")
        code, rep = poste("/api/analyse", {"marque": "stid", "forme": "carte"})
        verifie("l'API confirme le refus de STid", rep.get("verdict") == "non", str(rep)[:120])

        code, rep = poste_formulaire("/api/commande", {
            "marque": "stid", "forme": "carte", "quantite": "1", "methode": "poste",
            **CLIENT, "att_nom": CLIENT["nom"], "qualite": "locataire",
            "adresse_immeuble": "12 rue des Lilas, 75011 Paris",
            "accepte_att": "1", "accepte_cgv": "1",
        })
        # Le navigateur masque le bouton ; le serveur doit refuser meme quand
        # on rejoue la requete a la main.
        verifie("une technologie non copiable est refusee cote serveur",
                code == 400 and rep.get("verdict") == "non", f"{code} {rep}")

        code, rep = poste_formulaire("/api/commande", {
            "marque": "intratone", "forme": "porte_cle", "quantite": "1", "methode": "poste",
            **CLIENT, "att_nom": CLIENT["nom"], "qualite": "locataire",
            "adresse_immeuble": "12 rue des Lilas, 75011 Paris",
            "accepte_cgv": "1",
        })
        verifie("une commande sans attestation est refusee",
                code == 400 and any("attestation" in x.lower() for x in rep.get("erreurs", [])),
                f"{code} {rep}")

        code, rep = poste_formulaire("/api/commande", {
            "marque": "intratone", "forme": "porte_cle", "quantite": "1", "methode": "code",
            "code_badge": "99ZZZZZZZZZZ",
            **CLIENT, "att_nom": CLIENT["nom"], "qualite": "locataire",
            "adresse_immeuble": "12 rue des Lilas, 75011 Paris",
            "accepte_att": "1", "accepte_cgv": "1",
        })
        verifie("le numero grave est refuse sur un badge qui n'en a pas",
                code == 400, f"{code} {rep}")

        # Le prix est recalcule cote serveur : un total envoye par le
        # navigateur ne doit avoir aucun effet.
        code, rep = poste_formulaire("/api/commande", {
            "marque": "intratone", "forme": "porte_cle", "quantite": "7", "methode": "poste",
            "total": "1", "prix_unitaire": "1",
            **CLIENT, "att_nom": CLIENT["nom"], "qualite": "locataire",
            "adresse_immeuble": "12 rue des Lilas, 75011 Paris",
            "accepte_att": "1", "accepte_cgv": "1",
        })
        verifie("la commande truquee est bien creee", code == 200 and rep.get("ok"), f"{code} {rep}")
        verifie("mais le total est celui du serveur, pas celui envoye",
                rep.get("montant") == 7700, str(rep.get("montant")))
        ref_truquee = rep.get("reference")

        code, rep = poste("/api/devis", {"quantite": "999"})
        verifie("le devis borne la quantite", rep.get("quantite") == 50, str(rep)[:120])

        # ---------------------------------------------------------------
        print("\n10. Back-office")
        r = page.goto(BASE + "/admin")
        verifie("l'admin exige une connexion", "/admin/connexion" in page.url, page.url)

        page.fill("#mdp", "mauvais-mot-de-passe")
        page.click("button[type=submit]")
        page.wait_for_selector(".alerte")
        verifie("un mauvais mot de passe est refuse", "incorrect" in page.inner_text(".alerte"))

        page.fill("#mdp", env("ADMIN_PASSWORD", "demo-admin-2026"))
        page.click("button[type=submit]")
        page.wait_for_url(re.compile(r"/admin$"))
        verifie("le bon mot de passe ouvre le tableau de bord",
                "Tableau de bord" in page.inner_text("h1"))

        tableau = page.inner_text("body")
        verifie("le tableau de bord signale l'adresse de retour manquante",
                "adresse de retour" in tableau.lower())
        verifie("il signale aussi que Stripe n'est pas branche", "Stripe" in tableau)
        verifie("les commandes du test apparaissent", reference in tableau)

        page.goto(BASE + "/admin/commandes/" + reference)
        verifie("la fiche commande s'ouvre", reference in page.inner_text("h1"))
        fiche = page.inner_text("body")
        verifie("la fiche montre le client", CLIENT["nom"] in fiche)
        verifie("la fiche montre l'attestation signee", "12 rue des Lilas" in fiche)
        verifie("la fiche montre le total", "24,00" in fiche)

        # Le PDF doit vraiment etre un PDF, pas une page d'erreur en 200.
        rep_pdf = page.request.get(BASE + "/admin/attestation/" + reference)
        verifie("le PDF d'attestation se telecharge", rep_pdf.status == 200, str(rep_pdf.status))
        verifie("et c'est reellement un PDF", rep_pdf.body()[:4] == b"%PDF", str(rep_pdf.body()[:20]))

        # Faire avancer la commande, et verifier que le client en est informe.
        page.click("button[value='badge_recu']")
        page.wait_for_selector(".alerte.succes")
        verifie("le statut avance", "Badge recu" in page.inner_text(".statut.gros"))
        verifie("l'historique enregistre l'auteur", "admin" in page.inner_text(".historique"))
        verifie("un e-mail est parti au client",
                "Badge recu" in page.inner_text("body"))

        page.fill("input[name=suivi]", "6X12345678901")
        page.click("form[action$='/suivi'] button")
        page.wait_for_selector(".alerte.succes")
        verifie("le numero de suivi est enregistre",
                page.input_value("input[name=suivi]") == "6X12345678901")

        page.fill("textarea[name=note]", "Mifare Classic 1K, secteur 3, cles trouvees.")
        page.click("form[action$='/note'] button")
        page.wait_for_selector(".alerte.succes")
        verifie("la note interne est enregistree",
                "secteur 3" in page.input_value("textarea[name=note]"))

        # La note interne ne doit JAMAIS remonter cote client.
        page.goto(BASE + "/suivi")
        page.fill("#reference", reference)
        page.fill("#email", CLIENT["email"])
        page.click("button[type=submit]")
        page.wait_for_url(re.compile(r"/suivi/BC-"))
        verifie("la note interne reste invisible du client",
                "secteur 3" not in page.inner_text("body"))
        verifie("mais le client voit son statut a jour",
                "recu" in page.inner_text("body").lower())

        # Filtres et recherche.
        page.goto(BASE + "/admin/commandes?statut=badge_recu")
        verifie("le filtre par statut fonctionne", reference in page.inner_text("body"))
        page.goto(BASE + "/admin/commandes?statut=livre")
        verifie("un statut sans commande n'en invente pas",
                reference not in page.inner_text("body"))
        page.goto(BASE + "/admin/commandes?q=" + CLIENT["ville"])
        verifie("la recherche par ville trouve la commande", reference in page.inner_text("body"))
        page.goto(BASE + "/admin/commandes?q=zzzzintrouvable")
        verifie("une recherche vide affiche un message, pas un tableau vide",
                "Aucune commande" in page.inner_text("body"))

        # ---------------------------------------------------------------
        print("\n11. Reglages")
        page.goto(BASE + "/admin/reglages")
        page.fill("#adresse_retour", "BadgeCopie\n5 rue de la Paix\n75002 Paris")
        page.fill("#frais_port", "2,90")
        champs_prix = page.query_selector_all("input[name=palier_prix]")
        champs_prix[0].fill("15,50")
        page.click("button[type=submit]")
        page.wait_for_selector(".alerte.succes")

        page.goto(BASE + "/admin/reglages")
        verifie("l'adresse de retour est enregistree",
                "5 rue de la Paix" in page.input_value("#adresse_retour"))
        # « 2,90 » saisi a la francaise doit valoir 290 centimes, pas 2.
        verifie("un montant a virgule est lu correctement",
                page.input_value("#frais_port") == "2.90", page.input_value("#frais_port"))
        verifie("le premier palier a change", champs_prix is not None
                and page.query_selector_all("input[name=palier_prix]")[0].input_value() == "15.50")

        page.goto(BASE + "/")
        verifie("le nouveau prix apparait sur l'accueil", "15,50" in page.inner_text("body"))
        verifie("les frais de port apparaissent aussi", "2,90" in page.inner_text("body"))

        code, rep = poste("/api/devis", {"quantite": "1"})
        verifie("le devis applique le nouveau tarif et le port",
                rep.get("total") == 1550 + 290, str(rep.get("total")))

        # ---------------------------------------------------------------
        print("\n11 bis. Reprise d'un paiement abandonne")
        # La commande truquee n'a jamais ete payee : elle doit proposer de
        # reprendre, et surtout ne pas afficher une barre d'avancement comme
        # si un colis etait en route.
        page.goto(BASE + "/suivi")
        page.fill("#reference", ref_truquee)
        page.fill("#email", CLIENT["email"])
        page.click("button[type=submit]")
        page.wait_for_url(re.compile(r"/suivi/BC-"))
        corps = page.inner_text("body")
        verifie("une commande impayee est annoncee comme telle", "pas ete payee" in corps)
        verifie("aucune barre d'avancement sur une commande impayee",
                not page.is_visible(".progression"))
        verifie("le montant du reste celui de la commande, malgre le nouveau tarif",
                "77,00" in corps, corps[:300])

        page.click("a:has-text('Reprendre le paiement')")
        page.wait_for_url(re.compile(r"/paiement/simule/"))
        # Le tarif a change entre-temps (15,50 au lieu de 14,00 et 2,90 de port).
        # Le client doit payer le prix annonce le jour de sa commande.
        verifie("la reprise facture le prix d'origine, pas le tarif du jour",
                "77,00" in page.inner_text("body"), page.inner_text("body")[:300])
        page.click("button[value='ok']")
        page.wait_for_selector("h1")
        verifie("la reprise mene bien a la confirmation",
                "enregistre" in page.inner_text("h1").lower())

        # La page de suivi doit maintenant donner l'adresse reglee plus haut.
        page.goto(BASE + "/suivi")
        page.fill("#reference", ref_truquee)
        page.fill("#email", CLIENT["email"])
        page.click("button[type=submit]")
        page.wait_for_url(re.compile(r"/suivi/BC-"))
        verifie("l'adresse de retour apparait desormais dans le suivi",
                "5 rue de la Paix" in page.inner_text("body"))
        verifie("le suivi ne dit plus « adresse a completer »",
                "adresse a completer" not in page.inner_text("body").lower())

        # Le lien de reprise ne doit plus rien faire une fois la commande payee.
        r = page.goto(BASE + "/paiement/reprendre/" + ref_truquee + "?j=0" * 16)
        verifie("la reprise exige le bon jeton", r.status == 404, str(r.status))

        # ---------------------------------------------------------------
        print("\n12. Remboursement")
        page.goto(BASE + "/admin/commandes/" + reference)
        page.once("dialog", lambda d: d.accept())
        page.click("button:has-text('Rembourser')")
        page.wait_for_selector(".alerte.succes")
        verifie("le remboursement passe la commande a « Rembourse »",
                "Rembourse" in page.inner_text(".statut.gros"))
        verifie("plus aucune action n'est proposee ensuite",
                "terminee" in page.inner_text("body").lower())

        page.goto(BASE + "/suivi")
        page.fill("#reference", reference)
        page.fill("#email", CLIENT["email"])
        page.click("button[type=submit]")
        page.wait_for_url(re.compile(r"/suivi/BC-"))
        corps = page.inner_text("body")
        verifie("le client voit le remboursement", "Rembourse" in corps)
        # Une commande remboursee ne doit plus afficher la barre d'avancement
        # comme si le colis etait en route.
        verifie("la barre d'avancement disparait sur un remboursement",
                not page.is_visible(".progression"))

        # ---------------------------------------------------------------
        print("\n13. Journal des e-mails")
        page.goto(BASE + "/admin/mails")
        journal = page.inner_text("body")
        verifie("les e-mails sont journalises", CLIENT["email"] in journal)
        # « fichier » et non « envoye » : aucun serveur SMTP n'est configure,
        # et le journal doit le dire au lieu de laisser croire a un envoi.
        verifie("l'etat reel est affiche, pas un « envoye » de complaisance",
                "fichier" in journal and "envoye" not in journal.lower(), journal[:300])

        dossier = os.path.join(RACINE, "data", "mails")
        fichiers = os.listdir(dossier) if os.path.isdir(dossier) else []
        verifie("les messages sont reellement ecrits sur le disque", len(fichiers) >= 3, str(len(fichiers)))
        if fichiers:
            contenu = open(os.path.join(dossier, sorted(fichiers)[0]), encoding="utf-8").read()
            verifie("le message contient le lien de suivi", "/suivi/BC-" in contenu)
            verifie("le message contient la reference", "BC-" in contenu)

        # ---------------------------------------------------------------
        print("\n14. Deconnexion et theme")
        page.goto(BASE + "/admin/deconnexion")
        r = page.goto(BASE + "/admin/commandes")
        verifie("apres deconnexion, l'admin est de nouveau ferme",
                "/admin/connexion" in page.url, page.url)

        page.goto(BASE + "/")
        depart = page.get_attribute("html", "data-theme")
        page.click("#btheme")
        arrive = page.get_attribute("html", "data-theme")
        verifie("le theme change au clic", depart != arrive, f"{depart} -> {arrive}")
        page.reload()
        verifie("le theme choisi est retenu apres rechargement",
                page.get_attribute("html", "data-theme") == arrive)

        # ---------------------------------------------------------------
        print("\n15. Telephone")
        page.set_viewport_size({"width": 390, "height": 844})
        page.goto(BASE + "/")
        verifie("le menu est replie sur telephone", not page.is_visible("#nav"))
        page.click("#bmenu")
        page.wait_for_selector("#nav.ouvert")
        verifie("le bouton menu ouvre la navigation", page.is_visible("#nav"))

        largeur = page.evaluate("document.documentElement.scrollWidth")
        verifie("la page ne deborde pas horizontalement", largeur <= 391, str(largeur))

        page.goto(BASE + "/commander")
        page.set_viewport_size({"width": 390, "height": 844})
        largeur = page.evaluate("document.documentElement.scrollWidth")
        verifie("le formulaire non plus", largeur <= 391, str(largeur))

        nav.close()

    print("\n" + "=" * 60)
    print(f"{ok} verifications reussies, {len(ko)} echec(s)")
    for n in ko:
        print("  - " + n)
    return 1 if ko else 0


if __name__ == "__main__":
    sys.exit(main())
