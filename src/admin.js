'use strict';
const express = require('express');
const path = require('path');
const fs = require('fs');

const config = require('./config');
const db = require('./db');
const auth = require('./auth');
const tarifs = require('./tarifs');
const paiement = require('./paiement');
const commandes = require('./commandes');
const A = require('./vues/admin');

const router = express.Router();
const form = express.urlencoded({ extended: false });

const DOSSIER_PHOTOS = path.join(__dirname, '..', 'data', 'photos');
const DOSSIER_PDF = path.join(__dirname, '..', 'data', 'attestations');

/* --- Connexion ------------------------------------------------------- */

router.get('/connexion', (req, res) => {
  res.send(A.connexion({ suite: req.query.suite }));
});

router.post('/connexion', form, (req, res) => {
  if (!auth.motDePasseOk(req.body.mdp)) {
    /* Message unique et delai constant : distinguer « mot de passe vide » de
       « mot de passe faux » renseigne un attaquant pour rien. */
    return res.status(401).send(A.connexion({ erreur: 'Mot de passe incorrect.', suite: req.body.suite }));
  }
  auth.poseCookie(req, res, auth.creeJeton());
  const suite = String(req.body.suite || '/admin');
  /* On ne redirige que vers une adresse interne : une redirection ouverte
     transforme la page de connexion en tremplin vers un site tiers. */
  res.redirect(/^\/admin(\/|$)/.test(suite) ? suite : '/admin');
});

router.get('/deconnexion', (req, res) => {
  auth.retireCookie(req, res);
  res.redirect('/admin/connexion');
});

router.use(auth.exigeAdmin);

/* --- Tableau de bord --------------------------------------------------- */

router.get('/', async (req, res) => {
  const rows = await db.all('SELECT statut, COUNT(*) AS n FROM commandes GROUP BY statut');
  const compteurs = Object.fromEntries(rows.map((r) => [r.statut, r.n]));

  const ca = await db.one(`SELECT
      COALESCE(SUM(CASE WHEN paye_le >= DATE_FORMAT(NOW(), '%Y-%m-01') THEN total ELSE 0 END), 0) AS mois,
      COALESCE(SUM(total), 0) AS total
    FROM commandes WHERE paye_le IS NOT NULL AND statut <> 'rembourse'`);

  const recentes = await db.all(`SELECT * FROM commandes ORDER BY id DESC LIMIT ${db.lim(12)}`);
  const reglages = await db.reglages();

  /* Les alertes portent sur ce qui empeche le site de fonctionner pour de
     vrai, pas sur des details cosmetiques. */
  const alertes = [];
  if (!reglages.adresse_retour) alertes.push("Aucune adresse de retour : vos clients ne savent pas ou envoyer leur badge. <a href='/admin/reglages'>Renseigner</a>");
  if (!paiement.actif()) alertes.push('Stripe n\'est pas configure : les paiements sont simules.');
  if (config.mail.transport !== 'smtp') alertes.push("Aucun serveur d'envoi : les e-mails sont ecrits dans un dossier au lieu de partir.");
  if (!config.societe.siret) alertes.push("Identite de la societe absente : CGV et mentions legales incompletes.");
  const sansAtt = await db.one(`SELECT COUNT(*) AS n FROM commandes c
     LEFT JOIN attestations a ON a.commande_id = c.id WHERE a.id IS NULL AND c.statut <> 'attente_paiement'`);
  if (sansAtt && sansAtt.n) alertes.push(`${sansAtt.n} commande(s) payee(s) sans attestation enregistree.`);

  res.send(A.tableau({ compteurs, ca, recentes, alertes, message: req.query.m }));
});

/* --- Liste ------------------------------------------------------------- */

const PAR_PAGE = 30;

router.get('/commandes', async (req, res) => {
  const filtre = db.STATUT[req.query.statut] ? req.query.statut : '';
  const q = String(req.query.q || '').trim().slice(0, 80);
  const p = Math.max(1, parseInt(req.query.p, 10) || 1);

  const where = [];
  const params = [];
  if (filtre) { where.push('statut = ?'); params.push(filtre); }
  if (q) {
    where.push('(reference LIKE ? OR nom LIKE ? OR email LIKE ? OR ville LIKE ?)');
    const like = '%' + q + '%';
    params.push(like, like, like, like);
  }
  const sql = where.length ? ' WHERE ' + where.join(' AND ') : '';

  const c = await db.one('SELECT COUNT(*) AS n FROM commandes' + sql, params);
  const total = c ? c.n : 0;
  /* LIMIT et OFFSET sont interpoles apres passage par lim() : mysql2 refuse
     ces deux valeurs en parametre lie sur une requete preparee. */
  const list = await db.all(
    'SELECT * FROM commandes' + sql + ` ORDER BY id DESC LIMIT ${db.lim(PAR_PAGE)} OFFSET ${db.off((p - 1) * PAR_PAGE)}`,
    params
  );

  res.send(A.liste({
    list, filtre, recherche: q, total, page: p,
    pages: Math.max(1, Math.ceil(total / PAR_PAGE)), message: req.query.m,
  }));
});

/* --- Detail ------------------------------------------------------------ */

async function charge(req, res) {
  const cmd = await commandes.parReference(req.params.ref);
  if (!cmd) { res.status(404).send(A.coque({ titre: 'Introuvable', corps: '<h1>Commande introuvable</h1>' })); return null; }
  return cmd;
}

router.get('/commandes/:ref', async (req, res) => {
  const cmd = await charge(req, res);
  if (!cmd) return;
  const [att, historique, mails] = await Promise.all([
    db.one('SELECT * FROM attestations WHERE commande_id = ?', [cmd.id]),
    commandes.historique(cmd.id),
    db.all(`SELECT * FROM mails WHERE commande_id = ? ORDER BY id DESC LIMIT ${db.lim(20)}`, [cmd.id]),
  ]);
  res.send(A.detail({ cmd, att, historique, mails, suite: commandes.suiteDe(cmd.statut), message: req.query.m }));
});

router.post('/commandes/:ref/statut', form, async (req, res) => {
  const cmd = await charge(req, res);
  if (!cmd) return;
  const statut = req.body.statut;
  if (!db.STATUT[statut]) return res.redirect(`/admin/commandes/${cmd.reference}`);
  await commandes.passerStatut(cmd, statut, {
    commentaire: String(req.body.commentaire || '').trim().slice(0, 255) || null,
    auteur: 'admin',
  });
  res.redirect(`/admin/commandes/${cmd.reference}?m=` + encodeURIComponent('Statut mis a jour, le client a ete prevenu.'));
});

router.post('/commandes/:ref/suivi', form, async (req, res) => {
  const cmd = await charge(req, res);
  if (!cmd) return;
  await db.run('UPDATE commandes SET suivi = ? WHERE id = ?',
    [String(req.body.suivi || '').trim().slice(0, 64) || null, cmd.id]);
  res.redirect(`/admin/commandes/${cmd.reference}?m=` + encodeURIComponent('Numero de suivi enregistre.'));
});

router.post('/commandes/:ref/note', form, async (req, res) => {
  const cmd = await charge(req, res);
  if (!cmd) return;
  await db.run('UPDATE commandes SET note_interne = ? WHERE id = ?',
    [String(req.body.note || '').slice(0, 4000) || null, cmd.id]);
  res.redirect(`/admin/commandes/${cmd.reference}?m=` + encodeURIComponent('Note enregistree.'));
});

router.post('/commandes/:ref/remboursement', form, async (req, res) => {
  const cmd = await charge(req, res);
  if (!cmd) return;
  if (!cmd.paye_le) {
    return res.redirect(`/admin/commandes/${cmd.reference}?m=` + encodeURIComponent("Cette commande n'a jamais ete payee."));
  }
  let r;
  try {
    r = await paiement.rembourse(cmd.paiement_ref, cmd.total);
  } catch (e) {
    return res.redirect(`/admin/commandes/${cmd.reference}?m=` + encodeURIComponent('Remboursement refuse : ' + e.message));
  }
  if (!r.ok) {
    return res.redirect(`/admin/commandes/${cmd.reference}?m=` + encodeURIComponent('Remboursement refuse : ' + (r.erreur || '')));
  }
  await db.run('UPDATE commandes SET remboursement_ref = ? WHERE id = ?', [r.ref || null, cmd.id]);
  await commandes.passerStatut(cmd, 'rembourse', { auteur: 'admin' });
  res.redirect(`/admin/commandes/${cmd.reference}?m=` + encodeURIComponent('Remboursement effectue.'));
});

/* --- Pieces jointes ---------------------------------------------------- */

/* Le nom de fichier n'est jamais construit a partir de l'URL : on relit la
   valeur enregistree en base. Sinon « ../../ » dans la reference laisserait
   telecharger n'importe quel fichier du serveur. */
router.get('/photo/:ref', async (req, res) => {
  const cmd = await commandes.parReference(req.params.ref);
  if (!cmd || !cmd.photo) return res.status(404).end();
  const f = path.join(DOSSIER_PHOTOS, path.basename(cmd.photo));
  if (!fs.existsSync(f)) return res.status(404).end();
  res.sendFile(f);
});

router.get('/attestation/:ref', async (req, res) => {
  const cmd = await commandes.parReference(req.params.ref);
  if (!cmd) return res.status(404).end();
  const att = await db.one('SELECT * FROM attestations WHERE commande_id = ?', [cmd.id]);
  if (!att) return res.status(404).end();

  const f = path.join(DOSSIER_PDF, path.basename(att.pdf || cmd.reference + '.pdf'));
  if (fs.existsSync(f)) {
    res.type('application/pdf');
    return res.sendFile(f);
  }
  /* Le PDF a pu echouer a la creation. Le texte, lui, est en base : on le
     regenere a partir de CE texte, pas d'un recalcul. */
  const attestation = require('./attestation');
  await attestation.pdf(f, { texte: att.texte, societe: config.societe, reference: cmd.reference });
  await db.run('UPDATE attestations SET pdf = ? WHERE id = ?', [cmd.reference + '.pdf', att.id]);
  res.type('application/pdf');
  res.sendFile(f);
});

/* --- Reglages ---------------------------------------------------------- */

/* « 12,50 » et « 12.50 » saisis par le gerant doivent donner 1250 centimes.
   parseFloat('12,50') vaut 12 : la virgule doit etre remplacee AVANT. */
function centimes(v) {
  const n = Math.round(parseFloat(String(v == null ? '' : v).replace(',', '.').replace(/[^0-9.\-]/g, '')) * 100);
  return Number.isFinite(n) ? Math.max(0, n) : 0;
}

router.get('/reglages', async (req, res) => {
  res.send(A.reglages({ reglages: await db.reglages(), message: req.query.m }));
});

router.post('/reglages', form, async (req, res) => {
  const mins = [].concat(req.body.palier_min || []);
  const prix = [].concat(req.body.palier_prix || []);
  const paliers = [];
  for (let i = 0; i < mins.length; i++) {
    const min = parseInt(mins[i], 10);
    if (!Number.isFinite(min) || min < 1) continue;      /* ligne laissee vide : palier supprime */
    if (String(prix[i] || '').trim() === '') continue;
    paliers.push({ min, prix: centimes(prix[i]) });
  }
  await db.setReglage('paliers', JSON.stringify(tarifs.normalisePaliers(paliers)));
  await db.setReglage('frais_port', String(centimes(req.body.frais_port)));
  await db.setReglage('garantie', String(req.body.garantie || '').slice(0, 60));
  await db.setReglage('delai_jours', String(req.body.delai_jours || '').slice(0, 190));
  await db.setReglage('adresse_retour', String(req.body.adresse_retour || '').slice(0, 500));
  res.redirect('/admin/reglages?m=' + encodeURIComponent('Reglages enregistres.'));
});

/* --- E-mails ------------------------------------------------------------ */

router.get('/mails', async (req, res) => {
  const list = await db.all(`SELECT * FROM mails ORDER BY id DESC LIMIT ${db.lim(100)}`);
  res.send(A.mails({ list, message: req.query.m }));
});

module.exports = router;
