/* ------------------------------------------------------------------ *
 * Base de connaissance des badges                                      *
 * ------------------------------------------------------------------ *
 * C'est le coeur metier du site. Tout le reste (l'assistant de commande,
 * le prix, la reponse « on sait faire / on ne sait pas faire ») en decoule.
 *
 * Trois verdicts seulement, et jamais un quatrieme :
 *   oui      — technologie copiable, on annonce le service
 *   non      — chiffrement moderne, personne ne le copie. On le dit tout
 *              de suite au client PLUTOT que d'encaisser puis rembourser.
 *   verifier — plusieurs technologies portent le meme nom commercial ou la
 *              meme forme. On ne tranche qu'a reception du badge.
 *
 * « verifier » n'est pas une echappatoire : c'est l'etat reel de la
 * connaissance avant d'avoir le badge en main. Un site qui repond « oui »
 * a tout encaisse des commandes qu'il devra rembourser une par une.
 */
'use strict';

/* --- Technologies -------------------------------------------------- */

const TECHNOS = [
  {
    cle: 'em125',
    nom: 'Badge 125 kHz (EM4100, HID Prox, Noralsy)',
    court: '125 kHz',
    verdict: 'oui',
    vierge: 'T5577',
    /* Ces badges ne contiennent qu'un numero, sans aucun secret : le lecteur
       de l'immeuble ne verifie rien d'autre. La copie est immediate. */
    explication:
      "Ce badge ne contient qu'un numero, sans protection. La copie prend quelques secondes.",
  },
  {
    cle: 'mifare_classic',
    nom: 'Mifare Classic 1K / 4K (13,56 MHz)',
    court: 'Mifare Classic',
    verdict: 'oui',
    vierge: 'Carte Mifare a UID modifiable',
    /* Le chiffrement Crypto1 de Mifare Classic est casse depuis 2008. Les cles
       du secteur se retrouvent avec un lecteur specialise. C'est la techno la
       plus repandue dans les immeubles francais (Intratone, Hexact, Comelit). */
    explication:
      "C'est le badge d'immeuble le plus courant en France. Ses cles se retrouvent avec notre materiel.",
  },
  {
    cle: 'mifare_ultralight',
    nom: 'Mifare Ultralight / NTAG',
    court: 'Ultralight',
    verdict: 'oui',
    vierge: 'Ultralight a UID modifiable',
    explication: "Puce simple, sans chiffrement. Copie possible.",
  },
  {
    cle: 'ibutton',
    nom: 'Cle contact DALLAS / iButton',
    court: 'iButton',
    verdict: 'oui',
    vierge: 'RW1990',
    /* Le numero est grave sur le boitier metal : le client peut commander sans
       nous envoyer sa cle, c'est le seul cas ou la lecture n'est pas necessaire. */
    explication:
      "Le petit cylindre metallique. Son numero est grave dessus : vous pouvez commander sans nous l'envoyer.",
    codeVisible: true,
  },
  {
    cle: 'iclass_legacy',
    nom: 'HID iCLASS (ancienne generation)',
    court: 'iCLASS',
    verdict: 'verifier',
    vierge: 'iCLASS 2k',
    explication:
      "Les anciens iCLASS se copient. Les iCLASS SE et SEOS, non. Impossible de les distinguer sans les lire.",
  },
  {
    cle: 'desfire',
    nom: 'Mifare DESFire EV1 / EV2 / EV3',
    court: 'DESFire',
    verdict: 'non',
    /* AES 128 avec authentification mutuelle : il n'existe pas d'attaque
       pratique. Aucun prestataire au monde ne copie ces badges, et un site qui
       le promet ment ou fabrique autre chose. */
    explication:
      "Chiffrement AES moderne. Ce badge ne se copie pas, ni chez nous ni ailleurs.",
  },
  {
    cle: 'mifare_plus',
    nom: 'Mifare Plus (niveau SL3)',
    court: 'Mifare Plus',
    verdict: 'non',
    explication: "Chiffrement AES. Non copiable.",
  },
  {
    cle: 'vigik_service',
    nom: 'Badge Vigik de service (facteur, EDF, pompiers)',
    court: 'Vigik service',
    verdict: 'non',
    /* A ne pas confondre avec le badge du resident dans un immeuble Vigik.
       Le badge de service porte un certificat a duree de vie courte, recharge
       chaque jour sur une borne : le copier ne servirait de toute facon a rien. */
    explication:
      "Ce badge porte un certificat qui expire chaque jour et se recharge sur une borne. Le copier ne servirait a rien.",
  },
  {
    cle: 'telecommande_fixe',
    nom: 'Telecommande de portail a code fixe',
    court: 'Telecommande code fixe',
    verdict: 'oui',
    explication: "Les anciennes telecommandes emettent toujours le meme code. Elles se dupliquent.",
  },
  {
    cle: 'telecommande_tournant',
    nom: 'Telecommande a code tournant (rolling code)',
    court: 'Telecommande code tournant',
    verdict: 'non',
    /* Somfy Keytis, Nice Flor-S, CAME Atomo... le code change a chaque appui.
       La seule voie est l'appairage sur le moteur, que seul le proprietaire
       du portail peut faire. Ce n'est pas une copie, c'est un ajout. */
    explication:
      "Le code change a chaque appui. On ne la copie pas : il faut l'appairer sur le moteur du portail, chez vous.",
  },
];

const TECHNO = Object.fromEntries(TECHNOS.map((t) => [t.cle, t]));

/* --- Marques d'interphone ------------------------------------------ *
 * Le client ne connait presque jamais la technologie de son badge. En
 * revanche il lit la marque ecrite sur la platine de son interphone, en bas
 * de l'immeuble. C'est notre meilleure entree.
 */

const MARQUES = [
  { cle: 'intratone', nom: 'Intratone', technos: ['mifare_classic'], verdict: 'oui' },
  { cle: 'hexact', nom: 'Hexact / Cogelec', technos: ['mifare_classic'], verdict: 'oui' },
  { cle: 'comelit', nom: 'Comelit', technos: ['mifare_classic'], verdict: 'oui' },
  { cle: 'noralsy', nom: 'Noralsy', technos: ['em125'], verdict: 'oui' },
  { cle: 'urmet', nom: 'Urmet', technos: ['em125', 'mifare_classic'], verdict: 'oui' },
  { cle: 'bticino', nom: 'Bticino / Legrand', technos: ['em125', 'mifare_classic'], verdict: 'oui' },
  { cle: 'aiphone', nom: 'Aiphone', technos: ['mifare_classic'], verdict: 'oui' },
  { cle: 'cdvi', nom: 'CDVI', technos: ['em125', 'mifare_classic'], verdict: 'oui' },
  { cle: 'castel', nom: 'Castel', technos: ['mifare_classic'], verdict: 'oui' },
  { cle: 'visa2000', nom: 'VISA 2000', technos: ['em125'], verdict: 'oui' },
  { cle: 'hid', nom: 'HID', technos: ['em125', 'iclass_legacy'], verdict: 'verifier' },
  { cle: 'deny', nom: 'Deny / Fichet', technos: ['mifare_classic', 'desfire'], verdict: 'verifier' },
  { cle: 'stid', nom: 'STid', technos: ['desfire'], verdict: 'non' },
  { cle: 'inconnue', nom: 'Je ne sais pas', technos: [], verdict: 'verifier' },
];

const MARQUE = Object.fromEntries(MARQUES.map((m) => [m.cle, m]));

/* --- Formes -------------------------------------------------------- *
 * La forme seule ne suffit jamais a trancher — une carte peut etre un Mifare
 * Classic ou un DESFire — sauf pour le cylindre metallique, qui n'existe
 * qu'en iButton.
 */

const FORMES = [
  { cle: 'porte_cle', nom: 'Badge rond ou ovale, porte-cles', technos: ['em125', 'mifare_classic'] },
  { cle: 'carte', nom: 'Carte plastique format carte bancaire', technos: ['mifare_classic', 'desfire', 'iclass_legacy'] },
  { cle: 'cylindre', nom: 'Petit cylindre metallique', technos: ['ibutton'], certain: true },
  { cle: 'goutte', nom: 'Badge en forme de goutte', technos: ['em125', 'mifare_classic'] },
  { cle: 'telecommande', nom: 'Telecommande de portail a boutons', technos: ['telecommande_fixe', 'telecommande_tournant'] },
];

const FORME = Object.fromEntries(FORMES.map((f) => [f.cle, f]));

/* --- Verdict ------------------------------------------------------- */

const RANG = { non: 0, verifier: 1, oui: 2 };

/* Le verdict d'un ensemble de technologies possibles est le PIRE d'entre
   elles, jamais le meilleur : si le badge peut etre un DESFire, on ne promet
   pas la copie sous pretexte qu'il pourrait aussi etre un Mifare Classic.
   Mais un ensemble melange devient « verifier », pas « non » : le refuser
   d'office ferait perdre les clients dont le badge etait copiable. */
function verdictDe(cles) {
  const list = (cles || []).map((c) => TECHNO[c]).filter(Boolean);
  if (!list.length) return 'verifier';
  const rangs = list.map((t) => RANG[t.verdict]);
  const min = Math.min(...rangs);
  const max = Math.max(...rangs);
  if (min === max) return list[0].verdict;
  return 'verifier';
}

/* Croisement marque + forme. Les deux reduisent l'ensemble des technologies
   possibles ; leur intersection est plus precise que chacune prise seule.
   Une intersection vide veut dire que le client s'est trompe quelque part
   (une carte chez Noralsy, par exemple) : on retombe alors sur l'union, ce
   qui donne « verifier » plutot qu'un refus injustifie. */
function analyse({ marque, forme, code }) {
  const m = MARQUE[marque] || null;
  const f = FORME[forme] || null;

  /* Le cylindre metallique est le seul indice certain : c'est un iButton,
     quelle que soit la marque annoncee par le client. */
  if (f && f.certain) {
    return resultat(f.technos, {
      marque: m,
      forme: f,
      raison: 'La forme suffit a identifier la technologie.',
      code,
    });
  }

  const tm = m ? m.technos : [];
  const tf = f ? f.technos : [];
  let technos;
  let raison;

  if (tm.length && tf.length) {
    const inter = tm.filter((t) => tf.includes(t));
    if (inter.length) {
      technos = inter;
      raison = "Croisement de la marque de l'interphone et de la forme du badge.";
    } else {
      technos = [...new Set([...tm, ...tf])];
      raison =
        "La marque et la forme indiquees ne vont pas ensemble : nous verifierons a reception.";
    }
  } else if (tm.length) {
    technos = tm;
    raison = "Identification d'apres la marque de l'interphone.";
  } else if (tf.length) {
    technos = tf;
    raison = "Identification d'apres la forme du badge, sans la marque.";
  } else {
    technos = [];
    raison = "Nous n'avons pas assez d'elements : nous verifierons a reception.";
  }

  return resultat(technos, { marque: m, forme: f, raison, code });
}

function resultat(cles, ctx) {
  const technos = cles.map((c) => TECHNO[c]).filter(Boolean);
  const verdict = verdictDe(cles);
  return {
    verdict,
    technos: technos.map((t) => ({
      cle: t.cle,
      nom: t.nom,
      court: t.court,
      verdict: t.verdict,
      explication: t.explication,
    })),
    /* Un iButton se commande sans envoi postal : son numero est grave sur le
       boitier. C'est la seule technologie ou cette option existe, et l'oublier
       ferait poster des cles pour rien. */
    codeAccepte: technos.some((t) => t.codeVisible),
    codeFourni: !!ctx.code,
    marque: ctx.marque ? ctx.marque.nom : null,
    forme: ctx.forme ? ctx.forme.nom : null,
    raison: ctx.raison,
    message: MESSAGE[verdict],
  };
}

const MESSAGE = {
  oui: "Oui, nous savons copier ce badge.",
  verifier:
    "Nous devons voir le badge pour repondre. Si nous ne savons pas le copier, vous etes rembourse en entier, frais de retour compris.",
  non: "Non, ce badge ne se copie pas. Nous preferons vous le dire maintenant plutot que de vous faire payer.",
};

/* Catalogue envoye au navigateur pour construire l'assistant. */
function catalogue() {
  return {
    marques: MARQUES.map((m) => ({ cle: m.cle, nom: m.nom, verdict: m.verdict })),
    formes: FORMES.map((f) => ({ cle: f.cle, nom: f.nom })),
    technos: TECHNOS.map((t) => ({
      cle: t.cle,
      nom: t.nom,
      court: t.court,
      verdict: t.verdict,
      explication: t.explication,
    })),
  };
}

/* Un code iButton commence toujours par la « family code » 01 et compte
   16 caracteres hexadecimaux graves sur le boitier. Le client n'en lit
   souvent que 12 : on accepte les deux longueurs. */
const RE_IBUTTON = /^01[0-9A-F]{10}(?:[0-9A-F]{4})?$/;
function codeIbuttonValide(code) {
  const c = String(code || '').toUpperCase().replace(/[^0-9A-F]/g, '');
  return RE_IBUTTON.test(c) ? c : null;
}

module.exports = {
  TECHNOS, TECHNO, MARQUES, MARQUE, FORMES, FORME,
  analyse, verdictDe, catalogue, codeIbuttonValide, MESSAGE,
};
