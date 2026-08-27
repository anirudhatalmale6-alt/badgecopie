'use strict';
const { e, eMulti, pastilleVerdict, alerte } = require('./layout');
const config = require('../config');
const db = require('../db');
const tarifs = require('../tarifs');
const badges = require('../badges');

function coque({ titre, corps, actif, message }) {
  const nav = [
    ['/admin', 'Tableau de bord'],
    ['/admin/commandes', 'Commandes'],
    ['/admin/reglages', 'Reglages'],
    ['/admin/mails', 'E-mails'],
  ];
  return `<!doctype html>
<html lang="fr"><head>
<meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<title>${e(titre)} — administration</title>
<link rel="stylesheet" href="/css/style.css?v=8">
<link rel="stylesheet" href="/css/admin.css?v=8">
<script src="/js/theme.js?v=8"></script>
</head><body class="admin">
<header class="adm-entete">
  <div class="adm-barre">
    <a class="logo" href="/admin"><span class="logo-marque"></span>${e(config.siteNom)} <span class="etiq">admin</span></a>
    <nav>${nav.map(([h, n]) => `<a href="${h}"${actif === h ? ' class="on"' : ''}>${e(n)}</a>`).join('')}</nav>
    <div class="adm-actions">
      <a href="/" target="_blank" rel="noopener">Voir le site</a>
      <button type="button" id="btheme" class="btheme" aria-label="Changer de theme"></button>
      <a href="/admin/deconnexion" class="quitter">Quitter</a>
    </div>
  </div>
</header>
<main class="adm-main">
${message ? alerte('succes', e(message)) : ''}
${corps}
</main>
<script src="/js/site.js?v=8"></script>
</body></html>`;
}

function connexion({ erreur, suite }) {
  return `<!doctype html>
<html lang="fr"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<title>Administration</title><link rel="stylesheet" href="/css/style.css?v=8"><link rel="stylesheet" href="/css/admin.css?v=8">
<script src="/js/theme.js?v=8"></script></head>
<body class="admin connexion">
<form class="carte" method="post" action="/admin/connexion">
  <h1>Administration</h1>
  ${erreur ? alerte('erreur', e(erreur)) : ''}
  <input type="hidden" name="suite" value="${e(suite || '/admin')}">
  <div class="champ"><label for="mdp">Mot de passe</label>
    <input type="password" id="mdp" name="mdp" autocomplete="current-password" autofocus required></div>
  <button class="bouton primaire" type="submit">Entrer</button>
</form>
</body></html>`;
}

/* --- Tableau de bord ------------------------------------------------ */

function tableau({ compteurs, ca, recentes, alertes, message }) {
  const carte = (nom, valeur, lien, ton = '') =>
    `<a class="stat ${ton}" href="${lien}"><span class="stat-n">${e(valeur)}</span><span class="stat-l">${e(nom)}</span></a>`;

  const corps = `
<h1>Tableau de bord</h1>

${alertes.length ? alerte('attention', '<b>A faire :</b><ul>' + alertes.map((a) => `<li>${a}</li>`).join('') + '</ul>') : ''}

<div class="stats">
  ${carte('Badges a recevoir', compteurs.attente_badge || 0, '/admin/commandes?statut=attente_badge', 'chaud')}
  ${carte('A fabriquer', (compteurs.badge_recu || 0) + (compteurs.analyse || 0), '/admin/commandes?statut=badge_recu')}
  ${carte('A expedier', compteurs.copie_faite || 0, '/admin/commandes?statut=copie_faite', 'chaud')}
  ${carte('En transit', compteurs.expedie || 0, '/admin/commandes?statut=expedie')}
  ${carte('Terminees', compteurs.livre || 0, '/admin/commandes?statut=livre', 'froid')}
  ${carte('Remboursees', (compteurs.rembourse || 0) + (compteurs.non_copiable || 0), '/admin/commandes?statut=non_copiable', 'froid')}
</div>

<div class="stats deux">
  <div class="stat large"><span class="stat-n">${e(tarifs.euros(ca.mois))}</span><span class="stat-l">Encaisse ce mois-ci</span></div>
  <div class="stat large"><span class="stat-n">${e(tarifs.euros(ca.total))}</span><span class="stat-l">Encaisse depuis le debut</span></div>
</div>

<h2>Dernieres commandes</h2>
${tableCommandes(recentes)}
<p><a class="bouton fantome" href="/admin/commandes">Toutes les commandes</a></p>
`;
  return coque({ titre: 'Tableau de bord', corps, actif: '/admin', message });
}

function tableCommandes(list) {
  if (!list.length) return '<p class="vide">Aucune commande.</p>';
  return `<table class="table adm-table">
<thead><tr><th>Reference</th><th>Date</th><th>Client</th><th>Badge</th><th>Qte</th><th>Total</th><th>Statut</th></tr></thead>
<tbody>
${list.map((c) => `<tr onclick="location.href='/admin/commandes/${e(c.reference)}'">
  <td><a href="/admin/commandes/${e(c.reference)}"><b>${e(c.reference)}</b></a></td>
  <td>${e(String(c.created_at).slice(0, 16))}</td>
  <td>${e(c.nom)}<br><span class="mini">${e(c.ville)}</span></td>
  <td>${e(nomMarque(c.marque))}<br>${pastilleVerdict(c.verdict)}</td>
  <td>${e(c.quantite)}</td>
  <td>${e(tarifs.euros(c.total))}</td>
  <td><span class="statut s-${e(c.statut)}">${e((db.STATUT[c.statut] || { nom: c.statut }).nom)}</span></td>
</tr>`).join('\n')}
</tbody></table>`;
}

function nomMarque(cle) {
  const m = badges.MARQUE[cle];
  return m ? m.nom : cle || '—';
}

/* --- Liste ---------------------------------------------------------- */

function liste({ list, filtre, recherche, total, page: p, pages, message }) {
  const lien = (st) => `/admin/commandes?statut=${encodeURIComponent(st)}${recherche ? '&q=' + encodeURIComponent(recherche) : ''}`;
  const corps = `
<h1>Commandes <span class="mini">(${e(total)})</span></h1>

<form class="adm-filtres" method="get" action="/admin/commandes">
  <input type="search" name="q" value="${e(recherche || '')}" placeholder="Reference, nom, e-mail, ville">
  <button class="bouton fantome" type="submit">Chercher</button>
</form>

<div class="onglets">
  <a href="${lien('')}"${!filtre ? ' class="on"' : ''}>Toutes</a>
  ${db.STATUTS.map((s) => `<a href="${lien(s.cle)}"${filtre === s.cle ? ' class="on"' : ''}>${e(s.nom)}</a>`).join('\n  ')}
</div>

${tableCommandes(list)}

${pages > 1 ? `<nav class="pagination">${Array.from({ length: pages }, (_, i) => i + 1)
    .map((n) => `<a href="/admin/commandes?statut=${encodeURIComponent(filtre || '')}&q=${encodeURIComponent(recherche || '')}&p=${n}"${n === p ? ' class="on"' : ''}>${n}</a>`).join('')}</nav>` : ''}
`;
  return coque({ titre: 'Commandes', corps, actif: '/admin/commandes', message });
}

/* --- Detail --------------------------------------------------------- */

function detail({ cmd, att, historique, suite, mails, message }) {
  const s = db.STATUT[cmd.statut] || { nom: cmd.statut };
  const corps = `
<p class="fil-ariane"><a href="/admin/commandes">Commandes</a> / ${e(cmd.reference)}</p>
<div class="adm-titre">
  <h1>${e(cmd.reference)}</h1>
  <span class="statut gros s-${e(cmd.statut)}">${e(s.nom)}</span>
</div>

<div class="adm-colonnes">
<div>

  <section class="carte">
    <h2>Faire avancer la commande</h2>
    ${suite.length ? `<form method="post" action="/admin/commandes/${e(cmd.reference)}/statut" class="ligne-actions">
      ${suite.map((cle) => `<button class="bouton ${cle === 'non_copiable' || cle === 'annule' || cle === 'rembourse' ? 'danger' : 'primaire'}"
        name="statut" value="${e(cle)}" type="submit">${e(db.STATUT[cle].nom)}</button>`).join('\n      ')}
    </form>` : '<p class="vide">Cette commande est terminee.</p>'}
    <details class="repli">
      <summary>Forcer un autre statut</summary>
      <form method="post" action="/admin/commandes/${e(cmd.reference)}/statut" class="ligne">
        <select name="statut">${db.STATUTS.map((x) => `<option value="${e(x.cle)}"${x.cle === cmd.statut ? ' selected' : ''}>${e(x.nom)}</option>`).join('')}</select>
        <input type="text" name="commentaire" placeholder="Commentaire (visible par le client)">
        <button class="bouton fantome" type="submit">Appliquer</button>
      </form>
    </details>
  </section>

  <section class="carte">
    <h2>Expedition</h2>
    <form method="post" action="/admin/commandes/${e(cmd.reference)}/suivi" class="ligne">
      <input type="text" name="suivi" value="${e(cmd.suivi || '')}" placeholder="Numero de suivi postal">
      <button class="bouton fantome" type="submit">Enregistrer</button>
    </form>
    <p class="mini">Le numero est envoye au client avec l'e-mail d'expedition.</p>
  </section>

  <section class="carte">
    <h2>Note interne</h2>
    <form method="post" action="/admin/commandes/${e(cmd.reference)}/note">
      <textarea name="note" rows="4" placeholder="Cles trouvees, secteur, modele exact, difficultes...">${e(cmd.note_interne || '')}</textarea>
      <button class="bouton fantome" type="submit">Enregistrer</button>
    </form>
    <p class="mini">Jamais visible par le client.</p>
  </section>

  <section class="carte">
    <h2>Historique</h2>
    <ul class="historique">
      ${historique.map((h) => `<li><time>${e(String(h.created_at).slice(0, 16))}</time>
        <b>${e((db.STATUT[h.statut] || { nom: h.statut }).nom)}</b>
        <span class="mini">${e(h.auteur)}</span>
        ${h.commentaire ? `<span>${e(h.commentaire)}</span>` : ''}</li>`).join('\n      ')}
    </ul>
  </section>

  <section class="carte">
    <h2>E-mails envoyes</h2>
    ${mails.length ? `<ul class="historique">${mails.map((m) => `<li><time>${e(String(m.created_at).slice(0, 16))}</time>
      <b>${e(m.sujet)}</b> <span class="etat-mail e-${e(m.etat)}">${e(m.etat)}</span></li>`).join('')}</ul>`
      : '<p class="vide">Aucun e-mail.</p>'}
  </section>

</div>
<aside>

  <section class="carte">
    <h2>Le badge</h2>
    <dl class="fiche">
      <dt>Interphone</dt><dd>${e(nomMarque(cmd.marque))}</dd>
      <dt>Forme</dt><dd>${e((badges.FORME[cmd.forme] || {}).nom || '—')}</dd>
      <dt>Verdict annonce</dt><dd>${pastilleVerdict(cmd.verdict)}</dd>
      <dt>Technologie</dt><dd>${e(cmd.techno ? badges.TECHNO[cmd.techno].court : 'a determiner')}</dd>
      <dt>Methode</dt><dd>${cmd.methode === 'code' ? 'Numero grave' : 'Envoi postal'}</dd>
      ${cmd.code_badge ? `<dt>Numero</dt><dd><code>${e(cmd.code_badge)}</code></dd>` : ''}
      <dt>Quantite</dt><dd>${e(cmd.quantite)}</dd>
    </dl>
    ${cmd.photo ? `<a href="/admin/photo/${e(cmd.reference)}" target="_blank" rel="noopener">
        <img class="photo-badge" src="/admin/photo/${e(cmd.reference)}" alt="Photo du badge envoyee par le client"></a>`
      : '<p class="mini">Pas de photo.</p>'}
  </section>

  <section class="carte">
    <h2>Client</h2>
    <dl class="fiche">
      <dt>Nom</dt><dd>${e(cmd.nom)}</dd>
      <dt>E-mail</dt><dd>${e(cmd.email)}</dd>
      ${cmd.telephone ? `<dt>Telephone</dt><dd>${e(cmd.telephone)}</dd>` : ''}
      <dt>Livraison</dt><dd>${e(cmd.adresse)}${cmd.complement ? '<br>' + e(cmd.complement) : ''}<br>${e(cmd.cp)} ${e(cmd.ville)}</dd>
    </dl>
  </section>

  <section class="carte">
    <h2>Paiement</h2>
    <dl class="fiche">
      <dt>Total</dt><dd><b>${e(tarifs.euros(cmd.total))}</b> (${e(cmd.quantite)} × ${e(tarifs.euros(cmd.prix_unitaire))})</dd>
      <dt>Paye le</dt><dd>${e(cmd.paye_le || 'pas encore')}</dd>
      <dt>Reference</dt><dd class="coupe">${e(cmd.paiement_ref || '—')}</dd>
      ${cmd.remboursement_ref ? `<dt>Remboursement</dt><dd class="coupe">${e(cmd.remboursement_ref)}</dd>` : ''}
    </dl>
    ${cmd.paye_le && !cmd.remboursement_ref ? `<form method="post" action="/admin/commandes/${e(cmd.reference)}/remboursement"
      onsubmit="return confirm('Rembourser ${e(tarifs.euros(cmd.total))} au client ?')">
      <button class="bouton danger" type="submit">Rembourser ${e(tarifs.euros(cmd.total))}</button></form>` : ''}
  </section>

  <section class="carte">
    <h2>Attestation</h2>
    ${att ? `<dl class="fiche">
      <dt>Signee par</dt><dd>${e(att.nom)}</dd>
      <dt>Qualite</dt><dd>${e(att.qualite)}</dd>
      <dt>Immeuble</dt><dd>${e(att.adresse_immeuble)}</dd>
      <dt>Le</dt><dd>${e(String(att.signe_le).slice(0, 16))}</dd>
      <dt>Depuis</dt><dd>${e(att.ip || '—')}</dd>
    </dl>
    <p><a class="bouton fantome" href="/admin/attestation/${e(cmd.reference)}" target="_blank" rel="noopener">Ouvrir le PDF</a></p>
    <details class="repli"><summary>Texte signe</summary><pre class="texte-att">${e(att.texte)}</pre></details>`
      : alerte('erreur', "Aucune attestation enregistree pour cette commande. Ne fabriquez rien.")}
  </section>

</aside>
</div>
`;
  return coque({ titre: cmd.reference, corps, actif: '/admin/commandes', message });
}

/* --- Reglages -------------------------------------------------------- */

function reglages({ reglages: r, message }) {
  const paliers = tarifs.normalisePaliers(r.paliers);
  const corps = `
<h1>Reglages</h1>

<form method="post" action="/admin/reglages">

  <section class="carte">
    <h2>Tarifs degressifs</h2>
    <p class="mini">Une ligne par palier. « A partir de » est la quantite a partir de laquelle le prix s'applique.</p>
    <table class="table adm-table" id="paliers">
      <thead><tr><th>A partir de</th><th>Prix par badge (euros)</th></tr></thead>
      <tbody>
      ${paliers.concat([{ min: '', prix: '' }]).map((p) => `<tr>
        <td><input type="number" name="palier_min" value="${e(p.min)}" min="1" max="999"></td>
        <td><input type="text" name="palier_prix" value="${p.prix === '' ? '' : e((p.prix / 100).toFixed(2))}" inputmode="decimal"></td>
      </tr>`).join('\n      ')}
      </tbody>
    </table>
    <p class="mini">Laissez une ligne vide pour supprimer un palier.</p>
  </section>

  <section class="carte">
    <h2>Livraison et delais</h2>
    <div class="grille-form">
      <div class="champ"><label for="frais_port">Frais de port (euros, 0 pour offert)</label>
        <input type="text" id="frais_port" name="frais_port" value="${e((Number(r.frais_port) / 100).toFixed(2))}" inputmode="decimal"></div>
      <div class="champ"><label for="garantie">Duree de garantie</label>
        <input type="text" id="garantie" name="garantie" value="${e(r.garantie)}"></div>
      <div class="champ large"><label for="delai_jours">Delai annonce au client</label>
        <input type="text" id="delai_jours" name="delai_jours" value="${e(r.delai_jours)}"></div>
      <div class="champ large"><label for="adresse_retour">Adresse ou les clients envoient leur badge</label>
        <textarea id="adresse_retour" name="adresse_retour" rows="4">${e(r.adresse_retour)}</textarea>
        <p class="aide">Elle apparait dans l'e-mail de confirmation et sur la page de suivi. Tant qu'elle est vide, le client lit « adresse a completer ».</p></div>
    </div>
  </section>

  <button class="bouton primaire grand" type="submit">Enregistrer</button>
</form>

<section class="carte">
  <h2>Etat de la configuration</h2>
  <ul class="liste-etat">
    ${etat('Adresse de retour', !!r.adresse_retour, "Les clients ne savent pas ou envoyer leur badge.")}
    ${etat('Paiement Stripe', !!config.stripe.secretKey, 'Le site fonctionne en paiement simule.')}
    ${etat('Envoi des e-mails', config.mail.transport === 'smtp', "Les messages sont ecrits dans data/mails/ au lieu d'etre envoyes.")}
    ${etat('Identite de la societe', !!(config.societe.nom && config.societe.siret), 'Les CGV et les mentions legales sont incompletes.')}
    ${etat('Hebergeur declare', !!config.societe.hebergeur, 'Mention obligatoire (LCEN article 6).')}
  </ul>
</section>
`;
  return coque({ titre: 'Reglages', corps, actif: '/admin/reglages', message });
}

function etat(nom, ok, manque) {
  return `<li class="${ok ? 'ok' : 'ko'}"><b>${e(nom)}</b>${ok ? '' : ` — <span>${e(manque)}</span>`}</li>`;
}

/* --- Journal des e-mails --------------------------------------------- */

function mails({ list, message }) {
  const corps = `
<h1>E-mails</h1>
<p class="mini">Chaque message est enregistre avant l'envoi, avec son etat reel. « fichier » signifie qu'aucun serveur SMTP n'est configure : le message a ete ecrit dans data/mails/.</p>
${list.length ? `<table class="table adm-table">
<thead><tr><th>Date</th><th>Destinataire</th><th>Sujet</th><th>Etat</th></tr></thead>
<tbody>${list.map((m) => `<tr>
  <td>${e(String(m.created_at).slice(0, 16))}</td>
  <td>${e(m.destinataire)}</td>
  <td>${e(m.sujet)}${m.erreur ? `<br><span class="mini">${e(m.erreur)}</span>` : ''}</td>
  <td><span class="etat-mail e-${e(m.etat)}">${e(m.etat)}</span></td>
</tr>`).join('')}</tbody></table>` : '<p class="vide">Aucun e-mail.</p>'}
`;
  return coque({ titre: 'E-mails', corps, actif: '/admin/mails', message });
}

module.exports = { coque, connexion, tableau, liste, detail, reglages, mails, tableCommandes };
