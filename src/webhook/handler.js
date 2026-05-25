'use strict';

const { getAIResponse }                        = require('../ai/agent');
const { parseAIResponse }                      = require('../ai/escalation');
const { buildSystemPrompt, buildFocusedPrompt,
        buildClarifyingPrompt }                 = require('../ai/context');
const { addMessage, getHistory, getSession,
        upsertSession, markEscalated,
        deleteHistory, deleteSession,
        setContext, getContext }                = require('../db/queries');
const { sendMessage, sendVideo, sendPDF }      = require('../whatsapp/send');
const { sendListMessage }                      = require('../whatsapp/interactive');
const { getProductById }                       = require('../whatsapp/media');
const { filterProducts,
        SURFACE_MENU_ROWS,
        UBICACION_MENU_ROWS_GRIFERIA,
        UBICACION_MENU_ROWS_JARDIN,
        CATEGORY_MENU_ROWS }           = require('../filters/productFilter');

const ESCALATION_NUMBER  = process.env.ESCALATION_NUMBER;
const SESSION_TIMEOUT_MS = 24 * 60 * 60 * 1000;
const SPECIAL_PHONE      = '59177067861';

function addSuffix(phone, text) {
  return phone === SPECIAL_PHONE ? text + ', mi amor.' : text;
}

async function sendWelcomeMessage(phone) {
  await sendListMessage(
    phone,
    '¡Hola! Soy tu asesor de productos de Importadora JV. ¿Con qué te ayudo hoy?',
    'Ver opciones',
    [{ title: '¿Qué necesitas?', rows: [
      { id: 'menu_buscar',   title: 'Buscar producto',  description: 'Encuentra el impermeabilizante ideal' },
      { id: 'menu_cotizar',  title: 'Pedir cotización', description: 'Precio según producto y cantidad' },
      { id: 'menu_asesoria', title: 'Asesoría técnica', description: 'Dudas sobre humedades o filtraciones' },
    ]}]
  );
}

function extractInput(message) {
  if (message.type === 'text') {
    const text = message.text?.body?.trim() || '';
    return text ? { kind: 'text', text, id: null } : null;
  }
  if (message.type === 'interactive') {
    const r = message.interactive;
    if (r.type === 'list_reply')
      return { kind: 'interactive', text: r.list_reply.title,   id: r.list_reply.id };
    if (r.type === 'button_reply')
      return { kind: 'interactive', text: r.button_reply.title, id: r.button_reply.id };
  }
  return null;
}

async function handle(req, res) {
  const body = req.body;

  if (!(body.object && body.entry?.[0]?.changes?.[0]?.value?.messages?.[0])) {
    return res.sendStatus(404);
  }

  const message = body.entry[0].changes[0].value.messages[0];
  const phone   = message.from;

  // Respond immediately — WhatsApp requires 200 within 15s
  res.sendStatus(200);

  if (message.type === 'audio' || message.type === 'voice') {
    await sendMessage(phone, 'Por favor escribí tu consulta, no puedo escuchar mensajes de voz 😊');
    return;
  }

  const input = extractInput(message);
  if (!input) return;

  console.log(`[webhook] From ${phone}: "${input.text}"${input.id ? ` [${input.id}]` : ''}`);

  try {
    // Reset command — wipe history + session, restart with welcome
    if (input.kind === 'text' && ['reiniciar', 'reset'].includes(input.text.toLowerCase())) {
      deleteHistory(phone);
      deleteSession(phone);
      upsertSession(phone);
      console.log(`[webhook] Reset by ${phone}`);
      await sendWelcomeMessage(phone);
      return;
    }

    // First contact — no session exists yet
    const session = getSession(phone);
    if (!session) {
      upsertSession(phone);
      console.log(`[webhook] First contact from ${phone}`);
      await sendWelcomeMessage(phone);
      return;
    }

    // Session exists — check if expired
    const lastActive = new Date(session.last_active.replace(' ', 'T') + 'Z');
    const elapsed    = Date.now() - lastActive.getTime();
    let history = [];
    if (elapsed <= SESSION_TIMEOUT_MS) {
      history = getHistory(phone, 20);
    } else {
      console.log(`[webhook] Session expired for ${phone} — starting fresh`);
    }

    upsertSession(phone);

    // ── Interactive menu: main options ────────────────────────────────────

    if (input.id === 'menu_buscar') {
      setContext(phone, { stage: 'category_select', intent: 'catalogo' });
      await sendListMessage(
        phone,
        '¿Qué línea de productos te interesa?',
        'Ver categorías',
        [{ title: 'Selecciona una línea', rows: CATEGORY_MENU_ROWS }]
      );
      return;
    }

    if (input.id === 'cat_impermeabilizante') {
      setContext(phone, { stage: 'surface_select', categoryId: 'impermeabilizante', intent: 'catalogo' });
      await sendListMessage(phone, '¿En qué superficie necesitas impermeabilizar?', 'Ver superficies',
        [{ title: 'Selecciona tu caso', rows: SURFACE_MENU_ROWS }]);
      return;
    }

    if (input.id === 'cat_griferia') {
      setContext(phone, { stage: 'location_select', categoryId: 'griferia', intent: 'catalogo' });
      await sendListMessage(phone, '¿Para qué área o uso necesitas grifería?', 'Ver áreas',
        [{ title: 'Selecciona el área', rows: UBICACION_MENU_ROWS_GRIFERIA }]);
      return;
    }

    if (input.id === 'cat_jardin') {
      setContext(phone, { stage: 'location_select', categoryId: 'jardin', intent: 'catalogo' });
      await sendListMessage(phone, '¿Qué tipo de producto de jardín buscas?', 'Ver tipos',
        [{ title: 'Selecciona el tipo', rows: UBICACION_MENU_ROWS_JARDIN }]);
      return;
    }

    if (input.id === 'menu_cotizar') {
      const ctx = { stage: 'chat', intent: 'precios' };
      setContext(phone, ctx);
      const prompt = buildSystemPrompt() + '\n\n' + buildClarifyingPrompt(ctx);
      const rawResponse = await getAIResponse(phone, input.text, [], ctx, prompt);
      const { cleanText } = parseAIResponse(rawResponse);
      addMessage(phone, 'user', input.text);
      addMessage(phone, 'assistant', cleanText);
      await sendMessage(phone, addSuffix(phone, cleanText));
      return;
    }

    if (input.id === 'menu_asesoria') {
      const ctx = { stage: 'chat', intent: 'asesoria' };
      setContext(phone, ctx);
      const prompt = buildSystemPrompt() + '\n\n' + buildClarifyingPrompt(ctx);
      const rawResponse = await getAIResponse(phone, input.text, [], ctx, prompt);
      const { cleanText } = parseAIResponse(rawResponse);
      addMessage(phone, 'user', input.text);
      addMessage(phone, 'assistant', cleanText);
      await sendMessage(phone, addSuffix(phone, cleanText));
      return;
    }

    // ── Interactive menu: surface selection ───────────────────────────────

    if (input.id?.startsWith('surf_')) {
      const surfaceId = input.id.replace('surf_', '');
      const products  = filterProducts('impermeabilizante', surfaceId);
      const ctx       = { stage: 'chat', intent: 'catalogo', categoryId: 'impermeabilizante', surfaceId };
      setContext(phone, ctx);
      const clarify = buildClarifyingPrompt(ctx);
      const prompt  = products.length > 0
        ? buildFocusedPrompt(products) + '\n\n' + clarify
        : buildSystemPrompt()          + '\n\n' + clarify;
      const rawResponse = await getAIResponse(phone, input.text, [], ctx, prompt);
      const { cleanText } = parseAIResponse(rawResponse);
      addMessage(phone, 'user', input.text);
      addMessage(phone, 'assistant', cleanText);
      await sendMessage(phone, addSuffix(phone, cleanText));
      return;
    }

    // ── Interactive menu: ubicación selection (grifería / jardín) ─────────

    if (input.id?.startsWith('ubi_')) {
      const locationId = input.id.replace('ubi_', '');
      const prevCtx    = getContext(phone);
      const categoryId = prevCtx?.categoryId ?? 'griferia';
      const products   = filterProducts(categoryId, locationId);
      const ctx        = { stage: 'chat', intent: 'catalogo', categoryId, locationId };
      setContext(phone, ctx);
      const clarify = buildClarifyingPrompt(ctx);
      const prompt  = products.length > 0
        ? buildFocusedPrompt(products) + '\n\n' + clarify
        : buildSystemPrompt()          + '\n\n' + clarify;
      const rawResponse = await getAIResponse(phone, input.text, [], ctx, prompt);
      const { cleanText } = parseAIResponse(rawResponse);
      addMessage(phone, 'user', input.text);
      addMessage(phone, 'assistant', cleanText);
      await sendMessage(phone, addSuffix(phone, cleanText));
      return;
    }

    // ── Legacy text shortcuts 1/2/3 ──────────────────────────────────────

    const LEGACY_MAP = { '1': 'catalogo', '2': 'precios', '3': 'asesoria' };
    if (input.kind === 'text' && LEGACY_MAP[input.text]) {
      const intent = LEGACY_MAP[input.text];
      const ctx    = { stage: 'chat', intent };
      setContext(phone, ctx);
      const prompt = buildSystemPrompt() + '\n\n' + buildClarifyingPrompt(ctx);
      const rawResponse = await getAIResponse(phone, input.text, [], ctx, prompt);
      const { cleanText } = parseAIResponse(rawResponse);
      addMessage(phone, 'user', input.text);
      addMessage(phone, 'assistant', cleanText);
      await sendMessage(phone, addSuffix(phone, cleanText));
      return;
    }

    // ── Normal AI flow ────────────────────────────────────────────────────

    const context     = getContext(phone);

    if (!context) {
      await sendWelcomeMessage(phone);
      return;
    }

    if (['category_select', 'surface_select', 'location_select'].includes(context.stage)) {
      const redirects = (context.menuRedirects || 0) + 1;
      if (redirects >= 5) {
        setContext(phone, { ...context, menuRedirects: 0 });
        await sendMessage(phone,
          `Parece que tenés problemas para usar el menú. Podés contactar directamente a uno de nuestros asesores: 👉 https://wa.me/${ESCALATION_NUMBER}`
        );
      } else {
        setContext(phone, { ...context, menuRedirects: redirects });
        await sendMessage(phone, 'Para ayudarte mejor, usá el menú:');
        await sendWelcomeMessage(phone);
      }
      return;
    }

    if (context.stage !== 'chat') {
      await sendWelcomeMessage(phone);
      return;
    }

    const clarify     = buildClarifyingPrompt(context);
    const subFilterId = context?.surfaceId || context?.locationId;
    const categoryId  = context?.categoryId ?? 'impermeabilizante';
    let prompt;
    if (subFilterId) {
      const products = filterProducts(categoryId, subFilterId);
      prompt = products.length > 0
        ? buildFocusedPrompt(products) + (clarify ? '\n\n' + clarify : '')
        : buildSystemPrompt()          + (clarify ? '\n\n' + clarify : '');
    } else {
      prompt = buildSystemPrompt() + (clarify ? '\n\n' + clarify : '');
    }

    const rawResponse = await getAIResponse(phone, input.text, history, context, prompt);
    const { cleanText, shouldEscalate, mediaId } = parseAIResponse(rawResponse);

    addMessage(phone, 'user', input.text);
    addMessage(phone, 'assistant', cleanText);

    await sendMessage(phone, addSuffix(phone, cleanText));

    if (shouldEscalate) {
      markEscalated(phone);
      setContext(phone, null);
      await sendMessage(phone, `👉 https://wa.me/${ESCALATION_NUMBER}`);
    }

    if (mediaId) {
      const product = getProductById(mediaId);
      if (product) {
        if (product.mediaVideo) {
          await sendVideo(phone, product.mediaVideo, `Video: ${product.nombre}`);
          await new Promise(r => setTimeout(r, 1500));
        }
        if (product.mediaPdf) {
          await sendPDF(
            phone,
            product.mediaPdf,
            `Ficha Tecnica ${product.nombre}`,
            `Ficha técnica: ${product.nombre}`
          );
        }
      }
    }

  } catch (err) {
    console.error('[webhook] Error handling message from', phone, ':', err.message);
    await sendMessage(phone,
      'Lo siento, tuve un problema técnico. Intenta de nuevo o contáctanos directamente.'
    );
  }
}

module.exports = { handle };
