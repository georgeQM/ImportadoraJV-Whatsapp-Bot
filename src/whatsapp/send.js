'use strict';

const axios = require('axios');

// Read at module load — dotenv must be called before this module is required
const PHONE_NUMBER_ID = process.env.PHONE_NUMBER_ID;
const ACCESS_TOKEN    = process.env.ACCESS_TOKEN;
const BASE_URL        = `https://graph.facebook.com/v22.0/${PHONE_NUMBER_ID}/messages`;

async function sendMessage(to, text) {
  try {
    await axios.post(BASE_URL, {
      messaging_product: 'whatsapp',
      to,
      type: 'text',
      text: { body: text },
    }, {
      headers: { Authorization: `Bearer ${ACCESS_TOKEN}` },
    });
    console.log(`[send] Text sent to ${to}`);
  } catch (err) {
    console.error('[send] sendMessage error:', err.response?.data || err.message);
  }
}

async function sendVideo(to, mediaId, caption = '') {
  if (!mediaId) {
    console.warn('[send] sendVideo: no mediaId provided');
    return;
  }
  try {
    await axios.post(BASE_URL, {
      messaging_product: 'whatsapp',
      to,
      type: 'video',
      video: { id: mediaId, caption },
    }, {
      headers: {
        Authorization: `Bearer ${ACCESS_TOKEN}`,
        'Content-Type': 'application/json',
      },
    });
    console.log(`[send] Video sent to ${to}`);
  } catch (err) {
    console.error('[send] sendVideo error:', err.response?.data || err.message);
  }
}

async function sendPDF(to, mediaId, filename, caption = '') {
  if (!mediaId) {
    console.warn('[send] sendPDF: no mediaId provided');
    return;
  }
  try {
    await axios.post(BASE_URL, {
      messaging_product: 'whatsapp',
      to,
      type: 'document',
      document: { id: mediaId, caption, filename },
    }, {
      headers: { Authorization: `Bearer ${ACCESS_TOKEN}` },
    });
    console.log(`[send] PDF sent to ${to}: ${filename}`);
  } catch (err) {
    console.error('[send] sendPDF error:', err.response?.data || err.message);
  }
}

async function sendTemplate(to, templateName, language = 'es', params = []) {
  try {
    await axios.post(BASE_URL, {
      messaging_product: 'whatsapp',
      to,
      type: 'template',
      template: {
        name: templateName,
        language: { code: language },
        components: [{
          type: 'body',
          parameters: params.map(text => ({ type: 'text', text })),
        }],
      },
    }, {
      headers: { Authorization: `Bearer ${ACCESS_TOKEN}` },
    });
    console.log(`[send] Template "${templateName}" sent to ${to}`);
  } catch (err) {
    console.error('[send] sendTemplate error:', err.response?.data || err.message);
  }
}

module.exports = { sendMessage, sendVideo, sendPDF, sendTemplate };
