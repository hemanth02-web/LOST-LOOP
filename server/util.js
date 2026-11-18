'use strict';
const { CATEGORIES, LOCATIONS } = require('./constants');

const norm = (s) => String(s == null ? '' : s).toLowerCase().replace(/[^a-z0-9 ]/g, ' ').replace(/\s+/g, ' ').trim();
const words = (s) => norm(s).split(' ').filter((w) => w.length > 2);
const isEmail = (s) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(s);
const isPhone = (s) => /^\d{10,12}$/.test(String(s).replace(/[\s+\-()]/g, ''));
const todayStr = () => new Date().toISOString().slice(0, 10);

/** Server-side validation of a lost/found report. Returns { errors, value }. */
function validateItem(b) {
  const errors = {};
  const v = {};
  v.type = b.type;
  if (v.type !== 'lost' && v.type !== 'found') errors.type = 'Type must be "lost" or "found".';
  v.category = b.category;
  if (!CATEGORIES.some((c) => c.id === v.category)) errors.category = 'Choose a category.';
  v.title = String(b.title || '').trim();
  if (v.title.length < 3 || v.title.length > 60) errors.title = 'Item name must be 3 to 60 characters.';
  v.location = b.location;
  if (!LOCATIONS.includes(v.location)) errors.location = 'Select a campus location.';
  v.date = String(b.date || '');
  if (!/^\d{4}-\d{2}-\d{2}$/.test(v.date) || isNaN(new Date(v.date + 'T12:00:00'))) errors.date = 'Pick a valid date.';
  else {
    const maxD = new Date(); maxD.setDate(maxD.getDate() + 1); // one day of timezone slack
    const minD = new Date(); minD.setFullYear(minD.getFullYear() - 1);
    const d = new Date(v.date + 'T12:00:00');
    if (d > maxD) errors.date = 'The date cannot be in the future.';
    else if (d < minD) errors.date = 'The date cannot be more than a year ago.';
  }
  v.description = String(b.desc || b.description || '').trim();
  if (v.description.length < 10 || v.description.length > 240) errors.desc = 'Details must be 10 to 240 characters.';
  v.contact = String(b.contact || '').trim();
  if (!(isEmail(v.contact) || isPhone(v.contact)) || v.contact.length > 60) errors.contact = 'Enter a valid email or 10-digit phone number.';
  v.verify_question = v.type === 'found' ? String(b.verify || b.verify_question || '').trim() : '';
  v.verify_answer = v.type === 'found' ? String(b.answer || b.verify_answer || '').trim() : '';
  if (v.verify_question.length > 80) errors.verify = 'Question must be at most 80 characters.';
  if (v.verify_answer.length > 60) errors.answer = 'Answer must be at most 60 characters.';
  if (v.verify_question && !v.verify_answer) errors.answer = 'Add the answer to your verification question.';
  return { errors, value: v };
}

/** Case-, punctuation- and whitespace-insensitive "contains" check of a claimant's answer. */
function answerMatches(given, correct) {
  const a = norm(given), c = norm(correct);
  return !!a && !!c && (a.includes(c) || c.includes(a));
}

/** Possible-match score between two items (category must match, opposite type, both active). */
function matchScore(a, b) {
  if (a.type === b.type || a.status !== 'active' || b.status !== 'active' || a.category !== b.category) return null;
  let s = 50;
  const reasons = ['Same category'];
  const same = a.location === b.location;
  if (same) { s += 25; reasons.push('Same place'); }
  const wb = words(b.title + ' ' + b.description);
  let shared = 0;
  words(a.title + ' ' + a.description).forEach((w) => { if (wb.includes(w)) shared++; });
  if (shared) { s += Math.min(18, shared * 6); reasons.push(shared + ' shared keyword' + (shared > 1 ? 's' : '')); }
  const diff = Math.abs(new Date(a.date) - new Date(b.date)) / 86400000;
  if (diff <= 3) { s += 7; reasons.push('Dates close together'); }
  return { score: Math.min(98, s), same, reasons };
}

const likeEscape = (s) => s.replace(/[\\%_]/g, (m) => '\\' + m);

module.exports = { norm, words, isEmail, isPhone, todayStr, validateItem, answerMatches, matchScore, likeEscape };
