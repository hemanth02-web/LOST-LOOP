'use strict';
const express = require('express');
const { CATEGORIES, LOCATIONS, ROLES } = require('../constants');

module.exports = function miscRoutes(db) {
  const r = express.Router();
  r.get('/health', (req, res) => { db.prepare('SELECT 1').get(); res.json({ status: 'ok', time: Date.now() }); });
  r.get('/meta', (req, res) => res.json({ categories: CATEGORIES, locations: LOCATIONS, roles: ROLES }));
  r.get('/stats', (req, res) => {
    const n = (sql) => db.prepare(sql).get().n;
    res.json({
      active: n("SELECT COUNT(*) AS n FROM items WHERE status='active'"),
      lost: n("SELECT COUNT(*) AS n FROM items WHERE status='active' AND type='lost'"),
      found: n("SELECT COUNT(*) AS n FROM items WHERE status='active' AND type='found'"),
      returned: n("SELECT COUNT(*) AS n FROM items WHERE status='returned'"),
      users: n('SELECT COUNT(*) AS n FROM users')
    });
  });
  r.get('/map', (req, res) => {
    const rows = db.prepare("SELECT location, type, COUNT(*) AS n FROM items WHERE status='active' GROUP BY location, type").all();
    res.json({ locations: LOCATIONS.map((l) => ({
      location: l,
      lost: (rows.find((x) => x.location === l && x.type === 'lost') || { n: 0 }).n,
      found: (rows.find((x) => x.location === l && x.type === 'found') || { n: 0 }).n
    })) });
  });
  return r;
};
