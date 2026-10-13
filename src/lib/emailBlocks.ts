import { DEFAULT_TIPOS } from './rotaryEnAccionSpec.ts';

export type Align = 'left' | 'center' | 'right';

// Espaciado vertical por bloque (v4.1170, opcional: ausente = 0).
export interface BlockPad { padTop?: number; padBottom?: number; }
export type BlockWeight = '300' | '400' | '500' | '600' | '700' | '800' | 'normal' | 'bold';

export type SocialNetwork = 'facebook' | 'instagram' | 'x' | 'linkedin' | 'youtube' | 'whatsapp' | 'web';

export interface BaseBlock extends BlockPad {
    id: string;
    isProtected?: boolean; // Componente institucional protegido (no deformable ni alterable por IA)
    isLocked?: boolean;
    label?: string; // Etiqueta legible (ej: "Encabezado Institucional", "Cuerpo de Campaña")
    globalKey?: string; // Clave de bloque global ('rotary_header' | 'rotary_footer' | 'rotary_signature' | 'rotary_areas_focus')
}

export interface HeadingBlock extends BaseBlock {
    type: 'heading';
    text: string;
    level: 1 | 2 | 3;
    align: Align;
    color: string;
    weight?: BlockWeight;
    fontFamily?: string;
    fontWeight?: BlockWeight;
    fontSize?: number;
    lineHeight?: number;
    letterSpacing?: number | string;
}

export interface TextBlock extends BaseBlock {
    type: 'text';
    text: string;
    align: Align;
    color: string;
    size: number;
    weight?: BlockWeight;
    fontFamily?: string;
    fontWeight?: BlockWeight;
    lineHeight?: number;
    letterSpacing?: number | string;
}

export interface ImageBlock extends BaseBlock { type: 'image'; url: string; alt: string; href: string; align: Align; width: number; radius: number; }

export interface ButtonBlock extends BaseBlock {
    type: 'button';
    text: string;
    href: string;
    bg: string;
    color: string;
    align: Align;
    radius: number;
    fontFamily?: string;
    fontWeight?: BlockWeight;
    fontSize?: number;
    lineHeight?: number;
    letterSpacing?: number | string;
}

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
export interface TableBlock extends BaseBlock {
    type: 'table';
    headers?: string[];
    rows: TableRow[];
    borderColor?: string;
    headerBg?: string;
    headerColor?: string;
    textColor?: string;
    align?: Align;
}

export type SocialIconStyle = 'white' | 'black' | 'color';

export interface FooterSocialLink {
    network: string; // 'instagram' | 'facebook' | 'youtube' | 'linkedin' | 'tiktok' | 'x' | 'whatsapp' | 'web' | string;
    url: string;
    label?: string;
    customIconUrl?: string;
}

export const DEFAULT_FOOTER_SOCIAL_LINKS: FooterSocialLink[] = [
    { network: 'instagram', url: 'https://instagram.com', label: 'Instagram' },
    { network: 'facebook', url: 'https://facebook.com', label: 'Facebook' },
    { network: 'youtube', url: 'https://youtube.com', label: 'YouTube' },
    { network: 'linkedin', url: 'https://linkedin.com', label: 'LinkedIn' },
    { network: 'x', url: 'https://x.com', label: 'X (Twitter)' },
    { network: 'web', url: 'https://app.clubplatform.org/rotary-en-accion', label: 'Rotary en Acción' },
];

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
    showWhatsapp?: boolean;
    showWhatsappIcon?: boolean;
    whatsappColor?: string;
    whatsappFontSize?: number;
    whatsappFontWeight?: '400' | '600' | '700';
    whatsappAlign?: Align;
    motto?: string;
    footerText?: string;
    showAreas?: boolean;
    showSocial?: boolean;
    socialLinks?: FooterSocialLink[];
    socialIconStyle?: SocialIconStyle;
    socialIconSize?: number;
    socialIconGap?: number;
    socialAlign?: Align;
    customHtml?: string;
    padding?: string;
    borderColor?: string;
    align?: Align;
    // CTA Promocional Club Platform (Shopify-style)
    buttonText?: string;
    buttonHref?: string;
    buttonBg?: string;
    buttonColor?: string;
    buttonRadius?: number;
    enabled?: boolean;
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
    bg: '#0d233a',
    contentBg: '#ffffff',
    font: "'Open Sans', Helvetica, Arial, sans-serif",
    textColor: '#334155',
    linkColor: '#013388',
    width: 600,
};

export const FONT_OPTIONS = [
    { value: "'Open Sans', Helvetica, Arial, sans-serif", label: 'Open Sans (Institucional Rotary & Club Platform)' },
    { value: "Arial, Helvetica, sans-serif", label: 'Arial' },
    { value: "Helvetica, Arial, sans-serif", label: 'Helvetica' },
    { value: "Georgia, 'Times New Roman', serif", label: 'Georgia' },
    { value: "Verdana, Geneva, sans-serif", label: 'Verdana' },
    { value: "'Trebuchet MS', Tahoma, sans-serif", label: 'Trebuchet MS' },
    { value: "Tahoma, Verdana, sans-serif", label: 'Tahoma' },
];

export const FONT_WEIGHT_OPTIONS = [
    { value: '300', label: 'Light (300)' },
    { value: '400', label: 'Regular (400)' },
    { value: '500', label: 'Medium (500)' },
    { value: '600', label: 'SemiBold (600)' },
    { value: '700', label: 'Bold (700)' },
    { value: '800', label: 'ExtraBold (800)' },
];

export const LINE_HEIGHT_OPTIONS = [
    { value: 1.15, label: '1.15 (Muy Compacto)' },
    { value: 1.25, label: '1.25 (Encabezados)' },
    { value: 1.4, label: '1.4 (Compacto)' },
    { value: 1.5, label: '1.5 (Estándar)' },
    { value: 1.6, label: '1.6 (Lectura Óptima)' },
    { value: 1.8, label: '1.8 (Aireado)' },
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
    domain?: string | null;
    publicUrl?: string | null;
    rotaryEnAccionUrl?: string | null;
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
 * Resuelve dinámicamente la URL pública del formulario de Rotary en Acción
 * según la configuración institucional del sitio activo donde se ejecuta la campaña.
 *
 * Prioridades:
 * 1. Sobrescritura manual explícita (rotaryEnAccionUrl), descartando subdominios técnicos internos si hay dominio propio.
 * 2. Distrito 4281: mapea cualquier alias o entidad distrital 4281 al dominio verificado oficial https://rotary4281.org/rotary-en-accion.
 * 3. Dominio público personalizado verificado del sitio (excluyendo subdominios internos *.clubplatform.org).
 * 4. publicUrl del sitio activo si tiene dominio personalizado.
 * 5. Subdominio técnico específico de club si no tiene dominio propio aún.
 * 6. Fallback universal al entorno oficial de Club Platform.
 */
export const resolveSiteRotaryEnAccionUrl = (siteContext?: SiteBrandingContext): string => {
    // 1. Si se configuró manualmente una URL explícita (sobrescritura por usuario)
    if (siteContext?.rotaryEnAccionUrl && typeof siteContext.rotaryEnAccionUrl === 'string' && siteContext.rotaryEnAccionUrl.trim()) {
        const customUrl = siteContext.rotaryEnAccionUrl.trim();
        // Si no es un subdominio técnico interno obsoleto de distrito-4281, respetar la sobrescritura
        if (!customUrl.includes('distrito-4281-de-rotary-international.clubplatform.org')) {
            return customUrl;
        }
    }

    const rawDomain = (siteContext?.domain || '').toLowerCase().trim();
    const rawPublicUrl = (siteContext?.publicUrl || '').toLowerCase().trim();
    const siteName = (siteContext?.siteName || '').toLowerCase().trim();

    // 2. Detección unívoca de Distrito 4281 (dominio verificado oficial: rotary4281.org)
    const isD4281 = rawDomain.includes('4281') ||
        rawPublicUrl.includes('4281') ||
        siteName.includes('4281') ||
        rawDomain.includes('distrito-4281');

    if (isD4281) {
        return 'https://rotary4281.org/rotary-en-accion';
    }

    // 3. Dominio público personalizado del sitio (excluyendo subdominios técnicos *.clubplatform.org)
    const cleanDomain = rawDomain.replace(/^https?:\/\//, '').replace(/\/.*$/, '').replace(/^www\./, '');
    const isTechnicalSubdomain = cleanDomain.endsWith('.clubplatform.org') || cleanDomain === 'clubplatform.org';

    if (cleanDomain && !isTechnicalSubdomain) {
        return `https://${cleanDomain}/rotary-en-accion`;
    }

    // 4. publicUrl personalizada que no sea subdominio técnico interno
    if (rawPublicUrl) {
        const cleanPublic = rawPublicUrl.replace(/^https?:\/\//, '').replace(/\/+$/, '').replace(/^www\./, '');
        if (cleanPublic && !cleanPublic.endsWith('.clubplatform.org') && cleanPublic !== 'clubplatform.org') {
            return `https://${cleanPublic}/rotary-en-accion`;
        }
    }

    // 5. Subdominio técnico individual de un club (no central)
    if (cleanDomain && cleanDomain.endsWith('.clubplatform.org') && cleanDomain !== 'app.clubplatform.org' && cleanDomain !== 'clubplatform.org') {
        return `https://${cleanDomain}/rotary-en-accion`;
    }

    // 6. Entorno central / Fallback universal
    return 'https://app.clubplatform.org/rotary-en-accion';
};

/**
 * Obtiene el contexto institucional activo del sitio actual desde el entorno / almacenamiento local
 * cuando no se pasa un siteContext explícito. Reutiliza la arquitectura multitenant del sistema.
 */
export const getActiveSiteBrandingContext = (): SiteBrandingContext => {
    if (typeof window === 'undefined') {
        return { isMainPlatform: false, siteName: 'Rotary', rotaryEnAccionUrl: 'https://app.clubplatform.org/rotary-en-accion' };
    }
    try {
        const host = window.location.hostname;
        const isMainPlatform = host === 'clubplatform.org' || host === 'www.clubplatform.org' || host === 'app.clubplatform.org' || (host === 'localhost' && window.location.port !== '5173');

        let siteLogo: string | null = null;
        let siteName: string | null = null;
        let siteType: string | null = null;
        let domain: string | null = null;
        let publicUrl: string | null = null;

        // 1. Datos del club / sitio en almacenamiento local (persistencia de sesión multitenant)
        try {
            const rawClub = localStorage.getItem('rotary_club');
            if (rawClub) {
                const c = JSON.parse(rawClub);
                if (c && typeof c === 'object') {
                    if (typeof c.logo === 'string' && c.logo.trim()) siteLogo = c.logo.trim();
                    if (typeof c.name === 'string' && c.name.trim()) siteName = c.name.trim();
                    if (typeof c.type === 'string') siteType = c.type;
                    if (typeof c.domain === 'string' && c.domain.trim()) domain = c.domain.trim();
                    else if (typeof c.customDomain === 'string' && c.customDomain.trim()) domain = c.customDomain.trim();
                    if (typeof c.publicUrl === 'string' && c.publicUrl.trim()) publicUrl = c.publicUrl.trim();

                    // Si corresponde a Distrito 4281, el dominio verificado oficial es rotary4281.org
                    const is4281 = c.district === 4281 || c.district === '4281' || String(c.subdomain || '').includes('4281') || String(c.name || '').includes('4281');
                    if (is4281 && (!domain || domain.includes('.clubplatform.org'))) {
                        domain = 'rotary4281.org';
                        publicUrl = 'https://rotary4281.org';
                    }
                }
            }
        } catch {}

        // 2. Si no hay logo del club en rotary_club, consultar sesión del usuario logueado
        if (!siteLogo || !domain) {
            try {
                const rawUser = localStorage.getItem('rotary_user');
                if (rawUser) {
                    const u = JSON.parse(rawUser);
                    if (!siteLogo && u?.club?.logo && typeof u.club.logo === 'string') siteLogo = u.club.logo.trim();
                    if (!siteName && u?.club?.name) siteName = u.club.name.trim();
                    if (!domain && u?.club?.domain && typeof u.club.domain === 'string') domain = u.club.domain.trim();

                    const is4281 = u?.club?.district === 4281 || u?.club?.district === '4281' || String(u?.club?.subdomain || '').includes('4281') || String(u?.club?.name || '').includes('4281');
                    if (is4281 && (!domain || domain.includes('.clubplatform.org'))) {
                        domain = 'rotary4281.org';
                        publicUrl = 'https://rotary4281.org';
                    }
                }
            } catch {}
        }

        // 3. Fallback de dominio desde el hostname activo si no es entorno genérico
        if (!domain && host && host !== 'localhost' && !isMainPlatform) {
            domain = host.replace(/^www\./, '');
        }

        // 4. Logo de plataforma central
        let platformLogo: string | null = null;
        try {
            const cpLogo = localStorage.getItem('cp_platform_logo');
            if (cpLogo) {
                const cp = JSON.parse(cpLogo);
                if (cp?.url) platformLogo = cp.url;
            }
        } catch {}

        const ctx: SiteBrandingContext = {
            siteLogo,
            siteName: siteName || (isMainPlatform ? 'Club Platform' : 'Organización'),
            siteType,
            isMainPlatform,
            platformLogo: platformLogo || '/images/platform_logo_premium.png',
            domain,
            publicUrl: publicUrl || (domain ? `https://${domain}` : null),
        };
        ctx.rotaryEnAccionUrl = resolveSiteRotaryEnAccionUrl(ctx);
        return ctx;
    } catch {
        return { isMainPlatform: false, siteName: 'Club Platform', rotaryEnAccionUrl: 'https://app.clubplatform.org/rotary-en-accion' };
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
    const isZeroPad = pad === '0px 0px' || pad === '0px' || pad === '0';
    const tdExtraStyle = isZeroPad ? ';margin:0;font-size:0px;line-height:0px;border-collapse:collapse' : '';
    return `<tr${bid} style="margin:0;padding:0"><td style="padding:${pad}${tdExtraStyle}">${inner}</td></tr>`;
};

export interface RenderBlockContext {
    isCtaActive?: boolean;
}

export const renderFooterSocialIcons = (
    links: FooterSocialLink[],
    style: SocialIconStyle = 'white',
    size = 28,
    gap = 12
): string => {
    const activeLinks = (links || []).filter(l => l && l.url && l.url.trim().length > 0);
    if (!activeLinks.length) return '';

    const baseUrl = 'https://app.clubplatform.org';
    const halfGap = Math.round(gap / 2);

    const iconsHtml = activeLinks.map(l => {
        const net = (l.network || 'web').toLowerCase();
        const iconSrc = l.customIconUrl && l.customIconUrl.trim().length > 0
            ? safeUrl(l.customIconUrl)
            : `${baseUrl}/icons/social/${encodeURIComponent(net)}-${style}.png`;
        const label = l.label || net.toUpperCase();

        return `<a href="${safeUrl(l.url)}" target="_blank" style="display:inline-block;margin:0 ${halfGap}px 6px ${halfGap}px;text-decoration:none;border:0;line-height:1">` +
            `<img src="${iconSrc}" alt="${esc(label)}" width="${size}" height="${size}" style="display:inline-block;width:${size}px;height:${size}px;border:0;outline:none;text-decoration:none;vertical-align:middle" />` +
            `</a>`;
    }).join('');

    return `<div style="text-align:center;margin-bottom:16px;line-height:1">${iconsHtml}</div>`;
};

const renderBlock = (
    b: Block,
    s: EmailSettings,
    interactive = false,
    siteContext?: SiteBrandingContext,
    renderCtx?: RenderBlockContext
): string => {
    const C = (inner: string, vPad = '8px 24px'): string => cell(inner, b, vPad, interactive);
    switch (b.type) {
        case 'heading': {
            const sizes = { 1: 28, 2: 22, 3: 18 } as const;
            const fontFam = b.fontFamily || s.font;
            const fontW = b.fontWeight || (b.weight === 'normal' ? '400' : b.weight === 'bold' ? '700' : '800');
            const fontSz = b.fontSize || sizes[b.level];
            const lineH = b.lineHeight || 1.25;
            const letterSp = b.letterSpacing !== undefined && b.letterSpacing !== null && b.letterSpacing !== ''
                ? (typeof b.letterSpacing === 'number' || /^-?\d+(\.\d+)?$/.test(String(b.letterSpacing).trim()) ? `${b.letterSpacing}px` : String(b.letterSpacing))
                : '-0.02em';
            return C(`<h${b.level} style="margin: 0; font-family: ${fontFam}; font-size: ${fontSz}px; line-height: ${lineH}; letter-spacing: ${letterSp}; color: ${esc(b.color)}; text-align: ${b.align}; font-weight: ${fontW}">${esc(b.text)}</h${b.level}>`);
        }
        case 'text': {
            const fontFam = b.fontFamily || s.font;
            const fontW = b.fontWeight || (b.weight === 'bold' || b.weight === '800' ? '700' : '400');
            const fontSz = b.size || 15;
            const lineH = b.lineHeight || 1.6;
            const letterSp = b.letterSpacing !== undefined && b.letterSpacing !== null && b.letterSpacing !== ''
                ? (typeof b.letterSpacing === 'number' || /^-?\d+(\.\d+)?$/.test(String(b.letterSpacing).trim()) ? `${b.letterSpacing}px` : String(b.letterSpacing))
                : 'normal';
            return C(`<div style="font-family: ${fontFam}; font-size: ${fontSz}px; line-height: ${lineH}; letter-spacing: ${letterSp}; color: ${esc(b.color)}; text-align: ${b.align}; font-weight: ${fontW}">${textToHtml(b.text)}</div>`);
        }
        case 'image': {
            if (!b.url) return C(`<div style="padding: 24px; text-align: center; color: #9ca3af; border: 1px dashed #d1d5db; border-radius: 8px">Sin imagen</div>`);
            const img = `<img src="${safeUrl(b.url)}" alt="${esc(b.alt)}" style="width: ${b.width}%; max-width: 100%; height: auto; border-radius: ${b.radius}px; display: inline-block" />`;
            const wrapped = b.href ? `<a href="${safeUrl(b.href)}" target="_blank" style="text-decoration: none">${img}</a>` : img;
            return C(`<div style="text-align: ${b.align}">${wrapped}</div>`);
        }
        case 'button': {
            const fontFam = b.fontFamily || s.font;
            const fontW = b.fontWeight || '700';
            const fontSz = b.fontSize || 15;
            const lineH = b.lineHeight || 1.2;
            const letterSp = b.letterSpacing !== undefined && b.letterSpacing !== null && b.letterSpacing !== ''
                ? (typeof b.letterSpacing === 'number' || /^-?\d+(\.\d+)?$/.test(String(b.letterSpacing).trim()) ? `${b.letterSpacing}px` : String(b.letterSpacing))
                : '0.02em';

            // Resolución dinámica de URL inteligente si contiene {{form_url}} o es enlace de formulario oficial
            let targetHref = b.href || '';
            if (targetHref === '{{form_url}}' || targetHref.includes('{{form_url}}')) {
                const smartUrl = resolveSiteRotaryEnAccionUrl(siteContext);
                targetHref = targetHref.replace(/\{\{form_url\}\}/g, smartUrl);
            }

            const btn = `<a href="${safeUrl(targetHref)}" target="_blank" style="display: inline-block; background: ${esc(b.bg)}; color: ${esc(b.color)}; text-decoration: none; padding: 12px 28px; border-radius: ${b.radius}px; font-family: ${fontFam}; font-weight: ${fontW}; font-size: ${fontSz}px; line-height: ${lineH}; letter-spacing: ${letterSp}; mso-padding-alt: 0; text-align: center">${esc(b.text)}</a>`;
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
                const showWhatsapp = b.showWhatsapp !== false;
                const whatsappUrl = b.whatsappUrl !== undefined ? b.whatsappUrl : 'https://wa.me/573108520231';
                const whatsappText = b.whatsappText || 'Asistencia directa a través de WhatsApp';
                const showWhatsappIcon = b.showWhatsappIcon !== false;
                const whatsappColor = b.whatsappColor || '#ffffff';
                const whatsappFontSize = typeof b.whatsappFontSize === 'number' ? b.whatsappFontSize : 13;
                const whatsappFontWeight = b.whatsappFontWeight || '600';
                const whatsappAlign = b.whatsappAlign || 'center';
                const footerText = b.footerText !== undefined ? b.footerText : 'Rotary en Acción · Distritos 4271 y 4281 Colombia.<br/>&copy; 2026 Rotary International. Todos los derechos reservados.<br/><a href="{{unsubscribe_url}}" target="_blank" style="color:#cbd5e1;text-decoration:underline">Preferencias de comunicación y cancelar suscripción</a>';

                const footerLogo = b.logoUrl
                    ? `<div style="margin-bottom:14px"><img src="${safeUrl(b.logoUrl)}" alt="Footer Logo" style="max-height:48px;max-width:220px;display:inline-block;vertical-align:middle;border:0" /></div>`
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

                const socialIconStyle: SocialIconStyle = b.socialIconStyle || 'white';
                const socialIconSize = typeof b.socialIconSize === 'number' && b.socialIconSize >= 16 ? b.socialIconSize : 28;
                const socialIconGap = typeof b.socialIconGap === 'number' && b.socialIconGap >= 0 ? b.socialIconGap : 12;
                const socialLinks = Array.isArray(b.socialLinks) && b.socialLinks.length > 0
                    ? b.socialLinks
                    : DEFAULT_FOOTER_SOCIAL_LINKS;

                const socialHtml = showSocial ? renderFooterSocialIcons(socialLinks, socialIconStyle, socialIconSize, socialIconGap) : '';

                let whatsappHtml = '';
                if (showWhatsapp && whatsappUrl && whatsappText) {
                    const iconHtml = showWhatsappIcon
                        ? `<img src="https://app.clubplatform.org/icons/social/whatsapp-color.png" alt="WhatsApp" width="16" height="16" style="display:inline-block;width:16px;height:16px;vertical-align:middle;margin-right:6px;border:0;outline:none;text-decoration:none" />`
                        : '';
                    whatsappHtml = `<div style="text-align:${esc(whatsappAlign)};font-size:${whatsappFontSize}px;margin-bottom:14px;line-height:1.4">
                        <a href="${safeUrl(whatsappUrl)}" target="_blank" style="color:${esc(whatsappColor)};text-decoration:none;font-weight:${esc(whatsappFontWeight)};font-size:${whatsappFontSize}px;display:inline-block;vertical-align:middle">
                            ${iconHtml}<span style="vertical-align:middle;text-decoration:underline">${esc(whatsappText)}</span>
                        </a>
                    </div>`;
                }

                const isCtaActive = renderCtx?.isCtaActive;
                const tableMargin = isCtaActive ? 'margin:0;' : 'margin:24px 0 0 0;';
                const tableRadius = isCtaActive ? 'border-radius:0 0 12px 12px;' : 'border-radius:12px;';

                return C(`<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border-collapse:collapse;mso-table-lspace:0pt;mso-table-rspace:0pt;${tableMargin}background-color:${esc(footerBg)};${tableRadius}overflow:hidden;border:none">
                    <tr>
                        <td style="padding:28px 24px;text-align:center;color:#ffffff">
                            ${footerLogo}
                            ${footerTitle ? `<div style="font-family:'Open Sans',Helvetica,Arial,sans-serif;font-size:14px;font-weight:800;letter-spacing:0.06em;text-transform:uppercase;margin-bottom:14px;color:#ffffff">${esc(footerTitle)}</div>` : ''}
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
            if (b.globalKey === 'rotary_areas_focus' || b.globalKey === 'rotary_categories') {
                const title = b.title || '¿Qué puede compartir tu club en Rotary en Acción?';
                const subtitle = b.subtitle !== undefined ? b.subtitle : 'El formulario unificado se adapta a lo que elijas para visibilizar el impacto de tu club:';
                const areasBg = b.bgColor || '#f8fafc';
                const textColor = b.textColor || '#013388';

                // Generar las 15 categorías oficiales en 5 filas x 3 columnas compactas
                // Garantiza que cada etiqueta se visualice estrictamente en una sola línea (nowrap)
                const tipos = DEFAULT_TIPOS || [];
                const rows: (typeof DEFAULT_TIPOS)[] = [];
                for (let i = 0; i < tipos.length; i += 3) {
                    rows.push(tipos.slice(i, i + 3));
                }

                const gridRowsHtml = rows.map((row) => {
                    const cells = row.map((t: any) => {
                        const labelText = t.shortName || t.name;
                        return `<td width="33.3%" valign="middle" style="width:33.3%;padding:3px 3px;vertical-align:middle">
                            <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border-collapse:collapse;width:100%;background:#ffffff;border:1px solid #e2e8f0;border-radius:8px">
                                <tr>
                                    <td style="padding:6px 6px;font-size:11px;font-weight:600;color:#1e293b;line-height:1.2;white-space:nowrap;overflow:hidden;text-overflow:ellipsis">
                                        <span style="font-size:12px;margin-right:3px;vertical-align:middle;display:inline-block">${t.icon}</span><span style="vertical-align:middle;white-space:nowrap;display:inline-block">${esc(labelText)}</span>
                                    </td>
                                </tr>
                            </table>
                        </td>`;
                    }).join('');
                    return `<tr>${cells}</tr>`;
                }).join('');

                return C(`<div style="background-color:${esc(areasBg)};border:1px solid #e2e8f0;border-radius:12px;padding:18px 14px;margin:16px 0">
                    <div style="font-size:14px;font-weight:800;color:${esc(textColor)};margin-bottom:6px;text-transform:uppercase;letter-spacing:0.04em">&#127775; ${esc(title)}</div>
                    ${subtitle ? `<div style="font-size:12px;color:#64748b;margin-bottom:12px;line-height:1.4">${esc(subtitle)}</div>` : ''}
                    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border-collapse:collapse;width:100%;table-layout:fixed">
                        ${gridRowsHtml}
                    </table>
                </div>`);
            }
            if (b.globalKey === 'club_platform_cta') {
                // Si el bloque está desactivado
                if (b.enabled === false) {
                    if (interactive) {
                        return C(`<div style="border:2px dashed #cbd5e1;border-radius:12px;padding:14px 16px;text-align:center;background:#f8fafc;color:#94a3b8;font-size:12px;font-weight:600;cursor:pointer">
                            &#128276; <strong>CTA Club Platform (Opcional)</strong>: Desactivado para esta campaña &bull; Clic para configurar o reactivar
                        </div>`, '6px 24px');
                    }
                    return ''; // En correo enviado / preview final no se imprime
                }

                const title = b.title || '¡Activa el ecosistema digital de tu club!';
                const subtitle = b.subtitle !== undefined ? b.subtitle : 'Conecta, comunica y potencia el impacto de tu club con Club Platform.';
                const btnText = b.buttonText || 'ACTIVAR MI CLUB';
                const btnHref = b.buttonHref || 'https://clubplatform.org?utm_source=email_marketing&utm_medium=campaign&utm_campaign=cta_club_platform';
                const ctaBg = b.bgGradient || b.bgColor || '#0c2340';
                const textColor = b.textColor || '#ffffff';
                const btnBg = b.buttonBg || '#f7a81b';
                const btnColor = b.buttonColor || '#0c2340';
                const btnRadius = typeof b.buttonRadius === 'number' ? b.buttonRadius : 24;
                const pad = b.padding || '28px 24px';

                return C(`<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border-collapse:collapse;mso-table-lspace:0pt;mso-table-rspace:0pt;margin:24px 0 0 0;background-color:${esc(ctaBg)};background:${esc(ctaBg)};border-radius:12px 12px 0 0;overflow:hidden;border:none">
                    <tr>
                        <td align="center" style="padding:${esc(pad)};text-align:center;color:${esc(textColor)}">
                            <div style="font-family:'Open Sans',Helvetica,Arial,sans-serif;font-size:18px;font-weight:800;letter-spacing:-0.01em;line-height:1.3;margin-bottom:8px;color:${esc(textColor)}">
                                ${esc(title)}
                            </div>
                            ${subtitle ? `<div style="font-family:'Open Sans',Helvetica,Arial,sans-serif;font-size:13px;line-height:1.5;margin-bottom:18px;opacity:0.92;color:${esc(textColor)}">${esc(subtitle)}</div>` : ''}
                            <table role="presentation" align="center" cellpadding="0" cellspacing="0" style="margin:0 auto;border-collapse:collapse;mso-table-lspace:0pt;mso-table-rspace:0pt">
                                <tr>
                                    <td align="center" style="border-radius:${btnRadius}px;background-color:${esc(btnBg)}">
                                        <a href="${safeUrl(btnHref)}" target="_blank" style="display:inline-block;padding:12px 28px;font-family:'Open Sans',Helvetica,Arial,sans-serif;font-size:13px;font-weight:800;letter-spacing:0.04em;text-transform:uppercase;color:${esc(btnColor)};text-decoration:none;border-radius:${btnRadius}px;mso-padding-alt:0;text-align:center">
                                            ${esc(btnText)}
                                        </a>
                                    </td>
                                </tr>
                            </table>
                        </td>
                    </tr>
                </table>`, '0px 0px');
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
    opts: { interactive?: boolean; siteContext?: SiteBrandingContext } & Partial<SiteBrandingContext> = {}
): string => {
    const s = { ...DEFAULT_SETTINGS, ...(design?.settings || {}) };
    const blocks = Array.isArray(design?.blocks) ? design.blocks : [];
    const siteContext: SiteBrandingContext | undefined = opts.siteContext || (('domain' in opts || 'siteLogo' in opts || 'isMainPlatform' in opts || 'siteName' in opts || 'rotaryEnAccionUrl' in opts) ? (opts as SiteBrandingContext) : undefined);
    const ctaItem = blocks.find(b => b.type === 'global' && (b as GlobalBlockItem).globalKey === 'club_platform_cta') as GlobalBlockItem | undefined;
    const isCtaActive = !!ctaItem && ctaItem.enabled !== false;
    const rows = blocks.map((b) => renderBlock(b, s, !!opts.interactive, siteContext, { isCtaActive })).join('');
    const script = opts.interactive
        ? `<script>document.addEventListener('click',function(e){var el=e.target&&e.target.closest?e.target.closest('[data-bid]'):null;if(el&&window.parent){window.parent.postMessage({type:'ca-select-block',id:el.getAttribute('data-bid')},'*');}});<\/script>`
        : '';
    const fontsHead = `<style type="text/css">
@import url('https://fonts.googleapis.com/css2?family=Open+Sans:ital,wght@0,300..800;1,300..800&display=swap');
/* Fallback para Outlook (mso) y clientes antiguos */
<!--[if mso]>
<style type="text/css">
body, table, td, p, a, span, h1, h2, h3 { font-family: Helvetica, Arial, sans-serif !important; }
</style>
<![endif]-->
</style>`;

    return `<div style="background:${esc(s.bg)};font-family:${s.font};color:${esc(s.textColor)}">
${fontsHead}
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
 * 1. Garantiza que la cabecera contenga EXCLUSIVAMENTE la identidad institucional del sitio.
 * 2. Si el diseño previo contenía títulos promocionales en la cabecera, los traslada a un encabezado de cuerpo.
 * 3. Actualiza el bloque de categorías de Rotary en Acción con el título y formato institucional oficial.
 * 4. Actualiza el botón CTA a la redacción universal "COMPARTIR EN ROTARY EN ACCIÓN".
 * 5. Establece Open Sans como tipografía predeterminada si no había una configurada explícitamente.
 */
export const normalizeInstitutionalDesign = (rawDesign?: EmailDesign | null): EmailDesign => {
    const base = rawDesign || createRotaryMasterDesign();
    if (!base || !Array.isArray(base.blocks)) return createRotaryMasterDesign();

    const normalizedSettings: EmailSettings = {
        ...DEFAULT_SETTINGS,
        ...(base.settings || {}),
        font: base.settings?.font && !base.settings.font.includes('-apple-system')
            ? base.settings.font
            : "'Open Sans', Helvetica, Arial, sans-serif",
    };

    const headerIdx = base.blocks.findIndex((b) => b.globalKey === 'rotary_header');
    let newBlocks = [...base.blocks];

    if (headerIdx !== -1) {
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
                fontFamily: "'Open Sans', Helvetica, Arial, sans-serif",
                fontWeight: '800',
                label: 'Título de Campaña (Editable)',
                isProtected: false,
            });
        }
    }

    // Normalizar bloques de contenido (categorías y botón CTA)
    newBlocks = newBlocks.map((b) => {
        if (b.globalKey === 'rotary_areas_focus' || b.globalKey === 'rotary_categories') {
            const gb = b as GlobalBlockItem;
            return {
                ...gb,
                label: '¿Qué puede compartir tu club en Rotary en Acción?',
                title: gb.title && !gb.title.includes('7 Áreas') ? gb.title : '¿Qué puede compartir tu club en Rotary en Acción?',
                subtitle: gb.subtitle !== undefined ? gb.subtitle : 'El formulario unificado se adapta a lo que elijas para visibilizar el impacto de tu club:',
            };
        }
        if (b.type === 'button') {
            const currentBtn = b as ButtonBlock;
            return {
                ...currentBtn,
                text: currentBtn.text === 'COMPARTIR ACTIVIDAD EN ROTARY EN ACCIÓN'
                    ? 'COMPARTIR EN ROTARY EN ACCIÓN'
                    : currentBtn.text,
                fontFamily: currentBtn.fontFamily || "'Open Sans', Helvetica, Arial, sans-serif",
                fontWeight: currentBtn.fontWeight || '700',
            };
        }
        if (b.type === 'heading') {
            const h = b as HeadingBlock;
            return {
                ...h,
                fontFamily: h.fontFamily || "'Open Sans', Helvetica, Arial, sans-serif",
            };
        }
        if (b.type === 'text') {
            const t = b as TextBlock;
            return {
                ...t,
                fontFamily: t.fontFamily || "'Open Sans', Helvetica, Arial, sans-serif",
            };
        }
        if (b.globalKey === 'club_platform_cta') {
            const cp = b as GlobalBlockItem;
            return {
                ...cp,
                label: 'CTA Promocional Club Platform',
                enabled: cp.enabled !== false,
                title: cp.title || '¡Activa el ecosistema digital de tu club!',
                subtitle: cp.subtitle !== undefined ? cp.subtitle : 'Conecta, comunica y potencia el impacto de tu club con Club Platform.',
                buttonText: cp.buttonText || 'ACTIVAR MI CLUB',
                buttonHref: cp.buttonHref || 'https://clubplatform.org?utm_source=email_marketing&utm_medium=campaign&utm_campaign=cta_club_platform',
                buttonBg: cp.buttonBg || '#f7a81b',
                buttonColor: cp.buttonColor || '#0c2340',
                buttonRadius: cp.buttonRadius ?? 24,
                bgColor: cp.bgColor && cp.bgColor !== '#013388' ? cp.bgColor : '#0c2340',
                textColor: cp.textColor || '#ffffff',
            };
        }
        if (b.globalKey === 'rotary_footer') {
            const rf = b as GlobalBlockItem;
            return {
                ...rf,
                label: 'Pie de Página Institucional Protegido',
                bgColor: rf.bgColor || '#0c2340',
                socialIconStyle: rf.socialIconStyle || 'white',
                socialIconSize: rf.socialIconSize || 28,
                socialIconGap: rf.socialIconGap || 12,
                socialLinks: Array.isArray(rf.socialLinks) && rf.socialLinks.length > 0 ? rf.socialLinks : DEFAULT_FOOTER_SOCIAL_LINKS,
                showWhatsapp: rf.showWhatsapp !== false,
                showWhatsappIcon: rf.showWhatsappIcon !== false,
                whatsappColor: rf.whatsappColor || '#ffffff',
                whatsappText: rf.whatsappText || 'Asistencia directa a través de WhatsApp',
                whatsappUrl: rf.whatsappUrl !== undefined ? rf.whatsappUrl : 'https://wa.me/573108520231',
                whatsappFontSize: rf.whatsappFontSize || 13,
                whatsappFontWeight: rf.whatsappFontWeight || '600',
            };
        }
        return b;
    });

    return {
        ...base,
        settings: normalizedSettings,
        blocks: newBlocks,
    };
};

// ─── Plantilla Maestra Institucional: Rotary en Acción ──────────────────────
export const createRotaryMasterDesign = (): EmailDesign => ({
    version: 1,
    settings: {
        bg: '#0d233a',
        contentBg: '#ffffff',
        font: "'Open Sans', Helvetica, Arial, sans-serif",
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
            fontFamily: "'Open Sans', Helvetica, Arial, sans-serif",
            fontWeight: '800',
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
            fontFamily: "'Open Sans', Helvetica, Arial, sans-serif",
            fontWeight: '700',
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
            fontFamily: "'Open Sans', Helvetica, Arial, sans-serif",
            fontWeight: '400',
            lineHeight: 1.6,
            label: 'Cuerpo de Campaña (Editable / Asistido por IA)',
            isProtected: false,
        },
        {
            id: newId(),
            type: 'global',
            globalKey: 'rotary_areas_focus',
            label: '¿Qué puede compartir tu club en Rotary en Acción?',
            isProtected: true,
            isLocked: false,
            title: '¿Qué puede compartir tu club en Rotary en Acción?',
            subtitle: 'El formulario unificado se adapta a lo que elijas para visibilizar el impacto de tu club:',
            bgColor: '#f8fafc',
        },
        {
            id: newId(),
            type: 'text',
            text: '¡Tu club tiene mucho que contar! Ingresa al formulario de Rotary en Acción y comparte las fotos y detalles de tu iniciativa en menos de 3 minutos.',
            align: 'left',
            color: '#334155',
            size: 15,
            fontFamily: "'Open Sans', Helvetica, Arial, sans-serif",
            fontWeight: '400',
            lineHeight: 1.6,
            label: 'Llamado al Registro (Editable)',
            isProtected: false,
        },
        {
            id: newId(),
            type: 'button',
            text: 'COMPARTIR EN ROTARY EN ACCIÓN',
            href: '{{form_url}}',
            bg: '#013388',
            color: '#ffffff',
            align: 'center',
            radius: 12,
            fontFamily: "'Open Sans', Helvetica, Arial, sans-serif",
            fontWeight: '700',
            fontSize: 15,
            label: 'Botón de Acción Principal (Enlace Inteligente Adaptable)',
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
            globalKey: 'club_platform_cta',
            label: 'CTA Promocional Club Platform',
            isProtected: true,
            isLocked: false,
            enabled: true,
            title: '¡Activa el ecosistema digital de tu club!',
            subtitle: 'Conecta, comunica y potencia el impacto de tu club con Club Platform.',
            buttonText: 'ACTIVAR MI CLUB',
            buttonHref: 'https://clubplatform.org?utm_source=email_marketing&utm_medium=campaign&utm_campaign=cta_club_platform',
            buttonBg: '#f7a81b',
            buttonColor: '#0c2340',
            buttonRadius: 24,
            bgColor: '#0c2340',
            textColor: '#ffffff',
            padding: '28px 24px',
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
            socialIconStyle: 'white',
            socialIconSize: 28,
            socialIconGap: 12,
            socialLinks: DEFAULT_FOOTER_SOCIAL_LINKS,
            showWhatsapp: true,
            showWhatsappIcon: true,
            whatsappUrl: 'https://wa.me/573108520231',
            whatsappText: 'Asistencia directa a través de WhatsApp',
            whatsappColor: '#ffffff',
            whatsappFontSize: 13,
            whatsappFontWeight: '600',
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
        name: '¿Qué puede compartir tu club en Rotary en Acción?',
        category: 'Contenido',
        description: 'Las 15 categorías oficiales del formulario público de Rotary en Acción en formato compacto y adaptable.',
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
        key: 'club_platform_cta',
        name: 'CTA Promocional Club Platform',
        category: 'Promoción',
        description: 'Bloque inspirado en Shopify para activar nuevos clubes en Club Platform (global y opcional).',
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

