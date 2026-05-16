'use strict';

const db = require('./init');

// ── conversations ─────────────────────────────

const stmtAddMessage = db.prepare(
  'INSERT INTO conversations (phone, role, content) VALUES (?, ?, ?)'
);

function addMessage(phone, role, content) {
  stmtAddMessage.run(phone, role, content);
}

const stmtGetHistory = db.prepare(
  `SELECT role, content
   FROM conversations
   WHERE phone = ?
   ORDER BY created_at DESC
   LIMIT ?`
);

function getHistory(phone, limit = 20) {
  return stmtGetHistory.all(phone, limit).reverse();
}

// ── sessions ──────────────────────────────────

const stmtGetSession = db.prepare(
  'SELECT phone, last_active, escalated FROM sessions WHERE phone = ?'
);

function getSession(phone) {
  return stmtGetSession.get(phone);
}

const stmtUpsertSession = db.prepare(`
  INSERT INTO sessions (phone, last_active, escalated)
  VALUES (?, datetime('now'), 0)
  ON CONFLICT(phone) DO UPDATE SET
    last_active = excluded.last_active
`);

function upsertSession(phone) {
  stmtUpsertSession.run(phone);
}

const stmtMarkEscalated = db.prepare(
  'UPDATE sessions SET escalated = 1 WHERE phone = ?'
);

function markEscalated(phone) {
  stmtMarkEscalated.run(phone);
}

// ── crawl_cache ───────────────────────────────

const stmtGetCachedContent = db.prepare(
  'SELECT content FROM crawl_cache WHERE id = 1'
);

function getCachedContent() {
  const row = stmtGetCachedContent.get();
  return row ? row.content : null;
}

const stmtUpsertCrawlCache = db.prepare(`
  INSERT INTO crawl_cache (id, content, crawled_at)
  VALUES (1, ?, datetime('now'))
  ON CONFLICT(id) DO UPDATE SET
    content    = excluded.content,
    crawled_at = excluded.crawled_at
`);

function upsertCrawlCache(content) {
  stmtUpsertCrawlCache.run(content);
}

module.exports = {
  addMessage,
  getHistory,
  getSession,
  upsertSession,
  markEscalated,
  getCachedContent,
  upsertCrawlCache,
};
