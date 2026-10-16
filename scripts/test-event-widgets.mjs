// ════════════════════════════════════════════════════════════════════
// Widgets de un evento — pruebas de normalización y seguridad — v4.1207.0
//
// Sin base de datos ni red: se prueba qué se valida, qué se sanitiza
// y qué se rechaza para el widget de imagen lateral y widgets futuros.
//
//   node scripts/test-event-widgets.mjs
// ════════════════════════════════════════════════════════════════════
import { build } from 'esbuild';

const out = await build({
    entryPoints: ['src/lib/eventWidgets.ts'],
    bundle: true, write: false, format: 'esm', platform: 'neutral',
});
const mod = await import(`data:text/javascript,${encodeURIComponent(out.outputFiles[0].text)}`);
const {
    sanitizeImageUrl,
    sanitizeLinkUrl,
    normalizeSidebarImageWidget,
    hasVisibleSidebarImageWidget,
    extractSidebarImageWidget,
    draftSidebarImageWidget,
} = mod;

let ok = 0; const malos = [];
const check = (n, c, e = '') => {
    if (c) { ok++; console.log(`  ✓ ${n}`); }
    else { malos.push(n); console.log(`  ✗ ${n}${e ? ` — ${e}` : ''}`); }
};
const grupo = t => console.log(`\n${t}`);

// 1. Sanitización de imágenes
grupo('1. Sanitización de URLs de imagen');
check('admite URLs https', sanitizeImageUrl('https://ejemplo.com/poster.jpg') === 'https://ejemplo.com/poster.jpg');
check('admite URLs http', sanitizeImageUrl('http://ejemplo.com/poster.webp') === 'http://ejemplo.com/poster.webp');
check('admite rutas relativas locales', sanitizeImageUrl('/uploads/events/dress-code.png') === '/uploads/events/dress-code.png');
check('admite data:image/png', sanitizeImageUrl('data:image/png;base64,iVBORw0KGgo=') === 'data:image/png;base64,iVBORw0KGgo=');
check('admite blob: URLs', sanitizeImageUrl('blob:http://localhost:5173/uuid-123') === 'blob:http://localhost:5173/uuid-123');
check('rechaza javascript:', sanitizeImageUrl('javascript:alert(1)') === '');
check('rechaza data:text/html', sanitizeImageUrl('data:text/html,<script>alert(1)</script>') === '');
check('rechaza cadenas vacías', sanitizeImageUrl('   ') === '');
check('rechaza null o undefined', sanitizeImageUrl(null) === '' && sanitizeImageUrl(undefined) === '');

// 2. Sanitización de enlaces
grupo('2. Sanitización de enlaces');
check('admite enlace https', sanitizeLinkUrl('https://rotary4281.org/inscripcion') === 'https://rotary4281.org/inscripcion');
check('admite enlace interno relativo', sanitizeLinkUrl('/eventos/villavicencio2027/registro') === '/eventos/villavicencio2027/registro');
check('antepone https:// a direcciones con www.', sanitizeLinkUrl('www.rotary4281.org') === 'https://www.rotary4281.org');
check('admite mailto:', sanitizeLinkUrl('mailto:info@rotary4281.org') === 'mailto:info@rotary4281.org');
check('rechaza javascript:', sanitizeLinkUrl('javascript:void(0)') === '');

// 3. Normalización del widget de imagen lateral
grupo('3. Normalización del widget de imagen lateral');
const validWidget = {
    enabled: true,
    imageUrl: 'https://cdn.rotary.org/dresscode-1080x1350.webp',
    title: 'Código de vestuario',
    showTitle: true,
    altText: 'Código de vestuario oficial de la Conferencia',
    linkUrl: 'https://rotary4281.org/guia',
    openInNewTab: true,
};
const norm = normalizeSidebarImageWidget(validWidget);
check('normaliza campos completos correctamente', norm !== null);
check('conserva URL de imagen', norm?.imageUrl === 'https://cdn.rotary.org/dresscode-1080x1350.webp');
check('conserva estado enabled', norm?.enabled === true);
check('conserva título', norm?.title === 'Código de vestuario');
check('conserva showTitle', norm?.showTitle === true);
check('conserva altText', norm?.altText === 'Código de vestuario oficial de la Conferencia');
check('conserva linkUrl', norm?.linkUrl === 'https://rotary4281.org/guia');
check('conserva openInNewTab', norm?.openInNewTab === true);

// Retrocompatibilidad con nombres alternativos (url, link, alt)
const altWidget = normalizeSidebarImageWidget({
    url: 'https://cdn.rotary.org/afiche.png',
    link: '/registro',
    alt: 'Afiche oficial',
});
check('soporta claves alternativas (url, link, alt)',
    altWidget?.imageUrl === 'https://cdn.rotary.org/afiche.png' &&
    altWidget?.linkUrl === '/registro' &&
    altWidget?.altText === 'Afiche oficial');
check('enabled es true por defecto si no es explícitamente false', altWidget?.enabled === true);
check('showTitle es false por defecto', altWidget?.showTitle === false);

// Casos inválidos
check('objeto nulo o undefined devuelve null', normalizeSidebarImageWidget(null) === null);
check('objeto sin imagen devuelve null', normalizeSidebarImageWidget({ title: 'Solo título' }) === null);
check('objeto con imagen vacía devuelve null', normalizeSidebarImageWidget({ imageUrl: '   ' }) === null);

// 4. Visibilidad del widget
grupo('4. Evaluación de visibilidad hasVisibleSidebarImageWidget');
check('visible cuando tiene imagen y enabled es true', hasVisibleSidebarImageWidget(validWidget));
check('NO visible cuando enabled es false', !hasVisibleSidebarImageWidget({ ...validWidget, enabled: false }));
check('NO visible cuando imageUrl está vacía', !hasVisibleSidebarImageWidget({ enabled: true, imageUrl: '' }));
check('NO visible cuando es null o undefined', !hasVisibleSidebarImageWidget(null) && !hasVisibleSidebarImageWidget(undefined));

// 5. Extracción desde metadata del evento
grupo('5. Extracción desde metadata del evento');
const metadataCanonical = {
    venue: { name: 'Hotel Sonesta' },
    widgets: {
        sidebarImage: validWidget,
    },
};
const extCanonical = extractSidebarImageWidget(metadataCanonical);
check('extrae desde metadata.widgets.sidebarImage', extCanonical?.imageUrl === validWidget.imageUrl);

const metadataLegacy = {
    venue: { name: 'Hotel Sonesta' },
    sidebarImage: validWidget,
};
const extLegacy = extractSidebarImageWidget(metadataLegacy);
check('extrae retrocompatible desde metadata.sidebarImage', extLegacy?.imageUrl === validWidget.imageUrl);
check('metadata sin widget devuelve null', extractSidebarImageWidget({ venue: {} }) === null);

// 6. Generación de borrador para el editor
grupo('6. Borrador para el editor draftSidebarImageWidget');
const emptyDraft = draftSidebarImageWidget(null);
check('borrador vacío tiene tipos consistentes y cadenas no nulas',
    emptyDraft.enabled === true &&
    emptyDraft.imageUrl === '' &&
    emptyDraft.title === '' &&
    emptyDraft.showTitle === false &&
    emptyDraft.altText === '' &&
    emptyDraft.linkUrl === '' &&
    emptyDraft.openInNewTab === false);

const filledDraft = draftSidebarImageWidget({
    imageUrl: 'https://cdn.rotary.org/test.jpg',
    enabled: false,
    title: 'Mi Título',
    showTitle: true,
    openInNewTab: true,
});
check('borrador prellena datos existentes conservando flags',
    filledDraft.enabled === false &&
    filledDraft.imageUrl === 'https://cdn.rotary.org/test.jpg' &&
    filledDraft.title === 'Mi Título' &&
    filledDraft.showTitle === true &&
    filledDraft.openInNewTab === true);

// 7. Cableado en el Servidor y Frontend
grupo('7. Cableado estructural en Servidor y Frontend');
import { readFileSync } from 'node:fs';

const detalleSrc = readFileSync('src/pages/EventoDetalle.tsx', 'utf8');
check('EventoDetalle importa EventSidebarImageWidget',
    detalleSrc.includes("import EventSidebarImageWidget from '../components/EventSidebarImageWidget'"));
check('EventoDetalle renderiza EventSidebarImageWidget en la barra lateral',
    detalleSrc.includes('<EventSidebarImageWidget'));

const adminEventsSrc = readFileSync('src/pages/admin/Events.tsx', 'utf8');
check('Events.tsx incluye widgets en EventTab y TAB_CAPABILITY',
    adminEventsSrc.includes("'widgets'") && adminEventsSrc.includes("widgets: 'media'"));
check('Events.tsx importa EventWidgetsEditor',
    adminEventsSrc.includes("import EventWidgetsEditor from '../../components/admin/events/EventWidgetsEditor'"));
check('Events.tsx renderiza EventWidgetsEditor en la pestaña widgets',
    adminEventsSrc.includes('<EventWidgetsEditor'));

const calendarSrc = readFileSync('server/routes/calendar.js', 'utf8');
check('calendar.js preserva metadata.widgets al actualizar evento',
    calendarSrc.includes("puede('info') || puede('media')"));

console.log(`\n────────────────────────────────────────────────────────────`);
if (malos.length === 0) {
    console.log(`✅ ${ok}/${ok} comprobaciones del sistema de widgets en verde.\n`);
    process.exit(0);
} else {
    console.error(`❌ ${malos.length} comprobaciones fallidas.`);
    process.exit(1);
}

