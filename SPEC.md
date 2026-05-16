# SPEC.md — ImportadoraJV WhatsApp Bot v2

## Overview

Complete rewrite of the v1 stateful menu bot into an AI-powered conversational agent.
Natural language, no numbered menus, context-aware, 24/7 operation.
Same stack: Node.js + Express. Deployed on Railway.

---

## Tech Stack

| Layer | Choice | Reason |
|---|---|---|
| Runtime | Node.js + Express | Same as v1, no migration cost |
| AI | OpenAI GPT-4o-mini | Cheap (~$0.15/1M tokens), fast, good Spanish |
| Database | SQLite via `better-sqlite3` | Free, embedded, no extra Railway service |
| Web scraping | `cheerio` + `axios` | Lightweight, no headless browser needed |
| HTTP client | `axios` | Already used in v1 |
| Env | `dotenv` | Same as v1 |

---

## Environment Variables

```
PHONE_NUMBER_ID=
ACCESS_TOKEN=
WEBHOOK_VERIFY_TOKEN=
OPENAI_API_KEY=
NODE_ENV=development
PORT=3000
BUSINESS_HOURS_START=8
BUSINESS_HOURS_END=18
ESCALATION_NUMBER=59167978690
ESCALATION_NUMBER_TECH=59175013747
WEBSITE_URL=https://importadorajv.com
CRAWL_INTERVAL_HOURS=24
```

---

## Project Structure

```
/
├── server.js              # Entry point, Express setup
├── CLAUDE.md
├── SPEC.md
├── productos.json         # Kept as fallback/media ID source
├── .env
├── .env.example
├── package.json
│
├── src/
│   ├── webhook/
│   │   ├── handler.js     # POST /webhook — receives WhatsApp messages
│   │   └── verify.js      # GET /webhook — token verification
│   │
│   ├── ai/
│   │   ├── agent.js       # Main AI call — builds prompt + calls OpenAI
│   │   ├── context.js     # Builds system prompt from crawled data + products
│   │   └── escalation.js  # Detects escalation intent from AI response
│   │
│   ├── crawler/
│   │   └── scraper.js     # Scrapes importadorajv.com, returns structured text
│   │
│   ├── db/
│   │   ├── init.js        # Creates tables on startup
│   │   └── queries.js     # All DB read/write functions
│   │
│   ├── whatsapp/
│   │   ├── send.js        # sendMessage, sendVideo, sendPDF, sendTemplate
│   │   └── media.js       # Media ID lookup from productos.json
│   │
│   └── utils/
│       └── hours.js       # isBusinessHours(), getHoursMessage()
```

---

## Database Schema

### `conversations`
```sql
CREATE TABLE conversations (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  phone TEXT NOT NULL,
  role TEXT NOT NULL,          -- 'user' | 'assistant'
  content TEXT NOT NULL,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);
```

### `sessions`
```sql
CREATE TABLE sessions (
  phone TEXT PRIMARY KEY,
  last_active DATETIME NOT NULL,
  escalated INTEGER DEFAULT 0  -- 1 if handed off to human
);
```

### `crawl_cache`
```sql
CREATE TABLE crawl_cache (
  id INTEGER PRIMARY KEY,
  content TEXT NOT NULL,       -- raw extracted text from website
  crawled_at DATETIME DEFAULT CURRENT_TIMESTAMP
);
```

---

## Core Flow

```
Incoming WhatsApp message
        ↓
webhook/handler.js
        ↓
Load conversation history from SQLite (last 20 messages)
        ↓
Check session — if last_active > 24h → reset history, start fresh
        ↓
Build system prompt (ai/context.js):
  - Crawled website content (from crawl_cache)
  - productos.json catalog (names, descriptions, links)
  - Business identity + escalation instructions
  - Current time + hours context
        ↓
Call OpenAI GPT-4o-mini (ai/agent.js)
  - System prompt
  - Last 20 messages as history
  - New user message
        ↓
Parse AI response
  - Does it contain escalation signal? → also send wa.me link
  - Does it reference a specific product with media? → also send PDF/video
        ↓
Send response via WhatsApp API
        ↓
Save user message + AI response to SQLite
Update session last_active
```

---

## AI System Prompt Structure

```
You are the virtual assistant for Importadora JV, a Bolivian company 
specializing in waterproofing products and plumbing fixtures.

You answer in Spanish, naturally and professionally. Never reveal you are an AI 
unless directly asked. If asked, say you are a virtual assistant.

COMPANY INFORMATION:
{crawled_website_content}

PRODUCT CATALOG:
{products_from_json}

CONTACT & ESCALATION:
- For orders, quotes, or when the user needs a human: {ESCALATION_NUMBER}
- For technical or distributor inquiries: {ESCALATION_NUMBER_TECH}
- When escalating, include this exact tag in your response: [ESCALATE]
- When a user asks for a specific product's PDF or video, include: [MEDIA:product_id]

CURRENT TIME: {current_time} (Bolivia time, UTC-4)
BUSINESS HOURS: 8:00 - 18:00. Advisors respond during these hours.
Outside hours: answer fully but mention response time for human follow-up.

BEHAVIOR RULES:
- Always answer the user's question first, then offer escalation if needed
- If you don't know something specific, say so and offer to connect with a human
- Keep responses concise — this is WhatsApp, not email
- Never make up prices or availability you don't have data for
- For quote requests: collect product name, quantity, and city before escalating
```

---

## Escalation Logic

`escalation.js` scans AI response for `[ESCALATE]` tag:
- Strip the tag from the displayed message
- Append WhatsApp link: `https://wa.me/{ESCALATION_NUMBER}`
- Mark session as `escalated = 1` in DB
- Optionally send a second message with just the link for easy tap

---

## Media on Demand

`[MEDIA:product_id]` tag in AI response triggers:
- Strip tag from displayed message
- Look up product in `productos.json` by ID
- Send PDF if `mediaPdf` exists
- Send video if `mediaVideo` exists (with 1500ms delay preserved from v1)
- If neither exists, skip silently

---

## Web Crawler

`scraper.js` runs on startup and every `CRAWL_INTERVAL_HOURS`:
- Fetches homepage + product pages from `WEBSITE_URL`
- Extracts: page title, meta description, visible text, product names/descriptions
- Strips nav, footer, scripts, ads
- Truncates to ~4000 tokens to stay within prompt budget
- Stores result in `crawl_cache` table
- Falls back to last cached version if scrape fails

---

## Quote Request Flow

When AI detects quote intent (user says "cotizar", "precio", "cuánto cuesta", etc.):

1. AI asks for: product name → quantity → city (one question at a time, naturally)
2. Once collected, AI formats and sends to escalation WhatsApp:

```
📋 *Nueva cotización*
Producto: {product}
Cantidad: {quantity}
Ciudad: {city}
Cliente: {phone}
```

3. Then confirms to user: "Tu solicitud fue enviada, un asesor te contactará."

Quote state tracked in conversation history — AI handles it naturally, no hardcoded state machine needed.

---

## Milestones

### ✅ MVP — Bot is usable
- [ ] Project structure + SQLite init
- [ ] Crawler + crawl_cache
- [ ] AI agent with system prompt
- [ ] Conversation history per phone
- [ ] Session reset after 24h
- [ ] Escalation detection + wa.me link
- [ ] Hours context in prompt (24/7 answers)
- [ ] Deploy to Railway with new PHONE_NUMBER_ID

### 🔜 v2.1 — Bot generates leads
- [ ] Quote request flow
- [ ] Media on demand (PDF/video triggers)
- [ ] Crawler auto-refresh every 24h

### 🔵 v2.2 — Visibility + polish
- [ ] GET /logs endpoint (auth protected) — returns recent conversations as JSON
- [ ] Basic analytics: message count, escalation rate, top keywords
- [ ] Proactive template sending utility

---

## Migration from v1

- Keep `productos.json` — media IDs still needed
- Keep same webhook URL — no Meta reconfiguration needed
- Update `PHONE_NUMBER_ID` env var to new number (already done)
- `ACCESS_TOKEN` stays the same
- Delete old state machine code entirely

---

## Notes for Claude Code

- Run `/init` first to register this SPEC
- Tackle one milestone at a time, start with DB init + crawler
- Keep `server.js` as thin entry point only — all logic in `src/`
- Use `better-sqlite3` (sync) not `sqlite3` (async) — simpler code
- Test webhook locally with ngrok before Railway deploy
- Never hardcode phone numbers — always from env vars