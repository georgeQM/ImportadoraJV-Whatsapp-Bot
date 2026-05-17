# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Summary

**ImportadoraJV WhatsApp Bot** is a Node.js Express server implementing a stateful AI-powered chatbot for WhatsApp Business API. It provides 24/7 customer support for ImportadoraJV's waterproofing and construction products catalog using GPT-4o-mini, with conversation persistence in SQLite.

**GitHub:** https://github.com/georgeQM/ImportadoraJV-Whatsapp-Bot

## Setup & Running

### Installation
```bash
npm install
```

### Environment Configuration
Create a `.env` file (see `.env.example`):
```
PHONE_NUMBER_ID=<whatsapp-business-phone-id>
ACCESS_TOKEN=<facebook-graph-api-token>
WEBHOOK_VERIFY_TOKEN=<custom-verification-token>
OPENAI_API_KEY=<openai-key>
ESCALATION_NUMBER=<phone-without-plus>
ESCALATION_NUMBER_TECH=<phone-without-plus>
NODE_ENV=development
PORT=3000
```

### Start
```bash
node server.js
```

## Architecture Overview

### Module Structure
```
server.js                  — thin entry point: dotenv → db → crawler → routes
src/
  db/
    init.js                — opens bot.db (WAL), creates tables, migrates schema
    queries.js             — all prepared statements, exported functions
  ai/
    agent.js               — getAIResponse(phone, message, history, context)
    context.js             — buildSystemPrompt(), buildContextPrompt(context)
    escalation.js          — parseAIResponse() → { cleanText, shouldEscalate, mediaId }
  webhook/
    handler.js             — handle(req, res): full conversation flow
  whatsapp/
    send.js                — sendMessage, sendVideo, sendPDF
    media.js               — getProductById (reads productos.json)
  crawler/
    scraper.js             — runCrawl(), scheduleCrawl()
  utils/
    hours.js               — boliviaTime(), getHoursMessage()
catalogo.json              — 29 products (AI knowledge, string IDs 42–129)
productos.json             — 12 products (media IDs only, numeric IDs 1–12)
bot.db                     — SQLite database (gitignored)
```

**Critical ordering:** `server.js` loads `dotenv` before any `src/` require — `src/ai/agent.js` reads `process.env.OPENAI_API_KEY` at module load time.

### SQLite Schema (`src/db/init.js`)

```sql
conversations (id, phone, role, content, created_at)
sessions      (phone PK, last_active, escalated, context)
crawl_cache   (id=1, content, crawled_at)
```

The `context` column was added via `ALTER TABLE` migration (idempotent try/catch pattern) — safe to run against existing databases.

### Conversation Flow (`src/webhook/handler.js`)

```
Incoming message
  → res.sendStatus(200)          immediately (WhatsApp 15s timeout)
  → ignore non-text
  → 'reiniciar'/'reset'          → wipe DB + send WELCOME_MESSAGE
  → !session                     → create session + send WELCOME_MESSAGE
  → session expired (>24h)       → load empty history (session preserved)
  → '1'/'2'/'3'                  → setContext + AI call (empty history) + return early
  → normal AI flow               → getContext + getHistory(20) + getAIResponse
      → parseAIResponse
      → sendMessage(cleanText)
      → if [ESCALATE]: markEscalated + setContext(null) + send wa.me link
      → if [MEDIA:N]:  getProductById → sendVideo (1500ms delay) + sendPDF
```

### Context System

When a user selects 1/2/3 from the welcome menu, a context value is stored in the session and appended to the AI system prompt for all subsequent messages:

| User input | context value | Effect |
|------------|--------------|--------|
| `1` | `catalogo` | Ask about problem/surface, recommend 2-3 products |
| `2` | `precios` | Ask product + quantity before escalating |
| `3` | `asesoria` | Ask surface type + problem for technical advice |

Context is cleared (`NULL`) after `[ESCALATE]` fires.

### AI Integration (`src/ai/`)

- **Model:** `gpt-4o-mini`, `max_tokens: 500`, `temperature: 0.7`
- **System prompt:** company info (crawled or fallback) + full product catalog + Bolivia time + hours + behavior rules + optional context prompt
- **Action tags parsed from AI response:**
  - `[ESCALATE]` — triggers human handoff + wa.me link
  - `[MEDIA:N]` — triggers video/PDF send for product ID N

### Product Catalogs (Two Separate Files)

**`catalogo.json`** — used by AI only (29 products, string IDs):
```json
{ "id": "107", "nombre": "...", "marca": "...", "superficies": [...],
  "problema": [...], "descripcion": "...", "rendimiento_kg_m2": 3.5,
  "presentaciones": [...], "rendimiento_nota": "...", "linkWeb": "..." }
```

**`productos.json`** — used by `media.js` only (12 products, numeric IDs):
```json
{ "id": 1, "nombre": "...", "mediaPdf": "fb_media_id", "mediaVideo": "fb_media_id" }
```

**Known gap:** `[MEDIA:N]` IDs from the AI (42–129) don't match `productos.json` IDs (1–12), so media delivery silently no-ops for new catalog products. Resolve by aligning IDs across both files.

### Web Crawler (`src/crawler/scraper.js`)

Runs at startup and on a configurable interval (`CRAWL_INTERVAL_HOURS`). Scrapes importadorajv.com homepage + up to 8 product pages (500ms delay between), strips noise, truncates to 16,000 chars, stores to `crawl_cache`. Falls back to hardcoded `FALLBACK_COMPANY_INFO` if DB is empty.

## Important Notes

**Never hardcode phone numbers** — always from `process.env.ESCALATION_NUMBER` / `ESCALATION_NUMBER_TECH`.

**Restart required** after editing `catalogo.json` or `productos.json` — both are `require()`d once at module load.

**No test suite** — manual testing via WhatsApp Business Account required. Use `node -e "..."` scripts for unit verification of individual modules.

**1500ms delay** after `sendVideo` before `sendPDF` — hardcoded in handler.js to avoid WhatsApp ordering issues.
