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
    serializeSidebarImageWidget,
    normalizeCarouselSettings,
    visibleSidebarSlides,
    resolveSlideLinkTarget,
    DEFAULT_CAROUSEL_SETTINGS,
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

// 8. Carrusel (v4.1273.0)
grupo('8. Carrusel de imágenes: migración, orden, propiedades y configuración');

// 8.1 Migración de un evento existente de UNA imagen
const legacy = {
    enabled: true,
    imageUrl: 'https://cdn.rotary.org/vestuario.jpg',
    title: 'Código de vestuario',
    showTitle: true,
    altText: 'Vestuario casual rotario',
    linkUrl: 'https://rotary4281.org/guia',
    openInNewTab: true,
};
const migrated = normalizeSidebarImageWidget(legacy);
check('un widget heredado se lee como lista de UNA imagen', migrated?.images?.length === 1);
check('la imagen migrada conserva URL, alt, enlace y destino',
    migrated?.images?.[0]?.imageUrl === legacy.imageUrl &&
    migrated?.images?.[0]?.altText === legacy.altText &&
    migrated?.images?.[0]?.linkUrl === legacy.linkUrl &&
    migrated?.images?.[0]?.openInNewTab === true &&
    migrated?.images?.[0]?.enabled === true);
check('la migración conserva título y «Visualización activa»', migrated?.title === 'Código de vestuario' && migrated?.showTitle === true && migrated?.enabled === true);
check('la migración aplica la configuración predeterminada del carrusel',
    JSON.stringify(migrated?.carousel) === JSON.stringify(DEFAULT_CAROUSEL_SETTINGS));
check('un widget heredado sigue siendo visible', hasVisibleSidebarImageWidget(migrated));
check('un widget heredado pausado sigue pausado', !hasVisibleSidebarImageWidget(normalizeSidebarImageWidget({ ...legacy, enabled: false })));

const legacyDraft = draftSidebarImageWidget(legacy);
check('el borrador del editor migra la imagen heredada sin perderla',
    legacyDraft.images.length === 1 && legacyDraft.images[0].imageUrl === legacy.imageUrl && legacyDraft.images[0].altText === legacy.altText);
const legacySaved = serializeSidebarImageWidget(legacyDraft);
check('al guardar, queda en el esquema nuevo (images + carousel)', Array.isArray(legacySaved.images) && legacySaved.images.length === 1 && legacySaved.carousel?.autoplay === true);
check('al guardar, el reflejo heredado sigue apuntando a la imagen', legacySaved.imageUrl === legacy.imageUrl && legacySaved.linkUrl === legacy.linkUrl);
check('guardar y volver a leer es estable (idempotente)',
    JSON.stringify(normalizeSidebarImageWidget(legacySaved)) === JSON.stringify(normalizeSidebarImageWidget(serializeSidebarImageWidget(draftSidebarImageWidget(legacySaved)))));

// 8.2 Varias imágenes con propiedades propias
const multi = {
    enabled: true,
    images: [
        { id: 'a', imageUrl: 'https://cdn.rotary.org/1.jpg', altText: 'Uno', linkUrl: '/registro', openInNewTab: false, enabled: true },
        { id: 'b', imageUrl: 'https://cdn.rotary.org/2.jpg', altText: 'Dos', enabled: false },
        { id: 'c', imageUrl: 'javascript:alert(1)', enabled: true },
        { id: 'd', imageUrl: 'https://cdn.rotary.org/4.jpg', altText: 'Cuatro', linkUrl: 'www.patrocinador.com', openInNewTab: true, enabled: true },
    ],
    carousel: { autoplay: false, intervalMs: 8000, transition: 'slide', transitionMs: 800, showArrows: false, showDots: true, loop: false, pauseOnInteraction: false },
};
const multiNorm = normalizeSidebarImageWidget(multi);
check('descarta imágenes con URL insegura', multiNorm?.images?.length === 3 && !multiNorm.images.some(i => i.id === 'c'));
check('conserva el orden configurado', multiNorm?.images?.map(i => i.id).join(',') === 'a,b,d');
check('cada imagen conserva su alt y su enlace',
    multiNorm?.images?.[0]?.altText === 'Uno' && multiNorm?.images?.[0]?.linkUrl === '/registro' &&
    multiNorm?.images?.[2]?.linkUrl === 'https://www.patrocinador.com' && multiNorm?.images?.[2]?.openInNewTab === true);
check('cada imagen conserva su estado activa/inactiva', multiNorm?.images?.[1]?.enabled === false);
check('el sitio público muestra sólo las activas, en orden', visibleSidebarSlides(multiNorm).map(i => i.id).join(',') === 'a,d');
check('conserva la configuración del carrusel guardada', JSON.stringify(multiNorm?.carousel) === JSON.stringify(multi.carousel));
check('el reflejo heredado es la primera imagen activa', multiNorm?.imageUrl === 'https://cdn.rotary.org/1.jpg');

const allOff = normalizeSidebarImageWidget({ enabled: true, images: [{ id: 'x', imageUrl: 'https://cdn.rotary.org/x.jpg', enabled: false }] });
check('si todas las imágenes están inactivas, el widget no se muestra', allOff !== null && !hasVisibleSidebarImageWidget(allOff));
check('la lista `images` manda sobre el imageUrl heredado', normalizeSidebarImageWidget({ imageUrl: 'https://cdn.rotary.org/viejo.jpg', images: [] }) === null);

// 8.3 Configuración del carrusel: predeterminados y límites
const defs = normalizeCarouselSettings(undefined);
check('predeterminados: autoplay, 5 s, fade, 500 ms, flechas, puntos, continua, pausa',
    defs.autoplay === true && defs.intervalMs === 5000 && defs.transition === 'fade' && defs.transitionMs === 500 &&
    defs.showArrows === true && defs.showDots === true && defs.loop === true && defs.pauseOnInteraction === true);
const clamped = normalizeCarouselSettings({ intervalMs: 10, transitionMs: 999999, transition: 'zoom' });
check('el intervalo se acota a un mínimo razonable', clamped.intervalMs === 2000);
check('la duración de transición se acota a un máximo', clamped.transitionMs === 3000);
check('una transición desconocida vuelve a fade', clamped.transition === 'fade');
check('valores no numéricos vuelven al predeterminado', normalizeCarouselSettings({ intervalMs: 'abc' }).intervalMs === 5000);

// 8.4 Aislamiento entre eventos: el borrador no comparte objetos
const d1 = draftSidebarImageWidget(null);
const d2 = draftSidebarImageWidget(null);
d1.carousel.autoplay = false;
check('cada evento parte de su propia copia de la configuración', d2.carousel.autoplay === true && DEFAULT_CAROUSEL_SETTINGS.autoplay === true);

// 8.5 Destino de los enlaces individuales
check('enlace interno abre en la misma pestaña', resolveSlideLinkTarget('/registro', false).target === '_self');
check('enlace externo sin preferencia abre en pestaña nueva', resolveSlideLinkTarget('https://x.org', false).target === '_blank');
check('pestaña nueva lleva rel noopener', resolveSlideLinkTarget('/x', true).rel === 'noopener noreferrer');

// 8.6 Cableado del carrusel
const widgetSrc = readFileSync('src/components/EventSidebarImageWidget.tsx', 'utf8');
const editorSrc = readFileSync('src/components/admin/events/EventWidgetsEditor.tsx', 'utf8');
const carouselSrc = readFileSync('src/components/EventSidebarImageCarousel.tsx', 'utf8');
check('el sitio público usa EventSidebarImageCarousel', widgetSrc.includes('<EventSidebarImageCarousel'));
check('la vista previa usa EL MISMO carrusel', editorSrc.includes('<EventSidebarImageCarousel'));
check('el editor ofrece «Configuración del carrusel»', editorSrc.includes('Configuración del carrusel'));
check('el editor sube varias imágenes a la vez', /type="file"\s+multiple/.test(editorSrc));
check('el carrusel respeta prefers-reduced-motion', carouselSrc.includes('prefers-reduced-motion'));
check('el carrusel carga diferido las imágenes', carouselSrc.includes("'lazy'"));
// v4.1274.0 — reporte: «la reproducción automática no funciona»
const autoplayLine = carouselSrc.split('\n').find(l => l.includes('const autoplayRunning')) || '';
check('el movimiento reducido NO apaga la reproducción automática', autoplayLine && !autoplayLine.includes('reducedMotion'), autoplayLine.trim());
check('sólo el foco de teclado pausa (un clic en una flecha no deja el carrusel pausado)',
    carouselSrc.includes("matches(':focus-visible')") && !carouselSrc.includes('onFocus={() => setFocused(true)}'));
check('el carrusel expone su estado en data-autoplay', carouselSrc.includes('data-autoplay='));

console.log(`\n────────────────────────────────────────────────────────────`);
if (malos.length === 0) {
    console.log(`✅ ${ok}/${ok} comprobaciones del sistema de widgets en verde.\n`);
    process.exit(0);
} else {
    console.error(`❌ ${malos.length} comprobaciones fallidas.`);
    process.exit(1);
}

