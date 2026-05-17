'use strict';

const { getCachedContent } = require('../db/queries');
const { getHoursMessage, boliviaTime } = require('../utils/hours');

const catalogo = require('../../catalogo.json');

const ESCALATION_NUMBER      = process.env.ESCALATION_NUMBER;
const ESCALATION_NUMBER_TECH = process.env.ESCALATION_NUMBER_TECH;

const FALLBACK_COMPANY_INFO =
  'Importadora JV es una empresa boliviana distribuidora oficial de productos impermeabilizantes y plomería. ' +
  'Marcas: Viapol, Viqua, Plasbohn. Ofrecen membranas asfálticas, aditivos, selladores y accesorios de plomería.';

function formatProductCatalog() {
  return catalogo
    .slice()
    .sort((a, b) => Number(a.id) - Number(b.id))
    .map(p => {
      const lines = [];

      lines.push(`[ID:${p.id}] ${p.nombre} (${p.marca})`);

      if (p.superficies?.length)
        lines.push(`Superficies: ${p.superficies.join(', ')}`);

      if (p.problema?.length)
        lines.push(`Problemas que resuelve: ${p.problema.join(', ')}`);

      if (p.descripcion)
        lines.push(`Descripción: ${p.descripcion}`);

      const rendParts = [];
      const rendVal = p.rendimiento_kg_m2 ?? p.rendimiento_m2_por_unidad;
      if (rendVal != null) {
        const unit = p.rendimiento_kg_m2 != null ? 'kg/m²' : 'm²/unidad';
        rendParts.push(`Rendimiento: ${rendVal} ${unit}`);
      }
      if (p.presentaciones?.length)
        rendParts.push(`Presentaciones: ${p.presentaciones.join(', ')}`);
      if (rendParts.length)
        lines.push(rendParts.join('. '));

      if (p.rendimiento_nota)
        lines.push(`Nota de rendimiento: ${p.rendimiento_nota}`);

      if (p.no_usar_para?.length)
        lines.push(`No usar para: ${p.no_usar_para.join(', ')}`);

      if (p.linkWeb)
        lines.push(`Más info: ${p.linkWeb}`);

      return lines.join('\n');
    })
    .join('\n\n');
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

function buildContextPrompt(context) {
  if (!context) return '';
  const map = {
    catalogo:  'El usuario quiere ver el catálogo. NO listes todos los productos. En cambio, pregúntale qué problema de humedad o filtración tiene o en qué superficie necesita impermeabilizar, y recomiéndale los 2-3 productos más relevantes según su respuesta. Máximo 3 productos a la vez.',
    precios:   'El usuario pregunta por una cotización. Explica que los precios varían según el producto y cantidad. Pregúntale qué producto le interesa y en qué cantidad para poder darle una referencia más precisa o conectarlo con un asesor si lo necesita. No incluyas [ESCALATE] todavía — solo escalá cuando el usuario confirme que quiere la cotización y sabe que productos y cantidades quiere.',
    asesoria:  'El usuario tiene una duda técnica o problema de humedad. Pregúntale qué tipo de superficie tiene y qué problema experimenta para recomendarle el producto más adecuado.',
  };
  return map[context] || '';
}

module.exports = { buildSystemPrompt, buildContextPrompt };
