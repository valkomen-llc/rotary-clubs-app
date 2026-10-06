// Utilidades puras del diseñador de mensajes (v4.1166). Sin red, sin DOM.
// Testeables en node empaquetando este módulo con esbuild.
import { renderDesignToHtml, DEFAULT_SETTINGS, type EmailDesign } from '../../../../lib/emailBlocks';

const esc = (s: string): string =>
  String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

/** Carcasa final determinista — espejo de `buildEmailShell` del servidor. */
export const buildEmailShell = ({ subject = '', preheader = '', bodyHtml = '', footer = '' }: {
  subject?: string; preheader?: string; bodyHtml?: string; footer?: string;
} = {}): string => {
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
};

let _idc = 0;
const nid = (p = 'b'): string => `${p}_${Date.now().toString(36)}_${(_idc += 1)}`;

/** Convierte el contenido clásico (texto + CTA) en un diseño editable. */
export const importClassicToDesign = (email: {
  subject?: string; bodyText?: string; ctaText?: string; ctaUrl?: string;
} = {}): EmailDesign => {
  const paras = String(email.bodyText || '').split(/\n{2,}/).map((p) => p.trim()).filter(Boolean);
  return {
    version: 1,
    settings: { ...DEFAULT_SETTINGS },
    blocks: [
      { id: nid(), type: 'heading', text: 'Lo que hace tu club merece ser compartido', level: 2, align: 'center', color: '#0c3c7c' },
      ...paras.map((p) => ({ id: nid(), type: 'text' as const, text: p, align: 'left' as const, color: '#333333', size: 15 })),
      { id: nid(), type: 'button', text: email.ctaText || 'Compartir una actividad →', href: email.ctaUrl || '{{form_url}}', bg: '#0c3c7c', color: '#ffffff', align: 'center' as const, radius: 8 },
    ],
  };
};

/** Renderiza el diseño a HTML final (fragmento de cuerpo + carcasa). */
export const renderDesignEmail = (design: EmailDesign, opts: { subject?: string; preheader?: string; footer?: string } = {}): string =>
  buildEmailShell({ subject: opts.subject || '', preheader: opts.preheader || '', bodyHtml: renderDesignToHtml(design), footer: opts.footer || '' });

const EMAIL_BLOCKS = ['heading', 'text', 'image', 'button', 'columns', 'divider', 'spacer', 'social', 'video', 'html'];

/** Validación liviana antes de guardar (el servidor revalida todo). */
export const validateDesign = (design: EmailDesign | null | undefined): string[] => {
  const errores: string[] = [];
  if (!design || !Array.isArray((design as EmailDesign).blocks)) { errores.push('El diseño no tiene bloques.'); return errores; }
  if (design.blocks.length > 50) errores.push('Máximo 50 bloques.');
  design.blocks.forEach((b: { type?: string; id?: string }, i: number) => {
    if (!b || !EMAIL_BLOCKS.includes(b.type || '')) errores.push(`Bloque ${i + 1}: tipo no permitido.`);
    if (!b?.id) errores.push(`Bloque ${i + 1}: sin identificador.`);
  });
  return errores;
};

/**
 * Copia una plantilla a la campaña (snapshot): el diseño y el HTML quedan
 * CONGELADOS en el contenido de la campaña. Editar la plantilla después NO
 * toca la campaña; adoptar la nueva versión es un gesto explícito.
 */
export const applyTemplateToContent = (tpl: {
  id?: string; version?: number; channel?: string;
  design?: EmailDesign | Record<string, unknown>; html?: string;
  subject?: string; preheader?: string;
}, channel: 'email' | 'whatsapp'): Record<string, unknown> => {
  if (channel === 'email') {
    return {
      design: tpl.design || null,
      html: tpl.html || '',
      subject: tpl.subject || '',
      preheader: tpl.preheader || '',
      templateId: tpl.id || null,
      templateVersion: tpl.version ?? null,
    };
  }
  const d = (tpl.design || {}) as Record<string, unknown>;
  return {
    headerType: d.headerType || 'none',
    headerText: (d.headerText as string) || '',
    mediaUrl: (d.mediaUrl as string) || '',
    body: (d.body as string) || '',
    footer: (d.footer as string) || '',
    buttons: Array.isArray(d.buttons) ? d.buttons : [],
    templateName: (d.templateName as string) || null,
    templateLang: (d.templateLang as string) || null,
    templateId: tpl.id || null,
    templateVersion: tpl.version ?? null,
  };
};
