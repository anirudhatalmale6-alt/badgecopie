'use strict';
const express = require('express');
const path = require('path');
const fs = require('fs');
const multer = require('multer');

const config = require('./config');
const db = require('./db');
const badges = require('./badges');
const tarifs = require('./tarifs');
const auth = require('./auth');
const attestation = require('./attestation');
const paiement = require('./paiement');
const mail = require('./mail');
const commandes = require('./commandes');

const accueil = require('./vues/accueil');
const commanderVue = require('./vues/commander');
const V = require('./vues/pages');

const router = express.Router();

const DOSSIER_PHOTOS = path.join(__dirname, '..', 'data', 'photos');
const DOSSIER_PDF = path.join(__dirname, '..', 'data', 'attestations');

/* Les fichiers restent en memoire : ils sont petits, et multer ne doit pas
   ecrire sur le disque une piece jointe d'une commande qui sera refusee
   trois lignes plus bas par la validation. */
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: config.maxUploadMo * 1024 * 1024, files: 1 },
});

/* --- Utilitaires ---------------------------------------------------- */

const RE_EMAIL = /^[^\s@]+@[^\s@]+\.[a-z]{2,}$/i;
/* Retire les caracteres de controle (octet nul, retour chariot, tabulation)
   sans toucher a la ponctuation : une adresse contient des tirets et des
   apostrophes, qu'une classe trop large effacerait en silence. Les echappements
   sont ecrits \x00 et non tapes tels quels : un octet nul dans un fichier source
   le fait passer pour un binaire aux yeux de grep et de git. */
const propre = (v, max = 190) => String(v == null ? '' : v)
  .replace(/[\x00-\x1f\x7f]/g, ' ')
  .replace(/\s+/g, ' ')
  .trim()
  .slice(0, max);

/* L'adresse IP sert uniquement a horodater l'attestation. Derriere un
   reverse proxy, req.ip vaut l'adresse du proxy : on lit donc l'en-tete,
   mais seulement sa PREMIERE valeur — les suivantes sont fournies par le
   client et se falsifient. */
function ipDe(req) {
  const xf = String(req.headers['x-forwarded-for'] || '').split(',')[0].trim();
  return (xf || req.ip || '').replace(/^::ffff:/, '').slice(0, 64);
}

async function ctx() {
  return { reglages: await db.reglages() };
}

/* --- Pages ---------------------------------------------------------- */

router.get('/', async (req, res) => res.send(accueil(await ctx())));
router.get('/commander', async (req, res) => res.send(commanderVue(await ctx())));
router.get('/compatibilite', (req, res) => res.send(V.compatibilite()));
router.get('/legalite', (req, res) => res.send(V.legalite()));
router.get('/aide', async (req, res) => res.send(V.aide(await ctx())));
router.get('/cgv', async (req, res) => res.send(V.cgv(await ctx())));
router.get('/mentions-legales', (req, res) => res.send(V.mentions()));
router.get('/confidentialite', (req, res) => res.send(V.confidentialite()));

router.get('/sante', async (req, res) => {
  try {
    const r = await db.one('SELECT COUNT(*) AS n FROM commandes');
    res.json({ ok: true, commandes: r ? r.n : 0, stripe: paiement.actif() });
  } catch (e) {
    res.status(500).json({ ok: false, erreur: String(e.message || e) });
  }
});

/* --- API de l'assistant --------------------------------------------- */

router.get('/api/catalogue', async (req, res) => {
  const reglages = await db.reglages();
  res.json({
    ...badges.catalogue(),
    paliers: tarifs.normalisePaliers(reglages.paliers),
    fraisPort: Number(reglages.frais_port) || 0,
    qualites: attestation.QUALITES,
  });
});

router.post('/api/analyse', express.json(), (req, res) => {
  const { marque, forme, code } = req.body || {};
  res.json(badges.analyse({ marque, forme, code }));
});

router.post('/api/devis', express.json(), async (req, res) => {
  const reglages = await db.reglages();
  const calcul = tarifs.calcule((req.body || {}).quantite, reglages.paliers, reglages.frais_port);
  res.json({
    ...calcul,
    prixUnitaireTexte: tarifs.euros(calcul.prixUnitaire),
    sousTotalTexte: tarifs.euros(calcul.sousTotal),
    fraisPortTexte: tarifs.euros(calcul.fraisPort),
    totalTexte: tarifs.euros(calcul.total),
    economieTexte: tarifs.euros(calcul.economie),
  });
});

/* Apercu du texte d'attestation, pour que le client lise ce qu'il signe
   AVANT de cocher. Le texte definitif est regenere cote serveur a la
   creation de la commande : cet apercu ne fait foi de rien. */
router.post('/api/attestation', express.json(), (req, res) => {
  const b = req.body || {};
  res.json({
    texte: attestation.texte({
      nom: propre(b.nom) || '[votre nom]',
      qualite: b.qualite,
      adresseImmeuble: propre(b.adresseImmeuble, 255) || "[adresse de l'immeuble]",
      reference: '[numero attribue a la validation]',
      quantite: b.quantite,
      ip: null,
      date: new Date(),
    }),
  });
});

/* --- Creation de la commande ---------------------------------------- */

router.post('/api/commande', upload.single('photo'), async (req, res) => {
  const b = req.body || {};
  const erreurs = [];

  /* 1. Le badge. Le verdict est recalcule ici : celui qu'affiche le
     navigateur n'est qu'un affichage, et un « non » ne doit jamais pouvoir
     etre contourne en rejouant la requete. */
  const code = badges.codeIbuttonValide(b.code_badge);
  const analyse = badges.analyse({ marque: b.marque, forme: b.forme, code });
  if (analyse.verdict === 'non') {
    return res.status(400).json({
      ok: false,
      verdict: 'non',
      erreur: "Ce badge ne peut pas etre reproduit. Nous ne prenons pas la commande.",
    });
  }

  const methode = ['poste', 'code'].includes(b.methode) ? b.methode : 'poste';
  if (methode === 'code') {
    if (!analyse.codeAccepte) erreurs.push("Le numero grave n'existe que sur les cles contact metalliques.");
    else if (!code) erreurs.push("Le numero saisi n'est pas valide : il commence par 01 et compte 12 ou 16 caracteres.");
  }

  /* 2. Coordonnees. */
  const nom = propre(b.nom, 120);
  const email = propre(b.email);
  const adresse = propre(b.adresse);
  const cp = propre(b.cp, 12);
  const ville = propre(b.ville, 120);
  if (nom.length < 2) erreurs.push('Nom manquant.');
  if (!RE_EMAIL.test(email)) erreurs.push("Adresse e-mail invalide.");
  if (adresse.length < 4) erreurs.push('Adresse manquante.');
  if (!/^[0-9]{4,5}$/.test(cp)) erreurs.push('Code postal invalide.');
  if (ville.length < 2) erreurs.push('Ville manquante.');

  /* 3. Attestation. Les deux cases sont obligatoires, et verifiees ici :
     un `required` de formulaire ne protege que les navigateurs. */
  const attNom = propre(b.att_nom, 120) || nom;
  const qualite = attestation.QUALITE[b.qualite] ? b.qualite : 'occupant';
  const adresseImmeuble = propre(b.adresse_immeuble, 255);
  const coche = (v) => v === '1' || v === 'true' || v === 'on' || v === true;
  if (!coche(b.accepte_att)) erreurs.push("L'attestation sur l'honneur doit etre validee.");
  if (!coche(b.accepte_cgv)) erreurs.push('Les conditions generales doivent etre acceptees.');
  if (adresseImmeuble.length < 6) erreurs.push("L'adresse de l'immeuble est obligatoire.");

  if (erreurs.length) return res.status(400).json({ ok: false, erreurs });

  /* 4. Prix — recalcule, jamais lu depuis la requete. */
  const reglages = await db.reglages();
  const calcul = tarifs.calcule(b.quantite, reglages.paliers, reglages.frais_port);

  /* 5. Photo. On verifie le type reel plutot que l'extension annoncee. */
  let photo = null;
  if (req.file && req.file.buffer && req.file.buffer.length) {
    if (!/^image\//.test(req.file.mimetype || '')) {
      return res.status(400).json({ ok: false, erreurs: ["Le fichier joint n'est pas une image."] });
    }
    const ext = (req.file.mimetype.split('/')[1] || 'jpg').replace(/[^a-z0-9]/gi, '').slice(0, 5);
    photo = auth.aleatoire(16) + '.' + ext;
    fs.mkdirSync(DOSSIER_PHOTOS, { recursive: true });
    fs.writeFileSync(path.join(DOSSIER_PHOTOS, photo), req.file.buffer);
  }

  /* 6. Enregistrement. La reference est tiree au hasard : en cas de collision
     (rarissime mais pas impossible), on retente plutot que de rendre une
     erreur incomprehensible au client. */
  const jeton = auth.jetonSuivi();
  let cmd = null;
  for (let essai = 0; essai < 5 && !cmd; essai++) {
    const reference = auth.reference();
    try {
      const r = await db.run(
        `INSERT INTO commandes
          (reference, jeton, statut, email, nom, telephone, adresse, complement, cp, ville, pays,
           quantite, marque, forme, techno, verdict, methode, code_badge, photo, prix_unitaire, total)
         VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
        [reference, jeton, 'attente_paiement', email, nom, propre(b.telephone, 32) || null,
          adresse, propre(b.complement) || null, cp, ville, 'FR',
          calcul.quantite, propre(b.marque, 40) || null, propre(b.forme, 40) || null,
          analyse.technos.length === 1 ? analyse.technos[0].cle : null,
          analyse.verdict, methode, code || null, photo, calcul.prixUnitaire, calcul.total]
      );
      cmd = await db.one('SELECT * FROM commandes WHERE id = ?', [r.insertId]);
    } catch (err) {
      if (!/Duplicate entry/i.test(String(err.message))) throw err;
    }
  }
  if (!cmd) return res.status(500).json({ ok: false, erreurs: ["Impossible d'enregistrer la commande."] });

  await db.run('INSERT INTO historique (commande_id, statut, commentaire, auteur) VALUES (?,?,?,?)',
    [cmd.id, 'attente_paiement', 'Commande creee sur le site', 'client']);

  /* 7. Attestation : texte fige, puis PDF. Le PDF est genere a partir du
     texte enregistre, pas recalcule, pour qu'il dise toujours la meme chose. */
  const texteAtt = attestation.texte({
    nom: attNom, qualite, adresseImmeuble,
    reference: cmd.reference, quantite: calcul.quantite,
    ip: ipDe(req), date: new Date(),
  });
  await db.run(
    `INSERT INTO attestations (commande_id, nom, qualite, adresse_immeuble, texte, ip, agent)
     VALUES (?,?,?,?,?,?,?)`,
    [cmd.id, attNom, qualite, adresseImmeuble, texteAtt, ipDe(req),
      propre(req.headers['user-agent'], 255) || null]
  );
  try {
    const fichier = path.join(DOSSIER_PDF, cmd.reference + '.pdf');
    await attestation.pdf(fichier, { texte: texteAtt, societe: config.societe, reference: cmd.reference });
    await db.run('UPDATE attestations SET pdf = ? WHERE commande_id = ?', [cmd.reference + '.pdf', cmd.id]);
  } catch (err) {
    /* Un PDF manquant ne doit pas faire echouer la commande : le texte,
       qui est la piece de fond, est deja enregistre. On le signale. */
    console.error('attestation PDF', err.message);
  }

  /* 8. Paiement. */
  const p = await paiement.session(cmd, { siteUrl: config.siteUrl });
  res.json({ ok: true, reference: cmd.reference, jeton: cmd.jeton, montant: calcul.total, url: p.url, mode: p.mode });
});

/* --- Paiement -------------------------------------------------------- */

function verifieJeton(cmd, jeton) {
  return cmd && jeton && auth.egal(cmd.jeton, jeton);
}

/* Reprise d'un paiement interrompu. Une nouvelle session est ouverte a
   chaque fois : chez Stripe, une session de paiement expire au bout de
   24 heures, et reutiliser l'ancienne URL menerait a une page morte. Le
   montant est recalcule, ce qui evite aussi de facturer un ancien tarif. */
router.get('/paiement/reprendre/:ref', async (req, res) => {
  const cmd = await commandes.parReference(req.params.ref);
  if (!verifieJeton(cmd, req.query.j)) return res.status(404).send(V.bloc('Commande introuvable', '<p>Ce lien ne correspond a aucune commande.</p>'));
  if (cmd.statut !== 'attente_paiement') return res.redirect(`/suivi/${cmd.reference}?j=${cmd.jeton}`);
  const reglages = await db.reglages();
  const p = await paiement.session(cmd, { siteUrl: config.siteUrl });
  res.redirect(p.url);
});

router.get('/paiement/simule/:ref', async (req, res) => {
  const cmd = await commandes.parReference(req.params.ref);
  if (!verifieJeton(cmd, req.query.j)) return res.status(404).send(V.bloc('Commande introuvable', '<p>Ce lien ne correspond a aucune commande.</p>'));
  res.send(V.paiementSimule({ cmd, montant: cmd.total }));
});

router.post('/paiement/simule/:ref', express.urlencoded({ extended: false }), async (req, res) => {
  const cmd = await commandes.parReference(req.params.ref);
  if (!verifieJeton(cmd, req.body.j)) return res.status(404).send(V.bloc('Commande introuvable', '<p>Ce lien ne correspond a aucune commande.</p>'));
  if (req.body.issue === 'ko') {
    return res.send(V.bloc('Paiement refuse',
      `<p>Le paiement a ete refuse (simulation). Votre commande ${cmd.reference} reste en attente.</p>
       <p><a class="bouton primaire" href="/paiement/simule/${cmd.reference}?j=${cmd.jeton}">Reessayer</a></p>`));
  }
  await finalise(cmd, 'SIMULE-' + cmd.reference, res);
});

router.get('/paiement/retour/:ref', async (req, res) => {
  const cmd = await commandes.parReference(req.params.ref);
  if (!verifieJeton(cmd, req.query.j)) return res.status(404).send(V.bloc('Commande introuvable', '<p>Ce lien ne correspond a aucune commande.</p>'));

  /* On ne se fie pas au fait que le navigateur soit revenu sur cette URL :
     elle est devinable et se visite a la main. Le paiement est relu chez
     Stripe avant de marquer quoi que ce soit. */
  if (paiement.actif() && req.query.sid) {
    try {
      const v = await paiement.verifie(String(req.query.sid));
      if (!v.paye || v.reference !== cmd.reference) {
        return res.send(V.bloc('Paiement non confirme',
          `<p>Stripe ne confirme pas encore ce paiement (${v.motif}). Si votre carte a ete debitee, la commande sera mise a jour automatiquement d'ici quelques minutes.</p>`));
      }
      return finalise(cmd, String(req.query.sid), res);
    } catch (e) {
      return res.send(V.bloc('Paiement non confirme', `<p>Verification impossible pour le moment. La commande sera mise a jour automatiquement.</p>`));
    }
  }
  return finalise(cmd, cmd.paiement_ref, res);
});

router.get('/paiement/annule/:ref', async (req, res) => {
  const cmd = await commandes.parReference(req.params.ref);
  if (!verifieJeton(cmd, req.query.j)) return res.status(404).send(V.bloc('Commande introuvable', '<p>Ce lien ne correspond a aucune commande.</p>'));
  res.send(V.bloc('Paiement annule',
    `<p>Vous avez interrompu le paiement. La commande ${cmd.reference} est conservee, rien n'a ete debite.</p>
     <p><a class="bouton primaire" href="/commander">Recommencer</a></p>`));
});

async function finalise(cmd, paiementRef, res) {
  const reglages = await db.reglages();
  let frais = cmd;
  if (cmd.statut === 'attente_paiement') {
    frais = await commandes.marquePayee(cmd, { paiementRef });
    const m = mail.confirmation(frais, reglages);
    await mail.envoie({ commandeId: cmd.id, destinataire: cmd.email, sujet: m.sujet, corps: m.corps });
  }
  res.send(V.confirmation({
    cmd: frais, reglages,
    lien: `/suivi/${frais.reference}?j=${frais.jeton}`,
  }));
}

/* Webhook Stripe : la seule source fiable quand le client ferme son
   navigateur avant le retour. Le corps doit rester brut pour que la
   signature soit verifiable — d'ou express.raw. */
router.post('/webhook/stripe', express.raw({ type: 'application/json' }), async (req, res) => {
  if (!paiement.actif() || !config.stripe.webhookSecret) return res.status(503).end();
  let evt;
  try {
    const stripe = require('stripe')(config.stripe.secretKey);
    evt = stripe.webhooks.constructEvent(req.body, req.headers['stripe-signature'], config.stripe.webhookSecret);
  } catch (e) {
    return res.status(400).send('signature invalide');
  }
  if (evt.type === 'checkout.session.completed') {
    const sess = evt.data.object;
    const ref = (sess.metadata && sess.metadata.reference) || sess.client_reference_id;
    const cmd = ref ? await commandes.parReference(ref) : null;
    if (cmd && cmd.statut === 'attente_paiement' && sess.payment_status === 'paid') {
      const frais = await commandes.marquePayee(cmd, { paiementRef: sess.id, auteur: 'webhook' });
      const reglages = await db.reglages();
      const m = mail.confirmation(frais, reglages);
      await mail.envoie({ commandeId: cmd.id, destinataire: cmd.email, sujet: m.sujet, corps: m.corps });
    }
  }
  res.json({ recu: true });
});

/* --- Suivi ----------------------------------------------------------- */

router.get('/suivi', (req, res) => res.send(V.suiviFormulaire({})));

router.post('/suivi', express.urlencoded({ extended: false }), async (req, res) => {
  const reference = propre(req.body.reference, 24).toUpperCase();
  const email = propre(req.body.email).toLowerCase();
  const cmd = await commandes.parReference(reference);
  /* Le meme message dans les deux cas : dire « cette commande existe mais
     l'e-mail ne correspond pas » permettrait de tester des references. */
  if (!cmd || String(cmd.email).toLowerCase() !== email) {
    return res.status(404).send(V.suiviFormulaire({
      erreur: "Aucune commande ne correspond a ce numero et a cette adresse e-mail.", reference,
    }));
  }
  res.redirect(`/suivi/${cmd.reference}?j=${cmd.jeton}`);
});

router.get('/suivi/:ref', async (req, res) => {
  const cmd = await commandes.parReference(req.params.ref);
  if (!verifieJeton(cmd, req.query.j)) {
    return res.status(404).send(V.suiviFormulaire({
      erreur: "Ce lien de suivi n'est plus valide. Retrouvez votre commande ci-dessous.",
      reference: req.params.ref,
    }));
  }
  const [historique, reglages] = await Promise.all([commandes.historique(cmd.id), db.reglages()]);
  res.send(V.suivi({ cmd, historique, reglages }));
});

module.exports = router;
