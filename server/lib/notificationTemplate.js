// ════════════════════════════════════════════════════════════════════
// Notificaciones de Contribuciones — la PLANTILLA
// v4.856.0 (Fase 1)
//
// Puro: sin base, sin red, sin DOM. Compone el correo a partir de BLOQUES
// declarados, no de HTML libre.
//
// ── POR QUÉ BLOQUES Y NO UN EDITOR DE HTML ──────────────────────────
//
// Esto lo edita un administrador y se renderiza en el cliente de correo de un
// tercero. HTML arbitrario ahí es una inyección con pasos extra: un `<script>`
// no corre en Gmail, pero un `<a>` con destino ajeno, un `<img>` que llama a
// un servidor de terceros o un `<style>` que tapa el contenido, sí. Con
// bloques, el HTML lo escribimos NOSOTROS y del administrador sólo entra
// TEXTO, que se escapa. Es la misma decisión que `MASK_SHAPES` en Plantillas
// IA: catálogo cerrado en vez de un campo libre.
//
// ── EL RENDER ES DETERMINISTA ───────────────────────────────────────
//
// Ninguna parte de esto le pregunta nada a un modelo. Un correo transaccional
// que dijera algo distinto en cada envío no se puede revisar ni aprobar, y
// éste lleva cifras de dinero.
// ════════════════════════════════════════════════════════════════════
import { hexOrNull, normalizeEmail } from './notificationSpec.js';

/* ─── LAS VARIABLES ──────────────────────────────────────────────────
 *
 * Catálogo CERRADO, con el ejemplo que se usa en la vista previa. Una variable
 * que no esté acá no se sustituye: queda literal y se REPORTA, en vez de
 * borrarse. Un `{{monto}}` impreso se ve y se corrige; un hueco donde iba el
 * monto se publica sin que nadie lo note.
 *
 * `available:false` marca las que todavía no se pueden llenar — se ofrecen
 * igual en la ayuda para no prometer que no existen, pero el validador avisa
 * si se usan.
 */
export const TEMPLATE_VARIABLES = [
    { id: 'donor_name', label: 'Nombre del aportante', sample: 'Rodrigo Díaz', available: true },
    { id: 'donor_email', label: 'Correo del aportante', sample: 'rodrigo@ejemplo.com', available: true },
    { id: 'amount', label: 'Monto', sample: '50.000', available: true },
    { id: 'currency', label: 'Moneda', sample: 'COP', available: true },
    { id: 'campaign_name', label: 'Nombre de la campaña', sample: 'Emergencia Terremoto Colombia 2026', available: true },
    { id: 'campaign_url', label: 'Dirección de la campaña', sample: 'https://rotary4281.org/maneras-de-contribuir', available: true },
    { id: 'site_name', label: 'Sitio de origen', sample: 'Rotary Distrito 4281', available: true },
    { id: 'beneficiary_name', label: 'Entidad beneficiaria', sample: 'Fundación Colombiana de Rotarios — Colrotarios', available: true },
    { id: 'contribution_id', label: 'Referencia del aporte', sample: 'a1b2c3d4', available: true },
    { id: 'payment_reference', label: 'Referencia del pago', sample: 'pi_3Qx…', available: true },
    { id: 'contribution_date', label: 'Fecha del aporte', sample: '17 de agosto de 2026', available: true },
    { id: 'donor_message', label: 'Mensaje del aportante', sample: 'Con cariño para las familias del Chocó.', available: true },
    { id: 'receipt_url', label: 'Recibo del procesador', sample: 'https://pay.stripe.com/receipts/…', available: true },
];

export const VARIABLE_IDS = TEMPLATE_VARIABLES.map(v => v.id);
export const isKnownVariable = (id) => VARIABLE_IDS.includes(id);

/** Los valores de ejemplo de la vista previa. Son los que pidió el cliente en
 *  el criterio 16, con sus nombres. */
export const sampleVariables = () =>
    Object.fromEntries(TEMPLATE_VARIABLES.map(v => [v.id, v.sample]));

/* ─── LOS BLOQUES ────────────────────────────────────────────────────
 *
 * Cada uno declara qué campos admite. Lo que no esté declarado no se puede
 * expresar en el documento: es la misma protección estructural que
 * `OVERRIDE_WHITELIST` en las campañas — esconder un control no sirve, quien
 * conoce el endpoint se lo saltea.
 */
export const BLOCK_TYPES = [
    { id: 'logo', label: 'Logotipo', fields: ['align'] },
    { id: 'heading', label: 'Encabezado', fields: ['text', 'align'] },
    { id: 'paragraph', label: 'Párrafo', fields: ['text', 'align'] },
    { id: 'summary', label: 'Resumen del aporte', fields: ['title'] },
    { id: 'quote', label: 'Mensaje del aportante', fields: ['title'] },
    { id: 'button', label: 'Botón', fields: ['text', 'url'] },
    { id: 'divider', label: 'Separador', fields: [] },
    { id: 'signature', label: 'Firma', fields: ['text'] },
    { id: 'legal', label: 'Texto legal', fields: ['text'] },
];

export const BLOCK_IDS = BLOCK_TYPES.map(b => b.id);
export const blockById = (id) => BLOCK_TYPES.find(b => b.id === id) || null;

const ALIGNS = ['left', 'center', 'right'];
const str = (v, max) => {
    const s = String(v ?? '').trim();
    return s ? s.slice(0, max) : '';
};

export const TEXT_MAX = 2000;
export const BLOCKS_MAX = 20;

/**
 * Da forma a un bloque. Devuelve `null` si el tipo no está en el catálogo: un
 * bloque desconocido no se puede dibujar y dejarlo pasar produciría un correo
 * con un hueco sin explicación.
 */
export const blockShape = (raw) => {
    const b = raw && typeof raw === 'object' ? raw : {};
    const tipo = blockById(b.type);
    if (!tipo) return null;
    const out = { type: tipo.id };
    if (tipo.fields.includes('text')) out.text = str(b.text, TEXT_MAX);
    if (tipo.fields.includes('title')) out.title = str(b.title, 200);
    if (tipo.fields.includes('align')) out.align = ALIGNS.includes(b.align) ? b.align : 'left';
    if (tipo.fields.includes('url')) out.url = safeUrl(b.url);
    return out;
};

/**
 * Una dirección que va a terminar en un `href`.
 *
 * Sólo `http` y `https`. `javascript:` y `data:` son las dos que convierten un
 * campo de texto del panel en una vía de ataque, y `mailto:` no se acepta acá
 * porque este campo es el destino de un BOTÓN — para escribirle a alguien está
 * el reply-to. Mismo criterio que `normalizeMapUrl` con el mapa de una sede y
 * que `linkRedirects` con el destino de una redirección.
 */
export const safeUrl = (raw) => {
    const s = String(raw ?? '').trim();
    if (!s) return '';
    // Se admite el marcador entero sin resolver: se comprueba DESPUÉS de
    // sustituir, que es cuando se sabe a dónde apunta de verdad.
    if (/^\{\{\s*[a-z_]+\s*\}\}$/i.test(s)) return s.slice(0, 600);
    try {
        const u = new URL(s);
        return (u.protocol === 'http:' || u.protocol === 'https:') ? s.slice(0, 600) : '';
    } catch { return ''; }
};

/* ─── LA PLANTILLA ───────────────────────────────────────────────────*/

export const templateShape = (raw) => {
    const t = raw && typeof raw === 'object' ? raw : {};
    const bloques = (Array.isArray(t.blocks) ? t.blocks : [])
        .map(blockShape).filter(Boolean).slice(0, BLOCKS_MAX);
    return {
        subject: str(t.subject, 200),
        // El preheader es la línea que la bandeja muestra junto al asunto. Sin
        // él, el cliente de correo toma las primeras palabras del cuerpo, que
        // suelen ser el texto alternativo del logotipo.
        preheader: str(t.preheader, 200),
        blocks: bloques,
    };
};

/**
 * Qué le falta a la plantilla para poder publicarse.
 *
 * `errors` bloquea y `warnings` no, por el mismo motivo de siempre: tratarlos
 * igual convierte cualquier aviso en un bloqueo y se dejan de leer.
 */
export const validateTemplate = (template) => {
    const errors = [];
    const warnings = [];
    const t = templateShape(template);

    if (!t.subject) errors.push('Falta el asunto.');
    if (!t.blocks.length) errors.push('La plantilla no tiene ningún bloque: el correo saldría vacío.');

    const usadas = new Set();
    for (const b of t.blocks) {
        for (const campo of ['text', 'title', 'url']) {
            for (const v of variablesIn(b[campo])) usadas.add(v);
        }
    }
    for (const v of variablesIn(t.subject)) usadas.add(v);
    for (const v of variablesIn(t.preheader)) usadas.add(v);

    const desconocidas = [...usadas].filter(v => !isKnownVariable(v));
    if (desconocidas.length) {
        errors.push(`Hay variables que la plataforma no sabe resolver y saldrían impresas tal cual: ${desconocidas.map(v => `{{${v}}}`).join(', ')}.`);
    }

    // Un botón sin destino se dibuja y no lleva a ninguna parte: es la regla
    // de v4.650, y en un correo es peor porque no se puede corregir después
    // de enviado.
    const botonSinDestino = t.blocks.some(b => b.type === 'button' && !b.url);
    if (botonSinDestino) errors.push('Hay un botón sin destino: un botón que no lleva a ninguna parte es peor que ninguno.');

    if (!t.preheader) {
        warnings.push('Sin línea de vista previa, la bandeja mostrará el texto alternativo del logotipo junto al asunto.');
    }
    if (!t.blocks.some(b => b.type === 'summary')) {
        warnings.push('El correo no muestra el resumen del aporte: quien lo reciba no verá el monto ni la referencia.');
    }
    return { ok: errors.length === 0, errors, warnings, variables: [...usadas] };
};

/** Los marcadores de un texto, sin repetir. */
export const variablesIn = (text) => {
    const out = [];
    const re = /\{\{\s*([a-zA-Z0-9_]+)\s*\}\}/g;
    let m;
    while ((m = re.exec(String(text ?? '')))) if (!out.includes(m[1])) out.push(m[1]);
    return out;
};

/* ─── EL ESCAPADO ────────────────────────────────────────────────────
 *
 * TODO lo que viene de fuera pasa por acá antes de entrar al HTML: el texto
 * del administrador y el valor de cada variable. El nombre de un aportante lo
 * escribe un desconocido en un formulario público — es la entrada menos
 * confiable de todo el módulo.
 */
export const escapeHtml = (v) => String(v ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');

/**
 * Sustituye los marcadores.
 *
 * ── UNA VARIABLE SIN VALOR NO SE BORRA ───────────────────────────
 *
 * Se deja el marcador y se REPORTA. Es lo contrario de lo que hace
 * `resolveVariables` en Plantillas IA, y a propósito: allá el hueco se ve en
 * el editor antes de publicar; acá el correo ya salió. «Recibimos tu aporte
 * de  » es peor que «Recibimos tu aporte de {{amount}}», porque lo segundo se
 * ve como un error del sistema y lo primero se lee como que no aportó nada.
 * Quien no quiera correr ese riesgo tiene el validador y la vista previa.
 */
export const applyVariables = (text, vars = {}) => {
    const faltan = [];
    const out = String(text ?? '').replace(/\{\{\s*([a-zA-Z0-9_]+)\s*\}\}/g, (todo, clave) => {
        const v = vars[clave];
        if (v === undefined || v === null || String(v).trim() === '') { faltan.push(clave); return todo; }
        return String(v);
    });
    return { text: out, missing: [...new Set(faltan)] };
};

/* ─── EL RENDER ──────────────────────────────────────────────────────
 *
 * Tablas y estilos EN LÍNEA, que es lo único que los clientes de correo
 * respetan de forma pareja: Outlook ignora las hojas de estilo y Gmail recorta
 * el `<head>`. No es un gusto retro, es el formato del medio.
 */
const P = '#0C2A5E';   // el azul institucional, cuando el perfil no declara otro
const CTA = '#F7A81B';
const TINTA = '#1F2933';
const GRIS = '#6B7280';

const alinea = (a) => (ALIGNS.includes(a) ? a : 'left');

const bloqueHtml = (b, ctx) => {
    const { vars, identity, beneficiary, colores } = ctx;
    const txt = (v) => {
        const r = applyVariables(v, vars);
        ctx.missing.push(...r.missing);
        return escapeHtml(r.text).replace(/\n/g, '<br>');
    };

    switch (b.type) {
        case 'logo': {
            const url = identity?.logoUrl || beneficiary?.logoUrl || '';
            if (!url) return '';
            const alt = escapeHtml(beneficiary?.tradeName || identity?.fromName || '');
            return `<tr><td align="${alinea(b.align)}" style="padding:24px 32px 8px">`
                + `<img src="${escapeHtml(url)}" alt="${alt}" height="48" style="height:48px;max-width:220px;display:block;border:0">`
                + `</td></tr>`;
        }
        case 'heading':
            return `<tr><td align="${alinea(b.align)}" style="padding:16px 32px 4px;font:700 24px/1.25 Arial,Helvetica,sans-serif;color:${colores.primary}">`
                + `${txt(b.text)}</td></tr>`;
        case 'paragraph':
            return `<tr><td align="${alinea(b.align)}" style="padding:8px 32px;font:400 15px/1.6 Arial,Helvetica,sans-serif;color:${TINTA}">`
                + `${txt(b.text)}</td></tr>`;
        case 'summary':
            return `<tr><td style="padding:16px 32px">`
                + `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#F6F7F9;border-radius:12px">`
                + `<tr><td style="padding:20px 24px;font:400 14px/1.7 Arial,Helvetica,sans-serif;color:${TINTA}">`
                + (b.title ? `<div style="font-weight:700;color:${colores.primary};margin-bottom:8px">${txt(b.title)}</div>` : '')
                + filaResumen('Campaña', vars.campaign_name)
                + filaResumen('Monto', [vars.amount, vars.currency].filter(Boolean).join(' '))
                + filaResumen('Fecha', vars.contribution_date)
                + filaResumen('Sitio de origen', vars.site_name)
                + filaResumen('Gestiona', vars.beneficiary_name)
                + filaResumen('Referencia', vars.contribution_id)
                + `</td></tr></table></td></tr>`;
        case 'quote': {
            if (!String(vars.donor_message ?? '').trim()) return ''; // sin mensaje no se deja el recuadro vacío
            return `<tr><td style="padding:8px 32px">`
                + `<table role="presentation" width="100%" cellpadding="0" cellspacing="0">`
                + `<tr><td style="padding:12px 20px;border-left:3px solid ${colores.cta};font:italic 400 15px/1.6 Arial,Helvetica,sans-serif;color:${GRIS}">`
                + (b.title ? `<div style="font-style:normal;font-weight:700;color:${TINTA};margin-bottom:6px">${txt(b.title)}</div>` : '')
                + `${escapeHtml(vars.donor_message)}</td></tr></table></td></tr>`;
        }
        case 'button': {
            const r = applyVariables(b.url, vars);
            ctx.missing.push(...r.missing);
            // La dirección se vuelve a comprobar DESPUÉS de sustituir: antes
            // podía ser un marcador y no se sabía a dónde apuntaba.
            const url = safeUrl(r.text);
            if (!url || /\{\{/.test(url)) return '';
            return `<tr><td align="center" style="padding:20px 32px">`
                + `<a href="${escapeHtml(url)}" style="display:inline-block;padding:13px 28px;border-radius:999px;background:${colores.cta};color:#FFFFFF;font:700 15px/1 Arial,Helvetica,sans-serif;text-decoration:none">`
                + `${txt(b.text) || 'Ver más'}</a></td></tr>`;
        }
        case 'divider':
            return `<tr><td style="padding:8px 32px"><div style="height:1px;background:#E5E7EB"></div></td></tr>`;
        case 'signature':
            return `<tr><td style="padding:16px 32px 4px;font:700 15px/1.5 Arial,Helvetica,sans-serif;color:${colores.primary}">`
                + `${txt(b.text) || escapeHtml(identity?.signature || beneficiary?.tradeName || '')}</td></tr>`;
        case 'legal':
            return `<tr><td style="padding:8px 32px 24px;font:400 12px/1.6 Arial,Helvetica,sans-serif;color:${GRIS}">`
                + `${txt(b.text)}</td></tr>`;
        default:
            return '';
    }
};

/** Una fila del resumen. Lo que no tiene valor NO se dibuja: un renglón
 *  «Campaña: » en blanco se lee como un error del sistema. */
const filaResumen = (rotulo, valor) => {
    const v = String(valor ?? '').trim();
    if (!v) return '';
    return `<div style="margin:2px 0"><span style="color:${GRIS}">${escapeHtml(rotulo)}:</span> `
        + `<strong style="color:${TINTA}">${escapeHtml(v)}</strong></div>`;
};

/**
 * Compone el correo completo.
 *
 * Devuelve `{ subject, html, text, missing }`. `missing` es la lista de
 * variables que no se pudieron llenar — la consume la vista previa para
 * decirlo, y el envío real para anotarlo.
 */
export const renderTemplate = ({ template, vars = {}, identity = {}, beneficiary = null }) => {
    const t = templateShape(template);
    const colores = {
        primary: hexOrNull(identity?.primaryColor) || P,
        cta: hexOrNull(identity?.ctaColor) || CTA,
    };
    const ctx = { vars, identity, beneficiary, colores, missing: [] };

    const cuerpo = t.blocks.map(b => bloqueHtml(b, ctx)).join('');
    const asunto = applyVariables(t.subject, vars);
    const pre = applyVariables(t.preheader, vars);
    ctx.missing.push(...asunto.missing, ...pre.missing);

    const pie = [identity?.footer, beneficiary?.legalName].filter(Boolean).map(escapeHtml).join(' · ');

    const html = `<!DOCTYPE html><html lang="es"><head><meta charset="utf-8">`
        + `<meta name="viewport" content="width=device-width,initial-scale=1">`
        + `<title>${escapeHtml(asunto.text)}</title></head>`
        + `<body style="margin:0;padding:0;background:#EEF1F5">`
        // La línea de vista previa: visible para la bandeja, invisible en el
        // cuerpo. Sin ella el cliente toma las primeras palabras del correo.
        + `<div style="display:none;max-height:0;overflow:hidden;opacity:0">${escapeHtml(pre.text)}</div>`
        + `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#EEF1F5">`
        + `<tr><td align="center" style="padding:24px 12px">`
        + `<table role="presentation" width="600" cellpadding="0" cellspacing="0" style="width:600px;max-width:100%;background:#FFFFFF;border-radius:16px;overflow:hidden">`
        + cuerpo
        + (pie ? `<tr><td style="padding:16px 32px;background:#F6F7F9;font:400 12px/1.6 Arial,Helvetica,sans-serif;color:${GRIS}">${pie}</td></tr>` : '')
        + `</table></td></tr></table></body></html>`;

    return {
        subject: asunto.text,
        html,
        // La versión en texto plano. No es un adorno: sin ella algunos filtros
        // puntúan el correo como sospechoso, y un cliente que no dibuja HTML
        // mostraría una página en blanco.
        text: textoPlano(t, vars),
        missing: [...new Set(ctx.missing)],
    };
};

const textoPlano = (t, vars) => {
    const lineas = [];
    for (const b of t.blocks) {
        if (b.type === 'heading' || b.type === 'paragraph' || b.type === 'signature' || b.type === 'legal') {
            lineas.push(applyVariables(b.text, vars).text);
        } else if (b.type === 'summary') {
            lineas.push([
                vars.campaign_name && `Campaña: ${vars.campaign_name}`,
                vars.amount && `Monto: ${[vars.amount, vars.currency].filter(Boolean).join(' ')}`,
                vars.contribution_date && `Fecha: ${vars.contribution_date}`,
                vars.site_name && `Sitio de origen: ${vars.site_name}`,
                vars.beneficiary_name && `Gestiona: ${vars.beneficiary_name}`,
                vars.contribution_id && `Referencia: ${vars.contribution_id}`,
            ].filter(Boolean).join('\n'));
        } else if (b.type === 'button') {
            const url = applyVariables(b.url, vars).text;
            if (safeUrl(url)) lineas.push(`${applyVariables(b.text, vars).text}: ${url}`);
        } else if (b.type === 'quote' && String(vars.donor_message ?? '').trim()) {
            lineas.push(`"${vars.donor_message}"`);
        }
    }
    return lineas.filter(Boolean).join('\n\n');
};

/* ─── LA PLANTILLA DE FÁBRICA ────────────────────────────────────────
 *
 * La que estrena un perfil nuevo, y la última red del fallback de plantillas
 * (criterio 19): ninguna contribución se queda sin notificación porque falte
 * una personalización.
 *
 * El texto es el del pedido, con sus palabras. Va acá y no escrito en el
 * código del envío porque tiene que poder editarse — «no hardcodear este
 * contenido» es el criterio 8.
 */
export const defaultTemplate = () => ({
    subject: 'Gracias por tu aporte a {{campaign_name}}',
    preheader: 'Recibimos tu contribución. Acá están los detalles.',
    blocks: [
        { type: 'logo', align: 'left' },
        { type: 'heading', text: 'Gracias por tu aporte', align: 'left' },
        { type: 'paragraph', text: 'Hola {{donor_name}}, recibimos tu contribución a {{campaign_name}}.', align: 'left' },
        { type: 'summary', title: 'Detalle de tu aporte' },
        { type: 'paragraph', text: 'Tu aporte se realizó a través de {{site_name}} y será gestionado por {{beneficiary_name}}.', align: 'left' },
        { type: 'quote', title: 'Tu mensaje' },
        { type: 'button', text: 'Ver la campaña', url: '{{campaign_url}}' },
        { type: 'paragraph', text: 'Agradecemos tu solidaridad y tu confianza.', align: 'left' },
        { type: 'signature', text: '{{beneficiary_name}}' },
        { type: 'legal', text: 'Este correo confirma la recepción de tu aporte. Guardalo como referencia: {{contribution_id}}.' },
    ],
});

/* ─── LA PLANTILLA DEL AVISO INTERNO ─────────────────────────────────
 *
 * NO puede ser la misma que la del aportante, y por eso existe: una dice
 * «gracias por tu aporte» y la otra informa de un movimiento a quien lo va a
 * gestionar. Con una sola, el aviso interno le agradecería a la tesorería por
 * un aporte que no hizo.
 *
 * Es más seca a propósito: sin botón, sin firma institucional y con el asunto
 * que hace falta para reconocerla en una bandeja de trabajo.
 */
export const defaultInternalTemplate = () => ({
    subject: 'Nuevo aporte recibido — {{campaign_name}}',
    preheader: '{{amount}} {{currency}} desde {{site_name}}.',
    blocks: [
        { type: 'heading', text: 'Nuevo aporte recibido', align: 'left' },
        { type: 'summary', title: 'Detalle' },
        { type: 'paragraph', text: 'Aportante: {{donor_name}} ({{donor_email}}).', align: 'left' },
        { type: 'quote', title: 'Mensaje del aportante' },
        { type: 'legal', text: 'Referencia del pago: {{payment_reference}}.' },
    ],
});

/** La plantilla de fábrica que le toca a cada papel. El aportante recibe la
 *  de agradecimiento; los demás, la interna. */
export const defaultTemplateFor = (recipientKind) =>
    (recipientKind && recipientKind !== 'donor' ? defaultInternalTemplate() : defaultTemplate());

export default {
    TEMPLATE_VARIABLES, VARIABLE_IDS, isKnownVariable, sampleVariables,
    BLOCK_TYPES, BLOCK_IDS, blockById, blockShape, safeUrl,
    templateShape, validateTemplate, variablesIn,
    escapeHtml, applyVariables, renderTemplate, defaultTemplate,
    defaultInternalTemplate, defaultTemplateFor,
    TEXT_MAX, BLOCKS_MAX,
};
