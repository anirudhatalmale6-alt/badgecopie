'use strict';
const express = require('express');
const path = require('path');
const config = require('./src/config');
const db = require('./src/db');

const app = express();

/* Derriere un reverse proxy (nginx, Apache), req.ip et req.secure ne valent
   quelque chose que si Express fait confiance a l'en-tete transmise. Sans
   cette ligne, le cookie de session ne recoit jamais l'attribut Secure meme
   en https, et l'adresse IP de l'attestation est celle du proxy. */
app.set('trust proxy', 1);
app.disable('x-powered-by');

app.use((req, res, next) => {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
  res.setHeader('X-Frame-Options', 'SAMEORIGIN');
  next();
});

app.use(express.static(path.join(__dirname, 'public'), { maxAge: '1h' }));

app.use('/admin', require('./src/admin'));
app.use('/', require('./src/routes'));

app.use((req, res) => {
  res.status(404).send(require('./src/vues/pages').bloc('Page introuvable',
    "<p>Cette page n'existe pas ou plus.</p><p><a class='bouton primaire' href='/'>Retour a l'accueil</a></p>"));
});

/* Le corps de l'erreur n'est jamais renvoye au visiteur : un message MySQL
   contient le nom des tables et parfois la requete complete. */
app.use((err, req, res, next) => {
  console.error('[erreur]', req.method, req.originalUrl, err.message);
  if (err && err.code === 'LIMIT_FILE_SIZE') {
    return res.status(400).json({ ok: false, erreurs: [`Le fichier depasse ${config.maxUploadMo} Mo.`] });
  }
  if (res.headersSent) return next(err);
  res.status(500).send(require('./src/vues/pages').bloc('Erreur',
    "<p>Une erreur est survenue. Elle a ete enregistree.</p>"));
});

async function demarre() {
  await db.migrate();
  app.listen(config.port, () => {
    console.log(`${config.siteNom} sur http://127.0.0.1:${config.port}`);
    console.log(`Paiement : ${config.stripeActif ? 'Stripe' : 'simule'} — E-mails : ${config.mail.transport}`);
  });

  /* Purge RGPD : une fois au demarrage, puis chaque jour. */
  const purge = async () => {
    try {
      const n = await db.purge();
      if (n) console.log(`[purge] ${n} commande(s) au-dela de ${config.retentionJours} jours supprimee(s)`);
    } catch (e) { console.error('[purge]', e.message); }
  };
  purge();
  setInterval(purge, 24 * 3600 * 1000).unref();
}

demarre().catch((e) => {
  console.error('Demarrage impossible :', e.message);
  process.exit(1);
});
