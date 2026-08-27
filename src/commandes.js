/* ------------------------------------------------------------------ *
 * Cycle de vie d'une commande                                          *
 * ------------------------------------------------------------------ *
 * Un seul endroit change le statut d'une commande. Sans cela, l'historique
 * se remplit depuis certains chemins et pas depuis d'autres, et le client
 * recoit un e-mail deux fois pour la meme etape — ou aucun.
 */
'use strict';
const db = require('./db');
const mail = require('./mail');

async function parReference(reference) {
  return db.one('SELECT * FROM commandes WHERE reference = ?', [String(reference || '').toUpperCase()]);
}

async function historique(commandeId) {
  return db.all('SELECT * FROM historique WHERE commande_id = ? ORDER BY id ASC', [commandeId]);
}

/* Transitions autorisees. Une transition non prevue n'est pas refusee — le
   gerant doit pouvoir rattraper une erreur de manipulation — mais elle est
   marquee dans l'historique, pour qu'on sache que le chemin normal a ete
   court-circuite. */
const SUITE = {
  attente_paiement: ['paye', 'annule'],
  /* « paye -> analyse » n'est pas une anomalie : c'est le chemin des cles a
     numero grave, ou rien n'arrive par la poste et la fabrication commence
     tout de suite. Sans cette entree, chaque commande de ce type etait
     estampillee « hors du parcours habituel » dans son propre historique. */
  paye: ['attente_badge', 'badge_recu', 'analyse', 'annule', 'rembourse'],
  attente_badge: ['badge_recu', 'annule', 'rembourse'],
  badge_recu: ['analyse', 'non_copiable', 'rembourse'],
  analyse: ['copie_faite', 'non_copiable'],
  copie_faite: ['expedie'],
  expedie: ['livre'],
  livre: [],
  non_copiable: ['rembourse', 'expedie'],
  rembourse: [],
  annule: [],
};

function suiteDe(statut) {
  return SUITE[statut] || [];
}

/* Statuts pour lesquels le client recoit un message. Les etapes internes
   (« analyse ») ne declenchent rien : elles n'apprennent rien au client et
   multiplier les e-mails fait desabonner ou classer en indesirable. */
const NOTIFIE = ['paye', 'attente_badge', 'badge_recu', 'copie_faite', 'expedie', 'livre', 'non_copiable', 'rembourse', 'annule'];

async function passerStatut(cmd, statut, { commentaire = null, auteur = 'systeme', notifier = true } = {}) {
  if (!db.STATUT[statut]) throw new Error('statut inconnu : ' + statut);
  const inattendu = cmd.statut !== statut && !suiteDe(cmd.statut).includes(statut);

  await db.run('UPDATE commandes SET statut = ? WHERE id = ?', [statut, cmd.id]);
  await db.run(
    'INSERT INTO historique (commande_id, statut, commentaire, auteur) VALUES (?, ?, ?, ?)',
    [cmd.id, statut, inattendu ? (commentaire ? commentaire + ' ' : '') + '(hors du parcours habituel)' : commentaire, auteur]
  );

  const frais = { ...cmd, statut };
  if (notifier && NOTIFIE.includes(statut)) {
    const reglages = await db.reglages();
    const m = mail.changementStatut(frais, statut, commentaire, reglages);
    await mail.envoie({ commandeId: cmd.id, destinataire: cmd.email, sujet: m.sujet, corps: m.corps });
  }
  return frais;
}

/* Marque la commande payee, puis l'enchaine immediatement sur l'etape utile
   au client : attendre son badge, ou passer directement en fabrication quand
   il a fourni un numero grave. */
async function marquePayee(cmd, { paiementRef, auteur = 'paiement' }) {
  if (cmd.statut !== 'attente_paiement') return cmd; /* deja traite : le webhook et le retour navigateur arrivent tous les deux */
  await db.run('UPDATE commandes SET paiement_ref = ?, paye_le = NOW() WHERE id = ?', [paiementRef || null, cmd.id]);
  let frais = await passerStatut({ ...cmd, paiement_ref: paiementRef }, 'paye', { auteur, notifier: false });
  const suivant = cmd.methode === 'poste' ? 'attente_badge' : 'analyse';
  frais = await passerStatut(frais, suivant, { auteur });
  return frais;
}

module.exports = { parReference, historique, passerStatut, marquePayee, suiteDe, SUITE, NOTIFIE };
