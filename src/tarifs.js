/* ------------------------------------------------------------------ *
 * Tarifs degressifs                                                    *
 * ------------------------------------------------------------------ *
 * Tous les montants sont en CENTIMES, partout, jusqu'a l'affichage. Un
 * prix stocke en euros flottants finit par produire des totaux a un centime
 * pres du compte, et Stripe refuse alors le rapprochement comptable.
 */
'use strict';

const DEFAUT = [
  { min: 1, prix: 1400 },
  { min: 2, prix: 1200 },
  { min: 4, prix: 1100 },
  { min: 10, prix: 1000 },
];

/* Les paliers viennent du back-office : ils peuvent arriver dans le desordre,
   incomplets, ou avec des valeurs non numeriques. On les nettoie ici une fois
   pour toutes plutot que de s'en remettre a la saisie. */
function normalisePaliers(brut) {
  let list = brut;
  if (typeof list === 'string') {
    try { list = JSON.parse(list); } catch (e) { list = null; }
  }
  if (!Array.isArray(list)) list = DEFAUT;
  list = list
    .map((p) => ({ min: parseInt(p && p.min, 10), prix: parseInt(p && p.prix, 10) }))
    .filter((p) => Number.isFinite(p.min) && Number.isFinite(p.prix) && p.min >= 1 && p.prix >= 0)
    .sort((a, b) => a.min - b.min);
  if (!list.length) list = DEFAUT.slice();
  /* Il faut toujours un palier qui parte de 1, sinon une commande d'un seul
     badge n'a aucun prix et le total tombe a zero sans rien signaler. */
  if (list[0].min > 1) list.unshift({ min: 1, prix: list[0].prix });
  return list;
}

/* Le palier retenu est celui dont le seuil est le PLUS ELEVE parmi ceux
   atteints — pas le premier trouve. Avec [1, 2, 4, 10] et 7 badges, la
   reponse est le palier 4, pas le palier 1. */
function palierPour(quantite, paliers) {
  const list = normalisePaliers(paliers);
  const q = Math.max(1, parseInt(quantite, 10) || 1);
  let choisi = list[0];
  for (const p of list) if (q >= p.min) choisi = p;
  return choisi;
}

function calcule(quantite, paliers, fraisPort = 0) {
  const q = Math.max(1, Math.min(50, parseInt(quantite, 10) || 1));
  const p = palierPour(q, paliers);
  const port = Math.max(0, parseInt(fraisPort, 10) || 0);
  const sousTotal = p.prix * q;
  return {
    quantite: q,
    prixUnitaire: p.prix,
    sousTotal,
    fraisPort: port,
    total: sousTotal + port,
    palier: p.min,
    /* Economie affichee au client par rapport au prix a l'unite : c'est
       l'argument qui fait passer une commande de 1 a 2 badges. */
    economie: (normalisePaliers(paliers)[0].prix - p.prix) * q,
  };
}

/* 1400 -> « 14,00 € ». L'espace avant l'euro est insecable, comme le veut
   la typographie francaise. */
function euros(centimes) {
  const n = Math.round(Number(centimes) || 0);
  const signe = n < 0 ? '-' : '';
  const a = Math.abs(n);
  /* Espace insecable avant le symbole, ecrit \u00a0 : tape tel quel, il est
     indistinguable d'une espace ordinaire dans l'editeur, et une comparaison
     de chaine echoue alors sans que rien ne l'explique a l'oeil. */
  return signe + Math.floor(a / 100) + ',' + String(a % 100).padStart(2, '0') + '\u00a0€';
}

/* Grille affichee sur la page d'accueil : un palier par ligne, avec sa borne
   haute deduite du palier suivant. */
function grille(paliers) {
  const list = normalisePaliers(paliers);
  return list.map((p, i) => {
    const suivant = list[i + 1];
    const max = suivant ? suivant.min - 1 : null;
    let libelle;
    if (!suivant) libelle = p.min === 1 ? '1 badge et plus' : p.min + ' badges et plus';
    else if (max === p.min) libelle = p.min === 1 ? '1 badge' : p.min + ' badges';
    else libelle = 'de ' + p.min + ' a ' + max + ' badges';
    return { ...p, libelle, prixTexte: euros(p.prix) };
  });
}

module.exports = { DEFAUT, normalisePaliers, palierPour, calcule, euros, grille };
