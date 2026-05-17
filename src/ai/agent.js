'use strict';

const { OpenAI } = require('openai');
const { buildSystemPrompt, buildClarifyingPrompt } = require('./context');

// Instantiated at module load — dotenv must run before server.js requires this
const client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

async function getAIResponse(_phone, userMessage, history, context = null, systemPrompt = null) {
  let prompt;
  if (systemPrompt) {
    prompt = systemPrompt;
  } else {
    const clarify = buildClarifyingPrompt(context);
    prompt = buildSystemPrompt() + (clarify ? '\n\n' + clarify : '');
  }

  const messages = [
    { role: 'system', content: prompt },
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
