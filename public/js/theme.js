/* Le theme est pose sur <html> AVANT le rendu (ce fichier est charge dans
   <head>, sans defer) : applique plus tard, le visiteur voit un eclair blanc
   avant que le theme sombre ne se pose. */
(function (g) {
  'use strict';
  var CLE = 'bc-theme';

  function actuel() {
    var t = null;
    try { t = localStorage.getItem(CLE); } catch (e) { /* navigation privee */ }
    if (t === 'clair' || t === 'sombre') return t;
    return (g.matchMedia && g.matchMedia('(prefers-color-scheme: dark)').matches) ? 'sombre' : 'clair';
  }

  function applique(t) {
    document.documentElement.setAttribute('data-theme', t);
    try { localStorage.setItem(CLE, t); } catch (e) { /* sans importance */ }
    var b = document.getElementById('btheme');
    if (b) {
      b.textContent = t === 'sombre' ? '☀' : '☾';
      b.title = t === 'sombre' ? 'Passer en clair' : 'Passer en sombre';
    }
  }

  applique(actuel());
  document.addEventListener('DOMContentLoaded', function () {
    applique(actuel());
    var b = document.getElementById('btheme');
    if (b) b.addEventListener('click', function () {
      applique(document.documentElement.getAttribute('data-theme') === 'sombre' ? 'clair' : 'sombre');
    });
  });

  g.BCTheme = { applique: applique, actuel: actuel };
})(window);
