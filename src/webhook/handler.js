'use strict';

const { getAIResponse }                                          = require('../ai/agent');
const { parseAIResponse }                                        = require('../ai/escalation');
const { addMessage, getHistory, getSession, upsertSession,
        markEscalated, deleteHistory, deleteSession,
        setContext, getContext }                                  = require('../db/queries');
const { sendMessage, sendVideo, sendPDF }                        = require('../whatsapp/send');
const { getProductById }                                         = require('../whatsapp/media');

const ESCALATION_NUMBER   = process.env.ESCALATION_NUMBER;
const SESSION_TIMEOUT_MS  = 24 * 60 * 60 * 1000;

const WELCOME_MESSAGE =
  '¡Hola! Bienvenido a Importadora JV. 👋\n\n' +
  'Soy tu asesor y estoy aquí para ayudarte.\n\n' +
  '*1.* Catálogo de productos\n' +
  '*2.* Precios estimados\n' +
  '*3.* Dudas técnicas o problemas de humedad\n\n' +
  'Para ver nuestro catalogo e información ingresa a\n' +
  '🌐 importadorajv.com\n\n' +
  '¿Con qué te ayudo?';

async function handle(req, res) {
  const body = req.body;

  if (!(body.object && body.entry?.[0]?.changes?.[0]?.value?.messages?.[0])) {
    return res.sendStatus(404);
  }

  const message  = body.entry[0].changes[0].value.messages[0];
  const phone    = message.from;
  const userText = message.text?.body?.trim() || '';

  // Respond immediately — WhatsApp requires 200 within 15s
  res.sendStatus(200);

  // Ignore non-text messages (images, voice, stickers, etc.)
  if (!userText) return;

  console.log(`[webhook] From ${phone}: "${userText}"`);

  try {
    // Reset command — wipe history + session, restart with welcome
    if (['reiniciar', 'reset'].includes(userText.toLowerCase())) {
      deleteHistory(phone);
      deleteSession(phone);
      upsertSession(phone);
      console.log(`[webhook] Reset by ${phone}`);
      await sendMessage(phone, WELCOME_MESSAGE);
      return;
    }

    // First contact — no session exists yet
    const session = getSession(phone);
    if (!session) {
      upsertSession(phone);
      console.log(`[webhook] First contact from ${phone}`);
      await sendMessage(phone, WELCOME_MESSAGE);
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

    const CONTEXT_MAP = { '1': 'catalogo', '2': 'precios', '3': 'asesoria' };
    if (CONTEXT_MAP[userText]) {
      const contextVal = CONTEXT_MAP[userText];
      setContext(phone, contextVal);
      const rawResponse = await getAIResponse(phone, userText, [], contextVal);
      const { cleanText } = parseAIResponse(rawResponse);
      addMessage(phone, 'user', userText);
      addMessage(phone, 'assistant', cleanText);
      await sendMessage(phone, cleanText);
      return;
    }

    const context = getContext(phone);
    const rawResponse = await getAIResponse(phone, userText, history, context);
    const { cleanText, shouldEscalate, mediaId } = parseAIResponse(rawResponse);

    // Persist conversation
    addMessage(phone, 'user', userText);
    addMessage(phone, 'assistant', cleanText);

    // Send AI reply
    await sendMessage(phone, cleanText);

    // Handle escalation signal
    if (shouldEscalate) {
      markEscalated(phone);
      setContext(phone, null);
      await sendMessage(phone, `👉 https://wa.me/${ESCALATION_NUMBER}`);
    }

    // Handle media-on-demand signal
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
