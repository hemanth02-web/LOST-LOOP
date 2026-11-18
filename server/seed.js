'use strict';
const bcrypt = require('bcryptjs');

const DAY = 86400000;
const daysAgo = (n) => { const d = new Date(); d.setHours(12, 0, 0, 0); d.setDate(d.getDate() - n); return d.toISOString().slice(0, 10); };

const USERS = [
  ['Sample Student', 'student@rvu.edu.in', 'Demo@1234', 'Student', 0],
  ['Sample Faculty', 'faculty@rvu.edu.in', 'Demo@1234', 'Faculty', 0],
  ['Sample Staff', 'staff@rvu.edu.in', 'Demo@1234', 'Staff', 0],
  ['Admin', 'admin@rvu.edu.in', 'Admin@1234', 'Staff', 1]
];
// [owner email, type, category, title, location, description, contact, verify question, answer, daysAgo, status]
const ITEMS = [
  ['faculty@rvu.edu.in', 'lost', 'electronics', 'Faculty Laptop Charger', 'Main Block', 'Black 65W Dell charger with a white tag reading "Dept CSE" near the plug. Left in a classroom after a lecture.', 'faculty@rvu.edu.in', '', '', 1],
  ['student@rvu.edu.in', 'found', 'electronics', 'Wireless Earbuds', 'Library', 'White earbuds in a charging case, found on a reading table on the second floor.', '9876543210', 'Which brand is printed inside the lid?', 'boat', 1],
  ['student@rvu.edu.in', 'lost', 'id', 'Student ID Card', 'Cafeteria', 'RV University ID card in a transparent holder with a green lanyard. Photo of a student with glasses.', 'student@rvu.edu.in', '', '', 2],
  ['staff@rvu.edu.in', 'found', 'id', 'Staff Lanyard & ID', 'Cafeteria', 'Navy lanyard with a staff ID card, left near the billing counter.', '9845012345', 'Which department is printed on the card?', 'admin', 2],
  ['student@rvu.edu.in', 'lost', 'bags', 'Red Backpack', 'Sports Ground', 'Red 25L backpack with a football keychain. Contains a notebook, water bottle and a pair of studs.', '9900112233', '', '', 3],
  ['staff@rvu.edu.in', 'found', 'keys', 'Bike Key with Yellow Tag', 'Main Gate & Parking', 'Single two-wheeler key with a yellow rubber tag, found beside the parking gate.', '9741012345', 'What is written on the tag?', 'ka 09', 3],
  ['student@rvu.edu.in', 'lost', 'books', 'Data Structures Textbook', 'Library', 'Thick blue-cover book with sticky notes on many pages and a name written on the first page.', 'student@rvu.edu.in', '', '', 4],
  ['faculty@rvu.edu.in', 'found', 'accessories', 'Silver Wrist Watch', 'Auditorium', 'Analog silver watch with a brown strap found under a seat after the seminar.', 'faculty@rvu.edu.in', 'What is the dial colour?', 'black', 5],
  ['student@rvu.edu.in', 'lost', 'clothing', 'Grey Hoodie', 'Hostel Block', 'Grey zip-up hoodie, size M, with a small university logo. Left on the common-room sofa.', '9611122334', '', '', 6],
  ['student@rvu.edu.in', 'found', 'other', 'Steel Water Bottle', 'Sports Ground', 'Dark green insulated 1L bottle with a dented base and a sticker of a mountain.', '9632145870', 'Which sticker is on it?', 'mountain', 7],
  ['student@rvu.edu.in', 'lost', 'accessories', 'Black Spectacles Case', 'Main Block', 'Hard black case with prescription spectacles inside. Returned to the owner by a friend.', '9500011122', '', '', 9, 'returned'],
  ['staff@rvu.edu.in', 'found', 'bags', 'Blue Laptop Sleeve', 'Library', 'Padded 14-inch sleeve, handed to the library desk and collected by the owner.', 'staff@rvu.edu.in', 'What is inside the front pocket?', 'pen', 10, 'returned']
];

function seed(db) {
  const insU = db.prepare('INSERT INTO users (name, email, password_hash, role, is_admin, created_at) VALUES (?,?,?,?,?,?)');
  const insI = db.prepare(`INSERT INTO items (user_id, type, category, title, description, location, date, contact, verify_question, verify_answer, photo, status, created_at, returned_at)
    VALUES (?,?,?,?,?,?,?,?,?,?, '', ?, ?, ?)`);
  const ids = {};
  db.transaction(() => {
    USERS.forEach(([n, e, p, r, a]) => { ids[e] = insU.run(n, e, bcrypt.hashSync(p, 10), r, a, Date.now()).lastInsertRowid; });
    ITEMS.forEach(([owner, type, cat, title, loc, desc, contact, vq, va, ago, status], i) => {
      const created = Date.now() - ago * DAY - i * 3600000;
      insI.run(ids[owner], type, cat, title, desc, loc, daysAgo(ago), contact, vq, va, status || 'active', created, status === 'returned' ? Date.now() - (ago - 4) * DAY : null);
    });
  })();
}

function seedIfEmpty(db) {
  if (db.prepare('SELECT COUNT(*) AS n FROM users').get().n > 0) return false;
  seed(db);
  return true;
}

if (require.main === module) {
  const path = require('path');
  const fs = require('fs');
  const { openDb } = require('./db');
  const dataDir = process.env.DATA_DIR || path.join(__dirname, '..', 'data');
  const file = path.join(dataDir, 'lostloop.db');
  if (process.argv.includes('--reset')) for (const s of ['', '-wal', '-shm']) fs.rmSync(file + s, { force: true });
  const db = openDb(file);
  console.log(seedIfEmpty(db) ? 'Database seeded with sample data.' : 'Database already has data (use --reset to wipe it).');
}
module.exports = { seed, seedIfEmpty };
