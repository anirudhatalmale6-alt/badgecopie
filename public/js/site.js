/* Interactions communes a toutes les pages. */
(function () {
  'use strict';
  var b = document.getElementById('bmenu');
  var n = document.getElementById('nav');
  if (b && n) {
    b.addEventListener('click', function () {
      var ouvert = n.classList.toggle('ouvert');
      b.setAttribute('aria-expanded', ouvert ? 'true' : 'false');
    });
    /* Le menu se referme quand on navigue ou qu'on clique ailleurs : sur
       telephone il reste sinon deploye par-dessus le contenu de la page
       d'arrivee si celle-ci vient du cache. */
    document.addEventListener('click', function (e) {
      if (n.classList.contains('ouvert') && !n.contains(e.target) && e.target !== b && !b.contains(e.target)) {
        n.classList.remove('ouvert');
        b.setAttribute('aria-expanded', 'false');
      }
    });
  }
})();
