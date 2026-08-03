// Redactor de plantillas de WhatsApp con IA.
//
// QUÉ HACE Y QUÉ NO: el modelo escribe el TEXTO —encabezado, cuerpo, pie y
// botones— a partir de un objetivo en lenguaje llano. Lo que NO hace es decidir
// si el resultado es válido: eso lo dice `templateSpec.validateTemplate`, y si
// el modelo se pasó de los 1024 caracteres o dejó una variable al final del
// cuerpo, se le devuelven los errores y se reintenta.
//
// POR QUÉ ESE BUCLE Y NO CONFIAR EN EL PROMPT: las reglas de Meta son
// aritméticas —longitudes exactas, numeración sin saltos, posición de las
// variables— y un modelo de lenguaje las incumple con naturalidad aunque se le
// pidan. Comprobarlas con código y reintentar cuesta una llamada de más; mandarle
// a Meta una plantilla inválida cuesta un rechazo, y los rechazos bajan la
// calificación de calidad de la cuenta de WhatsApp.
//
// La voz sale de `institutionalVoice.js`, la misma del Generador de
// Publicaciones y del Creador de Reels. Si se escribiera una voz propia acá, la
// plataforma hablaría distinto según por dónde saliera el mensaje.
import { INSTITUTIONAL_VOICE } from './institutionalVoice.js';
import { generateCopy } from '../services/copywritingService.js';
import { TEMPLATE_VARIABLES } from './journeySpec.js';
import {
  LIMITS, BUTTON_TYPE_KEYS, folderByKey, normalizeTemplateName,
  validateTemplate, extractVariables,
} from './templateSpec.js';

const MAX_ATTEMPTS = 3;

/** Los datos que el motor sabe resolver. El modelo sólo puede usar estos. */
const variableCatalog = () =>
  TEMPLATE_VARIABLES.map(v => `- ${v.token}: ${v.label}`).join('\n');

function buildSystemPrompt() {
  return `${INSTITUTIONAL_VOICE}

Escribís PLANTILLAS de WhatsApp Business para Club Platform, la plataforma que da sitios web y herramientas digitales a clubes Rotarios. Quien recibe el mensaje es un dirigente del club: presidente, secretario, tesorero o encargado de comunicaciones.

REGLAS DE FORMATO QUE META EXIGE (si se incumplen, la plantilla se rechaza):
- Cuerpo: máximo ${LIMITS.body} caracteres. Apuntá a menos de 400: en WhatsApp lo largo no se lee.
- Encabezado de texto: máximo ${LIMITS.header} caracteres. Es opcional.
- Pie: máximo ${LIMITS.footer} caracteres, SIN variables. Es opcional.
- Botones: máximo ${LIMITS.buttons}; como máximo ${LIMITS.urlButtons} de enlace y ${LIMITS.phoneButtons} de llamada. Texto de botón: máximo ${LIMITS.buttonText} caracteres.
- Variables: se escriben {{1}}, {{2}}… numeradas desde 1 y SIN saltos.
- El cuerpo NO puede empezar ni terminar con una variable, y no puede haber dos variables seguidas.

DATOS DISPONIBLES para las variables (no inventes otros):
${variableCatalog()}

CÓMO ESCRIBIR:
- Español neutro, tratando de "vos" o de "usted" de forma consistente con el idioma pedido.
- Concreto y humano. Nada de "¡No te lo pierdas!" ni signos de exclamación encadenados.
- Una sola idea por mensaje y una sola acción esperada.
- Los emojis, como mucho uno o dos, y sólo si aportan.
- Nunca prometas lo que la plataforma no hace.

BOTONES:
- Preferí "QUICK_REPLY" cuando quieras saber la reacción: es lo ÚNICO medible. Meta NO reporta el clic en un botón de enlace.
- Usá "URL" sólo cuando el objetivo sea llevar a una página concreta.

Devolvés SIEMPRE un JSON válido con esta forma exacta:
{
  "displayName": "Nombre legible para el equipo",
  "name": "nombre_tecnico_en_minusculas",
  "headerType": "NONE" | "TEXT",
  "headerContent": "texto del encabezado o null",
  "bodyText": "cuerpo con {{1}} donde corresponda",
  "footerText": "pie o null",
  "buttons": [{ "type": "QUICK_REPLY" | "URL", "text": "...", "url": "..." }],
  "variableTokens": ["nombre_contacto", "..."],
  "variableSamples": ["María", "..."],
  "rationale": "Una frase: por qué está escrito así."
}

"variableTokens" lleva UN token por cada {{n}}, EN ORDEN: el primero alimenta {{1}}.
"variableSamples" lleva un valor de ejemplo realista por cada variable — Meta los exige para aprobar.`;
}

function buildUserPrompt({ goal, folder, language, tone, audience, includeButtons, extraContext }) {
  const f = folderByKey(folder);
  const lines = [
    `Objetivo del mensaje: ${goal}`,
    f ? `Momento del ciclo de vida: ${f.label}. ${f.hint}` : null,
    `Idioma: ${language === 'en' ? 'inglés' : language === 'pt' ? 'portugués' : 'español'}`,
    audience ? `Quién lo recibe: ${audience}` : null,
    tone ? `Tono pedido: ${tone}` : null,
    includeButtons === false ? 'No incluyas botones.' : 'Incluí uno o dos botones si ayudan a la acción.',
    extraContext ? `Contexto adicional del equipo: ${extraContext}` : null,
  ].filter(Boolean);
  return lines.join('\n');
}

function parseJson(raw) {
  const text = String(raw || '').trim();
  // Los modelos suelen envolver el JSON en un bloque de código.
  const fenced = text.match(/```(?:json)?\s*([\s\S]*?)```/);
  const candidate = fenced ? fenced[1] : text;
  const start = candidate.indexOf('{');
  const end = candidate.lastIndexOf('}');
  if (start === -1 || end === -1) throw new Error('El modelo no devolvió JSON.');
  return JSON.parse(candidate.slice(start, end + 1));
}

/** Ajustes mecánicos que no hace falta pedirle al modelo dos veces. */
function normalizeDraft(draft, { folder, language }) {
  const f = folderByKey(folder);
  const headerType = String(draft.headerType || 'NONE').toUpperCase() === 'TEXT' ? 'TEXT' : 'NONE';

  const buttons = (Array.isArray(draft.buttons) ? draft.buttons : [])
    .filter(b => b && BUTTON_TYPE_KEYS.includes(String(b.type).toUpperCase()))
    .map(b => ({
      type: String(b.type).toUpperCase(),
      text: String(b.text || '').slice(0, LIMITS.buttonText),
      ...(String(b.type).toUpperCase() === 'URL' ? { url: b.url || '' } : {}),
      ...(String(b.type).toUpperCase() === 'PHONE_NUMBER' ? { phoneNumber: b.phoneNumber || '' } : {}),
    }))
    .slice(0, LIMITS.buttons);

  const bodyText = String(draft.bodyText || '').trim();
  const varCount = [...new Set(extractVariables(bodyText))].length;
  const tokens = (Array.isArray(draft.variableTokens) ? draft.variableTokens : []).map(String).slice(0, varCount);
  const samples = (Array.isArray(draft.variableSamples) ? draft.variableSamples : []).map(String).slice(0, varCount);

  return {
    displayName: String(draft.displayName || '').trim() || 'Plantilla sin nombre',
    name: normalizeTemplateName(draft.name || draft.displayName),
    // La categoría de Meta la decide la CARPETA, no el modelo: es una cuestión
    // de política y de costo —marketing exige consentimiento y se cobra más—,
    // no de redacción.
    category: f?.metaCategory || 'UTILITY',
    folder: folder || null,
    language: language || 'es',
    headerType,
    headerContent: headerType === 'TEXT' ? String(draft.headerContent || '').slice(0, LIMITS.header) : null,
    bodyText,
    footerText: draft.footerText ? String(draft.footerText).slice(0, LIMITS.footer) : null,
    buttons,
    variableTokens: tokens,
    variableSamples: samples,
    rationale: draft.rationale ? String(draft.rationale) : null,
  };
}

/**
 * Redacta una plantilla.
 *
 * Devuelve { template, validation, attempts, provider }. Si tras los reintentos
 * sigue habiendo errores, se devuelve igual con `validation.errors` cargado: el
 * operador ve el borrador y qué le falta, en vez de recibir un fallo pelado. Lo
 * que NO va a pasar es que una plantilla inválida se mande a Meta — eso lo
 * bloquea el endpoint de envío, que revalida.
 */
export async function composeTemplate({
  goal,
  folder = null,
  language = 'es',
  tone = null,
  audience = null,
  includeButtons = true,
  extraContext = null,
  provider = undefined,
} = {}) {
  if (!goal || !String(goal).trim()) {
    const err = new Error('Decinos qué tiene que lograr el mensaje.');
    err.status = 400;
    throw err;
  }

  const system = buildSystemPrompt();
  let userText = buildUserPrompt({ goal, folder, language, tone, audience, includeButtons, extraContext });

  let last = null;
  let lastValidation = null;

  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
    const raw = await generateCopy({
      system,
      userText,
      temperature: attempt === 1 ? 0.7 : 0.4, // al reintentar se busca precisión, no variedad
      maxTokens: 1200,
      jsonMode: true,
      ...(provider ? { provider } : {}),
    });

    let draft;
    try {
      draft = parseJson(typeof raw === 'string' ? raw : raw?.text || raw?.content || '');
    } catch (e) {
      lastValidation = { errors: [`El modelo no devolvió un JSON legible: ${e.message}`], warnings: [], ok: false };
      userText = `${userText}\n\nTu respuesta anterior no era JSON válido. Devolvé SOLO el objeto JSON, sin texto alrededor.`;
      continue;
    }

    const template = normalizeDraft(draft, { folder, language });
    const validation = validateTemplate(template);
    last = template;
    lastValidation = validation;

    if (validation.ok) return { template, validation, attempts: attempt };

    // Se le devuelven los errores CONCRETOS. Pedirle "revisá el formato" a secas
    // no corrige nada: hay que decirle qué regla incumplió y con qué número.
    userText = `${buildUserPrompt({ goal, folder, language, tone, audience, includeButtons, extraContext })}

Tu intento anterior fue rechazado por estas razones. Corregilas TODAS y devolvé el JSON de nuevo:
${validation.errors.map(e => `- ${e}`).join('\n')}

Este era el cuerpo que escribiste (${template.bodyText.length} caracteres):
"""${template.bodyText}"""`;
  }

  return { template: last, validation: lastValidation, attempts: MAX_ATTEMPTS };
}

/**
 * Redacta VARIAS plantillas de una vez, una por cada paso de un recorrido.
 *
 * Es el caso real: un recorrido de renovación tiene nueve pasos y cada uno
 * declara en `templateHint` qué debe decir el suyo. Pedirlas de a una obligaría
 * a repetir el objetivo nueve veces a mano.
 *
 * Se generan EN SERIE y no en paralelo a propósito: son llamadas a un proveedor
 * de lenguaje con límite de tasa, y nueve simultáneas se llevan un 429 que
 * dejaría la mitad sin redactar.
 */
export async function composeForJourney({ journey, folder = null, language = 'es', provider = undefined }) {
  const steps = (journey?.nodes || []).filter(n => n.type === 'send_template');
  const results = [];

  for (const node of steps) {
    try {
      const out = await composeTemplate({
        goal: node.templateHint || `Paso "${node.id}" del recorrido "${journey.name}".`,
        folder,
        language,
        audience: 'Dirigentes de un club Rotario que usa Club Platform',
        extraContext: `Forma parte del recorrido "${journey.name}"${journey.goal ? `, cuyo objetivo es: ${journey.goal}` : ''}. Este paso es "${node.id}".`,
        includeButtons: true,
        provider,
      });
      results.push({ nodeId: node.id, ...out });
    } catch (err) {
      // Un paso que falla no puede tumbar los otros ocho.
      results.push({ nodeId: node.id, error: err.message, template: null, validation: null });
    }
  }

  return results;
}

export default { composeTemplate, composeForJourney };
