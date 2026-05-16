'use strict';

const { getAIResponse }                                          = require('../ai/agent');
const { parseAIResponse }                                        = require('../ai/escalation');
const { addMessage, getHistory, getSession, upsertSession,
        markEscalated, deleteHistory, deleteSession }            = require('../db/queries');
const { sendMessage, sendVideo, sendPDF }                        = require('../whatsapp/send');
const { getProductById }                                         = require('../whatsapp/media');

const ESCALATION_NUMBER   = process.env.ESCALATION_NUMBER;
const SESSION_TIMEOUT_MS  = 24 * 60 * 60 * 1000;

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
    // Reset command — wipe history + session, start fresh
    if (['reiniciar', 'reset'].includes(userText.toLowerCase())) {
      deleteHistory(phone);
      deleteSession(phone);
      console.log(`[webhook] Reset by ${phone}`);
      await sendMessage(phone,
        '✅ Tu conversación ha sido reiniciada. ¡Hola de nuevo! ¿En qué te puedo ayudar?'
      );
      return;
    }

    // Load session; compute whether it has expired
    const session = getSession(phone);
    let history = [];

    if (session) {
      const lastActive   = new Date(session.last_active.replace(' ', 'T') + 'Z');
      const elapsed      = Date.now() - lastActive.getTime();
      if (elapsed <= SESSION_TIMEOUT_MS) {
        history = getHistory(phone, 20);
      } else {
        console.log(`[webhook] Session expired for ${phone} — starting fresh`);
      }
    }

    upsertSession(phone);

    const rawResponse = await getAIResponse(phone, userText, history);
    const { cleanText, shouldEscalate, mediaId } = parseAIResponse(rawResponse);

    // Persist conversation
    addMessage(phone, 'user', userText);
    addMessage(phone, 'assistant', cleanText);

    // Send AI reply
    await sendMessage(phone, cleanText);

    // Handle escalation signal
    if (shouldEscalate) {
      markEscalated(phone);
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
