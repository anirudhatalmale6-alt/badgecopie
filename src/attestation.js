/* ------------------------------------------------------------------ *
 * Attestation sur l'honneur                                            *
 * ------------------------------------------------------------------ *
 * C'est la piece qui protege le vendeur. Une simple case a cocher ne vaut
 * pas grand-chose : ce qui compte, c'est un texte nominatif, date, rattache
 * a une adresse d'immeuble et a une commande, conserve tel quel.
 *
 * Le texte est genere par une fonction pure, separee du PDF : il est ainsi
 * verifiable par un test, et surtout il est FIGE en base au moment de la
 * signature. Si les conditions changent l'an prochain, les attestations deja
 * signees continuent de dire ce que le client a reellement lu et accepte.
 */
'use strict';
const fs = require('fs');
const path = require('path');
const PDFDocument = require('pdfkit');

const QUALITES = [
  { cle: 'proprietaire', nom: 'proprietaire du logement' },
  { cle: 'locataire', nom: 'locataire du logement' },
  { cle: 'occupant', nom: 'occupant du logement' },
  { cle: 'gestionnaire', nom: 'gestionnaire mandate par le proprietaire' },
];
const QUALITE = Object.fromEntries(QUALITES.map((q) => [q.cle, q]));

function dateFr(d) {
  const x = d instanceof Date ? d : new Date(d || Date.now());
  const p = (n) => String(n).padStart(2, '0');
  return `${p(x.getDate())}/${p(x.getMonth() + 1)}/${x.getFullYear()} a ${p(x.getHours())}h${p(x.getMinutes())}`;
}

function texte({ nom, qualite, adresseImmeuble, reference, quantite, ip, date }) {
  const q = QUALITE[qualite] || QUALITE.occupant;
  const n = Math.max(1, parseInt(quantite, 10) || 1);
  const badges = n > 1 ? `des ${n} copies` : 'de la copie';
  return [
    "ATTESTATION SUR L'HONNEUR",
    "Reproduction d'un badge ou d'une cle d'acces",
    '',
    `Je soussigne(e) ${nom}, ${q.nom} situe :`,
    adresseImmeuble,
    '',
    "atteste sur l'honneur :",
    `- occuper ce logement a la date de la presente attestation, en qualite de ${q.nom} ;`,
    "- detenir legitimement le badge ou la cle dont je demande la reproduction, et etre autorise(e) a en posseder une copie ;",
    `- destiner ${badges} commandee(s) a mon usage personnel ou a celui des membres de mon foyer ;`,
    "- ne remettre aucune copie a un tiers non autorise, et n'en faire aucun usage frauduleux.",
    '',
    "Je reconnais avoir ete informe(e) que l'utilisation frauduleuse d'un badge d'acces est susceptible de constituer une infraction penale, et que la responsabilite d'un tel usage incomberait a son seul auteur.",
    '',
    "Je reconnais egalement que le prestataire se reserve le droit de refuser toute commande dont la legitimite lui parait douteuse, et de me rembourser integralement dans ce cas.",
    '',
    `Commande n° ${reference}`,
    `Attestation etablie par voie electronique le ${dateFr(date)}${ip ? `, depuis l'adresse IP ${ip}` : ''}.`,
    "La validation du formulaire de commande vaut signature de la presente attestation.",
  ].join('\n');
}

/* --- PDF ----------------------------------------------------------- */

/* Le PDF est produit a partir du texte DEJA enregistre en base, jamais
   recalcule : regenerer le texte a l'impression ferait dire a un vieux
   document les conditions d'aujourd'hui. */
function pdf(destination, { texte: corps, societe, reference }) {
  return new Promise((resolve, reject) => {
    fs.mkdirSync(path.dirname(destination), { recursive: true });
    const doc = new PDFDocument({ size: 'A4', margin: 56 });
    const flux = fs.createWriteStream(destination);
    flux.on('finish', () => resolve(destination));
    flux.on('error', reject);
    doc.on('error', reject);
    doc.pipe(flux);

    const lignes = String(corps).split('\n');
    /* Les deux premieres lignes sont le titre et le sous-titre. */
    doc.font('Helvetica-Bold').fontSize(15).text(lignes[0], { align: 'center' });
    doc.moveDown(0.2);
    doc.font('Helvetica').fontSize(10.5).fillColor('#555').text(lignes[1], { align: 'center' });
    doc.moveDown(1.4);
    doc.fillColor('#000').fontSize(11);

    for (const l of lignes.slice(2)) {
      if (!l.trim()) { doc.moveDown(0.6); continue; }
      doc.text(l, { align: 'left', lineGap: 2 });
    }

    if (societe && societe.nom) {
      doc.moveDown(2);
      doc.fontSize(8.5).fillColor('#666');
      const pied = [societe.nom, societe.siret ? 'SIRET ' + societe.siret : '',
        [societe.adresse, societe.cp, societe.ville].filter(Boolean).join(' ')]
        .filter(Boolean).join(' — ');
      doc.text(pied, { align: 'center' });
    }
    doc.fontSize(8).fillColor('#999').text('Document conserve avec la commande ' + reference,
      56, doc.page.height - 60, { align: 'center', width: doc.page.width - 112 });

    doc.end();
  });
}

module.exports = { QUALITES, QUALITE, texte, pdf, dateFr };
