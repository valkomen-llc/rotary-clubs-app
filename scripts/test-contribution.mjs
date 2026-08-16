// ════════════════════════════════════════════════════════════════════
// Campañas de Contribución — pruebas del CRITERIO
// v4.803.0
//
//   npm run test:contribution
//
// Sin base, sin credenciales, sin red: prueban contributionSpec.js —tipos,
// estados, targeting, validación de indicadores, whitelist de overrides y la
// mezcla que ve un sitio—, separado de la orquestación, por el mismo motivo
// que seoRules.js vive aparte de seoAudit.js.
//
// El espejo del navegador (src/lib/contributionSpec.ts) se compila con
// esbuild y se comparan las SALIDAS de las funciones compartidas, no sólo las
// constantes — si falta esbuild, esa parte se salta sola y lo dice.
//
// Al final, comprobaciones DE ARCHIVO: que la lectura pública degrade en vez
// de responder 500, que la ruta esté montada, que la pantalla use
// lazyWithRetry y que las cinco tablas figuren en la documentación del
// guardián de db:push. Nada de eso lo ve el typecheck.
// ════════════════════════════════════════════════════════════════════

import { readFileSync, readdirSync } from 'node:fs';

import {
    CAMPAIGN_TYPES, DEFAULT_CAMPAIGN_TYPE, campaignTypeCatalog,
    CAMPAIGN_STATUSES, STATUS_LABELS, canTransition, effectiveStatus, isServable,
    normalizeTargeting, targetsSite, pickCampaignForSite,
    SECTION_IDS, normalizeContent, hexOrEmpty, acceptableCtaUrl,
    normalizeStats, validateStats, validateForPublish, latestStatDate,
    OVERRIDE_WHITELIST, sanitizeOverride, resolveForSite, slugify,
    donationPresets, normalizeCenters, groupCenters,
    heroSlides, HERO_MAX_SLIDES, HERO_SLIDE_MS, resolveCampaignVideo,
    sectionVideos, MAX_SECTION_VIDEOS, galleryItems, MAX_GALLERY_ITEMS, GALLERY_SLIDE_MS,
} from '../server/lib/contributionSpec.js';

let ok = 0; const malos = [];
const check = (n, cond, extra = '') => {
    if (cond) { ok++; console.log(`  ✓ ${n}`); }
    else { malos.push(n); console.log(`  ✗ ${n}${extra ? ` — ${extra}` : ''}`); }
};
const grupo = t => console.log(`\n${t}`);
const eq = (a, b) => JSON.stringify(a) === JSON.stringify(b);

// ─── Catálogo de tipos ─────────────────────────────────────────────────────
grupo('El catálogo de tipos');
check('terremoto viene del catálogo de emergencias y está marcado emergency',
    CAMPAIGN_TYPES.terremoto?.emergency === true);
check('los institucionales del pedido están (social, salud, agua, educación, alimentación, reconstrucción, fondo, internacional)',
    ['social', 'salud', 'agua', 'educacion', 'alimentacion', 'reconstruccion', 'fondo', 'internacional']
        .every(id => CAMPAIGN_TYPES[id] && CAMPAIGN_TYPES[id].emergency === false));
check('hay UN solo `otro` y es el genérico institucional',
    CAMPAIGN_TYPES.otro?.label === 'Otra campaña' && CAMPAIGN_TYPES.otro?.emergency === false);
check('el tipo por defecto existe en el catálogo', !!CAMPAIGN_TYPES[DEFAULT_CAMPAIGN_TYPE]);
check('el catálogo no tiene ids duplicados',
    new Set(campaignTypeCatalog().map(t => t.id)).size === campaignTypeCatalog().length);

// ─── Estados ───────────────────────────────────────────────────────────────
grupo('Estados y transiciones');
check('los seis estados del pedido están', eq(CAMPAIGN_STATUSES, ['draft', 'scheduled', 'active', 'paused', 'finished', 'archived']));
check('todos tienen etiqueta', CAMPAIGN_STATUSES.every(s => STATUS_LABELS[s]));
check('borrador puede publicarse y programarse', canTransition('draft', 'active') && canTransition('draft', 'scheduled'));
check('activa puede pausarse, finalizarse y archivarse',
    canTransition('active', 'paused') && canTransition('active', 'finished') && canTransition('active', 'archived'));
check('activa NO puede volver directo a borrador', !canTransition('active', 'draft'));
check('archivada sólo vuelve a borrador', canTransition('archived', 'draft') && !canTransition('archived', 'active'));
check('un estado desconocido no transiciona', !canTransition('zombi', 'active'));

grupo('El estado efectivo se deriva del reloj');
const t0 = new Date('2026-08-15T12:00:00Z');
check('programada con inicio vencido se sirve como activa',
    effectiveStatus({ status: 'scheduled', startAt: '2026-08-10T00:00:00Z' }, t0) === 'active');
check('programada con inicio futuro sigue programada',
    effectiveStatus({ status: 'scheduled', startAt: '2026-09-01T00:00:00Z' }, t0) === 'scheduled');
check('activa con fin vencido se sirve como finalizada',
    effectiveStatus({ status: 'active', endAt: '2026-08-01T00:00:00Z' }, t0) === 'finished');
check('activa con inicio futuro se sirve como programada (publicar antes no adelanta la fecha)',
    effectiveStatus({ status: 'active', startAt: '2026-09-01T00:00:00Z' }, t0) === 'scheduled');
check('pausada NO se reactiva sola aunque las fechas digan que sí',
    effectiveStatus({ status: 'paused', startAt: '2026-08-01T00:00:00Z' }, t0) === 'paused');
check('sin fechas, activa es activa', effectiveStatus({ status: 'active' }, t0) === 'active');
check('un estado con fechas exige `now` (pureza: sin reloj propio)', (() => {
    try { effectiveStatus({ status: 'active' }); return false; } catch { return true; }
})());
check('isServable sólo con estado efectivo activo',
    isServable({ status: 'scheduled', startAt: '2026-08-10T00:00:00Z' }, t0)
    && !isServable({ status: 'draft' }, t0));

// ─── Targeting ─────────────────────────────────────────────────────────────
grupo('Targeting multi-sitio');
check('normalizeTargeting descarta distritos no numéricos y deduplica',
    eq(normalizeTargeting({ mode: 'districts', districts: ['4281', 'x', '4281', '4271'] }).districts, ['4281', '4271']));
check('un modo desconocido cae a clubs (el más acotado, no el más amplio)',
    normalizeTargeting({ mode: 'todos!' }).mode === 'clubs');
check('all alcanza a cualquier sitio', targetsSite({ mode: 'all' }, { id: 'c1' }));
check('clubs alcanza sólo a los listados',
    targetsSite({ mode: 'clubs', clubIds: ['c1'] }, { id: 'c1' })
    && !targetsSite({ mode: 'clubs', clubIds: ['c1'] }, { id: 'c2' }));
check('districts alcanza por la clave foránea',
    targetsSite({ mode: 'districts', districts: ['4281'] }, { id: 'c1', districtId: '4281' }));
check('districts alcanza por el número dentro de la LISTA «4271, 4281»',
    targetsSite({ mode: 'districts', districts: ['4281'] }, { id: 'c1', district: '4271, 4281' }));
check('«42811» NO cuenta como 4281 — es otro número',
    !targetsSite({ mode: 'districts', districts: ['4281'] }, { id: 'c1', district: '42811' }));
check('sin id de sitio no se alcanza nada', !targetsSite({ mode: 'all' }, {}));

grupo('Cuando dos campañas alcanzan un sitio, gana una y se sabe cuál');
const base = { status: 'active', targeting: { mode: 'all' } };
const cA = { ...base, id: 'a', priority: 0, publishedAt: '2026-08-01T00:00:00Z' };
const cB = { ...base, id: 'b', priority: 5, publishedAt: '2026-07-01T00:00:00Z' };
const cC = { ...base, id: 'c', priority: 0, publishedAt: '2026-08-10T00:00:00Z' };
check('la prioridad manda', pickCampaignForSite([cA, cB, cC], { id: 's1' }, t0)?.id === 'b');
check('a igual prioridad, la publicada más recientemente',
    pickCampaignForSite([cA, cC], { id: 's1' }, t0)?.id === 'c');
check('una campaña no servible no compite',
    pickCampaignForSite([{ ...cB, status: 'paused' }, cA], { id: 's1' }, t0)?.id === 'a');
check('sin candidatas, null', pickCampaignForSite([{ ...cA, status: 'draft' }], { id: 's1' }, t0) === null);
check('el desempate final es estable (por id, no por orden de llegada)',
    pickCampaignForSite([cC, { ...cA, id: 'z', publishedAt: cC.publishedAt }], { id: 's1' }, t0)?.id === 'c'
    && pickCampaignForSite([{ ...cA, id: 'z', publishedAt: cC.publishedAt }, cC], { id: 's1' }, t0)?.id === 'c');

// ─── Contenido ─────────────────────────────────────────────────────────────
grupo('El contenido se normaliza sin inventar');
const cont = normalizeContent({
    hero: { title: 'COLOMBIA NOS NECESITA', ctaPrimary: { label: 'APORTAR AHORA', action: 'donate' } },
    waysToHelp: Array.from({ length: 12 }, (_, i) => ({ title: `w${i}` })),
    theme: { primary: '#14669B', accent: 'bg-red-500', cta: 'javascript:alert(1)' },
    sectionOrder: ['hero', 'inventada', 'stats'],
});
check('el hero conserva su título y su CTA', cont.hero.title === 'COLOMBIA NOS NECESITA' && cont.hero.ctaPrimary.action === 'donate');
check('un campo ausente queda vacío, nunca con texto inventado', cont.donateCard.title === '' && cont.finalCta.quote === '');
check('waysToHelp se acota a 8', cont.waysToHelp.length === 8);
check('un color que no es hexadecimal NO pasa (ni clase Tailwind ni javascript:)',
    cont.theme.primary === '#14669B' && cont.theme.accent === '' && cont.theme.cta === '');
check('sectionOrder filtra secciones desconocidas', eq(cont.sectionOrder, ['hero', 'stats']));
check('SECTION_IDS cubre las nueve secciones del pedido', SECTION_IDS.length === 9);

grupo('El destino de un CTA sólo puede ser http(s) o ruta interna');
check('https pasa', acceptableCtaUrl('https://rotary.org'));
check('ruta interna pasa', acceptableCtaUrl('/maneras-de-contribuir'));
check('javascript: no pasa', !acceptableCtaUrl('javascript:alert(1)'));
check('//otrositio.com no pasa — parece interno y es externo', !acceptableCtaUrl('//evil.com'));
check('vacío no pasa', !acceptableCtaUrl(''));
check('hexOrEmpty acepta #RRGGBB y nada más', hexOrEmpty('#9D2235') === '#9D2235' && hexOrEmpty('red') === '' && hexOrEmpty('#123') === '');

// ─── Indicadores ───────────────────────────────────────────────────────────
grupo('Un indicador sin fuente no se publica');
const statsOk = [{ id: 's1', label: 'Fallecidos', value: '54', source: 'UNGRD, corte 14/08/2026', updatedAt: '2026-08-14', active: true }];
check('con fuente y fecha, pasa', validateStats(statsOk).length === 0);
check('sin fuente, se dice CUÁL y por qué', (() => {
    const errs = validateStats([{ ...statsOk[0], source: '' }]);
    return errs.length === 1 && errs[0].includes('Fallecidos') && errs[0].includes('fuente');
})());
check('sin fecha válida, se rechaza', validateStats([{ ...statsOk[0], updatedAt: 'ayer' }]).length === 1);
check('un indicador DESACTIVADO no se valida — retirarlo es legítimo',
    validateStats([{ ...statsOk[0], source: '', active: false }]).length === 0);
check('sin etiqueta o sin valor, se rechaza', validateStats([{ id: 'x', label: '', value: '9', source: 's', updatedAt: '2026-08-14' }]).length === 1);
check('latestStatDate devuelve la más reciente de las activas',
    latestStatDate([
        { label: 'a', value: '1', source: 's', updatedAt: '2026-08-10', active: true },
        { label: 'b', value: '2', source: 's', updatedAt: '2026-08-14', active: true },
        { label: 'c', value: '3', source: 's', updatedAt: '2026-08-20', active: false },
    ])?.slice(0, 10) === '2026-08-14');
check('normalizeStats acota a 24 y da forma', normalizeStats(Array.from({ length: 30 }, () => ({}))).length === 24);

// ─── Publicación ───────────────────────────────────────────────────────────
grupo('Qué exige publicar');
const publicable = {
    name: 'Emergencia terremoto', campaignType: 'terremoto',
    content: { hero: { title: 'COLOMBIA NOS NECESITA' }, donateCard: { title: 'Aporte para la emergencia', buttonText: 'APORTAR AHORA' } },
    targeting: { mode: 'all' }, stats: statsOk,
};
check('una campaña completa pasa', validateForPublish(publicable).length === 0);
check('sin nombre, sin hero o sin botón de aporte, NO pasa', (() => {
    const errs = validateForPublish({ ...publicable, name: '', content: {} });
    return errs.some(e => e.includes('nombre')) && errs.some(e => e.includes('hero')) && errs.some(e => e.includes('aporte'));
})());
check('alcance por sitios sin sitios, NO pasa',
    validateForPublish({ ...publicable, targeting: { mode: 'clubs', clubIds: [] } }).some(e => e.includes('sitio')));
check('fin anterior al inicio, NO pasa',
    validateForPublish({ ...publicable, startAt: '2026-09-01', endAt: '2026-08-01' }).some(e => e.includes('posterior')));
check('un indicador sin fuente BLOQUEA la publicación',
    validateForPublish({ ...publicable, stats: [{ label: 'Heridos', value: '1152', source: '', updatedAt: '2026-08-14' }] }).length === 1);

// ─── Overrides ─────────────────────────────────────────────────────────────
grupo('La frontera de lo local es estructural');
check('la whitelist es la declarada', eq(OVERRIDE_WHITELIST, ['contact', 'localNote', 'qrImage']));
check('una clave fuera de la lista NO se puede ni expresar', (() => {
    const out = sanitizeOverride({ localNote: 'El club recibe en su sede', hero: { title: 'PISADO' }, stats: [], targeting: { mode: 'all' } });
    return out.localNote === 'El club recibe en su sede' && !('hero' in out) && !('stats' in out) && !('targeting' in out);
})());
check('el contacto se sanea campo por campo', (() => {
    const out = sanitizeOverride({ contact: { name: 'Fanny Cardona', phone: '300 000 0000', email: 'x@y.co', extra: 'no' } });
    return out.contact.name === 'Fanny Cardona' && !('extra' in out.contact);
})());

grupo('Lo que ve un sitio (resolveForSite)');
const activa = { ...publicable, id: 'camp1', slug: 'terremoto-2026', status: 'active', stats: [...statsOk, { label: 'Sin fuente', value: '9', source: '', updatedAt: '2026-08-14', active: true }] };
const resolved = resolveForSite(activa, { content: { localNote: 'nota', hero: 'PISADO' } }, t0);
check('una campaña activa se resuelve con su forma completa',
    resolved && resolved.slug === 'terremoto-2026' && resolved.content.hero.title === 'COLOMBIA NOS NECESITA');
check('los indicadores sin fuente NO viajan al público aunque estén activos',
    resolved.stats.length === 1 && resolved.stats[0].label === 'Fallecidos');
check('el override llega saneado y en su propia clave (`local`), nunca mezclado',
    resolved.local.localNote === 'nota' && !('hero' in resolved.local));
check('una campaña pausada no se resuelve', resolveForSite({ ...activa, status: 'paused' }, null, t0) === null);
check('statsUpdatedAt es la última actualización visible', resolved.statsUpdatedAt?.slice(0, 10) === '2026-08-14');

// ─── Montos por moneda (v4.804) ────────────────────────────────────────────
grupo('Los montos sugeridos son DE la moneda que se cobra');
check('COP sugiere montos de pesos y un mínimo que no sea un error de interfaz',
    donationPresets('COP').amounts.every(a => a >= 5000) && donationPresets('COP').min === 5000);
check('USD conserva los montos de siempre', eq(donationPresets('USD').amounts, [10, 25, 50, 100]) && donationPresets('USD').min === 1);
check('una moneda desconocida cae a USD, no a un objeto vacío', eq(donationPresets('EUR'), donationPresets('USD')));
check('insensible a mayúsculas', eq(donationPresets('cop'), donationPresets('COP')));

// ─── Centros de acopio (F3) ────────────────────────────────────────────────
grupo('Los centros son datos estructurados, nunca un textarea');
const centrosCrudos = [
    { id: 'c1', city: 'Bogotá', address: 'Calle 149 #43-43', sortOrder: 0 },
    { id: 'c2', city: 'Cali', groupLabel: 'Norte', address: 'Cll 39N #3Norte-59', sortOrder: 2 },
    { id: 'c3', city: 'Cali', groupLabel: 'Sur', address: 'Cra. 89 #10-80', sortOrder: 3 },
    { id: 'c4', city: '', address: 'Sin ciudad' },
    { id: 'c5', city: 'Chía', address: '' },
    { id: 'c6', city: 'Cali', groupLabel: 'Norte', address: 'Carrera 1D #54-61', sortOrder: 4 },
    { id: 'c7', city: 'Buenaventura', address: 'Cra 5 #1-44', active: false, sortOrder: 1 },
];
const { centers: centrosOk, skipped: centrosMal } = normalizeCenters(centrosCrudos);
check('sin ciudad o sin dirección se DESCARTA y se REPORTA — nunca en silencio',
    centrosOk.length === 5 && centrosMal.length === 2
    && centrosMal[0].reason === 'sin ciudad' && centrosMal[1].reason === 'sin dirección');
check('los campos se sanean con su tope y su trim',
    normalizeCenters([{ city: '  Bogotá ', address: ' x '.padEnd(300, 'x') }]).centers[0].city === 'Bogotá');

grupo('La agrupación por ciudad es estable y sólo publica lo activo');
const agrupado = groupCenters(centrosOk);
check('la ciudad aparece en el orden de su primer centro (por sortOrder)',
    eq(agrupado.map(g => g.city), ['Bogotá', 'Cali']));
check('un centro desactivado NO existe para el público', !agrupado.some(g => g.city === 'Buenaventura'));
check('dentro de Cali, los sectores agrupan (Norte con sus dos, Sur con el suyo)', (() => {
    const cali = agrupado.find(g => g.city === 'Cali');
    return cali && eq(cali.groups.map(g => g.label), ['Norte', 'Sur'])
        && cali.groups[0].centers.length === 2 && cali.groups[1].centers.length === 1;
})());
check('el orden no depende del orden de llegada', (() => {
    const alReves = groupCenters([...centrosOk].reverse());
    return eq(JSON.stringify(alReves), JSON.stringify(agrupado));
})());
check('sin centros activos, la lista queda vacía (y la sección no se pinta)',
    groupCenters([{ id: 'x', city: 'Bogotá', address: 'Calle 1', active: false }]).length === 0);

grupo('Slug');
check('se deriva sin tildes ni espacios', slugify('Campaña Terremoto — Valle del Cauca') === 'campana-terremoto-valle-del-cauca');
check('nunca queda vacío', slugify('¡¡¡') === 'campana');

// ─── v4.812: el hero se turna entre varias imágenes ────────────────────────
grupo('Las imágenes del hero');
check('con varias, se devuelven todas y en orden',
    eq(heroSlides({ images: [{ url: 'a.jpg', alt: 'A' }, { url: 'b.jpg', alt: 'B' }] }),
        [{ url: 'a.jpg', alt: 'A' }, { url: 'b.jpg', alt: 'B' }]));
// La regla ADITIVA del sitio: una campaña guardada antes de v4.812 tiene una
// sola `image` y se tiene que seguir viendo igual, no quedarse sin hero.
check('una campaña vieja con una sola `image` sigue teniendo su hero',
    eq(heroSlides({ image: 'sola.jpg', imageAlt: 'Sola' }), [{ url: 'sola.jpg', alt: 'Sola' }]));
check('cuando hay lista, la lista manda sobre la `image` vieja',
    eq(heroSlides({ image: 'vieja.jpg', images: [{ url: 'nueva.jpg' }] }), [{ url: 'nueva.jpg', alt: '' }]));
check('sin ninguna, el hero cae a su fondo liso (lista vacía, no un hueco roto)',
    eq(heroSlides({}), []) && eq(heroSlides({ images: [] }), []) && eq(heroSlides(undefined), []));
check('una entrada sin URL se descarta: no se pinta un `img` sin src',
    eq(heroSlides({ images: [{ url: '', alt: 'x' }, { alt: 'y' }, { url: 'ok.jpg' }] }), [{ url: 'ok.jpg', alt: '' }]));
check('lo que no es una lista no revienta', eq(heroSlides({ images: 'no' }), []));
check('el tope se respeta',
    heroSlides({ images: Array.from({ length: 20 }, (_, i) => ({ url: `${i}.jpg` })) }).length === HERO_MAX_SLIDES);
check('normalizeContent guarda las imágenes del hero y CONSERVA la `image` de siempre', (() => {
    const n = normalizeContent({ hero: { image: 'vieja.jpg', images: [{ url: 'a.jpg', alt: 'A' }, { url: '' }] } });
    return n.hero.image === 'vieja.jpg' && eq(n.hero.images, [{ url: 'a.jpg', alt: 'A' }]);
})());

// ─── v4.815: el video de una sección ───────────────────────────────────────
grupo('El video que va debajo de los elementos');
const vid = u => resolveCampaignVideo(u);
check('YouTube en sus cuatro formas da el mismo embed sin cookies', (() => {
    const esperado = { kind: 'youtube', src: 'https://www.youtube-nocookie.com/embed/dQw4w9WgXcQ' };
    return ['https://www.youtube.com/watch?v=dQw4w9WgXcQ', 'https://youtu.be/dQw4w9WgXcQ',
        'https://www.youtube.com/embed/dQw4w9WgXcQ', 'https://youtube.com/shorts/dQw4w9WgXcQ']
        .every(u => eq(vid(u), esperado));
})());
check('del `<iframe>` pegado entero se toma el src (nadie edita HTML a mano)',
    vid('<iframe width="560" src="https://www.youtube.com/embed/dQw4w9WgXcQ" allowfullscreen></iframe>')?.kind === 'youtube');
check('Vimeo se reconoce por su id', eq(vid('https://vimeo.com/123456789'),
    { kind: 'vimeo', src: 'https://player.vimeo.com/video/123456789' }));
check('un archivo de video se reproduce con el reproductor del navegador',
    vid('https://cdn.ejemplo.org/clip.mp4')?.kind === 'file'
    && vid('https://cdn.ejemplo.org/clip.webm')?.kind === 'file');
// Un `<iframe>` se dibuja en una página pública: la lista de anfitriones es
// cerrada por el mismo motivo que el mapa de la sede (v4.717).
check('un anfitrión que no está en la lista NO se embebe',
    vid('https://evil.example/video') === null && vid('https://rutube.ru/video/abc') === null);
check('sin https no se embebe nada',
    vid('http://www.youtube.com/watch?v=dQw4w9WgXcQ') === null
    && vid('javascript:alert(1)') === null && vid('//youtube.com/watch?v=x') === null);
check('lo vacío o irreconocible devuelve null, y la página no pinta nada',
    vid('') === null && vid(null) === null && vid('cualquier cosa') === null
    && vid('https://www.youtube.com/') === null);
grupo('Varios videos, recorridos con las flechas');
const yt = 'https://youtu.be/aaaaaa';
const vm = 'https://vimeo.com/123456789';
check('con varios, se devuelven todos resueltos y en orden', (() => {
    const l = sectionVideos([{ url: yt, title: 'Uno' }, { url: vm, title: 'Dos' }], null);
    return l.length === 2 && l[0].title === 'Uno' && l[0].video.kind === 'youtube' && l[1].video.kind === 'vimeo';
})());
// Regla ADITIVA: una campaña de v4.815 tiene UN video y no puede perderlo.
check('una campaña con UN solo video (v4.815) lo sigue mostrando', (() => {
    const l = sectionVideos(undefined, { url: yt, title: 'El de siempre' });
    return l.length === 1 && l[0].title === 'El de siempre';
})());
check('cuando hay lista, la lista manda sobre el video único',
    sectionVideos([{ url: vm }], { url: yt })[0].video.kind === 'vimeo');
// La flecha «siguiente» no puede llevar a un recuadro vacío.
check('un enlace que no se reconoce se DESCARTA de la lista', (() => {
    const l = sectionVideos([{ url: yt }, { url: 'no sirve' }, { url: 'http://youtube.com/watch?v=x' }, { url: vm }], null);
    return l.length === 2;
})());
check('sin ninguno, lista vacía y la sección no pinta video',
    eq(sectionVideos([], null), []) && eq(sectionVideos(undefined, undefined), [])
    && eq(sectionVideos(undefined, { url: '' }), []));
check('lo que no es una lista no revienta', eq(sectionVideos('no', null), []));
check('el tope se respeta',
    sectionVideos(Array.from({ length: 20 }, () => ({ url: yt })), null).length === MAX_SECTION_VIDEOS);
check('normalizeContent guarda los varios y CONSERVA el video único de siempre', (() => {
    const n = normalizeContent({
        requiredItemsVideo: { url: 'viejo.mp4' },
        requiredItemsVideos: [{ url: 'https://x.org/a.mp4', title: 'A' }, { url: '' }],
    });
    return n.requiredItemsVideo.url === 'viejo.mp4' && n.requiredItemsVideos.length === 1;
})());

check('normalizeContent guarda la URL TAL CUAL, para que el editor pueda mostrar el error', (() => {
    const n = normalizeContent({ requiredItemsVideo: { url: 'no sirve', title: 'Pie', poster: 'https://x/y.jpg' } });
    return n.requiredItemsVideo.url === 'no sirve' && n.requiredItemsVideo.title === 'Pie';
})());

// ─── v4.821: la galería «Rotarios en acción» ───────────────────────────────
grupo('La galería de fotos y videos');
// El tipo se DERIVA de la dirección: guardarlo aparte daría dos verdades y se
// contradirían en cuanto alguien cambie la URL de una fila.
check('el tipo se deduce de la dirección, no se guarda', (() => {
    const l = galleryItems([{ url: 'https://x.org/foto.jpg' }, { url: 'https://youtu.be/abc123' }, { url: 'https://x.org/clip.mp4' }]);
    return l[0].kind === 'image' && l[0].player === null
        && l[1].kind === 'video' && l[1].player === 'youtube'
        && l[2].kind === 'video' && l[2].player === 'file';
})());
check('un video embebido se resuelve a su reproductor sin cookies',
    galleryItems([{ url: 'https://www.youtube.com/watch?v=abc123' }])[0].src === 'https://www.youtube-nocookie.com/embed/abc123');
// La tira necesita una miniatura por tarjeta. La de YouTube se deriva del
// propio id, sin llamar a nadie; Vimeo no la publica sin su API.
check('la miniatura de un video de YouTube se deriva de su id', (() => {
    const l = galleryItems([{ url: 'https://youtu.be/abc123' }, { url: 'https://vimeo.com/123456789' }, { url: 'https://x/a.jpg' }]);
    return l[0].thumb === 'https://i.ytimg.com/vi/abc123/hqdefault.jpg'
        && l[1].thumb === '' && l[2].thumb === 'https://x/a.jpg';
})());
check('el pie, el crédito y el texto alternativo viajan con la pieza', (() => {
    const l = galleryItems([{ url: 'https://x/a.jpg', caption: 'Entrega', credit: 'RC Cali', alt: 'Voluntarios' }]);
    return l[0].caption === 'Entrega' && l[0].credit === 'RC Cali' && l[0].alt === 'Voluntarios';
})());
// La flecha «siguiente» no puede llevar a un recuadro vacío.
check('una fila sin dirección se descarta',
    galleryItems([{ url: '' }, { caption: 'sin url' }, { url: 'https://x/a.jpg' }]).length === 1);
check('sin piezas, lista vacía y la sección no se pinta',
    eq(galleryItems([]), []) && eq(galleryItems(undefined), []) && eq(galleryItems('no'), []));
check('el tope se respeta',
    galleryItems(Array.from({ length: 50 }, () => ({ url: 'https://x/a.jpg' }))).length === MAX_GALLERY_ITEMS);
check('normalizeContent guarda la galería con su título y descarta lo vacío', (() => {
    const n = normalizeContent({ gallery: { title: 'Rotarios en acción', items: [{ url: 'https://x/a.jpg', credit: 'RC Cali' }, { url: '' }] } });
    return n.gallery.title === 'Rotarios en acción' && n.gallery.items.length === 1
        && n.gallery.items[0].credit === 'RC Cali';
})());
check('una campaña sin galería no revienta y no pinta nada',
    eq(normalizeContent({}).gallery.items, []) && normalizeContent({}).gallery.title === '');

// ─── El espejo del navegador ───────────────────────────────────────────────
let mirror = null;
try {
    const { build } = await import('esbuild');
    const out = await build({
        entryPoints: ['src/lib/contributionSpec.ts'],
        bundle: true, write: false, format: 'esm', platform: 'neutral',
    });
    mirror = await import(`data:text/javascript,${encodeURIComponent(out.outputFiles[0].text)}`);
} catch {
    console.log('\n⚠ Espejo del navegador: se omite (falta esbuild).  npm i --no-save esbuild');
}

if (mirror) {
    grupo('El espejo del navegador dice lo MISMO que el servidor');
    check('mismo catálogo de tipos (ids, etiquetas y bandera de emergencia)',
        eq(campaignTypeCatalog(), mirror.campaignTypeCatalog()));
    check('mismos estados y etiquetas', eq(CAMPAIGN_STATUSES, mirror.CAMPAIGN_STATUSES) && eq(STATUS_LABELS, mirror.STATUS_LABELS));
    check('mismas transiciones', CAMPAIGN_STATUSES.every(a => CAMPAIGN_STATUSES.every(b => canTransition(a, b) === mirror.canTransition(a, b))));
    check('mismo estado efectivo en una matriz de casos', (() => {
        const cases = [
            { status: 'scheduled', startAt: '2026-08-10T00:00:00Z' },
            { status: 'scheduled', startAt: '2026-09-01T00:00:00Z' },
            { status: 'active', endAt: '2026-08-01T00:00:00Z' },
            { status: 'active', startAt: '2026-09-01T00:00:00Z' },
            { status: 'paused' }, { status: 'draft' }, { status: 'finished' },
        ];
        return cases.every(x => effectiveStatus(x, t0) === mirror.effectiveStatus(x, t0));
    })());
    check('misma validación de indicadores (mensajes incluidos)', (() => {
        const cases = [statsOk, [{ ...statsOk[0], source: '' }], [{ ...statsOk[0], updatedAt: 'ayer' }], [{ label: '', value: '' }]];
        return cases.every(x => eq(validateStats(x), mirror.validateStats(x)));
    })());
    check('mismo criterio de URL de CTA', ['https://x.co', '/ruta', '//evil.com', 'javascript:x', '', 'ftp://x'].every(u => acceptableCtaUrl(u) === mirror.acceptableCtaUrl(u)));
    check('mismo hexOrEmpty', ['#14669B', 'red', '#123', ' #ABCDEF '].every(v => hexOrEmpty(v) === mirror.hexOrEmpty(v)));
    check('mismo slugify', ['Campaña Ñuñoa', '¡¡¡', 'Terremoto — Valle'].every(s => slugify(s) === mirror.slugify(s)));
    check('mismos montos por moneda — el modal ofrece lo que el servidor cobra',
        ['COP', 'USD', 'EUR', 'cop'].every(c => eq(donationPresets(c), mirror.donationPresets(c))));
    check('mismo saneo de centros (descartes y motivos incluidos)',
        eq(normalizeCenters(centrosCrudos), mirror.normalizeCenters(centrosCrudos)));
    check('misma agrupación por ciudad — lo que pinta el navegador es lo que decidió el servidor',
        eq(groupCenters(centrosOk), mirror.groupCenters(centrosOk)));
    check('mismas imágenes del hero: el editor y la página resuelven igual', (() => {
        const casos = [
            { image: 'a.jpg', imageAlt: 'A' },
            { images: [{ url: 'a.jpg', alt: 'A' }, { url: 'b.jpg' }] },
            { image: 'vieja.jpg', images: [{ url: 'nueva.jpg' }] },
            { images: [{ url: '' }, { alt: 'sin url' }] },
            {}, { images: 'no es lista' },
        ];
        return casos.every(h => eq(heroSlides(h), mirror.heroSlides(h)));
    })());
    check('mismo tope y mismo intervalo del carrusel',
        HERO_MAX_SLIDES === mirror.HERO_MAX_SLIDES && HERO_SLIDE_MS === mirror.HERO_SLIDE_MS);
    check('misma galería: el editor y la página resuelven igual', (() => {
        const casos = [
            [{ url: 'https://x/a.jpg', caption: 'A' }, { url: 'https://youtu.be/abc123' }, { url: '' }],
            [], undefined, 'no es lista',
        ];
        return casos.every(l => eq(galleryItems(l), mirror.galleryItems(l)))
            && MAX_GALLERY_ITEMS === mirror.MAX_GALLERY_ITEMS
            && GALLERY_SLIDE_MS === mirror.GALLERY_SLIDE_MS;
    })());
    check('misma lista de videos: el editor y la página resuelven igual', (() => {
        const casos = [
            [[{ url: 'https://youtu.be/abc123', title: 'A' }, { url: 'no sirve' }], null],
            [undefined, { url: 'https://vimeo.com/123456789', title: 'Único' }],
            [[], { url: '' }],
            ['no es lista', null],
        ];
        return casos.every(([l, u]) => eq(sectionVideos(l, u), mirror.sectionVideos(l, u)))
            && MAX_SECTION_VIDEOS === mirror.MAX_SECTION_VIDEOS;
    })());
    check('mismo criterio de video: el aviso del editor no puede contradecir lo que se pinta', (() => {
        const casos = ['https://www.youtube.com/watch?v=dQw4w9WgXcQ', 'https://youtu.be/abc123',
            'https://vimeo.com/123456789', 'https://cdn.x.org/a.mp4', 'https://evil.example/v',
            'http://youtube.com/watch?v=x', '', 'cualquier cosa',
            '<iframe src="https://player.vimeo.com/video/987654321"></iframe>'];
        return casos.every(u => eq(resolveCampaignVideo(u), mirror.resolveCampaignVideo(u)));
    })());
}

// ─── Comprobaciones de archivo ─────────────────────────────────────────────
grupo('Lo que no ve el typecheck');
const controller = readFileSync('server/controllers/contributionCampaignController.js', 'utf8');
check('la lectura pública DEGRADA a { campaign: null } — nunca un 500 en la página de aportes',
    /getActiveCampaign[\s\S]*?catch[\s\S]*?res\.json\(\{ campaign: null \}\)/.test(controller));
check('toda transición de estado escribe historial',
    /transitionCampaign[\s\S]*?recordHistory\([\s\S]*?status:\$\{to\}/.test(controller) || controller.includes("`status:${to}`"));
check('publicar valida con validateForPublish y devuelve los motivos',
    /to === 'active' \|\| to === 'scheduled'[\s\S]*?validateForPublish/.test(controller));
check('sólo se elimina un borrador nunca publicado',
    /deleteCampaign[\s\S]*?status !== 'draft' \|\| rows\[0\]\.publishedAt/.test(controller));
check('las cuatro escrituras (crear, guardar, estado, eliminar) invalidan la caché de la lectura pública',
    (controller.match(/invalidateCache\(\);/g) || []).length >= 4);

const apiIndex = readFileSync('api/index.js', 'utf8');
check('la ruta está montada en /api/contribution-campaigns',
    apiIndex.includes("app.use('/api/contribution-campaigns'"));

const appTsx = readFileSync('src/App.tsx', 'utf8');
check('la pantalla usa lazyWithRetry, como toda página (v4.791)',
    /const ContributionCampaigns = lazyWithRetry\(/.test(appTsx)
    && appTsx.includes('path="/admin/campanas-contribucion"'));

const guard = readFileSync('scripts/db-push-guard.mjs', 'utf8');
check('las cinco tablas figuran en la documentación del guardián de db:push',
    ['ContributionCampaign', 'ContributionCenter', 'ContributionCampaignOverride',
        'ContributionCampaignHistory', 'ContributionCampaignMetric'].every(t => guard.includes(t)));

const routes = readFileSync('server/routes/contribution-campaigns.js', 'utf8');
check('la gestión exige operador de plataforma y la lectura pública no lleva sesión',
    /superAdminOnly, listCampaigns/.test(routes) && /router\.get\('\/active', getActiveCampaign\)/.test(routes));

// ─── Fase 2: la página pública y el cobro ──────────────────────────────────
grupo('Fase 2 — la página pública toma la campaña');
const pagina = readFileSync('src/pages/ManerasDeContribuir.tsx', 'utf8');
check('sin campaña, la página genérica se pinta (el fallback existe como rama)',
    pagina.includes("campaignState.kind === 'campaign'") && pagina.includes('<PaymentBlocksCarousel') && pagina.includes('<FoundationImpactSection'));
check('un fallo consultando la campaña degrada a la página genérica',
    /catch[\s\S]{0,500}kind: 'none'/.test(pagina));
check('la vista previa lleva su franja que dice que NADA está publicado',
    pagina.includes('campaignPreview') && /Vista previa de la campaña/.test(pagina));
check('en vista previa NO se manda campaignId al cobro (un borrador no atribuye)',
    /campaignId=\{campaignState\.preview \? null : camp\.id\}/.test(pagina));
check('el modal compartido reemplazó al inline en las DOS ramas',
    (pagina.match(/<DonationModal/g) || []).length === 2 && !pagina.includes('Haz tu Donación'));

const modal = readFileSync('src/components/DonationModal.tsx', 'utf8');
// Se busca el RÓTULO viejo («monto (USD)» escrito fijo), no la mención: el
// comentario que explica de dónde se viene tiene que poder nombrarlo.
check('el modal rotula la moneda REAL y saca los montos de donationPresets',
    modal.includes('donationPresets(') && modal.includes('Selecciona el monto ({cur})') && !modal.includes('monto (USD)'));
check('el modal manda campaignId al checkout cuando existe',
    /campaignId: campaignId \|\| undefined/.test(modal));

const landing = readFileSync('src/components/campaign/CampaignLanding.tsx', 'utf8');
// (Desde F3 la sección existe; lo que sigue vigente es que el botón se
// condicione — la comprobación de hasCenters vive en el grupo de la F3.)
check('un CTA de centros sigue condicionado a IMPLEMENTED_SECTIONS',
    landing.includes("IMPLEMENTED_SECTIONS.includes('centers')"));
check('los enlaces configurados pasan por ctaTarget, nunca la comprobación a mano',
    landing.includes('ctaTarget(cta.url)') && !/\^https\?:/.test(landing));
check('los iconos salen del registro de paymentBlocks, no de un catálogo nuevo',
    landing.includes("getBlockIcon") && landing.includes("from '../../lib/paymentBlocks'"));
check('el tema viaja en hexadecimal con style en línea (v4.719)',
    landing.includes('hexOrEmpty(') && landing.includes('style={style}'));

const financial = readFileSync('server/controllers/financialController.js', 'utf8');
check('el checkout valida la campaña y DEGRADA si no vale — nunca bloquea el aporte',
    financial.includes('resolveCampaignRef') && /se dona sin atribución/.test(financial));
check('la atribución viaja en la metadata de Stripe (campaignId + campaignSlug)',
    financial.includes("campaignId: campaign?.id || ''") && financial.includes("campaignSlug: campaign?.slug || ''"));
check('la campaña se valida con el MISMO criterio del spec (isServable + targetsSite)',
    financial.includes('isServable(campaign, new Date())') && financial.includes('targetsSite(campaign.targeting'));

// ─── Fase 3: centros de acopio en la página ────────────────────────────────
grupo('Fase 3 — centros, requeridos y aliados');
const ctrl3 = readFileSync('server/controllers/contributionCampaignController.js', 'utf8');
check('el batch central borra y reescribe SOLO filas centrales (clubId IS NULL)',
    /DELETE FROM "ContributionCenter"[\s\S]{0,120}"clubId" IS NULL/.test(ctrl3));
check('guardar centros escribe historial e invalida la caché',
    /centers_updated/.test(ctrl3));
check('el payload público adjunta los centros activos (centrales + del sitio)',
    ctrl3.includes('publicCentersFor(winner.id, clubId)') && ctrl3.includes('publicCentersFor(campaign.id, null)'));
check('lo descartado al guardar se REPORTA (skipped), nunca en silencio',
    /res\.json\(\{ centers: rows, skipped \}\)/.test(ctrl3));

const landing3 = readFileSync('src/components/campaign/CampaignLanding.tsx', 'utf8');
check('centers está encendido en IMPLEMENTED_SECTIONS (F3 entregó la sección)',
    /IMPLEMENTED_SECTIONS = \[[^\]]*'centers'/.test(landing3));
check('un CTA de centros exige ADEMÁS centros publicados (hasCenters)',
    (landing3.match(/!hasCenters\) return null/g) || []).length >= 2);
check('la agrupación de la página usa el espejo de groupCenters, no una copia',
    landing3.includes('groupCenters(campaign.centers)'));
check('los teléfonos van con tel: y las direcciones no se traducen (data-no-translate)',
    landing3.includes('tel:${c.phone') && /data-no-translate>\{c\.address\}/.test(landing3));
check('la sección de centros tiene su ancla (#centros-de-acopio)',
    landing3.includes('id="centros-de-acopio"'));

const rutas3 = readFileSync('server/routes/contribution-campaigns.js', 'utf8');
check('el editor de centros es del operador (superAdminOnly)',
    /superAdminOnly, listCenters/.test(rutas3) && /superAdminOnly, saveCenters/.test(rutas3));

// ─── Fase 4: indicadores en página y sobrescritura local ───────────────────
grupo('Fase 4 — indicadores, informativos, cierre y la vía del club');
const landing4 = readFileSync('src/components/campaign/CampaignLanding.tsx', 'utf8');
check('cada indicador pinta su FUENTE, y la fecha de actualización se dice',
    /\{s\.source\}/.test(landing4) && landing4.includes('Última actualización:'));
check('las cifras y las fuentes son DATOS: no se traducen',
    /data-no-translate>\{s\.value\}/.test(landing4));
check('el cierre final usa el MISMO CampaignCta (con hasCenters), no botones propios',
    /finalCta\.ctaPrimary[\s\S]{0,80}hasCenters=\{hasCenters\}/.test(landing4));
check('el bloque local pinta contacto con tel:/mailto: y el QR con alt',
    landing4.includes('tel:${campaign.local.contact.phone') && landing4.includes('mailto:${campaign.local.contact.email')
    && landing4.includes('alt="Código QR de aporte local"'));
check('las nueve secciones del spec están implementadas',
    SECTION_IDS.every(s => new RegExp(`IMPLEMENTED_SECTIONS = \\[[^\\]]*'${s}'`).test(landing4)));

const rutas4 = readFileSync('server/routes/contribution-campaigns.js', 'utf8');
check('la vía del club exige requireSiteAdmin y va ANTES de /:id',
    /requireSiteAdmin, getSiteCampaign/.test(rutas4) && /requireSiteAdmin, saveSiteOverride/.test(rutas4)
    && rutas4.indexOf("'/site/current'") < rutas4.indexOf("'/:id/preview'"));

const ctrl4 = readFileSync('server/controllers/contributionCampaignController.js', 'utf8');
check('el clubId de la vía del club sale del TOKEN, nunca del body',
    (ctrl4.match(/const clubId = req\.user\.clubId;/g) || []).length >= 3
    && !/req\.body[^\n]*clubId/.test(ctrl4.split('La vía del CLUB')[1] || ''));
check('el override se sanea con la whitelist EN el servidor',
    /sanitizeOverride\(req\.body\?\.content\)/.test(ctrl4));
check('el batch del club sólo borra y actualiza filas de SU club',
    /"clubId" = \$2 AND NOT \(id = ANY/.test(ctrl4)
    && /WHERE "ContributionCenter"."clubId" = \$14/.test(ctrl4));
check('las escrituras del club también dejan historial e invalidan la caché',
    ctrl4.includes("'override_saved'") && ctrl4.includes("'site_centers_updated'"));

// ─── Fase 5: métricas, panel y OG ──────────────────────────────────────────
grupo('Fase 5 — métricas por campaña, panel y tarjeta social');
const { METRIC_TYPES } = await import('../server/controllers/contributionCampaignController.js');
check('el catálogo de tipos de métrica es CERRADO y cubre el embudo',
    eq(METRIC_TYPES, ['view', 'cta_donate_click', 'cta_centers_click', 'share_click', 'checkout_started', 'donation_completed']));

const ctrl5 = readFileSync('server/controllers/contributionCampaignController.js', 'utf8');
check('las métricas son contadores DIARIOS agregados (UPSERT con incremento), no una fila por visita',
    /ON CONFLICT \("campaignId", "clubId", date, type\)[\s\S]{0,160}count \+ 1/.test(ctrl5));
check('un tipo inventado no se guarda',
    /!METRIC_TYPES\.includes\(type\)\) return false/.test(ctrl5));
check('el endpoint público NO acepta los eventos que valen dinero — los escribe el servidor',
    /type === 'donation_completed' \|\| type === 'checkout_started'/.test(ctrl5));
check('trackear nunca devuelve error al visitante',
    /trackCampaignEvent[\s\S]{0,1200}catch[\s\S]{0,120}res\.json\(\{ ok: false \}\)/.test(ctrl5));
check('el monto NO viene del navegador: sólo del webhook',
    !/req\.body\?\.amount/.test(ctrl5));
check('campaignSeoFor degrada a null ante cualquier fallo (corre en el catch-all)',
    /campaignSeoFor[\s\S]{0,900}catch \{\s*return null;/.test(ctrl5));

const financial5 = readFileSync('server/controllers/financialController.js', 'utf8');
check('checkout_started lo registra el servidor al crear la sesión, y su fallo no rompe el aporte',
    /bumpMetric\(\{ campaignId: campaign\.id, clubId, type: 'checkout_started' \}\)/.test(financial5)
    && /métrica checkout_started no registrada/.test(financial5));

const webhook5 = readFileSync('server/controllers/paymentController.js', 'utf8');
check('donation_completed se cuenta desde el WEBHOOK, con el monto real cobrado',
    /session\.metadata\?\.campaignId[\s\S]{0,400}type: 'donation_completed'[\s\S]{0,120}amount: totalAmount/.test(webhook5));
check('el modelo Donation NO se toca para la atribución (la métrica vive aparte)',
    /El modelo Donation NO se toca/.test(webhook5));

const seo5 = readFileSync('server/lib/seoServe.js', 'utf8');
check('el OG de campaña se resuelve en el SERVIDOR para /maneras-de-contribuir',
    /pathname === '\/maneras-de-contribuir'[\s\S]{0,300}campaignSeoFor\(club\.id\)/.test(seo5));
check('lo escrito a mano en SeoPageMeta sigue mandando sobre la campaña',
    /if \(!overrides\.title && campaignSeo\.title\)/.test(seo5));

const landing5 = readFileSync('src/components/campaign/CampaignLanding.tsx', 'utf8');
check('la página reporta con sendBeacon (sobrevive a la redirección a Stripe)',
    landing5.includes('navigator.sendBeacon'));
check('en VISTA PREVIA no se cuenta nada',
    /if \(preview \|\| !campaignId \|\| !clubId\) return;/.test(landing5));
check('una vista por carga, no una por render',
    landing5.includes('viewSent.current'));
check('los cuatro gestos del visitante se reportan',
    landing5.includes("'view'") && landing5.includes("'cta_donate_click'")
    && landing5.includes("'cta_centers_click'") && landing5.includes("'share_click'"));

const panel5 = readFileSync('src/pages/admin/ContributionCampaigns.tsx', 'utf8');
check('el panel dice que son cifras de ATRIBUCIÓN, no de causalidad',
    /ATRIBUCIÓN, no de causalidad/.test(panel5));
check('sin actividad, el panel lo dice en vez de mostrar ceros como logro',
    /Todavía no hay actividad registrada/.test(panel5));
// El ancho lo pone AdminLayout (max-w-7xl), igual que Proyectos, Biblioteca y
// Analíticas: un envoltorio propio encima encajona la pantalla contra el
// borde izquierdo y deja media ventana vacía (reportado en v4.808).
check('la pantalla NO impone su propio ancho — lo pone AdminLayout',
    !/<div className="max-w-\w+ space-y-6">/.test(panel5));

// ─── v4.810: el icono se ELIGE, no se escribe ──────────────────────────────
grupo('El icono de cada caja se elige viendo el icono');
const picker = readFileSync('src/components/admin/IconPicker.tsx', 'utf8');
const bloques = readFileSync('src/lib/paymentBlocks.ts', 'utf8');
check('no queda ningún campo de TEXTO para el icono',
    !/placeholder="Icono/.test(panel5));
check('las dos secciones usan el selector visual',
    (panel5.match(/<IconPicker/g) || []).length === 2);
check('el selector es COMPARTIDO: el editor de Bloques de Pago usa el mismo',
    readFileSync('src/pages/admin/PaymentBlocksManager.tsx', 'utf8').includes('<IconPicker'));
check('y ya no queda la rejilla escrita inline que se quedaría atrás',
    !/BLOCK_ICON_KEYS\.map/.test(readFileSync('src/pages/admin/PaymentBlocksManager.tsx', 'utf8')));
check('el selector lee el MISMO registro que pinta la página pública',
    picker.includes("from '../../lib/paymentBlocks'") && picker.includes('BLOCK_ICONS'));
check('el botón se rotula con el NOMBRE legible, no con la clave interna',
    /title=\{getBlockIconLabel\(key\)\}/.test(picker) && /aria-label=\{getBlockIconLabel\(key\)\}/.test(picker));

const { BLOCK_ICON_KEYS: keys, BLOCK_ICON_LABELS: labels } = await (async () => {
    try {
        const { build } = await import('esbuild');
        const o = await build({ entryPoints: ['src/lib/paymentBlocks.ts'], bundle: true, write: false, format: 'esm', platform: 'neutral', external: ['lucide-react'] });
        return await import(`data:text/javascript,${encodeURIComponent(o.outputFiles[0].text)}`);
    } catch { return { BLOCK_ICON_KEYS: null, BLOCK_ICON_LABELS: null }; }
})();
if (keys) {
    check('TODO icono del catálogo tiene su nombre legible', keys.every(k => labels[k]));
    check('el catálogo cubre la ayuda humanitaria (alimentos, higiene, botiquín, abrigo)',
        ['food', 'basket', 'water', 'hygiene', 'firstaid', 'bedding', 'clothing', 'shelter'].every(k => keys.includes(k)));
    check('los catorce originales siguen ahí — un bloque guardado no pierde su icono',
        ['globe', 'heart', 'users', 'handheart', 'handshake', 'hearthandshake', 'gift',
            'award', 'trophy', 'star', 'sparkles', 'dollar', 'shield', 'landmark'].every(k => keys.includes(k)));
} else {
    console.log('  ⚠ catálogo de iconos: se omite (falta esbuild)');
}

// ─── v4.808: un solo camino de cobro ───────────────────────────────────────
grupo('Un solo camino de cobro para los aportes');
const tarjeta = readFileSync('src/components/PaymentBlockCard.tsx', 'utf8');
check('la tarjeta de aporte YA NO manda al carrito — ése era el camino que no cobraba',
    !tarjeta.includes('addToCart') && !tarjeta.includes("from '../contexts/CartContext'"));
check('el pago único abre el MISMO modal de donación de la página de Aportes',
    tarjeta.includes("import DonationModal from './DonationModal'") && /<DonationModal/.test(tarjeta));
check('el bloque manda su id, sus montos y qué campos ofrece',
    /blockId=\{block\.id\}/.test(tarjeta) && /presetAmounts=\{block\.presetAmounts\}/.test(tarjeta)
    && /showMessage=\{block\.showMessage\}/.test(tarjeta) && /showAnonymous=\{block\.showAnonymous\}/.test(tarjeta));
check('la MEMBRESÍA conserva su flujo de suscripción, que siempre funcionó',
    tarjeta.includes('/financial/subscribe'));

const fin8 = readFileSync('server/controllers/financialController.js', 'utf8');
check('el rótulo del aporte NO se toma del navegador: se resuelve de la config del club',
    /resolveBlockPurpose[\s\S]{0,600}FROM "Setting" WHERE key = \$1/.test(fin8)
    && !/req\.body[^\n]*purpose/.test(fin8));
check('el destino viaja a la metadata de Stripe para que el recibo lo nombre',
    /purpose: purpose \? String\(purpose\)\.slice\(0, 120\) : ''/.test(fin8));
check('el nombre del producto va de lo más específico a lo más general',
    /Aporte al proyecto[\s\S]{0,220}Aporte — \$\{campaign\.name\}[\s\S]{0,120}Aporte — \$\{block\.label\}/.test(fin8));

const pay8 = readFileSync('server/controllers/paymentController.js', 'utf8');
check('el recibo NOMBRA a qué se aportó, en el asunto y en el cuerpo',
    /purposeTopic \|\| club\?\.name/.test(pay8) && /Confirmamos tu aporte a <strong>\$\{safePurpose\}<\/strong>/.test(pay8));
check('el rótulo se escapa antes de entrar al HTML del correo',
    /const safePurpose = purpose \? String\(purpose\)\.replace/.test(pay8));

const ctrl8 = readFileSync('server/controllers/contributionCampaignController.js', 'utf8');
check('el contador público tiene freno por IP',
    /trackAllowed\(`\$\{ip\}:\$\{req\.params\.id\}`\)/.test(ctrl8));
check('el freno se declara como FRENO, no como garantía (vive en memoria por instancia)',
    /es un FRENO, no una garantía/.test(ctrl8));
check('el mapa del freno se poda: una instancia larga no acumula una entrada por visitante',
    /trackHits\.size > 5000/.test(ctrl8));

// ─── v4.811: la varita mágica del selector de íconos ───────────────────────
grupo('Sugerencia de ícono con IA');
const {
    ICON_HINTS, SUGGESTABLE_ICONS, suggestIconDeterministic, buildIconPrompt, parseIconAnswer,
} = await import('../server/lib/iconSuggest.js');

// Lo primero: un ícono que se pueda sugerir y no exista en la rejilla se
// elegiría y no se podría dibujar. La lista de la izquierda tiene que ser
// subconjunto del registro que pinta la página pública.
const pbTs = readFileSync('src/lib/paymentBlocks.ts', 'utf8');
const clavesRejilla = new Set(
    (pbTs.match(/export const BLOCK_ICONS[\s\S]*?\n\};/)?.[0] || '')
        .split('\n').map(l => l.match(/^\s{4}(\w+)\s*:/)?.[1]).filter(Boolean)
);
const huerfanos = SUGGESTABLE_ICONS.filter(k => !clavesRejilla.has(k));
check('todo ícono sugerible existe en BLOCK_ICONS (si no, se sugiere algo que no se puede pintar)',
    clavesRejilla.size > 10 && huerfanos.length === 0, huerfanos.join(', '));

check('la sugerencia determinista resuelve los textos reales de la campaña',
    suggestIconDeterministic('Alimentos no perecederos de canasta básica')?.icon === 'basket'
    && suggestIconDeterministic('Agua potable')?.icon === 'water'
    && suggestIconDeterministic('Botiquín de primeros auxilios')?.icon === 'firstaid'
    && suggestIconDeterministic('Colchonetas y cobijas')?.icon === 'bedding'
    && suggestIconDeterministic('Centro de acopio')?.icon === 'warehouse');

// La regla de la coincidencia MÁS LARGA, que es la del catálogo de intenciones
// del CRM: sin ella decidiría el orden del objeto.
check('gana la coincidencia MÁS LARGA, no la primera',
    suggestIconDeterministic('Canasta básica familiar')?.matched === 'canasta basica'
    && suggestIconDeterministic('Botiquín de primeros auxilios')?.matched === 'primeros auxilios');

// El caso que se escapó al escribir la tabla: las palabras genéricas de envase
// («artículo», «elemento») aparecen en casi todo título y, por ser largas, le
// ganaban a la específica — la caja de higiene salía con ícono de suministros.
check('una palabra genérica de envase NO le gana a la específica',
    suggestIconDeterministic('Artículos de higiene personal')?.icon === 'hygiene'
    && suggestIconDeterministic('Elementos de aseo y limpieza')?.icon === 'cleaning');

check('sin texto no se inventa una sugerencia',
    suggestIconDeterministic('') === null && suggestIconDeterministic('   ') === null
    && suggestIconDeterministic('zzz qwerty') === null);

check('las tildes no cambian el resultado',
    suggestIconDeterministic('BOTIQUÍN')?.icon === 'firstaid'
    && suggestIconDeterministic('botiquin')?.icon === 'firstaid');

// El catálogo es CERRADO: lo que conteste el modelo se valida contra él.
check('una clave inventada por el modelo se DESCARTA',
    parseIconAnswer('unicornio', SUGGESTABLE_ICONS) === null
    && parseIconAnswer('', SUGGESTABLE_ICONS) === null
    && parseIconAnswer('ninguno', SUGGESTABLE_ICONS) === null);
check('una clave válida se acepta aunque venga con adornos',
    parseIconAnswer('firstaid', SUGGESTABLE_ICONS) === 'firstaid'
    && parseIconAnswer('  FirstAid.  ', SUGGESTABLE_ICONS) === 'firstaid'
    && parseIconAnswer('water — agua potable', SUGGESTABLE_ICONS) === 'water');

const prompt = buildIconPrompt();
check('el prompt se arma con el catálogo REAL y pide una sola clave',
    prompt.includes('firstaid') && prompt.includes('ninguno')
    && SUGGESTABLE_ICONS.every(k => prompt.includes(`- ${k}:`)));
check('el prompt NO depende de una segunda tabla de rótulos que se pueda quedar atrás',
    !/ICON_LABELS/.test(readFileSync('server/lib/iconSuggest.js', 'utf8')));

const aiRoutes = readFileSync('server/routes/ai.js', 'utf8');
check('el endpoint de la varita exige sesión, como el resto de la familia /suggest-*',
    /router\.post\('\/suggest-icon', authMiddleware/.test(aiRoutes));
check('primero las PALABRAS CLAVE y sólo después el modelo',
    /suggestIconDeterministic\(texto\)[\s\S]{0,200}if \(exacto\) return res\.json/.test(aiRoutes)
    && aiRoutes.indexOf("suggestIconDeterministic(texto)") < aiRoutes.indexOf('routeToModel(defaultSlug, buildIconPrompt()'));
check('lo que contesta el modelo pasa por el catálogo cerrado antes de salir',
    /parseIconAnswer\(raw, SUGGESTABLE_ICONS\)/.test(aiRoutes));
check('sin modelo configurado DEGRADA con su motivo, no falla',
    /reason: 'sin_modelo'/.test(aiRoutes) && /reason: 'modelo_no_disponible'/.test(aiRoutes));

const pickerSrc = readFileSync('src/components/admin/IconPicker.tsx', 'utf8');
check('la varita vive en el componente COMPARTIDO, no cableada en cada pantalla',
    /suggestFrom/.test(pickerSrc) && /ai\/suggest-icon/.test(pickerSrc));
check('sin texto en la caja la varita está deshabilitada',
    /disabled=\{!puedeSugerir \|\| suggesting\}/.test(pickerSrc));
check('un fallo de la varita no impide elegir el ícono a mano',
    /catch \{[\s\S]{0,160}toast\.warning/.test(pickerSrc));

for (const pantalla of ['src/pages/admin/ContributionCampaigns.tsx', 'src/pages/admin/PaymentBlocksManager.tsx']) {
    const src = readFileSync(pantalla, 'utf8');
    const usos = (src.match(/<IconPicker/g) || []).length;
    const conVarita = (src.match(/suggestFrom=\{\{/g) || []).length;
    check(`${pantalla.split('/').pop()}: todos los selectores ofrecen la varita`,
        usos > 0 && usos === conVarita, `${conVarita}/${usos}`);
}

grupo('El carrusel del hero, en la pantalla');
const landingSrc = readFileSync('src/components/campaign/CampaignLanding.tsx', 'utf8');
check('la página usa el criterio compartido, no decide por su cuenta cuál imagen va',
    /heroSlides\(hero\)/.test(landingSrc) && !/hero\.image \?/.test(landingSrc));
check('el intervalo sale del spec, no de un número suelto en la pantalla',
    /HERO_SLIDE_MS/.test(landingSrc) && !/setInterval\([^,]+,\s*\d{3,}\)/.test(landingSrc));
// Con una sola imagen un intervalo que siempre vuelve al mismo índice es
// trabajo invisible, y unos puntos que no llevan a ninguna parte.
check('con una sola imagen no hay intervalo ni puntos',
    /if \(slideCount < 2\)/.test(landingSrc) && /slides\.length > 1 &&/.test(landingSrc));
// Se mira DENTRO del componente: el archivo tiene otros `return (` antes
// (CampaignCta), y compararlos daría un falso negativo.
check('los hooks del carrusel van ARRIBA, antes de cualquier return (regla de check:hooks)', (() => {
    const cuerpo = landingSrc.slice(landingSrc.indexOf('const CampaignLanding:'));
    return cuerpo.indexOf('const [slide, setSlide] = useState(0)') < cuerpo.indexOf('return (');
})());
check('las imágenes se cruzan por opacidad, montadas todas — no se desmontan y recargan',
    /transition-opacity duration-1000/.test(landingSrc) && /i === slide \? 'opacity-100 z-10' : 'opacity-0 z-0'/.test(landingSrc));
check('los puntos se anuncian al lector de pantalla',
    /aria-label=\{`Ver imagen \$\{i \+ 1\} de \$\{slides\.length\}`\}/.test(landingSrc));

// v4.815: títulos de sección en peso normal y el video de los elementos.
check('los títulos de sección NO van en negrilla, como el resto del sitio',
    !/<h2 className="text-3xl md:text-4xl font-black/.test(landingSrc)
    && (landingSrc.match(/<h2 className="text-3xl md:text-4xl font-light/g) || []).length >= 3);
check('la página usa el criterio compartido para los videos, no una comprobación a mano',
    /sectionVideos\(content\.requiredItemsVideos, content\.requiredItemsVideo\)/.test(landingSrc)
    && !/youtube\.com/.test(landingSrc));
check('con más de un video hay flechas atrás y siguiente',
    /aria-label="Video anterior"/.test(landingSrc) && /aria-label="Video siguiente"/.test(landingSrc)
    && /videos\.length > 1 &&/.test(landingSrc));
// v4.818: a los lados del video, a media altura y POR FUERA. El
// desplazamiento NEGATIVO es lo que las saca del marco — con `left-3` estarían
// dentro, tapando el reproductor y su barra de controles.
check('las flechas van a los lados, a media altura y FUERA del marco', (() => {
    const sec = landingSrc.slice(landingSrc.indexOf('id="elementos-requeridos"'), landingSrc.indexOf('id="centros-de-acopio"'));
    return /absolute -left-16 top-1\/2 -translate-y-1\/2/.test(sec)
        && /absolute -right-16 top-1\/2 -translate-y-1\/2/.test(sec)
        && !/absolute (left|right)-3/.test(sec) && !/bg-black\/45/.test(sec);
})());
// El posicionamiento cuelga del CONTENEDOR, no del marco del video: colgarlo
// del marco las metería dentro otra vez.
// `top-1/2` tiene que caer en el medio del VIDEO, no del bloque entero —que
// incluye el pie y los puntos y dejaba las flechas 36 px por debajo.
check('las flechas cuelgan de un envoltorio que mide lo que el video', (() => {
    const sec = landingSrc.slice(landingSrc.indexOf('id="elementos-requeridos"'), landingSrc.indexOf('id="centros-de-acopio"'));
    return /Este envoltorio existe SÓLO para posicionar/.test(sec)
        && sec.indexOf('<div className="relative">') < sec.indexOf('aspectRatio');
})());
// Sin margen lateral no hay dónde ponerlas sin volver a invadir el video: en
// pantallas angostas quedan las de la fila de abajo.
check('en pantallas angostas quedan las flechas compactas de abajo',
    /hidden xl:flex absolute -left-16/.test(landingSrc)
    && /xl:hidden w-10 h-10[\s\S]{0,260}ChevronLeft/.test(landingSrc));
// Un video que se cambia solo mientras alguien lo mira es un defecto, no una
// animación: acá NO hay intervalo, al revés que el hero.
check('los videos NO rotan solos', (() => {
    const sec = landingSrc.slice(landingSrc.indexOf('id="elementos-requeridos"'), landingSrc.indexOf('id="centros-de-acopio"'));
    return !/setInterval/.test(sec);
})());
// Montar los demás descargaría varios videos de una vez, y sin remontar el
// anterior seguiría sonando al cambiar.
check('se dibuja SÓLO el video que manda, y se remonta al cambiar',
    /key=\{videoActual\.url\}/.test(landingSrc));
check('un índice que quedó fuera de rango no rompe la sección',
    /videos\[Math\.min\(videoIdx, videos\.length - 1\)\] \|\| null/.test(landingSrc));

// v4.817: el botón que cierra la sección de elementos.
check('el botón configurado pasa por CampaignCta, no por una copia a mano',
    /itemsCta\?\.label \? \([\s\S]{0,300}<CampaignCta cta=\{itemsCta\}/.test(landingSrc));
// Regla aditiva: una campaña guardada antes no puede quedarse sin su botón.
check('sin configurar se conserva el «Ver centros de acopio» de siempre',
    /\) : hasCenters && \(/.test(landingSrc) && /Ver centros de acopio/.test(landingSrc));
check('el botón se normaliza con el MISMO normalizeCta que el resto', (() => {
    const n = normalizeContent({ requiredItemsCta: { label: 'Quiero donar', action: 'donate', url: 'javascript:x' } });
    // La URL peligrosa se descarta aunque la acción no la use: acabaría en un href.
    return n.requiredItemsCta.label === 'Quiero donar' && n.requiredItemsCta.action === 'donate'
        && n.requiredItemsCta.url === '';
})());
check('un botón sin configurar queda vacío y no se pinta',
    normalizeContent({}).requiredItemsCta.label === '');
check('el video va DESPUÉS de las cajas de elementos', (() => {
    const sec = landingSrc.slice(landingSrc.indexOf('id="elementos-requeridos"'), landingSrc.indexOf('id="centros-de-acopio"'));
    return sec.indexOf('requiredItems.map') < sec.indexOf('{videoActual &&');
})());
// Un archivo propio no se puede meter en un iframe: se reproduce con el
// reproductor del navegador, y al revés tampoco funciona.
check('un archivo propio va en <video> y un embed en <iframe>',
    /videoActual\.video\.kind === 'file' \?/.test(landingSrc)
    && /<video[\s\S]{0,400}controls/.test(landingSrc) && /<iframe[\s\S]{0,700}allowFullScreen/.test(landingSrc));

// v4.819: los centros llevan el fondo de la banda «Somos gente de acción».
check('la sección de centros usa el MISMO fondo de la portada, no una copia', (() => {
    const sec = landingSrc.slice(landingSrc.indexOf('id="centros-de-acopio"'), landingSrc.indexOf('centersAlliance'));
    return /style=\{SITE_ACTION_BG\}/.test(sec) && !/0c3c7c/.test(landingSrc);
})());
const chrome = readFileSync('src/lib/siteChrome.ts', 'utf8');
const action = readFileSync('src/sections/ActionSection.tsx', 'utf8');
check('el fondo vive en siteChrome y lo consumen las DOS secciones',
    /SITE_ACTION_BG = \{[\s\S]{0,240}geo-darkblue\.png/.test(chrome)
    && /SITE_ACTION_BG/.test(action) && !/0c3c7c/.test(action));
// Sobre el azul, el texto en gris oscuro sería ilegible.
check('sobre el fondo oscuro los textos de la sección van en claro', (() => {
    const sec = landingSrc.slice(landingSrc.indexOf('id="centros-de-acopio"'), landingSrc.indexOf('id="rotarios-en-accion"'));
    return /Centros de acopio[\s\S]{0,60}<\/h2>/.test(sec) && /font-light text-white tracking-tight/.test(sec)
        && /text-center text-white\/80 max-w-2xl/.test(sec) && !/text-gray-500 max-w-2xl/.test(sec);
})());

// v4.821: la galería, entre los centros de acopio y el panorama.
check('la galería va DESPUÉS de los centros y ANTES del panorama',
    landingSrc.indexOf('id="centros-de-acopio"') < landingSrc.indexOf('id="rotarios-en-accion"')
    && landingSrc.indexOf('id="rotarios-en-accion"') < landingSrc.indexOf('id="panorama"'));
check('la página usa el criterio compartido de la galería',
    /galleryItems\(content\.gallery\?\.items\)/.test(landingSrc));
// v4.822: la tira ocupa el ancho de la pantalla, así que va FUERA del
// contenedor centrado — dentro quedaría del ancho del texto.
check('la tira va a lo ancho, fuera del contenedor centrado', (() => {
    const sec = landingSrc.slice(landingSrc.indexOf('id="rotarios-en-accion"'), landingSrc.indexOf('id="panorama"'));
    return sec.indexOf('max-w-[1100px]') < sec.indexOf('<CampaignGallery')
        && !/max-w-4xl[\s\S]{0,200}<CampaignGallery/.test(sec);
})());

const galSrc = readFileSync('src/components/campaign/CampaignGallery.tsx', 'utf8');
check('la tira se desplaza sola con la animación del TEMA, no con un `<style>` propio',
    /animate-gallery-marquee/.test(galSrc) && !/@keyframes/.test(galSrc));
// Sin esto, la tarjeta crece mientras se escapa hacia el costado: no se puede
// mirar ni pulsar. Es lo que hace utilizable el agrandado.
check('la tira SE DETIENE al pasar el cursor',
    /hover:\[animation-play-state:paused\]/.test(galSrc));
check('la tarjeta se agranda al pasar el cursor, y crece la imagen DENTRO del marco',
    /group-hover:scale-110/.test(galSrc) && /overflow-hidden/.test(galSrc));
// La lista se duplica para que el desplazamiento no tenga costura; la copia
// va oculta al lector de pantalla — las piezas son las que hay, no el doble.
check('la lista se duplica y la copia va con aria-hidden',
    /key=\{`a-\$\{i\}`\}/.test(galSrc) && /key=\{`b-\$\{i\}`\} item=\{it\}[\s\S]{0,60}aria=\{false\}/.test(galSrc)
    && /aria-hidden=\{!aria\}/.test(galSrc));
check('el desplazamiento es de la MITAD: por eso la vuelta al inicio no se ve',
    /translateX\(-50%\)/.test(readFileSync('tailwind.config.js', 'utf8')));
// Con duración fija, más piezas desfilarían más rápido.
check('la velocidad es proporcional a la cantidad de piezas',
    /items\.length \* SEGUNDOS_POR_PIEZA/.test(galSrc) && /animationDuration: duracion/.test(galSrc));
// En una tira en movimiento no se puede ver un video: en la tira es una
// tarjeta con carátula, y se reproduce en la ventana en grande.
check('un video NO se reproduce dentro de la tira: se abre en grande',
    !/<video[\s\S]{0,400}controls[\s\S]{0,200}group-hover/.test(galSrc)
    && /role="dialog"/.test(galSrc) && /autoPlay/.test(galSrc));
check('la ventana se cierra con Escape y se recorre con las flechas del teclado',
    /e\.key === 'Escape'/.test(galSrc) && /e\.key === 'ArrowRight'/.test(galSrc));
check('el clic del fondo cierra y el de dentro NO',
    /onClick=\{e => e\.stopPropagation\(\)\}/.test(galSrc));
check('quien pidió menos animación recibe la tira quieta y desplazable a mano',
    /motion-reduce:animate-none/.test(galSrc) && /motion-reduce:overflow-x-auto/.test(galSrc));
check('el crédito de quien mandó la pieza es un DATO: no se traduce',
    (galSrc.match(/data-no-translate/g) || []).length >= 2);

// v4.820: dentro de las tarjetas manda el azul del sitio, no el acento rojo.
check('el detalle de las tarjetas va en el azul del sitio, no en el acento de la campaña', (() => {
    const sec = landingSrc.slice(landingSrc.indexOf('id="centros-de-acopio"'), landingSrc.indexOf('id="rotarios-en-accion"'));
    return /MapPin className="w-5 h-5 text-rotary-blue"/.test(sec)
        && /tracking-wider mb-2 text-rotary-blue/.test(sec)
        && /border-l-2 border-sky-200 pl-3/.test(sec)
        && !/color: accent/.test(sec) && !/\$\{accent\}33/.test(sec);
})());
// El rojo se queda donde hay que PULSAR: el botón de la sección y los de aporte.
check('el acento de la campaña sigue mandando en los botones',
    /style=\{\{ backgroundColor: accent \}\}/.test(landingSrc));
// `rotary-blue` es una clase a mano de index.css: no genera modificadores de
// opacidad, así que un `border-rotary-blue/20` no existiría, en silencio
// (v4.719). Se buscan sólo los USOS: un comentario tiene que poder nombrar la
// clase que se descartó sin hacer fallar la prueba.
check('no se usa un modificador de opacidad sobre rotary-blue', (() => {
    const sinComentarios = landingSrc.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
    return !/(bg|text|border)-rotary-blue\//.test(sinComentarios);
})());

// v4.814: los centros van en mampostería, no en rejilla.
check('las tarjetas de ciudad NO van en una rejilla que las estire a la más alta', (() => {
    // Se ancla en el `id` de la sección, no en la primera mención: el enlace
    // del CTA nombra el ancla mucho antes y la porción abarcaría medio archivo.
    const bloque = landingSrc.slice(landingSrc.indexOf('id="centros-de-acopio"'), landingSrc.indexOf('centersAlliance'));
    return /columns-1 md:columns-2/.test(bloque) && !/grid-cols-2/.test(bloque);
})());
// Sin esto una ciudad con muchas direcciones se parte entre dos columnas.
check('una ciudad no se parte entre columnas', /break-inside-avoid mb-6 bg-white/.test(landingSrc));

// v4.813: el acercamiento lento, compartido con los otros heroes.
check('el acercamiento va en la imagen que MANDA, no en las que no se ven',
    /i === slide \? 'animate-hero-zoom' : ''/.test(landingSrc));
const tw = readFileSync('tailwind.config.js', 'utf8');
check('el acercamiento vive en el TEMA, con su duración y su relleno final',
    /"hero-zoom":\s*\{[\s\S]{0,160}scale\(1\.08\)/.test(tw)
    && /"hero-zoom":\s*"hero-zoom 5s ease-out forwards"/.test(tw));
// Tres pantallas lo llevaban escrito a mano, idéntico: la copia que se queda
// atrás hace que el mismo efecto se vea distinto según por dónde se entre.
for (const f of ['src/sections/HeroSection.tsx', 'src/sections/YEPHero.tsx', 'src/components/campaign/CampaignLanding.tsx']) {
    const src = readFileSync(f, 'utf8');
    check(`${f.split('/').pop()}: usa el acercamiento del tema y no una copia propia`,
        /animate-hero-zoom/.test(src) && !/@keyframes zoomIn/.test(src) && !/hero-slide-image/.test(src));
}
// La lección de v4.719: una clase que no llega al CSS compilado no existe, en
// silencio. El bloque se salta si no hay dist/ — no es una prueba de criterio.
const cssFile = (() => {
    try { return readdirSync('dist/assets').find(f => /^index-.*\.css$/.test(f)); } catch { return null; }
})();
if (cssFile) {
    const css = readFileSync(`dist/assets/${cssFile}`, 'utf8');
    check('la clase llega DE VERDAD al CSS compilado (no basta con declararla)',
        css.includes('animate-hero-zoom') && /@keyframes hero-zoom/.test(css));
} else {
    console.log('  ⚠ CSS compilado: se omite (falta dist/).  npx vite build');
}

const adminSrc = readFileSync('src/pages/admin/ContributionCampaigns.tsx', 'utf8');
check('el editor ofrece las DOS vías para agregar imágenes (v4.700)',
    /startUpload\('heroAdd'\)/.test(adminSrc) && /setPickerField\('heroAdd'\)/.test(adminSrc));
check('se pueden elegir VARIAS de la Biblioteca de una vez',
    /maxSelection=\{pickerField === 'heroAdd' \? HERO_MAX_SLIDES : pickerField === 'itemsVideoAdd' \? MAX_SECTION_VIDEOS : pickerField === 'galleryAdd' \? MAX_GALLERY_ITEMS : 1\}/.test(adminSrc)
    && /<input ref=\{fileInputRef\} type="file" multiple/.test(adminSrc));
check('el editor no inventa su propio tope: usa el del spec',
    /HERO_MAX_SLIDES/.test(adminSrc) && !/slice\(0,\s*8\)/.test(adminSrc));
check('una campaña con una sola imagen se ve en el editor como su primera fila',
    /hero\.images\?\.length \? hero\.images : heroSlides\(hero\)/.test(adminSrc));
check('el editor avisa EN VIVO, por fila, cuando un enlace no se reconoce',
    /v\.url && !kind/.test(adminSrc) && /resolveCampaignVideo\(v\.url\)/.test(adminSrc));
check('la lista de videos ofrece las DOS vías (v4.700) y además pegar un enlace',
    /startUpload\('itemsVideoAdd'\)/.test(adminSrc) && /setPickerField\('itemsVideoAdd'\)/.test(adminSrc)
    && /Pegar un enlace/.test(adminSrc));
check('una campaña con UN video lo ve en el editor como su primera fila',
    /content\.requiredItemsVideos\?\.length \? content\.requiredItemsVideos/.test(adminSrc));
check('el editor no inventa su propio tope de videos: usa el del spec',
    /MAX_SECTION_VIDEOS/.test(adminSrc));
const pickerGal = readFileSync('src/components/admin/content-studio/MediaPicker.tsx', 'utf8');
check('la Biblioteca se abre SIN filtro para la galería: ahí conviven fotos y videos',
    /mediaType !== 'all'/.test(pickerGal)
    && /pickerField\?\.startsWith\('gallery'\) \? 'all'/.test(adminSrc));
check('la galería ofrece las DOS vías y además pegar un enlace',
    /startUpload\('galleryAdd'\)/.test(adminSrc) && /setPickerField\('galleryAdd'\)/.test(adminSrc));
check('su diálogo de archivo acepta fotos Y videos',
    /accept=\{`\$\{IMAGE_ACCEPT\},\$\{VIDEO_ACCEPT\}`\}/.test(adminSrc));

check('el botón del final se edita con el MISMO CtaEditor que el resto',
    /<CtaEditor label="Botón al final de la sección"[\s\S]{0,200}requiredItemsCta/.test(adminSrc));
check('el editor DICE qué pasa si se deja vacío',
    /Sin texto se conserva el botón «Ver centros de acopio»/.test(adminSrc));
// Un diálogo que ofrece fotos a quien va a subir un video ofrece lo que no
// sirve; el `accept` del input se lee al abrirlo, así que hace falta el suyo.
check('el diálogo de archivo y la Biblioteca se abren en modo VIDEO para ese campo',
    /VIDEO_ACCEPT/.test(adminSrc) && /target\.startsWith\('itemsVideo'\) \? videoInputRef/.test(adminSrc)
    && /pickerField\?\.startsWith\('itemsVideo'\) \? 'video'/.test(adminSrc));
const pickerFile = readFileSync('src/components/admin/content-studio/MediaPicker.tsx', 'utf8');
check('el selector conserva las imágenes por omisión: nueve pantallas ya lo usaban así',
    /mediaType = 'image'/.test(pickerFile)
    && /if \(mediaType !== 'all'\) params\.set\('type', mediaType\);/.test(pickerFile));

// ─── Resumen ───────────────────────────────────────────────────────────────
console.log(`\n${ok} comprobaciones pasaron${malos.length ? `, ${malos.length} FALLARON:` : '.'}`);
for (const m of malos) console.log(`  ✗ ${m}`);
process.exit(malos.length ? 1 : 0);
