# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Summary

**ImportadoraJV WhatsApp Bot** is a Node.js Express server that implements a stateful conversational chatbot for WhatsApp Business API. The bot provides 24/7 customer support for ImportadoraJV's waterproofing and construction products catalog, managing product inquiries, pricing information, and customer routing.

**GitHub:** https://github.com/georgeQM/ImportadoraJV-Whatsapp-Bot

## Setup & Running

### Installation
```bash
npm install
```

### Environment Configuration
Create a `.env` file with required credentials (see `.env.example`):
```
PHONE_NUMBER_ID=<your-whatsapp-business-phone-id>
ACCESS_TOKEN=<facebook-graph-api-token>
WEBHOOK_VERIFY_TOKEN=<custom-verification-token>
NODE_ENV=development
PORT=3000
```

### Start Development Server
```bash
node server.js
```
Server will run on `http://localhost:3000` (or `$PORT` if set).

### Production Deployment
- Set `NODE_ENV=production` in `.env`
- The app will skip loading `.env` file when `NODE_ENV !== 'development'`
- Ensure environment variables are set via deployment platform (Heroku, Railway, etc.)

## Architecture Overview

### Single File Structure
- **`server.js`** (~330 lines) - Monolithic application containing all logic:
  - Express HTTP server setup
  - Webhook request handlers (GET/POST)
  - User conversation state machine
  - Message sending functions (text, video, PDF, templates)

### Conversation State Machine

The bot maintains per-user state in two objects:
- `userState[phone]` - Tracks user's current menu position
- `productSelected[phone]` - Caches selected product object

**State Flow:**
```
Initial → main → (1: productos) → in_productos → in_producto_seleccionado
         └→ (2: precios) → in_precios
         ↓ (hola/menu/ayuda keywords at any state)
         Return to main
```

### Key Functions

**Menu Functions** - Format and send navigation menus:
- `sendMainMenu(phone)` - Primary menu with 2 options + contact links
- `sendProductosMenu(phone)` - Product list (dynamically numbered from productos.json)
- `sendProductoSeleccionadoMenu(phone, product)` - Product detail submenu
- `sendPreciosMenu(phone)` - Pricing links submenu

**Message Functions** - Send various message types:
- `sendMessage(to, text)` - Plain text messages
- `sendVideo(phone, mediaId, caption)` - Reusable WhatsApp media ID videos
- `sendPDF(phone, mediaId, filename, caption)` - Reusable WhatsApp media ID documents
- `sendTemplate(to, templateName, language, params)` - Prepared message templates

**Utility Functions**:
- `getProductById(targetId)` - Lookup product from catalog by ID
- Webhook POST handler processes incoming messages and routes to state handlers

### Products Catalog

**File:** `productos.json` - Static JSON array of 12 products
```json
{
  "id": 1,
  "nombre": "Product Name",
  "descripcion": "Short description",
  "linkWeb": "https://importadorajv.com/...",
  "mediaPdf": "facebook_media_id",
  "mediaVideo": "facebook_media_id" // or null if unavailable
}
```

Products are sorted by ID when displayed. Some products lack videos (see IDs 4, 5, 6, 10, 11).

### External Integrations

**WhatsApp Cloud API (v22.0)**
- Endpoint: `https://graph.facebook.com/v22.0/{PHONE_NUMBER_ID}/messages`
- Uses Facebook Graph API Bearer token authentication
- Three message types:
  - `type: "text"` - Plain text with `text.body`
  - `type: "video"` - Media with reusable `video.id` + optional caption
  - `type: "document"` - Media with reusable `document.id`, filename, caption
  - `type: "template"` - Prepared templates with body parameters
- Webhook verification: GET with `hub.mode=subscribe`, `hub.verify_token`, returns `hub.challenge`

**External Links** (hardcoded):
- Orders/quotes WhatsApp: https://wa.me/59167978690
- Distributor/technical WhatsApp: https://wa.me/59175013747
- Google Maps location
- Website: https://importadorajv.com
- Price lists: Google Drive links (in `sendPreciosMenu`)

## Design Patterns & Decisions

**Stateful Conversation Flow**
- User state persists in memory across requests using phone number as key
- No database; state lost on server restart
- Allows complex branching: view product details, then back to list or main menu

**Reusable Media IDs**
- WhatsApp media doesn't expire when using `type: "video"` or `type: "document"` with pre-uploaded media IDs
- Products.json stores Facebook media IDs, not file URLs
- Avoids repeated file uploads and bandwidth/API cost savings

**Timezone & Language**
- All text hardcoded in Spanish with some English greeting keywords
- No timezone handling; uses server default

**Error Handling**
- Try/catch wraps API calls with console.error logging
- User receives fallback messages on video/PDF send failures
- No validation for missing mediaIds (returns generic "contact us" message)

## Common Development Tasks

## Important Notes

**Security - Credentials in Git History**
- `.env` contains real tokens and is in git history; credentials are **compromised**
- Should be regenerated immediately if this repo is public
- `.gitignore` correctly excludes `.env` but damage already done (see git log)

**Unused Dependencies**
- `openai` (v6.9.1) installed but all usage commented out in server.js (lines 4, 20)
- `whatsapp-cloud-api` (v0.3.1) installed but never imported; direct axios calls used instead

**Product Lookup Bug Risk**
- Products display with sequential 1-based index (`index + 1`) but `getProductById` looks up by `product.id` field. If any product IDs are non-sequential (gaps, reordering), user selections will mismatch. Keep product IDs sequential and matching display order.
- `products` is loaded once at startup (line 18 of server.js); restarting the server is required after editing `productos.json`.

**Known Limitations**
- 1500ms hardcoded delay after sending videos before showing menu again
- `sendPreciosMenu` has duplicate Google Drive links for both price options (same URL for both items 1 and 2)
- No logging to persistent storage (console.log only)
- No graceful shutdown handling
- `sendTemplate` function is defined but never called anywhere in the codebase

**Testing**
- No test suite configured (`npm test` returns error)
- Manual testing via WhatsApp Business Account required
