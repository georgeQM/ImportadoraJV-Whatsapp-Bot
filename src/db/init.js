'use strict';

const Database = require('better-sqlite3');
const path = require('path');

const DB_PATH = path.join(__dirname, '..', '..', 'bot.db');

const db = new Database(DB_PATH);

db.pragma('journal_mode = WAL');

db.exec(`
  CREATE TABLE IF NOT EXISTS conversations (
    id         INTEGER PRIMARY KEY AUTOINCREMENT,
    phone      TEXT    NOT NULL,
    role       TEXT    NOT NULL,
    content    TEXT    NOT NULL,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  );

  CREATE TABLE IF NOT EXISTS sessions (
    phone       TEXT PRIMARY KEY,
    last_active DATETIME NOT NULL,
    escalated   INTEGER  DEFAULT 0
  );

  CREATE TABLE IF NOT EXISTS crawl_cache (
    id         INTEGER PRIMARY KEY,
    content    TEXT    NOT NULL,
    crawled_at DATETIME DEFAULT CURRENT_TIMESTAMP
  );
`);

console.log('[db] SQLite initialized at', DB_PATH);

module.exports = db;
