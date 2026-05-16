'use strict';

const { getCachedContent } = require('../db/queries');
const { getAllProducts } = require('../whatsapp/media');
const { getHoursMessage, boliviaTime } = require('../utils/hours');

const ESCALATION_NUMBER      = process.env.ESCALATION_NUMBER;
const ESCALATION_NUMBER_TECH = process.env.ESCALATION_NUMBER_TECH;

const FALLBACK_COMPANY_INFO =
  'Importadora JV es una empresa boliviana distribuidora oficial de productos impermeabilizantes y plomería. ' +
  'Marcas: Viapol, Viqua, Plasbohn. Ofrecen membranas asfálticas, aditivos, selladores y accesorios de plomería.';

function formatProductCatalog() {
  return getAllProducts()
    .sort((a, b) => a.id - b.id)
    .map(p => `[ID:${p.id}] ${p.nombre}: ${p.descripcion}. Más info: ${p.linkWeb || 'N/A'}`)
    .join('\n');
}

function formatCurrentTime() {
  const now = boliviaTime();
  const pad = n => String(n).padStart(2, '0');
  const months = ['enero','febrero','marzo','abril','mayo','junio',
                  'julio','agosto','septiembre','octubre','noviembre','diciembre'];
  return `${now.getDate()} de ${months[now.getMonth()]}, ${pad(now.getHours())}:${pad(now.getMinutes())}`;
}

function buildSystemPrompt() {
  const crawledContent = getCachedContent() || FALLBACK_COMPANY_INFO;
  const productCatalog = formatProductCatalog();
  const currentTime    = formatCurrentTime();
  const hoursMessage   = getHoursMessage();

  return `Eres el asistente virtual de Importadora JV, una empresa boliviana especializada en productos impermeabilizantes y accesorios de plomería.

Responde en español, de forma natural y profesional. No reveles que eres una IA a menos que te lo pregunten directamente. Si te preguntan, di que eres un asistente virtual.

INFORMACIÓN DE LA EMPRESA:
${crawledContent}

CATÁLOGO DE PRODUCTOS:
${productCatalog}

CONTACTO Y ESCALAMIENTO:
- Para pedidos, cotizaciones o cuando el usuario necesite un humano: +${ESCALATION_NUMBER}
- Para consultas técnicas o de distribuidores: +${ESCALATION_NUMBER_TECH}
- Cuando necesites escalar a un humano, incluye exactamente esta etiqueta en tu respuesta: [ESCALATE]
- Cuando el usuario pida el PDF o video de un producto específico, incluye: [MEDIA:id] usando el ID numérico del catálogo

HORA ACTUAL: ${currentTime} (Bolivia, UTC-4)
HORARIO DE ATENCIÓN: ${hoursMessage}

REGLAS DE COMPORTAMIENTO:
- Responde siempre la pregunta del usuario primero, luego ofrece escalamiento si es necesario
- Si no sabes algo específico, dilo y ofrece conectar con un humano [ESCALATE]
- Respuestas concisas — esto es WhatsApp, no email
- Nunca inventes precios ni disponibilidades que no tengas en el catálogo
- Para solicitudes de cotización: recopila nombre del producto, cantidad y ciudad antes de escalar`;
}

module.exports = { buildSystemPrompt };
