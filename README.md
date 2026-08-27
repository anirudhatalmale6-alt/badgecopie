# BadgeCopie

Site de commande de copies de badges d'immeuble, de cles d'acces et de
telecommandes de portail, destine aux occupants legitimes d'un logement.

Prototype fonctionnel : parcours de commande complet, attestation sur
l'honneur en PDF, paiement, suivi de commande et back-office.

---

## Ce que fait le site

**Cote client**

1. **Assistant d'identification.** Le visiteur repond a deux questions (la
   marque ecrite sur la platine de son interphone, la forme de son badge) et
   obtient immediatement l'un de trois verdicts : *copiable*, *a verifier*,
   *non copiable*. Un badge chiffre moderne est refuse **avant** le paiement.
2. **Quantite** avec tarif degressif, calcule et affiche en direct.
3. **Methode de transmission** : envoi postal, ou saisie du numero grave pour
   les cles contact metalliques (iButton), qui evite d'envoyer la cle.
4. **Coordonnees de livraison.**
5. **Attestation sur l'honneur** nominative, dont le texte s'ecrit sous les
   yeux du client pendant qu'il remplit le formulaire.
6. **Paiement**, puis page de confirmation avec les consignes d'envoi.

Ensuite : page de suivi accessible sans compte (numero de commande +
adresse e-mail), et un e-mail a chaque etape.

**Cote gerant** (`/admin`)

- Tableau de bord : badges a recevoir, a fabriquer, a expedier, encaisse du
  mois, et la liste de ce qui empeche encore la mise en ligne.
- Liste des commandes, filtres par statut, recherche.
- Fiche de commande : avancement en un clic, numero de suivi postal, note
  interne (jamais visible du client), remboursement, attestation en PDF,
  historique complet et journal des e-mails.
- Reglages : paliers tarifaires, frais de port, delai annonce, duree de
  garantie, adresse ou les clients envoient leur badge.
- Journal de tous les e-mails, avec leur etat reel.

---

## Ce que le site ne promet pas

C'est la partie la plus importante du produit.

| Technologie | Verdict | Pourquoi |
|---|---|---|
| 125 kHz (EM4100, HID Prox, Noralsy) | copiable | Ne contient qu'un numero, sans protection. |
| Mifare Classic 1K / 4K | copiable | Le plus courant en France. Ses cles se retrouvent. |
| Mifare Ultralight / NTAG | copiable | Sans chiffrement. |
| Cle contact DALLAS / iButton | copiable | Numero grave sur le boitier. |
| HID iCLASS | **a verifier** | Les anciens se copient, les SE et SEOS non. |
| Mifare DESFire EV1/EV2/EV3 | **non** | AES. Personne ne les copie. |
| Mifare Plus SL3 | **non** | AES. |
| Vigik de service (facteur, EDF) | **non** | Certificat qui expire chaque jour. |
| Telecommande a code fixe | copiable | Emet toujours le meme code. |
| Telecommande a code tournant | **non** | Le code change a chaque appui : il faut appairer sur le moteur. |

Le remboursement integral en cas d'impossibilite n'est pas un geste
commercial : c'est une piece du parcours, prevue des le depart.

**Attention, Vigik recouvre deux choses differentes.** Le badge du *resident*
dans un immeuble Vigik est en general un Mifare Classic ordinaire, donc
copiable. Le badge de *service* porte un certificat a duree de vie courte :
il n'est ni copiable ni utile a copier.

---

## Lecture par smartphone : pourquoi ce n'est pas dans le site

L'API Web NFC (`NDEFReader`) n'existe que dans Chrome sur Android, et elle ne
sait lire que des messages **NDEF**, c'est-a-dire des etiquettes contenant du
texte. Un badge d'immeuble n'en est pas un : ni son UID, ni ses secteurs
Mifare ne sont accessibles depuis un navigateur. Sur iPhone, l'API n'existe
pas du tout.

C'est pour cette raison que les services comparables publient une
**application Android native** et proposent aux possesseurs d'iPhone soit
l'envoi postal, soit la saisie d'un numero grave.

L'option est donc presente dans le parcours, visiblement desactivee, avec son
explication. La brancher demande une application Android separee (compte
developpeur Google, 25 USD une fois).

---

## Installation

```
npm install
cp .env.example .env      # puis renseigner les valeurs
npm start
```

Node 22 ou plus, MySQL 8 ou MariaDB 10.6 et plus. Les tables sont creees et
mises a jour automatiquement au demarrage.

### Variables d'environnement

Voir `.env.example`, integralement commente. Les quatre a renseigner en
priorite :

| Variable | Role |
|---|---|
| `APP_SECRET` | Signature des sessions. **40 caracteres aleatoires.** Un secret devine laisse fabriquer une session administrateur valide. |
| `ADMIN_PASSWORD` | Acces au back-office. |
| `DB_*` | Connexion a la base. |
| `SITE_URL` | Adresse publique. Sert a construire les liens de retour de paiement et les liens de suivi envoyes par e-mail. Une valeur fausse rend ces liens inutilisables. |

### Paiement

Tant que `STRIPE_SECRET_KEY` est vide, le site fonctionne en **paiement
simule** : une page de demonstration remplace Stripe, et suit exactement le
meme chemin (redirection, retour, confirmation cote serveur). Le prototype
est donc parcourable de bout en bout avant l'ouverture du compte Stripe.

Des qu'une cle est presente, Stripe Checkout prend le relais sans autre
changement. Renseigner aussi `STRIPE_WEBHOOK_SECRET` et declarer le point
d'entree `POST /webhook/stripe` chez Stripe : c'est la seule source fiable
lorsqu'un client ferme son navigateur avant le retour.

Le retour du navigateur sur `success_url` ne marque jamais une commande
payee a lui seul : la session est relue chez Stripe avant tout changement.

### E-mails

Tant que `MAIL_TRANSPORT` vaut `fichier`, les messages sont ecrits dans
`data/mails/` au lieu d'etre envoyes, et le back-office l'indique clairement.
C'est volontaire : un envoi qui « reussit » vers un domaine sans SPF ni DKIM
ne prouve rien, les messages partent en indesirable sans que rien n'echoue.

Avant de passer a `smtp` : publier SPF et DKIM pour le domaine d'envoi, puis
verifier un envoi reel et **lire la reponse du relais**, pas seulement
l'absence d'erreur.

---

## Ce qu'il reste a faire avant une mise en ligne

Le back-office les liste egalement, dans « Reglages ».

- [ ] Identite de la societe (`SOCIETE_*`) : sans elle, les CGV et les
      mentions legales sont incompletes et l'affichent.
- [ ] Hebergeur declare (obligation de la LCEN, article 6).
- [ ] Adresse de retour des badges, dans les reglages.
- [ ] Compte Stripe.
- [ ] Domaine, certificat TLS, SPF et DKIM.
- [ ] `APP_SECRET` et `ADMIN_PASSWORD` propres a la production.
- [ ] Grille tarifaire reelle.
- [ ] Verifier que le materiel de lecture couvre bien ce que le site annonce
      dans `src/badges.js` : c'est ce fichier qui fixe les promesses.

---

## Tests

```
npm test        # 36 tests unitaires, sans base de donnees
npm run e2e     # 128 verifications dans un vrai navigateur
npm run demo    # jeu de donnees + captures d'ecran
```

`test/e2e.py` ne se contente pas de cliquer : il verifie que le serveur se
defend **sans** le script de la page. Il rejoue a la main des requetes qu'un
navigateur ne produirait jamais — technologie refusee, attestation absente,
total falsifie — et controle que la base contient bien ce qu'il faut.

Il verifie aussi que la note interne du gerant ne remonte jamais cote client,
que le PDF telecharge commence bien par `%PDF`, qu'un lien de suivi sans
jeton renvoie 404, et qu'une commande laissee impayee est facturee au prix du
jour de la commande et non au tarif courant.

---

## Organisation du code

```
server.js              demarrage, en-tetes de securite, purge RGPD
src/
  badges.js            base de connaissance : technologies, marques, verdicts
  tarifs.js            paliers degressifs, montants en centimes
  attestation.js       texte de l'attestation (fonction pure) + PDF
  paiement.js          Stripe ou simulation, meme interface
  commandes.js         cycle de vie : un seul endroit change un statut
  mail.js              modeles + journalisation de l'etat reel
  db.js                pool, migrations rejouables, purge
  auth.js              session admin signee, references de commande
  routes.js            pages publiques et API
  admin.js             back-office
  vues/                gabarits HTML (fonctions, pas de moteur de template)
public/                CSS, JavaScript, favicon
scripts/relance.sh     redemarrage propre en developpement
test/                  tests unitaires, parcours navigateur, captures
```

### Quelques choix, et leurs raisons

- **Les montants sont en centimes**, partout, jusqu'a l'affichage. Un prix
  stocke en euros flottants finit par produire des totaux faux d'un centime,
  et le rapprochement comptable avec Stripe devient impossible.
- **Le prix d'une commande est fige a sa creation.** Une commande laissee
  impayee et reprise plus tard est facturee au prix annonce ce jour-la, meme
  si la grille a change depuis.
- **Le verdict est recalcule cote serveur** a chaque commande : masquer un
  bouton dans le navigateur ne protege de rien.
- **Le texte de l'attestation est fige en base** au moment de la signature,
  et le PDF est produit a partir de ce texte. Si les conditions changent, les
  attestations deja signees continuent de dire ce que le client a lu.
- **Un seul chemin change un statut** (`commandes.passerStatut`), qui ecrit
  l'historique et envoie l'e-mail. Sinon certaines transitions notifient et
  d'autres non, sans que cela se voie.
- **Les migrations passent par `information_schema`** : `CREATE TABLE IF NOT
  EXISTS` n'ajoute jamais une colonne a une table existante.
- **`[hidden] { display: none !important }`** est la premiere regle de la
  feuille de style. Une regle d'affichage ecrite plus bas l'emporte sinon sur
  l'attribut `hidden`, et l'element reste invisible mais present, interceptant
  les clics.

---

## Donnees personnelles

- Commandes et attestations conservees `RETENTION_JOURS` jours (5 ans par
  defaut), puis effacees automatiquement au demarrage puis une fois par jour.
- L'adresse IP n'est enregistree que dans l'attestation, ou elle a une
  fonction precise : dater et localiser la signature.
- Aucun traceur publicitaire, aucun cookie autre que la session
  administrateur. Le site n'a donc pas besoin de banniere de consentement.
