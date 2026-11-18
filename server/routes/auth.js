'use strict';
const express = require('express');
const bcrypt = require('bcryptjs');
const { ROLES } = require('../constants');
const { isEmail } = require('../util');

module.exports = function authRoutes(db, auth) {
  const r = express.Router();
  const byEmail = db.prepare('SELECT * FROM users WHERE email = ?');
  const insert = db.prepare('INSERT INTO users (name, email, password_hash, role, is_admin, created_at) VALUES (?,?,?,?,0,?)');
  const pub = (u) => ({ id: u.id, name: u.name, email: u.email, role: u.role, isAdmin: !!u.is_admin });
  const allowedDomain = (process.env.ALLOWED_EMAIL_DOMAIN || '').toLowerCase();

  r.post('/register', (req, res) => {
    const b = req.body || {};
    const errors = {};
    const name = String(b.name || '').trim();
    const email = String(b.email || '').trim().toLowerCase();
    const password = String(b.password || '');
    const role = b.role;
    if (name.length < 2 || name.length > 40) errors.name = 'Enter your name (2 to 40 characters).';
    if (!isEmail(email) || email.length > 80) errors.email = 'Enter a valid email address.';
    else if (allowedDomain && !email.endsWith('@' + allowedDomain)) errors.email = 'Please use your @' + allowedDomain + ' email.';
    if (password.length < 8 || password.length > 72) errors.password = 'Password must be 8 to 72 characters.';
    else if (!/[a-zA-Z]/.test(password) || !/\d/.test(password)) errors.password = 'Password needs at least one letter and one number.';
    if (!ROLES.includes(role)) errors.role = 'Choose Student, Faculty or Staff.';
    if (Object.keys(errors).length) return res.status(400).json({ error: 'Please fix the highlighted fields.', fields: errors });
    if (byEmail.get(email)) return res.status(409).json({ error: 'An account with this email already exists.', fields: { email: 'Already registered. Try logging in.' } });
    const info = insert.run(name, email, bcrypt.hashSync(password, 10), role, Date.now());
    const user = { id: info.lastInsertRowid, name, email, role, is_admin: 0 };
    auth.sign(user, res);
    res.status(201).json({ user: pub(user) });
  });

  r.post('/login', (req, res) => {
    const email = String((req.body || {}).email || '').trim().toLowerCase();
    const password = String((req.body || {}).password || '');
    const u = byEmail.get(email);
    // Same message for unknown email and wrong password: do not reveal which accounts exist.
    if (!u || !bcrypt.compareSync(password, u.password_hash)) return res.status(401).json({ error: 'Incorrect email or password.' });
    auth.sign(u, res);
    res.json({ user: pub(u) });
  });

  r.post('/logout', (req, res) => { auth.clear(res); res.json({ ok: true }); });
  r.get('/me', (req, res) => res.json({ user: req.user ? pub(req.user) : null }));
  return r;
};
