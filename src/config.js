'use strict';
require('dotenv').config();

const num = (v, def) => (v === undefined || v === '' || isNaN(Number(v)) ? def : Number(v));
const bool = (v, def) => (v === undefined || v === '' ? def : /^(1|true|oui|yes)$/i.test(String(v)));

const config = {
  port: num(process.env.PORT, 3012),
  siteUrl: process.env.SITE_URL || 'http://127.0.0.1:3012',
  siteNom: process.env.SITE_NOM || 'BadgeCopie',

  db: {
    host: process.env.DB_HOST || '127.0.0.1',
    port: num(process.env.DB_PORT, 3399),
    user: process.env.DB_USER || 'badge',
    password: process.env.DB_PASSWORD || 'badgedev',
    database: process.env.DB_NAME || 'badge',
  },

  /* Secret de signature des cookies de session et des jetons de suivi.
     Volontairement sans valeur par defaut en production : un secret devine
     laisserait fabriquer une session admin valide. */
  secret: process.env.APP_SECRET || 'dev0000dev1111dev2222dev3333dev4444dev5555',
  adminPassword: process.env.ADMIN_PASSWORD || 'demo-admin-2026',

  stripe: {
    secretKey: process.env.STRIPE_SECRET_KEY || '',
    publicKey: process.env.STRIPE_PUBLIC_KEY || '',
    webhookSecret: process.env.STRIPE_WEBHOOK_SECRET || '',
  },

  mail: {
    /* En developpement les e-mails ne partent pas : ils sont ecrits dans
       data/mails/. Un « envoi reussi » vers un serveur SMTP absent ne prouve
       rien, autant voir le message reellement produit. */
    transport: process.env.MAIL_TRANSPORT || 'fichier',
    host: process.env.MAIL_HOST || '',
    port: num(process.env.MAIL_PORT, 587),
    user: process.env.MAIL_USER || '',
    password: process.env.MAIL_PASSWORD || '',
    from: process.env.MAIL_FROM || 'BadgeCopie <contact@example.fr>',
  },

  /* Coordonnees affichees dans les CGV, les mentions legales et sur
     l'etiquette d'envoi. Vides tant que le client ne les a pas fournies :
     mieux vaut un trou visible qu'une adresse inventee. */
  societe: {
    nom: process.env.SOCIETE_NOM || '',
    forme: process.env.SOCIETE_FORME || '',
    siret: process.env.SOCIETE_SIRET || '',
    tva: process.env.SOCIETE_TVA || '',
    adresse: process.env.SOCIETE_ADRESSE || '',
    cp: process.env.SOCIETE_CP || '',
    ville: process.env.SOCIETE_VILLE || '',
    telephone: process.env.SOCIETE_TEL || '',
    email: process.env.SOCIETE_EMAIL || '',
    directeur: process.env.SOCIETE_DIRECTEUR || '',
    hebergeur: process.env.SOCIETE_HEBERGEUR || '',
  },

  /* Duree de conservation des attestations et des commandes. L'attestation
     est la piece qui protege le vendeur : elle doit survivre au delai de
     prescription, mais pas indefiniment (RGPD, minimisation). */
  retentionJours: num(process.env.RETENTION_JOURS, 1825),
  maxUploadMo: num(process.env.MAX_UPLOAD_MO, 6),
  paiementSimule: bool(process.env.PAIEMENT_SIMULE, true),
};

config.stripeActif = !!config.stripe.secretKey;
if (config.stripeActif) config.paiementSimule = false;

module.exports = config;
