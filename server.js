'use strict';

// dotenv MUST be loaded before any src/ modules read process.env
if (process.env.NODE_ENV !== 'production') {
  require('dotenv').config();
}

const express = require('express');

// Opens/creates bot.db and runs CREATE TABLE IF NOT EXISTS for all tables
require('./src/db/init');

const { runCrawl, scheduleCrawl } = require('./src/crawler/scraper');
const { verify } = require('./src/webhook/verify');
const { handle } = require('./src/webhook/handler');

const app = express();
app.use(express.json());

app.get('/webhook',  verify);
app.post('/webhook', handle);

app.get('/health', (_req, res) =>
  res.json({ status: 'ok', ts: new Date().toISOString() })
);

const PORT = process.env.PORT || 3000;

app.listen(PORT, async () => {
  console.log(`[server] WhatsApp bot running on port ${PORT}`);
  await runCrawl();
  scheduleCrawl();
});
