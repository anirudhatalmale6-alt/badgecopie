'use strict';
const mysql = require('mysql2/promise');
const config = require('./config');

let pool = null;

function getPool() {
  if (!pool) {
    pool = mysql.createPool({
      ...config.db,
      waitForConnections: true,
      connectionLimit: 10,
      charset: 'utf8mb4_unicode_ci',
      /* Les dates sont renvoyees telles quelles : sans cette option mysql2
         construit des objets Date en heure locale du serveur, et une commande
         passee a 23 h 30 changeait de jour dans l'affichage. */
      dateStrings: true,
    });
  }
  return pool;
}

async function run(sql, params = []) {
  const [r] = await getPool().query(sql, params);
  return r;
}
async function all(sql, params = []) {
  const [rows] = await getPool().execute(sql, params);
  return rows;
}
async function one(sql, params = []) {
  const rows = await all(sql, params);
  return rows[0] || null;
}

/* `LIMIT ?` est refuse par mysql2 en mode execute() (requete preparee) :
   la valeur doit etre entiere et inseree dans le texte de la requete. */
const lim = (n, max = 500) => Math.max(1, Math.min(max, parseInt(n, 10) || 1));
/* Meme contrainte pour OFFSET, mais zero est une valeur legitime : la borne
   basse de lim() est 1, elle ferait sauter la premiere ligne de la page 1. */
const off = (n, max = 100000) => Math.max(0, Math.min(max, parseInt(n, 10) || 0));

/* --- Migrations ---------------------------------------------------- *
 * `CREATE TABLE IF NOT EXISTS` ne rattrape jamais une colonne ajoutee plus
 * tard sur une table deja existante. Chaque ajout passe donc par
 * information_schema, ce qui rend la migration rejouable sans erreur.
 */
async function colonneExiste(table, colonne) {
  const r = await one(
    `SELECT 1 AS ok FROM information_schema.COLUMNS
      WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ? AND COLUMN_NAME = ?`,
    [table, colonne]
  );
  return !!r;
}
async function ajouteColonne(table, colonne, definition) {
  if (await colonneExiste(table, colonne)) return false;
  await run(`ALTER TABLE \`${table}\` ADD COLUMN \`${colonne}\` ${definition}`);
  return true;
}

const STATUTS = [
  { cle: 'attente_paiement', nom: "En attente de paiement", client: "Commande enregistree, paiement en attente." },
  { cle: 'paye', nom: 'Paye', client: "Paiement recu. Merci." },
  { cle: 'attente_badge', nom: "En attente du badge", client: "Nous attendons votre badge par courrier." },
  { cle: 'badge_recu', nom: 'Badge recu', client: "Nous avons bien recu votre badge." },
  { cle: 'analyse', nom: 'Analyse en cours', client: "Nous lisons votre badge pour identifier sa technologie." },
  { cle: 'copie_faite', nom: 'Copie realisee', client: "La copie est faite et testee." },
  { cle: 'expedie', nom: 'Expedie', client: "Votre colis est parti." },
  { cle: 'livre', nom: 'Livre', client: "Colis livre. Bonne journee." },
  { cle: 'non_copiable', nom: 'Non copiable', client: "Nous n'avons pas pu copier ce badge. Nous vous remboursons." },
  { cle: 'rembourse', nom: 'Rembourse', client: "Remboursement effectue." },
  { cle: 'annule', nom: 'Annule', client: "Commande annulee." },
];
const STATUT = Object.fromEntries(STATUTS.map((s) => [s.cle, s]));

/* Statuts apres lesquels plus rien ne bouge : l'interface n'en propose plus
   la suite, et le compteur « commandes en cours » les exclut. */
const STATUTS_FINAUX = ['livre', 'rembourse', 'annule'];

async function migrate() {
  await run(`CREATE TABLE IF NOT EXISTS commandes (
    id INT AUTO_INCREMENT PRIMARY KEY,
    reference VARCHAR(24) NOT NULL UNIQUE,
    jeton CHAR(32) NOT NULL,
    statut VARCHAR(24) NOT NULL DEFAULT 'attente_paiement',
    email VARCHAR(190) NOT NULL,
    nom VARCHAR(120) NOT NULL,
    telephone VARCHAR(32) NULL,
    adresse VARCHAR(190) NOT NULL,
    complement VARCHAR(190) NULL,
    cp VARCHAR(12) NOT NULL,
    ville VARCHAR(120) NOT NULL,
    pays CHAR(2) NOT NULL DEFAULT 'FR',
    quantite INT NOT NULL DEFAULT 1,
    marque VARCHAR(40) NULL,
    forme VARCHAR(40) NULL,
    techno VARCHAR(40) NULL,
    verdict VARCHAR(12) NOT NULL DEFAULT 'verifier',
    methode VARCHAR(16) NOT NULL DEFAULT 'poste',
    code_badge VARCHAR(32) NULL,
    photo VARCHAR(190) NULL,
    prix_unitaire INT NOT NULL,
    total INT NOT NULL,
    paiement_ref VARCHAR(190) NULL,
    paye_le DATETIME NULL,
    suivi VARCHAR(64) NULL,
    note_interne TEXT NULL,
    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    INDEX (statut), INDEX (email), INDEX (created_at)
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`);

  /* L'attestation est stockee dans sa propre table : c'est une piece
     juridique, elle ne doit pas etre modifiee quand la commande evolue.
     On y fige le texte exact signe, l'IP et l'horodatage. */
  await run(`CREATE TABLE IF NOT EXISTS attestations (
    id INT AUTO_INCREMENT PRIMARY KEY,
    commande_id INT NOT NULL,
    nom VARCHAR(120) NOT NULL,
    qualite VARCHAR(24) NOT NULL,
    adresse_immeuble VARCHAR(255) NOT NULL,
    texte MEDIUMTEXT NOT NULL,
    ip VARCHAR(64) NULL,
    agent VARCHAR(255) NULL,
    signe_le DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    pdf VARCHAR(190) NULL,
    UNIQUE KEY uniq_commande (commande_id),
    CONSTRAINT fk_att_cmd FOREIGN KEY (commande_id) REFERENCES commandes(id) ON DELETE CASCADE
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`);

  await run(`CREATE TABLE IF NOT EXISTS historique (
    id INT AUTO_INCREMENT PRIMARY KEY,
    commande_id INT NOT NULL,
    statut VARCHAR(24) NOT NULL,
    commentaire VARCHAR(255) NULL,
    auteur VARCHAR(40) NOT NULL DEFAULT 'systeme',
    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    INDEX (commande_id),
    CONSTRAINT fk_hist_cmd FOREIGN KEY (commande_id) REFERENCES commandes(id) ON DELETE CASCADE
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`);

  await run(`CREATE TABLE IF NOT EXISTS reglages (
    cle VARCHAR(60) PRIMARY KEY,
    valeur TEXT NULL,
    updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`);

  await run(`CREATE TABLE IF NOT EXISTS mails (
    id INT AUTO_INCREMENT PRIMARY KEY,
    commande_id INT NULL,
    destinataire VARCHAR(190) NOT NULL,
    sujet VARCHAR(190) NOT NULL,
    corps MEDIUMTEXT NOT NULL,
    etat VARCHAR(16) NOT NULL DEFAULT 'ecrit',
    erreur VARCHAR(255) NULL,
    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    INDEX (commande_id), INDEX (etat)
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`);

  /* Ajouts posterieurs a la premiere version : passer par ajouteColonne. */
  await ajouteColonne('commandes', 'remboursement_ref', 'VARCHAR(190) NULL AFTER suivi');
  await ajouteColonne('commandes', 'source', "VARCHAR(24) NOT NULL DEFAULT 'site' AFTER remboursement_ref");
}

/* --- Reglages ------------------------------------------------------ */

const DEFAUTS = {
  /* Prix en CENTIMES : jamais en euros flottants. 0,1 + 0,2 ne fait pas 0,3
     en virgule flottante, et une remise de 3 % sur un panier de 7 badges
     finissait a un centime pres du compte. */
  paliers: JSON.stringify([
    { min: 1, prix: 1400 },
    { min: 2, prix: 1200 },
    { min: 4, prix: 1100 },
    { min: 10, prix: 1000 },
  ]),
  frais_port: '0',
  delai_jours: '2 a 3 jours ouvres apres reception de votre badge',
  garantie: '2 ans',
  adresse_retour: '',
  message_accueil: '',
};

async function reglages() {
  const rows = await all('SELECT cle, valeur FROM reglages');
  const out = { ...DEFAUTS };
  for (const r of rows) out[r.cle] = r.valeur;
  return out;
}
async function setReglage(cle, valeur) {
  await run(
    'INSERT INTO reglages (cle, valeur) VALUES (?, ?) ON DUPLICATE KEY UPDATE valeur = VALUES(valeur)',
    [cle, valeur == null ? null : String(valeur)]
  );
}

/* --- Purge RGPD ---------------------------------------------------- */
async function purge() {
  const r = await run('DELETE FROM commandes WHERE created_at < (NOW() - INTERVAL ? DAY)', [
    config.retentionJours,
  ]);
  return r.affectedRows || 0;
}

module.exports = {
  getPool, run, all, one, lim, off, migrate, colonneExiste, ajouteColonne,
  reglages, setReglage, purge, STATUTS, STATUT, STATUTS_FINAUX,
};
