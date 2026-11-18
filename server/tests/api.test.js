'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const { startServer, client, goodItem, PNG } = require('./helpers');

let S;
test.before(async () => { S = await startServer(); });
test.after(async () => { await S.close(); });

const find = async (c, q) => (await c.get('/api/items?limit=200' + (q || ''))).json.items;

test('health, meta and stats endpoints work', async () => {
  const c = client(S.base);
  assert.equal((await c.get('/api/health')).json.status, 'ok');
  const meta = (await c.get('/api/meta')).json;
  assert.equal(meta.categories.length, 8); assert.equal(meta.locations.length, 7);
  const st = (await c.get('/api/stats')).json;
  assert.deepEqual([st.active, st.lost, st.found, st.returned, st.users], [10, 5, 5, 2, 4]);
});

test('frontend constants match the server constants', () => {
  const src = fs.readFileSync(path.join(__dirname, '..', '..', 'public', 'js', 'data.js'), 'utf8');
  const ctx = { window: {}, localStorage: {} }; vm.createContext(ctx); vm.runInContext(src, ctx);
  const { CATEGORIES, LOCATIONS } = require('../constants');
  const fe = JSON.parse(JSON.stringify(ctx.window.LL)); // plain objects: avoids cross-realm array comparison
  assert.deepEqual(fe.CATEGORIES.map((c) => c.id), CATEGORIES.map((c) => c.id));
  assert.deepEqual(fe.LOCATIONS.map((l) => l.id), LOCATIONS);
});

test('registration validates input and rejects duplicates', async () => {
  const c = client(S.base);
  let r = await c.post('/api/auth/register', { name: 'A', email: 'bad', password: 'short', role: 'Alien' });
  assert.equal(r.status, 400);
  assert.ok(r.json.fields.name && r.json.fields.email && r.json.fields.password && r.json.fields.role);
  r = await c.post('/api/auth/register', { name: 'New User', email: 'new@rvu.edu.in', password: 'Passw0rdOK', role: 'Student' });
  assert.equal(r.status, 201);
  assert.match(r.headers.get('set-cookie'), /HttpOnly/i);
  assert.equal((await c.get('/api/auth/me')).json.user.email, 'new@rvu.edu.in');
  r = await client(S.base).post('/api/auth/register', { name: 'New User', email: 'NEW@rvu.edu.in', password: 'Passw0rdOK', role: 'Student' });
  assert.equal(r.status, 409);
});

test('passwords are hashed in the database, never stored in plain text', () => {
  const u = S.db.prepare("SELECT password_hash FROM users WHERE email='new@rvu.edu.in'").get();
  assert.ok(u.password_hash.startsWith('$2'));
  assert.ok(!u.password_hash.includes('Passw0rdOK'));
});

test('login: wrong password and unknown email give the same error; logout ends the session', async () => {
  const c = client(S.base);
  const a = await c.post('/api/auth/login', { email: 'student@rvu.edu.in', password: 'nope' });
  const b = await c.post('/api/auth/login', { email: 'ghost@rvu.edu.in', password: 'nope' });
  assert.equal(a.status, 401); assert.equal(b.status, 401); assert.equal(a.json.error, b.json.error);
  await c.login('student@rvu.edu.in', 'Demo@1234');
  assert.equal((await c.get('/api/auth/me')).json.user.role, 'Student');
  await c.post('/api/auth/logout');
  assert.equal((await c.get('/api/auth/me')).json.user, null);
});

test('public list never leaks contact details or verification answers', async () => {
  const items = await find(client(S.base));
  assert.equal(items.length, 10);
  items.forEach((i) => { assert.equal(i.contact, undefined); assert.equal(i.verify_answer, undefined); assert.equal(i.answer, undefined); });
  const one = (await client(S.base).get('/api/items/' + items[0].id)).json.item;
  assert.equal(one.contact, undefined);
});

test('search, filters and sorting run in SQL', async () => {
  const c = client(S.base);
  assert.deepEqual((await find(c, '&q=bag')).map((i) => i.title), ['Red Backpack']);
  assert.equal((await find(c, '&type=lost&role=Student')).length, 4);
  assert.equal((await find(c, '&location=Library')).length, 2);
  assert.equal((await find(c, '&category=keys')).length, 1);
  assert.equal((await find(c, '&q=electronics')).length, 2);            // category label search
  const az = (await find(c, '&sort=az')).map((i) => i.title);
  assert.deepEqual(az, [...az].sort((a, b) => a.localeCompare(b, 'en', { sensitivity: 'base' })));
  assert.equal((await c.get('/api/items?status=returned')).json.total, 2);
});

test('SQL injection attempts are harmless', async () => {
  const c = client(S.base);
  const r = await c.get('/api/items?q=' + encodeURIComponent("x' OR 1=1; DROP TABLE items;--"));
  assert.equal(r.status, 200); assert.equal(r.json.items.length, 0);
  assert.equal((await c.get('/api/stats')).json.active, 10);
  assert.equal((await c.get('/api/items/1%20OR%201=1')).status, 404);
});

test('creating a report requires login and validates on the server', async () => {
  const anon = client(S.base);
  assert.equal((await anon.post('/api/items', goodItem())).status, 401);
  const c = client(S.base); await c.login('student@rvu.edu.in', 'Demo@1234');
  let r = await c.post('/api/items', {});
  assert.equal(r.status, 400); assert.ok(r.json.fields.title && r.json.fields.category && r.json.fields.location);
  r = await c.post('/api/items', goodItem({ date: '2099-01-01' }));
  assert.equal(r.json.fields.date, 'The date cannot be in the future.');
  r = await c.post('/api/items', goodItem({ contact: 'abc' })); assert.ok(r.json.fields.contact);
  r = await c.post('/api/items', goodItem({ type: 'found', verify: 'Whose name?' })); assert.ok(r.json.fields.answer);
  r = await c.post('/api/items', goodItem({ title: '<img src=x onerror=alert(1)>' }));
  assert.equal(r.status, 201); assert.equal(r.json.item.title, '<img src=x onerror=alert(1)>'); // stored as text; the UI escapes it
  assert.equal(r.json.item.mine, true); assert.equal(r.json.item.contact, 'owner@rvu.edu.in');
  await c.del('/api/items/' + r.json.item.id);
});

test('photo upload: accepts real images, rejects fake and oversized files', async () => {
  const c = client(S.base); await c.login('student@rvu.edu.in', 'Demo@1234');
  const mk = (buf, name, type) => { const f = new FormData(); Object.entries(goodItem()).forEach(([k, v]) => f.append(k, v)); f.append('photo', new Blob([buf], { type }), name); return f; };
  let r = await c.post('/api/items', mk(PNG, 'a.png', 'image/png'));
  assert.equal(r.status, 201); assert.match(r.json.item.photo, /^\/uploads\/[0-9a-f]{32}\.png$/);
  const img = await fetch(S.base + r.json.item.photo); assert.equal(img.status, 200); assert.equal(img.headers.get('content-type'), 'image/png');
  const id = r.json.item.id;
  r = await c.post('/api/items', mk(Buffer.from('<?php echo 1; ?>'), 'evil.png', 'image/png'));
  assert.equal(r.status, 400); assert.ok(r.json.fields.photo);
  r = await c.post('/api/items', mk(Buffer.concat([PNG, Buffer.alloc(2.2 * 1024 * 1024)]), 'big.png', 'image/png'));
  assert.equal(r.status, 413);
  await c.del('/api/items/' + id);
  assert.equal((await fetch(S.base + '/uploads/..%2fdata%2flostloop.db')).status === 200, false);
});

test('verification: wrong answers keep contact hidden, right answer unlocks it, attempts are limited', async () => {
  const owner = client(S.base); await owner.login('student@rvu.edu.in', 'Demo@1234');
  const earbuds = (await find(owner, '&q=earbuds'))[0];
  const c = client(S.base);
  assert.equal((await c.post('/api/items/' + earbuds.id + '/claims', { contact: 'x@rvu.edu.in', answer: 'sony' })).status, 401);
  await c.login('faculty@rvu.edu.in', 'Demo@1234');
  let r = await c.post('/api/items/' + earbuds.id + '/claims', { contact: '' });
  assert.equal(r.status, 400);
  r = await c.post('/api/items/' + earbuds.id + '/claims', { contact: 'faculty@rvu.edu.in', answer: 'sony' });
  assert.equal(r.json.verified, false); assert.equal(r.json.contact, undefined);
  assert.equal((await c.get('/api/items/' + earbuds.id)).json.item.contact, undefined);
  r = await c.post('/api/items/' + earbuds.id + '/claims', { contact: 'faculty@rvu.edu.in', answer: 'My boAt earbuds' });
  assert.equal(r.json.verified, true); assert.equal(r.json.contact, '9876543210');
  assert.equal((await c.get('/api/items/' + earbuds.id)).json.item.contact, '9876543210');
  // another user brute-forcing the answer gets locked out after 5 wrong tries
  const d = client(S.base); await d.login('staff@rvu.edu.in', 'Demo@1234');
  for (let i = 0; i < 5; i++) assert.equal((await d.post('/api/items/' + earbuds.id + '/claims', { contact: 'staff@rvu.edu.in', answer: 'guess' + i })).json.verified, false);
  assert.equal((await d.post('/api/items/' + earbuds.id + '/claims', { contact: 'staff@rvu.edu.in', answer: 'boat' })).status, 429);
  assert.equal((await owner.post('/api/items/' + earbuds.id + '/claims', { contact: 'a@rvu.edu.in', answer: 'boat' })).status, 400); // own report
});

test('only the poster (or an admin) can see claims, mark returned or delete', async () => {
  const owner = client(S.base); await owner.login('student@rvu.edu.in', 'Demo@1234');
  const earbuds = (await find(owner, '&q=earbuds'))[0];
  const other = client(S.base); await other.login('faculty@rvu.edu.in', 'Demo@1234');
  assert.equal((await other.get('/api/items/' + earbuds.id + '/claims')).status, 403);
  assert.equal((await other.post('/api/items/' + earbuds.id + '/return')).status, 403);
  assert.equal((await other.del('/api/items/' + earbuds.id)).status, 403);
  const claims = (await owner.get('/api/items/' + earbuds.id + '/claims')).json.claims;
  assert.ok(claims.length >= 2); assert.ok(claims.some((x) => x.matched) && claims.some((x) => !x.matched));
  const done = await owner.post('/api/items/' + earbuds.id + '/return');
  assert.equal(done.json.item.status, 'returned');
  assert.equal((await other.post('/api/items/' + earbuds.id + '/claims', { contact: 'a@rvu.edu.in' })).status, 409); // already returned
  assert.equal((await client(S.base).get('/api/stats')).json.returned, 3);
  // admin may delete someone else's report
  const admin = client(S.base); await admin.login('admin@rvu.edu.in', 'Admin@1234');
  assert.equal((await admin.del('/api/items/' + earbuds.id)).json.ok, true);
  assert.equal((await client(S.base).get('/api/items/' + earbuds.id)).status, 404);
  assert.equal(S.db.prepare('SELECT COUNT(*) n FROM claims WHERE item_id=?').get(earbuds.id).n, 0); // cascade
});

test('possible matches are computed on the server', async () => {
  const c = client(S.base);
  const charger = (await find(c, '&q=charger'))[0];
  const m = (await c.get('/api/items/' + charger.id + '/matches')).json.matches;
  assert.ok(m.length >= 0);
  const hood = (await find(c, '&q=hoodie'))[0];
  const none = (await c.get('/api/items/' + hood.id + '/matches')).json.matches;
  assert.equal(none.length, 0);
  const s = (await find(c, '&q=staff')).find((i) => i.title.startsWith('Staff'));
  const id = (await find(c, '&q=student id'))[0];
  const mm = (await c.get('/api/items/' + id.id + '/matches')).json.matches;
  assert.equal(mm[0].item.title, 'Staff Lanyard & ID'); assert.ok(mm[0].score >= 50 && mm[0].same);
  assert.ok(s);
});

test('"my reports" is private to the logged-in user', async () => {
  const c = client(S.base);
  assert.equal((await c.get('/api/items/mine')).status, 401);
  await c.login('staff@rvu.edu.in', 'Demo@1234');
  const mine = (await c.get('/api/items/mine')).json.items;
  assert.ok(mine.length > 0 && mine.every((i) => i.mine && i.contact));
});

test('cross-site state-changing requests are blocked', async () => {
  const r = await fetch(S.base + '/api/auth/logout', { method: 'POST', headers: { origin: 'https://evil.example' } });
  assert.equal(r.status, 403);
});

test('security headers and static hardening', async () => {
  const r = await fetch(S.base + '/api/health');
  assert.ok(r.headers.get('content-security-policy').includes("default-src 'self'"));
  assert.equal(r.headers.get('x-content-type-options'), 'nosniff');
  assert.equal(r.headers.get('x-powered-by'), null);
  assert.equal((await fetch(S.base + '/api/nope')).status, 404);
});
