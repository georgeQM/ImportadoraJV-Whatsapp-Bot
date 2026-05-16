'use strict';

const HOURS_START = parseInt(process.env.BUSINESS_HOURS_START || '8', 10);
const HOURS_END   = parseInt(process.env.BUSINESS_HOURS_END   || '18', 10);

// Bolivia is UTC-4, no DST
const BOLIVIA_OFFSET_HOURS = -4;

function boliviaTime() {
  const now = new Date();
  const utc = now.getTime() + now.getTimezoneOffset() * 60000;
  return new Date(utc + BOLIVIA_OFFSET_HOURS * 3600000);
}

function isBusinessHours() {
  const h = boliviaTime().getHours();
  return h >= HOURS_START && h < HOURS_END;
}

function getHoursMessage() {
  if (isBusinessHours()) {
    return `Estamos en horario de atención (${HOURS_START}:00 - ${HOURS_END}:00, hora Bolivia). Los asesores están disponibles.`;
  }
  return `Fuera del horario de atención (${HOURS_START}:00 - ${HOURS_END}:00, hora Bolivia). Responderemos tu consulta, y un asesor te contactará en horario hábil.`;
}

module.exports = { isBusinessHours, getHoursMessage, boliviaTime };
