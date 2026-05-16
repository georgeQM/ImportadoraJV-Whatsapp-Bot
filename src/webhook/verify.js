'use strict';

const WEBHOOK_VERIFY_TOKEN = process.env.WEBHOOK_VERIFY_TOKEN;

function verify(req, res) {
  const mode      = req.query['hub.mode'];
  const token     = req.query['hub.verify_token'];
  const challenge = req.query['hub.challenge'];

  console.log('[webhook] Verification attempt. Token match:', token === WEBHOOK_VERIFY_TOKEN);

  if (mode === 'subscribe' && token === WEBHOOK_VERIFY_TOKEN) {
    console.log('[webhook] Verified.');
    return res.status(200).send(challenge);
  }

  res.sendStatus(403);
}

module.exports = { verify };
