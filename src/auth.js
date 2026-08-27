/* ------------------------------------------------------------------ *
 * Session administrateur et references de commande                     *
 * ------------------------------------------------------------------ */
'use strict';
const crypto = require('crypto');
const config = require('./config');

const NOM_COOKIE = 'bc_admin';

function signe(valeur) {
  return crypto.createHmac('sha256', config.secret).update(String(valeur)).digest('hex');
}

/* Comparaison a temps constant : un `===` sur une signature laisse mesurer,
   octet par octet, a quel endroit elle differe. timingSafeEqual exige deux
   tampons de meme longueur, d'ou le test prealable. */
function egal(a, b) {
  const ba = Buffer.from(String(a));
  const bb = Buffer.from(String(b));
  if (ba.length !== bb.length) return false;
  return crypto.timingSafeEqual(ba, bb);
}

function creeJeton() {
  const exp = Date.now() + 12 * 3600 * 1000;
  const corps = 'admin.' + exp;
  return corps + '.' + signe(corps);
}

function jetonValide(jeton) {
  if (!jeton) return false;
  const parts = String(jeton).split('.');
  if (parts.length !== 3) return false;
  const [role, exp, sig] = parts;
  if (role !== 'admin') return false;
  if (!egal(sig, signe(role + '.' + exp))) return false;
  return Number(exp) > Date.now();
}

/* `Secure` n'est pose que si la requete est reellement en https. Un cookie
   Secure envoye sur une adresse IP en http clair est jete par le navigateur
   SANS aucun message : la connexion renvoie 200, puis la page suivante se
   croit deconnectee, et rien dans les journaux n'explique pourquoi. */
function estHttps(req) {
  return req.secure || String(req.headers['x-forwarded-proto'] || '').split(',')[0] === 'https';
}

function poseCookie(req, res, jeton) {
  const bits = [
    NOM_COOKIE + '=' + jeton,
    'Path=/',
    'HttpOnly',
    'SameSite=Lax',
    'Max-Age=' + 12 * 3600,
  ];
  if (estHttps(req)) bits.push('Secure');
  res.append('Set-Cookie', bits.join('; '));
}

function retireCookie(req, res) {
  res.append('Set-Cookie', NOM_COOKIE + '=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0');
}

function lisCookies(req) {
  const out = {};
  const brut = req.headers.cookie;
  if (!brut) return out;
  for (const morceau of brut.split(';')) {
    const i = morceau.indexOf('=');
    if (i < 0) continue;
    out[morceau.slice(0, i).trim()] = decodeURIComponent(morceau.slice(i + 1).trim());
  }
  return out;
}

function estAdmin(req) {
  return jetonValide(lisCookies(req)[NOM_COOKIE]);
}

/* Le mot de passe admin est compare a temps constant lui aussi, apres
   hachage : sans le hachage prealable, deux mots de passe de longueurs
   differentes se distinguent immediatement. */
function motDePasseOk(saisi) {
  const a = crypto.createHash('sha256').update(String(saisi || '')).digest();
  const b = crypto.createHash('sha256').update(String(config.adminPassword)).digest();
  return crypto.timingSafeEqual(a, b);
}

function exigeAdmin(req, res, next) {
  if (estAdmin(req)) return next();
  res.redirect('/admin/connexion?suite=' + encodeURIComponent(req.originalUrl));
}

/* --- References ---------------------------------------------------- */

/* Alphabet sans I, O, 0, 1 : sur une etiquette collee sur une enveloppe, un
   client relit sa reference a la main et confond systematiquement ces
   quatre caracteres. */
const ALPHABET = '23456789ABCDEFGHJKLMNPQRSTUVWXYZ';

function aleatoire(n) {
  const octets = crypto.randomBytes(n);
  let s = '';
  for (let i = 0; i < n; i++) s += ALPHABET[octets[i] % ALPHABET.length];
  return s;
}

function reference(annee) {
  const a = String(annee || new Date().getFullYear()).slice(-2);
  return 'BC-' + a + '-' + aleatoire(6);
}

/* Jeton de suivi : la page de suivi est accessible sans compte, avec la
   reference ET ce jeton. La reference seule ne suffit pas, sinon une
   reference voisine laisserait lire la commande d'un autre client. */
function jetonSuivi() {
  return crypto.randomBytes(16).toString('hex');
}

module.exports = {
  NOM_COOKIE, signe, egal, creeJeton, jetonValide, poseCookie, retireCookie,
  lisCookies, estAdmin, motDePasseOk, exigeAdmin, estHttps,
  reference, jetonSuivi, aleatoire,
};
