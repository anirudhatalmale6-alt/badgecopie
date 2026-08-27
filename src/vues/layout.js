/* ------------------------------------------------------------------ *
 * Gabarit HTML commun                                                  *
 * ------------------------------------------------------------------ *
 * Pas de moteur de template : des fonctions qui rendent des chaines. Une
 * dependance de moins a maintenir, et l'echappement reste explicite.
 */
'use strict';
const config = require('../config');

/* Tout ce qui vient d'un formulaire passe par ici. L'apostrophe et le guillemet
   sont echappes aussi : sans eux, une valeur placee dans un attribut permet
   d'en sortir et d'ajouter un gestionnaire d'evenement. */
function e(v) {
  return String(v == null ? '' : v)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

/* Version « texte long » : conserve les retours a la ligne saisis. */
function eMulti(v) {
  return e(v).replace(/\n/g, '<br>');
}

const NAV = [
  { href: '/', nom: 'Accueil' },
  { href: '/commander', nom: 'Commander' },
  { href: '/compatibilite', nom: 'Badges compatibles' },
  { href: '/suivi', nom: 'Suivre ma commande' },
  { href: '/aide', nom: 'Questions' },
];

function page({ titre, description, corps, actif, scripts = [], classe = '', large = false }) {
  return `<!doctype html>
<html lang="fr">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${e(titre)} — ${e(config.siteNom)}</title>
<meta name="description" content="${e(description || '')}">
<link rel="icon" href="/img/favicon.svg">
<link rel="stylesheet" href="/css/style.css?v=8">
<script src="/js/theme.js?v=8"></script>
</head>
<body class="${e(classe)}">
<a class="saut" href="#contenu">Aller au contenu</a>
<header class="entete">
  <div class="conteneur barre">
    <a class="logo" href="/"><span class="logo-marque"></span>${e(config.siteNom)}</a>
    <nav class="nav" id="nav">
      ${NAV.map((n) => `<a href="${n.href}"${actif === n.href ? ' class="on" aria-current="page"' : ''}>${e(n.nom)}</a>`).join('\n      ')}
    </nav>
    <div class="barre-actions">
      <button type="button" id="btheme" class="btheme" aria-label="Changer de theme"></button>
      <button type="button" id="bmenu" class="bmenu" aria-label="Menu" aria-expanded="false"><span></span><span></span><span></span></button>
    </div>
  </div>
</header>
<main id="contenu" class="${large ? '' : 'conteneur'}">
${corps}
</main>
<footer class="pied">
  <div class="conteneur pied-grille">
    <div>
      <strong>${e(config.siteNom)}</strong>
      <p class="mini">Reproduction de badges d'immeuble et de cles d'acces, pour les occupants legitimes.</p>
    </div>
    <div>
      <strong>Le service</strong>
      <a href="/commander">Commander une copie</a>
      <a href="/compatibilite">Badges compatibles</a>
      <a href="/suivi">Suivre ma commande</a>
      <a href="/aide">Questions frequentes</a>
    </div>
    <div>
      <strong>Informations</strong>
      <a href="/cgv">Conditions generales de vente</a>
      <a href="/mentions-legales">Mentions legales</a>
      <a href="/confidentialite">Donnees personnelles</a>
      <a href="/legalite">Est-ce legal ?</a>
    </div>
  </div>
  <div class="conteneur pied-bas mini">
    <span>© ${new Date().getFullYear()} ${e(config.societe.nom || config.siteNom)}</span>
    <span>Nous ne copions que sur attestation de l'occupant.</span>
  </div>
</footer>
<script src="/js/site.js?v=8"></script>
${scripts.map((s) => `<script src="${e(s)}"></script>`).join('\n')}
</body>
</html>`;
}

/* --- Petits composants --------------------------------------------- */

const VERDICT_CLASSE = { oui: 'ok', verifier: 'attente', non: 'ko' };
const VERDICT_NOM = { oui: 'Copiable', verifier: 'A verifier', non: 'Non copiable' };

function pastilleVerdict(v) {
  return `<span class="verdict ${VERDICT_CLASSE[v] || 'attente'}">${e(VERDICT_NOM[v] || v)}</span>`;
}

function alerte(type, contenu) {
  return `<div class="alerte ${e(type)}">${contenu}</div>`;
}

module.exports = { e, eMulti, page, pastilleVerdict, alerte, VERDICT_CLASSE, VERDICT_NOM, NAV };
