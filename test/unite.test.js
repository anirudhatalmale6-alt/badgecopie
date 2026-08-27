/* Tests unitaires — aucun acces a la base de donnees. */
'use strict';
const test = require('node:test');
const assert = require('node:assert');

const badges = require('../src/badges');
const tarifs = require('../src/tarifs');
const attestation = require('../src/attestation');
const auth = require('../src/auth');

/* ================= Identification du badge ======================== */

test('une marque sans ambiguite donne un verdict ferme', () => {
  const a = badges.analyse({ marque: 'intratone', forme: 'porte_cle' });
  assert.strictEqual(a.verdict, 'oui');
  assert.ok(a.technos.some((t) => t.cle === 'mifare_classic'));
});

test('STid, qui ne pose que du DESFire, est refuse avant paiement', () => {
  const a = badges.analyse({ marque: 'stid', forme: 'carte' });
  assert.strictEqual(a.verdict, 'non');
});

test('un ensemble melange donne « verifier », jamais « oui »', () => {
  /* Deny pose du Mifare Classic ET du DESFire : promettre la copie
     reviendrait a encaisser des commandes a rembourser une par une. */
  const a = badges.analyse({ marque: 'deny', forme: 'carte' });
  assert.strictEqual(a.verdict, 'verifier');
});

test('le cylindre metallique tranche seul, meme avec une marque contraire', () => {
  const a = badges.analyse({ marque: 'stid', forme: 'cylindre' });
  assert.strictEqual(a.verdict, 'oui');
  assert.strictEqual(a.codeAccepte, true);
});

test("l'option « numero grave » n'est ouverte que pour les cles contact", () => {
  assert.strictEqual(badges.analyse({ marque: 'intratone', forme: 'carte' }).codeAccepte, false);
  assert.strictEqual(badges.analyse({ marque: 'urmet', forme: 'cylindre' }).codeAccepte, true);
});

test('marque et forme incompatibles retombent sur « verifier », pas sur un refus', () => {
  /* Noralsy ne fait que du 125 kHz, la carte evoque plutot du 13,56 MHz :
     l'intersection est vide. Refuser d'office ferait perdre un client dont
     le badge etait parfaitement copiable. */
  const a = badges.analyse({ marque: 'noralsy', forme: 'carte' });
  assert.strictEqual(a.verdict, 'verifier');
  assert.match(a.raison, /ne vont pas ensemble/);
});

test('sans aucune reponse, le verdict est « verifier »', () => {
  assert.strictEqual(badges.analyse({}).verdict, 'verifier');
});

test('la forme seule suffit a proposer un verdict', () => {
  const a = badges.analyse({ forme: 'porte_cle' });
  assert.strictEqual(a.verdict, 'oui');
  assert.strictEqual(a.marque, null);
});

test('les telecommandes a code tournant sont refusees', () => {
  assert.strictEqual(badges.verdictDe(['telecommande_tournant']), 'non');
  /* Une telecommande peut etre l'une ou l'autre : la forme seule ne tranche pas. */
  assert.strictEqual(badges.analyse({ forme: 'telecommande' }).verdict, 'verifier');
});

test('le catalogue expose les trois listes attendues', () => {
  const c = badges.catalogue();
  assert.ok(c.marques.length >= 10);
  assert.ok(c.formes.length >= 5);
  assert.ok(c.technos.length >= 9);
});

/* ================= Numero iButton ================================== */

test('un numero iButton valide est normalise, espaces compris', () => {
  assert.strictEqual(badges.codeIbuttonValide('01 2a 3b 4c 5d 6e'), '012A3B4C5D6E');
  assert.strictEqual(badges.codeIbuttonValide('012A3B4C5D6E7F8A'), '012A3B4C5D6E7F8A');
});

test('un numero iButton invalide est rejete', () => {
  assert.strictEqual(badges.codeIbuttonValide('022A3B4C5D6E'), null, 'doit commencer par 01');
  assert.strictEqual(badges.codeIbuttonValide('012A3B'), null, 'trop court');
  assert.strictEqual(badges.codeIbuttonValide(''), null);
  assert.strictEqual(badges.codeIbuttonValide('01ZZZZZZZZZZ'), null, 'hors hexadecimal');
});

/* ================= Tarifs ========================================== */

const PALIERS = [{ min: 1, prix: 1400 }, { min: 2, prix: 1200 }, { min: 4, prix: 1100 }, { min: 10, prix: 1000 }];

test('le palier retenu est le plus eleve atteint, pas le premier', () => {
  /* Avec 7 badges la reponse est le palier « a partir de 4 ». Un parcours
     qui s'arrete au premier seuil atteint facturerait 14 euros piece. */
  assert.strictEqual(tarifs.palierPour(7, PALIERS).min, 4);
  assert.strictEqual(tarifs.palierPour(1, PALIERS).min, 1);
  assert.strictEqual(tarifs.palierPour(2, PALIERS).min, 2);
  assert.strictEqual(tarifs.palierPour(300, PALIERS).min, 10);
});

test('le total est exact au centime', () => {
  const c = tarifs.calcule(7, PALIERS, 0);
  assert.strictEqual(c.prixUnitaire, 1100);
  assert.strictEqual(c.total, 7700);
  assert.strictEqual(c.economie, (1400 - 1100) * 7);
});

test('les frais de port sont ajoutes une seule fois', () => {
  const c = tarifs.calcule(3, PALIERS, 490);
  assert.strictEqual(c.sousTotal, 3600);
  assert.strictEqual(c.total, 4090);
});

test('la quantite est bornee des deux cotes', () => {
  assert.strictEqual(tarifs.calcule(0, PALIERS).quantite, 1);
  assert.strictEqual(tarifs.calcule(-5, PALIERS).quantite, 1);
  assert.strictEqual(tarifs.calcule('abc', PALIERS).quantite, 1);
  assert.strictEqual(tarifs.calcule(9999, PALIERS).quantite, 50);
});

test('des paliers desordonnes ou incomplets sont remis en etat', () => {
  const p = tarifs.normalisePaliers([{ min: 10, prix: 1000 }, { min: 2, prix: 1200 }]);
  assert.deepStrictEqual(p.map((x) => x.min), [1, 2, 10]);
  /* Sans palier partant de 1, une commande d'un seul badge n'aurait aucun
     prix et le total tomberait a zero sans rien signaler. */
  assert.strictEqual(tarifs.calcule(1, p).total, 1200);
});

test('des paliers illisibles retombent sur le tarif par defaut', () => {
  const p = tarifs.normalisePaliers('ceci n est pas du json');
  assert.deepStrictEqual(p, tarifs.DEFAUT);
  assert.deepStrictEqual(tarifs.normalisePaliers(null), tarifs.DEFAUT);
  assert.deepStrictEqual(tarifs.normalisePaliers([{ min: 'x', prix: 'y' }]), tarifs.DEFAUT);
});

test('les paliers acceptent aussi une chaine JSON, comme en base', () => {
  const p = tarifs.normalisePaliers(JSON.stringify(PALIERS));
  assert.strictEqual(p.length, 4);
  assert.strictEqual(tarifs.calcule(5, p).prixUnitaire, 1100);
});

test('le formatage des euros est francais et gere le zero', () => {
  /* L'espace avant le symbole est INSECABLE (\u00a0). Ecrit tel quel dans
     le test, il ressemble a une espace ordinaire et l'echec est illisible. */
  assert.strictEqual(tarifs.euros(1400), '14,00\u00a0€');
  assert.strictEqual(tarifs.euros(1105), '11,05\u00a0€');
  assert.strictEqual(tarifs.euros(0), '0,00\u00a0€');
  assert.strictEqual(tarifs.euros(-250), '-2,50\u00a0€');
});

test('la grille nomme correctement les bornes', () => {
  const g = tarifs.grille(PALIERS);
  assert.strictEqual(g[0].libelle, '1 badge');
  assert.strictEqual(g[1].libelle, 'de 2 a 3 badges');
  assert.strictEqual(g[3].libelle, '10 badges et plus');
});

/* ================= Attestation ===================================== */

const BASE = {
  nom: 'Marie Dupont', qualite: 'locataire',
  adresseImmeuble: '12 rue des Lilas, 75011 Paris',
  reference: 'BC-26-A7K2M9', quantite: 2, ip: '10.0.0.4',
  date: new Date(2026, 7, 27, 14, 5),
};

test("l'attestation nomme la personne, sa qualite et l'immeuble", () => {
  const t = attestation.texte(BASE);
  assert.ok(t.includes('Marie Dupont'));
  assert.ok(t.includes('locataire du logement'));
  assert.ok(t.includes('12 rue des Lilas, 75011 Paris'));
  assert.ok(t.includes('BC-26-A7K2M9'));
});

test("l'attestation porte la date, l'heure et l'adresse IP de signature", () => {
  const t = attestation.texte(BASE);
  assert.ok(t.includes('27/08/2026 a 14h05'), t);
  assert.ok(t.includes('10.0.0.4'));
});

test("l'accord en nombre suit la quantite commandee", () => {
  assert.ok(attestation.texte({ ...BASE, quantite: 1 }).includes('de la copie'));
  assert.ok(attestation.texte({ ...BASE, quantite: 3 }).includes('des 3 copies'));
});

test('une qualite inconnue retombe sur « occupant », jamais sur du vide', () => {
  const t = attestation.texte({ ...BASE, qualite: 'nimportequoi' });
  assert.ok(t.includes('occupant du logement'));
});

test("sans adresse IP, l'attestation reste une phrase correcte", () => {
  const t = attestation.texte({ ...BASE, ip: null });
  assert.ok(!t.includes('undefined') && !t.includes('null'));
  assert.ok(t.includes('par voie electronique le'));
});

/* ================= Session et references ============================ */

test('un jeton admin fabrique ici est accepte', () => {
  assert.strictEqual(auth.jetonValide(auth.creeJeton()), true);
});

test('un jeton dont la signature est modifiee est refuse', () => {
  const j = auth.creeJeton();
  const parts = j.split('.');
  parts[2] = parts[2].replace(/.$/, (c) => (c === 'a' ? 'b' : 'a'));
  assert.strictEqual(auth.jetonValide(parts.join('.')), false);
});

test('un jeton dont on repousse la date est refuse', () => {
  /* La date fait partie du corps signe : la changer invalide la signature. */
  const parts = auth.creeJeton().split('.');
  parts[1] = String(Date.now() + 999 * 3600 * 1000);
  assert.strictEqual(auth.jetonValide(parts.join('.')), false);
});

test('un jeton expire est refuse', () => {
  const corps = 'admin.' + (Date.now() - 1000);
  assert.strictEqual(auth.jetonValide(corps + '.' + auth.signe(corps)), false);
});

test('un jeton mal forme ne fait pas tomber la verification', () => {
  ['', null, undefined, 'admin', 'a.b', 'a.b.c.d', 'client.999.zz'].forEach((j) => {
    assert.strictEqual(auth.jetonValide(j), false, String(j));
  });
});

test('le mot de passe admin est compare correctement', () => {
  const config = require('../src/config');
  assert.strictEqual(auth.motDePasseOk(config.adminPassword), true);
  assert.strictEqual(auth.motDePasseOk(config.adminPassword + 'x'), false);
  assert.strictEqual(auth.motDePasseOk(''), false);
  assert.strictEqual(auth.motDePasseOk(null), false);
});

test('les references evitent les caracteres qui se confondent a la lecture', () => {
  /* Un client relit sa reference a la main sur une enveloppe : I, O, 0 et 1
     s'y confondent systematiquement. */
  for (let i = 0; i < 200; i++) {
    const r = auth.reference(2026);
    assert.match(r, /^BC-26-[23456789ABCDEFGHJKLMNPQRSTUVWXYZ]{6}$/, r);
  }
});

test('deux references tirees de suite different', () => {
  const vues = new Set();
  for (let i = 0; i < 500; i++) vues.add(auth.reference());
  assert.strictEqual(vues.size, 500);
});

test('le jeton de suivi fait 32 caracteres hexadecimaux', () => {
  assert.match(auth.jetonSuivi(), /^[0-9a-f]{32}$/);
});

test('la comparaison a temps constant gere les longueurs differentes', () => {
  assert.strictEqual(auth.egal('abc', 'abcd'), false);
  assert.strictEqual(auth.egal('abc', 'abc'), true);
  assert.strictEqual(auth.egal('', ''), true);
});
