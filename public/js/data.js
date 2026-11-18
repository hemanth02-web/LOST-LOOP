/* LostLoop: UI constants (icons and tints). Allowed values are enforced on the server;
   a test checks that these ids match server/constants.js. */
(function (w) {
  'use strict';
  var CATEGORIES = [
    { id: 'id',          label: 'ID & Cards',  icon: '🪪', tint: '#dbe7ff' },
    { id: 'books',       label: 'Books',       icon: '📚', tint: '#ffe9c7' },
    { id: 'bags',        label: 'Bags',        icon: '🎒', tint: '#ffd9d9' },
    { id: 'keys',        label: 'Keys',        icon: '🔑', tint: '#fff3b8' },
    { id: 'electronics', label: 'Electronics', icon: '🎧', tint: '#d8d4ff' },
    { id: 'clothing',    label: 'Clothing',    icon: '🧥', tint: '#d4f1e4' },
    { id: 'accessories', label: 'Accessories', icon: '⌚', tint: '#f9d9f0' },
    { id: 'other',       label: 'Other',       icon: '📦', tint: '#e3e8f0' }
  ];
  /* x,y are positions on the SVG campus map (viewBox 0 0 800 520). */
  var LOCATIONS = [
    { id: 'Main Block',          x: 400, y: 190, icon: '🏛️' },
    { id: 'Library',             x: 230, y: 150, icon: '📖' },
    { id: 'Cafeteria',           x: 585, y: 150, icon: '☕' },
    { id: 'Auditorium',          x: 590, y: 300, icon: '🎤' },
    { id: 'Sports Ground',       x: 220, y: 330, icon: '⚽' },
    { id: 'Hostel Block',        x: 400, y: 410, icon: '🛏️' },
    { id: 'Main Gate & Parking', x: 130, y: 450, icon: '🚪' }
  ];
  var ROLES = ['Student', 'Faculty', 'Staff'];
  var THEME = 'lostloop.theme';
  var Prefs = {
    getTheme: function () { try { return localStorage.getItem(THEME); } catch (e) { return null; } },
    setTheme: function (t) { try { localStorage.setItem(THEME, t); } catch (e) { /* ignore */ } }
  };
  w.LL = { CATEGORIES: CATEGORIES, LOCATIONS: LOCATIONS, ROLES: ROLES, Prefs: Prefs };
})(window);
