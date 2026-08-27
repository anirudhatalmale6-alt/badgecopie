'use strict';
const { e, page } = require('./layout');
const badges = require('../badges');
const tarifs = require('../tarifs');
const config = require('../config');

module.exports = function accueil({ reglages }) {
  const grille = tarifs.grille(reglages.paliers);
  const depart = grille[0];

  const marques = badges.MARQUES.filter((m) => m.cle !== 'inconnue' && m.verdict === 'oui');

  const corps = `
<section class="hero">
  <div class="hero-texte">
    <p class="sur-titre">Badges d'immeuble, cles d'acces, telecommandes</p>
    <h1>Un double de votre badge,<br>sans passer par le syndic.</h1>
    <p class="chapo">Vous etes occupant ou proprietaire du logement, vous avez le droit d'avoir un double.
      Nous le fabriquons a partir de ${e(depart.prixTexte)}, port compris, et nous vous renvoyons l'original avec la copie.</p>
    <p class="actions">
      <a class="bouton primaire grand" href="/commander">Identifier mon badge</a>
      <a class="bouton fantome grand" href="/compatibilite">Voir les badges compatibles</a>
    </p>
    <p class="mini rassurance">Si nous ne savons pas copier votre badge, vous etes rembourse en entier. Nous vous le disons avant meme de vous faire payer quand c'est possible.</p>
  </div>
  <div class="hero-visuel" aria-hidden="true">
    <div class="carte-badge c1"><span class="puce"></span><b>Badge d'immeuble</b><i>13,56 MHz</i></div>
    <div class="carte-badge c2"><span class="puce"></span><b>Porte-cles</b><i>125 kHz</i></div>
    <div class="carte-badge c3"><span class="puce"></span><b>Cle contact</b><i>iButton</i></div>
  </div>
</section>

<section class="bande">
  <div class="etapes">
    <article><span class="num">1</span>
      <h3>Vous identifiez votre badge</h3>
      <p>Trois questions : la marque de l'interphone, la forme du badge, la quantite. Nous vous repondons tout de suite : oui, non, ou a verifier.</p></article>
    <article><span class="num">2</span>
      <h3>Vous nous l'envoyez</h3>
      <p>Une enveloppe, votre badge, votre numero de commande. Sauf pour les cles a numero grave, ou le code suffit.</p></article>
    <article><span class="num">3</span>
      <h3>Vous recevez les deux</h3>
      <p>L'original et la ou les copies, testees avant expedition. ${e(reglages.delai_jours)}.</p></article>
  </div>
</section>

<section class="section">
  <h2>Nos tarifs</h2>
  <p class="sous">Le prix baisse des le deuxieme badge. Livraison ${Number(reglages.frais_port) > 0 ? e(tarifs.euros(reglages.frais_port)) : 'comprise'}.</p>
  <div class="tarifs">
    ${grille.map((g, i) => `<div class="tarif${i === 0 ? ' mis' : ''}">
      <span class="qte">${e(g.libelle)}</span>
      <span class="prix">${e(g.prixTexte)}</span>
      <span class="mini">par badge</span>
    </div>`).join('\n    ')}
  </div>
  <p class="mini centre">Garantie ${e(reglages.garantie)} : un badge qui n'ouvre pas est refait ou rembourse.</p>
</section>

<section class="section deux-colonnes">
  <div>
    <h2>Ce que nous savons faire</h2>
    <p>Nous copions les technologies suivantes :</p>
    <ul class="liste-check">
      ${badges.TECHNOS.filter((t) => t.verdict === 'oui').map((t) => `<li><b>${e(t.court)}</b> — ${e(t.explication)}</li>`).join('\n      ')}
    </ul>
    <p class="mini">Interphones connus : ${marques.map((m) => e(m.nom)).join(', ')}.</p>
  </div>
  <div>
    <h2>Ce que personne ne sait faire</h2>
    <p>Nous preferons le dire franchement plutot que de vous faire payer pour rien :</p>
    <ul class="liste-croix">
      ${badges.TECHNOS.filter((t) => t.verdict === 'non').map((t) => `<li><b>${e(t.court)}</b> — ${e(t.explication)}</li>`).join('\n      ')}
    </ul>
    <p class="mini">Ces badges utilisent un chiffrement moderne. Aucun prestataire serieux ne les reproduit.</p>
  </div>
</section>

<section class="section encart-legal">
  <h2>Est-ce legal ?</h2>
  <p>Oui, lorsque la copie est demandee par l'occupant legitime du logement pour son propre usage.
     C'est pourquoi nous demandons une attestation sur l'honneur nominative a chaque commande, que nous conservons.
     Sans cette attestation, nous ne fabriquons rien.</p>
  <p><a class="bouton fantome" href="/legalite">Le detail, en clair</a></p>
</section>

<section class="section cta-final">
  <h2>Commencez par identifier votre badge</h2>
  <p class="sous">Trente secondes, sans creer de compte, sans engagement.</p>
  <p><a class="bouton primaire grand" href="/commander">C'est parti</a></p>
</section>
`;

  return page({
    titre: 'Copie de badge d\'immeuble et de cle d\'acces',
    description: `Reproduction de badges d'immeuble, cles d'acces et telecommandes a partir de ${depart.prixTexte}. Rembourse si le badge n'est pas copiable.`,
    corps,
    actif: '/',
  });
};
