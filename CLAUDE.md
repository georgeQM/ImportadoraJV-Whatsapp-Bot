# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Summary

**ImportadoraJV WhatsApp Bot** is a Node.js Express server implementing a stateful AI-powered chatbot for WhatsApp Business API. It provides 24/7 customer support for ImportadoraJV's waterproofing, plumbing, and garden products using GPT-4o-mini, with conversation persistence in SQLite and an interactive menu system built on WhatsApp List Messages.

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
server.js                    — thin entry point: dotenv → db → crawler → routes
src/
  db/
    init.js                  — opens bot.db (WAL), creates tables, migrates schema
    queries.js               — all prepared statements, exported functions
  ai/
    agent.js                 — getAIResponse(phone, message, history, context, systemPrompt?)
    context.js               — buildSystemPrompt(), buildFocusedPrompt(products), buildClarifyingPrompt(ctx)
    escalation.js            — parseAIResponse() → { cleanText, shouldEscalate, mediaId }
  webhook/
    handler.js               — handle(req, res): full conversation flow + interactive menu routing
  whatsapp/
    send.js                  — sendMessage, sendVideo, sendPDF
    interactive.js           — sendListMessage, sendReplyButtons
    media.js                 — getProductById (reads productos.json)
  filters/
    productFilter.js         — filterProducts(categoryId, subFilterId), surface/location groups + menu rows
  crawler/
    scraper.js               — runCrawl(), scheduleCrawl() [runs but output currently unused]
  utils/
    hours.js                 — boliviaTime(), getHoursMessage()
catalogo.json                — 29 impermeabilizante products (string IDs 42–129)
catalogo-griferia.json       — 35 grifería products (string IDs g-*)
catalogo-jardin.json         — 18 jardín/riego products (string IDs j-*)
productos.json               — 12 products with FB media IDs (numeric IDs 1–12)
bot.db                       — SQLite database (gitignored)
```

**Critical ordering:** `server.js` loads `dotenv` before any `src/` require — `src/ai/agent.js` reads `process.env.OPENAI_API_KEY` at module load time.

### SQLite Schema (`src/db/init.js`)

```sql
conversations (id, phone, role, content, created_at)
sessions      (phone PK, last_active, escalated, context)
crawl_cache   (id=1, content, crawled_at)
```

The `context` column stores a **JSON object** (serialized as TEXT). `setContext`/`getContext` in `queries.js` handle serialization/deserialization automatically. The `context` column was added via `ALTER TABLE` migration (idempotent try/catch) — safe to run against existing databases.

### Conversation Flow (`src/webhook/handler.js`)

```
Incoming message (text OR interactive)
  → res.sendStatus(200)              immediately (WhatsApp 15s timeout)
  → extractInput(message)            handles text, list_reply, button_reply; returns null for others
  → 'reiniciar'/'reset'              → wipe DB + sendWelcomeMessage (List Message)
  → !session                         → create session + sendWelcomeMessage
  → session expired (>24h)           → load empty history (session preserved)

  Interactive routing (by input.id):
  → 'menu_buscar'                    → setContext(category_select) + send 3-category List Message
  → 'cat_impermeabilizante'          → setContext(surface_select) + send surface List Message
  → 'cat_griferia'                   → setContext(location_select) + send grifería location List Message
  → 'cat_jardin'                     → setContext(location_select) + send jardín tipo List Message
  → 'menu_cotizar'                   → setContext(chat/precios) + buildSystemPrompt + AI + send
  → 'menu_asesoria'                  → setContext(chat/asesoria) + buildSystemPrompt + AI + send
  → surf_* (e.g. surf_techo_losa)    → filterProducts(impermeabilizante, surfaceId)
                                        → buildFocusedPrompt + AI + send
  → ubi_* (e.g. ubi_bano)            → read categoryId from context
                                        → filterProducts(categoryId, locationId)
                                        → buildFocusedPrompt + AI + send

  Legacy text shortcuts (fallback):
  → '1'/'2'/'3'                      → same as menu_buscar/cotizar/asesoria
  → normal text                      → getContext + getHistory(20) + buildFocusedPrompt (if subFilterId)
                                        → getAIResponse + parseAIResponse
                                        → sendMessage(cleanText)
                                        → if [ESCALATE]: markEscalated + setContext(null) + send wa.me link
                                        → if [MEDIA:N]:  getProductById → sendVideo (1500ms delay) + sendPDF
```

### Context System

Context is stored as a JSON object in `sessions.context`. Fields:

| Field | Values | Meaning |
|---|---|---|
| `stage` | `category_select`, `surface_select`, `location_select`, `chat` | Current menu step |
| `intent` | `catalogo`, `precios`, `asesoria` | User's goal |
| `categoryId` | `impermeabilizante`, `griferia`, `jardin` | Selected product line |
| `surfaceId` | `techo_losa`, `areas_humedas`, `subterranea`, `piscina_cisterna`, `pared_fachada`, `juntas_fisuras`, `hormigon_estructural`, `no_se` | For impermeabilizantes |
| `locationId` | grifería: `bano`, `cocina`, `lavanderia`, `filtros`, `exterior` · jardín: `accesorios`, `tuberias_riego`, `deposito` | For grifería/jardín |

Context is cleared (`NULL`) after `[ESCALATE]` fires.

### AI Integration (`src/ai/`)

- **Model:** `gpt-4o-mini`, `max_tokens: 800`, `temperature: 0.7`
- **`getAIResponse(phone, message, history, context, systemPrompt?)`** — if `systemPrompt` is provided it overrides the built prompt entirely
- **System prompt (fallback — no products):** static company description + Bolivia time + hours + behavior rules + routing instruction ("use the menu to select a category")
- **System prompt (focused — with products):** same structure but with `CATÁLOGO DE PRODUCTOS:` section showing only the filtered subset
- **Action tags parsed from AI response:**
  - `[ESCALATE]` — triggers human handoff + wa.me link
  - `[MEDIA:N]` — triggers video/PDF send for product ID N

### Product Catalogs

Three catalog files. All `require()`d once at module load in `src/filters/productFilter.js`.

| File | Products | IDs | Filter field | Used for |
|---|---|---|---|---|
| `catalogo.json` | 29 | `"42"`–`"129"` (string) | `superficies` | Impermeabilizantes |
| `catalogo-griferia.json` | 35 | `"g-*"` (string) | `ubicacion` | Grifería y Plomería |
| `catalogo-jardin.json` | 18 | `"j-*"` (string) | `ubicacion` | Jardín y Riego |

**`catalogo.json` product schema:**
```json
{ "id": "42", "nombre": "...", "marca": "...", "categoria": "impermeabilizante",
  "superficies": [...], "problema": [...], "no_usar_para": [...],
  "descripcion": "...", "rendimiento_kg_m2": 3.5, "presentaciones": [...],
  "rendimiento_nota": "...", "linkWeb": "..." }
```

**`catalogo-griferia.json` / `catalogo-jardin.json` product schema:**
```json
{ "id": "g-9", "nombre": "...", "marca": "...", "categoria": "griferia",
  "ubicacion": ["cocina"], "tipo": ["grifo de mesa"], "problema": [...],
  "descripcion": "...", "presentaciones": [...], "linkWeb": "..." }
```

**`productos.json`** — used by `media.js` only (12 products, numeric IDs 1–12):
```json
{ "id": 1, "nombre": "...", "mediaPdf": "fb_media_id", "mediaVideo": "fb_media_id" }
```

**Known gap:** `[MEDIA:N]` IDs from the AI (42–129 / g-* / j-*) don't match `productos.json` IDs (1–12), so media delivery silently no-ops. Resolve by aligning IDs across both files.

### Filter System (`src/filters/productFilter.js`)

`filterProducts(categoryId, subFilterId)` routes to the correct catalog, group map, and filter field:

```
categoryId = 'impermeabilizante' → catalogo.json,         SURFACE_GROUPS,           field: 'superficies'
categoryId = 'griferia'          → catalogo-griferia.json, UBICACION_GROUPS_GRIFERIA, field: 'ubicacion'
categoryId = 'jardin'            → catalogo-jardin.json,   UBICACION_GROUPS_JARDIN,   field: 'ubicacion'
```

Exported menu row constants: `CATEGORY_MENU_ROWS`, `SURFACE_MENU_ROWS`, `UBICACION_MENU_ROWS_GRIFERIA`, `UBICACION_MENU_ROWS_JARDIN`.

### Interactive Messages (`src/whatsapp/interactive.js`)

- `sendListMessage(to, bodyText, buttonLabel, sections)` — WhatsApp List Message (up to 10 rows per section)
- `sendReplyButtons(to, bodyText, buttons)` — WhatsApp Reply Buttons (up to 3 buttons)

Both follow the same axios/try-catch pattern as `send.js`.

### Web Crawler (`src/crawler/scraper.js`)

Runs at startup and on a configurable interval (`CRAWL_INTERVAL_HOURS`). Scrapes importadorajv.com, stores to `crawl_cache`. **The crawled content is currently not injected into the AI system prompt** — `getCachedContent()` is exported but not called in any active code path. The crawler can be removed or re-wired if web-scraped context is needed again.

## Important Notes

**Never hardcode phone numbers** — always from `process.env.ESCALATION_NUMBER` / `ESCALATION_NUMBER_TECH`.

**Restart required** after editing any catalog file (`catalogo.json`, `catalogo-griferia.json`, `catalogo-jardin.json`, `productos.json`) — all are `require()`d once at module load.

**No test suite** — manual testing via WhatsApp Business Account required. Use `node -e "..."` scripts for unit verification of individual modules.

**1500ms delay** after `sendVideo` before `sendPDF` — hardcoded in `handler.js` to avoid WhatsApp message ordering issues.

**Context is JSON** — `setContext(phone, obj)` and `getContext(phone)` in `queries.js` transparently serialize/parse JSON. Legacy string context values are returned as-is for backwards compatibility.
