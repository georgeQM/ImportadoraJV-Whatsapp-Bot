'use strict';

const { getHoursMessage, boliviaTime } = require('../utils/hours');


const ESCALATION_NUMBER      = process.env.ESCALATION_NUMBER;
const ESCALATION_NUMBER_TECH = process.env.ESCALATION_NUMBER_TECH;

function formatProductCatalog(products = null) {
  return products
    .slice()
    .sort((a, b) => Number(a.id) - Number(b.id))
    .map(p => {
      const lines = [];

      lines.push(`[ID:${p.id}] ${p.nombre} (${p.marca})`);

      if (p.superficies?.length)
        lines.push(`Superficies: ${p.superficies.join(', ')}`);

      if (p.problema?.length)
        lines.push(`Problemas que resuelve: ${p.problema.join(', ')}`);

      if (p.ubicacion?.length)
        lines.push(`Ubicación: ${p.ubicacion.join(', ')}`);

      if (p.tipo?.length)
        lines.push(`Tipo: ${p.tipo.join(', ')}`);

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

function buildSystemPromptWith(products = null) {
  const currentTime  = formatCurrentTime();
  const hoursMessage = getHoursMessage();

  const catalogSection = products
    ? `CATÁLOGO DE PRODUCTOS:\n${formatProductCatalog(products)}`
    : 'Para recomendar productos específicos, el sistema de menús guiará al usuario a seleccionar su categoría y área de interés. No listes productos hasta que el usuario haya seleccionado una categoría.';

  return `Eres el asistente virtual de Importadora JV, una empresa boliviana especializada en productos impermeabilizantes y accesorios de plomería.

Responde en español, de forma natural y profesional. No reveles que eres una IA a menos que te lo pregunten directamente. Si te preguntan, di que eres un asistente virtual.

Importadora JV es distribuidora oficial de Viapol, Viqua y Plasbohn en Bolivia. Vende productos impermeabilizantes, grifería y accesorios de plomería.

${catalogSection}

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

function buildSystemPrompt() {
  return buildSystemPromptWith(null);
}

function buildFocusedPrompt(products) {
  return buildSystemPromptWith(products);
}

function buildClarifyingPrompt(contextObj) {
  if (!contextObj) return '';
  const { intent, surfaceId, locationId } =
    (typeof contextObj === 'object') ? contextObj : { intent: contextObj };
  const hasSubFilter = !!(surfaceId || locationId);
  const map = {
    catalogo: hasSubFilter
      ? 'El usuario ya indicó su área de interés. Recomienda 2-3 productos del catálogo filtrado. Sé específico sobre aplicaciones y diferencias.'
      : 'Pregúntale qué necesita o dónde lo va a usar para recomendarle los productos más adecuados.',
    precios:  'El usuario pregunta por una cotización. Explica que los precios varían según el producto y cantidad. Pregúntale qué producto le interesa y en qué cantidad. No incluyas [ESCALATE] todavía — solo escalá cuando el usuario confirme que quiere la cotización y sepa qué productos y cantidades quiere.',
    asesoria: 'El usuario tiene una duda técnica. Pregúntale qué tipo de producto o área le interesa para orientarlo mejor.',
  };
  return map[intent] || '';
}

module.exports = { buildSystemPrompt, buildFocusedPrompt, buildClarifyingPrompt };
