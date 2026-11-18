(function () {
  'use strict';
  var slides = Array.prototype.slice.call(document.querySelectorAll('.slide'));
  var dots = document.getElementById('dots'), count = document.getElementById('count');
  var cur = 0;

  slides.forEach(function (s, i) {
    var b = document.createElement('button');
    b.setAttribute('aria-label', 'Go to slide ' + (i + 1) + ': ' + s.dataset.title);
    b.addEventListener('click', function () { go(i); });
    dots.appendChild(b);
  });

  function go(n) {
    cur = Math.max(0, Math.min(slides.length - 1, n));
    slides.forEach(function (s, i) {
      s.classList.toggle('active', i === cur);
      s.classList.toggle('past', i < cur);
    });
    Array.prototype.forEach.call(dots.children, function (d, i) { d.classList.toggle('on', i === cur); });
    count.textContent = (cur + 1) + ' / ' + slides.length;
    try { history.replaceState(null, '', '#' + (cur + 1)); } catch (e) {}
  }

  document.getElementById('next').addEventListener('click', function () { go(cur + 1); });
  document.getElementById('prev').addEventListener('click', function () { go(cur - 1); });
  document.addEventListener('keydown', function (e) {
    if (e.key === 'ArrowRight' || e.key === 'PageDown' || e.key === ' ') { e.preventDefault(); go(cur + 1); }
    else if (e.key === 'ArrowLeft' || e.key === 'PageUp') { e.preventDefault(); go(cur - 1); }
    else if (e.key === 'Home') go(0);
    else if (e.key === 'End') go(slides.length - 1);
    else if (e.key === 't' || e.key === 'T') toggleTheme();
    else if (e.key === 'f' || e.key === 'F') toggleFs();
  });
  /* fixed 16:9 canvas, scaled to fit; rotated on portrait screens so phones get the landscape deck */
  var frame = document.getElementById('frame'), rotated = false;
  function fit() {
    var W = window.innerWidth, H = window.innerHeight;
    rotated = H > W * 1.05;
    var s = rotated ? Math.min(H / 1600, W / 900) : Math.min(W / 1600, H / 900);
    frame.style.transform = 'translate(-50%,-50%)' + (rotated ? ' rotate(90deg)' : '') + ' scale(' + s + ')';
  }
  window.addEventListener('resize', fit); window.addEventListener('orientationchange', function () { setTimeout(fit, 200); });
  fit();
  var tx = null, ty = null;
  document.addEventListener('touchstart', function (e) {
    if (e.target.closest && e.target.closest('.gtabs')) { tx = null; return; }
    tx = e.touches[0].clientX; ty = e.touches[0].clientY;
  }, { passive: true });
  document.addEventListener('touchend', function (e) {
    if (tx === null) return;
    var dx = e.changedTouches[0].clientX - tx, dy = e.changedTouches[0].clientY - ty; tx = null;
    var along = rotated ? dy : dx, across = rotated ? dx : dy;   /* swipe along the slide's horizontal axis */
    if (Math.abs(along) > 50 && Math.abs(along) > Math.abs(across) * 1.3) go(cur + (along < 0 ? 1 : -1));
  });
  var wheelLock = false;
  document.addEventListener('wheel', function (e) {
    var sl = slides[cur]; if (sl.scrollHeight > sl.clientHeight + 4) return;
    if (wheelLock || Math.abs(e.deltaY) < 30) return;
    wheelLock = true; go(cur + (e.deltaY > 0 ? 1 : -1)); setTimeout(function () { wheelLock = false; }, 900);
  }, { passive: true });

  /* theme */
  var themeBtn = document.getElementById('themeBtn');
  function setTheme(t) {
    document.documentElement.setAttribute('data-theme', t);
    themeBtn.textContent = t === 'dark' ? '☀ Light' : '☾ Dark';
    try { localStorage.setItem('ll-deck-theme', t); } catch (e) {}
  }
  function toggleTheme() { setTheme(document.documentElement.getAttribute('data-theme') === 'dark' ? 'light' : 'dark'); }
  themeBtn.addEventListener('click', toggleTheme);
  var saved = null; try { saved = localStorage.getItem('ll-deck-theme'); } catch (e) {}
  setTheme(saved || (window.matchMedia && matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light'));

  /* fullscreen */
  function toggleFs() {
    if (!document.fullscreenElement) { try { var pr = document.documentElement.requestFullscreen && document.documentElement.requestFullscreen(); if (pr && pr.then) pr.then(function () { try { var o = screen.orientation && screen.orientation.lock && screen.orientation.lock('landscape'); if (o && o.catch) o.catch(function () {}); } catch (e) {} }, function () {}); } catch (e) {} }
    else if (document.exitFullscreen) document.exitFullscreen();
  }
  document.getElementById('fsBtn').addEventListener('click', toggleFs);

  /* 3D tilt on cards */
  var reduce = window.matchMedia && matchMedia('(prefers-reduced-motion: reduce)').matches;
  if (!reduce) {
    Array.prototype.forEach.call(document.querySelectorAll('.card,.member'), function (c) {
      c.classList.add('tilt');
      c.addEventListener('mousemove', function (e) {
        var r = c.getBoundingClientRect(), x = (e.clientX - r.left) / r.width - 0.5, y = (e.clientY - r.top) / r.height - 0.5;
        c.style.transform = 'perspective(800px) rotateY(' + (x * 14) + 'deg) rotateX(' + (-y * 14) + 'deg) translateZ(10px)';
      });
      c.addEventListener('mouseleave', function () { c.style.transform = ''; });
    });
    /* parallax on title orb */
    var orb = document.querySelector('.orb');
    if (orb) document.addEventListener('mousemove', function (e) {
      var x = e.clientX / innerWidth - 0.5, y = e.clientY / innerHeight - 0.5;
      orb.style.transform = 'rotateY(' + (x * 18) + 'deg) rotateX(' + (-y * 18) + 'deg)';
    });
  }


  /* architecture: request flow */
  (function () {
    var nodes = Array.prototype.slice.call(document.querySelectorAll('#flow .node'));
    if (!nodes.length) return;
    var info = document.querySelector('.flowinfo'), T = document.getElementById('fiT'), P = document.getElementById('fiP'), N = document.getElementById('fiNum');
    var data = [
      ['Browser sends a request', 'The page calls fetch("/api/items") in JavaScript. No page reload.'],
      ['Server checks and routes', 'Express verifies the login cookie, rate limit and input, then runs the route.'],
      ['Database answers', 'SQLite returns only safe fields. Contacts and answers stay hidden.']
    ];
    var i = 0, timer = null;
    function show(n) {
      i = n;
      nodes.forEach(function (x, k) { x.classList.toggle('on', k === n); });
      T.textContent = data[n][0]; P.textContent = data[n][1]; N.textContent = n + 1;
      info.classList.remove('swap'); void info.offsetWidth; info.classList.add('swap');
    }
    function auto() { clearInterval(timer); timer = setInterval(function () { if (nodes[0].closest('.slide').classList.contains('active')) show((i + 1) % 3); }, 3200); }
    nodes.forEach(function (b, k) { b.addEventListener('click', function () { show(k); auto(); }); });
    show(0); auto();
  })();

  /* screens gallery */
  (function () {
    var tabs = Array.prototype.slice.call(document.querySelectorAll('.gtab')), imgs = Array.prototype.slice.call(document.querySelectorAll('.gimg'));
    if (!tabs.length) return;
    var T = document.getElementById('gT'), D = document.getElementById('gD');
    function show(n) {
      tabs.forEach(function (t, k) { t.classList.toggle('on', k === n); });
      imgs.forEach(function (m, k) { m.classList.toggle('on', k === n); });
      T.textContent = imgs[n].dataset.t; D.textContent = imgs[n].dataset.d;
    }
    tabs.forEach(function (t, k) { t.addEventListener('click', function () { show(k); }); });
    show(0);
  })();

  var start = parseInt((location.hash || '').replace('#', ''), 10);
  go(isNaN(start) ? 0 : start - 1);
})();
