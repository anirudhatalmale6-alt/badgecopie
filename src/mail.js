/* ------------------------------------------------------------------ *
 * E-mails de suivi                                                     *
 * ------------------------------------------------------------------ *
 * Tout message est D'ABORD enregistre en base, puis envoye. L'enregistrement
 * porte l'etat reel : « ecrit », « envoye » ou « echec » avec le motif.
 *
 * Un envoi qui « reussit » ne prouve rien : le serveur SMTP peut accepter le
 * message et le rejeter ensuite. Tant que le domaine d'envoi n'est pas
 * configure (SPF, DKIM), le transport reste sur « fichier » et les messages
 * sont ecrits dans data/mails/, ou ils sont lisibles tels qu'ils partiront.
 */
'use strict';
const fs = require('fs');
const path = require('path');
const config = require('./config');
const db = require('./db');
const tarifs = require('./tarifs');

const DOSSIER = path.join(__dirname, '..', 'data', 'mails');

let transporteur = null;
function getTransporteur() {
  if (config.mail.transport !== 'smtp') return null;
  if (!transporteur) {
    const nodemailer = require('nodemailer');
    transporteur = nodemailer.createTransport({
      host: config.mail.host,
      port: config.mail.port,
      secure: config.mail.port === 465,
      auth: config.mail.user ? { user: config.mail.user, pass: config.mail.password } : undefined,
    });
  }
  return transporteur;
}

async function envoie({ commandeId = null, destinataire, sujet, corps }) {
  const r = await db.run(
    'INSERT INTO mails (commande_id, destinataire, sujet, corps, etat) VALUES (?, ?, ?, ?, ?)',
    [commandeId, destinataire, sujet, corps, 'ecrit']
  );
  const id = r.insertId;

  const t = getTransporteur();
  if (!t) {
    fs.mkdirSync(DOSSIER, { recursive: true });
    const nom = String(id).padStart(6, '0') + '-' + destinataire.replace(/[^a-z0-9._-]/gi, '_') + '.txt';
    fs.writeFileSync(
      path.join(DOSSIER, nom),
      `De: ${config.mail.from}\nA: ${destinataire}\nSujet: ${sujet}\n\n${corps}\n`,
      'utf8'
    );
    await db.run('UPDATE mails SET etat = ? WHERE id = ?', ['fichier', id]);
    return { id, etat: 'fichier' };
  }

  try {
    const info = await t.sendMail({ from: config.mail.from, to: destinataire, subject: sujet, text: corps });
    /* On journalise l'identifiant rendu par le relais : c'est la seule chose
       qui permette de retrouver le message plus tard chez l'hebergeur. */
    await db.run('UPDATE mails SET etat = ?, erreur = ? WHERE id = ?',
      ['envoye', String(info.messageId || '').slice(0, 255), id]);
    return { id, etat: 'envoye', messageId: info.messageId };
  } catch (e) {
    await db.run('UPDATE mails SET etat = ?, erreur = ? WHERE id = ?',
      ['echec', String(e.message || e).slice(0, 255), id]);
    return { id, etat: 'echec', erreur: String(e.message || e) };
  }
}

/* --- Modeles ------------------------------------------------------- */

function lienSuivi(cmd) {
  return `${config.siteUrl}/suivi/${cmd.reference}?j=${cmd.jeton}`;
}

function confirmation(cmd, reglages) {
  const corps = [
    `Bonjour ${cmd.nom},`,
    '',
    `Nous avons bien enregistre votre commande ${cmd.reference}.`,
    `${cmd.quantite} badge(s) — ${tarifs.euros(cmd.total)}`,
    '',
    cmd.methode === 'poste'
      ? [
          "Prochaine etape : envoyez-nous votre badge d'origine.",
          '',
          "Glissez-le dans une enveloppe matelassee avec un papier portant votre numero de commande, et postez-le a :",
          reglages.adresse_retour || '(adresse a completer)',
          '',
          "Nous vous renverrons l'original avec la ou les copies.",
        ].join('\n')
      : "Nous n'avons pas besoin de votre badge : le code que vous avez saisi nous suffit.",
    '',
    `Vous pouvez suivre votre commande a tout moment ici :`,
    lienSuivi(cmd),
    '',
    "Si nous ne parvenons pas a copier votre badge, vous etes rembourse en entier.",
    '',
    config.siteNom,
  ].join('\n');
  return { sujet: `Commande ${cmd.reference} enregistree`, corps };
}

function changementStatut(cmd, statut, commentaire, reglages) {
  const s = db.STATUT[statut] || { nom: statut, client: '' };
  const lignes = [
    `Bonjour ${cmd.nom},`,
    '',
    `Votre commande ${cmd.reference} : ${s.nom.toLowerCase()}.`,
    s.client,
  ];
  if (commentaire) lignes.push('', commentaire);
  if (statut === 'expedie' && cmd.suivi) lignes.push('', `Numero de suivi : ${cmd.suivi}`);
  if (statut === 'attente_badge') {
    lignes.push('', 'Adresse d\'envoi :', reglages.adresse_retour || '(adresse a completer)');
  }
  lignes.push('', 'Suivi de la commande :', lienSuivi(cmd), '', config.siteNom);
  return { sujet: `Commande ${cmd.reference} — ${s.nom}`, corps: lignes.join('\n') };
}

module.exports = { envoie, confirmation, changementStatut, lienSuivi, DOSSIER };
