/* LostLoop – frontend. Talks to the Express/SQLite backend through the REST API under /api. */
(function () {
  'use strict';

  var CATS = LL.CATEGORIES, LOCS = LL.LOCATIONS, ROLES = LL.ROLES, Prefs = LL.Prefs;
  var me = null;                       // logged-in user or null
  var filters = { tab: 'all', cat: 'all', loc: 'all', role: 'all', q: '', sort: 'new' };
  var browseBuilt = false, photoBlob = null, afterLogin = null, routeToken = 0, searchTimer = null, boardToken = 0;
  var reduceMotion = window.matchMedia && matchMedia('(prefers-reduced-motion: reduce)').matches;

  /* ---------- helpers ---------- */
  function $(s, r) { return (r || document).querySelector(s); }
  function $$(s, r) { return Array.prototype.slice.call((r || document).querySelectorAll(s)); }
  function esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }
  function cat(id) { return CATS.filter(function (c) { return c.id === id; })[0] || CATS[CATS.length - 1]; }
  function fmtDate(d) {
    var x = new Date(d + 'T12:00:00');
    return isNaN(x) ? d : x.toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' });
  }
  function ago(ts) {
    var m = Math.round((Date.now() - ts) / 60000);
    if (m < 1) return 'just now';
    if (m < 60) return m + ' min ago';
    var h = Math.round(m / 60);
    if (h < 24) return h + ' h ago';
    var d = Math.round(h / 24);
    return d + (d === 1 ? ' day ago' : ' days ago');
  }
  function today() { var d = new Date(); return d.getFullYear() + '-' + ('0' + (d.getMonth() + 1)).slice(-2) + '-' + ('0' + d.getDate()).slice(-2); }
  function isEmail(s) { return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(s); }
  function isPhone(s) { return /^\d{10,12}$/.test(String(s).replace(/[\s+\-()]/g, '')); }

  function toast(msg, kind) {
    var t = document.createElement('div');
    t.className = 'toast ' + (kind || '');
    t.textContent = msg;
    $('#toasts').appendChild(t);
    setTimeout(function () { t.remove(); }, 3800);
  }

  /* ---------- API client ---------- */
  function api(method, url, body) {
    var opt = { method: method, headers: {}, credentials: 'same-origin' };
    if (body instanceof FormData) opt.body = body;
    else if (body) { opt.headers['Content-Type'] = 'application/json'; opt.body = JSON.stringify(body); }
    return fetch(url, opt).then(function (res) {
      setStatus(true);
      return res.json().catch(function () { return {}; }).then(function (j) {
        if (!res.ok) { var e = new Error(j.error || 'Request failed'); e.status = res.status; e.fields = j.fields || {}; throw e; }
        return j;
      });
    }, function () {
      setStatus(false);
      var e = new Error('Cannot reach the server. Is it running?'); e.network = true; throw e;
    });
  }
  function setStatus(ok) {
    var s = $('#apiStatus'); if (!s) return;
    s.className = ok ? 'ok' : 'down';
    s.textContent = ok ? 'Server connected' : 'Server not reachable';
  }
  function fail(e) { if (e && e.status !== 401) toast(e.message || 'Something went wrong.', 'bad'); }
  function loadingHTML() { return '<div class="wrap"><div class="loading">Loading…</div></div>'; }
  function errorHTML(e) { return '<div class="wrap"><div class="banner" role="alert">' + esc(e.message || 'Something went wrong.') + '</div></div>'; }

  /* ---------- card ---------- */
  function cardHTML(it) {
    var c = cat(it.category);
    var img = it.photo ? '<img src="' + esc(it.photo) + '" alt="Photo of ' + esc(it.title) + '" loading="lazy">' : '<span aria-hidden="true">' + c.icon + '</span>';
    var tag = it.status === 'returned' ? '<span class="badge ret">Returned ✓</span>' : (it.mine ? '<span class="badge mine">Your report</span>' : '');
    return '<button type="button" class="card" data-id="' + it.id + '" aria-label="' + esc(it.type + ': ' + it.title + ', ' + it.location) + '">' +
      '<div class="card-img" style="background:' + c.tint + '"><span class="badge ' + esc(it.type) + '">' + esc(it.type) + '</span>' + tag + img + '</div>' +
      '<div class="card-body"><h3>' + esc(it.title) + '</h3><p>' + esc(it.desc) + '</p>' +
      '<div class="meta"><span>📍 ' + esc(it.location) + '</span><span>🗓 ' + fmtDate(it.date) + '</span>' +
      '<span class="role ' + esc(it.role) + '">' + esc(it.role) + '</span></div></div></button>';
  }

  /* ---------- views ---------- */
  var views = {};

  views.home = function (el, token) {
    el.innerHTML = loadingHTML();
    return Promise.all([api('GET', '/api/stats'), api('GET', '/api/items?limit=6')]).then(function (r) {
      if (token !== routeToken) return;
      var st = r[0], recent = r[1].items;
      el.innerHTML = '<div class="wrap">' +
        '<div class="hero"><div><span class="eyebrow">Your campus. Your community.</span>' +
        '<h1>Lost something? <em>Let\'s bring it back.</em></h1>' +
        '<p class="lead">LostLoop is one central place for RV University to report lost belongings, post what you found and reconnect items with their owners, safely.</p>' +
        '<div class="hero-cta"><button class="btn btn-primary" data-open-report="lost">😟 I lost something</button>' +
        '<button class="btn btn-ghost" data-open-report="found">😊 I found something</button></div>' +
        '<p class="muted" style="font-size:.9rem;margin:0">Free for students, faculty and staff. Sign up with your email to post.</p></div>' +
        '<div class="hero-art"><img src="assets/hero.png" alt="Two students returning a lost backpack on campus">' +
        '<div class="float f1">🔑 Keys returned today</div><div class="float f2">✅ ' + st.returned + ' items reunited</div></div></div>' +
        '<div class="stats" aria-label="Live statistics">' +
        '<div class="stat"><b data-count="' + st.active + '">0</b><span>Active listings</span></div>' +
        '<div class="stat s-lost"><b data-count="' + st.lost + '">0</b><span>Items reported lost</span></div>' +
        '<div class="stat s-found"><b data-count="' + st.found + '">0</b><span>Items found</span></div>' +
        '<div class="stat s-ret"><b data-count="' + st.returned + '">0</b><span>Returned to owners</span></div></div>' +
        '<div class="section-head"><h2>Latest on the board</h2><a href="#/browse">See all items →</a></div>' +
        '<div class="grid">' + (recent.map(cardHTML).join('') || '<div class="empty" style="grid-column:1/-1">Nothing reported yet. Be the first!</div>') + '</div>' +
        '<div class="section-head"><h2>How LostLoop works</h2><a href="#/how">Learn more →</a></div>' +
        '<div class="steps">' +
        '<div class="step"><div class="num">1</div><h3>Post a report</h3><p>Log in, then tell us what was lost or found, where and when. Add a photo if you have one.</p></div>' +
        '<div class="step"><div class="num">2</div><h3>Search &amp; match</h3><p>Browse the board or open an item to see possible matches ranked by category, place and keywords.</p></div>' +
        '<div class="step"><div class="num">3</div><h3>Reconnect safely</h3><p>Verify the owner, meet in a public campus spot and mark the item returned.</p></div></div></div>';
      animateCounts(el);
    });
  };

  function animateCounts(el) {
    $$('[data-count]', el).forEach(function (n) {
      var end = +n.dataset.count;
      if (reduceMotion || end === 0) { n.textContent = end; return; }
      var t0 = performance.now(), dur = 700;
      (function tick(t) {
        var p = Math.min(1, (t - t0) / dur);
        n.textContent = Math.round(end * (1 - Math.pow(1 - p, 3)));
        if (p < 1) requestAnimationFrame(tick);
      })(t0);
    });
  }

  views.browse = function (el) {
    if (!browseBuilt) {
      el.innerHTML = '<div class="wrap"><div class="page-head"><span class="eyebrow">Campus item board</span><h1>Browse lost &amp; found items</h1>' +
        '<p>Search by item, place or category. Results come straight from the LostLoop database.</p></div>' +
        '<div class="filters"><div class="f-row">' +
        '<div class="search"><svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" aria-hidden="true"><circle cx="11" cy="11" r="7"/><path d="m20 20-3.5-3.5"/></svg>' +
        '<input id="q" type="text" placeholder="Search items, places, categories…" aria-label="Search items" autocomplete="off"></div>' +
        '<div class="tabs" role="group" aria-label="Item type">' +
        '<button type="button" data-tab="all" aria-pressed="true">All</button><button type="button" data-tab="lost" aria-pressed="false">Lost</button><button type="button" data-tab="found" aria-pressed="false">Found</button></div></div>' +
        '<div class="chips" role="group" aria-label="Category" id="chips"></div>' +
        '<div class="f-row"><select id="fLoc" aria-label="Location"></select>' +
        '<select id="fRole" aria-label="Posted by"><option value="all">Students, Faculty &amp; Staff</option>' + ROLES.map(function (r) { return '<option>' + r + '</option>'; }).join('') + '</select>' +
        '<select id="fSort" aria-label="Sort"><option value="new">Newest first</option><option value="old">Oldest first</option><option value="az">Name A–Z</option></select>' +
        '<button type="button" class="btn btn-ghost btn-sm" id="clearF">Clear filters</button></div></div>' +
        '<div class="count-line"><span id="countLine"></span></div><div id="boardBanner"></div><div class="grid" id="boardGrid"></div></div>';
      $('#chips').innerHTML = '<button type="button" class="chip" data-cat="all" aria-pressed="true">All categories</button>' +
        CATS.map(function (c) { return '<button type="button" class="chip" data-cat="' + c.id + '" aria-pressed="false">' + c.icon + ' ' + c.label + '</button>'; }).join('');
      $('#fLoc').innerHTML = '<option value="all">All campus locations</option>' + LOCS.map(function (l) { return '<option>' + esc(l.id) + '</option>'; }).join('');
      browseBuilt = true;
    }
    syncFilterUI();
    return loadBoard();
  };

  function syncFilterUI() {
    $('#q').value = filters.q; $('#fLoc').value = filters.loc; $('#fRole').value = filters.role; $('#fSort').value = filters.sort;
    $$('[data-tab]').forEach(function (b) { b.setAttribute('aria-pressed', b.dataset.tab === filters.tab); });
    $$('[data-cat]').forEach(function (b) { b.setAttribute('aria-pressed', b.dataset.cat === filters.cat); });
  }

  function loadBoard() {
    var token = ++boardToken;
    var p = ['limit=200', 'sort=' + filters.sort];
    if (filters.tab !== 'all') p.push('type=' + filters.tab);
    if (filters.cat !== 'all') p.push('category=' + encodeURIComponent(filters.cat));
    if (filters.loc !== 'all') p.push('location=' + encodeURIComponent(filters.loc));
    if (filters.role !== 'all') p.push('role=' + encodeURIComponent(filters.role));
    if (filters.q.trim()) p.push('q=' + encodeURIComponent(filters.q.trim()));
    return Promise.all([api('GET', '/api/items?' + p.join('&')), api('GET', '/api/stats')]).then(function (r) {
      if (token !== boardToken || !$('#boardGrid')) return;
      $('#boardBanner').innerHTML = '';
      var list = r[0].items;
      $('#countLine').textContent = 'Showing ' + list.length + ' of ' + r[1].active + ' active listings';
      $('#boardGrid').innerHTML = list.length ? list.map(cardHTML).join('') :
        '<div class="empty" style="grid-column:1/-1"><div class="big">🔍</div><h3>No items match these filters</h3><p>Try fewer filters, or report the item so others can find it.</p>' +
        '<button class="btn btn-primary" data-open-report>+ Report an item</button></div>';
    }).catch(function (e) { if (token === boardToken && $('#boardBanner')) $('#boardBanner').innerHTML = '<div class="banner" role="alert">' + esc(e.message) + '</div>'; });
  }

  views.map = function (el, token) {
    el.innerHTML = loadingHTML();
    return api('GET', '/api/map').then(function (r) {
      if (token !== routeToken) return;
      var counts = {}; r.locations.forEach(function (l) { counts[l.location] = l; });
      var svg = '<svg viewBox="0 0 800 520" role="img" aria-label="Illustrated campus map with item counts at each location">' +
        '<defs><pattern id="grass" width="16" height="16" patternUnits="userSpaceOnUse"><rect width="16" height="16" fill="#d9f0df"/><circle cx="4" cy="5" r="1.2" fill="#bfe3c9"/><circle cx="11" cy="11" r="1.2" fill="#bfe3c9"/></pattern></defs>' +
        '<rect width="800" height="520" rx="16" fill="url(#grass)"/>' +
        '<path d="M20 450 L140 450 L400 300 L400 520 M400 300 L700 200 M400 300 L220 240 M400 300 L400 120 M590 150 L590 300 M230 150 L230 330" stroke="#f4f1e6" stroke-width="22" fill="none" stroke-linecap="round" stroke-linejoin="round"/>' +
        '<path d="M20 450 L140 450 L400 300 M400 300 L700 200 M400 300 L220 240 M400 300 L400 120" stroke="#e3dcc4" stroke-width="2" stroke-dasharray="8 8" fill="none"/>' +
        '<rect x="150" y="270" width="150" height="120" rx="60" fill="#c4e8cd" stroke="#a6d6b2" stroke-width="3"/>' +
        '<text x="225" y="335" text-anchor="middle" font-size="13" fill="#3d7a52" font-weight="700">FIELD</text>' +
        LOCS.map(function (l) {
          var c = counts[l.id] || { lost: 0, found: 0 }, cl = c.lost, cf = c.found;
          return '<g class="pin" tabindex="0" role="button" data-loc="' + esc(l.id) + '" aria-label="' + esc(l.id + ': ' + cl + ' lost, ' + cf + ' found') + '">' +
            '<circle class="pin-bg" cx="' + l.x + '" cy="' + l.y + '" r="30" fill="#fff" stroke="#3b5bff" stroke-width="3"/>' +
            '<text x="' + l.x + '" y="' + (l.y + 9) + '" text-anchor="middle" font-size="26">' + l.icon + '</text>' +
            '<text x="' + l.x + '" y="' + (l.y + 54) + '" text-anchor="middle" font-size="14" font-weight="700" fill="#0f1f3d" stroke="#fff" stroke-width="4" paint-order="stroke">' + esc(l.id) + '</text>' +
            (cl ? '<circle cx="' + (l.x - 24) + '" cy="' + (l.y - 24) + '" r="12" fill="#e5484d"/><text x="' + (l.x - 24) + '" y="' + (l.y - 19) + '" text-anchor="middle" font-size="13" font-weight="700" fill="#fff">' + cl + '</text>' : '') +
            (cf ? '<circle cx="' + (l.x + 24) + '" cy="' + (l.y - 24) + '" r="12" fill="#12a150"/><text x="' + (l.x + 24) + '" y="' + (l.y - 19) + '" text-anchor="middle" font-size="13" font-weight="700" fill="#fff">' + cf + '</text>' : '') +
            '</g>';
        }).join('') + '</svg>';
      el.innerHTML = '<div class="wrap"><div class="page-head"><span class="eyebrow">Where things go missing</span><h1>Campus map</h1>' +
        '<p>Counts are calculated by the database. Red pins are lost items, green pins are found items. Select a place to open its listings.</p></div>' +
        '<div class="map-layout"><div class="map-box">' + svg + '</div><div class="loc-list">' +
        LOCS.map(function (l) {
          var c = counts[l.id] || { lost: 0, found: 0 };
          return '<button type="button" class="loc-item" data-loc="' + esc(l.id) + '"><span>' + l.icon + ' <b>' + esc(l.id) + '</b></span>' +
            '<span class="n"><span class="pill l">' + c.lost + ' lost</span><span class="pill f">' + c.found + ' found</span></span></button>';
        }).join('') + '</div></div></div>';
    });
  };

  views.returned = function (el, token) {
    el.innerHTML = loadingHTML();
    return api('GET', '/api/items?status=returned&limit=100').then(function (r) {
      if (token !== routeToken) return;
      el.innerHTML = '<div class="wrap"><div class="page-head"><span class="eyebrow">Success wall</span><h1>Items that found their way home</h1>' +
        '<p>Every card here is a loop closed. Thank you to the finders and owners who made it happen.</p></div>' +
        '<div class="wall-hero"><b>' + r.total + '</b><div><strong style="font-size:1.2rem">items reunited with their owners</strong><p>Be someone\'s lucky find: if you spot something, post it.</p></div></div>' +
        '<div class="grid">' + (r.items.map(cardHTML).join('') || '<div class="empty" style="grid-column:1/-1"><div class="big">🎉</div><p>No returns yet. The first one will appear here.</p></div>') + '</div></div>';
    });
  };

  views.mine = function (el, token) {
    if (!me) {
      el.innerHTML = '<div class="wrap"><div class="empty"><div class="big">🔐</div><h3>Log in to see your reports</h3><p>Your reports, claims and handovers are linked to your account.</p>' +
        '<button class="btn btn-primary" data-open-auth="login">Log in</button></div></div>';
      return Promise.resolve();
    }
    el.innerHTML = loadingHTML();
    return api('GET', '/api/items/mine').then(function (r) {
      if (token !== routeToken) return;
      el.innerHTML = '<div class="wrap"><div class="page-head"><span class="eyebrow">Your account</span><h1>My reports</h1>' +
        '<p>Signed in as <b>' + esc(me.name) + '</b> (' + esc(me.role) + '). Open a report to see claims, mark it returned or delete it.</p></div>' +
        '<div class="grid">' + (r.items.map(cardHTML).join('') || '<div class="empty" style="grid-column:1/-1"><div class="big">📝</div><p>You have not posted anything yet.</p><button class="btn btn-primary" data-open-report>+ Report an item</button></div>') + '</div></div>';
    });
  };

  views.how = function (el) {
    el.innerHTML = '<div class="wrap"><div class="page-head"><span class="eyebrow">Simple by design</span><h1>How LostLoop works</h1><p>Three steps from "oh no" to "thank you", with safety built into every handover.</p></div>' +
      '<div class="steps">' +
      '<div class="step"><div class="num">1</div><h3>Post a report</h3><p>Log in, choose <b>I lost something</b> or <b>I found something</b>, pick a category and campus location, add a date, details and an optional photo. The server validates everything before saving it.</p></div>' +
      '<div class="step"><div class="num">2</div><h3>Browse &amp; match</h3><p>Search and filter the board. Opening an item shows <b>possible matches</b> from the opposite side, ranked by the server by category, place, keywords and date.</p></div>' +
      '<div class="step"><div class="num">3</div><h3>Verify &amp; return</h3><p>Claimants answer a verification question set by the finder. The server checks the answer and reveals contact details only after a correct one. The poster then marks the item returned.</p></div></div>' +
      '<div class="two" style="margin-top:28px"><div class="panel"><h3>🛡️ Safe handover checklist</h3><ul>' +
      '<li>Meet in a public campus spot such as the security desk or library counter.</li>' +
      '<li>Ask the owner to describe the item before you show it.</li>' +
      '<li>Do not share OTPs, passwords or card details, ever.</li>' +
      '<li>Hand valuables (ID cards, phones, wallets) to the campus security desk if unsure.</li>' +
      '<li>Mark the item <b>Returned</b> so the board stays accurate.</li></ul></div>' +
      '<div class="panel"><h3>🔎 How matching works</h3><p class="muted">For every report the server compares it with active reports of the opposite type:</p><ul>' +
      '<li><b>+50</b> same category (required)</li><li><b>+25</b> same campus location</li><li><b>+6 per keyword</b> shared in title and details (max 18)</li><li><b>+7</b> if reported within 3 days of each other</li></ul>' +
      '<p class="muted" style="margin-top:10px">Items scoring 50 or more are suggested.</p></div></div>' +
      '<div class="section-head"><h2>Frequently asked questions</h2></div><div class="faq">' +
      '<details><summary>Do I need an account?</summary><p>You can browse without one. To post, claim an item or manage a report you need a free account (name, email, password and role).</p></details>' +
      '<details><summary>Who can see my contact details?</summary><p>Only you and people who pass your verification question. They are never included in the public list. The server enforces this, not the page.</p></details>' +
      '<details><summary>Is my password safe?</summary><p>Passwords are hashed with bcrypt before they reach the database, and you stay signed in through a secure, HTTP-only cookie.</p></details>' +
      '<details><summary>Where is the data stored?</summary><p>In a SQLite database on the LostLoop server. Photos are stored on the server as well, and shown only as images.</p></details></div></div>';
  };

  views.about = function (el) {
    var team = [['Mary Sherin', 'RVUM26BCA034'], ['Hemanth Suresh', 'RVUM26BCA074'], ['Sarthak Belliappa', 'RVUM26BCA064'], ['Aromal P', 'RVUM26BCA072']];
    el.innerHTML = '<div class="wrap"><div class="page-head"><span class="eyebrow">About the project</span><h1>Built for RV University</h1>' +
      '<p>LostLoop is the mini project of Group 9 for the course Web &amp; UX Design (CS1385), BCA Section A, RV University, Mysuru, academic year 2026–2027.</p></div>' +
      '<div class="two"><div class="panel"><h3>The problem</h3><p class="muted">ID cards, books, bags, keys and electronics are lost every week in classrooms, the library, the cafeteria and the grounds. When something is found there is no single place to publish it, and word of mouth is easily missed.</p>' +
      '<h3>Our solution</h3><p class="muted" style="margin:0">One central website backed by a real server and database, where anyone with an account can report, search and match lost and found items, with verified, privacy-aware handovers.</p></div>' +
      '<img src="assets/team.png" alt="Illustration of a student team working together" style="border-radius:20px;max-height:340px;margin:auto"></div>' +
      '<div class="section-head"><h2>The team</h2></div><div class="team">' +
      team.map(function (t) {
        var ini = t[0].split(' ').map(function (w) { return w[0]; }).slice(0, 2).join('');
        return '<div class="member"><div class="avatar" aria-hidden="true">' + ini + '</div><h3>' + t[0] + '</h3><p>' + t[1] + '</p><p>BCA Section A</p></div>';
      }).join('') + '</div>' +
      '<p class="muted" style="margin-top:14px">Faculty / course coordinator: <b>Ms. Chaitra M</b>, Web &amp; UX Design.</p>' +
      '<div class="section-head"><h2>What is inside</h2></div><div class="two" style="align-items:start">' +
      '<div class="panel"><h3>Features</h3><ul><li>Accounts with hashed passwords and cookie sessions</li><li>Validated reports with photo upload, checked again on the server</li><li>Server-side search, filters and sorting over a SQLite database</li><li>Possible-match engine computed by the API</li><li>Verification question: contact unlocks only after a correct answer</li><li>Owner-only claims list, mark-returned and delete</li><li>Campus map, success wall, dark mode, responsive layout</li></ul></div>' +
      '<div class="panel"><h3>Built with</h3><div class="tech"><span>HTML5</span><span>CSS3</span><span>JavaScript</span><span>Node.js</span><span>Express</span><span>SQLite</span><span>bcrypt</span><span>REST API</span></div>' +
      '<p class="muted" style="margin-top:14px">Frontend files are served by the same Express server that exposes the <code>/api</code> endpoints.</p>' +
      '<div class="tip"><b>Demo accounts</b> (password <b>Demo@1234</b>): student@rvu.edu.in, faculty@rvu.edu.in, staff@rvu.edu.in.</div></div></div></div>';
  };

  /* ---------- routing ---------- */
  var ROUTES = ['home', 'browse', 'map', 'returned', 'mine', 'how', 'about'];
  function route() {
    var h = location.hash.replace(/^#\/?/, '');
    var name = h.split('?')[0] || 'home';
    if (ROUTES.indexOf(name) < 0) name = 'home';
    var token = ++routeToken;
    $$('.view').forEach(function (v) { v.hidden = v.id !== 'view-' + name; });
    var p = views[name]($('#view-' + name), token);
    if (p && p.catch) p.catch(function (e) { if (token === routeToken) $('#view-' + name).innerHTML = errorHTML(e); });
    $$('.nav a').forEach(function (a) { a.classList.toggle('active', a.dataset.route === name); });
    $('#nav').classList.remove('open');
    $('#menuBtn').setAttribute('aria-expanded', 'false');
    document.title = (name === 'home' ? '' : cap(name) + ' · ') + 'LostLoop – Campus Lost & Found Portal';
    if (!window.__noScroll) window.scrollTo(0, 0);
    return p;
  }
  function cap(s) { return { how: 'How it works', browse: 'Browse items', map: 'Campus map', mine: 'My reports' }[s] || s.charAt(0).toUpperCase() + s.slice(1); }
  function refresh() { return route(); }
  function go(h) { if (location.hash === h) route(); else location.hash = h; }

  /* ---------- account UI ---------- */
  function renderAuthArea() {
    var a = $('#authArea');
    if (me) {
      a.innerHTML = '<span class="who">Hi, <b>' + esc(me.name.split(' ')[0]) + '</b></span><button class="btn btn-ghost btn-sm" id="logoutBtn" type="button">Log out</button>';
    } else {
      a.innerHTML = '<button class="btn btn-ghost btn-sm" type="button" data-open-auth="login">Log in</button><button class="btn btn-ghost btn-sm hide-sm" type="button" data-open-auth="register">Sign up</button>';
    }
    $('#navMine').hidden = !me;
  }

  var authDlg = $('#authDlg'), authForm = $('#authForm'), authMode = 'login';
  function setAuthMode(mode) {
    authMode = mode;
    $$('[data-auth-tab]').forEach(function (b) { b.setAttribute('aria-pressed', b.dataset.authTab === mode); });
    $$('.reg-only', authForm).forEach(function (e) { e.hidden = mode !== 'register'; });
    $('#authTitle').textContent = mode === 'register' ? 'Create your account' : 'Log in';
    $('#authSubmit').textContent = mode === 'register' ? 'Sign up' : 'Log in';
    $('#demoHint').hidden = mode === 'register';
    $('#a-pass').setAttribute('autocomplete', mode === 'register' ? 'new-password' : 'current-password');
    clearErrors(authForm); $('#authErr').textContent = '';
  }
  function openAuth(mode, then) {
    afterLogin = then || null;
    authForm.reset(); setAuthMode(mode || 'login');
    if (!authDlg.open) authDlg.showModal();
    setTimeout(function () { $(mode === 'register' ? '#a-name' : '#a-email').focus(); }, 50);
  }
  function submitAuth(e) {
    e.preventDefault();
    clearErrors(authForm); $('#authErr').textContent = '';
    var f = authForm.elements, body = { email: f.email.value.trim(), password: f.password.value }, bad = false;
    if (authMode === 'register') { body.name = f.name.value.trim(); body.role = f.role.value; }
    if (authMode === 'register' && body.name.length < 2) { setErr(authForm, 'name', 'Enter your full name.'); bad = true; }
    if (!isEmail(body.email)) { setErr(authForm, 'email', 'Enter a valid email address.'); bad = true; }
    if (!body.password) { setErr(authForm, 'password', 'Enter your password.'); bad = true; }
    else if (authMode === 'register' && (body.password.length < 8 || !/[a-zA-Z]/.test(body.password) || !/\d/.test(body.password))) { setErr(authForm, 'password', 'At least 8 characters, with a letter and a number.'); bad = true; }
    if (bad) return;
    var btn = $('#authSubmit'); btn.disabled = true;
    api('POST', '/api/auth/' + authMode, body).then(function (r) {
      me = r.user; renderAuthArea(); authDlg.close();
      toast(authMode === 'register' ? 'Welcome to LostLoop, ' + me.name.split(' ')[0] + '!' : 'Logged in as ' + me.name + '.', 'ok');
      var next = afterLogin; afterLogin = null;
      if (next) next(); else refresh();
    }).catch(function (err) {
      var shown = false;
      Object.keys(err.fields || {}).forEach(function (k) { setErr(authForm, k, err.fields[k]); shown = true; });
      if (!shown || err.status === 401) $('#authErr').textContent = err.message;
    }).then(function () { btn.disabled = false; });
  }
  function logout() {
    api('POST', '/api/auth/logout').catch(function () {}).then(function () {
      me = null; renderAuthArea(); toast('Logged out.');
      if (location.hash === '#/mine') go('#/'); else refresh();
    });
  }

  /* ---------- form helpers ---------- */
  function clearErrors(form) {
    $$('[data-err]', form).forEach(function (p) { p.textContent = ''; });
    $$('.invalid', form).forEach(function (e) { e.classList.remove('invalid'); });
  }
  function setErr(form, key, msg) {
    var p = $('[data-err="' + key + '"]', form); if (p) p.textContent = msg;
    var f = form.elements[key]; if (f && f.classList) f.classList.add('invalid');
  }

  /* ---------- report dialog ---------- */
  var reportDlg = $('#reportDlg'), form = $('#reportForm');
  function buildForm() {
    $('#catPick').innerHTML = CATS.map(function (c) {
      return '<label><input type="radio" name="category" value="' + c.id + '"><span><i>' + c.icon + '</i>' + c.label + '</span></label>';
    }).join('');
    $('#f-location').innerHTML = '<option value="">Select a campus location</option>' + LOCS.map(function (l) { return '<option>' + esc(l.id) + '</option>'; }).join('');
  }
  function formType() { return form.elements.type.value; }
  function syncType() {
    var t = formType();
    $('#locLabel').textContent = t === 'lost' ? 'Where did you lose it?' : 'Where did you find it?';
    $('#verifyField').hidden = t !== 'found';
    $('#reportTitle').textContent = t === 'lost' ? 'Report a lost item' : 'Report a found item';
  }
  function openReport(type) {
    if (!me) { openAuth('login', function () { openReport(type); }); toast('Please log in to post a report.'); return; }
    form.reset(); clearErrors(form);
    photoBlob = null; $('#photoPrev').hidden = true;
    form.elements.type.value = type === 'found' ? 'found' : 'lost';
    $('#f-date').value = today(); $('#f-date').max = today();
    $('#f-contact').value = me.email;
    $('#postingAs').textContent = 'Posting as ' + me.name + ' (' + me.role + ').';
    $('#descCount').textContent = '0 / 240';
    syncType();
    if (!reportDlg.open) reportDlg.showModal();
    setTimeout(function () { $('#f-title').focus(); }, 50);
  }
  function validate() {
    clearErrors(form);
    var f = form.elements, ok = true, first = null;
    function bad(key, msg) { setErr(form, key, msg); ok = false; if (!first) first = key; }
    if (!f.category.value) bad('category', 'Choose a category.');
    if (f.title.value.trim().length < 3) bad('title', 'Enter an item name (at least 3 characters).');
    if (!f.location.value) bad('location', 'Select a campus location.');
    if (!f.date.value) bad('date', 'Pick a date.'); else if (f.date.value > today()) bad('date', 'The date cannot be in the future.');
    if (f.desc.value.trim().length < 10) bad('desc', 'Add a few details (at least 10 characters).');
    if (formType() === 'found' && f.verify.value.trim() && !f.answer.value.trim()) bad('answer', 'Add the answer to your verification question.');
    var c = f.contact.value.trim();
    if (!(isEmail(c) || isPhone(c))) bad('contact', 'Enter a valid email or a 10-digit phone number.');
    if (first) { var el = form.elements[first]; if (el && el.focus) el.focus(); else { var r = $('#catPick input'); if (r) r.focus(); } }
    return ok;
  }
  function resizeImage(file, cb) {
    var rd = new FileReader();
    rd.onload = function () {
      var img = new Image();
      img.onload = function () {
        var s = Math.min(1, 640 / Math.max(img.width, img.height)), cv = document.createElement('canvas');
        cv.width = Math.round(img.width * s); cv.height = Math.round(img.height * s);
        cv.getContext('2d').drawImage(img, 0, 0, cv.width, cv.height);
        cv.toBlob(function (b) { cb(b); }, 'image/jpeg', 0.78);
      };
      img.onerror = function () { cb(null); };
      img.src = rd.result;
    };
    rd.onerror = function () { cb(null); };
    rd.readAsDataURL(file);
  }
  function submitReport(e) {
    e.preventDefault();
    if (!validate()) return;
    var f = form.elements, fd = new FormData();
    ['type', 'category', 'title', 'location', 'date', 'desc', 'contact'].forEach(function (k) { fd.append(k, f[k].value.trim ? f[k].value.trim() : f[k].value); });
    if (formType() === 'found') { fd.append('verify', f.verify.value.trim()); fd.append('answer', f.answer.value.trim()); }
    if (photoBlob) fd.append('photo', photoBlob, 'photo.jpg');
    var btn = $('button[type=submit]', form); btn.disabled = true;
    api('POST', '/api/items', fd).then(function (r) {
      reportDlg.close();
      filters = { tab: 'all', cat: 'all', loc: 'all', role: 'all', q: '', sort: 'new' };
      toast('Report posted! It is now on the board.', 'ok');
      window.__noScroll = true;
      var p = location.hash === '#/browse' ? refresh() : (go('#/browse'), new Promise(function (res) { setTimeout(res, 350); }));
      window.__noScroll = false;
      Promise.resolve(p).then(function () {
        setTimeout(function () {
          var card = $('.card[data-id="' + r.item.id + '"]');
          if (card) { card.scrollIntoView({ behavior: reduceMotion ? 'auto' : 'smooth', block: 'center' }); card.style.outline = '3px solid var(--blue)'; setTimeout(function () { card.style.outline = ''; }, 2200); }
        }, 120);
      });
    }).catch(function (err) {
      if (err.status === 401) { me = null; renderAuthArea(); reportDlg.close(); openAuth('login'); toast('Your session expired. Please log in again.', 'bad'); return; }
      var any = false;
      Object.keys(err.fields || {}).forEach(function (k) { setErr(form, k, err.fields[k]); any = true; });
      if (!any) toast(err.message, 'bad');
    }).then(function () { btn.disabled = false; });
  }

  /* ---------- item detail ---------- */
  var itemDlg = $('#itemDlg'), current = null;
  function openItem(id) {
    Promise.all([api('GET', '/api/items/' + id), api('GET', '/api/items/' + id + '/matches')]).then(function (r) {
      var it = r[0].item, claims = null;
      var owner = it.mine || (me && me.isAdmin);
      return (owner ? api('GET', '/api/items/' + id + '/claims').then(function (c) { return c.claims; }, function () { return null; }) : Promise.resolve(null)).then(function (cl) {
        current = { item: it, matches: r[1].matches, claims: cl };
        renderItem();
        if (!itemDlg.open) itemDlg.showModal();
        $('#itemBody').scrollTop = 0;
      });
    }).catch(fail);
  }

  function renderItem() {
    var it = current.item, matches = current.matches, c = cat(it.category), owner = it.mine || (me && me.isAdmin);
    var img = it.photo ? '<img src="' + esc(it.photo) + '" alt="Photo of ' + esc(it.title) + '">' : '<span aria-hidden="true">' + c.icon + '</span>';
    var html = '<div class="d-hero" style="background:' + c.tint + '">' + img +
      '<button type="button" class="icon-btn d-close" data-close aria-label="Close">✕</button></div>' +
      '<div class="d-main"><div><span class="badge ' + esc(it.type) + '" style="position:static;display:inline-block">' + esc(it.type) + '</span>' +
      (it.status === 'returned' ? ' <span class="badge ret" style="position:static;display:inline-block">Returned ✓</span>' : '') +
      (it.mine ? ' <span class="badge mine" style="position:static;display:inline-block">Your report</span>' : '') + '</div>' +
      '<h2 id="itemTitle">' + esc(it.title) + '</h2><p style="margin:0">' + esc(it.desc) + '</p>' +
      '<dl class="facts"><dt>Category</dt><dd>' + c.icon + ' ' + esc(c.label) + '</dd>' +
      '<dt>' + (it.type === 'lost' ? 'Lost at' : 'Found at') + '</dt><dd>📍 ' + esc(it.location) + '</dd>' +
      '<dt>Date</dt><dd>' + fmtDate(it.date) + '</dd>' +
      '<dt>Posted by</dt><dd>' + esc(it.name) + ' <span class="role ' + esc(it.role) + '">' + esc(it.role) + '</span> · ' + ago(it.createdAt) + '</dd>' +
      '<dt>Contact</dt><dd>' + (it.contact ? '<b>' + esc(it.contact) + '</b>' : '<span class="muted">🔒 Hidden until a claim is verified</span>') + '</dd></dl></div>';

    if (it.status === 'active') {
      html += '<div class="d-sec"><h3>✨ Possible matches</h3>' +
        (matches.length ? matches.map(function (x) {
          var cc = cat(x.item.category);
          return '<button type="button" class="match" data-id="' + x.item.id + '"><span class="em">' + cc.icon + '</span><span><b>' + esc(x.item.title) + '</b>' +
            (x.same ? '<span class="same">Same place</span>' : '') + '<small>' + esc(x.item.type) + ' · ' + esc(x.item.location) + ' · ' + esc(x.reasons.join(', ')) + '</small></span><span class="sc">' + x.score + '% match</span></button>';
        }).join('') : '<p class="muted" style="margin:0">No matches yet. We will keep looking as new reports arrive.</p>') + '</div>';

      if (!it.mine) {
        html += '<div class="d-sec"><h3>' + (it.type === 'found' ? '🙋 Is this yours?' : '🙌 Did you find this?') + '</h3>';
        if (it.contact) html += '<div class="tip">Contact unlocked. <b>Safety tip:</b> meet at a public campus spot such as the security desk, and ask the owner to describe the item before handing it over.</div>';
        else if (!me) html += '<p class="muted" style="margin:0">Log in to respond. This lets the poster know who is asking.</p><div><button class="btn btn-primary btn-sm" type="button" data-open-auth="login" data-resume="' + it.id + '">Log in to continue</button></div>';
        else html += '<form class="inline-form" id="claimForm" novalidate>' +
          (it.type === 'found' && it.verify ? '<div class="field"><label for="c-ans">Verification: ' + esc(it.verify) + '</label><input id="c-ans" name="answer" type="text" maxlength="60" autocomplete="off"><p class="err" data-err="answer"></p></div>' : '') +
          '<div class="field"><label for="c-contact">Your email or phone (so the poster can reach you)</label><input id="c-contact" name="contact" type="text" maxlength="60" value="' + esc(me.email) + '"><p class="err" data-err="contact"></p></div>' +
          '<p class="err" id="claimErr"></p><div><button class="btn btn-primary btn-sm" type="submit">' + (it.type === 'found' ? 'Claim this item' : 'I found this item') + '</button></div></form>';
        html += '</div>';
      }
    }

    if (owner) {
      var cl = current.claims || [];
      html += '<div class="d-sec"><h3>🔐 Manage this report</h3><p class="muted" style="margin:0">' + (it.status === 'active' ? 'Mark it returned once it is back with its owner.' : 'This report is closed.') + '</p>' +
        '<div class="claims">' + (cl.length ? cl.map(function (k) {
          return '<div class="claim"><b>' + esc(k.name) + '</b> · ' + esc(k.contact) + '<br><span class="muted">' + ago(k.createdAt) + (k.answer ? ' · answered “' + esc(k.answer) + '” ' + (k.matched ? '✅ matches' : '❌ does not match') : (k.matched ? ' · ✅ responded' : '')) + '</span></div>';
        }).join('') : '<div class="claim muted">No claims or responses yet.</div>') + '</div>' +
        '<div class="inline-row" style="flex-wrap:wrap">' + (it.status === 'active' ? '<button class="btn btn-green btn-sm" type="button" id="retBtn">✓ Mark as returned</button>' : '') +
        '<button class="btn btn-danger btn-sm" type="button" id="delBtn">Delete report</button></div></div>';
    }
    html += '<div class="d-actions"><button type="button" class="btn btn-ghost" data-close>Close</button></div>';
    $('#itemBody').innerHTML = html;
  }

  function submitClaim(e) {
    e.preventDefault();
    var it = current.item, f = e.target, body = { contact: f.elements.contact.value.trim() };
    clearErrors(f); $('#claimErr').textContent = '';
    if (f.elements.answer) body.answer = f.elements.answer.value.trim();
    var btn = $('button[type=submit]', f); btn.disabled = true;
    api('POST', '/api/items/' + it.id + '/claims', body).then(function (r) {
      if (r.verified) { toast('Verified! Contact details unlocked.', 'ok'); openItem(it.id); }
      else {
        toast('That answer does not match. The poster has been notified of the attempt.', 'bad');
        $('#claimErr').textContent = 'That answer does not match. Try again with more detail.';
        if (f.elements.answer) f.elements.answer.focus();
      }
    }).catch(function (err) {
      var any = false;
      Object.keys(err.fields || {}).forEach(function (k) { setErr(f, k, err.fields[k]); any = true; });
      if (!any) $('#claimErr').textContent = err.message;
      if (err.status === 401) { me = null; renderAuthArea(); }
    }).then(function () { btn.disabled = false; });
  }

  /* ---------- confetti ---------- */
  function confetti() {
    if (reduceMotion) return;
    var cv = $('#confetti'), ctx = cv.getContext('2d');
    cv.width = innerWidth; cv.height = innerHeight;
    var cols = ['#3b5bff', '#17a673', '#f5a524', '#e5484d', '#8a5cff'], ps = [];
    for (var i = 0; i < 140; i++) ps.push({ x: innerWidth / 2, y: innerHeight * 0.55, vx: (Math.random() - 0.5) * 16, vy: -Math.random() * 15 - 4, s: 5 + Math.random() * 6, c: cols[i % 5], r: Math.random() * 6, vr: (Math.random() - 0.5) * 0.4 });
    var t0 = performance.now();
    (function frame(t) {
      ctx.clearRect(0, 0, cv.width, cv.height);
      ps.forEach(function (p) { p.vy += 0.38; p.x += p.vx; p.y += p.vy; p.r += p.vr; ctx.save(); ctx.translate(p.x, p.y); ctx.rotate(p.r); ctx.fillStyle = p.c; ctx.fillRect(-p.s / 2, -p.s / 2, p.s, p.s * 0.6); ctx.restore(); });
      if (t - t0 < 2600) requestAnimationFrame(frame); else ctx.clearRect(0, 0, cv.width, cv.height);
    })(t0);
  }

  /* ---------- theme ---------- */
  function applyTheme(t) {
    document.documentElement.setAttribute('data-theme', t);
    $('#themeBtn').setAttribute('aria-label', t === 'dark' ? 'Switch to light mode' : 'Switch to dark mode');
    var m = $('meta[name=theme-color]'); if (m) m.content = t === 'dark' ? '#0a1424' : '#0f1f3d';
  }

  /* ---------- events ---------- */
  document.addEventListener('click', function (e) {
    var t = e.target;
    var open = t.closest('[data-open-report]');
    if (open) { e.preventDefault(); if (itemDlg.open) itemDlg.close(); openReport(open.getAttribute('data-open-report')); return; }
    var oa = t.closest('[data-open-auth]');
    if (oa) {
      var resume = oa.getAttribute('data-resume');
      if (itemDlg.open) itemDlg.close();
      openAuth(oa.getAttribute('data-open-auth'), resume ? function () { refresh(); openItem(resume); } : null); return;
    }
    var closeBtn = t.closest('[data-close]');
    if (closeBtn) { var d = closeBtn.closest('dialog'); if (d) d.close(); return; }
    var at = t.closest('[data-auth-tab]'); if (at) { setAuthMode(at.dataset.authTab); return; }
    var pin = t.closest('.pin[data-loc], .loc-item[data-loc]');
    if (pin) { filters = { tab: 'all', cat: 'all', loc: pin.dataset.loc, role: 'all', q: '', sort: 'new' }; go('#/browse'); return; }
    var tab = t.closest('[data-tab]'); if (tab) { filters.tab = tab.dataset.tab; syncFilterUI(); loadBoard(); return; }
    var chip = t.closest('[data-cat]'); if (chip) { filters.cat = chip.dataset.cat; syncFilterUI(); loadBoard(); return; }
    var card = t.closest('.card[data-id], .match[data-id]');
    if (card) { openItem(card.dataset.id); return; }
    if (t.id === 'clearF') { filters = { tab: 'all', cat: 'all', loc: 'all', role: 'all', q: '', sort: 'new' }; syncFilterUI(); loadBoard(); return; }
    if (t.id === 'logoutBtn') { logout(); return; }
    if (t.id === 'retBtn') {
      api('POST', '/api/items/' + current.item.id + '/return').then(function () {
        itemDlg.close(); confetti(); toast('Marked as returned. Thank you for closing the loop! 🎉', 'ok'); refresh();
      }).catch(fail); return;
    }
    if (t.id === 'delBtn') {
      if (t.dataset.sure) {
        api('DELETE', '/api/items/' + current.item.id).then(function () { itemDlg.close(); toast('Report deleted.'); refresh(); }).catch(fail);
      } else {
        t.dataset.sure = '1'; t.textContent = 'Click again to confirm delete';
        setTimeout(function () { if (t.isConnected) { delete t.dataset.sure; t.textContent = 'Delete report'; } }, 3500);
      }
      return;
    }
    if (t.id === 'photoClear') { photoBlob = null; $('#f-photo').value = ''; $('#photoPrev').hidden = true; return; }
  });

  document.addEventListener('input', function (e) {
    var t = e.target;
    if (t.id === 'q') { filters.q = t.value; clearTimeout(searchTimer); searchTimer = setTimeout(loadBoard, 250); }
    if (t.id === 'f-desc') $('#descCount').textContent = t.value.length + ' / 240';
    if (t.classList && t.classList.contains('invalid')) t.classList.remove('invalid');
  });
  document.addEventListener('change', function (e) {
    var t = e.target;
    if (t.id === 'fLoc') { filters.loc = t.value; loadBoard(); }
    if (t.id === 'fRole') { filters.role = t.value; loadBoard(); }
    if (t.id === 'fSort') { filters.sort = t.value; loadBoard(); }
    if (t.name === 'type' && form.contains(t)) syncType();
    if (t.id === 'f-photo') {
      var file = t.files && t.files[0];
      if (!file) return;
      var perr = $('[data-err="photo"]', form); perr.textContent = '';
      if (!/^image\//.test(file.type)) { perr.textContent = 'Please choose an image file.'; t.value = ''; return; }
      if (file.size > 12 * 1024 * 1024) { perr.textContent = 'Image is larger than 12 MB.'; t.value = ''; return; }
      resizeImage(file, function (blob) {
        if (!blob) { perr.textContent = 'Could not read that image.'; return; }
        photoBlob = blob; $('#photoPrev img').src = URL.createObjectURL(blob); $('#photoPrev').hidden = false;
      });
    }
  });
  document.addEventListener('submit', function (e) { if (e.target.id === 'claimForm') submitClaim(e); });
  form.addEventListener('submit', submitReport);
  authForm.addEventListener('submit', submitAuth);
  document.addEventListener('keydown', function (e) {
    if ((e.key === 'Enter' || e.key === ' ') && e.target.matches && e.target.matches('.pin')) { e.preventDefault(); e.target.dispatchEvent(new MouseEvent('click', { bubbles: true })); }
  });
  $$('dialog').forEach(function (d) { d.addEventListener('click', function (e) { if (e.target === d) d.close(); }); });
  $('#themeBtn').addEventListener('click', function () {
    var n = document.documentElement.getAttribute('data-theme') === 'dark' ? 'light' : 'dark';
    applyTheme(n); Prefs.setTheme(n);
  });
  $('#menuBtn').addEventListener('click', function () {
    var o = $('#nav').classList.toggle('open'); this.setAttribute('aria-expanded', o);
  });
  window.addEventListener('hashchange', route);

  /* ---------- start ---------- */
  buildForm();
  applyTheme(Prefs.getTheme() || (window.matchMedia && matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light'));
  renderAuthArea();
  api('GET', '/api/auth/me').then(function (r) { me = r.user; }, function () { me = null; }).then(function () { renderAuthArea(); route(); });
})();
