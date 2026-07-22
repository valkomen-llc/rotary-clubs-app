// Email Marketing — Editor visual de bloques (v4.566).
// Define el modelo de "diseño" (bloques) de un correo y su renderizado a HTML
// compatible con clientes de correo (tablas + estilos inline). El HTML resultante
// se guarda en EmailCampaign.content y lo consume el pipeline de envío existente
// (buildEmailHtml envuelve este contenido con tracking + pie de baja).

export type Align = 'left' | 'center' | 'right';

export type SocialNetwork = 'facebook' | 'instagram' | 'x' | 'linkedin' | 'youtube' | 'whatsapp' | 'web';

export interface HeadingBlock { id: string; type: 'heading'; text: string; level: 1 | 2 | 3; align: Align; color: string; }
export interface TextBlock { id: string; type: 'text'; text: string; align: Align; color: string; size: number; }
export interface ImageBlock { id: string; type: 'image'; url: string; alt: string; href: string; align: Align; width: number; radius: number; }
export interface ButtonBlock { id: string; type: 'button'; text: string; href: string; bg: string; color: string; align: Align; radius: number; }
export interface DividerBlock { id: string; type: 'divider'; color: string; thickness: number; }
export interface SpacerBlock { id: string; type: 'spacer'; height: number; }
export interface SocialLink { network: SocialNetwork; url: string; }
export interface SocialBlock { id: string; type: 'social'; align: Align; links: SocialLink[]; color: string; }
export interface VideoBlock { id: string; type: 'video'; url: string; thumbnail: string; title: string; align: Align; }
export interface HtmlBlock { id: string; type: 'html'; html: string; }
export interface ColumnCell { kind: 'text' | 'image'; text?: string; url?: string; href?: string; alt?: string; color?: string; }
export interface ColumnsBlock { id: string; type: 'columns'; left: ColumnCell; right: ColumnCell; }

export type Block =
    | HeadingBlock | TextBlock | ImageBlock | ButtonBlock | DividerBlock
    | SpacerBlock | SocialBlock | VideoBlock | HtmlBlock | ColumnsBlock;

export type BlockType = Block['type'];

export interface EmailSettings {
    bg: string;          // fondo exterior
    contentBg: string;   // fondo del contenedor
    font: string;        // familia tipográfica
    textColor: string;   // color de texto base
    linkColor: string;   // color de enlaces
    width: number;       // ancho del contenido (px)
}

export interface EmailDesign {
    version: 1;
    settings: EmailSettings;
    blocks: Block[];
}

export const DEFAULT_SETTINGS: EmailSettings = {
    bg: '#f3f4f6',
    contentBg: '#ffffff',
    font: "Arial, Helvetica, sans-serif",
    textColor: '#333333',
    linkColor: '#0c3c7c',
    width: 600,
};

export const FONT_OPTIONS = [
    { value: "Arial, Helvetica, sans-serif", label: 'Arial' },
    { value: "'Helvetica Neue', Helvetica, Arial, sans-serif", label: 'Helvetica' },
    { value: "Georgia, 'Times New Roman', serif", label: 'Georgia' },
    { value: "'Trebuchet MS', Tahoma, sans-serif", label: 'Trebuchet' },
    { value: "Verdana, Geneva, sans-serif", label: 'Verdana' },
    { value: "Tahoma, Verdana, sans-serif", label: 'Tahoma' },
];

let _idc = 0;
export const newId = (): string => {
    try {
        if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) return (crypto as Crypto).randomUUID();
    } catch { /* noop */ }
    _idc += 1;
    return `b_${Date.now().toString(36)}_${_idc}`;
};

// Fábrica de bloques nuevos con valores por defecto sensatos.
export const makeBlock = (type: BlockType): Block => {
    const id = newId();
    switch (type) {
        case 'heading': return { id, type, text: 'Título de la sección', level: 2, align: 'left', color: '#111827' };
        case 'text': return { id, type, text: 'Escribe aquí tu mensaje. Puedes usar varios párrafos separándolos con una línea en blanco.', align: 'left', color: '#333333', size: 15 };
        case 'image': return { id, type, url: '', alt: '', href: '', align: 'center', width: 100, radius: 8 };
        case 'button': return { id, type, text: 'Ver más', href: 'https://', bg: '#0c3c7c', color: '#ffffff', align: 'center', radius: 8 };
        case 'divider': return { id, type, color: '#e5e7eb', thickness: 1 };
        case 'spacer': return { id, type, height: 24 };
        case 'social': return { id, type, align: 'center', color: '#0c3c7c', links: [{ network: 'facebook', url: 'https://' }, { network: 'instagram', url: 'https://' }] };
        case 'video': return { id, type, url: 'https://', thumbnail: '', title: 'Ver el video', align: 'center' };
        case 'html': return { id, type, html: '<p>Bloque HTML libre…</p>' };
        case 'columns': return { id, type, left: { kind: 'text', text: 'Columna izquierda', color: '#333333' }, right: { kind: 'text', text: 'Columna derecha', color: '#333333' } };
        default: return { id, type: 'text', text: '', align: 'left', color: '#333333', size: 15 } as TextBlock;
    }
};

export const BLOCK_LABELS: Record<BlockType, string> = {
    heading: 'Encabezado',
    text: 'Texto',
    image: 'Imagen',
    button: 'Botón',
    columns: 'Columnas',
    divider: 'Separador',
    spacer: 'Espaciado',
    social: 'Redes sociales',
    video: 'Video',
    html: 'HTML',
};

export const DEFAULT_DESIGN: EmailDesign = {
    version: 1,
    settings: { ...DEFAULT_SETTINGS },
    blocks: [
        { id: newId(), type: 'heading', text: '¡Hola! 👋', level: 2, align: 'left', color: '#111827' },
        { id: newId(), type: 'text', text: 'Escribe aquí el contenido de tu campaña. Usa la barra de bloques para agregar imágenes, botones, columnas y más.', align: 'left', color: '#333333', size: 15 },
        { id: newId(), type: 'button', text: 'Ver más', href: 'https://', bg: '#0c3c7c', color: '#ffffff', align: 'center', radius: 8 },
    ],
};

// ---------- Renderizado a HTML email-safe ----------

const esc = (s: string): string =>
    String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

const safeUrl = (u: string): string => {
    const v = String(u || '').trim();
    if (/^(https?:|mailto:|tel:)/i.test(v)) return v.replace(/"/g, '%22');
    if (v.startsWith('#') || v === '') return v;
    return `https://${v.replace(/"/g, '%22')}`;
};

// Convierte texto plano con párrafos (línea en blanco) y saltos de línea a HTML.
const textToHtml = (text: string): string =>
    esc(text)
        .split(/\n\s*\n/)
        .map((p) => p.trim())
        .filter(Boolean)
        .map((p) => `<p style="margin:0 0 12px 0">${p.replace(/\n/g, '<br>')}</p>`)
        .join('');

const SOCIAL_LABEL: Record<SocialNetwork, string> = {
    facebook: 'f', instagram: 'IG', x: 'X', linkedin: 'in', youtube: '▶', whatsapp: 'WA', web: '🌐',
};
const SOCIAL_NAME: Record<SocialNetwork, string> = {
    facebook: 'Facebook', instagram: 'Instagram', x: 'X', linkedin: 'LinkedIn', youtube: 'YouTube', whatsapp: 'WhatsApp', web: 'Sitio web',
};

const cell = (inner: string, pad = '8px 24px'): string =>
    `<tr><td style="padding:${pad}">${inner}</td></tr>`;

const renderBlock = (b: Block, s: EmailSettings): string => {
    switch (b.type) {
        case 'heading': {
            const sizes = { 1: 28, 2: 22, 3: 18 } as const;
            return cell(`<h${b.level} style="margin:0;font-size:${sizes[b.level]}px;line-height:1.25;color:${esc(b.color)};text-align:${b.align};font-weight:800">${esc(b.text)}</h${b.level}>`);
        }
        case 'text':
            return cell(`<div style="font-size:${b.size}px;line-height:1.6;color:${esc(b.color)};text-align:${b.align}">${textToHtml(b.text)}</div>`);
        case 'image': {
            if (!b.url) return cell(`<div style="padding:24px;text-align:center;color:#9ca3af;border:1px dashed #d1d5db;border-radius:8px">Sin imagen</div>`);
            const img = `<img src="${safeUrl(b.url)}" alt="${esc(b.alt)}" style="width:${b.width}%;max-width:100%;height:auto;border-radius:${b.radius}px;display:inline-block" />`;
            const wrapped = b.href ? `<a href="${safeUrl(b.href)}" target="_blank" style="text-decoration:none">${img}</a>` : img;
            return cell(`<div style="text-align:${b.align}">${wrapped}</div>`);
        }
        case 'button': {
            const btn = `<a href="${safeUrl(b.href)}" target="_blank" style="display:inline-block;background:${esc(b.bg)};color:${esc(b.color)};text-decoration:none;padding:12px 28px;border-radius:${b.radius}px;font-weight:700;font-size:15px">${esc(b.text)}</a>`;
            return cell(`<div style="text-align:${b.align}">${btn}</div>`, '12px 24px');
        }
        case 'divider':
            return cell(`<div style="border-top:${b.thickness}px solid ${esc(b.color)};font-size:0;line-height:0">&nbsp;</div>`, '4px 24px');
        case 'spacer':
            return `<tr><td style="height:${b.height}px;line-height:${b.height}px;font-size:0">&nbsp;</td></tr>`;
        case 'social': {
            const items = (b.links || []).filter((l) => l.url).map((l) =>
                `<a href="${safeUrl(l.url)}" target="_blank" title="${esc(SOCIAL_NAME[l.network] || '')}" style="display:inline-block;width:34px;height:34px;line-height:34px;text-align:center;background:${esc(b.color)};color:#ffffff;border-radius:50%;text-decoration:none;font-weight:700;font-size:13px;margin:0 4px">${esc(SOCIAL_LABEL[l.network] || '•')}</a>`
            ).join('');
            return cell(`<div style="text-align:${b.align}">${items}</div>`);
        }
        case 'video': {
            const thumb = b.thumbnail
                ? `<img src="${safeUrl(b.thumbnail)}" alt="${esc(b.title)}" style="width:100%;max-width:100%;height:auto;border-radius:8px;display:block" />`
                : `<div style="background:#111827;color:#fff;padding:48px 0;border-radius:8px;text-align:center;font-size:28px">▶</div>`;
            return cell(`<div style="text-align:${b.align}"><a href="${safeUrl(b.url)}" target="_blank" style="text-decoration:none;color:${esc(s.linkColor)}">${thumb}<div style="margin-top:8px;font-weight:700;font-size:14px">▶ ${esc(b.title)}</div></a></div>`);
        }
        case 'columns': {
            const renderCell = (c: ColumnCell): string => {
                if (c.kind === 'image') {
                    if (!c.url) return `<div style="padding:16px;text-align:center;color:#9ca3af;border:1px dashed #d1d5db;border-radius:8px;font-size:12px">Sin imagen</div>`;
                    const img = `<img src="${safeUrl(c.url)}" alt="${esc(c.alt || '')}" style="width:100%;max-width:100%;height:auto;border-radius:8px;display:block" />`;
                    return c.href ? `<a href="${safeUrl(c.href)}" target="_blank">${img}</a>` : img;
                }
                return `<div style="font-size:14px;line-height:1.6;color:${esc(c.color || '#333333')}">${textToHtml(c.text || '')}</div>`;
            };
            return cell(
                `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border-collapse:collapse"><tr>
                    <td width="50%" valign="top" style="padding:0 8px 0 0;vertical-align:top">${renderCell(b.left)}</td>
                    <td width="50%" valign="top" style="padding:0 0 0 8px;vertical-align:top">${renderCell(b.right)}</td>
                </tr></table>`
            );
        }
        case 'html':
            return cell(b.html || '');
        default:
            return '';
    }
};

// Renderiza el diseño completo a un fragmento HTML listo para EmailCampaign.content.
// No incluye <html>/<body> ni el pie de baja (eso lo añade buildEmailHtml al enviar).
export const renderDesignToHtml = (design: EmailDesign): string => {
    const s = { ...DEFAULT_SETTINGS, ...(design?.settings || {}) };
    const blocks = Array.isArray(design?.blocks) ? design.blocks : [];
    const rows = blocks.map((b) => renderBlock(b, s)).join('');
    return `<div style="background:${esc(s.bg)};font-family:${s.font};color:${esc(s.textColor)}">
<table role="presentation" align="center" width="${s.width}" cellpadding="0" cellspacing="0" style="width:100%;max-width:${s.width}px;margin:0 auto;background:${esc(s.contentBg)};border-collapse:collapse">
${rows}
</table>
</div>`;
};

// Parsea el JSON de diseño guardado; retorna null si no es válido.
export const parseDesign = (raw?: string | null): EmailDesign | null => {
    if (!raw) return null;
    try {
        const d = typeof raw === 'string' ? JSON.parse(raw) : raw;
        if (!d || !Array.isArray(d.blocks)) return null;
        return { version: 1, settings: { ...DEFAULT_SETTINGS, ...(d.settings || {}) }, blocks: d.blocks };
    } catch {
        return null;
    }
};
