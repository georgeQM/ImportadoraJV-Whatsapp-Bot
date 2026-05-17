'use strict';

const axios = require('axios');

const PHONE_NUMBER_ID = process.env.PHONE_NUMBER_ID;
const ACCESS_TOKEN    = process.env.ACCESS_TOKEN;
const BASE_URL        = `https://graph.facebook.com/v22.0/${PHONE_NUMBER_ID}/messages`;

async function sendListMessage(to, bodyText, buttonLabel, sections) {
  try {
    await axios.post(BASE_URL, {
      messaging_product: 'whatsapp',
      to,
      type: 'interactive',
      interactive: {
        type: 'list',
        body: { text: bodyText },
        action: { button: buttonLabel, sections },
      },
    }, {
      headers: { Authorization: `Bearer ${ACCESS_TOKEN}` },
    });
    console.log(`[send] List message sent to ${to}`);
  } catch (err) {
    console.error('[send] sendListMessage error:', err.response?.data || err.message);
  }
}

async function sendReplyButtons(to, bodyText, buttons) {
  try {
    await axios.post(BASE_URL, {
      messaging_product: 'whatsapp',
      to,
      type: 'interactive',
      interactive: {
        type: 'button',
        body: { text: bodyText },
        action: {
          buttons: buttons.map(b => ({ type: 'reply', reply: { id: b.id, title: b.title } })),
        },
      },
    }, {
      headers: { Authorization: `Bearer ${ACCESS_TOKEN}` },
    });
    console.log(`[send] Reply buttons sent to ${to}`);
  } catch (err) {
    console.error('[send] sendReplyButtons error:', err.response?.data || err.message);
  }
}

module.exports = { sendListMessage, sendReplyButtons };
