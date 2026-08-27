/* ------------------------------------------------------------------ *
 * Paiement                                                             *
 * ------------------------------------------------------------------ *
 * Deux modes, choisis automatiquement :
 *
 *  - Stripe, des qu'une cle secrete est presente dans .env ;
 *  - simulation, sinon.
 *
 * La simulation n'est pas un bouchon paresseux : le prototype doit pouvoir
 * etre parcouru de bout en bout AVANT que le client ait ouvert son compte
 * Stripe, sinon la moitie du site reste invisible et non testable. Elle
 * traverse exactement les memes etapes (redirection, retour, confirmation
 * cote serveur), de sorte que basculer sur Stripe ne change rien au reste.
 */
'use strict';
const config = require('./config');

let stripe = null;
function client() {
  if (!config.stripeActif) return null;
  if (!stripe) stripe = require('stripe')(config.stripe.secretKey);
  return stripe;
}

function actif() {
  return !!config.stripeActif;
}

/* Cree la session de paiement et renvoie l'URL vers laquelle rediriger.
 *
 * Le montant vient de la COMMANDE ENREGISTREE, pas d'un recalcul et surtout
 * pas de la requete. Deux raisons :
 *  - un total envoye par le navigateur se modifie dans la console ;
 *  - le prix affiche au client au moment de la commande est celui qu'il doit.
 *    Recalculer d'apres le tarif du jour re-facturerait une commande laissee
 *    en attente au nouveau prix, sans que personne ne l'ait annonce.
 */
async function session(cmd, { siteUrl }) {
  const quantite = Math.max(1, parseInt(cmd.quantite, 10) || 1);
  const prixUnitaire = Math.max(0, parseInt(cmd.prix_unitaire, 10) || 0);
  const total = Math.max(0, parseInt(cmd.total, 10) || 0);
  const calcul = {
    quantite,
    prixUnitaire,
    total,
    /* Le port est ce qui reste une fois les badges deduits : il n'est pas
       stocke a part, et le recalculer d'apres les reglages actuels ferait
       diverger la somme des lignes du total reellement du. */
    fraisPort: Math.max(0, total - prixUnitaire * quantite),
  };
  const s = client();

  if (!s) {
    return {
      mode: 'simule',
      montant: calcul.total,
      url: `${siteUrl}/paiement/simule/${cmd.reference}?j=${cmd.jeton}`,
      ref: 'SIMULE-' + cmd.reference,
    };
  }

  const items = [
    {
      quantity: calcul.quantite,
      price_data: {
        currency: 'eur',
        unit_amount: calcul.prixUnitaire,
        product_data: { name: `Copie de badge — commande ${cmd.reference}` },
      },
    },
  ];
  if (calcul.fraisPort > 0) {
    items.push({
      quantity: 1,
      price_data: {
        currency: 'eur',
        unit_amount: calcul.fraisPort,
        product_data: { name: 'Frais de port' },
      },
    });
  }

  const sess = await s.checkout.sessions.create({
    mode: 'payment',
    line_items: items,
    customer_email: cmd.email,
    /* La reference de commande voyage dans les metadonnees ET dans
       client_reference_id : le webhook lit l'une, le retour navigateur
       l'autre, et les deux doivent retrouver la meme commande. */
    client_reference_id: cmd.reference,
    metadata: { reference: cmd.reference },
    success_url: `${siteUrl}/paiement/retour/${cmd.reference}?j=${cmd.jeton}&sid={CHECKOUT_SESSION_ID}`,
    cancel_url: `${siteUrl}/paiement/annule/${cmd.reference}?j=${cmd.jeton}`,
  });

  return { mode: 'stripe', montant: calcul.total, url: sess.url, ref: sess.id };
}

/* Verification cote serveur qu'une session a bien ete payee. Le retour du
   navigateur sur success_url ne prouve RIEN : l'URL est devinable et se
   visite a la main. Seule cette lecture chez Stripe fait foi. */
async function verifie(sessionId) {
  const s = client();
  if (!s) return { paye: false, motif: 'stripe inactif' };
  const sess = await s.checkout.sessions.retrieve(sessionId);
  return {
    paye: sess.payment_status === 'paid',
    montant: sess.amount_total,
    reference: (sess.metadata && sess.metadata.reference) || sess.client_reference_id || null,
    intent: sess.payment_intent || null,
    motif: sess.payment_status,
  };
}

async function rembourse(paiementRef, montant) {
  const s = client();
  if (!s) return { ok: true, mode: 'simule', ref: 'REMB-SIMULE' };
  const sess = await s.checkout.sessions.retrieve(paiementRef);
  if (!sess.payment_intent) return { ok: false, erreur: 'aucun paiement rattache' };
  const r = await s.refunds.create({
    payment_intent: typeof sess.payment_intent === 'string' ? sess.payment_intent : sess.payment_intent.id,
    ...(montant ? { amount: montant } : {}),
  });
  return { ok: r.status === 'succeeded' || r.status === 'pending', mode: 'stripe', ref: r.id, statut: r.status };
}

module.exports = { actif, session, verifie, rembourse };
