// Composición y saneado del email diseñado por bloques (v4.1166)
//
// El editor visual guarda el DISEÑO (bloques) y un HTML ya renderizado; el
// servidor sustituye variables (escapadas), sanea y arma el documento final.
// Vista previa, prueba y envío usan ESTA misma función: lo que se ve es lo
// que se envía, byte por byte de contenido.
//
// Sin dependencias nuevas: allowlist + escapado, como `notificationTemplate`.
import { canonicalVar, findUnknownVars } from './contentActivationVariables.js';

export const EMAIL_HTML_MAX = 200 * 1024;
export const WA_HEADER_MAX = 60;
export const WA_BODY_MAX = 1024;
export const WA_FOOTER_MAX = 60;
export const WA_BUTTONS_MAX = 3;
export const WA_BUTTON_LABEL_MAX = 25;
export const WA_URL_MAX = 2000;
export const DESIGN_BLOCKS_MAX = 50;

const esc = (s) => String(s ?? '')
  .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

/** Sustituye {{vars}} (canónicas y alias) escapando los valores. */
export function substituteVars(text, vars = {}) {
  const missing = [];
  const out = String(text ?? '').replace(/\{\{\s*([a-zA-Z0-9_áéíóúñü]+)\s*\}\}/g, (m, name) => {
    const canon = canonicalVar(name);
    if (!canon) { missing.push(name); return m; }
    const v = vars[canon];
    if (v === undefined || v === null || v === '') { missing.push(canon); return ''; }
    return esc(v);
  });
  return { text: out, missing: [...new Set(missing)] };
}

/**
 * HTML de email saneado por allowlist. Quita scripts, estilos, iframes,
 * formularios, manejadores `on*`, URLs `javascript:`/`data:`/`vbscript:` y
 * comentarios; conserva texto, formato, tablas, imágenes y enlaces http(s).
 * Los {{tokens}} sobreviven (se resuelven después, en `substituteVars`).
 */
export function sanitizeEmailHtml(html) {
  let out = String(html || '');
  if (!out) return '';
  out = out.replace(/<!--[\s\S]*?-->/g, '');
  // Bloques peligrosos enteros (con su contenido ejecutable).
  out = out.replace(/<(script|style|iframe|object|embed|form|link|meta)[^>]*>[\s\S]*?<\/\1\s*>/gi, '');
  out = out.replace(/<(script|style|iframe|object|embed|link|meta|base|title)[^>]*\/?>/gi, '');
  const allowed = new Set(['a', 'p', 'h1', 'h2', 'h3', 'h4', 'div', 'span', 'table', 'tr', 'td', 'th', 'tbody', 'thead', 'img', 'ul', 'ol', 'li', 'br', 'hr', 'strong', 'em', 'b', 'i', 'u', 'blockquote', 'center', 'font', 'small', 'big', 'sub', 'sup', 'pre']);
  const allowedAttrs = new Set(['href', 'src', 'alt', 'width', 'height', 'align', 'style', 'target', 'title', 'color', 'size', 'cellpadding', 'cellspacing', 'border', 'role', 'valign']);
  out = out.replace(/<\/?([a-zA-Z][a-zA-Z0-9]*)\b([^>]*)>/g, (m, tag, attrs) => {
    const t = String(tag).toLowerCase();
    const closing = m.startsWith('</');
    if (!allowed.has(t)) return '';
    if (closing) return `</${t}>`;
    let kept = '';
    const re = /([a-zA-Z-]+)(?:\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s>]+)))?/g;
    let am;
    while ((am = re.exec(attrs || ''))) {
      const name = am[1].toLowerCase();
      if (!allowedAttrs.has(name)) continue;
      if (name.startsWith('on')) continue;
      const val = am[2] ?? am[3] ?? am[4] ?? '';
      if ((name === 'href' || name === 'src') && !urlSegura(val)) continue;
      if (name === 'style' && /expression|javascript\s*:|vbscript\s*:|behaviour|behavior/i.test(val)) continue;
      kept += ` ${name}="${esc(val)}"`;
    }
    const selfClose = (t === 'img' || t === 'br' || t === 'hr') ? ' /' : '';
    return `<${t}${kept}${selfClose}>`;
  });
  return out;
}

function urlSegura(v) {
  const s = String(v || '').trim();
  if (!s) return true;
  if (s.includes('{{') && s.includes('}}')) return true; // token: se valida tras sustituir
  return /^(https?:|mailto:|tel:|#)/i.test(s);
}

/** Valida una URL ya resuelta (sin tokens): solo http(s)/mailto/tel/#. */
export function resolvedUrlOk(url) {
  const s = String(url || '').trim();
  if (!s) return false;
  if (/\{\{.*\}\}/.test(s)) return false;
  return /^(https?:|mailto:|tel:|#)/i.test(s);
}

/** Documento final determinista: el mismo para preview, prueba y envío. */
export function buildEmailShell({ subject = '', preheader = '', bodyHtml = '', footer = '' } = {}) {
  const pie = String(footer || '').trim();
  return `<!DOCTYPE html><html lang="es"><head><meta charset="utf-8">`
    + `<meta name="viewport" content="width=device-width,initial-scale=1">`
    + `<title>${esc(subject)}</title></head>`
    + `<body style="margin:0;padding:0;background:#EEF1F5">`
    + (preheader ? `<div style="display:none;max-height:0;overflow:hidden;opacity:0">${esc(preheader)}</div>` : '')
    + `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#EEF1F5">`
    + `<tr><td align="center" style="padding:24px 12px">`
    + bodyHtml
    + (pie ? `<table role="presentation" width="600" cellpadding="0" cellspacing="0" style="width:600px;max-width:100%;margin:12px auto 0;background:#F6F7F9;border-radius:0 0 16px 16px;border-collapse:collapse"><tr><td style="padding:16px 32px;font:400 12px/1.6 Arial,Helvetica,sans-serif;color:#6b7280">${esc(pie)}</td></tr></table>` : '')
    + `</td></tr></table></body></html>`;
}

/** Texto plano desde el HTML final (algunos clientes/filtros lo exigen). */
export function emailTextFrom(html) {
  let t = String(html || '');
  t = t.replace(/<\s*br\s*\/?>/gi, '\n').replace(/<\s*\/\s*(p|h1|h2|h3|h4|li|div|tr)\s*>/gi, '\n\n')
    .replace(/<\s*li[^>]*>/gi, '• ').replace(/<[^>]+>/g, '');
  const entities = { '&amp;': '&', '&lt;': '<', '&gt;': '>', '&quot;': '"', '&#39;': "'", '&nbsp;': ' ' };
  for (const [k, v] of Object.entries(entities)) t = t.split(k).join(v);
  return t.split(/\n{3,}/).join('\n\n').trim().slice(0, 20000);
}

/**
 * Construye el email diseñado: sustituye (escapando), sanea y arma el
 * documento. Devuelve también `missing` (variables sin valor) para avisar en
 * preview sin tumbar el envío.
 */
export function buildFinalEmail({ subject = '', preheader = '', htmlBody = '', footer = '', ctaUrl = '', vars = {} } = {}) {
  const s = substituteVars(subject, vars);
  const p = substituteVars(preheader, vars);
  const f = substituteVars(footer, vars);
  const c = substituteVars(ctaUrl, vars);
  const b = substituteVars(htmlBody, vars);
  const limpio = sanitizeEmailHtml(b.text);
  const missing = [...new Set([...s.missing, ...p.missing, ...f.missing, ...c.missing, ...b.missing])];
  const html = buildEmailShell({ subject: s.text, preheader: p.text, bodyHtml: limpio, footer: f.text });
  return { subject: s.text, preheader: p.text, html, text: emailTextFrom(html), footer: f.text, ctaUrl: c.text, missing };
}

/** Valida el diseño crudo que manda el editor (antes de guardar). */
export function validateDesignHtml(html) {
  const errores = [];
  const done = () => ({ ok: errores.length === 0, errores, error: errores[0] || '' });
  const s = String(html || '');
  if (!s.trim()) errores.push('El diseño está vacío.');
  if (Buffer.byteLength(s, 'utf8') > EMAIL_HTML_MAX) errores.push(`El diseño supera los ${Math.round(EMAIL_HTML_MAX / 1024)} KB.`);
  if (/<script[\s>]/i.test(s)) errores.push('El diseño no puede incluir scripts.');
  if (/\son\w+\s*=/i.test(s)) errores.push('El diseño no puede incluir manejadores de eventos (onclick, …).');
  return done();
}

/** Valida los campos estructurados de WhatsApp contra límites del proveedor. */
export function validateWhatsAppFields(wa = {}) {
  const errores = [];
  const str = (v) => String(v ?? '');
  if (str(wa.headerText).length > WA_HEADER_MAX) errores.push(`El encabezado supera ${WA_HEADER_MAX} caracteres.`);
  if (str(wa.body).length > WA_BODY_MAX) errores.push(`El texto supera ${WA_BODY_MAX} caracteres.`);
  if (str(wa.footer).length > WA_FOOTER_MAX) errores.push(`El pie supera ${WA_FOOTER_MAX} caracteres.`);
  const buttons = Array.isArray(wa.buttons) ? wa.buttons : [];
  if (buttons.length > WA_BUTTONS_MAX) errores.push(`Máximo ${WA_BUTTONS_MAX} botones.`);
  buttons.forEach((b, i) => {
    if (str(b?.label).length > WA_BUTTON_LABEL_MAX) errores.push(`El botón ${i + 1} supera ${WA_BUTTON_LABEL_MAX} caracteres.`);
    if (b?.type === 'url' && str(b?.url).length > WA_URL_MAX) errores.push(`La URL del botón ${i + 1} es demasiado larga.`);
  });
  const todo = [wa.headerText, wa.body, wa.footer, ...buttons.map((b) => `${b?.label || ''} ${b?.url || ''}`)].join('\n');
  const desconocidas = findUnknownVars(todo);
  if (desconocidas.length) errores.push(`Variables desconocidas: ${desconocidas.map((v) => `{{${v}}}`).join(', ')}. Usa solo las variables del catálogo.`);
  return { ok: errores.length === 0, errores, desconocidas };
}

/** Valida sin leer arreglos (v4.1166).
 *
 * Los validadores `validate*` devuelven `{ ok, errores }` para uso puro y
 * testeado; ESTAS variantes lanzan con el primer motivo y solo usan
 * primitivas (cadenas, números, booleanos) para que el controlador responda
 * 400 sin depender de lecturas intermedias.
 */
export function assertWhatsAppFields(wa = {}) {
  const fail = (msg) => {
    const e = new Error(msg);
    e.status = 400;
    throw e;
  };
  const str = (v) => String(v ?? '');
  const w = wa || {};
  if (str(w.headerText).length > WA_HEADER_MAX) fail(`El encabezado supera ${WA_HEADER_MAX} caracteres.`);
  if (str(w.body).length > WA_BODY_MAX) fail(`El texto supera ${WA_BODY_MAX} caracteres.`);
  if (str(w.footer).length > WA_FOOTER_MAX) fail(`El pie supera ${WA_FOOTER_MAX} caracteres.`);
  const nBtn = Array.isArray(w.buttons) ? w.buttons.length : 0;
  if (nBtn > WA_BUTTONS_MAX) fail(`Máximo ${WA_BUTTONS_MAX} botones.`);
  const btnTextos = [];
  if (Array.isArray(w.buttons)) {
    for (let i = 0; i < w.buttons.length; i++) {
      const b = w.buttons[i] || {};
      if (str(b.label).length > WA_BUTTON_LABEL_MAX) fail(`El botón ${i + 1} supera ${WA_BUTTON_LABEL_MAX} caracteres.`);
      if (b.type === 'url' && str(b.url).length > WA_URL_MAX) fail(`La URL del botón ${i + 1} es demasiado larga.`);
      btnTextos.push(`${b.label || ''} ${b.url || ''}`);
    }
  }
  const nombradas = String(findUnknownVars([w.headerText, w.body, w.footer, ...btnTextos].join('\n')) || '');
  if (nombradas) fail(`Variables desconocidas: ${nombradas.split(',').map((v) => `{{${v}}}`).join(', ')}. Usa solo las variables del catálogo.`);
  return true;
}

/** Variante que lanza para el diseño de email. */
export function assertEmailDesign({ subject = '', preheader = '', html = '' } = {}) {
  const fail = (msg) => {
    const e = new Error(msg);
    e.status = 400;
    throw e;
  };
  if (html) {
    const v = validateDesignHtml(html);
    if (!v.ok) fail(String(v.error || 'Diseño inválido.').slice(0, 300));
  }
  const nombradas = String(findUnknownVars([subject, preheader, html].join('\n')) || '');
  if (nombradas) fail(`Variables desconocidas en el email: ${nombradas.split(',').map((v) => `{{${v}}}`).join(', ')}.`);
  return true;
}

/** Texto plano de respaldo del mensaje de WhatsApp (eventos y registros). */
export function waTextFallback({ headerText = '', body = '', footer = '' } = {}) {
  return [String(headerText || '').trim(), String(body || '').trim(), String(footer || '').trim()]
    .filter(Boolean).join('\n\n');
}

export default {
  EMAIL_HTML_MAX, WA_HEADER_MAX, WA_BODY_MAX, WA_FOOTER_MAX, WA_BUTTONS_MAX,
  WA_BUTTON_LABEL_MAX, WA_URL_MAX, DESIGN_BLOCKS_MAX,
  substituteVars, sanitizeEmailHtml, resolvedUrlOk, buildEmailShell,
  emailTextFrom, buildFinalEmail, validateDesignHtml, validateWhatsAppFields, waTextFallback,
};
