// ════════════════════════════════════════════════════════════════════
// «Hoteles de la conferencia» — pruebas del CRITERIO — v4.1275.0
//
// Sin base, sin red y sin S3: se prueba qué se publica, qué se rechaza, cómo
// se sella el historial, que cada evento tenga su propio almacenamiento, qué
// se puede liberar y que la sección quede EXACTAMENTE entre el carrusel de
// fotos y el contenido HTML de la ficha.
//
//   npm run test:event-hotels
// ════════════════════════════════════════════════════════════════════
import { readFileSync } from 'node:fs';
import {
    HOTEL_LIMITS, DEFAULT_HOTELS_TITLE, suggestedHotelsDescription, declaredImageFormat, isPdfName,
    sniffImageFormat, inspectPdfBytes, checkSlideDimensions, sanitizeHotelUrl, normalizeHotelsConfig,
    draftHotelsConfig, visibleHotelSlides, publicHotelsView, extractPublicHotels, stripPrivateHotelsFields,
    diffHotelsConfig, stampHotelsUpdate, hotelsPublicPrefix, hotelsIncomingPrefix, incomingKeyBelongs,
    referencedHotelUrls, orphanHotelObjects, formatBytes, formatRatesDate,
} from '../server/lib/eventHotels.js';

let ok = 0; const malos = [];
const check = (n, c, e = '') => {
    if (c) { ok++; console.log(`  ✓ ${n}`); }
    else { malos.push(n); console.log(`  ✗ ${n}${e ? ` — ${e}` : ''}`); }
};
const grupo = t => console.log(`\n${t}`);

const VILLAVO = 'f3a1c2d4-0000-4000-8000-villavicencio';
const OTRO = 'a9b8c7d6-0000-4000-8000-otroevento00';
const S3 = 'https://rotary-platform-assets.s3.us-east-1.amazonaws.com/';
const slide = (n, extra = {}) => ({
    id: `hs-${n}`,
    imageUrl: `${S3}events/hotels/${VILLAVO}/slides/${n}.webp`,
    mediumUrl: `${S3}events/hotels/${VILLAVO}/slides/${n}-md.webp`,
    thumbUrl: `${S3}events/hotels/${VILLAVO}/slides/${n}-thumb.webp`,
    width: 2400, height: 1350, altText: `Hotel ${n}`, enabled: true, ...extra,
});
const CONFIG = {
    enabled: true,
    title: 'Hoteles de la conferencia',
    description: 'Conoce las opciones de alojamiento.',
    slides: [slide(1), slide(2), slide(3)],
    showThumbnails: true,
    allowDownload: true,
    document: { url: `${S3}events/hotels/${VILLAVO}/docs/abc/guia.pdf`, fileName: 'guia.pdf', sizeBytes: 3_400_000 },
    ratesUpdatedOn: '2026-11-03',
};

// 1. Lo que se publica
grupo('1. Página pública: cuándo existe la sección');
const v = publicHotelsView(CONFIG);
check('activa y con diapositivas → se publica', v && v.slides.length === 3);
check('título por defecto «Hoteles de la conferencia»', DEFAULT_HOTELS_TITLE === 'Hoteles de la conferencia' && normalizeHotelsConfig({ slides: [] }).title === 'Hoteles de la conferencia');
check('apagada → null (no se pinta el contenedor)', publicHotelsView({ ...CONFIG, enabled: false }) === null);
check('sin diapositivas → null (nunca un contenedor vacío)', publicHotelsView({ ...CONFIG, slides: [] }) === null);
check('todas inactivas → null', publicHotelsView({ ...CONFIG, slides: CONFIG.slides.map(s => ({ ...s, enabled: false })) }) === null);
check('un evento SIN configurar → null (los anteriores no cambian)', extractPublicHotels({ venue: { name: 'X' } }) === null && extractPublicHotels(null) === null);
check('las inactivas no se publican y el orden se respeta',
    publicHotelsView({ ...CONFIG, slides: [slide(3), slide(1, { enabled: false }), slide(2)] }).slides.map(s => s.id).join() === 'hs-3,hs-2');
check('descarga: permitida Y con archivo → botón', v.download && v.download.fileName === 'guia.pdf');
check('descarga desactivada → sin botón aunque haya archivo', publicHotelsView({ ...CONFIG, allowDownload: false }).download === null);
check('descarga permitida sin archivo → sin botón', publicHotelsView({ ...CONFIG, document: null }).download === null);
check('una sola diapositiva → sin miniaturas', publicHotelsView({ ...CONFIG, slides: [slide(1)] }).showThumbnails === false);
check('miniaturas apagadas por el administrador', publicHotelsView({ ...CONFIG, showThumbnails: false }).showThumbnails === false);
check('fecha de tarifas viaja', v.ratesUpdatedOn === '2026-11-03');
check('la fecha de tarifas se escribe sin correrse de día', /3 de noviembre de 2026/.test(formatRatesDate('2026-11-03')));

// 2. Saneamiento
grupo('2. Saneamiento de lo que se guarda');
check('admite https', sanitizeHotelUrl('https://x.org/a.webp') === 'https://x.org/a.webp');
check('admite ruta propia', sanitizeHotelUrl('/uploads/a.png') === '/uploads/a.png');
check('rechaza javascript:', sanitizeHotelUrl('javascript:alert(1)') === '');
check('rechaza data:', sanitizeHotelUrl('data:image/png;base64,AAA') === '');
check('rechaza blob: (no sobrevive a la pestaña)', sanitizeHotelUrl('blob:https://x/1') === '');
check('rechaza //otro-dominio', sanitizeHotelUrl('//evil.example/a.png') === '');
const sucia = normalizeHotelsConfig({
    enabled: 'true', title: '  ', description: 'x'.repeat(5000),
    slides: [{ imageUrl: 'javascript:1' }, { id: 'a"b<c>', imageUrl: 'https://x/a.png', altText: 'A\nB' }, { id: 'dup', imageUrl: 'https://x/b.png' }, { id: 'dup', imageUrl: 'https://x/c.png' }],
    ratesUpdatedOn: '2026-13-45', document: { url: 'javascript:1' },
});
check('enabled sólo con true literal', sucia.enabled === false);
check('título vacío → el predeterminado', sucia.title === DEFAULT_HOTELS_TITLE);
check('descripción con tope', sucia.description.length === HOTEL_LIMITS.descriptionMax);
check('diapositiva con URL maliciosa descartada', sucia.slides.length === 3);
check('id saneado', sucia.slides[0].id === 'abc');
check('alt en una línea', sucia.slides[0].altText === 'A B');
check('ids duplicados se desambiguan', new Set(sucia.slides.map(s => s.id)).size === 3);
check('fecha inválida descartada', sucia.ratesUpdatedOn === '');
check('documento con URL maliciosa descartado', sucia.document === null);
check(`tope de ${HOTEL_LIMITS.maxSlides} diapositivas`,
    normalizeHotelsConfig({ slides: Array.from({ length: 60 }, (_, i) => ({ id: `s${i}`, imageUrl: `https://x/${i}.png` })) }).slides.length === HOTEL_LIMITS.maxSlides);
check('el historial y los sellos NO salen de la normalización', !('history' in normalizeHotelsConfig({ ...CONFIG, history: [{}], updatedBy: { name: 'x' } })));

// 3. Borrador del panel
grupo('3. Borrador del panel');
const nuevo = draftHotelsConfig(undefined, 'XIII Conferencia Rotaria del Distrito 4281');
check('un evento sin la sección arranca OCULTO', nuevo.enabled === false && nuevo.slides.length === 0);
check('con el texto sugerido que nombra al evento', nuevo.description.includes('XIII Conferencia Rotaria del Distrito 4281'));
check('texto sugerido genérico sin nombre', suggestedHotelsDescription('').includes('para el evento'));
check('el borrador conserva la configuración existente', draftHotelsConfig(CONFIG).slides.length === 3);

// 4. Tipos de archivo por sus BYTES
grupo('4. Tipo real de archivo');
const jpg = Uint8Array.from([0xFF, 0xD8, 0xFF, 0xE0, 0, 0x10, 0x4A, 0x46, 0x49, 0x46, 0, 1]);
const png = Uint8Array.from([0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A, 0, 0, 0, 0x0D]);
const webp = Uint8Array.from([0x52, 0x49, 0x46, 0x46, 1, 2, 3, 4, 0x57, 0x45, 0x42, 0x50]);
const gif = new TextEncoder().encode('GIF89a......');
const html = new TextEncoder().encode('<html><script>alert(1)</script></html>');
check('JPEG', sniffImageFormat(jpg) === 'jpeg');
check('PNG', sniffImageFormat(png) === 'png');
check('WebP', sniffImageFormat(webp) === 'webp');
check('GIF rechazado', sniffImageFormat(gif) === null);
check('HTML disfrazado de .jpg rechazado', sniffImageFormat(html) === null);
check('declarado por extensión', declaredImageFormat('hotel.JPG', '') === 'jpeg' && declaredImageFormat('a.webp', 'application/octet-stream') === 'webp');
check('PDF no es imagen declarada', declaredImageFormat('guia.pdf', 'application/pdf') === null && isPdfName('guia.pdf', ''));
const pdf = (body) => new TextEncoder().encode(`%PDF-1.7\n${body}\n%%EOF\n`);
check('PDF válido', inspectPdfBytes(pdf('1 0 obj << /Type /Catalog >> endobj')).ok === true);
check('PDF con /JavaScript rechazado', inspectPdfBytes(pdf('<< /S /JavaScript /JS (app.alert(1)) >>')).reason === 'active_content');
check('PDF con /Launch rechazado', inspectPdfBytes(pdf('<< /S /Launch /F (cmd.exe) >>')).reason === 'active_content');
check('PDF con adjunto rechazado', inspectPdfBytes(pdf('<< /Type /EmbeddedFile >>')).reason === 'active_content');
check('PDF truncado rechazado', inspectPdfBytes(new TextEncoder().encode('%PDF-1.7\n1 0 obj ...')).reason === 'truncated');
check('ZIP disfrazado de PDF rechazado', inspectPdfBytes(Uint8Array.from([0x50, 0x4B, 3, 4, ...new Array(40).fill(0)])).reason === 'not_pdf');

// 5. Dimensiones
grupo('5. Dimensiones legibles');
check('1920×1080 sirve', checkSlideDimensions(1920, 1080).ok);
check('1080×1350 (vertical) sirve', checkSlideDimensions(1080, 1350).ok);
check('640×360 es muy pequeña', checkSlideDimensions(640, 360).reason === 'too_small');
check('banda 3000×200 rechazada', checkSlideDimensions(3000, 200).reason === 'too_small');
check('bomba de píxeles rechazada', checkSlideDimensions(20000, 20000).reason === 'too_large');
check('sin dimensiones rechazada', checkSlideDimensions(0, 0).reason === 'unreadable');

// 6. Historial sellado por el servidor
grupo('6. Historial de cambios');
const yo = { id: 'u1', email: 'admin@rotary4281.org', role: 'district_admin' };
const t1 = new Date('2026-11-03T15:00:00Z');
const primero = stampHotelsUpdate(undefined, CONFIG, yo, t1);
check('primera configuración sellada', primero.updatedAt === t1.toISOString() && primero.updatedBy.name === 'admin@rotary4281.org');
check('primera entrada describe lo hecho', primero.history[0].changes.includes('Configuró la sección de hoteles') && primero.history[0].changes.includes('Publicó la sección'));
const igual = stampHotelsUpdate(primero, { ...CONFIG }, { id: 'u2', email: 'otro@x' }, new Date('2026-11-04T00:00:00Z'));
check('guardar sin cambios NO sella ni agrega historial', igual.updatedAt === primero.updatedAt && igual.history.length === 1 && igual.updatedBy.id === 'u1');
const falsificado = stampHotelsUpdate(primero, { ...CONFIG, history: [{ at: 'x', changes: ['falso'] }], updatedAt: '1999-01-01', updatedBy: { name: 'Otro' } }, yo, t1);
check('el historial que manda el navegador se IGNORA', falsificado.history.length === 1 && falsificado.updatedAt === primero.updatedAt && falsificado.updatedBy.name === 'admin@rotary4281.org');
const t2 = new Date('2026-11-05T10:00:00Z');
const reordenado = stampHotelsUpdate(primero, { ...CONFIG, slides: [slide(2), slide(1), slide(3)] }, yo, t2);
check('reordenar se registra', reordenado.history[0].changes.includes('Cambió el orden de las diapositivas') && reordenado.history.length === 2);
const d = diffHotelsConfig(CONFIG, {
    ...CONFIG, enabled: false, title: 'Alojamiento',
    slides: [slide(1, { imageUrl: `${S3}events/hotels/${VILLAVO}/slides/9.webp`, altText: 'nuevo' }), slide(2, { enabled: false }), slide(4)],
    allowDownload: false, document: null, ratesUpdatedOn: '',
});
for (const frase of ['Ocultó la sección', 'Cambió el título a «Alojamiento»', 'Agregó 1 diapositiva(s)', 'Eliminó 1 diapositiva(s)',
    'Reemplazó 1 diapositiva(s)', 'Editó el texto alternativo de 1 diapositiva(s)', 'Desactivó 1 diapositiva(s)',
    'Desactivó la descarga de la guía', 'Quitó la guía descargable', 'Quitó la fecha de actualización de tarifas']) {
    check(`diff: «${frase}»`, d.includes(frase), d.join(' | '));
}
check(`historial con tope de ${HOTEL_LIMITS.historyMax}`, (() => {
    let h = primero;
    for (let i = 0; i < 70; i++) h = stampHotelsUpdate(h, { ...CONFIG, title: `T${i}` }, yo, new Date(t1.getTime() + i * 1000));
    return h.history.length === HOTEL_LIMITS.historyMax && h.history[0].changes[0] === 'Cambió el título a «T69»';
})());
check('sin `hotels` entrante no se escribe la clave', stampHotelsUpdate(primero, undefined, yo) === undefined);
const publico = stripPrivateHotelsFields({ venue: { a: 1 }, hotels: primero });
check('la ficha pública no recibe historial ni autor', !('history' in publico.hotels) && !('updatedBy' in publico.hotels) && publico.hotels.slides.length === 3 && publico.venue.a === 1);
check('metadata sin hoteles queda igual', JSON.stringify(stripPrivateHotelsFields({ venue: 1 })) === '{"venue":1}');

// 7. Almacenamiento por evento
grupo('7. Archivos: cada evento el suyo');
check('prefijo público por evento', hotelsPublicPrefix(VILLAVO) === `events/hotels/${VILLAVO}/` && hotelsPublicPrefix(VILLAVO) !== hotelsPublicPrefix(OTRO));
check('prefijo de recepción PRIVADO', hotelsIncomingPrefix(VILLAVO).startsWith('private/'));
check('el id del evento no puede escapar del prefijo', hotelsPublicPrefix('../../x') === 'events/hotels/x/');
check('subida propia reconocida', incomingKeyBelongs(`${hotelsIncomingPrefix(VILLAVO)}abc.jpg`, VILLAVO));
check('subida de OTRO evento rechazada', !incomingKeyBelongs(`${hotelsIncomingPrefix(OTRO)}abc.jpg`, VILLAVO));
check('clave con .. rechazada', !incomingKeyBelongs(`${hotelsIncomingPrefix(VILLAVO)}../../events/x.jpg`, VILLAVO));
check('clave de la Biblioteca rechazada', !incomingKeyBelongs('clubs/abc/images/foto.jpg', VILLAVO));
check('referencias: diapositivas (3 tamaños) + guía', referencedHotelUrls(CONFIG).length === 10);

grupo('8. Archivos sin uso: liberación controlada');
const ahora = Date.parse('2026-11-10T00:00:00Z');
const viejo = '2026-11-01T00:00:00Z';
const objetos = [
    { key: `events/hotels/${VILLAVO}/slides/1.webp`, lastModified: viejo, size: 100 },   // en uso
    { key: `events/hotels/${VILLAVO}/slides/old.webp`, lastModified: viejo, size: 200 }, // reemplazada
    { key: `events/hotels/${VILLAVO}/slides/new.webp`, lastModified: '2026-11-09T20:00:00Z', size: 300 }, // recién subida
    { key: `events/hotels/${OTRO}/slides/x.webp`, lastModified: viejo, size: 400 },     // de OTRO evento
    { key: 'clubs/abc/images/foto.jpg', lastModified: viejo, size: 500 },               // Biblioteca
];
const texto = JSON.stringify(CONFIG);
const huerfanos = orphanHotelObjects(objetos, VILLAVO, texto, { nowMs: ahora });
check('sólo la reemplazada se libera', huerfanos.length === 1 && huerfanos[0].key.endsWith('old.webp'), huerfanos.map(o => o.key).join());
check('lo recién subido (sin guardar) se conserva 24 h', !huerfanos.some(o => o.key.endsWith('new.webp')));
check('nunca otro evento ni la Biblioteca', !huerfanos.some(o => o.key.includes(OTRO) || o.key.startsWith('clubs/')));
check('referenciada desde OTRO texto (p. ej. el HTML) se conserva',
    orphanHotelObjects(objetos, VILLAVO, `${texto} <img src="${S3}events/hotels/${VILLAVO}/slides/old.webp">`, { nowMs: ahora }).length === 0);
check('formatBytes', formatBytes(3_400_000) === '3,2 MB' && formatBytes(2048) === '2 KB' && formatBytes(0) === '');

// 9. Integración: posición en la ficha, pestaña, rutas y permisos
grupo('9. Integración');
const ficha = readFileSync('src/pages/EventoDetalle.tsx', 'utf8');
const iGaleria = ficha.indexOf('<MediaGallery');
const iHoteles = ficha.indexOf('<EventHotelsSection');
const iHtml = ficha.indexOf('dangerouslySetInnerHTML={{ __html: event.htmlContent }}');
check('ficha: carrusel de fotos → Hoteles → contenido HTML', iGaleria > 0 && iHoteles > iGaleria && iHtml > iHoteles);
const columnaPrincipal = ficha.slice(ficha.indexOf('{/* Main content */}'), ficha.indexOf('{/* Sidebar info */}'));
check('ficha: va en la columna principal, no en la lateral', columnaPrincipal.includes('<EventHotelsSection'));
const panel = readFileSync('src/pages/admin/Events.tsx', 'utf8');
check('panel: pestaña «🏨 Hoteles y alojamiento»', panel.includes("hoteles: '🏨 Hoteles y alojamiento'"));
check('panel: la gobierna la capacidad de Multimedia', panel.includes("hoteles: 'media'"));
check('panel: la pestaña está en la lista de pestañas', /'widgets', 'hoteles', 'metadata'/.test(panel));
check('panel: guarda en metadata.hotels del evento', /\{ \.\.\.event\.metadata, hotels \}/.test(panel));
const rutas = readFileSync('server/routes/calendar.js', 'utf8');
for (const r of ["post('/events/:id/hotels/presign'", "post('/events/:id/hotels/slides'", "post('/events/:id/hotels/document'",
    "get('/events/:id/hotels/orphans'", "delete('/events/:id/hotels/orphans'"]) {
    check(`ruta ${r} con sesión`, rutas.includes(`router.${r}, authMiddleware`));
}
check('PUT del evento sella los hoteles', rutas.includes('stampHotelsUpdate(actual.metadata?.hotels, metadata.hotels, req.user)'));
check('un alcance acotado: `hotels` es de Multimedia', rutas.includes("media: ['video', 'hotels']"));
const ctrl = readFileSync('server/controllers/eventHotelsController.js', 'utf8');
check('controlador: exige la capacidad media sobre ESE evento', ctrl.includes("assertEventCapability(req, req.params.id, 'media')"));
check('controlador: juzga el tipo por los bytes', ctrl.includes('sniffImageFormat(buffer)') && ctrl.includes('inspectPdfBytes(buffer)'));
check('controlador: tope de píxeles al decodificar', ctrl.includes('limitInputPixels'));
check('controlador: no postprocesa más allá de optimizar (sin recortes)', ctrl.includes("fit: 'inside'") && ctrl.includes('withoutEnlargement: true') && !/fit:\s*'cover'/.test(ctrl));
const clubs = readFileSync('server/routes/clubs.js', 'utf8');
check('endpoints públicos sin historial', (clubs.match(/stripPrivateHotelsFields\(/g) || []).length === 2);
const seccion = readFileSync('src/components/EventHotelsSection.tsx', 'utf8');
check('visor: object-contain (nunca recorta)', seccion.includes('object-contain') && !seccion.includes('object-cover'));
check('visor: sin reproducción automática', !/setInterval|autoplay/i.test(seccion.replace(/\/\/.*$/gm, '')));
check('visor: indicador «Diapositiva n de N»', /Diapositiva <span[^>]*>\{safeIndex \+ 1\}<\/span> de \{total\}/.test(seccion));
const lightbox = readFileSync('src/components/EventHotelsLightbox.tsx', 'utf8');
check('ampliada: teclado ← → Esc', lightbox.includes("'ArrowRight'") && lightbox.includes("'ArrowLeft'") && lightbox.includes("'Escape'"));
check('ampliada: zoom hasta 4×', lightbox.includes('ZOOM_MAX = 4'));
check('ampliada: diálogo modal', lightbox.includes('aria-modal="true"'));
check('el módulo no toca el carrusel existente', !readFileSync('src/components/EventSidebarImageCarousel.tsx', 'utf8').includes('hotel'));

console.log(`\n${ok} comprobaciones correctas, ${malos.length} con fallo.`);
if (malos.length) { console.log('Fallaron:\n - ' + malos.join('\n - ')); process.exit(1); }
