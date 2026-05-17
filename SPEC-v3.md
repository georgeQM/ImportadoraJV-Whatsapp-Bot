# SPEC-v3.md — ImportadoraJV WhatsApp Bot — Interactive Menu Flow

## Overview

Replace the text-based menu with WhatsApp native interactive components (List Messages + Reply Buttons). Implement a staged filtering flow that uses zero AI tokens until the user has selected a product category and surface — at which point the AI receives a focused prompt with 3-6 relevant products only.

---

## WhatsApp Interactive Message Types

### List Message (up to 10 options)
Used for MENU 1 (product category) and MENU 2 (surface).

```json
{
  "messaging_product": "whatsapp",
  "to": "{phone}",
  "type": "interactive",
  "interactive": {
    "type": "list",
    "body": { "text": "¿Qué tipo de producto necesitás?" },
    "action": {
      "button": "Ver opciones",
      "sections": [
        {
          "title": "Categorías",
          "rows": [
            { "id": "cat_impermeabilizantes", "title": "Impermeabilizantes", "description": "Membranas, mantas líquidas, selladores" },
            { "id": "cat_griferia", "title": "Grifería y Plomería", "description": "Grifos, duchas, sifones, chicotillos" },
            { "id": "cat_jardin", "title": "Jardín y Riego", "description": "Mangueras, hidropistolas, válvulas" }
          ]
        }
      ]
    }
  }
}
```

### Reply Buttons (up to 3 buttons)
Used for quick confirmations and escalation.

```json
{
  "messaging_product": "whatsapp",
  "to": "{phone}",
  "type": "interactive",
  "interactive": {
    "type": "button",
    "body": { "text": "¿Querés que un asesor te contacte con la cotización?" },
    "action": {
      "buttons": [
        { "type": "reply", "reply": { "id": "escalate_yes", "title": "Sí, quiero cotización" } },
        { "type": "reply", "reply": { "id": "escalate_no", "title": "No por ahora" } }
      ]
    }
  }
}
```

### Incoming Interactive Webhook
When user taps a button or list item, the webhook payload contains:
```json
{
  "type": "interactive",
  "interactive": {
    "type": "list_reply",        // or "button_reply"
    "list_reply": {
      "id": "cat_impermeabilizantes",
      "title": "Impermeabilizantes"
    }
  }
}
```

---

## Full Conversation Flow

```
[FIRST CONTACT]
        ↓
Send welcome text + MENU 1 (List Message)
Store session context: { stage: 'menu1' }
        ↓
[USER TAPS CATEGORY]
Webhook: interactive.list_reply.id = "cat_impermeabilizantes"
        ↓
Store context: { stage: 'menu2', category: 'impermeabilizantes' }
Send MENU 2 — Surface selector (List Message)
        ↓
[USER TAPS SURFACE]
Webhook: interactive.list_reply.id = "surf_losa_techo"
        ↓
Store context: { stage: 'ai_turn', category: '...', surface: 'losa_techo' }
Run filterProducts(category, surface) → returns 3-6 products from catalogo.json
        ↓
[AI TURN 1 — focused prompt, ~1,500 tokens]
System: base identity + filtered products only
Instruction: "Pregúntale exactamente qué problema tiene en [surface]"
AI responds with ONE clarifying question
        ↓
[USER DESCRIBES PROBLEM]
        ↓
[AI TURN 2 — same focused prompt + user answer in history]
AI recommends 1-2 products with explanation
AI asks: "¿Cuántos m² necesitás cubrir?"
        ↓
[USER GIVES m²]
        ↓
[AI TURN 3]
AI calculates quantity using rendimiento_kg_m2 from catalog
AI generates cotización summary:
  "Para X m² necesitás:
   - Producto: [nombre]
   - Cantidad: [N] unidades de [presentación]
   - [link producto]"
Send Reply Buttons: [Sí, quiero cotización] [No por ahora]
        ↓
[USER TAPS "Sí, quiero cotización"]
Webhook: interactive.button_reply.id = "escalate_yes"
Send escalation message + wa.me link
Mark session escalated
        ↓
[USER TAPS "No por ahora"]
Send: "Perfecto, quedamos a tu disposición. Si tenés más dudas escribinos."
```

---

## MENU 2 — Surface Options Per Category

### Impermeabilizantes
```
id: surf_losa_techo     → title: "Losa / Techo plano"
id: surf_pared          → title: "Pared / Muro"
id: surf_piscina        → title: "Piscina / Cisterna"
id: surf_cimiento       → title: "Cimiento / Subsuelo"
id: surf_junta_grieta   → title: "Grietas / Juntas"
id: surf_no_se          → title: "No sé / Tengo dudas"
```

### Grifería y Plomería
```
id: surf_cocina         → title: "Cocina"
id: surf_bano           → title: "Baño / Lavamanos"
id: surf_lavanderia     → title: "Lavandería"
id: surf_filtro         → title: "Filtro de agua"
id: surf_no_se          → title: "No sé / Tengo dudas"
```

### Jardín y Riego
```
id: surf_jardin_riego   → title: "Riego de jardín"
id: surf_valvulas       → title: "Válvulas y conexiones"
id: surf_no_se          → title: "No sé / Tengo dudas"
```

---

## Product Filter Function

```javascript
// src/filters/productFilter.js

const catalogo = require('../../catalogo.json');

const SURFACE_MAP = {
  surf_losa_techo:   ['losa', 'techo', 'azotea', 'terraza', 'cubierta', 'marquesina'],
  surf_pared:        ['pared', 'muro', 'humedad en pared', 'interior'],
  surf_piscina:      ['piscina', 'cisterna', 'deposito', 'tanque'],
  surf_cimiento:     ['cimiento', 'sotano', 'subsuelo', 'fundacion', 'bajo tierra', 'subterraneo'],
  surf_junta_grieta: ['junta', 'grieta', 'fisura', 'rajadura'],
  surf_no_se:        null  // returns null → AI asks clarifying question
};

const CATEGORY_MAP = {
  cat_impermeabilizantes: ['impermeabilizante'],
  cat_griferia:           ['griferia'],
  cat_jardin:             ['jardin']
};

function filterProducts(categoryId, surfaceId) {
  if (surfaceId === 'surf_no_se') return null; // trigger clarifying question

  const keywords = SURFACE_MAP[surfaceId] || [];
  const categoryFilter = CATEGORY_MAP[categoryId] || [];

  return catalogo
    .filter(p => {
      // Must match category
      const matchesCategory = categoryFilter.includes(p.categoria);
      if (!matchesCategory) return false;

      // Must match at least one surface keyword
      const allText = [
        ...(p.superficies || []),
        ...(p.problema || [])
      ].join(' ').toLowerCase();

      return keywords.some(kw => allText.includes(kw));
    })
    .slice(0, 6); // max 6 products
}

module.exports = { filterProducts };
```

---

## AI Prompt — Focused Turn

```javascript
// When filterProducts returns products:
function buildFocusedPrompt(products, surface, category) {
  const productText = products.map(p => `
[${p.nombre}]
Superficies: ${p.superficies?.join(', ')}
Problemas: ${p.problema?.join(', ')}
No usar para: ${p.no_usar_para?.join(', ')}
Descripción: ${p.descripcion}
Rendimiento: ${p.rendimiento_kg_m2 ? p.rendimiento_kg_m2 + ' kg/m²' : 'ver ficha'}
Presentaciones: ${p.presentaciones?.join(', ') || 'consultar'}
Nota: ${p.rendimiento_nota || ''}
Link: ${p.linkWeb}
  `.trim()).join('\n\n');

  return `Sos el asesor de Importadora JV.

El cliente necesita impermeabilizar: ${surface}
Categoría: ${category}

PRODUCTOS DISPONIBLES PARA ESTE CASO:
${productText}

INSTRUCCIONES:
- Hacé UNA sola pregunta para entender mejor el problema específico
- Solo recomendá productos de la lista de arriba
- Nunca recomiendes un producto cuya superficie o problema no coincida
- Cuando tengas suficiente info, recomendá 1-2 productos máximo
- Cuando el cliente confirme el producto, preguntá cuántos m² necesita cubrir
- Con los m², calculá la cantidad usando el rendimiento y decile cuántas unidades necesita
- Al final preguntá si quiere que un asesor lo contacte con la cotización exacta`;
}

// When filterProducts returns null (surf_no_se):
function buildClarifyingPrompt(category) {
  return `Sos el asesor de Importadora JV.

El cliente quiere productos de: ${category}
No especificó la superficie o el problema.

Hacé UNA sola pregunta corta y específica para entender qué necesita.
Por ejemplo: "¿En qué superficie o área necesitás impermeabilizar?"
No des información de productos todavía.`;
}
```

---

## Session Context Schema (updated)

```sql
-- sessions table already has: phone, last_active, escalated, context (TEXT)
-- context field now stores JSON:
{
  "stage": "menu1" | "menu2" | "ai_turn" | "escalation",
  "category": "cat_impermeabilizantes" | "cat_griferia" | "cat_jardin" | null,
  "surface": "surf_losa_techo" | "surf_pared" | ... | null,
  "filtered_products": ["slug1", "slug2", ...] | null
}
```

---

## Files to Create / Modify

### New files
- `src/filters/productFilter.js` — filterProducts() function
- `src/whatsapp/interactive.js` — sendListMessage(), sendReplyButtons()

### Modified files
- `src/webhook/handler.js` — handle interactive message type, route by stage
- `src/ai/context.js` — add buildFocusedPrompt(), buildClarifyingPrompt()
- `src/ai/agent.js` — accept focused prompt directly instead of always calling buildSystemPrompt()
- `src/db/queries.js` — update setContext/getContext to store/parse JSON

---

## Token Budget Per Turn

| Turn | Prompt tokens | Response tokens | Total |
|------|--------------|-----------------|-------|
| Menu 1 (list message) | 0 | 0 | 0 |
| Menu 2 (list message) | 0 | 0 | 0 |
| AI Turn 1 (clarifying Q) | ~800 | ~100 | ~900 |
| AI Turn 2 (recommendation) | ~900 | ~300 | ~1,200 |
| AI Turn 3 (quantity calc) | ~1,000 | ~200 | ~1,200 |
| Escalation (button tap) | 0 | 0 | 0 |
| **Total per sale** | | | **~3,300** |

vs current: ~7,700 per message × however many messages. **80% reduction.**

---

## Implementation Order

1. `src/whatsapp/interactive.js` — sendListMessage, sendReplyButtons
2. `src/filters/productFilter.js` — filterProducts
3. `src/webhook/handler.js` — parse interactive webhook, route by stage
4. `src/ai/context.js` — buildFocusedPrompt, buildClarifyingPrompt
5. `src/ai/agent.js` — accept custom prompt
6. `src/db/queries.js` — JSON context storage
7. Update WELCOME_MESSAGE to send text + list message together

---

## Notes for Claude Code

- Interactive messages require `type: "interactive"` in the webhook body — add this check alongside the existing `type: "text"` check
- List reply IDs come from `message.interactive.list_reply.id`
- Button reply IDs come from `message.interactive.button_reply.id`
- Keep the existing text flow as fallback — if user types instead of tapping, the AI still responds normally using the current context
- Test with WhatsApp Business API sandbox before Railway deploy
- The `context` field in sessions is currently a plain string — migrate to JSON with backward compatibility (if parse fails, treat as null)