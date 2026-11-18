'use strict';
const express = require('express');
const multer = require('multer');
const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
const { CATEGORIES, LOCATIONS, ROLES } = require('../constants');
const { validateItem, answerMatches, matchScore, likeEscape, norm } = require('../util');

const BASE = `SELECT i.*, u.name AS poster_name, u.role AS poster_role FROM items i JOIN users u ON u.id = i.user_id`;
const MAX_FAILED_ATTEMPTS = 5;

function sniffImage(buf) {
  if (buf.length > 12 && buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff) return 'jpg';
  if (buf.length > 8 && buf.slice(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))) return 'png';
  if (buf.length > 12 && buf.slice(0, 4).toString() === 'RIFF' && buf.slice(8, 12).toString() === 'WEBP') return 'webp';
  return null;
}

module.exports = function itemRoutes(db, auth, uploadDir) {
  const r = express.Router();
  fs.mkdirSync(uploadDir, { recursive: true });
  const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 2 * 1024 * 1024, files: 1 } });

  const getRow = db.prepare(BASE + ' WHERE i.id = ?');
  const hasVerifiedClaim = db.prepare('SELECT 1 FROM claims WHERE item_id = ? AND user_id = ? AND matched = 1');
  const failedCount = db.prepare('SELECT COUNT(*) AS n FROM claims WHERE item_id = ? AND user_id = ? AND matched = 0');

  const isOwner = (row, u) => !!u && (u.id === row.user_id || !!u.is_admin);
  const canSeeContact = (row, u) => isOwner(row, u) || (!!u && !!hasVerifiedClaim.get(row.id, u.id));

  /** What any visitor may see. Contact is added only for the owner/admin or a verified claimant. */
  function view(row, u, withContact) {
    const o = {
      id: row.id, type: row.type, category: row.category, title: row.title, desc: row.description,
      location: row.location, date: row.date, status: row.status, name: row.poster_name, role: row.poster_role,
      photo: row.photo ? '/uploads/' + row.photo : '', verify: row.verify_question || '',
      createdAt: row.created_at, returnedAt: row.returned_at || null, mine: !!u && u.id === row.user_id
    };
    if (withContact) o.contact = row.contact;
    return o;
  }
  const detail = (row, u) => view(row, u, canSeeContact(row, u));

  // ---- list with server-side search / filter / sort / paging
  r.get('/', (req, res) => {
    const q = req.query;
    const where = [], params = [];
    const status = q.status === 'returned' ? 'returned' : 'active';
    where.push('i.status = ?'); params.push(status);
    if (q.type === 'lost' || q.type === 'found') { where.push('i.type = ?'); params.push(q.type); }
    if (CATEGORIES.some((c) => c.id === q.category)) { where.push('i.category = ?'); params.push(q.category); }
    if (LOCATIONS.includes(q.location)) { where.push('i.location = ?'); params.push(q.location); }
    if (ROLES.includes(q.role)) { where.push('u.role = ?'); params.push(q.role); }
    String(q.q || '').toLowerCase().split(/\s+/).filter(Boolean).slice(0, 6).forEach((w) => {
      const like = '%' + likeEscape(w) + '%';
      const catIds = CATEGORIES.filter((c) => c.label.toLowerCase().includes(w)).map((c) => c.id);
      let cond = `(lower(i.title) LIKE ? ESCAPE '\\' OR lower(i.description) LIKE ? ESCAPE '\\' OR lower(i.location) LIKE ? ESCAPE '\\' OR lower(u.name) LIKE ? ESCAPE '\\' OR u.role LIKE ? ESCAPE '\\' OR i.type = ?`;
      params.push(like, like, like, like, like, w);
      if (catIds.length) { cond += ` OR i.category IN (${catIds.map(() => '?').join(',')})`; params.push(...catIds); }
      where.push(cond + ')');
    });
    const order = q.sort === 'old' ? 'i.created_at ASC' : q.sort === 'az' ? 'i.title COLLATE NOCASE ASC' : (status === 'returned' ? 'i.returned_at DESC' : 'i.created_at DESC');
    const limit = Math.min(Math.max(parseInt(q.limit, 10) || 60, 1), 200);
    const offset = Math.max(parseInt(q.offset, 10) || 0, 0);
    const from = ` FROM items i JOIN users u ON u.id = i.user_id WHERE ${where.join(' AND ')}`;
    const total = db.prepare('SELECT COUNT(*) AS n' + from).get(...params).n;
    const rows = db.prepare('SELECT i.*, u.name AS poster_name, u.role AS poster_role' + from + ` ORDER BY ${order} LIMIT ? OFFSET ?`).all(...params, limit, offset);
    res.json({ items: rows.map((row) => view(row, req.user, false)), total, limit, offset });
  });

  r.get('/mine', auth.require, (req, res) => {
    const rows = db.prepare(BASE + ' WHERE i.user_id = ? ORDER BY i.created_at DESC').all(req.user.id);
    res.json({ items: rows.map((row) => view(row, req.user, true)) });
  });

  r.get('/:id', (req, res) => {
    const row = getRow.get(Number(req.params.id));
    if (!row) return res.status(404).json({ error: 'Item not found.' });
    res.json({ item: detail(row, req.user) });
  });

  // ---- possible matches (computed on the server)
  r.get('/:id/matches', (req, res) => {
    const row = getRow.get(Number(req.params.id));
    if (!row) return res.status(404).json({ error: 'Item not found.' });
    if (row.status !== 'active') return res.json({ matches: [] });
    const cands = db.prepare(BASE + " WHERE i.status = 'active' AND i.type != ? AND i.category = ?").all(row.type, row.category);
    const out = [];
    cands.forEach((c) => {
      const m = matchScore({ ...row, description: row.description }, { ...c, description: c.description });
      if (m && m.score >= 50) out.push({ item: view(c, req.user, false), score: m.score, same: m.same, reasons: m.reasons });
    });
    out.sort((a, b) => b.score - a.score);
    res.json({ matches: out.slice(0, 3) });
  });

  // ---- create (multipart so a photo can be attached)
  r.post('/', auth.require, upload.single('photo'), (req, res) => {
    const { errors, value } = validateItem(req.body || {});
    let ext = null;
    if (req.file) {
      ext = sniffImage(req.file.buffer);
      if (!ext) errors.photo = 'Photo must be a JPEG, PNG or WebP image.';
    }
    if (Object.keys(errors).length) return res.status(400).json({ error: 'Please fix the highlighted fields.', fields: errors });
    let photo = '';
    if (req.file) {
      photo = crypto.randomBytes(16).toString('hex') + '.' + ext;
      fs.writeFileSync(path.join(uploadDir, photo), req.file.buffer);
    }
    const info = db.prepare(`INSERT INTO items (user_id, type, category, title, description, location, date, contact, verify_question, verify_answer, photo, status, created_at)
      VALUES (?,?,?,?,?,?,?,?,?,?,?, 'active', ?)`).run(req.user.id, value.type, value.category, value.title, value.description, value.location,
      value.date, value.contact, value.verify_question, value.verify_answer, photo, Date.now());
    res.status(201).json({ item: detail(getRow.get(info.lastInsertRowid), req.user) });
  });

  // ---- claim (found item) or respond (lost item)
  r.post('/:id/claims', auth.require, (req, res) => {
    const row = getRow.get(Number(req.params.id));
    if (!row) return res.status(404).json({ error: 'Item not found.' });
    if (row.status !== 'active') return res.status(409).json({ error: 'This item has already been returned.' });
    if (row.user_id === req.user.id) return res.status(400).json({ error: 'You cannot claim your own report.' });
    const b = req.body || {};
    const contact = String(b.contact || '').trim();
    const errors = {};
    const { isEmail, isPhone } = require('../util');
    if (!(isEmail(contact) || isPhone(contact)) || contact.length > 60) errors.contact = 'Enter a valid email or 10-digit phone number.';
    const needsAnswer = row.type === 'found' && !!row.verify_answer;
    const answer = String(b.answer || '').trim();
    if (needsAnswer && !answer) errors.answer = 'Answer the verification question.';
    if (answer.length > 60) errors.answer = 'Answer must be at most 60 characters.';
    if (Object.keys(errors).length) return res.status(400).json({ error: 'Please fix the highlighted fields.', fields: errors });

    if (hasVerifiedClaim.get(row.id, req.user.id)) return res.json({ verified: true, contact: row.contact });
    if (needsAnswer && failedCount.get(row.id, req.user.id).n >= MAX_FAILED_ATTEMPTS)
      return res.status(429).json({ error: 'Too many wrong answers for this item. Please contact the poster another way.' });

    const matched = needsAnswer ? answerMatches(answer, row.verify_answer) : true;
    db.prepare('INSERT INTO claims (item_id, user_id, name, contact, answer, matched, created_at) VALUES (?,?,?,?,?,?,?)')
      .run(row.id, req.user.id, req.user.name, contact, needsAnswer ? answer : null, matched ? 1 : 0, Date.now());
    if (!matched) return res.json({ verified: false });
    res.status(201).json({ verified: true, contact: row.contact });
  });

  r.get('/:id/claims', auth.require, (req, res) => {
    const row = getRow.get(Number(req.params.id));
    if (!row) return res.status(404).json({ error: 'Item not found.' });
    if (!isOwner(row, req.user)) return res.status(403).json({ error: 'Only the poster can see claims.' });
    const claims = db.prepare('SELECT id, name, contact, answer, matched, created_at AS createdAt FROM claims WHERE item_id = ? ORDER BY id DESC').all(row.id)
      .map((c) => ({ ...c, matched: !!c.matched }));
    res.json({ claims });
  });

  r.post('/:id/return', auth.require, (req, res) => {
    const row = getRow.get(Number(req.params.id));
    if (!row) return res.status(404).json({ error: 'Item not found.' });
    if (!isOwner(row, req.user)) return res.status(403).json({ error: 'Only the poster can mark this item returned.' });
    if (row.status === 'returned') return res.json({ item: detail(row, req.user) });
    db.prepare("UPDATE items SET status = 'returned', returned_at = ? WHERE id = ?").run(Date.now(), row.id);
    res.json({ item: detail(getRow.get(row.id), req.user) });
  });

  r.delete('/:id', auth.require, (req, res) => {
    const row = getRow.get(Number(req.params.id));
    if (!row) return res.status(404).json({ error: 'Item not found.' });
    if (!isOwner(row, req.user)) return res.status(403).json({ error: 'Only the poster can delete this report.' });
    db.prepare('DELETE FROM items WHERE id = ?').run(row.id);
    if (row.photo) fs.rm(path.join(uploadDir, path.basename(row.photo)), { force: true }, () => {});
    res.json({ ok: true });
  });

  return r;
};
