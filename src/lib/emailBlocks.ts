// Email Marketing — Editor visual de bloques (v4.566).
// Define el modelo de "diseño" (bloques) de un correo y su renderizado a HTML
// compatible con clientes de correo (tablas + estilos inline). El HTML resultante
// se guarda en EmailCampaign.content y lo consume el pipeline de envío existente
// (buildEmailHtml envuelve este contenido con tracking + pie de baja).

export type Align = 'left' | 'center' | 'right';

// Espaciado vertical por bloque (v4.1170, opcional: ausente = 0).
export interface BlockPad { padTop?: number; padBottom?: number; }
export type BlockWeight = 'normal' | 'bold' | '800';

export type SocialNetwork = 'facebook' | 'instagram' | 'x' | 'linkedin' | 'youtube' | 'whatsapp' | 'web';

export interface BaseBlock extends BlockPad {
    id: string;
    isProtected?: boolean; // Componente institucional protegido (no deformable ni alterable por IA)
    isLocked?: boolean;
    label?: string; // Etiqueta legible (ej: "Encabezado Institucional", "Cuerpo de Campaña")
    globalKey?: string; // Clave de bloque global ('rotary_header' | 'rotary_footer' | 'rotary_signature' | 'rotary_areas_focus')
}

export interface HeadingBlock extends BaseBlock { type: 'heading'; text: string; level: 1 | 2 | 3; align: Align; color: string; weight?: BlockWeight; }
export interface TextBlock extends BaseBlock { type: 'text'; text: string; align: Align; color: string; size: number; weight?: BlockWeight; }
export interface ImageBlock extends BaseBlock { type: 'image'; url: string; alt: string; href: string; align: Align; width: number; radius: number; }
export interface ButtonBlock extends BaseBlock { type: 'button'; text: string; href: string; bg: string; color: string; align: Align; radius: number; }
export interface DividerBlock extends BaseBlock { type: 'divider'; color: string; thickness: number; }
export interface SpacerBlock extends BaseBlock { type: 'spacer'; height: number; }
export interface SocialLink { network: SocialNetwork; url: string; }
export interface SocialBlock extends BaseBlock { type: 'social'; align: Align; links: SocialLink[]; color: string; }
export interface VideoBlock extends BaseBlock { type: 'video'; url: string; thumbnail: string; title: string; align: Align; }
export interface HtmlBlock extends BaseBlock { type: 'html'; html: string; }
export interface ColumnCell { kind: 'text' | 'image'; text?: string; url?: string; href?: string; alt?: string; color?: string; }
export interface ColumnsBlock extends BaseBlock { type: 'columns'; left: ColumnCell; right: ColumnCell; }
export interface MenuItem { label: string; url: string; }
export interface MenuBlock extends BaseBlock { type: 'menu'; items: MenuItem[]; align: Align; color: string; size: number; }
export interface TableRow { cells: string[]; }
export interface GlobalBlockItem extends BaseBlock {
    type: 'global';
    globalKey: string;
    title?: string;
    subtitle?: string;
    badge?: string;
    logoUrl?: string;
    logoMaxWidth?: number;
    logoMaxHeight?: number;
    bgGradient?: string;
    bgColor?: string;
    textColor?: string;
    whatsappUrl?: string;
    whatsappText?: string;
    motto?: string;
    footerText?: string;
    showAreas?: boolean;
    showSocial?: boolean;
    customHtml?: string;
    padding?: string;
    borderColor?: string;
    align?: Align;
}

export type Block =
    | HeadingBlock | TextBlock | ImageBlock | ButtonBlock | DividerBlock
    | SpacerBlock | SocialBlock | VideoBlock | HtmlBlock | ColumnsBlock
    | MenuBlock | TableBlock | GlobalBlockItem;

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
        case 'button': return { id, type, text: 'Ver más', href: 'https://', bg: '#013388', color: '#ffffff', align: 'center', radius: 8 };
        case 'divider': return { id, type, color: '#e5e7eb', thickness: 1 };
        case 'spacer': return { id, type, height: 24 };
        case 'social': return { id, type, align: 'center', color: '#013388', links: [{ network: 'facebook', url: 'https://' }, { network: 'instagram', url: 'https://' }, { network: 'web', url: 'https://' }] };
        case 'video': return { id, type, url: 'https://', thumbnail: '', title: 'Ver el video', align: 'center' };
        case 'html': return { id, type, html: '<p>Bloque HTML libre…</p>' };
        case 'columns': return { id, type, left: { kind: 'text', text: 'Columna izquierda', color: '#333333' }, right: { kind: 'text', text: 'Columna derecha', color: '#333333' } };
        case 'table': return {
            id, type,
            headers: ['Área de Enfoque', 'Proyectos'],
            rows: [
                { cells: ['Agua y Saneamiento', '3 iniciativas'] },
                { cells: ['Salud Materno-Infantil', '2 jornadas'] },
                { cells: ['Educación Básica', '4 becas'] }
            ],
            borderColor: '#e2e8f0',
            headerBg: '#013388',
            headerColor: '#ffffff',
            textColor: '#334155',
            align: 'left'
        };
        case 'menu': return {
            id, type,
            items: [
                { label: 'Rotary en Acción', url: 'https://app.clubplatform.org/rotary-en-accion' },
                { label: 'Distrito 4271', url: 'https://app.clubplatform.org' },
                { label: 'Distrito 4281', url: 'https://app.clubplatform.org' },
                { label: 'Contacto', url: 'https://app.clubplatform.org' }
            ],
            align: 'center',
            color: '#013388',
            size: 13
        };
        case 'global': return {
            id, type,
            globalKey: 'rotary_header',
            label: 'Cabecera Institucional Adaptable',
            isProtected: true,
            logoUrl: '',
            logoMaxWidth: 240,
            logoMaxHeight: 60,
            align: 'center',
            bgColor: '#ffffff',
            padding: '24px 20px',
        };
        default: return { id, type: 'text', text: '', align: 'left', color: '#333333', size: 15 } as TextBlock;
    }
};

export const BLOCK_LABELS: Record<BlockType, string> = {
    heading: 'Encabezado',
    text: 'Párrafo',
    image: 'Imagen',
    button: 'Botón',
    columns: 'Columnas',
    divider: 'Separador',
    spacer: 'Espaciado',
    social: 'Redes sociales',
    video: 'Video',
    html: 'HTML propio',
    table: 'Tabla',
    menu: 'Menú enlaces',
    global: 'Bloque Global',
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

const num = (v: unknown, fb: number): number => {
    const n = Number(v);
    return Number.isFinite(n) && n >= 0 && n <= 120 ? n : fb;
};

export interface SiteBrandingContext {
    siteLogo?: string | null;
    siteName?: string | null;
    siteType?: string | null;
    isMainPlatform?: boolean;
    platformLogo?: string | null;
}

export interface ResolvedLogoResult {
    url?: string;
    logoUrl?: string | null;
    text?: string;
    siteName?: string | null;
    alt?: string;
    source: 'custom' | 'template_custom' | 'site_settings' | 'platform_default' | 'typography' | 'site_name';
}

/**
 * Obtiene el contexto institucional activo del sitio actual desde el entorno / almacenamiento local
 * cuando no se pasa un siteContext explícito. Reutiliza la arquitectura multitenant del sistema.
 */
export const getActiveSiteBrandingContext = (): SiteBrandingContext => {
    if (typeof window === 'undefined') {
        return { isMainPlatform: false, siteName: 'Rotary' };
    }
    try {
        const host = window.location.hostname;
        const isMainPlatform = host === 'clubplatform.org' || host === 'www.clubplatform.org' || host === 'app.clubplatform.org' || (host === 'localhost' && window.location.port !== '5173');

        let siteLogo: string | null = null;
        let siteName: string | null = null;
        let siteType: string | null = null;

        // 1. Datos del club / sitio en almacenamiento local (persistencia de sesión multitenant)
        try {
            const rawClub = localStorage.getItem('rotary_club');
            if (rawClub) {
                const c = JSON.parse(rawClub);
                if (c && typeof c === 'object') {
                    if (typeof c.logo === 'string' && c.logo.trim()) siteLogo = c.logo.trim();
                    if (typeof c.name === 'string' && c.name.trim()) siteName = c.name.trim();
                    if (typeof c.type === 'string') siteType = c.type;
                }
            }
        } catch {}

        // 2. Si no hay logo del club en rotary_club, consultar sesión del usuario logueado
        if (!siteLogo) {
            try {
                const rawUser = localStorage.getItem('rotary_user');
                if (rawUser) {
                    const u = JSON.parse(rawUser);
                    if (u?.club?.logo && typeof u.club.logo === 'string') siteLogo = u.club.logo.trim();
                    if (!siteName && u?.club?.name) siteName = u.club.name.trim();
                }
            } catch {}
        }

        // 3. Logo de plataforma central
        let platformLogo: string | null = null;
        try {
            const cpLogo = localStorage.getItem('cp_platform_logo');
            if (cpLogo) {
                const cp = JSON.parse(cpLogo);
                if (cp?.url) platformLogo = cp.url;
            }
        } catch {}

        return {
            siteLogo,
            siteName: siteName || (isMainPlatform ? 'Club Platform' : 'Organización'),
            siteType,
            isMainPlatform,
            platformLogo: platformLogo || '/images/platform_logo_premium.png'
        };
    } catch {
        return { isMainPlatform: false, siteName: 'Club Platform' };
    }
};

/**
 * Resuelve la identidad visual institucional con la prioridad estricta del sistema:
 * 1. Logo personalizado asignado a la plantilla del sitio (block.logoUrl).
 * 2. Logo institucional configurado en los ajustes del sitio activo (siteContext.siteLogo).
 * 3. Logo predeterminado de Club Platform, únicamente cuando corresponda al entorno central o como fallback explícitamente autorizado.
 * 4. Tipografía institucional limpia del nombre de la organización si el sitio no ha configurado imagen aún (evita suplantación de marca entre organizaciones).
 */
export const resolveInstitutionalLogo = (
    block: GlobalBlockItem,
    siteContext?: SiteBrandingContext
): ResolvedLogoResult => {
    // 1. Logo personalizado asignado a la plantilla del sitio
    if (block.logoUrl && typeof block.logoUrl === 'string' && block.logoUrl.trim().length > 0) {
        const u = block.logoUrl.trim();
        return {
            url: u,
            logoUrl: u,
            source: 'custom',
            alt: siteContext?.siteName ? `Logo de ${siteContext.siteName}` : 'Logo de la Plantilla'
        };
    }

    // 2. Logo institucional configurado en los ajustes del sitio activo
    if (siteContext?.siteLogo && typeof siteContext.siteLogo === 'string' && siteContext.siteLogo.trim().length > 0) {
        const u = siteContext.siteLogo.trim();
        return {
            url: u,
            logoUrl: u,
            source: 'site_settings',
            alt: siteContext.siteName ? `Logo Institucional de ${siteContext.siteName}` : 'Logo Institucional del Sitio'
        };
    }

    // 3. Logo predeterminado de Club Platform, ÚNICAMENTE cuando corresponda al entorno central o como fallback explícitamente autorizado
    if (siteContext?.isMainPlatform) {
        const platLogo = siteContext.platformLogo || 'https://assets.cdn.clubplatform.org/logos/rotary-international-logo-blue.png';
        return {
            url: platLogo,
            logoUrl: platLogo,
            source: 'platform_default',
            alt: 'Club Platform Oficial'
        };
    }

    // 4. Si es un sitio particular (Distrito, Club, etc.) que no tiene logo cargado aún:
    // Nunca usurpar identidad ajena ni mezclar logos de otras organizaciones.
    if (siteContext?.siteName && siteContext.siteName.trim().length > 0) {
        const name = siteContext.siteName.trim();
        return {
            url: undefined,
            logoUrl: null,
            text: name,
            siteName: name,
            source: 'typography',
            alt: name
        };
    }

    return {
        url: undefined,
        logoUrl: null,
        text: 'Club Platform',
        siteName: 'Club Platform',
        source: 'typography',
        alt: 'Club Platform'
    };
};

// Celda con padding vertical por bloque (padTop/padBottom, 0-120px) y
// `data-bid` SOLO en vista previa interactiva (el HTML guardado/enviado
// nunca lo lleva: renderDesignToHtml sin `interactive` no lo emite).
const cell = (inner: string, b?: Block, vPad = '8px 24px', interactive = false): string => {
    let pad = vPad;
    if (b && (b.type !== 'spacer')) {
        const t = num((b as BlockPad).padTop, -1);
        const f = num((b as BlockPad).padBottom, -1);
        if (t >= 0 || f >= 0) {
            const m = vPad.match(/^(\d+)px (\S+)( (\d+)px)?$/);
            const top = t >= 0 ? t : Number(m?.[1] ?? 8);
            const sides = m?.[2] ?? '24px';
            const bot = f >= 0 ? f : Number(m?.[4] ?? 8);
            pad = `${top}px ${sides} ${bot}px`;
        }
    }
    const bid = interactive && b ? ` data-bid="${esc(b.id)}"` : '';
    return `<tr${bid}><td style="padding:${pad}">${inner}</td></tr>`;
};

const renderBlock = (b: Block, s: EmailSettings, interactive = false, siteContext?: SiteBrandingContext): string => {
    const C = (inner: string, vPad = '8px 24px'): string => cell(inner, b, vPad, interactive);
    switch (b.type) {
        case 'heading': {
            const sizes = { 1: 28, 2: 22, 3: 18 } as const;
            return C(`<h${b.level} style="margin:0;font-size:${sizes[b.level]}px;line-height:1.25;color:${esc(b.color)};text-align:${b.align};font-weight:${b.weight === 'normal' ? '400' : b.weight === 'bold' ? '700' : '800'}">${esc(b.text)}</h${b.level}>`);
        }
        case 'text':
            return C(`<div style="font-size:${b.size}px;line-height:1.6;color:${esc(b.color)};text-align:${b.align};font-weight:${b.weight === 'bold' || b.weight === '800' ? '700' : '400'}">${textToHtml(b.text)}</div>`);
        case 'image': {
            if (!b.url) return C(`<div style="padding:24px;text-align:center;color:#9ca3af;border:1px dashed #d1d5db;border-radius:8px">Sin imagen</div>`);
            const img = `<img src="${safeUrl(b.url)}" alt="${esc(b.alt)}" style="width:${b.width}%;max-width:100%;height:auto;border-radius:${b.radius}px;display:inline-block" />`;
            const wrapped = b.href ? `<a href="${safeUrl(b.href)}" target="_blank" style="text-decoration:none">${img}</a>` : img;
            return C(`<div style="text-align:${b.align}">${wrapped}</div>`);
        }
        case 'button': {
            const btn = `<a href="${safeUrl(b.href)}" target="_blank" style="display:inline-block;background:${esc(b.bg)};color:${esc(b.color)};text-decoration:none;padding:12px 28px;border-radius:${b.radius}px;font-weight:700;font-size:15px">${esc(b.text)}</a>`;
            return C(`<div style="text-align:${b.align}">${btn}</div>`, '12px 24px');
        }
        case 'divider':
            return C(`<div style="border-top:${b.thickness}px solid ${esc(b.color)};font-size:0;line-height:0">&nbsp;</div>`, '4px 24px');
        case 'spacer':
            return `<tr${interactive ? ` data-bid="${esc(b.id)}"` : ''}><td style="height:${b.height}px;line-height:${b.height}px;font-size:0">&nbsp;</td></tr>`;
        case 'social': {
            const items = (b.links || []).filter((l) => l.url).map((l) =>
                `<a href="${safeUrl(l.url)}" target="_blank" title="${esc(SOCIAL_NAME[l.network] || '')}" style="display:inline-block;width:34px;height:34px;line-height:34px;text-align:center;background:${esc(b.color)};color:#ffffff;border-radius:50%;text-decoration:none;font-weight:700;font-size:13px;margin:0 4px">${esc(SOCIAL_LABEL[l.network] || '•')}</a>`
            ).join('');
            return C(`<div style="text-align:${b.align}">${items}</div>`);
        }
        case 'video': {
            const thumb = b.thumbnail
                ? `<img src="${safeUrl(b.thumbnail)}" alt="${esc(b.title)}" style="width:100%;max-width:100%;height:auto;border-radius:8px;display:block" />`
                : `<div style="background:#111827;color:#fff;padding:48px 0;border-radius:8px;text-align:center;font-size:28px">▶</div>`;
            return C(`<div style="text-align:${b.align}"><a href="${safeUrl(b.url)}" target="_blank" style="text-decoration:none;color:${esc(s.linkColor)}">${thumb}<div style="margin-top:8px;font-weight:700;font-size:14px">▶ ${esc(b.title)}</div></a></div>`);
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
            return C(
                `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border-collapse:collapse"><tr>
                    <td width="50%" valign="top" style="padding:0 8px 0 0;vertical-align:top">${renderCell(b.left)}</td>
                    <td width="50%" valign="top" style="padding:0 0 0 8px;vertical-align:top">${renderCell(b.right)}</td>
                </tr></table>`
            );
        }
        case 'html':
            return C(b.html || '');
        case 'table': {
            const headers = Array.isArray(b.headers) ? b.headers : [];
            const rows = Array.isArray(b.rows) ? b.rows : [];
            const thHtml = headers.map((h) => `<th style="padding:10px 14px;background-color:${esc(b.headerBg || '#013388')};color:${esc(b.headerColor || '#ffffff')};font-size:13px;font-weight:700;text-align:${b.align || 'left'};border:1px solid ${esc(b.borderColor || '#e2e8f0')}">${esc(h)}</th>`).join('');
            const trHtml = rows.map((r, ri) => {
                const cells = Array.isArray(r.cells) ? r.cells : [];
                const bg = ri % 2 === 0 ? '#ffffff' : '#f8fafc';
                const tdHtml = cells.map((c) => `<td style="padding:10px 14px;background-color:${bg};color:${esc(b.textColor || '#334155')};font-size:13px;border:1px solid ${esc(b.borderColor || '#e2e8f0')}">${esc(c)}</td>`).join('');
                return `<tr>${tdHtml}</tr>`;
            }).join('');
            return C(`<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border-collapse:collapse;width:100%;border:1px solid ${esc(b.borderColor || '#e2e8f0')};border-radius:8px;overflow:hidden">${headers.length ? `<thead><tr>${thHtml}</tr></thead>` : ''}<tbody>${trHtml}</tbody></table>`);
        }
        case 'menu': {
            const items = (b.items || []).filter((it) => it.label).map((it) =>
                `<a href="${safeUrl(it.url)}" target="_blank" style="display:inline-block;padding:6px 12px;color:${esc(b.color || '#013388')};font-size:${b.size || 13}px;font-weight:700;text-decoration:none">${esc(it.label)}</a>`
            ).join('<span style="color:#cbd5e1;font-size:12px;vertical-align:middle">&bull;</span>');
            return C(`<div style="text-align:${b.align || 'center'};padding:4px 0">${items}</div>`);
        }
        case 'global': {
            if (b.globalKey === 'rotary_header') {
                const ctx = siteContext || getActiveSiteBrandingContext();
                const branding = resolveInstitutionalLogo(b, ctx);
                const align = b.align || 'center';
                const headerBg = b.bgGradient || b.bgColor || '#ffffff';
                const headerPadding = b.padding || '24px 20px';
                const maxW = typeof b.logoMaxWidth === 'number' && b.logoMaxWidth > 0 ? b.logoMaxWidth : 240;
                const maxH = typeof b.logoMaxHeight === 'number' && b.logoMaxHeight > 0 ? b.logoMaxHeight : 60;

                const resolvedUrl = branding.url || branding.logoUrl;
                const resolvedText = branding.text || branding.siteName;
                let logoHtml = '';
                if (resolvedUrl) {
                    logoHtml = `<img src="${safeUrl(resolvedUrl)}" alt="${esc(branding.alt || ctx.siteName || 'Identidad Institucional')}" style="max-height: ${maxH}px; max-width: ${maxW}px; width: auto; height: auto; display: inline-block; vertical-align: middle; object-fit: contain; border: 0; outline: none; text-decoration: none;" />`;
                } else if (resolvedText) {
                    logoHtml = `<span style="font-size:20px;font-weight:800;letter-spacing:-0.02em;color:${esc(b.textColor || '#013388')};display:inline-block;text-transform:uppercase">${esc(resolvedText)}</span>`;
                }

                return C(`<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border-collapse:collapse;width:100%">
                    <tr>
                        <td data-rotary-header="true" align="${align}" style="background:${esc(headerBg)};padding:${esc(headerPadding)};text-align:${align};vertical-align:middle">
                            <table role="presentation" align="${align}" cellpadding="0" cellspacing="0" style="${align === 'center' ? 'margin:0 auto;' : align === 'right' ? 'margin-left:auto;margin-right:0;' : 'margin-right:auto;margin-left:0;'}border-collapse:collapse">
                                <tr>
                                    <td align="${align}" style="text-align:${align};vertical-align:middle;line-height:1">
                                        ${logoHtml}
                                    </td>
                                </tr>
                            </table>
                        </td>
                    </tr>
                </table>`, '0px 0px');
            }
            if (b.globalKey === 'rotary_footer') {
                const footerBg = b.bgColor || '#0c2340';
                const footerTitle = b.title !== undefined ? b.title : '¡Síguenos y comparte el orgullo rotario!';
                const showAreas = b.showAreas !== false;
                const showSocial = b.showSocial !== false;
                const whatsappUrl = b.whatsappUrl !== undefined ? b.whatsappUrl : 'https://wa.me/573108520231';
                const whatsappText = b.whatsappText || 'Asistencia directa a través de WhatsApp';
                const footerText = b.footerText !== undefined ? b.footerText : 'Rotary en Acción · Distritos 4271 y 4281 Colombia.<br/>&copy; 2026 Rotary International. Todos los derechos reservados.<br/><a href="{{unsubscribe_url}}" target="_blank" style="color:#cbd5e1;text-decoration:underline">Preferencias de comunicación y cancelar suscripción</a>';

                const footerLogo = b.logoUrl
                    ? `<div style="margin-bottom:14px"><img src="${safeUrl(b.logoUrl)}" alt="Footer Logo" style="max-height:48px;max-width:220px;display:inline-block;vertical-align:middle" /></div>`
                    : '';

                const areasHtml = showAreas ? `<div style="margin-bottom:18px">
                    <span style="display:inline-block;background-color:rgba(255,255,255,0.12);padding:4px 10px;border-radius:20px;font-size:11px;margin:2px 3px;color:#e2e8f0">&#128167; Agua</span>
                    <span style="display:inline-block;background-color:rgba(255,255,255,0.12);padding:4px 10px;border-radius:20px;font-size:11px;margin:2px 3px;color:#e2e8f0">&#128737;&#65039; Salud</span>
                    <span style="display:inline-block;background-color:rgba(255,255,255,0.12);padding:4px 10px;border-radius:20px;font-size:11px;margin:2px 3px;color:#e2e8f0">&#128118; Madres y Ni&ntilde;os</span>
                    <span style="display:inline-block;background-color:rgba(255,255,255,0.12);padding:4px 10px;border-radius:20px;font-size:11px;margin:2px 3px;color:#e2e8f0">&#128218; Educaci&oacute;n</span>
                    <span style="display:inline-block;background-color:rgba(255,255,255,0.12);padding:4px 10px;border-radius:20px;font-size:11px;margin:2px 3px;color:#e2e8f0">&#128104;&#8205;&#127806; Econom&iacute;a</span>
                    <span style="display:inline-block;background-color:rgba(255,255,255,0.12);padding:4px 10px;border-radius:20px;font-size:11px;margin:2px 3px;color:#e2e8f0">&#127807; Ambiente</span>
                    <span style="display:inline-block;background-color:rgba(255,255,255,0.12);padding:4px 10px;border-radius:20px;font-size:11px;margin:2px 3px;color:#e2e8f0">&#128330;&#65039; Paz</span>
                </div>` : '';

                const socialHtml = showSocial ? `<div style="margin-bottom:16px">
                    <a href="https://instagram.com" target="_blank" style="display:inline-block;width:32px;height:32px;line-height:32px;border-radius:50%;background:#013388;color:#fff;text-decoration:none;margin:0 4px;font-weight:700">IG</a>
                    <a href="https://facebook.com" target="_blank" style="display:inline-block;width:32px;height:32px;line-height:32px;border-radius:50%;background:#013388;color:#fff;text-decoration:none;margin:0 4px;font-weight:700">FB</a>
                    <a href="https://youtube.com" target="_blank" style="display:inline-block;width:32px;height:32px;line-height:32px;border-radius:50%;background:#013388;color:#fff;text-decoration:none;margin:0 4px;font-weight:700">&#9654;</a>
                    <a href="https://app.clubplatform.org/rotary-en-accion" target="_blank" style="display:inline-block;width:32px;height:32px;line-height:32px;border-radius:50%;background:#013388;color:#fff;text-decoration:none;margin:0 4px;font-weight:700">&#127760;</a>
                </div>` : '';

                const whatsappHtml = whatsappUrl ? `<div style="font-size:13px;margin-bottom:12px">
                    <a href="${safeUrl(whatsappUrl)}" target="_blank" style="color:#38bdf8;text-decoration:underline;font-weight:700">&#128172; ${esc(whatsappText)}</a>
                </div>` : '';

                return C(`<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border-collapse:collapse;background-color:${esc(footerBg)};border-radius:0 0 12px 12px;overflow:hidden;margin-top:24px">
                    <tr>
                        <td style="padding:28px 24px;text-align:center;color:#ffffff">
                            ${footerLogo}
                            ${footerTitle ? `<div style="font-size:14px;font-weight:800;letter-spacing:0.06em;text-transform:uppercase;margin-bottom:14px;color:#ffffff">${esc(footerTitle)}</div>` : ''}
                            ${areasHtml}
                            ${socialHtml}
                            ${whatsappHtml}
                            <div style="font-size:11px;color:#94a3b8;line-height:1.5;margin-top:12px;border-top:1px solid rgba(255,255,255,0.1);padding-top:12px">
                                ${footerText}
                            </div>
                        </td>
                    </tr>
                </table>`, '0px 0px');
            }
            if (b.globalKey === 'rotary_signature') {
                const title = b.title || 'Comité Distrital de Imagen Pública y Comunicaciones';
                const subtitle = b.subtitle || 'Rotary en Acción · Distritos 4271 y 4281';
                const motto = b.motto || '«Dar de sí antes de pensar en sí»';
                const sigBg = b.bgColor || '#f8fafc';
                const sigBorder = b.borderColor || '#013388';

                return C(`<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border-collapse:collapse;margin:16px 0;border-left:4px solid ${esc(sigBorder)};background-color:${esc(sigBg)};border-radius:0 12px 12px 0">
                    <tr>
                        <td style="padding:16px 20px;color:#334155;font-size:14px;line-height:1.6">
                            <div style="font-weight:700;color:#0f172a;font-size:15px">${esc(title)}</div>
                            <div style="color:#64748b;font-size:13px">${esc(subtitle)}</div>
                            <div style="margin-top:8px;font-weight:600;color:${esc(sigBorder)}">${esc(motto)}</div>
                        </td>
                    </tr>
                </table>`);
            }
            if (b.globalKey === 'rotary_areas_focus') {
                const title = b.title || 'Las 7 Áreas de Interés de Rotary International:';
                const areasBg = b.bgColor || '#f8fafc';

                return C(`<div style="background-color:${esc(areasBg)};border:1px solid #e2e8f0;border-radius:12px;padding:20px;margin:16px 0">
                    <div style="font-size:14px;font-weight:800;color:#013388;margin-bottom:10px;text-transform:uppercase;letter-spacing:0.05em">&#127775; ${esc(title)}</div>
                    <ul style="margin:0;padding-left:18px;color:#334155;font-size:13px;line-height:1.7">
                        <li><strong>&#128167; Agua, saneamiento e higiene</strong> &mdash; Acceso a agua potable y h&aacute;bitos saludables.</li>
                        <li><strong>&#128737;&#65039; Prevenci&oacute;n y tratamiento de enfermedades</strong> &mdash; Jornadas m&eacute;dicas y salud preventiva.</li>
                        <li><strong>&#128118; Salud materno-infantil</strong> &mdash; Protecci&oacute;n de madres, beb&eacute;s y nutrici&oacute;n b&aacute;sica.</li>
                        <li><strong>&#128218; Apoyo a la educaci&oacute;n</strong> &mdash; Alfabetizaci&oacute;n, becas y dotaci&oacute;n escolar.</li>
                        <li><strong>&#128104;&#8205;&#127806; Desarrollo econ&oacute;mico local</strong> &mdash; Emprendimiento y capacitaci&oacute;n comunitaria.</li>
                        <li><strong>&#127807; Medio ambiente</strong> &mdash; Reforestaci&oacute;n, reciclaje y cuidado del ecosistema.</li>
                        <li><strong>&#128330;&#65039; Construcci&oacute;n de la paz</strong> &mdash; Resoluci&oacute;n de conflictos y armon&iacute;a social.</li>
                    </ul>
                </div>`);
            }
            return C(b.customHtml || '<div style="padding:12px;background:#f3f4f6;border-radius:8px">Bloque Global Institucional</div>');
        }
        default:
            return '';
    }
};

// Renderiza el diseño completo a un fragmento HTML listo para EmailCampaign.content.
// No incluye <html>/<body> ni el pie de baja (eso lo añade buildEmailHtml al enviar).
export const renderDesignToHtml = (
    design: EmailDesign,
    opts: { interactive?: boolean; siteContext?: SiteBrandingContext } = {}
): string => {
    const s = { ...DEFAULT_SETTINGS, ...(design?.settings || {}) };
    const blocks = Array.isArray(design?.blocks) ? design.blocks : [];
    const rows = blocks.map((b) => renderBlock(b, s, !!opts.interactive, opts.siteContext)).join('');
    const script = opts.interactive
        ? `<script>document.addEventListener('click',function(e){var el=e.target&&e.target.closest?e.target.closest('[data-bid]'):null;if(el&&window.parent){window.parent.postMessage({type:'ca-select-block',id:el.getAttribute('data-bid')},'*');}});<\/script>`
        : '';
    return `<div style="background:${esc(s.bg)};font-family:${s.font};color:${esc(s.textColor)}">
<table role="presentation" align="center" width="${s.width}" cellpadding="0" cellspacing="0" style="width:100%;max-width:${s.width}px;margin:0 auto;background:${esc(s.contentBg)};border-collapse:collapse">
${rows}
</table>
</div>${script}`;
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

/**
 * Normaliza y desacopla cualquier diseño recibido:
 * Garantiza que la cabecera contenga EXCLUSIVAMENTE la identidad institucional del sitio,
 * y que si el diseño previo contenía títulos promocionales en la cabecera, estos se muevan
 * limpiamente al cuerpo editable de la campaña sin pérdida de contenido.
 */
export const normalizeInstitutionalDesign = (rawDesign?: EmailDesign | null): EmailDesign => {
    const base = rawDesign || createRotaryMasterDesign();
    if (!base || !Array.isArray(base.blocks)) return createRotaryMasterDesign();

    const headerIdx = base.blocks.findIndex((b) => b.globalKey === 'rotary_header');
    if (headerIdx === -1) return base;

    const hdr = base.blocks[headerIdx] as GlobalBlockItem;
    const oldTitle = hdr.title ? String(hdr.title).replace(/<br\s*\/?>/gi, '\n').trim() : '';

    const cleanedHeader: GlobalBlockItem = {
        ...hdr,
        label: 'Cabecera Institucional Adaptable',
        align: hdr.align || 'center',
        bgColor: hdr.bgColor || hdr.bgGradient || '#ffffff',
        bgGradient: hdr.bgGradient || undefined,
        padding: hdr.padding || '24px 20px',
        logoMaxWidth: typeof hdr.logoMaxWidth === 'number' && hdr.logoMaxWidth > 0 ? hdr.logoMaxWidth : 240,
        logoMaxHeight: typeof hdr.logoMaxHeight === 'number' && hdr.logoMaxHeight > 0 ? hdr.logoMaxHeight : 60,
        title: undefined,
        subtitle: undefined,
        badge: undefined,
    };

    const newBlocks = [...base.blocks];
    newBlocks[headerIdx] = cleanedHeader;

    if (oldTitle && !newBlocks.some((b) => b.type === 'heading' && b.text?.includes(oldTitle.split('\n')[0]))) {
        newBlocks.splice(headerIdx + 1, 0, {
            id: newId(),
            type: 'heading',
            text: oldTitle,
            level: 1,
            align: 'center',
            color: '#013388',
            weight: '800',
            label: 'Título de Campaña (Editable)',
            isProtected: false,
        });
    }

    return {
        ...base,
        blocks: newBlocks
    };
};

// ─── Plantilla Maestra Institucional: Rotary en Acción ──────────────────────
export const createRotaryMasterDesign = (): EmailDesign => ({
    version: 1,
    settings: {
        bg: '#0d233a',
        contentBg: '#ffffff',
        font: "-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif",
        textColor: '#334155',
        linkColor: '#013388',
        width: 600,
    },
    blocks: [
        {
            id: newId(),
            type: 'global',
            globalKey: 'rotary_header',
            label: 'Cabecera Institucional Adaptable',
            isProtected: true,
            isLocked: false,
            logoUrl: '',
            logoMaxWidth: 240,
            logoMaxHeight: 60,
            align: 'center',
            bgColor: '#ffffff',
            padding: '24px 20px',
        },
        {
            id: newId(),
            type: 'heading',
            text: 'Tu club transforma comunidades.\n¡Hagámoslo visible!',
            level: 1,
            align: 'center',
            color: '#013388',
            weight: '800',
            label: 'Título de Campaña (Editable)',
            isProtected: false,
        },
        {
            id: newId(),
            type: 'heading',
            text: 'Hola {{contact.first_name|Líder Rotario(a)}},',
            level: 2,
            align: 'left',
            color: '#0f172a',
            weight: '800',
            label: 'Saludo Personalizado',
            isProtected: false,
        },
        {
            id: newId(),
            type: 'text',
            text: 'Estimadas rotarias y estimados rotarios:\n\nCada semana, los clubes realizan un esfuerzo incansable por sus comunidades: jornadas de salud, agua potable, becas educativas y proyectos sostenibles. Rotary en Acción es la plataforma oficial para visibilizar, registrar y difundir ese impacto ante el mundo.',
            align: 'left',
            color: '#334155',
            size: 15,
            label: 'Cuerpo de Campaña (Editable / Asistido por IA)',
            isProtected: false,
        },
        {
            id: newId(),
            type: 'global',
            globalKey: 'rotary_areas_focus',
            label: '7 Áreas de Enfoque Institucionales',
            isProtected: true,
            isLocked: false,
            title: 'Las 7 Áreas de Interés de Rotary International:',
            bgColor: '#f8fafc',
        },
        {
            id: newId(),
            type: 'text',
            text: '¡Tu club tiene mucho que contar! Ingresa al formulario de Rotary en Acción y comparte las fotos y detalles de tu proyecto en menos de 3 minutos.',
            align: 'left',
            color: '#334155',
            size: 15,
            label: 'Llamado al Registro (Editable)',
            isProtected: false,
        },
        {
            id: newId(),
            type: 'button',
            text: 'COMPARTIR ACTIVIDAD EN ROTARY EN ACCIÓN',
            href: '{{form_url}}',
            bg: '#013388',
            color: '#ffffff',
            align: 'center',
            radius: 12,
            label: 'Botón de Acción Principal (Estilo Protegido / Enlace Dinámico)',
            isProtected: false,
        },
        {
            id: newId(),
            type: 'global',
            globalKey: 'rotary_signature',
            label: 'Firma Oficial Distrital',
            isProtected: true,
            isLocked: false,
            title: 'Comité Distrital de Imagen Pública y Comunicaciones',
            subtitle: 'Rotary en Acción',
            motto: '«Dar de sí antes de pensar en sí»',
            bgColor: '#f8fafc',
            borderColor: '#013388',
        },
        {
            id: newId(),
            type: 'global',
            globalKey: 'rotary_footer',
            label: 'Pie de Página Institucional Protegido',
            isProtected: true,
            isLocked: false,
            title: '¡Síguenos y comparte el orgullo rotario!',
            bgColor: '#0c2340',
            showAreas: true,
            showSocial: true,
            whatsappUrl: 'https://wa.me/573108520231',
            whatsappText: 'Asistencia directa a través de WhatsApp',
            footerText: 'Rotary en Acción • Plataforma Oficial de Visibilidad.<br/>&copy; 2026 Rotary International. Todos los derechos reservados.<br/><a href="{{unsubscribe_url}}" target="_blank" style="color:#cbd5e1;text-decoration:underline">Preferencias de comunicación y cancelar suscripción</a>',
            logoUrl: '',
        },
    ],
});

// Catálogo de bloques globales institucionales reutilizables
export const getRotaryGlobalBlocksCatalog = () => [
    {
        key: 'rotary_header',
        name: 'Cabecera Institucional Adaptable',
        category: 'Cabecera',
        description: 'Logo oficial adaptado automáticamente a la identidad institucional del sitio activo.',
        isProtected: true,
    },
    {
        key: 'rotary_areas_focus',
        name: '7 Áreas de Interés de Rotary',
        category: 'Contenido',
        description: 'Tarjeta estructurada con las siete causas oficiales de servicio rotario.',
        isProtected: true,
    },
    {
        key: 'rotary_signature',
        name: 'Firma Oficial Distrital',
        category: 'Firmas',
        description: 'Firma del Comité Distrital de Imagen Pública y Comunicaciones.',
        isProtected: true,
    },
    {
        key: 'rotary_footer',
        name: 'Footer Institucional Protegido',
        category: 'Pie de página',
        description: 'Insignias de áreas de interés, redes sociales, asistencia WhatsApp y enlace de baja legal.',
        isProtected: true,
    },
];

// Inyección no destructiva de contenido de campaña en una plantilla maestra
export const injectCampaignIntoDesign = (
    masterDesign: EmailDesign,
    campaign: {
        subject?: string;
        name?: string;
        messageCentral?: string;
        contentHtml?: string;
        formUrl?: string;
        utmCampaign?: string;
    }
): EmailDesign => {
    const base = normalizeInstitutionalDesign(masterDesign || createRotaryMasterDesign());
    const blocks = base.blocks.map((b) => {
        // Bloques protegidos quedan 100% intactos
        if (b.isProtected) return { ...b };

        // Actualizar el título de campaña en el bloque editable de cabecera de contenido
        if (b.type === 'heading' && (b.label?.includes('Título') || b.level === 1)) {
            return {
                ...b,
                text: campaign.name || b.text,
            };
        }

        // Si es el texto de campaña editable
        if (b.type === 'text' && (b.label?.includes('Cuerpo') || b.label?.includes('Editable'))) {
            return {
                ...b,
                text: campaign.messageCentral
                    ? `Estimadas rotarias y estimados rotarios:\n\n${campaign.messageCentral}\n\nLos invitamos a ingresar al formulario unificado y postular las evidencias de su club.`
                    : b.text,
            };
        }

        // Si es el botón CTA
        if (b.type === 'button') {
            const url = campaign.formUrl || `https://app.clubplatform.org/rotary-en-accion?utm_source=email_marketing&utm_medium=campaign&utm_campaign=${campaign.utmCampaign || 'rotary_campana'}`;
            return {
                ...b,
                href: url,
            };
        }

        return { ...b };
    });

    return {
        ...base,
        blocks,
    };
};

