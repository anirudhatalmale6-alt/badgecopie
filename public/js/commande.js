/* ------------------------------------------------------------------ *
 * Assistant de commande                                                *
 * ------------------------------------------------------------------ *
 * Toutes les verifications faites ici sont un CONFORT pour le visiteur.
 * Aucune n'est une securite : le serveur revalide tout, recalcule le prix
 * et refuse lui-meme les technologies non copiables. Une page qui se
 * contente de masquer un bouton ne protege de rien.
 */
(function () {
  'use strict';

  var form = document.getElementById('form');
  if (!form) return;

  var etat = { etape: 1, analyse: null, devis: null, catalogue: null };
  var etapes = [].slice.call(form.querySelectorAll('.etape'));
  var fil = document.getElementById('fil');
  var MAX = etapes.length;

  function $(id) { return document.getElementById(id); }
  function json(url, corps) {
    return fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(corps || {}),
    }).then(function (r) { return r.json(); });
  }

  /* --- Navigation --------------------------------------------------- */

  function montre(n) {
    etat.etape = Math.max(1, Math.min(MAX, n));
    etapes.forEach(function (s) {
      s.hidden = Number(s.getAttribute('data-etape')) !== etat.etape;
    });
    [].forEach.call(fil.children, function (li) {
      var i = Number(li.getAttribute('data-etape'));
      li.classList.toggle('on', i === etat.etape);
      li.classList.toggle('fait', i < etat.etape);
    });
    /* On remonte en haut du formulaire, pas de la page : sur telephone
       l'etape suivante commencait sous la ligne de flottaison et l'on
       croyait que le bouton n'avait rien fait. */
    var haut = form.getBoundingClientRect().top + window.pageYOffset - 90;
    window.scrollTo({ top: Math.max(0, haut), behavior: 'smooth' });
  }

  form.addEventListener('click', function (e) {
    var b = e.target.closest ? e.target.closest('[data-suivant], [data-precedent]') : null;
    if (!b) return;
    e.preventDefault();
    if (b.hasAttribute('data-precedent')) return montre(Number(b.getAttribute('data-precedent')));
    if (valide(etat.etape)) montre(Number(b.getAttribute('data-suivant')));
  });

  fil.addEventListener('click', function (e) {
    var li = e.target.closest ? e.target.closest('li[data-etape]') : null;
    if (!li) return;
    var n = Number(li.getAttribute('data-etape'));
    /* On ne laisse revenir qu'en arriere : sauter en avant contournerait
       les validations intermediaires. */
    if (n < etat.etape) montre(n);
  });

  /* --- Etape 1 : identification ------------------------------------- */

  function marque() { var r = form.querySelector('input[name=marque]:checked'); return r ? r.value : ''; }
  function forme() { var r = form.querySelector('input[name=forme]:checked'); return r ? r.value : ''; }

  function analyse() {
    if (!marque() && !forme()) return;
    json('/api/analyse', { marque: marque(), forme: forme() }).then(function (a) {
      etat.analyse = a;
      var bloc = $('verdict');
      bloc.className = 'verdict-bloc ' + a.verdict;
      bloc.hidden = false;
      var titres = { oui: 'Bonne nouvelle', verifier: 'A verifier', non: 'Nous ne pouvons pas' };
      bloc.innerHTML =
        '<h3>' + titres[a.verdict] + '</h3>' +
        '<p>' + echappe(a.message) + '</p>' +
        (a.technos.length
          ? '<ul>' + a.technos.map(function (t) {
              return '<li><b>' + echappe(t.court) + '</b> — ' + echappe(t.explication) + '</li>';
            }).join('') + '</ul>'
          : '') +
        '<p class="mini">' + echappe(a.raison) + '</p>';

      /* L'option « numero grave » n'existe que pour les cles contact. */
      var opt = $('opt-code');
      opt.hidden = !a.codeAccepte;
      if (!a.codeAccepte) {
        var r = form.querySelector('input[name=methode][value=code]');
        if (r && r.checked) { form.querySelector('input[name=methode][value=poste]').checked = true; majMethode(); }
      }

      $('v1').disabled = a.verdict === 'non';
    });
  }

  form.addEventListener('change', function (e) {
    if (e.target.name === 'marque' || e.target.name === 'forme') {
      cocheVisuel(e.target);
      analyse();
    }
    if (e.target.name === 'methode') { cocheVisuel(e.target); majMethode(); }
  });

  /* `:has()` n'existe pas partout : on double la mise en evidence par une
     classe, sinon le choix selectionne ne se distingue pas du tout sur les
     navigateurs plus anciens. */
  function cocheVisuel(input) {
    var nom = input.name;
    [].forEach.call(form.querySelectorAll('input[name="' + nom + '"]'), function (i) {
      var l = i.closest('.choix');
      if (l) l.classList.toggle('coche', i.checked);
    });
  }

  /* --- Etape 2 : quantite -------------------------------------------- */

  var qte = $('quantite');

  function devis() {
    json('/api/devis', { quantite: qte.value }).then(function (d) {
      etat.devis = d;
      $('prix').innerHTML =
        '<div class="ligne-prix"><span>' + d.quantite + ' × ' + echappe(d.prixUnitaireTexte) + '</span>' +
        '<span>' + echappe(d.sousTotalTexte) + '</span></div>' +
        (d.fraisPort > 0
          ? '<div class="ligne-prix"><span>Frais de port</span><span>' + echappe(d.fraisPortTexte) + '</span></div>'
          : '<div class="ligne-prix"><span>Livraison</span><span>offerte</span></div>') +
        '<div class="total"><span>Total</span><span>' + echappe(d.totalTexte) + '</span></div>' +
        /* L'economie est une NOTE, pas une ligne du calcul. Placee dans la
           colonne des montants avec un signe moins, elle se lisait comme une
           deduction a soustraire du total : « 55,00 − 22,50 » ne donnant pas
           55,00, l'addition semblait fausse. */
        (d.economie > 0
          ? '<p class="eco">Vous economisez ' + echappe(d.economieTexte) +
            ' par rapport au prix a l\'unite.</p>'
          : '');
    });
  }

  qte.addEventListener('input', devis);
  form.addEventListener('click', function (e) {
    var b = e.target.closest ? e.target.closest('[data-q]') : null;
    if (!b) return;
    e.preventDefault();
    var v = Math.max(1, Math.min(50, (parseInt(qte.value, 10) || 1) + Number(b.getAttribute('data-q'))));
    qte.value = v;
    devis();
  });

  /* --- Etape 3 : methode ---------------------------------------------- */

  function methode() { var r = form.querySelector('input[name=methode]:checked'); return r ? r.value : 'poste'; }
  function majMethode() { $('bloc-code').hidden = methode() !== 'code'; }

  /* --- Etape 5 : attestation ------------------------------------------ */

  $('copier-adresse').addEventListener('click', function () {
    var a = [$('adresse').value, $('complement').value, $('cp').value + ' ' + $('ville').value]
      .filter(function (x) { return x && x.trim(); }).join(', ');
    $('adresse_immeuble').value = a;
    apercu();
  });

  var minuteur = null;
  function apercu() {
    clearTimeout(minuteur);
    minuteur = setTimeout(function () {
      json('/api/attestation', {
        nom: $('att_nom').value || $('nom').value,
        qualite: $('qualite').value,
        adresseImmeuble: $('adresse_immeuble').value,
        quantite: qte.value,
      }).then(function (r) { $('apercu').textContent = r.texte; });
    }, 250);
  }
  ['att_nom', 'qualite', 'adresse_immeuble'].forEach(function (id) {
    $(id).addEventListener('input', apercu);
    $(id).addEventListener('change', apercu);
  });

  /* --- Validation par etape -------------------------------------------- */

  function erreurDans(id, texte) {
    var p = $(id);
    if (!p) return false;
    p.textContent = texte || '';
    p.hidden = !texte;
    return !texte;
  }

  function valide(n) {
    if (n === 1) {
      if (!marque() || !forme()) {
        alerteSimple('Choisissez la marque de votre interphone et la forme de votre badge.');
        return false;
      }
      if (etat.analyse && etat.analyse.verdict === 'non') return false;
      return true;
    }
    if (n === 3) {
      if (methode() === 'code') {
        var c = $('code_badge').value.replace(/[^0-9A-Fa-f]/g, '').toUpperCase();
        if (!/^01[0-9A-F]{10}([0-9A-F]{4})?$/.test(c)) {
          return erreurDans('err-code', 'Ce numero ne correspond pas au format attendu : il commence par 01 et compte 12 ou 16 caracteres.');
        }
        erreurDans('err-code', '');
      }
      return true;
    }
    if (n === 4) {
      var manque = [];
      [['nom', 'votre nom'], ['email', 'votre e-mail'], ['adresse', 'votre adresse'],
       ['cp', 'votre code postal'], ['ville', 'votre ville']].forEach(function (p) {
        if (!$(p[0]).value.trim()) manque.push(p[1]);
      });
      if (manque.length) return erreurDans('err-coord', 'Il manque : ' + manque.join(', ') + '.');
      if (!/^[^\s@]+@[^\s@]+\.[a-z]{2,}$/i.test($('email').value.trim())) {
        return erreurDans('err-coord', "Cette adresse e-mail ne semble pas valide.");
      }
      erreurDans('err-coord', '');
      if (!$('att_nom').value.trim()) $('att_nom').value = $('nom').value.trim();
      apercu();
      return true;
    }
    if (n === 5) {
      if ($('adresse_immeuble').value.trim().length < 6) {
        return erreurDans('err-att', "Indiquez l'adresse complete de l'immeuble concerne.");
      }
      if (!$('accepte_att').checked) return erreurDans('err-att', "Vous devez valider l'attestation sur l'honneur.");
      if (!$('accepte_cgv').checked) return erreurDans('err-att', 'Vous devez accepter les conditions generales de vente.');
      erreurDans('err-att', '');
      recap();
      return true;
    }
    return true;
  }

  function alerteSimple(t) {
    var bloc = $('verdict');
    bloc.className = 'verdict-bloc verifier';
    bloc.hidden = false;
    bloc.innerHTML = '<h3>Il manque une reponse</h3><p>' + echappe(t) + '</p>';
  }

  /* --- Recapitulatif ---------------------------------------------------- */

  function recap() {
    var a = etat.analyse || {};
    var d = etat.devis || {};
    $('recap').innerHTML =
      '<dl>' +
      ligne('Badge', (a.marque || '—') + ' — ' + (a.forme || '—')) +
      ligne('Faisabilite', a.verdict === 'oui' ? 'Copiable' : 'A verifier a reception') +
      ligne('Quantite', d.quantite || qte.value) +
      ligne('Transmission', methode() === 'code' ? 'Numero grave (vous gardez votre cle)' : 'Envoi de votre badge par la poste') +
      ligne('Livraison', $('nom').value + ', ' + $('adresse').value + ', ' + $('cp').value + ' ' + $('ville').value) +
      ligne('Attestation', $('att_nom').value + ' — ' + $('adresse_immeuble').value) +
      '</dl>' +
      '<div class="total-final"><span>Total</span><span>' + echappe(d.totalTexte || '') + '</span></div>';
  }

  function ligne(t, v) { return '<dt>' + echappe(t) + '</dt><dd>' + echappe(v) + '</dd>'; }

  function echappe(s) {
    return String(s == null ? '' : s)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
  }

  /* --- Envoi -------------------------------------------------------------- */

  form.addEventListener('submit', function (e) {
    e.preventDefault();
    if (!valide(5)) { montre(5); return; }

    var bouton = $('payer');
    bouton.disabled = true;
    bouton.textContent = 'Enregistrement…';

    var fd = new FormData();
    fd.append('marque', marque());
    fd.append('forme', forme());
    fd.append('quantite', qte.value);
    fd.append('methode', methode());
    fd.append('code_badge', $('code_badge').value);
    ['nom', 'email', 'telephone', 'adresse', 'complement', 'cp', 'ville',
      'att_nom', 'qualite', 'adresse_immeuble'].forEach(function (id) {
      fd.append(id, $(id).value);
    });
    fd.append('accepte_att', $('accepte_att').checked ? '1' : '');
    fd.append('accepte_cgv', $('accepte_cgv').checked ? '1' : '');
    if ($('photo').files[0]) fd.append('photo', $('photo').files[0]);

    fetch('/api/commande', { method: 'POST', body: fd })
      .then(function (r) { return r.json(); })
      .then(function (r) {
        if (r.ok && r.url) { window.location.href = r.url; return; }
        bouton.disabled = false;
        bouton.textContent = 'Valider et payer';
        var msg = r.erreur || (r.erreurs || []).join(' ') || "L'enregistrement a echoue.";
        erreurDans('err-final', msg);
      })
      .catch(function () {
        bouton.disabled = false;
        bouton.textContent = 'Valider et payer';
        erreurDans('err-final', "La connexion au serveur a echoue. Reessayez dans un instant.");
      });
  });

  /* --- Demarrage ---------------------------------------------------------- */

  montre(1);
  devis();
  majMethode();
})();
