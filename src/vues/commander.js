'use strict';
const { e, page } = require('./layout');
const badges = require('../badges');
const attestation = require('../attestation');
const tarifs = require('../tarifs');

module.exports = function commander({ reglages }) {
  const grille = tarifs.grille(reglages.paliers);

  const corps = `
<div class="entete-page">
  <h1>Commander une copie</h1>
  <p class="sous">Six etapes courtes. Rien n'est debite avant la derniere.</p>
</div>

<ol class="fil" id="fil">
  ${['Votre badge', 'Quantite', 'Envoi', 'Coordonnees', 'Attestation', 'Paiement']
    .map((n, i) => `<li data-etape="${i + 1}"><span class="pastille">${i + 1}</span><span class="fil-nom">${e(n)}</span></li>`)
    .join('\n  ')}
</ol>

<form id="form" class="form-commande" novalidate>

<!-- 1 ------------------------------------------------------------- -->
<section class="etape" data-etape="1">
  <h2>1. Quel badge voulez-vous copier ?</h2>

  <fieldset class="champ">
    <legend>Quelle marque est ecrite sur la platine de votre interphone ?</legend>
    <p class="aide">C'est le boitier a boutons en bas de l'immeuble. La marque y est presque toujours ecrite en petit.</p>
    <div class="grille-choix" id="marques">
      ${badges.MARQUES.map((m) => `<label class="choix"><input type="radio" name="marque" value="${e(m.cle)}"><span>${e(m.nom)}</span></label>`).join('\n      ')}
    </div>
  </fieldset>

  <fieldset class="champ">
    <legend>A quoi ressemble votre badge ?</legend>
    <div class="grille-choix formes" id="formes">
      ${badges.FORMES.map((f) => `<label class="choix"><input type="radio" name="forme" value="${e(f.cle)}"><span>${e(f.nom)}</span></label>`).join('\n      ')}
    </div>
  </fieldset>

  <div id="verdict" class="verdict-bloc" hidden></div>

  <div class="nav-etape">
    <span></span>
    <button type="button" class="bouton primaire" data-suivant="2" disabled id="v1">Continuer</button>
  </div>
</section>

<!-- 2 ------------------------------------------------------------- -->
<section class="etape" data-etape="2" hidden>
  <h2>2. Combien de copies ?</h2>
  <div class="quantite">
    <button type="button" class="qbtn" data-q="-1" aria-label="Retirer un badge">−</button>
    <input type="number" id="quantite" name="quantite" value="1" min="1" max="50" inputmode="numeric">
    <button type="button" class="qbtn" data-q="1" aria-label="Ajouter un badge">+</button>
  </div>
  <div class="recap-prix" id="prix"></div>
  <table class="table-tarifs">
    <thead><tr><th>Quantite</th><th>Prix par badge</th></tr></thead>
    <tbody>${grille.map((g) => `<tr><td>${e(g.libelle)}</td><td>${e(g.prixTexte)}</td></tr>`).join('')}</tbody>
  </table>
  <div class="nav-etape">
    <button type="button" class="bouton fantome" data-precedent="1">Retour</button>
    <button type="button" class="bouton primaire" data-suivant="3">Continuer</button>
  </div>
</section>

<!-- 3 ------------------------------------------------------------- -->
<section class="etape" data-etape="3" hidden>
  <h2>3. Comment nous transmettez-vous le badge ?</h2>
  <div class="methodes">
    <label class="choix large">
      <input type="radio" name="methode" value="poste" checked>
      <span><b>Je vous envoie mon badge par la poste</b>
        <i>Nous le lisons, nous fabriquons la copie, et nous vous renvoyons les deux. C'est la methode qui marche pour tous les badges.</i></span>
    </label>
    <label class="choix large" id="opt-code" hidden>
      <input type="radio" name="methode" value="code">
      <span><b>Je saisis le numero grave sur ma cle</b>
        <i>Reserve aux cles contact metalliques. Vous gardez votre cle, nous n'avons besoin que du numero.</i></span>
    </label>
    <label class="choix large desactive">
      <input type="radio" name="methode" value="nfc" disabled>
      <span><b>Je lis mon badge avec mon telephone</b>
        <i>Bientot disponible, par une application Android. Un navigateur ne sait pas lire un badge d'immeuble, et l'iPhone ne le permet pas du tout.</i></span>
    </label>
  </div>

  <div class="champ" id="bloc-code" hidden>
    <label for="code_badge">Numero grave sur la cle</label>
    <input type="text" id="code_badge" name="code_badge" placeholder="01 2A 3B 4C 5D 6E" autocomplete="off">
    <p class="aide">Il commence par 01 et compte 12 ou 16 caracteres. Les espaces n'ont pas d'importance.</p>
    <p class="erreur" id="err-code" hidden></p>
  </div>

  <div class="champ">
    <label for="photo">Photo de votre badge <span class="facultatif">(facultatif, recommande)</span></label>
    <input type="file" id="photo" name="photo" accept="image/*">
    <p class="aide">Une photo des deux faces nous evite souvent un aller-retour.</p>
  </div>

  <div class="nav-etape">
    <button type="button" class="bouton fantome" data-precedent="2">Retour</button>
    <button type="button" class="bouton primaire" data-suivant="4">Continuer</button>
  </div>
</section>

<!-- 4 ------------------------------------------------------------- -->
<section class="etape" data-etape="4" hidden>
  <h2>4. Ou vous renvoyons-nous le tout ?</h2>
  <div class="grille-form">
    <div class="champ"><label for="nom">Nom et prenom</label><input type="text" id="nom" name="nom" autocomplete="name" required></div>
    <div class="champ"><label for="email">Adresse e-mail</label><input type="email" id="email" name="email" autocomplete="email" required>
      <p class="aide">Le suivi de commande vous y sera envoye.</p></div>
    <div class="champ"><label for="telephone">Telephone <span class="facultatif">(facultatif)</span></label><input type="tel" id="telephone" name="telephone" autocomplete="tel"></div>
    <div class="champ large"><label for="adresse">Adresse</label><input type="text" id="adresse" name="adresse" autocomplete="street-address" required></div>
    <div class="champ large"><label for="complement">Complement <span class="facultatif">(batiment, etage, digicode)</span></label><input type="text" id="complement" name="complement"></div>
    <div class="champ"><label for="cp">Code postal</label><input type="text" id="cp" name="cp" autocomplete="postal-code" inputmode="numeric" required></div>
    <div class="champ"><label for="ville">Ville</label><input type="text" id="ville" name="ville" autocomplete="address-level2" required></div>
  </div>
  <p class="erreur" id="err-coord" hidden></p>
  <div class="nav-etape">
    <button type="button" class="bouton fantome" data-precedent="3">Retour</button>
    <button type="button" class="bouton primaire" data-suivant="5">Continuer</button>
  </div>
</section>

<!-- 5 ------------------------------------------------------------- -->
<section class="etape" data-etape="5" hidden>
  <h2>5. Attestation sur l'honneur</h2>
  <p class="sous">Nous ne fabriquons une copie que pour l'occupant legitime du logement. Cette attestation nous y autorise, et vous protege autant que nous.</p>

  <div class="grille-form">
    <div class="champ"><label for="att_nom">Votre nom complet</label><input type="text" id="att_nom" name="att_nom" required></div>
    <div class="champ"><label for="qualite">Vous etes</label>
      <select id="qualite" name="qualite">
        ${attestation.QUALITES.map((q) => `<option value="${e(q.cle)}">${e(q.nom.charAt(0).toUpperCase() + q.nom.slice(1))}</option>`).join('\n        ')}
      </select></div>
    <div class="champ large"><label for="adresse_immeuble">Adresse complete de l'immeuble concerne</label>
      <input type="text" id="adresse_immeuble" name="adresse_immeuble" required>
      <p class="aide">L'adresse ou le badge sert. Elle peut differer de votre adresse de livraison.</p>
      <p><button type="button" class="lien" id="copier-adresse">Utiliser mon adresse de livraison</button></p></div>
  </div>

  <div class="apercu-attestation" id="apercu"></div>

  <label class="case"><input type="checkbox" id="accepte_att" name="accepte_att">
    <span>J'atteste sur l'honneur l'exactitude de ce qui precede.</span></label>
  <label class="case"><input type="checkbox" id="accepte_cgv" name="accepte_cgv">
    <span>J'accepte les <a href="/cgv" target="_blank" rel="noopener">conditions generales de vente</a>.</span></label>
  <p class="erreur" id="err-att" hidden></p>

  <div class="nav-etape">
    <button type="button" class="bouton fantome" data-precedent="4">Retour</button>
    <button type="button" class="bouton primaire" data-suivant="6">Continuer</button>
  </div>
</section>

<!-- 6 ------------------------------------------------------------- -->
<section class="etape" data-etape="6" hidden>
  <h2>6. Recapitulatif</h2>
  <div class="recap" id="recap"></div>
  <p class="erreur" id="err-final" hidden></p>
  <div class="nav-etape">
    <button type="button" class="bouton fantome" data-precedent="5">Retour</button>
    <button type="submit" class="bouton primaire grand" id="payer">Valider et payer</button>
  </div>
  <p class="mini centre">Vous serez redirige vers le paiement securise. Rien n'est debite avant.</p>
</section>

</form>
`;

  return page({
    titre: 'Commander une copie de badge',
    description: "Identifiez votre badge en trois questions et commandez une copie. Rembourse si le badge n'est pas copiable.",
    corps,
    actif: '/commander',
    scripts: ['/js/commande.js?v=8'],
    classe: 'p-commande',
  });
};
