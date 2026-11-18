'use strict';
const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
const jwt = require('jsonwebtoken');

const COOKIE = 'll_token';
const MAX_AGE_MS = 7 * 24 * 3600 * 1000;

function loadSecret(dataDir) {
  if (process.env.JWT_SECRET) return process.env.JWT_SECRET;
  if (!dataDir) return crypto.randomBytes(32).toString('hex');
  const f = path.join(dataDir, '.jwt_secret');
  try { return fs.readFileSync(f, 'utf8').trim(); } catch (e) { /* create below */ }
  const s = crypto.randomBytes(32).toString('hex');
  fs.mkdirSync(dataDir, { recursive: true });
  fs.writeFileSync(f, s, { mode: 0o600 });
  return s;
}

function makeAuth(db, secret) {
  const getUser = db.prepare('SELECT id, name, email, role, is_admin FROM users WHERE id = ?');
  return {
    sign(user, res) {
      const token = jwt.sign({ uid: user.id }, secret, { expiresIn: '7d' });
      res.cookie(COOKIE, token, { httpOnly: true, sameSite: 'lax', secure: process.env.COOKIE_SECURE === '1', maxAge: MAX_AGE_MS, path: '/' });
    },
    clear(res) { res.clearCookie(COOKIE, { path: '/' }); },
    /** Attaches req.user (or null). Never rejects. */
    attach(req, res, next) {
      req.user = null;
      const t = req.cookies && req.cookies[COOKIE];
      if (t) {
        try { req.user = getUser.get(jwt.verify(t, secret).uid) || null; } catch (e) { req.user = null; }
      }
      next();
    },
    require(req, res, next) {
      if (!req.user) return res.status(401).json({ error: 'Please log in to continue.' });
      next();
    }
  };
}
module.exports = { makeAuth, loadSecret };
