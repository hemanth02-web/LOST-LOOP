'use strict';
const express = require('express');
const helmet = require('helmet');
const cookieParser = require('cookie-parser');
const rateLimit = require('express-rate-limit');
const path = require('path');
const { openDb } = require('./db');
const { makeAuth, loadSecret } = require('./auth');

/** Builds the Express app. Options let tests use a temp database and switch off rate limits. */
function createApp(opts = {}) {
  const dataDir = opts.dataDir || process.env.DATA_DIR || path.join(__dirname, '..', 'data');
  const db = opts.db || openDb(opts.dbPath || path.join(dataDir, 'lostloop.db'));
  const uploadDir = opts.uploadDir || path.join(dataDir, 'uploads');
  const auth = makeAuth(db, loadSecret(opts.dbPath === ':memory:' ? null : dataDir));
  const app = express();
  app.disable('x-powered-by');
  app.set('trust proxy', 1);

  app.use(helmet({
    contentSecurityPolicy: { directives: {
      defaultSrc: ["'self'"], scriptSrc: ["'self'"], styleSrc: ["'self'", "'unsafe-inline'"],
      imgSrc: ["'self'", 'data:', 'blob:'], connectSrc: ["'self'"], objectSrc: ["'none'"], frameAncestors: ["'none'"], baseUri: ["'self'"], formAction: ["'self'"]
    } },
    crossOriginEmbedderPolicy: false
  }));
  app.use(express.json({ limit: '50kb' }));
  app.use(cookieParser());
  app.use(auth.attach);

  // Reject cross-site state-changing requests (defence in depth on top of SameSite cookies).
  app.use('/api', (req, res, next) => {
    if (['POST', 'PUT', 'PATCH', 'DELETE'].includes(req.method) && req.headers.origin) {
      let host; try { host = new URL(req.headers.origin).host; } catch (e) { host = ''; }
      if (host !== req.headers.host) return res.status(403).json({ error: 'Cross-site request blocked.' });
    }
    next();
  });
  if (opts.rateLimit !== false) {
    app.use('/api', rateLimit({ windowMs: 15 * 60 * 1000, limit: 600, standardHeaders: true, legacyHeaders: false, message: { error: 'Too many requests. Please slow down.' } }));
    app.use('/api/auth/login', rateLimit({ windowMs: 15 * 60 * 1000, limit: 20, standardHeaders: true, legacyHeaders: false, message: { error: 'Too many login attempts. Try again in a few minutes.' } }));
    app.use('/api/auth/register', rateLimit({ windowMs: 60 * 60 * 1000, limit: 20, standardHeaders: true, legacyHeaders: false, message: { error: 'Too many sign-ups from this address. Try again later.' } }));
  }

  app.use('/api/auth', require('./routes/auth')(db, auth));
  app.use('/api/items', require('./routes/items')(db, auth, uploadDir));
  app.use('/api', require('./routes/misc')(db));
  app.use('/api', (req, res) => res.status(404).json({ error: 'Not found.' }));

  app.use('/uploads', express.static(uploadDir, { maxAge: '7d', index: false, dotfiles: 'deny' }));
  app.use(express.static(path.join(__dirname, '..', 'public')));

  // eslint-disable-next-line no-unused-vars
  app.use((err, req, res, next) => {
    if (err && err.code === 'LIMIT_FILE_SIZE') return res.status(413).json({ error: 'Photo is larger than 2 MB.', fields: { photo: 'Photo is larger than 2 MB.' } });
    if (err && err.type === 'entity.parse.failed') return res.status(400).json({ error: 'Invalid JSON.' });
    if (err && err.type === 'entity.too.large') return res.status(413).json({ error: 'Request too large.' });
    console.error(err);
    res.status(500).json({ error: 'Something went wrong on the server.' });
  });
  app.locals.db = db;
  return app;
}
module.exports = { createApp };
