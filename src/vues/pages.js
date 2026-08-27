'use strict';
const { e, page, pastilleVerdict, alerte } = require('./layout');
const badges = require('../badges');
const tarifs = require('../tarifs');
const config = require('../config');
const db = require('../db');

/* --- Badges compatibles -------------------------------------------- */

function compatibilite() {
  const corps = `
<div class="entete-page">
  <h1>Quels badges savons-nous copier ?</h1>
  <p class="sous">La reponse honnete, technologie par technologie. Certains badges ne se copient pas, et aucun prestataire ne peut pretendre le contraire.</p>
</div>

<table class="table">
  <thead><tr><th>Technologie</th><th>Verdict</th><th>Pourquoi</th></tr></thead>
  <tbody>
  ${badges.TECHNOS.map((t) => `<tr>
    <td><b>${e(t.nom)}</b></td>
    <td>${pastilleVerdict(t.verdict)}</td>
    <td>${e(t.explication)}</td>
  </tr>`).join('\n  ')}
  </tbody>
</table>

<h2>Par marque d'interphone</h2>
<p class="sous">C'est le nom ecrit sur la platine, en bas de l'immeuble.</p>
<table class="table">
  <thead><tr><th>Marque</th><th>Verdict</th><th>Technologies rencontrees</th></tr></thead>
  <tbody>
  ${badges.MARQUES.filter((m) => m.cle !== 'inconnue').map((m) => `<tr>
    <td><b>${e(m.nom)}</b></td>
    <td>${pastilleVerdict(m.verdict)}</td>
    <td>${e(m.technos.map((c) => badges.TECHNO[c].court).join(', ')) || '—'}</td>
  </tr>`).join('\n  ')}
  </tbody>
</table>

${alerte('info', `<b>Vigik, deux choses differentes.</b>
<p>Le badge du <b>resident</b> dans un immeuble equipe Vigik est, dans l'immense majorite des cas, un Mifare Classic ordinaire : nous le copions.</p>
<p>Le badge de <b>service</b> (facteur, releveur, pompiers) porte un certificat qui expire chaque jour et se recharge sur une borne. Celui-la ne se copie pas, et une copie ne servirait a rien.</p>`)}

<p class="centre"><a class="bouton primaire grand" href="/commander">Identifier mon badge</a></p>
`;
  return page({
    titre: 'Badges compatibles',
    description: "Liste des technologies de badges que nous savons copier, et de celles que personne ne peut copier.",
    corps, actif: '/compatibilite',
  });
}

/* --- Suivi ---------------------------------------------------------- */

function suiviFormulaire({ erreur, reference }) {
  const corps = `
<div class="entete-page etroit">
  <h1>Suivre ma commande</h1>
  <p class="sous">Votre numero de commande figure dans l'e-mail de confirmation. Il commence par BC-.</p>
</div>
<form class="carte etroit" method="post" action="/suivi">
  ${erreur ? alerte('erreur', e(erreur)) : ''}
  <div class="champ"><label for="reference">Numero de commande</label>
    <input type="text" id="reference" name="reference" value="${e(reference || '')}" placeholder="BC-26-A7K2M9" required autocomplete="off"></div>
  <div class="champ"><label for="email">Adresse e-mail de la commande</label>
    <input type="email" id="email" name="email" required autocomplete="email"></div>
  <button class="bouton primaire" type="submit">Afficher ma commande</button>
</form>
`;
  return page({ titre: 'Suivre ma commande', corps, actif: '/suivi' });
}

const ETAPES_VISIBLES = ['paye', 'attente_badge', 'badge_recu', 'copie_faite', 'expedie', 'livre'];

function suivi({ cmd, historique, reglages }) {
  const fini = db.STATUTS_FINAUX.includes(cmd.statut);
  const rang = ETAPES_VISIBLES.indexOf(cmd.statut);
  const s = db.STATUT[cmd.statut] || { nom: cmd.statut, client: '' };
  const rate = cmd.statut === 'non_copiable' || cmd.statut === 'rembourse' || cmd.statut === 'annule';

  const corps = `
<div class="entete-page">
  <h1>Commande ${e(cmd.reference)}</h1>
  <p class="sous">Passee le ${e(String(cmd.created_at).slice(8, 10))}/${e(String(cmd.created_at).slice(5, 7))}/${e(String(cmd.created_at).slice(0, 4))} — ${e(cmd.quantite)} badge(s) — ${e(tarifs.euros(cmd.total))}</p>
</div>

${cmd.statut === 'attente_paiement'
  ? `${alerte('attention', `<b>Cette commande n'a pas ete payee.</b>
      <p>Le paiement a ete interrompu. Rien n'a ete debite, et la commande est conservee : vous pouvez la reprendre la ou vous l'aviez laissee.</p>`)}
    <div class="carte centre">
      <p class="montant">${e(tarifs.euros(cmd.total))}</p>
      <p class="mini">${e(cmd.quantite)} badge(s)</p>
      <p><a class="bouton primaire grand" href="/paiement/reprendre/${e(cmd.reference)}?j=${e(cmd.jeton)}">Reprendre le paiement</a></p>
    </div>`
  : rate
  ? alerte('attention', `<b>${e(s.nom)}</b><p>${e(s.client)}</p>`)
  : `<ol class="progression">
      ${ETAPES_VISIBLES.map((cle, i) => {
        const st = db.STATUT[cle];
        const etat = rang < 0 ? 'a-venir' : i < rang ? 'fait' : i === rang ? 'courant' : 'a-venir';
        return `<li class="${etat}"><span class="point"></span><span>${e(st.nom)}</span></li>`;
      }).join('\n      ')}
    </ol>
    <div class="carte">
      <h2>${e(s.nom)}</h2>
      <p>${e(s.client)}</p>
      ${cmd.statut === 'attente_badge' || cmd.statut === 'paye'
        ? `<div class="encart-envoi"><b>Ou envoyer votre badge</b>
             <pre>${e(reglages.adresse_retour || '(adresse a completer)')}</pre>
             <p class="mini">Joignez un papier avec votre numero de commande : ${e(cmd.reference)}.</p></div>`
        : ''}
      ${cmd.suivi ? `<p><b>Numero de suivi postal :</b> ${e(cmd.suivi)}</p>` : ''}
    </div>`}

<h2>Historique</h2>
<ul class="historique">
  ${historique.map((h) => `<li><time>${e(String(h.created_at).slice(0, 16).replace('T', ' '))}</time>
    <b>${e((db.STATUT[h.statut] || { nom: h.statut }).nom)}</b>
    ${h.commentaire ? `<span>${e(h.commentaire)}</span>` : ''}</li>`).join('\n  ')}
</ul>

<p class="mini">Une question sur cette commande ? Repondez simplement a l'e-mail de confirmation.</p>
`;
  return page({ titre: 'Commande ' + cmd.reference, corps, actif: '/suivi' });
}

/* --- Confirmation --------------------------------------------------- */

function confirmation({ cmd, reglages, lien }) {
  const corps = `
<div class="entete-page etroit centre">
  <div class="coche-ok" aria-hidden="true">✓</div>
  <h1>Merci, c'est enregistre.</h1>
  <p class="sous">Votre commande porte le numero <b>${e(cmd.reference)}</b>. Un e-mail de confirmation part a l'instant vers ${e(cmd.email)}.</p>
</div>

<div class="carte etroit">
  ${cmd.methode === 'poste' ? `
  <h2>Prochaine etape : postez votre badge</h2>
  <ol class="liste-num">
    <li>Glissez votre badge dans une enveloppe matelassee.</li>
    <li>Ajoutez un papier portant votre numero de commande : <b>${e(cmd.reference)}</b>.</li>
    <li>Postez le tout a l'adresse ci-dessous.</li>
  </ol>
  <pre class="adresse">${e(reglages.adresse_retour || '(adresse a completer)')}</pre>
  <p class="mini">Nous vous renverrons l'original avec la ou les copies. ${e(reglages.delai_jours)}.</p>
  ` : `
  <h2>Nous n'avons besoin de rien d'autre</h2>
  <p>Le numero grave que vous nous avez donne suffit. Nous fabriquons la copie et nous vous l'envoyons.</p>
  `}
  <p><a class="bouton primaire" href="${e(lien)}">Suivre ma commande</a></p>
  <p class="mini">Gardez ce lien : il donne acces au suivi sans mot de passe.</p>
</div>
`;
  return page({ titre: 'Commande enregistree', corps, actif: '/commander' });
}

/* --- Paiement simule ------------------------------------------------ */

function paiementSimule({ cmd, montant }) {
  const corps = `
<div class="entete-page etroit centre">
  <h1>Paiement (mode demonstration)</h1>
</div>
${alerte('attention', `<b>Stripe n'est pas encore branche.</b>
  <p>Cet ecran remplace la page de paiement le temps que le compte Stripe soit ouvert. Il suit exactement le meme chemin :
  la commande n'est marquee payee qu'apres validation cote serveur, jamais sur simple retour du navigateur.</p>`)}
<div class="carte etroit centre">
  <p class="montant">${e(tarifs.euros(montant))}</p>
  <p class="mini">Commande ${e(cmd.reference)} — ${e(cmd.quantite)} badge(s)</p>
  <form method="post" action="/paiement/simule/${e(cmd.reference)}">
    <input type="hidden" name="j" value="${e(cmd.jeton)}">
    <button class="bouton primaire grand" type="submit" name="issue" value="ok">Simuler un paiement accepte</button>
    <button class="bouton fantome" type="submit" name="issue" value="ko">Simuler un refus</button>
  </form>
</div>
`;
  return page({ titre: 'Paiement', corps });
}

/* --- Pages de texte -------------------------------------------------- */

function bloc(titre, html, actif) {
  return page({
    titre,
    corps: `<div class="entete-page etroit"><h1>${e(titre)}</h1></div><article class="texte etroit">${html}</article>`,
    actif,
  });
}

function legalite() {
  return bloc("Est-ce legal de faire copier son badge ?", `
<p><b>Oui, quand c'est vous qui le demandez pour votre propre logement.</b> Un badge d'immeuble n'est pas une oeuvre protegee ni un objet reglemente : c'est un identifiant. L'occupant d'un logement a le droit d'en detenir un double, comme il a le droit de faire refaire une cle.</p>

<h2>Ce que nous exigeons</h2>
<p>A chaque commande, vous signez une attestation sur l'honneur nominative : vous declarez etre proprietaire, locataire, occupant ou gestionnaire mandate du logement concerne, detenir legitimement le badge, et destiner la copie a votre usage.</p>
<p>Cette attestation est horodatee, rattachee a votre commande et conservee. Nous ne fabriquons rien sans elle.</p>

<h2>Ce que nous refusons</h2>
<ul>
  <li>Toute commande dont la legitimite nous parait douteuse. Nous remboursons alors integralement.</li>
  <li>Les badges de service Vigik (facteur, releveur, secours) : ils ne se copient pas, et leur duplication n'aurait aucun sens.</li>
  <li>Les commandes en quantite manifestement sans rapport avec un usage familial.</li>
</ul>

<h2>Ce que dit votre reglement de copropriete</h2>
<p>Certains reglements de copropriete ou baux prevoient que les badges sont fournis par le syndic et limitent leur nombre. C'est une relation contractuelle entre vous et votre copropriete : elle ne rend pas la copie illegale, mais elle peut vous exposer a une remarque de votre syndic. Nous vous invitons a en tenir compte.</p>

<h2>Et l'usage frauduleux ?</h2>
<p>L'utilisation frauduleuse d'un badge d'acces engage la responsabilite de son auteur. C'est precisement ce que l'attestation etablit : la personne qui commande declare son identite, sa qualite et l'adresse concernee.</p>
`, '/legalite');
}

function aide({ reglages }) {
  const g = tarifs.grille(reglages.paliers);
  const q = [
    ["Combien de temps cela prend-il ?",
      `<p>${e(reglages.delai_jours)}. L'essentiel du delai, c'est le trajet postal aller-retour.</p>`],
    ["Et si vous n'arrivez pas a copier mon badge ?",
      `<p>Vous etes rembourse en entier, frais de retour compris, et nous vous renvoyons votre badge d'origine. C'est le cas des badges chiffres recents (DESFire, Mifare Plus, iCLASS SE), que personne ne sait copier.</p>`],
    ["Je peux lire mon badge avec mon telephone ?",
      `<p>Pas depuis un site web : un navigateur ne sait lire que les etiquettes NFC contenant du texte, pas un badge d'immeuble. Et sur iPhone, cette fonction n'existe pas du tout. Une application Android est prevue ; en attendant, l'envoi postal est la seule methode fiable.</p>`],
    ["Et les cles metalliques rondes ?",
      `<p>Ce sont des cles contact (iButton). Leur numero est grave sur le boitier : vous pouvez commander en le saisissant, sans nous envoyer la cle.</p>`],
    ["Vous copiez les telecommandes de portail ?",
      `<p>Les anciennes, a code fixe, oui. Les recentes, a code tournant (Somfy Keytis, Nice Flor-S, CAME Atomo), non : leur code change a chaque appui. Il faut les appairer sur le moteur du portail, ce que seul le proprietaire peut faire.</p>`],
    ["Mon badge d'origine, je le recupere ?",
      `<p>Toujours. Il repart dans le meme colis que les copies.</p>`],
    ["Combien ca coute ?",
      `<p>${g.map((x) => e(x.libelle) + ' : ' + e(x.prixTexte) + ' par badge').join('. ')}. ${Number(reglages.frais_port) > 0 ? 'Frais de port : ' + e(tarifs.euros(reglages.frais_port)) + '.' : 'Livraison comprise.'}</p>`],
    ["La copie ne fonctionne pas, que faire ?",
      `<p>Garantie ${e(reglages.garantie)} : nous refaisons le badge, ou nous vous remboursons. Repondez a l'e-mail de confirmation avec votre numero de commande.</p>`],
  ];
  return bloc('Questions frequentes',
    q.map(([t, r]) => `<details class="faq"><summary>${e(t)}</summary>${r}</details>`).join('\n'),
    '/aide');
}

function cgv({ reglages }) {
  const s = config.societe;
  const manque = !s.nom || !s.siret;
  const g = tarifs.grille(reglages.paliers);
  return bloc('Conditions generales de vente', `
${manque ? alerte('attention', "<b>Document a completer.</b><p>Les coordonnees de la societe (denomination, SIRET, adresse) ne sont pas encore renseignees. Elles sont obligatoires avant toute mise en ligne.</p>") : ''}

<h2>1. Objet</h2>
<p>Les presentes conditions regissent la vente de prestations de reproduction de badges d'acces, cles contact et telecommandes, realisees par ${e(s.nom || '[denomination]')}${s.siret ? `, immatriculee sous le numero SIRET ${e(s.siret)}` : ''}.</p>

<h2>2. Conditions d'acces au service</h2>
<p>Le service est reserve aux personnes attestant etre proprietaire, locataire, occupant ou gestionnaire mandate du logement ou local ou le badge donne acces. Cette attestation sur l'honneur est obligatoire et conditionne la commande. Le vendeur se reserve le droit de refuser toute commande et de la rembourser integralement.</p>

<h2>3. Prix</h2>
<p>${g.map((x) => e(x.libelle) + ' : ' + e(x.prixTexte)).join(' — ')}. ${Number(reglages.frais_port) > 0 ? 'Frais de port : ' + e(tarifs.euros(reglages.frais_port)) + '.' : 'Frais de port compris.'} Les prix sont en euros toutes taxes comprises.</p>

<h2>4. Faisabilite technique et remboursement</h2>
<p>Certaines technologies de badges utilisent un chiffrement qui rend toute reproduction impossible. Lorsque le vendeur constate, apres reception du badge, qu'il ne peut le reproduire, la commande est <b>integralement remboursee</b> et le badge d'origine retourne au client sans frais. Aucune retenue n'est appliquee.</p>

<h2>5. Delais</h2>
<p>${e(reglages.delai_jours)}, a compter de la reception du badge d'origine. Ce delai est indicatif et depend des delais postaux.</p>

<h2>6. Garantie</h2>
<p>Les copies sont garanties ${e(reglages.garantie)}. Une copie qui n'ouvre pas est refaite ou remboursee, au choix du client.</p>

<h2>7. Droit de retractation</h2>
<p>Conformement a l'article L221-28 du code de la consommation, le droit de retractation ne s'applique pas aux biens confectionnes selon les specifications du consommateur ou nettement personnalises. La copie d'un badge, encodee a partir de l'identifiant propre au client, releve de cette exception une fois la fabrication engagee. Avant le debut de la fabrication, la commande peut etre annulee et remboursee sur simple demande.</p>

<h2>8. Envoi du badge d'origine</h2>
<p>Le client expedie son badge sous sa propre responsabilite. Un envoi suivi est recommande. Le vendeur retourne le badge d'origine avec les copies.</p>

<h2>9. Responsabilite</h2>
<p>Le client demeure seul responsable de l'usage fait des copies qui lui sont remises. La remise d'une copie a un tiers non autorise, ou tout usage frauduleux, engage sa responsabilite exclusive.</p>

<h2>10. Donnees personnelles</h2>
<p>Voir la page <a href="/confidentialite">Donnees personnelles</a>.</p>

<h2>11. Litiges</h2>
<p>Droit francais. En cas de litige, le client peut recourir gratuitement a un mediateur de la consommation avant toute action judiciaire.</p>
`, '/cgv');
}

function mentions() {
  const s = config.societe;
  const manque = !s.nom || !s.siret || !s.adresse;
  return bloc('Mentions legales', `
${manque ? alerte('attention', "<b>Document a completer.</b><p>Denomination, SIRET, adresse, directeur de publication et hebergeur doivent etre renseignes avant la mise en ligne. Ils sont obligatoires (article 6 III de la LCEN).</p>") : ''}
<h2>Editeur</h2>
<p>${e(s.nom || '[denomination]')}${s.forme ? ' — ' + e(s.forme) : ''}<br>
${e([s.adresse, s.cp, s.ville].filter(Boolean).join(', ') || '[adresse]')}<br>
${s.siret ? 'SIRET ' + e(s.siret) : '[SIRET]'}${s.tva ? ' — TVA ' + e(s.tva) : ''}<br>
${s.telephone ? 'Telephone : ' + e(s.telephone) : ''}</p>
<h2>Directeur de la publication</h2>
<p>${e(s.directeur || '[nom du directeur de publication]')}</p>
<h2>Hebergement</h2>
<p>${e(s.hebergeur || "[nom et adresse de l'hebergeur]")}</p>
<h2>Contact</h2>
<p>${s.email ? e(s.email) : 'Par le formulaire de suivi de commande.'}</p>
`, '/mentions-legales');
}

function confidentialite() {
  const s = config.societe;
  const ans = Math.round(config.retentionJours / 365);
  return bloc('Donnees personnelles', `
<h2>Ce que nous collectons</h2>
<ul>
  <li>Vos coordonnees de livraison : nom, adresse, e-mail, telephone si vous le donnez.</li>
  <li>Les elements de votre commande : type de badge, quantite, photo si vous en joignez une.</li>
  <li>L'attestation sur l'honneur : nom, qualite, adresse de l'immeuble, date et adresse IP de signature.</li>
</ul>

<h2>Pourquoi</h2>
<p>Executer votre commande, vous tenir informe, et conserver la preuve que la copie a ete demandee par un occupant legitime. Cette derniere finalite repose sur l'interet legitime du vendeur a se proteger.</p>

<h2>Combien de temps</h2>
<p>Les commandes et les attestations sont conservees ${e(ans)} ans, puis effacees automatiquement. La photo du badge est supprimee des la commande terminee.</p>

<h2>Ce que nous ne faisons pas</h2>
<p>Aucune revente, aucune publicite, aucun traceur publicitaire. Le site n'utilise que les cookies strictement necessaires a son fonctionnement, qui ne demandent pas de consentement.</p>

<h2>Vos droits</h2>
<p>Acces, rectification, effacement, opposition. Ecrivez-nous en repondant a l'e-mail de confirmation de commande, avec votre numero de commande.
${s.email ? ' Ou a ' + e(s.email) + '.' : ''}
Vous pouvez aussi saisir la CNIL.</p>
`, '/confidentialite');
}

module.exports = {
  compatibilite, suiviFormulaire, suivi, confirmation, paiementSimule,
  legalite, aide, cgv, mentions, confidentialite, bloc,
};
