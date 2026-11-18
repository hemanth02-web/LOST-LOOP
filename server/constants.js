'use strict';
// Single source of truth for allowed values. The frontend (public/js/data.js) mirrors these ids;
// a test checks that the two lists stay identical.
const CATEGORIES = [
  { id: 'id', label: 'ID & Cards' }, { id: 'books', label: 'Books' }, { id: 'bags', label: 'Bags' },
  { id: 'keys', label: 'Keys' }, { id: 'electronics', label: 'Electronics' }, { id: 'clothing', label: 'Clothing' },
  { id: 'accessories', label: 'Accessories' }, { id: 'other', label: 'Other' }
];
const LOCATIONS = ['Main Block', 'Library', 'Cafeteria', 'Auditorium', 'Sports Ground', 'Hostel Block', 'Main Gate & Parking'];
const ROLES = ['Student', 'Faculty', 'Staff'];
module.exports = { CATEGORIES, LOCATIONS, ROLES };
