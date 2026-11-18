'use strict';
const fs = require('fs');
const os = require('os');
const path = require('path');
const { createApp } = require('../app');
const { seedIfEmpty } = require('../seed');

/** Starts a fresh server on a random port with a temporary database. */
async function startServer() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'lostloop-test-'));
  const app = createApp({ dbPath: path.join(dir, 'test.db'), dataDir: dir, uploadDir: path.join(dir, 'uploads'), rateLimit: false });
  seedIfEmpty(app.locals.db);
  const server = await new Promise((r) => { const s = app.listen(0, () => r(s)); });
  const base = 'http://127.0.0.1:' + server.address().port;
  return { base, dir, db: app.locals.db, close: () => new Promise((r) => server.close(r)) };
}

/** Tiny HTTP client that keeps cookies, like a browser session. */
function client(base) {
  let cookie = '';
  async function call(method, url, body, extra = {}) {
    const headers = { ...(extra.headers || {}) };
    if (cookie) headers.cookie = cookie;
    let payload = body;
    if (body && !(body instanceof FormData)) { headers['content-type'] = 'application/json'; payload = JSON.stringify(body); }
    const res = await fetch(base + url, { method, headers, body: payload, redirect: 'manual' });
    const sc = res.headers.getSetCookie ? res.headers.getSetCookie() : [];
    sc.forEach((c) => { const kv = c.split(';')[0]; if (kv.endsWith('=')) cookie = ''; else cookie = kv; });
    let json = null; try { json = await res.json(); } catch (e) { /* not JSON */ }
    return { status: res.status, json, headers: res.headers };
  }
  return {
    get: (u, e) => call('GET', u, null, e), post: (u, b, e) => call('POST', u, b, e), del: (u, e) => call('DELETE', u, null, e),
    login: async (email, password) => { const r = await call('POST', '/api/auth/login', { email, password }); if (r.status !== 200) throw new Error('login failed ' + email); return r; }
  };
}
const goodItem = (o = {}) => ({ type: 'lost', category: 'books', title: 'Physics Notebook', location: 'Library', date: new Date().toISOString().slice(0, 10),
  desc: 'Green cover notebook with a name on the first page.', contact: 'owner@rvu.edu.in', ...o });

// 1x1 PNG
const PNG = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==', 'base64');
module.exports = { startServer, client, goodItem, PNG };
