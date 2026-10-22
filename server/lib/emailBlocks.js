// src/lib/rotaryEnAccionSpec.ts
var DEFAULT_TIPOS = [
  { slug: "proyecto", name: "Proyecto u obra", shortName: "Proyecto u obra", icon: "\u{1F3D7}\uFE0F", color: "#1d4ed8" },
  { slug: "actividad", name: "Actividad o jornada", shortName: "Actividades", icon: "\u{1F91D}", color: "#059669" },
  { slug: "evento", name: "Evento", shortName: "Evento", icon: "\u{1F4C5}", color: "#7c3aed" },
  { slug: "historia-servicio", name: "Historia de servicio", shortName: "Historias de servicio", icon: "\u{1F499}", color: "#0284c7" },
  { slug: "emergencia", name: "Emergencia o respuesta humanitaria", shortName: "Emergencias", icon: "\u{1F6A8}", color: "#dc2626" },
  { slug: "campana", name: "Campa\xF1a", shortName: "Campa\xF1a", icon: "\u{1F4E3}", color: "#ea580c" },
  { slug: "reconocimiento", name: "Reconocimiento o logro", shortName: "Reconocimientos", icon: "\u{1F3C6}", color: "#ca8a04" },
  { slug: "alianza", name: "Alianza", shortName: "Alianzas", icon: "\u{1F91C}\u{1F91B}", color: "#4d7c0f" },
  { slug: "juventud", name: "Actividad juvenil", shortName: "Actividad juvenil", icon: "\u{1F331}", color: "#16a34a" },
  { slug: "capacitacion", name: "Capacitaci\xF3n", shortName: "Capacitaci\xF3n", icon: "\u{1F393}", color: "#0d9488" },
  { slug: "recaudacion", name: "Recaudaci\xF3n de fondos", shortName: "Recaudaci\xF3n", icon: "\u{1F4B0}", color: "#b45309" },
  { slug: "testimonio", name: "Historia personal o testimonio", shortName: "Historias y testimonios", icon: "\u{1F4AC}", color: "#9333ea" },
  { slug: "convocatoria", name: "Convocatoria", shortName: "Convocatoria", icon: "\u{1F4E2}", color: "#0891b2" },
  { slug: "proyecto-internacional", name: "Proyecto internacional", shortName: "Proyecto internacional", icon: "\u{1F30D}", color: "#1e40af" },
  { slug: "otra", name: "Otra acci\xF3n", shortName: "Otra acci\xF3n", icon: "\u2728", color: "#64748b" }
];

// src/lib/emailBlocks.ts
var DEFAULT_FOOTER_SOCIAL_LINKS = [
  { network: "instagram", url: "https://instagram.com", label: "Instagram" },
  { network: "facebook", url: "https://facebook.com", label: "Facebook" },
  { network: "youtube", url: "https://youtube.com", label: "YouTube" },
  { network: "linkedin", url: "https://linkedin.com", label: "LinkedIn" },
  { network: "x", url: "https://x.com", label: "X (Twitter)" },
  { network: "web", url: "https://app.clubplatform.org/rotary-en-accion", label: "Rotary en Acci\xF3n" }
];
var DEFAULT_SETTINGS = {
  bg: "#0d233a",
  contentBg: "#ffffff",
  font: "'Open Sans', Helvetica, Arial, sans-serif",
  textColor: "#334155",
  linkColor: "#013388",
  width: 600
};
var FONT_OPTIONS = [
  { value: "'Open Sans', Helvetica, Arial, sans-serif", label: "Open Sans (Institucional Rotary & Club Platform)" },
  { value: "Arial, Helvetica, sans-serif", label: "Arial" },
  { value: "Helvetica, Arial, sans-serif", label: "Helvetica" },
  { value: "Georgia, 'Times New Roman', serif", label: "Georgia" },
  { value: "Verdana, Geneva, sans-serif", label: "Verdana" },
  { value: "'Trebuchet MS', Tahoma, sans-serif", label: "Trebuchet MS" },
  { value: "Tahoma, Verdana, sans-serif", label: "Tahoma" }
];
var FONT_WEIGHT_OPTIONS = [
  { value: "300", label: "Light (300)" },
  { value: "400", label: "Regular (400)" },
  { value: "500", label: "Medium (500)" },
  { value: "600", label: "SemiBold (600)" },
  { value: "700", label: "Bold (700)" },
  { value: "800", label: "ExtraBold (800)" }
];
var LINE_HEIGHT_OPTIONS = [
  { value: 1.15, label: "1.15 (Muy Compacto)" },
  { value: 1.25, label: "1.25 (Encabezados)" },
  { value: 1.4, label: "1.4 (Compacto)" },
  { value: 1.5, label: "1.5 (Est\xE1ndar)" },
  { value: 1.6, label: "1.6 (Lectura \xD3ptima)" },
  { value: 1.8, label: "1.8 (Aireado)" }
];
var _idc = 0;
var newId = () => {
  try {
    if (typeof crypto !== "undefined" && "randomUUID" in crypto) return crypto.randomUUID();
  } catch {
  }
  _idc += 1;
  return `b_${Date.now().toString(36)}_${_idc}`;
};
var makeBlock = (type) => {
  const id = newId();
  switch (type) {
    case "heading":
      return { id, type, text: "T\xEDtulo de la secci\xF3n", level: 2, align: "left", color: "#111827" };
    case "text":
      return { id, type, text: "Escribe aqu\xED tu mensaje. Puedes usar varios p\xE1rrafos separ\xE1ndolos con una l\xEDnea en blanco.", align: "left", color: "#333333", size: 15 };
    case "image":
      return { id, type, url: "", alt: "", href: "", align: "center", width: 100, radius: 8 };
    case "button":
      return { id, type, text: "Ver m\xE1s", href: "https://", bg: "#013388", color: "#ffffff", align: "center", radius: 8 };
    case "divider":
      return { id, type, color: "#e5e7eb", thickness: 1 };
    case "spacer":
      return { id, type, height: 24 };
    case "social":
      return { id, type, align: "center", color: "#013388", links: [{ network: "facebook", url: "https://" }, { network: "instagram", url: "https://" }, { network: "web", url: "https://" }] };
    case "video":
      return { id, type, url: "https://", thumbnail: "", title: "Ver el video", align: "center" };
    case "html":
      return { id, type, html: "<p>Bloque HTML libre\u2026</p>" };
    case "columns":
      return { id, type, left: { kind: "text", text: "Columna izquierda", color: "#333333" }, right: { kind: "text", text: "Columna derecha", color: "#333333" } };
    case "table":
      return {
        id,
        type,
        headers: ["\xC1rea de Enfoque", "Proyectos"],
        rows: [
          { cells: ["Agua y Saneamiento", "3 iniciativas"] },
          { cells: ["Salud Materno-Infantil", "2 jornadas"] },
          { cells: ["Educaci\xF3n B\xE1sica", "4 becas"] }
        ],
        borderColor: "#e2e8f0",
        headerBg: "#013388",
        headerColor: "#ffffff",
        textColor: "#334155",
        align: "left"
      };
    case "menu":
      return {
        id,
        type,
        items: [
          { label: "Rotary en Acci\xF3n", url: "https://app.clubplatform.org/rotary-en-accion" },
          { label: "Distrito 4271", url: "https://app.clubplatform.org" },
          { label: "Distrito 4281", url: "https://app.clubplatform.org" },
          { label: "Contacto", url: "https://app.clubplatform.org" }
        ],
        align: "center",
        color: "#013388",
        size: 13
      };
    case "global":
      return {
        id,
        type,
        globalKey: "rotary_header",
        label: "Cabecera Institucional Adaptable",
        isProtected: true,
        logoUrl: "",
        logoMaxWidth: 240,
        logoMaxHeight: 60,
        align: "center",
        bgColor: "#ffffff",
        padding: "24px 20px"
      };
    default:
      return { id, type: "text", text: "", align: "left", color: "#333333", size: 15 };
  }
};
var BLOCK_LABELS = {
  heading: "Encabezado",
  text: "P\xE1rrafo",
  image: "Imagen",
  button: "Bot\xF3n",
  columns: "Columnas",
  divider: "Separador",
  spacer: "Espaciado",
  social: "Redes sociales",
  video: "Video",
  html: "HTML propio",
  table: "Tabla",
  menu: "Men\xFA enlaces",
  global: "Bloque Global"
};
var DEFAULT_DESIGN = {
  version: 1,
  settings: { ...DEFAULT_SETTINGS },
  blocks: [
    { id: newId(), type: "heading", text: "\xA1Hola! \u{1F44B}", level: 2, align: "left", color: "#111827" },
    { id: newId(), type: "text", text: "Escribe aqu\xED el contenido de tu campa\xF1a. Usa la barra de bloques para agregar im\xE1genes, botones, columnas y m\xE1s.", align: "left", color: "#333333", size: 15 },
    { id: newId(), type: "button", text: "Ver m\xE1s", href: "https://", bg: "#0c3c7c", color: "#ffffff", align: "center", radius: 8 }
  ]
};
var esc = (s) => String(s ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
var safeUrl = (u) => {
  const v = String(u || "").trim();
  if (/^(https?:|mailto:|tel:)/i.test(v)) return v.replace(/"/g, "%22");
  if (v.startsWith("#") || v === "") return v;
  return `https://${v.replace(/"/g, "%22")}`;
};
var isRichTextHtml = (str) => {
  if (!str || typeof str !== "string") return false;
  return /<\/?(p|div|span|strong|b|em|i|u|s|strike|del|sup|sub|a|ul|ol|li|br|h[1-6]|blockquote)\b[^>]*>/i.test(str);
};
var sanitizeRichTextHtml = (html) => {
  if (!html || typeof html !== "string") return "";
  let clean = html;
  clean = clean.replace(/<script[\s\S]*?<\/script>/gi, "");
  clean = clean.replace(/<style[\s\S]*?<\/style>/gi, "");
  clean = clean.replace(/<iframe[\s\S]*?<\/iframe>/gi, "");
  clean = clean.replace(/<object[\s\S]*?<\/object>/gi, "");
  clean = clean.replace(/<embed[\s\S]*?<\/embed>/gi, "");
  clean = clean.replace(/<form[\s\S]*?<\/form>/gi, "");
  clean = clean.replace(/<input[\s\S]*?>/gi, "");
  clean = clean.replace(/<button[\s\S]*?<\/button>/gi, "");
  clean = clean.replace(/\son[a-z]+\s*=\s*(?:'[^']*'|"[^"]*"|[^\s>]+)/gi, "");
  clean = clean.replace(/\shref\s*=\s*["']?\s*(?:javascript|vbscript|data):[^"'>\s]*/gi, ' href="#"');
  clean = clean.replace(/<a(\s+[^>]*)?>/gi, (match, attrs = "") => {
    let cleanAttrs = attrs;
    if (!/target\s*=/i.test(cleanAttrs)) {
      cleanAttrs += ' target="_blank"';
    }
    if (!/rel\s*=/i.test(cleanAttrs)) {
      cleanAttrs += ' rel="noopener noreferrer"';
    }
    return `<a${cleanAttrs}>`;
  });
  clean = clean.replace(/<p(\s+[^>]*)?>/gi, (match, attrs = "") => {
    if (!attrs || !attrs.trim()) {
      return `<p style="margin:0 0 12px 0;line-height:inherit">`;
    }
    if (/style\s*=\s*["']([^"']*)["']/i.test(attrs)) {
      return match.replace(/style\s*=\s*["']([^"']*)["']/i, (_m, s) => {
        let mergedStyle = s.trim();
        if (!/margin/i.test(mergedStyle)) {
          mergedStyle = `margin:0 0 12px 0;` + (mergedStyle ? `${mergedStyle}` : "");
        }
        if (!/line-height/i.test(mergedStyle)) {
          mergedStyle = (mergedStyle ? `${mergedStyle};` : "") + `line-height:inherit`;
        }
        return `style="${mergedStyle}"`;
      });
    }
    return `<p style="margin:0 0 12px 0;line-height:inherit"${attrs}>`;
  });
  clean = clean.replace(/<ul(\s+[^>]*)?>/gi, (match, attrs = "") => {
    if (/style\s*=/i.test(attrs)) return match;
    return `<ul style="margin:0 0 12px 0;padding-left:24px;list-style-type:disc"${attrs}>`;
  });
  clean = clean.replace(/<ol(\s+[^>]*)?>/gi, (match, attrs = "") => {
    if (/style\s*=/i.test(attrs)) return match;
    return `<ol style="margin:0 0 12px 0;padding-left:24px;list-style-type:decimal"${attrs}>`;
  });
  clean = clean.replace(/<li(\s+[^>]*)?>/gi, (match, attrs = "") => {
    if (/style\s*=/i.test(attrs)) return match;
    return `<li style="margin-bottom:4px"${attrs}>`;
  });
  clean = clean.replace(/<blockquote(\s+[^>]*)?>/gi, (match, attrs = "") => {
    if (/style\s*=/i.test(attrs)) return match;
    return `<blockquote style="border-left:3px solid #005a9c;margin:12px 0;padding-left:12px;color:#475569;font-style:italic"${attrs}>`;
  });
  return clean;
};
var textToHtml = (text) => {
  if (!text || typeof text !== "string") return "";
  if (isRichTextHtml(text)) {
    return sanitizeRichTextHtml(text);
  }
  return esc(text).split(/\n\s*\n/).map((p) => p.trim()).filter(Boolean).map((p) => `<p style="margin:0 0 12px 0;line-height:inherit">${p.replace(/\n/g, "<br>")}</p>`).join("");
};
var SOCIAL_LABEL = {
  facebook: "f",
  instagram: "IG",
  x: "X",
  linkedin: "in",
  youtube: "\u25B6",
  whatsapp: "WA",
  web: "\u{1F310}"
};
var SOCIAL_NAME = {
  facebook: "Facebook",
  instagram: "Instagram",
  x: "X",
  linkedin: "LinkedIn",
  youtube: "YouTube",
  whatsapp: "WhatsApp",
  web: "Sitio web"
};
var num = (v, fb) => {
  const n = Number(v);
  return Number.isFinite(n) && n >= 0 && n <= 120 ? n : fb;
};
var resolveSiteRotaryEnAccionUrl = (siteContext) => {
  if (siteContext?.rotaryEnAccionUrl && typeof siteContext.rotaryEnAccionUrl === "string" && siteContext.rotaryEnAccionUrl.trim()) {
    const customUrl = siteContext.rotaryEnAccionUrl.trim();
    if (!customUrl.includes("distrito-4281-de-rotary-international.clubplatform.org")) {
      return customUrl;
    }
  }
  const rawDomain = (siteContext?.domain || "").toLowerCase().trim();
  const rawPublicUrl = (siteContext?.publicUrl || "").toLowerCase().trim();
  const siteName = (siteContext?.siteName || "").toLowerCase().trim();
  const isD4281 = rawDomain.includes("4281") || rawPublicUrl.includes("4281") || siteName.includes("4281") || rawDomain.includes("distrito-4281");
  if (isD4281) {
    return "https://rotary4281.org/rotary-en-accion";
  }
  const cleanDomain = rawDomain.replace(/^https?:\/\//, "").replace(/\/.*$/, "").replace(/^www\./, "");
  const isTechnicalSubdomain = cleanDomain.endsWith(".clubplatform.org") || cleanDomain === "clubplatform.org";
  if (cleanDomain && !isTechnicalSubdomain) {
    return `https://${cleanDomain}/rotary-en-accion`;
  }
  if (rawPublicUrl) {
    const cleanPublic = rawPublicUrl.replace(/^https?:\/\//, "").replace(/\/+$/, "").replace(/^www\./, "");
    if (cleanPublic && !cleanPublic.endsWith(".clubplatform.org") && cleanPublic !== "clubplatform.org") {
      return `https://${cleanPublic}/rotary-en-accion`;
    }
  }
  if (cleanDomain && cleanDomain.endsWith(".clubplatform.org") && cleanDomain !== "app.clubplatform.org" && cleanDomain !== "clubplatform.org") {
    return `https://${cleanDomain}/rotary-en-accion`;
  }
  return "https://app.clubplatform.org/rotary-en-accion";
};
var resolveSiteActivarClubUrl = (siteContext, queryParams) => {
  let baseUrl = "";
  const rawDomain = (siteContext?.domain || "").toLowerCase().trim();
  const rawPublicUrl = (siteContext?.publicUrl || "").toLowerCase().trim();
  const siteName = (siteContext?.siteName || "").toLowerCase().trim();
  const isD4281 = rawDomain.includes("4281") || rawPublicUrl.includes("4281") || siteName.includes("4281") || rawDomain.includes("distrito-4281");
  if (isD4281) {
    baseUrl = "https://rotary4281.org/activar-mi-club";
  } else {
    const cleanDomain = rawDomain.replace(/^https?:\/\//, "").replace(/\/.*$/, "").replace(/^www\./, "");
    const isTechnicalSubdomain = cleanDomain.endsWith(".clubplatform.org") || cleanDomain === "clubplatform.org";
    if (cleanDomain && !isTechnicalSubdomain) {
      baseUrl = `https://${cleanDomain}/activar-mi-club`;
    } else if (rawPublicUrl) {
      const cleanPublic = rawPublicUrl.replace(/^https?:\/\//, "").replace(/\/+$/, "").replace(/^www\./, "");
      if (cleanPublic && !cleanPublic.endsWith(".clubplatform.org") && cleanPublic !== "clubplatform.org") {
        baseUrl = `https://${cleanPublic}/activar-mi-club`;
      }
    } else if (cleanDomain && cleanDomain.endsWith(".clubplatform.org") && cleanDomain !== "app.clubplatform.org" && cleanDomain !== "clubplatform.org") {
      baseUrl = `https://${cleanDomain}/activar-mi-club`;
    }
  }
  if (!baseUrl) {
    const win = typeof globalThis !== "undefined" && "window" in globalThis ? globalThis.window : null;
    if (win && win.location?.origin && !win.location.origin.includes("localhost")) {
      baseUrl = `${win.location.origin}/activar-mi-club`;
    } else {
      baseUrl = "https://rotary4281.org/activar-mi-club";
    }
  }
  if (queryParams && Object.keys(queryParams).length > 0) {
    const sp = new URLSearchParams();
    for (const [k, v] of Object.entries(queryParams)) {
      if (v !== void 0 && v !== null && v !== "") sp.set(k, String(v));
    }
    const qs = sp.toString();
    if (qs) baseUrl += (baseUrl.includes("?") ? "&" : "?") + qs;
  }
  return baseUrl;
};
var getActiveSiteBrandingContext = () => {
  const win = typeof globalThis !== "undefined" && "window" in globalThis ? globalThis.window : null;
  if (!win) {
    return { isMainPlatform: false, siteName: "Rotary", rotaryEnAccionUrl: "https://app.clubplatform.org/rotary-en-accion" };
  }
  try {
    const host = win.location?.hostname || "";
    const isMainPlatform = host === "clubplatform.org" || host === "www.clubplatform.org" || host === "app.clubplatform.org" || host === "localhost" && win.location?.port !== "5173";
    let siteLogo = null;
    let siteName = null;
    let siteType = null;
    let domain = null;
    let publicUrl = null;
    const storage = typeof globalThis !== "undefined" && "localStorage" in globalThis ? globalThis.localStorage : null;
    try {
      const rawClub = storage?.getItem("rotary_club");
      if (rawClub) {
        const c = JSON.parse(rawClub);
        if (c && typeof c === "object") {
          if (typeof c.logo === "string" && c.logo.trim()) siteLogo = c.logo.trim();
          if (typeof c.name === "string" && c.name.trim()) siteName = c.name.trim();
          if (typeof c.type === "string") siteType = c.type;
          if (typeof c.domain === "string" && c.domain.trim()) domain = c.domain.trim();
          else if (typeof c.customDomain === "string" && c.customDomain.trim()) domain = c.customDomain.trim();
          if (typeof c.publicUrl === "string" && c.publicUrl.trim()) publicUrl = c.publicUrl.trim();
          const is4281 = c.district === 4281 || c.district === "4281" || String(c.subdomain || "").includes("4281") || String(c.name || "").includes("4281");
          if (is4281 && (!domain || domain.includes(".clubplatform.org"))) {
            domain = "rotary4281.org";
            publicUrl = "https://rotary4281.org";
          }
        }
      }
    } catch {
    }
    if (!siteLogo || !domain) {
      try {
        const rawUser = storage?.getItem("rotary_user");
        if (rawUser) {
          const u = JSON.parse(rawUser);
          if (!siteLogo && u?.club?.logo && typeof u.club.logo === "string") siteLogo = u.club.logo.trim();
          if (!siteName && u?.club?.name) siteName = u.club.name.trim();
          if (!domain && u?.club?.domain && typeof u.club.domain === "string") domain = u.club.domain.trim();
          const is4281 = u?.club?.district === 4281 || u?.club?.district === "4281" || String(u?.club?.subdomain || "").includes("4281") || String(u?.club?.name || "").includes("4281");
          if (is4281 && (!domain || domain.includes(".clubplatform.org"))) {
            domain = "rotary4281.org";
            publicUrl = "https://rotary4281.org";
          }
        }
      } catch {
      }
    }
    if (!domain && host && host !== "localhost" && !isMainPlatform) {
      domain = host.replace(/^www\./, "");
    }
    let platformLogo = null;
    try {
      const cpLogo = storage?.getItem("cp_platform_logo");
      if (cpLogo) {
        const cp = JSON.parse(cpLogo);
        if (cp?.url) platformLogo = cp.url;
      }
    } catch {
    }
    const ctx = {
      siteLogo,
      siteName: siteName || (isMainPlatform ? "Club Platform" : "Organizaci\xF3n"),
      siteType,
      isMainPlatform,
      platformLogo: platformLogo || "/images/platform_logo_premium.png",
      domain,
      publicUrl: publicUrl || (domain ? `https://${domain}` : null)
    };
    ctx.rotaryEnAccionUrl = resolveSiteRotaryEnAccionUrl(ctx);
    return ctx;
  } catch {
    return { isMainPlatform: false, siteName: "Club Platform", rotaryEnAccionUrl: "https://app.clubplatform.org/rotary-en-accion" };
  }
};
var resolveInstitutionalLogo = (block, siteContext) => {
  if (block.logoUrl && typeof block.logoUrl === "string" && block.logoUrl.trim().length > 0) {
    const u = block.logoUrl.trim();
    return {
      url: u,
      logoUrl: u,
      source: "custom",
      alt: siteContext?.siteName ? `Logo de ${siteContext.siteName}` : "Logo de la Plantilla"
    };
  }
  if (siteContext?.siteLogo && typeof siteContext.siteLogo === "string" && siteContext.siteLogo.trim().length > 0) {
    const u = siteContext.siteLogo.trim();
    return {
      url: u,
      logoUrl: u,
      source: "site_settings",
      alt: siteContext.siteName ? `Logo Institucional de ${siteContext.siteName}` : "Logo Institucional del Sitio"
    };
  }
  const rawDom = (siteContext?.domain || "").toLowerCase();
  const rawPub = (siteContext?.publicUrl || "").toLowerCase();
  const rawNm = (siteContext?.siteName || "").toLowerCase();
  if (rawDom.includes("4281") || rawPub.includes("4281") || rawNm.includes("4281")) {
    const d4281Logo = "https://rotaryd4281.s3.amazonaws.com/media/Rotary-4281-Genera-un-Impacto-Duradero.png";
    return {
      url: d4281Logo,
      logoUrl: d4281Logo,
      source: "site_settings",
      alt: "Rotary Distrito 4281"
    };
  }
  if (rawDom.includes("rotaryprojectfair") || rawPub.includes("rotaryprojectfair") || rawNm.includes("feria")) {
    const feriaLogo = "https://rotary-platform-assets.s3.us-east-1.amazonaws.com/clubs/322c2f88-ad33-484d-bb54-272de9262d72/images/1785773906008-FeriadeProyectosRotary-Logo_(1).png";
    return {
      url: feriaLogo,
      logoUrl: feriaLogo,
      source: "site_settings",
      alt: "Feria de Proyectos Rotary Colombia"
    };
  }
  if (siteContext?.isMainPlatform) {
    const platLogo = siteContext.platformLogo || "https://assets.cdn.clubplatform.org/logos/rotary-international-logo-blue.png";
    return {
      url: platLogo,
      logoUrl: platLogo,
      source: "platform_default",
      alt: "Club Platform Oficial"
    };
  }
  if (siteContext?.siteName && siteContext.siteName.trim().length > 0) {
    const name = siteContext.siteName.trim();
    return {
      url: void 0,
      logoUrl: null,
      text: name,
      siteName: name,
      source: "typography",
      alt: name
    };
  }
  return {
    url: void 0,
    logoUrl: null,
    text: "Club Platform",
    siteName: "Club Platform",
    source: "typography",
    alt: "Club Platform"
  };
};
var cell = (inner, b, vPad = "8px 24px", interactive = false) => {
  let pad = vPad;
  if (b && b.type !== "spacer") {
    const t = num(b.padTop, -1);
    const f = num(b.padBottom, -1);
    if (t >= 0 || f >= 0) {
      const m = vPad.match(/^(\d+)px (\S+)( (\d+)px)?$/);
      const top = t >= 0 ? t : Number(m?.[1] ?? 8);
      const sides = m?.[2] ?? "24px";
      const bot = f >= 0 ? f : Number(m?.[4] ?? 8);
      pad = `${top}px ${sides} ${bot}px`;
    }
  }
  const bid = interactive && b ? ` data-bid="${esc(b.id)}"` : "";
  const isZeroPad = pad === "0px 0px" || pad === "0px" || pad === "0";
  const tdExtraStyle = isZeroPad ? ";margin:0;font-size:0px;line-height:0px;border-collapse:collapse" : "";
  return `<tr${bid} style="margin:0;padding:0"><td style="padding:${pad}${tdExtraStyle}">${inner}</td></tr>`;
};
var renderFooterSocialIcons = (links, style = "white", size = 28, gap = 12) => {
  const activeLinks = (links || []).filter((l) => l && l.url && l.url.trim().length > 0);
  if (!activeLinks.length) return "";
  const baseUrl = "https://app.clubplatform.org";
  const halfGap = Math.round(gap / 2);
  const iconsHtml = activeLinks.map((l) => {
    const net = (l.network || "web").toLowerCase();
    const iconSrc = l.customIconUrl && l.customIconUrl.trim().length > 0 ? safeUrl(l.customIconUrl) : `${baseUrl}/icons/social/${encodeURIComponent(net)}-${style}.png`;
    const label = l.label || net.toUpperCase();
    return `<a href="${safeUrl(l.url)}" target="_blank" style="display:inline-block;margin:0 ${halfGap}px 6px ${halfGap}px;text-decoration:none;border:0;line-height:1"><img src="${iconSrc}" alt="${esc(label)}" width="${size}" height="${size}" style="display:inline-block;width:${size}px;height:${size}px;border:0;outline:none;text-decoration:none;vertical-align:middle" /></a>`;
  }).join("");
  return `<div style="text-align:center;margin-bottom:16px;line-height:1">${iconsHtml}</div>`;
};
var renderBlock = (b, s, interactive = false, siteContext, renderCtx) => {
  const C = (inner, vPad = "8px 24px") => cell(inner, b, vPad, interactive);
  switch (b.type) {
    case "heading": {
      const sizes = { 1: 28, 2: 22, 3: 18 };
      const fontFam = b.fontFamily || s.font;
      const fontW = b.fontWeight || (b.weight === "normal" ? "400" : b.weight === "bold" ? "700" : "800");
      const fontSz = b.fontSize || sizes[b.level];
      const lineH = b.lineHeight || 1.25;
      const letterSp = b.letterSpacing !== void 0 && b.letterSpacing !== null && b.letterSpacing !== "" ? typeof b.letterSpacing === "number" || /^-?\d+(\.\d+)?$/.test(String(b.letterSpacing).trim()) ? `${b.letterSpacing}px` : String(b.letterSpacing) : "-0.02em";
      return C(`<h${b.level} style="margin: 0; font-family: ${fontFam}; font-size: ${fontSz}px; line-height: ${lineH}; letter-spacing: ${letterSp}; color: ${esc(b.color)}; text-align: ${b.align}; font-weight: ${fontW}">${esc(b.text)}</h${b.level}>`);
    }
    case "text": {
      const fontFam = b.fontFamily || s.font;
      const fontW = b.fontWeight || (b.weight === "bold" || b.weight === "800" ? "700" : "400");
      const fontSz = b.size || 15;
      const lineH = b.lineHeight || 1.6;
      const letterSp = b.letterSpacing !== void 0 && b.letterSpacing !== null && b.letterSpacing !== "" ? typeof b.letterSpacing === "number" || /^-?\d+(\.\d+)?$/.test(String(b.letterSpacing).trim()) ? `${b.letterSpacing}px` : String(b.letterSpacing) : "normal";
      return C(`<div style="font-family: ${fontFam}; font-size: ${fontSz}px; line-height: ${lineH}; letter-spacing: ${letterSp}; color: ${esc(b.color)}; text-align: ${b.align}; font-weight: ${fontW}">${textToHtml(b.text)}</div>`);
    }
    case "image": {
      if (!b.url) return C(`<div style="padding: 24px; text-align: center; color: #9ca3af; border: 1px dashed #d1d5db; border-radius: 8px">Sin imagen</div>`);
      const img = `<img src="${safeUrl(b.url)}" alt="${esc(b.alt)}" style="width: ${b.width}%; max-width: 100%; height: auto; border-radius: ${b.radius}px; display: inline-block" />`;
      const wrapped = b.href ? `<a href="${safeUrl(b.href)}" target="_blank" style="text-decoration: none">${img}</a>` : img;
      return C(`<div style="text-align: ${b.align}">${wrapped}</div>`);
    }
    case "button": {
      const fontFam = b.fontFamily || s.font;
      const fontW = b.fontWeight || "700";
      const fontSz = b.fontSize || 15;
      const lineH = b.lineHeight || 1.2;
      const letterSp = b.letterSpacing !== void 0 && b.letterSpacing !== null && b.letterSpacing !== "" ? typeof b.letterSpacing === "number" || /^-?\d+(\.\d+)?$/.test(String(b.letterSpacing).trim()) ? `${b.letterSpacing}px` : String(b.letterSpacing) : "0.02em";
      let targetHref = b.href || "";
      if (targetHref === "{{form_url}}" || targetHref.includes("{{form_url}}")) {
        const smartUrl = resolveSiteRotaryEnAccionUrl(siteContext);
        targetHref = targetHref.replace(/\{\{form_url\}\}/g, smartUrl);
      }
      const btn = `<a href="${safeUrl(targetHref)}" target="_blank" style="display: inline-block; background: ${esc(b.bg)}; color: ${esc(b.color)}; text-decoration: none; padding: 12px 28px; border-radius: ${b.radius}px; font-family: ${fontFam}; font-weight: ${fontW}; font-size: ${fontSz}px; line-height: ${lineH}; letter-spacing: ${letterSp}; mso-padding-alt: 0; text-align: center">${esc(b.text)}</a>`;
      return C(`<div style="text-align:${b.align}">${btn}</div>`, "12px 24px");
    }
    case "divider":
      return C(`<div style="border-top:${b.thickness}px solid ${esc(b.color)};font-size:0;line-height:0">&nbsp;</div>`, "4px 24px");
    case "spacer":
      return `<tr${interactive ? ` data-bid="${esc(b.id)}"` : ""}><td style="height:${b.height}px;line-height:${b.height}px;font-size:0">&nbsp;</td></tr>`;
    case "social": {
      const items = (b.links || []).filter((l) => l.url).map(
        (l) => `<a href="${safeUrl(l.url)}" target="_blank" title="${esc(SOCIAL_NAME[l.network] || "")}" style="display:inline-block;width:34px;height:34px;line-height:34px;text-align:center;background:${esc(b.color)};color:#ffffff;border-radius:50%;text-decoration:none;font-weight:700;font-size:13px;margin:0 4px">${esc(SOCIAL_LABEL[l.network] || "\u2022")}</a>`
      ).join("");
      return C(`<div style="text-align:${b.align}">${items}</div>`);
    }
    case "video": {
      const thumb = b.thumbnail ? `<img src="${safeUrl(b.thumbnail)}" alt="${esc(b.title)}" style="width:100%;max-width:100%;height:auto;border-radius:8px;display:block" />` : `<div style="background:#111827;color:#fff;padding:48px 0;border-radius:8px;text-align:center;font-size:28px">\u25B6</div>`;
      return C(`<div style="text-align:${b.align}"><a href="${safeUrl(b.url)}" target="_blank" style="text-decoration:none;color:${esc(s.linkColor)}">${thumb}<div style="margin-top:8px;font-weight:700;font-size:14px">\u25B6 ${esc(b.title)}</div></a></div>`);
    }
    case "columns": {
      const renderCell = (c) => {
        if (c.kind === "image") {
          if (!c.url) return `<div style="padding:16px;text-align:center;color:#9ca3af;border:1px dashed #d1d5db;border-radius:8px;font-size:12px">Sin imagen</div>`;
          const img = `<img src="${safeUrl(c.url)}" alt="${esc(c.alt || "")}" style="width:100%;max-width:100%;height:auto;border-radius:8px;display:block" />`;
          return c.href ? `<a href="${safeUrl(c.href)}" target="_blank">${img}</a>` : img;
        }
        return `<div style="font-size:14px;line-height:1.6;color:${esc(c.color || "#333333")}">${textToHtml(c.text || "")}</div>`;
      };
      return C(
        `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border-collapse:collapse"><tr>
                    <td width="50%" valign="top" style="padding:0 8px 0 0;vertical-align:top">${renderCell(b.left)}</td>
                    <td width="50%" valign="top" style="padding:0 0 0 8px;vertical-align:top">${renderCell(b.right)}</td>
                </tr></table>`
      );
    }
    case "html":
      return C(b.html || "");
    case "table": {
      const headers = Array.isArray(b.headers) ? b.headers : [];
      const rows = Array.isArray(b.rows) ? b.rows : [];
      const thHtml = headers.map((h) => `<th style="padding:10px 14px;background-color:${esc(b.headerBg || "#013388")};color:${esc(b.headerColor || "#ffffff")};font-size:13px;font-weight:700;text-align:${b.align || "left"};border:1px solid ${esc(b.borderColor || "#e2e8f0")}">${esc(h)}</th>`).join("");
      const trHtml = rows.map((r, ri) => {
        const cells = Array.isArray(r.cells) ? r.cells : [];
        const bg = ri % 2 === 0 ? "#ffffff" : "#f8fafc";
        const tdHtml = cells.map((c) => `<td style="padding:10px 14px;background-color:${bg};color:${esc(b.textColor || "#334155")};font-size:13px;border:1px solid ${esc(b.borderColor || "#e2e8f0")}">${esc(c)}</td>`).join("");
        return `<tr>${tdHtml}</tr>`;
      }).join("");
      return C(`<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border-collapse:collapse;width:100%;border:1px solid ${esc(b.borderColor || "#e2e8f0")};border-radius:8px;overflow:hidden">${headers.length ? `<thead><tr>${thHtml}</tr></thead>` : ""}<tbody>${trHtml}</tbody></table>`);
    }
    case "menu": {
      const items = (b.items || []).filter((it) => it.label).map(
        (it) => `<a href="${safeUrl(it.url)}" target="_blank" style="display:inline-block;padding:6px 12px;color:${esc(b.color || "#013388")};font-size:${b.size || 13}px;font-weight:700;text-decoration:none">${esc(it.label)}</a>`
      ).join('<span style="color:#cbd5e1;font-size:12px;vertical-align:middle">&bull;</span>');
      return C(`<div style="text-align:${b.align || "center"};padding:4px 0">${items}</div>`);
    }
    case "global": {
      if (b.globalKey === "rotary_header") {
        const ctx = siteContext || getActiveSiteBrandingContext();
        const branding = resolveInstitutionalLogo(b, ctx);
        const align = b.align || "center";
        const headerBg = b.bgGradient || b.bgColor || "#ffffff";
        const headerPadding = b.padding || "24px 20px";
        const maxW = typeof b.logoMaxWidth === "number" && b.logoMaxWidth > 0 ? b.logoMaxWidth : 240;
        const maxH = typeof b.logoMaxHeight === "number" && b.logoMaxHeight > 0 ? b.logoMaxHeight : 60;
        const resolvedUrl = branding.url || branding.logoUrl;
        const resolvedText = branding.text || branding.siteName;
        let logoHtml = "";
        if (resolvedUrl) {
          logoHtml = `<img src="${safeUrl(resolvedUrl)}" alt="${esc(branding.alt || ctx.siteName || "Identidad Institucional")}" style="max-height: ${maxH}px; max-width: ${maxW}px; width: auto; height: auto; display: inline-block; vertical-align: middle; object-fit: contain; border: 0; outline: none; text-decoration: none;" />`;
        } else if (resolvedText) {
          logoHtml = `<span style="font-size:20px;font-weight:800;letter-spacing:-0.02em;color:${esc(b.textColor || "#013388")};display:inline-block;text-transform:uppercase">${esc(resolvedText)}</span>`;
        }
        return C(`<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border-collapse:collapse;width:100%">
                    <tr>
                        <td data-rotary-header="true" align="${align}" style="background:${esc(headerBg)};padding:${esc(headerPadding)};text-align:${align};vertical-align:middle">
                            <table role="presentation" align="${align}" cellpadding="0" cellspacing="0" style="${align === "center" ? "margin:0 auto;" : align === "right" ? "margin-left:auto;margin-right:0;" : "margin-right:auto;margin-left:0;"}border-collapse:collapse">
                                <tr>
                                    <td align="${align}" style="text-align:${align};vertical-align:middle;line-height:1">
                                        ${logoHtml}
                                    </td>
                                </tr>
                            </table>
                        </td>
                    </tr>
                </table>`, "0px 0px");
      }
      if (b.globalKey === "rotary_footer") {
        const footerBg = b.bgColor || "#0c2340";
        const footerBgType = b.bgType || "solid";
        const footerGradientStart = b.bgGradientStart || footerBg;
        const footerGradientEnd = b.bgGradientEnd || footerBg;
        const footerGradientAngle = typeof b.bgGradientAngle === "number" ? b.bgGradientAngle : 180;
        let footerBgCss = footerBg;
        if (footerBgType === "gradient") {
          footerBgCss = b.bgGradient || `linear-gradient(${footerGradientAngle}deg, ${footerGradientStart} 0%, ${footerGradientEnd} 100%)`;
        }
        const footerTitle = b.title !== void 0 ? b.title : "\xA1S\xEDguenos y comparte el orgullo rotario!";
        const footerTitleColor = b.titleColor || "#ffffff";
        const footerTextColor = b.textColor || "#94a3b8";
        const footerLinkColor = b.linkColor || "#cbd5e1";
        const showAreas = b.showAreas !== false;
        const showSocial = b.showSocial !== false;
        const showWhatsapp = b.showWhatsapp !== false;
        const whatsappUrl = b.whatsappUrl !== void 0 ? b.whatsappUrl : "https://wa.me/573108520231";
        const whatsappText = b.whatsappText || "Asistencia directa a trav\xE9s de WhatsApp";
        const showWhatsappIcon = b.showWhatsappIcon !== false;
        const whatsappColor = b.whatsappColor || "#ffffff";
        const whatsappFontSize = typeof b.whatsappFontSize === "number" ? b.whatsappFontSize : 13;
        const whatsappFontWeight = b.whatsappFontWeight || "600";
        const whatsappAlign = b.whatsappAlign || "center";
        const footerText = b.footerText !== void 0 ? b.footerText : 'Rotary en Acci\xF3n \xB7 Distritos 4271 y 4281 Colombia.<br/>&copy; 2026 Rotary International. Todos los derechos reservados.<br/><a href="{{unsubscribe_url}}" target="_blank" style="color:#cbd5e1;text-decoration:underline">Preferencias de comunicaci\xF3n y cancelar suscripci\xF3n</a>';
        const footerLogo = b.logoUrl ? `<div style="margin-bottom:14px"><img src="${safeUrl(b.logoUrl)}" alt="Footer Logo" style="max-height:48px;max-width:220px;display:inline-block;vertical-align:middle;border:0" /></div>` : "";
        const areasHtml = showAreas ? `<div style="margin-bottom:18px">
                    <span style="display:inline-block;background-color:rgba(255,255,255,0.12);padding:4px 10px;border-radius:20px;font-size:11px;margin:2px 3px;color:#e2e8f0">&#128167; Agua</span>
                    <span style="display:inline-block;background-color:rgba(255,255,255,0.12);padding:4px 10px;border-radius:20px;font-size:11px;margin:2px 3px;color:#e2e8f0">&#128737;&#65039; Salud</span>
                    <span style="display:inline-block;background-color:rgba(255,255,255,0.12);padding:4px 10px;border-radius:20px;font-size:11px;margin:2px 3px;color:#e2e8f0">&#128118; Madres y Ni&ntilde;os</span>
                    <span style="display:inline-block;background-color:rgba(255,255,255,0.12);padding:4px 10px;border-radius:20px;font-size:11px;margin:2px 3px;color:#e2e8f0">&#128218; Educaci&oacute;n</span>
                    <span style="display:inline-block;background-color:rgba(255,255,255,0.12);padding:4px 10px;border-radius:20px;font-size:11px;margin:2px 3px;color:#e2e8f0">&#128104;&#8205;&#127806; Econom&iacute;a</span>
                    <span style="display:inline-block;background-color:rgba(255,255,255,0.12);padding:4px 10px;border-radius:20px;font-size:11px;margin:2px 3px;color:#e2e8f0">&#127807; Ambiente</span>
                    <span style="display:inline-block;background-color:rgba(255,255,255,0.12);padding:4px 10px;border-radius:20px;font-size:11px;margin:2px 3px;color:#e2e8f0">&#128330;&#65039; Paz</span>
                </div>` : "";
        const socialIconStyle = b.socialIconStyle || "white";
        const socialIconSize = typeof b.socialIconSize === "number" && b.socialIconSize >= 16 ? b.socialIconSize : 28;
        const socialIconGap = typeof b.socialIconGap === "number" && b.socialIconGap >= 0 ? b.socialIconGap : 12;
        const socialLinks = Array.isArray(b.socialLinks) && b.socialLinks.length > 0 ? b.socialLinks : DEFAULT_FOOTER_SOCIAL_LINKS;
        const socialHtml = showSocial ? renderFooterSocialIcons(socialLinks, socialIconStyle, socialIconSize, socialIconGap) : "";
        let whatsappHtml = "";
        if (showWhatsapp && whatsappUrl && whatsappText) {
          const iconHtml = showWhatsappIcon ? `<img src="https://app.clubplatform.org/icons/social/whatsapp-color.png" alt="WhatsApp" width="16" height="16" style="display:inline-block;width:16px;height:16px;vertical-align:middle;margin-right:6px;border:0;outline:none;text-decoration:none" />` : "";
          whatsappHtml = `<div style="text-align:${esc(whatsappAlign)};font-size:${whatsappFontSize}px;margin-bottom:14px;line-height:1.4">
                        <a href="${safeUrl(whatsappUrl)}" target="_blank" style="color:${esc(whatsappColor)};text-decoration:none;font-weight:${esc(whatsappFontWeight)};font-size:${whatsappFontSize}px;display:inline-block;vertical-align:middle">
                            ${iconHtml}<span style="vertical-align:middle;text-decoration:underline">${esc(whatsappText)}</span>
                        </a>
                    </div>`;
        }
        const isCtaActive = renderCtx?.isCtaActive;
        const tableMargin = isCtaActive ? "margin:0;" : "margin:24px 0 0 0;";
        const tableRadius = "border-radius:0;";
        const formattedFooterText = footerText.replace(/color:#cbd5e1/g, `color:${esc(footerLinkColor)}`);
        return C(`<table role="presentation" width="100%" cellpadding="0" cellspacing="0" bgcolor="${esc(footerBg)}" style="border-collapse:collapse;mso-table-lspace:0pt;mso-table-rspace:0pt;${tableMargin}background-color:${esc(footerBg)};${footerBgType === "gradient" ? `background:${footerBgCss};` : ""}${tableRadius}overflow:hidden;border:none">
                    <tr>
                        <td style="padding:28px 24px;text-align:center;color:${esc(footerTextColor)};background-color:${esc(footerBg)};${footerBgType === "gradient" ? `background:${footerBgCss};` : ""}">
                            ${footerLogo}
                            ${footerTitle ? `<div style="font-family:'Open Sans',Helvetica,Arial,sans-serif;font-size:14px;font-weight:800;letter-spacing:0.06em;text-transform:uppercase;margin-bottom:14px;color:${esc(footerTitleColor)}">${esc(footerTitle)}</div>` : ""}
                            ${areasHtml}
                            ${socialHtml}
                            ${whatsappHtml}
                            <div style="font-size:11px;color:${esc(footerTextColor)};line-height:1.5;margin-top:12px;border-top:1px solid rgba(255,255,255,0.1);padding-top:12px">
                                ${formattedFooterText}
                            </div>
                        </td>
                    </tr>
                </table>`, "0px 0px");
      }
      if (b.globalKey === "rotary_signature") {
        const title = b.title || "Comit\xE9 Distrital de Imagen P\xFAblica y Comunicaciones";
        const subtitle = b.subtitle || "Rotary en Acci\xF3n \xB7 Distritos 4271 y 4281";
        const motto = b.motto || "\xABDar de s\xED antes de pensar en s\xED\xBB";
        const sigBg = b.bgColor || "#f8fafc";
        const sigBorder = b.borderColor || "#013388";
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
      if (b.globalKey === "rotary_areas_focus" || b.globalKey === "rotary_categories") {
        const title = b.title || "\xBFQu\xE9 puede compartir tu club en Rotary en Acci\xF3n?";
        const subtitle = b.subtitle !== void 0 ? b.subtitle : "El formulario unificado se adapta a lo que elijas para visibilizar el impacto de tu club:";
        const areasBg = b.bgColor || "#f8fafc";
        const textColor = b.textColor || "#013388";
        const tipos = DEFAULT_TIPOS || [];
        const rows = [];
        for (let i = 0; i < tipos.length; i += 3) {
          rows.push(tipos.slice(i, i + 3));
        }
        const gridRowsHtml = rows.map((row) => {
          const cells = row.map((t) => {
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
          }).join("");
          return `<tr>${cells}</tr>`;
        }).join("");
        return C(`<div style="background-color:${esc(areasBg)};border:1px solid #e2e8f0;border-radius:12px;padding:18px 14px;margin:16px 0">
                    <div style="font-size:14px;font-weight:800;color:${esc(textColor)};margin-bottom:6px;text-transform:uppercase;letter-spacing:0.04em">&#127775; ${esc(title)}</div>
                    ${subtitle ? `<div style="font-size:12px;color:#64748b;margin-bottom:12px;line-height:1.4">${esc(subtitle)}</div>` : ""}
                    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border-collapse:collapse;width:100%;table-layout:fixed">
                        ${gridRowsHtml}
                    </table>
                </div>`);
      }
      if (b.globalKey === "club_platform_cta") {
        if (b.enabled === false) {
          if (interactive) {
            return C(`<div style="border:2px dashed #cbd5e1;border-radius:0;padding:14px 16px;text-align:center;background:#f8fafc;color:#94a3b8;font-size:12px;font-weight:600;cursor:pointer">
                            &#128276; <strong>CTA Club Platform (Opcional)</strong>: Desactivado para esta campa\xF1a &bull; Clic para configurar o reactivar
                        </div>`, "6px 24px");
          }
          return "";
        }
        const title = b.title || "\xA1Activa el ecosistema digital de tu club!";
        const subtitle = b.subtitle !== void 0 ? b.subtitle : "Conecta, comunica y potencia el impacto de tu club con Club Platform.";
        const btnText = b.buttonText || "ACTIVAR MI CLUB";
        let btnHref = b.buttonHref || "{{activar_club_url}}";
        if (btnHref === "{{activar_club_url}}") {
          btnHref = resolveSiteActivarClubUrl(siteContext, {
            utm_source: "email_marketing",
            utm_medium: "campaign",
            utm_campaign: "cta_club_platform"
          });
        } else if (siteContext && (siteContext.domain || siteContext.publicUrl || siteContext.siteName) && btnHref.includes("clubplatform.org")) {
          btnHref = resolveSiteActivarClubUrl(siteContext, {
            utm_source: "email_marketing",
            utm_medium: "campaign",
            utm_campaign: "cta_club_platform"
          });
        } else if (btnHref.includes("{{activar_club_url}}")) {
          const smartActivarUrl = resolveSiteActivarClubUrl(siteContext);
          btnHref = btnHref.replace(/\{\{activar_club_url\}\}/g, smartActivarUrl);
        }
        const textColor = b.textColor || "#ffffff";
        const titleColor = b.titleColor || textColor;
        const subtitleColor = b.subtitleColor || textColor;
        const btnBg = b.buttonBg || "#f7a81b";
        const btnColor = b.buttonColor || "#0c2340";
        const btnRadius = typeof b.buttonRadius === "number" ? b.buttonRadius : 24;
        const pad = b.padding || "28px 24px";
        const bgType = b.bgType || (b.bgGradient ? "gradient" : "gradient");
        const gradientStart = b.bgGradientStart || "#013388";
        const gradientEnd = b.bgGradientEnd || "#0c2340";
        const gradientAngle = typeof b.bgGradientAngle === "number" ? b.bgGradientAngle : 180;
        const gradientType = b.bgGradientType || "linear";
        const fallbackBg = b.bgColor || gradientEnd || "#0c2340";
        let bgCss = fallbackBg;
        if (bgType === "gradient") {
          if (b.bgGradient) {
            bgCss = b.bgGradient;
          } else if (gradientType === "radial") {
            bgCss = `radial-gradient(circle at center, ${gradientStart} 0%, ${gradientEnd} 100%)`;
          } else {
            bgCss = `linear-gradient(${gradientAngle}deg, ${gradientStart} 0%, ${gradientEnd} 100%)`;
          }
        }
        return C(`<table role="presentation" width="100%" cellpadding="0" cellspacing="0" bgcolor="${esc(fallbackBg)}" style="border-collapse:collapse;mso-table-lspace:0pt;mso-table-rspace:0pt;margin:24px 0 0 0;background-color:${esc(fallbackBg)};background:${bgCss};border-radius:0;overflow:hidden;border:none">
                    <!--[if mso]>
                    <v:rect xmlns:v="urn:schemas-microsoft-com:vml" fill="true" stroke="false" style="width:600px;">
                    <v:fill type="${bgType === "gradient" ? "gradient" : "solid"}" color="${esc(gradientStart)}" color2="${esc(gradientEnd)}" angle="${gradientAngle}" />
                    <v:textbox style="mso-fit-shape-to-text:true" inset="0,0,0,0">
                    <![endif]-->
                    <tr>
                        <td align="center" style="padding:${esc(pad)};text-align:center;color:${esc(textColor)};background-color:${esc(fallbackBg)};background:${bgCss}">
                            <div style="font-family:'Open Sans',Helvetica,Arial,sans-serif;font-size:18px;font-weight:800;letter-spacing:-0.01em;line-height:1.3;margin-bottom:8px;color:${esc(titleColor)}">
                                ${esc(title)}
                            </div>
                            ${subtitle ? `<div style="font-family:'Open Sans',Helvetica,Arial,sans-serif;font-size:13px;line-height:1.5;margin-bottom:18px;opacity:0.92;color:${esc(subtitleColor)}">${esc(subtitle)}</div>` : ""}
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
                    <!--[if mso]>
                    </v:textbox>
                    </v:rect>
                    <![endif]-->
                </table>`, "0px 0px");
      }
      return C(b.customHtml || '<div style="padding:12px;background:#f3f4f6;border-radius:8px">Bloque Global Institucional</div>');
    }
    default:
      return "";
  }
};
var renderDesignToHtml = (design, opts = {}) => {
  const s = { ...DEFAULT_SETTINGS, ...design?.settings || {} };
  const blocks = Array.isArray(design?.blocks) ? design.blocks : [];
  const siteContext = opts.siteContext || ("domain" in opts || "siteLogo" in opts || "isMainPlatform" in opts || "siteName" in opts || "rotaryEnAccionUrl" in opts ? opts : void 0);
  const ctaItem = blocks.find((b) => b.type === "global" && b.globalKey === "club_platform_cta");
  const isCtaActive = opts.isCtaActive !== void 0 ? opts.isCtaActive : !!ctaItem && ctaItem.enabled !== false;
  const rows = blocks.map((b) => renderBlock(b, s, !!opts.interactive, siteContext, { isCtaActive })).join("");
  const script = opts.interactive ? `<script>document.addEventListener('click',function(e){var el=e.target&&e.target.closest?e.target.closest('[data-bid]'):null;if(el&&window.parent){window.parent.postMessage({type:'ca-select-block',id:el.getAttribute('data-bid')},'*');}});</script>` : "";
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
var parseDesign = (raw) => {
  if (!raw) return null;
  try {
    const d = typeof raw === "string" ? JSON.parse(raw) : raw;
    if (!d || !Array.isArray(d.blocks)) return null;
    return { version: 1, settings: { ...DEFAULT_SETTINGS, ...d.settings || {} }, blocks: d.blocks };
  } catch {
    return null;
  }
};
var normalizeInstitutionalDesign = (rawDesign) => {
  const base = rawDesign || createRotaryMasterDesign();
  if (!base || !Array.isArray(base.blocks)) return createRotaryMasterDesign();
  const normalizedSettings = {
    ...DEFAULT_SETTINGS,
    ...base.settings || {},
    font: base.settings?.font && !base.settings.font.includes("-apple-system") ? base.settings.font : "'Open Sans', Helvetica, Arial, sans-serif"
  };
  let newBlocks = [...base.blocks];
  const headerIdx = newBlocks.findIndex((b) => b.type === "global" && b.globalKey === "rotary_header");
  if (headerIdx === -1) {
    newBlocks.unshift({
      id: newId(),
      type: "global",
      globalKey: "rotary_header",
      label: "Cabecera Institucional Adaptable",
      isProtected: true,
      isLocked: false,
      logoUrl: "",
      logoMaxWidth: 400,
      logoMaxHeight: 92,
      align: "center",
      bgColor: "#ffffff",
      padding: "24px 20px"
    });
  } else {
    const hdr = newBlocks[headerIdx];
    const oldTitle = hdr.title ? String(hdr.title).replace(/<br\s*\/?>/gi, "\n").trim() : "";
    const cleanedHeader = {
      ...hdr,
      label: "Cabecera Institucional Adaptable",
      align: hdr.align || "center",
      bgColor: hdr.bgColor || hdr.bgGradient || "#ffffff",
      bgGradient: hdr.bgGradient || void 0,
      padding: hdr.padding || "24px 20px",
      logoMaxWidth: typeof hdr.logoMaxWidth === "number" && hdr.logoMaxWidth > 0 ? hdr.logoMaxWidth : 400,
      logoMaxHeight: typeof hdr.logoMaxHeight === "number" && hdr.logoMaxHeight > 0 ? hdr.logoMaxHeight : 92,
      title: void 0,
      subtitle: void 0,
      badge: void 0
    };
    newBlocks[headerIdx] = cleanedHeader;
    if (oldTitle && !newBlocks.some((b) => b.type === "heading" && b.text?.includes(oldTitle.split("\n")[0]))) {
      newBlocks.splice(headerIdx + 1, 0, {
        id: newId(),
        type: "heading",
        text: oldTitle,
        level: 1,
        align: "center",
        color: "#013388",
        weight: "800",
        fontFamily: "'Open Sans', Helvetica, Arial, sans-serif",
        fontWeight: "800",
        label: "T\xEDtulo de Campa\xF1a (Editable)",
        isProtected: false
      });
    }
  }
  newBlocks = newBlocks.map((b) => {
    if (b.globalKey === "rotary_areas_focus" || b.globalKey === "rotary_categories") {
      const gb = b;
      return {
        ...gb,
        label: "\xBFQu\xE9 puede compartir tu club en Rotary en Acci\xF3n?",
        title: gb.title && !gb.title.includes("7 \xC1reas") ? gb.title : "\xBFQu\xE9 puede compartir tu club en Rotary en Acci\xF3n?",
        subtitle: gb.subtitle !== void 0 ? gb.subtitle : "El formulario unificado se adapta a lo que elijas para visibilizar el impacto de tu club:"
      };
    }
    if (b.type === "button") {
      const currentBtn = b;
      return {
        ...currentBtn,
        text: currentBtn.text === "COMPARTIR ACTIVIDAD EN ROTARY EN ACCI\xD3N" ? "COMPARTIR EN ROTARY EN ACCI\xD3N" : currentBtn.text,
        fontFamily: currentBtn.fontFamily || "'Open Sans', Helvetica, Arial, sans-serif",
        fontWeight: currentBtn.fontWeight || "700"
      };
    }
    if (b.type === "heading") {
      const h = b;
      return {
        ...h,
        fontFamily: h.fontFamily || "'Open Sans', Helvetica, Arial, sans-serif"
      };
    }
    if (b.type === "text") {
      const t = b;
      return {
        ...t,
        fontFamily: t.fontFamily || "'Open Sans', Helvetica, Arial, sans-serif"
      };
    }
    if (b.globalKey === "club_platform_cta") {
      const cp = b;
      return {
        ...cp,
        label: "CTA Promocional Club Platform",
        enabled: cp.enabled !== false,
        title: cp.title || "\xA1Activa el ecosistema digital de tu club!",
        subtitle: cp.subtitle !== void 0 ? cp.subtitle : "Conecta, comunica y potencia el impacto de tu club con Club Platform.",
        buttonText: cp.buttonText || "ACTIVAR MI CLUB",
        buttonHref: cp.buttonHref || "https://rotary4281.org/activar-mi-club",
        buttonBg: cp.buttonBg || "#f7a81b",
        buttonColor: cp.buttonColor || "#0c2340",
        buttonRadius: cp.buttonRadius ?? 20,
        bgType: cp.bgType || "solid",
        bgColor: cp.bgColor || "#0C3C7C",
        textColor: cp.textColor || "#ffffff",
        titleColor: cp.titleColor || cp.textColor || "#ffffff",
        subtitleColor: cp.subtitleColor || cp.textColor || "#ffffff"
      };
    }
    if (b.globalKey === "rotary_footer") {
      const rf = b;
      return {
        ...rf,
        label: "Pie de P\xE1gina Institucional Protegido",
        bgType: rf.bgType || "solid",
        bgColor: rf.bgColor || "#28354B",
        bgGradientStart: rf.bgGradientStart || rf.bgColor || "#28354B",
        bgGradientEnd: rf.bgGradientEnd || rf.bgColor || "#28354B",
        bgGradientAngle: typeof rf.bgGradientAngle === "number" ? rf.bgGradientAngle : 180,
        textColor: rf.textColor || "#94a3b8",
        titleColor: rf.titleColor || "#ffffff",
        linkColor: rf.linkColor || "#cbd5e1",
        socialIconStyle: rf.socialIconStyle || "white",
        socialIconSize: rf.socialIconSize || 30,
        socialIconGap: rf.socialIconGap || 12,
        socialLinks: Array.isArray(rf.socialLinks) && rf.socialLinks.length > 0 ? rf.socialLinks : DEFAULT_FOOTER_SOCIAL_LINKS,
        showWhatsapp: rf.showWhatsapp !== false,
        showWhatsappIcon: rf.showWhatsappIcon !== false,
        whatsappColor: rf.whatsappColor || "#ffffff",
        whatsappText: rf.whatsappText || "Asistencia directa a trav\xE9s de WhatsApp",
        whatsappUrl: rf.whatsappUrl !== void 0 ? rf.whatsappUrl : "https://wa.me/573114308882",
        whatsappFontSize: rf.whatsappFontSize || 12,
        whatsappFontWeight: rf.whatsappFontWeight || "400",
        logoUrl: rf.logoUrl || "https://rotaryd4281.s3.amazonaws.com/media/poa_horizontallockup_rev_es-1.png",
        footerText: rf.footerText || 'Copyright \xA9 2026 Rotary Distrito 4281. Todos los derechos reservados.<br/><a href="{{unsubscribe_url}}" target="_blank" style="color:#cbd5e1;text-decoration:underline">Preferencias de comunicaci\xF3n y cancelar suscripci\xF3n</a>'
      };
    }
    return b;
  });
  if (!newBlocks.some((b) => b.type === "button")) {
    const insertIdx = newBlocks.findIndex(
      (b) => b.type === "global" && ["rotary_signature", "club_platform_cta", "rotary_footer"].includes(b.globalKey || "")
    );
    const defaultBtn = {
      id: newId(),
      type: "button",
      text: "ACTUALIZAR EL PERFIL DE MI CLUB",
      href: "{{club.update_form_url|https://app.clubplatform.org/clubes/registro}}",
      bg: "#0C3C7C",
      color: "#ffffff",
      align: "center",
      radius: 12,
      fontFamily: "'Open Sans', Helvetica, Arial, sans-serif",
      fontWeight: "700",
      fontSize: 15,
      label: "Bot\xF3n CTA Oficial",
      isProtected: false
    };
    if (insertIdx !== -1) {
      newBlocks.splice(insertIdx, 0, defaultBtn);
    } else {
      newBlocks.push(defaultBtn);
    }
  }
  if (!newBlocks.some((b) => b.type === "global" && b.globalKey === "rotary_signature")) {
    const footerOrCtaIdx = newBlocks.findIndex(
      (b) => b.type === "global" && ["club_platform_cta", "rotary_footer"].includes(b.globalKey || "")
    );
    const defaultSig = {
      id: newId(),
      type: "global",
      globalKey: "rotary_signature",
      label: "Firma Oficial Distrital",
      isProtected: true,
      isLocked: false,
      title: "Comit\xE9 Distrital de Imagen P\xFAblica y Comunicaciones",
      subtitle: "Distrito 4281 de Rotary International",
      motto: "\xABDar de s\xED antes de pensar en s\xED\xBB",
      bgColor: "#f8fafc",
      borderColor: "#013388"
    };
    if (footerOrCtaIdx !== -1) {
      newBlocks.splice(footerOrCtaIdx, 0, defaultSig);
    } else {
      newBlocks.push(defaultSig);
    }
  }
  if (!newBlocks.some((b) => b.type === "global" && b.globalKey === "club_platform_cta")) {
    const footerIdx = newBlocks.findIndex(
      (b) => b.type === "global" && b.globalKey === "rotary_footer"
    );
    const defaultCta = {
      id: newId(),
      type: "global",
      globalKey: "club_platform_cta",
      label: "CTA Promocional Club Platform",
      isProtected: true,
      isLocked: true,
      enabled: true,
      title: "\xA1Activa el ecosistema digital de tu club!",
      subtitle: "Conecta, comunica y potencia el impacto de tu club con Club Platform.",
      buttonText: "ACTIVAR MI CLUB",
      buttonHref: "https://rotary4281.org/activar-mi-club",
      buttonBg: "#f7a81b",
      buttonColor: "#0c2340",
      buttonRadius: 20,
      bgType: "solid",
      bgColor: "#0C3C7C",
      textColor: "#ffffff",
      titleColor: "#ffffff",
      subtitleColor: "#ffffff",
      padTop: 0,
      padBottom: 0
    };
    if (footerIdx !== -1) {
      newBlocks.splice(footerIdx, 0, defaultCta);
    } else {
      newBlocks.push(defaultCta);
    }
  }
  if (!newBlocks.some((b) => b.type === "global" && b.globalKey === "rotary_footer")) {
    newBlocks.push({
      id: newId(),
      type: "global",
      globalKey: "rotary_footer",
      label: "Pie de P\xE1gina Institucional Protegido",
      isProtected: true,
      isLocked: false,
      title: "\xA1S\xCDGUENOS Y COMPARTE EL ORGULLO ROTARIO!",
      bgType: "solid",
      bgColor: "#28354B",
      titleColor: "#ffffff",
      textColor: "#94a3b8",
      linkColor: "#cbd5e1",
      showAreas: false,
      showSocial: true,
      socialIconStyle: "white",
      socialIconSize: 30,
      socialIconGap: 12,
      socialLinks: DEFAULT_FOOTER_SOCIAL_LINKS,
      showWhatsapp: true,
      showWhatsappIcon: true,
      whatsappColor: "#ffffff",
      whatsappText: "Asistencia directa a trav\xE9s de WhatsApp",
      whatsappUrl: "https://wa.me/573114308882",
      whatsappFontSize: 12,
      whatsappFontWeight: "400",
      logoUrl: "https://rotaryd4281.s3.amazonaws.com/media/poa_horizontallockup_rev_es-1.png",
      footerText: 'Copyright \xA9 2026 Rotary Distrito 4281. Todos los derechos reservados.<br/><a href="{{unsubscribe_url}}" target="_blank" style="color:#cbd5e1;text-decoration:underline">Preferencias de comunicaci\xF3n y cancelar suscripci\xF3n</a>',
      padTop: 0,
      padBottom: 0
    });
  }
  return {
    ...base,
    settings: normalizedSettings,
    blocks: newBlocks
  };
};
var createRotaryMasterDesign = (campaign) => {
  const title = campaign?.name || "Tu club transforma comunidades.\n\xA1Hag\xE1moslo visible!";
  const introText = campaign?.messageCentral ? `Estimadas rotarias y estimados rotarios:

${campaign.messageCentral}

Rotary en Acci\xF3n es la plataforma oficial para visibilizar, registrar y difundir ese impacto ante el mundo.` : "Estimadas rotarias y estimados rotarios:\n\nCada semana, los clubes realizan un esfuerzo incansable por sus comunidades: jornadas de salud, agua potable, becas educativas y proyectos sostenibles. Rotary en Acci\xF3n es la plataforma oficial para visibilizar, registrar y difundir ese impacto ante el mundo.";
  const ctaUrl = campaign?.formUrl || `https://rotary4281.org/rotary-en-accion?utm_source=email_marketing&utm_medium=campaign&utm_campaign=${campaign?.utmCampaign || "sem01_captacion"}`;
  return {
    version: 1,
    settings: {
      bg: "#e6e6e6",
      contentBg: "#ffffff",
      font: "'Open Sans', Helvetica, Arial, sans-serif",
      textColor: "#334155",
      linkColor: "#013388",
      width: 600
    },
    blocks: [
      {
        id: newId(),
        type: "global",
        globalKey: "rotary_header",
        label: "Cabecera Institucional Adaptable",
        isProtected: true,
        isLocked: false,
        logoUrl: "",
        logoMaxWidth: 400,
        logoMaxHeight: 92,
        align: "center",
        bgColor: "#ffffff",
        padding: "24px 20px"
      },
      {
        id: newId(),
        type: "heading",
        text: title,
        level: 1,
        align: "center",
        color: "#013388",
        weight: "300",
        fontSize: 17,
        fontFamily: "'Open Sans', Helvetica, Arial, sans-serif",
        fontWeight: "300",
        letterSpacing: 0,
        padTop: 8,
        label: "T\xEDtulo de Campa\xF1a (Editable)",
        isProtected: false
      },
      {
        id: newId(),
        type: "heading",
        text: "Hola {{contact.first_name|L\xEDder Rotario(a)}},",
        level: 2,
        align: "left",
        color: "#0f172a",
        weight: "800",
        fontSize: 18,
        fontFamily: "'Open Sans', Helvetica, Arial, sans-serif",
        lineHeight: 1.25,
        padTop: 24,
        letterSpacing: 0,
        label: "Saludo Personalizado",
        isProtected: false
      },
      {
        id: newId(),
        type: "text",
        text: introText,
        align: "left",
        color: "#334155",
        size: 14,
        fontFamily: "'Open Sans', Helvetica, Arial, sans-serif",
        fontWeight: "400",
        lineHeight: 1.6,
        padBottom: 0,
        label: "Cuerpo de Campa\xF1a (Editable / Asistido por IA)",
        isProtected: false
      },
      {
        id: newId(),
        type: "global",
        globalKey: "rotary_areas_focus",
        label: "\xBFQu\xE9 puede compartir tu club en Rotary en Acci\xF3n?",
        isProtected: true,
        isLocked: false,
        title: "\xBFQu\xE9 puede compartir tu club en Rotary en Acci\xF3n?",
        subtitle: "El formulario unificado se adapta a lo que elijas para visibilizar el impacto de tu club:",
        bgColor: "#f8fafc",
        padTop: 0
      },
      {
        id: newId(),
        type: "text",
        text: "\xA1Tu club tiene mucho que contar! Ingresa al formulario de Rotary en Acci\xF3n y comparte las fotos y detalles de tu iniciativa en menos de 3 minutos.",
        align: "left",
        color: "#334155",
        size: 14,
        fontFamily: "'Open Sans', Helvetica, Arial, sans-serif",
        fontWeight: "400",
        lineHeight: 1.6,
        label: "Llamado al Registro (Editable)",
        isProtected: false
      },
      {
        id: newId(),
        type: "button",
        text: "COMPARTIR EN ROTARY EN ACCI\xD3N",
        href: ctaUrl,
        bg: "#0C3C7C",
        color: "#ffffff",
        align: "center",
        radius: 12,
        fontFamily: "'Open Sans', Helvetica, Arial, sans-serif",
        fontWeight: "700",
        fontSize: 15,
        label: "Bot\xF3n de Acci\xF3n Principal (Estilo Protegido / Enlace Din\xE1mico)",
        isProtected: false
      },
      {
        id: newId(),
        type: "global",
        globalKey: "rotary_signature",
        label: "Firma Oficial Distrital",
        isProtected: true,
        isLocked: false,
        title: "Comit\xE9 Distrital de Imagen P\xFAblica y Comunicaciones",
        subtitle: "Distrito 4281 de Rotary International",
        motto: "\xABDar de s\xED antes de pensar en s\xED\xBB",
        bgColor: "#f8fafc",
        borderColor: "#013388"
      },
      {
        id: newId(),
        type: "global",
        globalKey: "club_platform_cta",
        label: "CTA Promocional Club Platform",
        isProtected: true,
        isLocked: true,
        enabled: true,
        title: "\xA1Activa el ecosistema digital de tu club!",
        subtitle: "Conecta, comunica y potencia el impacto de tu club con Club Platform.",
        buttonText: "ACTIVAR MI CLUB",
        buttonHref: "https://app.clubplatform.org",
        buttonBg: "#f7a81b",
        buttonColor: "#0c2340",
        buttonRadius: 20,
        bgType: "gradient",
        bgColor: "#0C3C7C",
        bgGradientStart: "#013388",
        bgGradientEnd: "#0c2340",
        bgGradientAngle: 180,
        textColor: "#ffffff",
        titleColor: "#ffffff",
        subtitleColor: "#ffffff",
        padTop: 0,
        padBottom: 0
      },
      {
        id: newId(),
        type: "global",
        globalKey: "rotary_footer",
        label: "Pie de P\xE1gina Institucional Protegido",
        isProtected: true,
        isLocked: false,
        title: "\xA1S\xCDGUENOS Y COMPARTE EL ORGULLO ROTARIO!",
        bgType: "solid",
        bgColor: "#0c2340",
        titleColor: "#ffffff",
        textColor: "#94a3b8",
        linkColor: "#cbd5e1",
        logoUrl: "https://rotaryd4281.s3.amazonaws.com/media/poa_horizontallockup_rev_es-1.png",
        showAreas: false,
        showSocial: true,
        socialIconStyle: "white",
        socialIconSize: 30,
        socialIconGap: 12,
        socialLinks: [
          { network: "instagram", url: "https://www.instagram.com/rotary4281", label: "Instagram" },
          { network: "facebook", url: "https://www.facebook.com/profile.php?id=61576368985137", label: "Facebook" },
          { network: "youtube", url: "https://youtube.com", label: "YouTube" },
          { network: "web", url: "https://www.youtube.com/@RotaryDistrito4281", label: "Rotary en Acci\xF3n" }
        ],
        showWhatsapp: true,
        showWhatsappIcon: true,
        whatsappColor: "#ffffff",
        whatsappText: "Asistencia directa a trav\xE9s de WhatsApp",
        whatsappUrl: "https://wa.me/573114308882",
        whatsappFontSize: 12,
        whatsappFontWeight: "400",
        footerText: 'Copyright \xA9 2026 Rotary Distrito 4281. Todos los derechos reservados.<br/><a href="{{unsubscribe_url}}" target="_blank" style="color:#cbd5e1;text-decoration:underline">Preferencias de comunicaci\xF3n y cancelar suscripci\xF3n</a>',
        padTop: 0,
        padBottom: 0
      }
    ]
  };
};
var createDirectorioMasterDesign = (campaign) => {
  const title = campaign?.name || "Tu club merece estar presente.\n\xA1Actualiza su perfil institucional!";
  const introText = campaign?.messageCentral ? `Estimadas rotarias y estimados rotarios:

${campaign.messageCentral}

Cada club Rotary, Rotaract e Interact de nuestro Distrito 4281 tiene una identidad, liderazgo y labor comunitaria que merece ser visible ante la sociedad en el Directorio Oficial.` : "Estimadas rotarias y estimados rotarios:\n\nCada club Rotary, Rotaract e Interact de nuestro Distrito 4281 tiene una historia, un liderazgo y un compromiso comunitario que merece ser reconocido y visibilizado en el Directorio Oficial.";
  const ctaUrl = campaign?.formUrl || "{{club.update_form_url|https://app.clubplatform.org/clubes/registro}}";
  const ctaText = campaign?.week === 4 ? "REVISAR EL PERFIL DE MI CLUB" : "ACTUALIZAR EL PERFIL DE MI CLUB";
  const directorioInfoHtml = `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border-collapse:collapse;margin:16px 0;background-color:#f8fafc;border-left:4px solid #013388;border-radius:0 12px 12px 0">
  <tr>
    <td style="padding:16px 20px;font-family:'Open Sans',Helvetica,Arial,sans-serif;color:#334155;font-size:14px;line-height:1.6">
      <div style="font-weight:700;color:#0f172a;font-size:15px;margin-bottom:6px">Directorio Oficial de Clubes Distrito 4281:</div>
      <div style="font-size:13.5px;color:#64748b;line-height:1.5">Centraliza la ficha p\xFAblica de <strong>{{club.name|su Club}}</strong> en <strong>{{club.city|su localidad}}</strong>, facilitando que nuevos miembros, aliados estrat\xE9gicos y la comunidad general puedan contactarlos y conocer sus programas de servicio.</div>
    </td>
  </tr>
</table>

<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border-collapse:collapse;margin:16px 0;background-color:#f1f5f9;border:1px solid #e2e8f0;border-radius:12px">
  <tr>
    <td style="padding:18px 20px;font-family:'Open Sans',Helvetica,Arial,sans-serif">
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border-collapse:collapse;margin-bottom:8px">
        <tr>
          <td align="left" style="font-size:13px;font-weight:700;color:#0f172a">Estado del perfil institucional</td>
          <td align="right" style="font-size:13px;font-weight:800;color:#013388">{{club.completion_percentage|0%}}</td>
        </tr>
      </table>
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border-collapse:collapse;background-color:#e2e8f0;border-radius:9999px;height:8px;line-height:8px;font-size:0;width:100%">
        <tr>
          <td width="{{club.completion_percentage|15%}}" style="background-color:#013388;border-radius:9999px;height:8px">&nbsp;</td>
          <td>&nbsp;</td>
        </tr>
      </table>
      <div style="margin-top:10px;font-size:12px;color:#64748b;line-height:1.4">Iniciar la ficha toma menos de 5 minutos y no requiere contrase\xF1as complejas.</div>
    </td>
  </tr>
</table>`;
  return {
    version: 1,
    settings: {
      bg: "#e6e6e6",
      contentBg: "#ffffff",
      font: "'Open Sans', Helvetica, Arial, sans-serif",
      textColor: "#334155",
      linkColor: "#013388",
      width: 600
    },
    blocks: [
      {
        id: newId(),
        type: "global",
        globalKey: "rotary_header",
        label: "Cabecera Institucional Adaptable",
        isProtected: true,
        isLocked: false,
        logoUrl: "",
        logoMaxWidth: 400,
        logoMaxHeight: 92,
        align: "center",
        bgColor: "#ffffff",
        padding: "24px 20px"
      },
      {
        id: newId(),
        type: "heading",
        text: title,
        level: 1,
        align: "center",
        color: "#013388",
        weight: "300",
        fontFamily: "'Open Sans', Helvetica, Arial, sans-serif",
        fontWeight: "300",
        fontSize: 17,
        padTop: 8,
        letterSpacing: 0,
        label: "T\xEDtulo de Campa\xF1a Directorio",
        isProtected: false
      },
      {
        id: newId(),
        type: "heading",
        text: "Hola {{contact.first_name|L\xEDder Rotario(a)}},",
        level: 2,
        align: "left",
        color: "#0f172a",
        weight: "800",
        fontFamily: "'Open Sans', Helvetica, Arial, sans-serif",
        fontWeight: "800",
        fontSize: 18,
        padTop: 24,
        lineHeight: 1.25,
        letterSpacing: 0,
        label: "Saludo Personalizado",
        isProtected: false
      },
      {
        id: newId(),
        type: "text",
        text: introText,
        align: "left",
        color: "#334155",
        size: 14,
        fontFamily: "'Open Sans', Helvetica, Arial, sans-serif",
        fontWeight: "400",
        lineHeight: 1.6,
        padBottom: 0,
        label: "Cuerpo de Campa\xF1a (Editable / IA)",
        isProtected: false
      },
      {
        id: newId(),
        type: "html",
        html: directorioInfoHtml,
        label: "Tarjeta de Estado del Perfil Institucional",
        isProtected: false
      },
      {
        id: newId(),
        type: "button",
        text: ctaText,
        href: ctaUrl,
        bg: "#0C3C7C",
        color: "#ffffff",
        align: "center",
        radius: 12,
        fontFamily: "'Open Sans', Helvetica, Arial, sans-serif",
        fontWeight: "700",
        fontSize: 15,
        label: "Bot\xF3n CTA Oficial Directorio",
        isProtected: false
      },
      {
        id: newId(),
        type: "global",
        globalKey: "rotary_signature",
        label: "Firma Oficial Distrital",
        isProtected: true,
        isLocked: false,
        title: "Gobernaci\xF3n del Distrito 4281 \xB7 Comit\xE9 de Directorio e Imagen P\xFAblica",
        subtitle: "Distrito 4281 de Rotary International",
        motto: "\xABDar de s\xED antes de pensar en s\xED\xBB",
        bgColor: "#f8fafc",
        borderColor: "#013388"
      },
      {
        id: newId(),
        type: "global",
        globalKey: "club_platform_cta",
        label: "CTA Promocional Club Platform",
        isProtected: true,
        isLocked: true,
        enabled: true,
        title: "\xA1Activa el ecosistema digital de tu club!",
        subtitle: "Conecta, comunica y potencia el impacto de tu club con Club Platform.",
        buttonText: "ACTIVAR MI CLUB",
        buttonHref: "https://rotary4281.org/activar-mi-club",
        buttonBg: "#f7a81b",
        buttonColor: "#0c2340",
        buttonRadius: 20,
        bgType: "solid",
        bgColor: "#0C3C7C",
        textColor: "#ffffff",
        titleColor: "#ffffff",
        subtitleColor: "#ffffff",
        padTop: 0,
        padBottom: 0
      },
      {
        id: newId(),
        type: "global",
        globalKey: "rotary_footer",
        label: "Pie de P\xE1gina Institucional Protegido",
        isProtected: true,
        isLocked: false,
        title: "\xA1S\xCDGUENOS Y COMPARTE EL ORGULLO ROTARIO!",
        bgType: "solid",
        bgColor: "#28354B",
        titleColor: "#ffffff",
        textColor: "#94a3b8",
        linkColor: "#cbd5e1",
        logoUrl: "https://rotaryd4281.s3.amazonaws.com/media/poa_horizontallockup_rev_es-1.png",
        showAreas: false,
        showSocial: true,
        socialIconStyle: "white",
        socialIconSize: 30,
        socialIconGap: 12,
        socialLinks: [
          { network: "instagram", url: "https://www.instagram.com/rotary4281", label: "Instagram" },
          { network: "facebook", url: "https://www.facebook.com/profile.php?id=61576368985137", label: "Facebook" },
          { network: "youtube", url: "https://youtube.com", label: "YouTube" },
          { network: "web", url: "https://rotary4281.org", label: "Distrito 4281" }
        ],
        showWhatsapp: true,
        showWhatsappIcon: true,
        whatsappColor: "#ffffff",
        whatsappText: "Asistencia directa a trav\xE9s de WhatsApp",
        whatsappUrl: "https://wa.me/573114308882",
        whatsappFontSize: 12,
        whatsappFontWeight: "400",
        footerText: 'Copyright \xA9 2026 Rotary Distrito 4281. Todos los derechos reservados.<br/><a href="{{unsubscribe_url}}" target="_blank" style="color:#cbd5e1;text-decoration:underline">Preferencias de comunicaci\xF3n y cancelar suscripci\xF3n</a>',
        padTop: 0,
        padBottom: 0
      }
    ]
  };
};
var createFeriaMasterDesign = (campaign) => {
  const title = campaign?.name || "Convocatoria Oficial: Postula tu proyecto\na la Feria de Proyectos Rotary Colombia";
  const introText = campaign?.messageCentral ? `Estimadas rotarias y estimados rotarios:

${campaign.messageCentral}

La Feria de Proyectos es la vitrina internacional m\xE1s importante de Colombia para conectar proyectos con clubes aliados, subvenciones globales de La Fundaci\xF3n Rotaria y financiamiento sostenible.` : "Estimadas rotarias y estimados rotarios:\n\nLa Feria de Proyectos Rotary Colombia abre su convocatoria oficial para que clubes de todo el pa\xEDs y de la red internacional postulen, actualicen y visibilicen sus proyectos de servicio transformador.";
  const ctaUrl = campaign?.formUrl || `https://rotaryprojectfaircolombia.org/rotary-en-accion?canal=feria&utm_source=email_marketing&utm_medium=campaign&utm_campaign=${campaign?.utmCampaign || "feria_proyectos"}`;
  const ctaText = campaign?.week === 2 ? "ACTUALIZAR AVANCES DEL PROYECTO" : "POSTULAR PROYECTO EN LA FERIA";
  const feriaFocusAreasHtml = `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border-collapse:collapse;margin:16px 0;background-color:#f8fafc;border:1px solid #e2e8f0;border-radius:12px">
  <tr>
    <td style="padding:18px 20px;font-family:'Open Sans',Helvetica,Arial,sans-serif">
      <div style="font-size:13px;font-weight:800;color:#013388;text-transform:uppercase;letter-spacing:0.04em;margin-bottom:8px">
        &#127775; Prop\xF3sitos de Postulaci\xF3n y Evoluci\xF3n en la Feria:
      </div>
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border-collapse:collapse">
        <tr>
          <td width="50%" valign="top" style="padding:4px 6px 4px 0;font-size:12px;color:#334155;line-height:1.5">
            <strong>&#128161; Proyecto Nuevo:</strong> Inicia tu postulaci\xF3n formal para conectar con clubes patrocinadores.<br/>
            <strong>&#128200; Avances de Obra:</strong> Registra evidencias, porcentaje de avance e hitos alcanzados.
          </td>
          <td width="50%" valign="top" style="padding:4px 0 4px 6px;font-size:12px;color:#334155;line-height:1.5">
            <strong>&#128176; Financiaci\xF3n / Aliados:</strong> Busca clubes internacionales y subvenciones globales.<br/>
            <strong>&#127942; Historia de \xC9xito:</strong> Visibiliza resultados e impacto medible en tu comunidad.
          </td>
        </tr>
      </table>
      <div style="margin-top:12px;padding-top:10px;border-top:1px dashed #cbd5e1;font-size:11.5px;color:#64748b;line-height:1.4">
        Abarca las 7 \xE1reas de inter\xE9s oficiales de Rotary: Paz, Salud, Agua, Madres y Ni\xF1os, Educaci\xF3n, Desarrollo Econ\xF3mico y Medio Ambiente.
      </div>
    </td>
  </tr>
</table>`;
  return {
    version: 1,
    settings: {
      bg: "#e6e6e6",
      contentBg: "#ffffff",
      font: "'Open Sans', Helvetica, Arial, sans-serif",
      textColor: "#334155",
      linkColor: "#013388",
      width: 600
    },
    blocks: [
      {
        id: newId(),
        type: "global",
        globalKey: "rotary_header",
        label: "Cabecera Institucional Feria de Proyectos",
        isProtected: true,
        isLocked: false,
        logoUrl: "https://rotary-platform-assets.s3.us-east-1.amazonaws.com/clubs/322c2f88-ad33-484d-bb54-272de9262d72/images/1785773906008-FeriadeProyectosRotary-Logo_(1).png",
        logoMaxWidth: 340,
        logoMaxHeight: 80,
        align: "center",
        bgColor: "#ffffff",
        padding: "24px 20px"
      },
      {
        id: newId(),
        type: "heading",
        text: title,
        level: 1,
        align: "center",
        color: "#013388",
        weight: "300",
        fontFamily: "'Open Sans', Helvetica, Arial, sans-serif",
        fontWeight: "300",
        fontSize: 17,
        padTop: 8,
        letterSpacing: 0,
        label: "T\xEDtulo de Campa\xF1a Feria",
        isProtected: false
      },
      {
        id: newId(),
        type: "heading",
        text: "Hola {{contact.first_name|L\xEDder Rotario(a)}},",
        level: 2,
        align: "left",
        color: "#0f172a",
        weight: "800",
        fontFamily: "'Open Sans', Helvetica, Arial, sans-serif",
        fontWeight: "800",
        fontSize: 18,
        padTop: 24,
        lineHeight: 1.25,
        letterSpacing: 0,
        label: "Saludo Personalizado",
        isProtected: false
      },
      {
        id: newId(),
        type: "text",
        text: introText,
        align: "left",
        color: "#334155",
        size: 14,
        fontFamily: "'Open Sans', Helvetica, Arial, sans-serif",
        fontWeight: "400",
        lineHeight: 1.6,
        padBottom: 0,
        label: "Cuerpo de Campa\xF1a (Editable / IA)",
        isProtected: false
      },
      {
        id: newId(),
        type: "html",
        html: feriaFocusAreasHtml,
        label: "\xC1reas de Inter\xE9s y Prop\xF3sitos de la Feria",
        isProtected: false
      },
      {
        id: newId(),
        type: "button",
        text: ctaText,
        href: ctaUrl,
        bg: "#0C3C7C",
        color: "#ffffff",
        align: "center",
        radius: 12,
        fontFamily: "'Open Sans', Helvetica, Arial, sans-serif",
        fontWeight: "700",
        fontSize: 15,
        label: "Bot\xF3n CTA Oficial Feria",
        isProtected: false
      },
      {
        id: newId(),
        type: "global",
        globalKey: "rotary_signature",
        label: "Firma Oficial Feria de Proyectos",
        isProtected: true,
        isLocked: false,
        title: "Comit\xE9 Organizador \xB7 Feria de Proyectos Rotary Colombia",
        subtitle: "Distritos 4271 y 4281 \xB7 Rotary International",
        motto: "\xABDar de s\xED antes de pensar en s\xED\xBB",
        bgColor: "#f8fafc",
        borderColor: "#013388"
      },
      {
        id: newId(),
        type: "global",
        globalKey: "club_platform_cta",
        label: "CTA Promocional Club Platform",
        isProtected: true,
        isLocked: true,
        enabled: true,
        title: "\xA1Activa el ecosistema digital de tu club!",
        subtitle: "Conecta, comunica y potencia el impacto de tu club con Club Platform.",
        buttonText: "ACTIVAR MI CLUB",
        buttonHref: "https://app.clubplatform.org/activar-mi-club",
        buttonBg: "#f7a81b",
        buttonColor: "#0c2340",
        buttonRadius: 20,
        bgType: "solid",
        bgColor: "#0C3C7C",
        textColor: "#ffffff",
        titleColor: "#ffffff",
        subtitleColor: "#ffffff",
        padTop: 0,
        padBottom: 0
      },
      {
        id: newId(),
        type: "global",
        globalKey: "rotary_footer",
        label: "Pie de P\xE1gina Institucional Protegido",
        isProtected: true,
        isLocked: false,
        title: "\xA1S\xCDGUENOS Y COMPARTE EL ORGULLO ROTARIO!",
        bgType: "solid",
        bgColor: "#28354B",
        titleColor: "#ffffff",
        textColor: "#94a3b8",
        linkColor: "#cbd5e1",
        logoUrl: "https://rotaryd4281.s3.amazonaws.com/media/poa_horizontallockup_rev_es-1.png",
        showAreas: false,
        showSocial: true,
        socialIconStyle: "white",
        socialIconSize: 30,
        socialIconGap: 12,
        socialLinks: [
          { network: "instagram", url: "https://www.instagram.com/rotary4281", label: "Instagram" },
          { network: "facebook", url: "https://www.facebook.com/profile.php?id=61576368985137", label: "Facebook" },
          { network: "youtube", url: "https://youtube.com", label: "YouTube" },
          { network: "web", url: "https://rotaryprojectfaircolombia.org", label: "Feria de Proyectos" }
        ],
        showWhatsapp: true,
        showWhatsappIcon: true,
        whatsappColor: "#ffffff",
        whatsappText: "Asistencia directa a trav\xE9s de WhatsApp",
        whatsappUrl: "https://wa.me/573114308882",
        whatsappFontSize: 12,
        whatsappFontWeight: "400",
        footerText: 'Feria de Proyectos Rotary Colombia \xB7 Distritos 4271 y 4281.<br/>&copy; 2026 Rotary International. Todos los derechos reservados.<br/><a href="{{unsubscribe_url}}" target="_blank" style="color:#cbd5e1;text-decoration:underline">Preferencias de comunicaci\xF3n y cancelar suscripci\xF3n</a>',
        padTop: 0,
        padBottom: 0
      }
    ]
  };
};
var createChannelCampaignDesign = (channel, campaign) => {
  if (channel === "directorio_clubes") {
    return createDirectorioMasterDesign(campaign);
  }
  if (channel === "feria_proyectos") {
    return createFeriaMasterDesign(campaign);
  }
  return createRotaryMasterDesign(campaign);
};
var cleanUnresolvedVariables = (content, sampleValues = {}) => {
  if (!content || typeof content !== "string") return content || "";
  let res = content;
  for (const [k, v] of Object.entries(sampleValues)) {
    const regex = new RegExp(`\\{\\{\\s*${k.replace(/\./g, "\\.")}(\\s*\\|\\s*[^}]+)?\\}\\}`, "gi");
    res = res.replace(regex, v);
  }
  res = res.replace(/\{\{\s*[\w\.\-_]+(?:\s*\|\s*([^}]+))\s*\}\}/g, (_match, fallback) => fallback.trim());
  const commonFallbacks = {
    "contact.first_name": "L\xEDder Rotario(a)",
    "contact.name": "L\xEDder Rotario(a)",
    "contact.role": "L\xEDder Rotario",
    "club.name": "su Club",
    "club.type": "Club Rotario",
    "club.city": "su localidad",
    "club.completion_percentage": "0%",
    "club.missing_fields": "Informaci\xF3n institucional y fotograf\xEDas",
    "club.profile_url": "https://app.clubplatform.org/clubes/directorio",
    "club.update_form_url": "https://app.clubplatform.org/clubes/registro",
    "form_url": "https://rotary4281.org/rotary-en-accion",
    "feria_form_url": "https://rotaryprojectfaircolombia.org/rotary-en-accion?canal=feria",
    "activar_club_url": "https://rotary4281.org/activar-mi-club",
    "unsubscribe_url": "#"
  };
  res = res.replace(/\{\{\s*([\w\.\-_]+)\s*\}\}/g, (_match, varName) => {
    const lower = varName.toLowerCase();
    return commonFallbacks[lower] !== void 0 ? commonFallbacks[lower] : "";
  });
  return res;
};
var getRotaryGlobalBlocksCatalog = () => [
  {
    key: "rotary_header",
    name: "Cabecera Institucional Adaptable",
    category: "Cabecera",
    description: "Logo oficial adaptado autom\xE1ticamente a la identidad institucional del sitio activo.",
    isProtected: true
  },
  {
    key: "rotary_areas_focus",
    name: "\xBFQu\xE9 puede compartir tu club en Rotary en Acci\xF3n?",
    category: "Contenido",
    description: "Las 15 categor\xEDas oficiales del formulario p\xFAblico de Rotary en Acci\xF3n en formato compacto y adaptable.",
    isProtected: true
  },
  {
    key: "rotary_signature",
    name: "Firma Oficial Distrital",
    category: "Firmas",
    description: "Firma del Comit\xE9 Distrital de Imagen P\xFAblica y Comunicaciones.",
    isProtected: true
  },
  {
    key: "club_platform_cta",
    name: "CTA Promocional Club Platform",
    category: "Promoci\xF3n",
    description: "Bloque inspirado en Shopify para activar nuevos clubes en Club Platform (global y opcional).",
    isProtected: true
  },
  {
    key: "rotary_footer",
    name: "Footer Institucional Protegido",
    category: "Pie de p\xE1gina",
    description: "Insignias de \xE1reas de inter\xE9s, redes sociales, asistencia WhatsApp y enlace de baja legal.",
    isProtected: true
  }
];
var injectCampaignIntoDesign = (masterDesign, campaign) => {
  const base = normalizeInstitutionalDesign(masterDesign || createRotaryMasterDesign());
  const blocks = base.blocks.map((b) => {
    if (b.isProtected) return { ...b };
    if (b.type === "heading" && (b.label?.includes("T\xEDtulo") || b.level === 1)) {
      return {
        ...b,
        text: campaign.name || b.text
      };
    }
    if (b.type === "text" && (b.label?.includes("Cuerpo") || b.label?.includes("Editable"))) {
      return {
        ...b,
        text: campaign.messageCentral ? `Estimadas rotarias y estimados rotarios:

${campaign.messageCentral}

Los invitamos a ingresar al formulario unificado y postular las evidencias de su club.` : b.text
      };
    }
    if (b.type === "button") {
      const url = campaign.formUrl || `https://app.clubplatform.org/rotary-en-accion?utm_source=email_marketing&utm_medium=campaign&utm_campaign=${campaign.utmCampaign || "rotary_campana"}`;
      return {
        ...b,
        href: url
      };
    }
    return { ...b };
  });
  return {
    ...base,
    blocks
  };
};
export {
  BLOCK_LABELS,
  DEFAULT_DESIGN,
  DEFAULT_FOOTER_SOCIAL_LINKS,
  DEFAULT_SETTINGS,
  FONT_OPTIONS,
  FONT_WEIGHT_OPTIONS,
  LINE_HEIGHT_OPTIONS,
  cleanUnresolvedVariables,
  createChannelCampaignDesign,
  createDirectorioMasterDesign,
  createFeriaMasterDesign,
  createRotaryMasterDesign,
  getActiveSiteBrandingContext,
  getRotaryGlobalBlocksCatalog,
  injectCampaignIntoDesign,
  isRichTextHtml,
  makeBlock,
  newId,
  normalizeInstitutionalDesign,
  parseDesign,
  renderDesignToHtml,
  renderFooterSocialIcons,
  resolveInstitutionalLogo,
  resolveSiteActivarClubUrl,
  resolveSiteRotaryEnAccionUrl,
  sanitizeRichTextHtml,
  textToHtml
};
