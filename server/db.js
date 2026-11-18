'use strict';
const fs = require('fs');
const path = require('path');
const Database = require('better-sqlite3');

const SCHEMA = `
CREATE TABLE IF NOT EXISTS users (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  name          TEXT    NOT NULL,
  email         TEXT    NOT NULL UNIQUE COLLATE NOCASE,
  password_hash TEXT    NOT NULL,
  role          TEXT    NOT NULL CHECK (role IN ('Student','Faculty','Staff')),
  is_admin      INTEGER NOT NULL DEFAULT 0,
  created_at    INTEGER NOT NULL
);
CREATE TABLE IF NOT EXISTS items (
  id              INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id         INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  type            TEXT    NOT NULL CHECK (type IN ('lost','found')),
  category        TEXT    NOT NULL,
  title           TEXT    NOT NULL,
  description     TEXT    NOT NULL,
  location        TEXT    NOT NULL,
  date            TEXT    NOT NULL,
  contact         TEXT    NOT NULL,
  verify_question TEXT    NOT NULL DEFAULT '',
  verify_answer   TEXT    NOT NULL DEFAULT '',
  photo           TEXT    NOT NULL DEFAULT '',
  status          TEXT    NOT NULL DEFAULT 'active' CHECK (status IN ('active','returned')),
  created_at      INTEGER NOT NULL,
  returned_at     INTEGER
);
CREATE TABLE IF NOT EXISTS claims (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  item_id    INTEGER NOT NULL REFERENCES items(id) ON DELETE CASCADE,
  user_id    INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  name       TEXT    NOT NULL,
  contact    TEXT    NOT NULL,
  answer     TEXT,
  matched    INTEGER NOT NULL DEFAULT 0,
  created_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_items_status_type ON items(status, type);
CREATE INDEX IF NOT EXISTS idx_items_category    ON items(category);
CREATE INDEX IF NOT EXISTS idx_items_location    ON items(location);
CREATE INDEX IF NOT EXISTS idx_items_user        ON items(user_id);
CREATE INDEX IF NOT EXISTS idx_claims_item_user  ON claims(item_id, user_id);
`;

function openDb(file) {
  if (file !== ':memory:') fs.mkdirSync(path.dirname(file), { recursive: true });
  const db = new Database(file);
  db.pragma('journal_mode = WAL');
  db.pragma('foreign_keys = ON');
  db.exec(SCHEMA);
  return db;
}
module.exports = { openDb };
