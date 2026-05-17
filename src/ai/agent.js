'use strict';

const { OpenAI } = require('openai');
const { buildSystemPrompt, buildContextPrompt } = require('./context');

// Instantiated at module load — dotenv must run before server.js requires this
const client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

/**
 * @param {string} _phone  Reserved for future per-user customization
 * @param {string} userMessage
 * @param {{ role: string, content: string }[]} history  Prior messages, oldest first
 * @returns {Promise<string>}
 */
async function getAIResponse(_phone, userMessage, history, context = null) {
  const contextExtra = buildContextPrompt(context);
  const systemPrompt = buildSystemPrompt() + (contextExtra ? '\n\n' + contextExtra : '');

  const messages = [
    { role: 'system', content: systemPrompt },
    ...history,
    { role: 'user', content: userMessage },
  ];

  const completion = await client.chat.completions.create({
    model: 'gpt-4o-mini',
    messages,
    max_tokens: 800,
    temperature: 0.7,
  });

  return completion.choices[0].message.content;
}

module.exports = { getAIResponse };
