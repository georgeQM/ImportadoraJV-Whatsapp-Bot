'use strict';

/**
 * Strip action tags from AI response and extract their signals.
 * @param {string} response  Raw AI response text
 * @returns {{ cleanText: string, shouldEscalate: boolean, mediaId: string|null }}
 */
function parseAIResponse(response) {
  let cleanText = response;
  let shouldEscalate = false;
  let mediaId = null;
  let cotizacionSummary = null;

  if (cleanText.includes('[ESCALATE]')) {
    shouldEscalate = true;
    cleanText = cleanText.replace(/\[ESCALATE\]/g, '').trim();
  }

  const mediaMatch = cleanText.match(/\[MEDIA:(\d+)\]/);
  if (mediaMatch) {
    mediaId = mediaMatch[1];
    cleanText = cleanText.replace(/\[MEDIA:\d+\]/g, '').trim();
  }

  const cotizacionMatch = cleanText.match(/\[COTIZACION:([\s\S]+?)\]/);
  if (cotizacionMatch) {
    cotizacionSummary = cotizacionMatch[1].trim();
    cleanText = cleanText.replace(/\[COTIZACION:[\s\S]+?\]/g, '').trim();
  }

  return { cleanText, shouldEscalate, mediaId, cotizacionSummary };
}

module.exports = { parseAIResponse };
