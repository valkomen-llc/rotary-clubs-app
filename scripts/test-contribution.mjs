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
import {
    ROLL_MAX_NAMES, cleanDonorName, publicDonorName, countsInRoll, buildContributorRoll,
} from '../server/lib/contributorRoll.js';

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
// ⚠️ UN SOLO MÓDULO Y UNA SOLA DIRECCIÓN (v4.986). «Maneras de Contribuir» era
// otro nombre y otra pantalla para la misma funcionalidad; ahora redirige y no
// queda ninguna otra ruta que la sirva.
check('⚠️ `/admin/maneras-de-contribuir` REDIRIGE y no monta ninguna pantalla',
    /path="\/admin\/maneras-de-contribuir"\s*\n\s*element=\{<Navigate to="\/admin\/campanas-contribucion" replace \/>\}/.test(appTsx));
// ⚠️ UNA SOLA PANTALLA (v4.987). v4.986 la partió en dos vistas por rol y la
// del sitio era la vieja «Maneras de Contribuir» rebautizada — se quedaba
// atrás en cada mejora de la otra. Ahora la ruta monta la MISMA para todos y
// el alcance lo resuelve el servidor.
check('⚠️ …y la dirección única monta UNA sola pantalla para todos',
    /path="\/admin\/campanas-contribucion"[\s\S]{0,140}<ContributionCampaigns \/>/.test(appTsx)
    && !/ContributionCampaignsHome|SiteContributionCampaigns/.test(appTsx));
const layout = readFileSync('src/components/admin/AdminLayout.tsx', 'utf8');
check('⚠️ el menú no ofrece «Maneras de Contribuir» en ningún rol',
    !/label: 'Maneras de Contribuir'/.test(layout));
check('⚠️ …y la entrada del sitio no se le duplica al operador, que ya la tiene',
    /if \(!isSuperAdmin\) \{[\s\S]{0,400}path: '\/admin\/campanas-contribucion', category: 'Contenido'/.test(layout));

const guard = readFileSync('scripts/db-push-guard.mjs', 'utf8');
check('las cinco tablas figuran en la documentación del guardián de db:push',
    ['ContributionCampaign', 'ContributionCenter', 'ContributionCampaignOverride',
        'ContributionCampaignHistory', 'ContributionCampaignMetric'].every(t => guard.includes(t)));

const routes = readFileSync('server/routes/contribution-campaigns.js', 'utf8');
check('la gestión exige rol administrativo del sitio O permiso, y la lectura pública no lleva sesión',
    /siteRead, listCampaigns/.test(routes) && /siteWrite, createCampaign/.test(routes)
    && /router\.get\('\/active', getActiveCampaign\)/.test(routes));

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
// v4.987: el editor de centros centrales entra también el sitio, y guardar
// exige PROPIEDAD de la campaña (lo decide el controlador, no la ruta).
check('el editor de centros exige rol o permiso, y guardar exige propiedad',
    /siteRead, listCenters/.test(rutas3) && /siteWrite, saveCenters/.test(rutas3)
    && /export const saveCenters = async[\s\S]{0,600}scopedCampaign\(req, req\.params\.id, \{ write: true \}\)/.test(controller));

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
// v4.986 — la vía del club dejó de exigir SÓLO el rol: es «el rol de siempre
// **o** el permiso», para que una cuenta institucional entre con
// `contribution_campaigns.edit` sin que los administradores pierdan nada si la
// consulta del grant falla (regla de v4.941). Y se declara por ACCIÓN.
check('la vía del club exige rol o permiso y va ANTES de /:id',
    /siteRead = requireRoleOrPermission\(SITE_ADMIN_ROLES, 'contribution_campaigns\.view'\)/.test(rutas4)
    && /siteWrite = requireRoleOrPermission\(SITE_ADMIN_ROLES, 'contribution_campaigns\.edit'\)/.test(rutas4)
    && /siteRead, getSiteCampaign/.test(rutas4) && /siteWrite, saveSiteOverride/.test(rutas4)
    && rutas4.indexOf("'/site/current'") < rutas4.indexOf("'/:id/preview'"));
check('⚠️ leer y escribir NO comparten permiso: quien mira no edita por eso',
    !/siteRead, saveSite/.test(rutas4) && /siteRead, listSiteCampaigns/.test(rutas4));

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
// v4.836: `asset_generated` se suma al final. El catálogo sigue CERRADO —sin
// esa puerta el endpoint público sería un contador arbitrario— y el orden es el
// del embudo, con la generación de piezas aparte porque no es tráfico de la
// landing.
check('el catálogo de tipos de métrica es CERRADO y cubre el embudo',
    eq(METRIC_TYPES, ['view', 'cta_donate_click', 'cta_centers_click', 'share_click', 'checkout_started', 'donation_completed', 'asset_generated']));

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
    // El return que importa es el que DEVUELVE JSX, y se reconoce por el
    // salto de línea: un `return () => …` de la limpieza de un efecto también
    // empieza por «return (» y daría un falso negativo — pasó al agregar la
    // línea de aportantes (v4.862), con los hooks perfectamente ordenados.
    return cuerpo.indexOf('const [slide, setSlide] = useState(0)') < cuerpo.indexOf('return (\n');
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
// La regla de v4.818 —no tapar el reproductor ni su barra de controles— sigue
// en pie; lo que cambió es CÓMO se cumple. Hasta v4.828 las flechas salían del
// marco con un desplazamiento negativo; desde v4.829 caben dentro del
// contenedor porque el espacio de los lados lo ocupan los vecinos atenuados.
check('las flechas van a media altura y NO sobre el reproductor', (() => {
    const sec = landingSrc.slice(landingSrc.indexOf('id="elementos-requeridos"'), landingSrc.indexOf('id="centros-de-acopio"'));
    return /absolute left-4 xl:left-10 top-1\/2 -translate-y-1\/2/.test(sec)
        && /absolute right-4 xl:right-10 top-1\/2 -translate-y-1\/2/.test(sec)
        // Los vecinos son lo que libera ese espacio: sin ellos, una flecha
        // ahí estaría encima del video.
        && /VideoVecino/.test(sec);
})());
// El posicionamiento cuelga del CONTENEDOR, no del marco del video: colgarlo
// del marco las metería dentro otra vez.
// `top-1/2` tiene que caer en el medio del VIDEO, no del bloque entero —que
// incluye el pie y los puntos y dejaba las flechas 36 px por debajo.
check('las flechas cuelgan del envoltorio de la FILA, no del bloque entero', (() => {
    const sec = landingSrc.slice(landingSrc.indexOf('id="elementos-requeridos"'), landingSrc.indexOf('id="centros-de-acopio"'));
    // El `relative` va antes del `overflow-hidden` de la fila y ANTES del pie
    // y los puntos: si envolviera el bloque entero, `top-1/2` caería por
    // debajo del centro del video (el defecto medido en v4.818).
    return sec.indexOf('<div className="relative">') < sec.indexOf('overflow-hidden -mx-4')
        && sec.indexOf('overflow-hidden -mx-4') < sec.indexOf('videoActual.title &&');
})());
// Sin margen lateral no hay dónde ponerlas sin volver a invadir el video: en
// pantallas angostas quedan las de la fila de abajo.
// Por debajo de `lg` no hay ancho para que un vecino asome sin comerse el
// reproductor, así que ahí no hay vecinos NI flechas laterales: quedan las
// compactas de la fila de abajo, o no habría forma de pasar de video.
check('en pantallas angostas quedan las flechas compactas de abajo',
    /hidden lg:flex absolute left-4/.test(landingSrc)
    && /lg:hidden disabled:opacity-30[\s\S]{0,300}ChevronLeft/.test(landingSrc));
// v4.830 invierte la regla de v4.816. Lo que la hacía necesaria eran los dos
// frenos que ahora existen: se detiene con el cursor encima y se detiene
// MIENTRAS se está viendo. Sin esos dos frenos, quitar el intervalo. Los dos
// son reversibles desde v4.832 — ver su grupo.
check('los videos rotan solos, y se frenan con el cursor y con el play',
    /setInterval\(\(\) => setVideoPos\(p => \{[\s\S]{0,600}\}\), VIDEO_ROTA_MS\)/.test(landingSrc)
    && /if \(videoCount < 2 \|\| videoQuieto \|\| videoTomado\) return;/.test(landingSrc)
    && /onMouseEnter=\{\(\) => setVideoQuieto\(true\)\}/.test(landingSrc)
    && /onMouseLeave=\{\(\) => setVideoQuieto\(false\)\}/.test(landingSrc)
    && /onPlay=\{\(\) => setVideoTomado\(true\)\}/.test(landingSrc));
// Montar los demás descargaría varios videos de una vez, y sin remontar el
// anterior seguiría sonando al cambiar.
// Desde v4.831 la tira pinta todas las diapositivas, pero el REPRODUCTOR lo
// monta sólo la activa: las demás son previsualizaciones, así que nunca hay
// más de una incrustación por visita. `key` fuerza el remontaje al cambiar.
check('se monta SÓLO el reproductor del video que manda, y se remonta al cambiar',
    /key=\{v\.url\}/.test(landingSrc) && /\{activo \? \(/.test(landingSrc));
// Desde v4.832 la posición es un índice ABSOLUTO en la tira repetida y el
// número del video sale del resto — que acota solo, sin otro efecto.
check('un índice que quedó fuera de rango no rompe la sección',
    /const videoActual = videos\[idxVideo\] \|\| null;/.test(landingSrc)
    && /\(\(videoPos % videos\.length\) \+ videos\.length\) % videos\.length/.test(landingSrc));

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
    /v\.video\.kind === 'file' \?/.test(landingSrc)
    && /<video[\s\S]{0,900}controls/.test(landingSrc) && /<iframe[\s\S]{0,900}allowFullScreen/.test(landingSrc));

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
// v4.828: el panorama subió a justo debajo del hero, así que la galería ya no
// va «antes del panorama». Lo que se conserva es su lugar tras los centros:
// «qué se necesita» y «dónde llevarlo» son un par que no se corta.
check('la galería va DESPUÉS de los centros de acopio',
    landingSrc.indexOf('id="centros-de-acopio"') < landingSrc.indexOf('id="rotarios-en-accion"'));
check('la página usa el criterio compartido de la galería',
    /galleryItems\(content\.gallery\?\.items\)/.test(landingSrc));
// v4.822: la tira ocupa el ancho de la pantalla, así que va FUERA del
// contenedor centrado — dentro quedaría del ancho del texto.
check('la tira va a lo ancho, fuera del contenedor centrado', (() => {
    const i = landingSrc.indexOf('id="rotarios-en-accion"');
    const sec = landingSrc.slice(i, landingSrc.indexOf('</section>', i));
    return sec.indexOf('max-w-[1100px]') < sec.indexOf('<CampaignGallery')
        && !/max-w-4xl[\s\S]{0,200}<CampaignGallery/.test(sec);
})());

const galSrc = readFileSync('src/components/campaign/CampaignGallery.tsx', 'utf8');
// v4.823: el desplazamiento es NATIVO, no una animación de CSS. Una animación
// no cede el control —no se puede arrastrar— y con «reducir movimiento» del
// sistema dejaba la tira quieta.
check('la tira se desplaza de forma NATIVA, no con una animación de CSS',
    /overflow-x-auto/.test(galSrc) && !/animate-gallery-marquee/.test(galSrc)
    && !/gallery-marquee/.test(readFileSync('tailwind.config.js', 'utf8')));
check('avanza sola de a una tarjeta, empujando el desplazamiento',
    /setInterval\(/.test(galSrc) && /scrollBy\(\{ left: paso\(\), behavior: 'smooth' \}\)/.test(galSrc)
    && /MS_POR_PIEZA/.test(galSrc));
// El paso no se puede fijar en el código: el ancho de la tarjeta cambia con
// el tamaño de la pantalla. Se toma de la DISTANCIA entre dos tarjetas.
check('el paso se MIDE entre dos tarjetas, no se supone',
    /c\[1\]\.offsetLeft - c\[0\]\.offsetLeft/.test(galSrc));
// Pasada una vuelta se resta una vuelta SIN animación: las copias son
// idénticas, así que el salto no se ve y el ciclo es continuo.
check('el ciclo es continuo y el salto no se ve',
    /el\.scrollLeft >= v\)/.test(galSrc) && /behavior: 'instant'/.test(galSrc));
// El defecto medido: con DOS copias, el punto de salto —una vuelta— sólo se
// alcanza si una copia es más ancha que la tira. Con tres piezas en 1280 px la
// tira llegaba al tope (652) y se quedaba ahí, sin parecer un fallo.
check('las copias se MIDEN: una vuelta tiene que caber en el recorrido',
    /Math\.max\(2, Math\.ceil\(el\.clientWidth \/ v\) \+ 1\)/.test(galSrc)
    && /addEventListener\('resize', calc\)/.test(galSrc));
check('la tira SE DETIENE con el cursor encima y con la ventana abierta',
    /onMouseEnter=\{\(\) => setQuieta\(true\)\}/.test(galSrc)
    && /if \(items\.length < 2 \|\| quieta \|\| abierta !== null\) return;/.test(galSrc));
// Se pidió que la tarjeta se amplíe, no sólo la imagen dentro del marco.
check('al pasar el cursor crece la TARJETA entera',
    /hover:scale-\[1\.07\]/.test(galSrc));
// Un contenedor con desplazamiento horizontal no deja asomar nada por arriba.
check('la tira lleva relleno vertical para que el crecimiento no se recorte',
    /overflow-x-auto overflow-y-hidden py-6/.test(galSrc));
check('las tarjetas son CUADRADAS: las fotos vienen en proporciones dispares',
    /aspect-square/.test(galSrc));
// v4.824: SIN barra de desplazamiento. Una barra debajo de una tira que ya se
// mueve sola es un control que casi nadie usa y que parte la sección en dos; y
// la del navegador tampoco se muestra (`no-scrollbar`).
check('la tira NO lleva barra de desplazamiento',
    !/role="scrollbar"/.test(galSrc) && /no-scrollbar/.test(galSrc));
// Se pidió que pasen más rápido. Es el único número que gobierna la cadencia.
check('la cadencia es un solo número y va a 1,8 s por pieza',
    /const MS_POR_PIEZA = 1800;/.test(galSrc)
    && (galSrc.match(/MS_POR_PIEZA/g) || []).length === 2);
// Con un marco 16:9 fijo, una foto vertical queda entre dos franjas negras.
check('en grande, la FOTO define la caja — sin franjas a los lados',
    /max-w-\[92vw\] max-h-\[82vh\] w-auto h-auto object-contain/.test(galSrc));
check('un video propio también trae su proporción',
    /<video[\s\S]{0,240}max-w-\[92vw\] max-h-\[82vh\] w-auto h-auto/.test(galSrc));
// Un `<iframe>` no declara tamaño propio: ahí 16:9 no es una suposición.
check('sólo el video EMBEBIDO conserva el marco 16:9, porque no tiene tamaño propio',
    /aspectRatio: '16 \/ 9'[\s\S]{0,300}<iframe/.test(galSrc));
// La pieza cambia de tamaño con cada foto: los botones saltarían de sitio.
check('los controles cuelgan de la VENTANA, no de la pieza', (() => {
    const dialogo = galSrc.slice(galSrc.indexOf('role="dialog"'));
    return dialogo.indexOf('</div>\n                    </div>') < dialogo.indexOf('aria-label="Cerrar"')
        && /onClick=\{e => \{ e\.stopPropagation\(\); setAbierta\(null\); \}\}/.test(dialogo);
})());
// La lista se repite para el ciclo; las copias van ocultas al lector.
check('la lista se repite y sólo la primera vuelta existe para el lector',
    /Array\.from\(\{ length: copias \}\)/.test(galSrc)
    && /aria-hidden=\{c > 0 \|\| undefined\}/.test(galSrc)
    && /aria=\{c === 0\}/.test(galSrc));
check('un video NO se reproduce dentro de la tira: se abre en grande',
    !/<video[\s\S]{0,400}group-hover/.test(galSrc) && /role="dialog"/.test(galSrc) && /autoPlay/.test(galSrc));
check('la ventana se cierra con Escape y se recorre con las flechas del teclado',
    /e\.key === 'Escape'/.test(galSrc) && /e\.key === 'ArrowRight'/.test(galSrc));
check('el clic del fondo cierra y el de dentro NO',
    /onClick=\{e => e\.stopPropagation\(\)\}/.test(galSrc));
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

// ═══════════════════════════════════════════════════════════════════════════
// v4.825 — Lectura automatizada del «Panorama de la emergencia»
//
// Los números de estas pruebas son los MEDIDOS sobre el propio sismo de San
// José del Palmar: para el mismo hecho, con cortes de horas de diferencia,
// los medios daban 284/287/288/294 fallecidos mientras la UNGRD publicaba
// 289, y las personas afectadas BAJARON de 145.601 a 115.461. Es el caso
// real, no uno inventado para que la prueba pase.
// ═══════════════════════════════════════════════════════════════════════════
const feedMod = await import('../server/lib/emergencyFeed.js');
const {
    FEED_METRICS, METRIC_KEYS, SOURCE_KINDS, normalizeFeed, validateFeed,
    INTERVAL_OPTIONS, DEFAULT_INTERVAL_MINUTES, FEED_PRESETS, shouldRunNow, MIN_POLL_MINUTES,
    isFetchableUrl, parseFigure, formatFigure, parseCutoff, parseExtraction,
    judgeReading, readingKey, applyReading, formatCutoff,
    publishedValueOf, publishedCutoffOf, buildExtractionPrompt,
} = feedMod;

grupo('v4.825 — leer una cifra');
// El separador de miles en Colombia es el PUNTO: «14.705» son catorce mil.
check('«14.705» son 14705 y «3.937» son 3937',
    parseFigure('14.705')?.value === 14705 && parseFigure('3.937')?.value === 3937);
check('«289» es 289 y no lleva calificador',
    parseFigure('289')?.value === 289 && parseFigure('289')?.approx === false);
// «más de 102.000» NO es una cifra: es una cota. Se lee, y se marca.
check('«más de 102.000» se lee como aproximada',
    parseFigure('más de 102.000')?.value === 102000 && parseFigure('más de 102.000')?.approx === true);
check('lo que no es un entero legible se rechaza en vez de adivinarse',
    parseFigure('varios cientos') === null && parseFigure('12,5') === null
    && parseFigure('1.20') === null && parseFigure('') === null);
check('la cifra se imprime con separador de miles', formatFigure(14705) === '14.705');

grupo('v4.825 — la fecha de corte');
check('acepta el formato de la UNGRD (dd/mm/aaaa hh:mm)',
    parseCutoff('15/08/2026 18:30') === '2026-08-15T18:30:00.000Z');
check('acepta ISO', parseCutoff('2026-08-15T18:30:00Z') === '2026-08-15T18:30:00.000Z');
check('sin corte legible devuelve vacío', parseCutoff('el jueves') === '' && parseCutoff('') === '');
check('se rotula como se cita', formatCutoff('2026-08-15T18:30:00Z') === '15/08/2026 6:30 p. m.');

grupo('v4.825 — el modelo extrae, el código decide');
const extraccion = parseExtraction(JSON.stringify({
    cutoff: '15/08/2026 18:30',
    figures: [
        { metric: 'fallecidos', value: '289', quote: '289 Personas Fallecidas' },
        { metric: 'heridos', value: '3.937' },
        { metric: 'inventada', value: '5' },
        { metric: 'fallecidos', value: '300' },
        { metric: 'municipios', value: 'muchos' },
    ],
}));
check('sobrevive lo del catálogo y legible', extraccion.figures.length === 2);
check('una métrica inventada se descarta y se DICE',
    extraccion.descartes.some(d => /inventada/.test(d)));
check('la repetida se descarta y se dice',
    extraccion.descartes.some(d => /venía dos veces/.test(d)));
check('lo que no es cifra se descarta y se dice',
    extraccion.descartes.some(d => /no es una cifra legible/.test(d)));
check('el corte viaja normalizado', extraccion.cutoff === '2026-08-15T18:30:00.000Z');
check('una respuesta que no es JSON no revienta: devuelve el motivo',
    parseExtraction('lo siento, no puedo').figures.length === 0
    && parseExtraction('lo siento, no puedo').descartes.length === 1);
// El catálogo del prompt se arma desde FEED_METRICS: una métrica nueva que
// no llegue al prompt no se extraería nunca.
check('el prompt enumera TODAS las métricas del catálogo',
    METRIC_KEYS.every(k => buildExtractionPrompt().includes(k)));

grupo('v4.825 — el juicio de una lectura');
const oficial = { id: 's1', name: 'UNGRD', url: 'https://portal.gestiondelriesgo.gov.co/x', kind: 'oficial', format: 'imagen', active: true };
const medio = { ...oficial, id: 's2', name: 'El Contraste', kind: 'secundaria' };
const feedOn = { enabled: true, autoPublish: true, maxJumpPct: 40, sources: [oficial, medio] };
const AHORA = new Date('2026-08-16T00:00:00Z');
const juzgar = (o) => judgeReading({
    figure: { metric: 'fallecidos', value: 289, approx: false }, source: oficial,
    cutoff: '15/08/2026 18:30', current: 288, publishedCutoff: '2026-08-14T16:30:00Z',
    feed: feedOn, now: AHORA, ...o,
});
check('una lectura oficial, nueva y sin sobresaltos se publica sola', juzgar({}).autoPublish === true);
check('la propuesta trae el antes, el después y la diferencia',
    juzgar({}).before === 288 && juzgar({}).after === 289 && juzgar({}).delta === 1);
// La regla del módulo: una fuente secundaria AVISA, no publica.
check('una fuente secundaria no publica sola, y se dice por qué',
    juzgar({ source: medio }).autoPublish === false
    && juzgar({ source: medio }).warnings.some(w => /secundaria/.test(w)));
// El caso medido: 294 → 289. Un retroceso NO se rechaza; se marca.
check('un retroceso se PROPONE igual, marcado, no se rechaza',
    juzgar({ figure: { metric: 'fallecidos', value: 289, approx: false }, current: 294 }).ok === true
    && juzgar({ figure: { metric: 'fallecidos', value: 289, approx: false }, current: 294 }).autoPublish === false);
check('el aviso del retroceso lleva LOS DOS números',
    juzgar({ figure: { metric: 'fallecidos', value: 289, approx: false }, current: 294 })
        .warnings.some(w => w.includes('294') && w.includes('289')));
// Personas afectadas SÍ se mueve en los dos sentidos con normalidad
// (145.601 → 115.461): ahí un descenso no dice nada y no se marca.
check('en una métrica que se mueve en los dos sentidos, bajar no genera aviso de retroceso',
    !judgeReading({
        figure: { metric: 'personas', value: 115461, approx: false }, source: oficial,
        cutoff: '15/08/2026 06:30', current: 145601, publishedCutoff: '2026-08-14T16:30:00Z',
        feed: { ...feedOn, maxJumpPct: 500 }, now: AHORA,
    }).warnings.some(w => /Retrocede/.test(w)));
check('un salto por encima del tope no se publica solo',
    juzgar({ figure: { metric: 'fallecidos', value: 900, approx: false } }).autoPublish === false);
check('una cifra con calificador no se publica sola',
    juzgar({ figure: { metric: 'fallecidos', value: 102000, approx: true } }).autoPublish === false);
// Un corte que no es más nuevo NO es una actualización: es una nota vieja
// recirculando, y es lo que haría retroceder la página sola.
check('un corte igual o más viejo que el publicado se rechaza',
    juzgar({ cutoff: '14/08/2026 16:30' }).ok === false
    && juzgar({ cutoff: '14/08/2026 16:30' }).reason === 'viejo');
check('un corte en el futuro se rechaza', juzgar({ cutoff: '20/09/2026 10:00' }).reason === 'corte_futuro');
check('sin corte no hay lectura', juzgar({ cutoff: '' }).reason === 'sin_corte');
// Con la auto-publicación apagada TODO espera en la bandeja, por buena que
// sea la lectura: es el valor por defecto del módulo.
check('con la publicación automática apagada, nada se publica solo',
    juzgar({ feed: { ...feedOn, autoPublish: false } }).autoPublish === false
    && juzgar({ feed: { ...feedOn, autoPublish: false } }).ok === true);

grupo('v4.825 — aplicar una lectura a los indicadores');
const statsBase = [
    { id: 'a', metricKey: 'fallecidos', label: 'Fallecidos', value: '288', source: 'UNGRD, corte 14/08/2026', updatedAt: '2026-08-14T16:30:00Z', active: true },
    { id: 'b', label: 'Clubes movilizados', value: '12', source: 'Distrito 4281', updatedAt: '2026-08-14T00:00:00Z', active: true },
];
const aplicada = applyReading(statsBase, {
    metric: 'fallecidos', label: 'Personas fallecidas', after: 289,
    cutoff: '2026-08-15T18:30:00Z', sourceName: 'UNGRD',
});
check('actualiza el indicador que declara esa métrica', aplicada.stats[0].value === '289');
check('la fuente se reescribe con el corte, que es lo que se publica',
    aplicada.stats[0].source === 'UNGRD, corte 15/08/2026 6:30 p. m.');
// La regla que protege el trabajo humano: sin `metricKey` es MANUAL.
check('NO toca el indicador escrito a mano', aplicada.stats[1].value === '12' && aplicada.stats[1].source === 'Distrito 4281');
check('una métrica que ningún indicador declara se AGREGA, activa',
    applyReading(statsBase, { metric: 'heridos', label: 'Personas heridas', after: 3937, cutoff: '2026-08-15T18:30:00Z', sourceName: 'UNGRD' })
        .stats.length === 3);
check('lee el valor y el corte publicados de una métrica',
    publishedValueOf(statsBase, 'fallecidos') === 288
    && publishedCutoffOf(statsBase, 'fallecidos') === '2026-08-14T16:30:00Z'
    && publishedValueOf(statsBase, 'heridos') === null);

grupo('v4.825 — deduplicación y direcciones');
// El cron mira la misma página cada cuarto de hora: una página que no cambió
// no puede dejar una propuesta nueva cada vuelta.
const k = o => readingKey({ campaignId: 'c1', sourceId: 's1', metric: 'fallecidos', cutoff: '15/08/2026 18:30', value: 289, ...o });
check('la misma lectura da la misma llave', k() === k());
check('otra cifra o otro corte dan otra llave',
    k({ value: 294 }) !== k() && k({ cutoff: '16/08/2026 06:30' }) !== k());
// Es una dirección que el SERVIDOR descarga y cuyo contenido acaba en una
// página pública: mismo criterio que el mapa de la sede y las redirecciones.
check('sólo https', isFetchableUrl('https://portal.gestiondelriesgo.gov.co/x') === true
    && isFetchableUrl('http://portal.gestiondelriesgo.gov.co/x') === false);
check('nada de esquemas raros',
    !isFetchableUrl('javascript:alert(1)') && !isFetchableUrl('data:text/html,x') && !isFetchableUrl('file:///etc/passwd'));
// Un cron que descarga direcciones no puede ser un lector de la red interna.
check('ni localhost ni una IP: sería leer la red interna de la función',
    !isFetchableUrl('https://localhost/x') && !isFetchableUrl('https://127.0.0.1/x')
    && !isFetchableUrl('https://169.254.169.254/latest/meta-data/'));

grupo('v4.825 — la configuración');
check('nace APAGADA: encenderla es un acto explícito',
    normalizeFeed({}).enabled === false && normalizeFeed({}).autoPublish === false);
check('una campaña anterior a v4.825 no trae feed y no se rompe',
    normalizeFeed(undefined).sources.length === 0);
check('apagada no se valida nada', validateFeed({ enabled: false, sources: [] }).length === 0);
check('encendida sin fuentes activas se avisa',
    validateFeed({ enabled: true, sources: [] }).some(e => /ninguna fuente activa/.test(e)));
check('una fuente sin dirección válida se avisa con su nombre',
    validateFeed({ enabled: true, sources: [{ name: 'UNGRD', url: 'ftp://x', kind: 'oficial' }] })
        .some(e => /UNGRD/.test(e) && /https/.test(e)));
// Un interruptor que no hace nada es peor que no tenerlo (v4.650).
check('auto-publicar sin ninguna fuente oficial se avisa: no publicaría nada',
    validateFeed({ enabled: true, autoPublish: true, sources: [{ name: 'Medio', url: 'https://x.co/a', kind: 'secundaria' }] })
        .some(e => /ninguna fuente activa es oficial/.test(e)));
check('sólo la fuente oficial autoriza a publicar',
    SOURCE_KINDS.oficial.canPublish === true && SOURCE_KINDS.secundaria.canPublish === false);

grupo('v4.825 — el cableado');
const ensureSrc = readFileSync('server/lib/ensureContributionSchema.js', 'utf8');
check('la tabla de lecturas se crea en runtime, fuera de Prisma',
    /CREATE TABLE IF NOT EXISTS "ContributionCampaignReading"/.test(ensureSrc));
// La lista de la comprobación rápida NO es un número de versión: sin la
// tabla nueva ahí, se da por presente y no se crea nunca.
check('la comprobación rápida enumera la tabla Y la columna nuevas',
    /ContributionCampaignReading"'\) IS NOT NULL AS lectura/.test(ensureSrc)
    && /column_name = 'feedRunAt'/.test(ensureSrc));
check('la columna feed se AGREGA, la tabla no se recrea',
    /ADD COLUMN IF NOT EXISTS feed JSONB/.test(ensureSrc) && !/DROP TABLE/.test(ensureSrc));
// La dedupe vive en el índice, no en el código que inserta.
check('el índice único sobre `key` es lo que deduplica',
    /CREATE UNIQUE INDEX IF NOT EXISTS "ContributionCampaignReading_key_key"/.test(ensureSrc));
const ctlSrc = readFileSync('server/controllers/contributionCampaignController.js', 'utf8');
check('una lectura ya decidida no vuelve a la bandeja (DO NOTHING, no DO UPDATE)',
    /ON CONFLICT \(key\) DO NOTHING/.test(ctlSrc));
check('decidir es un UPDATE condicional: dos pestañas no aplican dos veces',
    /AND state = 'pendiente'\s*\n\s*RETURNING \*/.test(ctlSrc));
check('el barrido sólo mira campañas servibles con la lectura encendida',
    /status IN \('active', 'scheduled'\)[\s\S]{0,120}feed->>'enabled'/.test(ctlSrc));
const cronSrc = readFileSync('server/routes/cron.js', 'utf8');
check('el cron existe y está protegido con CRON_SECRET',
    /'\/emergency-feed'/.test(cronSrc) && /Bearer \$\{process\.env\.CRON_SECRET\}/.test(cronSrc));
check('el cron está declarado en vercel.json cada 15 minutos',
    JSON.parse(readFileSync('vercel.json', 'utf8')).crons
        .some(c => c.path === '/api/cron/emergency-feed' && c.schedule === '*/15 * * * *'));
const ingestSrc = readFileSync('server/lib/emergencyIngest.js', 'utf8');
// `fetch` sigue los redireccionamientos solo: comprobar sólo la dirección de
// entrada dejaría abierta la puerta que `isFetchableUrl` cierra.
check('la dirección se revalida DESPUÉS de los redireccionamientos',
    /isFetchableUrl\(res\.url \|\| url\)/.test(ingestSrc));
check('la descarga tiene tope de tiempo y de tamaño',
    /AbortController/.test(ingestSrc) && /MAX_BYTES/.test(ingestSrc));
check('leer una fuente NUNCA lanza: devuelve el motivo escrito',
    /return \{ ok: false, sourceId: src\.id, sourceName: src\.name, error:/.test(ingestSrc));
const adminFeed = readFileSync('src/pages/admin/ContributionCampaigns.tsx', 'utf8');
check('el panel manda `feed` al guardar: una columna que nadie llena no hace nada',
    /feed: c\.feed/.test(adminFeed));
check('cada indicador declara qué métrica es, y «Manual» es una opción',
    /Manual — la lectura automática no lo toca/.test(adminFeed));
// La consecuencia, no sólo el nombre del interruptor.
check('el interruptor de auto-publicar DICE que la cifra sale sin revisar',
    /sale publicada sin que nadie la revise/.test(adminFeed));
check('la propuesta muestra el fragmento donde se leyó y el enlace a la fuente',
    /r\.quote/.test(adminFeed) && /ver la fuente/.test(adminFeed));

// El espejo de la lectura automatizada (v4.825). Se compara por SALIDAS: que
// los dos den la misma lista de métricas no alcanza — lo que sostiene el
// aviso en vivo del editor es que `validateFeed` y `parseFigure` digan lo
// mismo, palabra por palabra, que el servidor.
let feedMirror = null;
if (mirror) {
    try {
        const { build } = await import('esbuild');
        const out = await build({
            entryPoints: ['src/lib/emergencyFeed.ts'],
            bundle: true, write: false, format: 'esm', platform: 'neutral',
        });
        feedMirror = await import(`data:text/javascript,${encodeURIComponent(out.outputFiles[0].text)}`);
    } catch { /* se dice abajo */ }
}
if (feedMirror) {
    grupo('v4.825 — el espejo de la lectura dice lo MISMO');
    check('mismo catálogo de métricas, con sus etiquetas y su bandera',
        eq(FEED_METRICS, feedMirror.FEED_METRICS) && eq(METRIC_KEYS, feedMirror.METRIC_KEYS));
    check('mismas autoridades de fuente', eq(SOURCE_KINDS, feedMirror.SOURCE_KINDS));
    check('normalizeFeed da lo mismo, encendido y apagado',
        eq(normalizeFeed({}), feedMirror.normalizeFeed({}))
        && eq(normalizeFeed({ enabled: true, autoPublish: true, maxJumpPct: 12, sources: [oficial] }),
              feedMirror.normalizeFeed({ enabled: true, autoPublish: true, maxJumpPct: 12, sources: [oficial] })));
    // Si los mensajes divergen, el editor avisa una cosa y el servidor otra.
    check('validateFeed da los MISMOS mensajes', [
        { enabled: false },
        { enabled: true, sources: [] },
        { enabled: true, sources: [{ name: 'UNGRD', url: 'ftp://x', kind: 'oficial' }] },
        { enabled: true, autoPublish: true, sources: [{ name: 'M', url: 'https://x.co/a', kind: 'secundaria' }] },
    ].every(f => eq(validateFeed(f), feedMirror.validateFeed(f))));
    check('parseFigure lee igual las cifras colombianas',
        ['14.705', '289', 'más de 102.000', '12,5', 'varios', ''].every(
            v => eq(parseFigure(v), feedMirror.parseFigure(v))));
    check('el corte se lee y se rotula igual',
        ['15/08/2026 18:30', '2026-08-15T18:30:00Z', 'el jueves'].every(
            v => parseCutoff(v) === feedMirror.parseCutoff(v) && formatCutoff(v) === feedMirror.formatCutoff(v)));
    check('mismas opciones de frecuencia y mismo valor por defecto',
        eq(INTERVAL_OPTIONS, feedMirror.INTERVAL_OPTIONS)
        && DEFAULT_INTERVAL_MINUTES === feedMirror.DEFAULT_INTERVAL_MINUTES);
    check('mismas plantillas de fuente', eq(FEED_PRESETS, feedMirror.FEED_PRESETS));
    check('la misma dirección se acepta o se rechaza igual',
        ['https://a.co/x', 'http://a.co/x', 'https://localhost/x', 'https://127.0.0.1/x', 'javascript:x'].every(
            u => isFetchableUrl(u) === feedMirror.isFetchableUrl(u)));
}

grupo('v4.826 — el editor se pliega');
const admin826 = readFileSync('src/pages/admin/ContributionCampaigns.tsx', 'utf8');
// El contenido se DESMONTA al cerrar: escondido con `hidden` lo siguen
// encontrando el buscador del navegador y el lector de pantalla.
check('el contenido se desmonta al cerrar, no se esconde con CSS',
    /\{open && <div id=\{`card-\$\{id\}`\}/.test(admin826));
// El estado vive en el padre: es lo que permite «Expandir todo» y lo que
// evita un hook dentro de un `.map` (v4.689).
check('`Card` no tiene hooks: el estado abierto/cerrado vive en el padre',
    !/const Card[\s\S]{0,900}useState/.test(admin826));
// Con la lista escrita dos veces, una sección nueva se queda fuera del botón.
check('CARD_IDS está en UN solo sitio y lo consume «Expandir todo»',
    (admin826.match(/CARD_IDS/g) || []).length === 3
    && /CARD_IDS\.map\(id => \[id, true\]\)/.test(admin826));
// Toda sección declarada tiene que existir como Card, o el botón abriría un id
// que no pinta nada.
check('cada id declarado tiene su Card y cada Card su id', (() => {
    const ids = JSON.parse('[' + admin826.match(/const CARD_IDS = \[([\s\S]*?)\];/)[1]
        .replace(/'/g, '"').replace(/,\s*\]/, ']').replace(/,\s*$/, '') + ']');
    const usados = [...admin826.matchAll(/<Card id="([^"]+)"/g)].map(m => m[1]);
    // Se comparan los DOS conjuntos entre sí, sin un número fijo: la cuenta
    // literal obligaba a tocar esta prueba cada vez que se agrega una sección
    // —y entonces se actualiza sin mirar, que es como un guardián deja de
    // guardar—. Lo que importa es que ninguna lista tenga algo que la otra no.
    return ids.length > 10 && ids.length === usados.length
        && usados.every(u => ids.includes(u)) && ids.every(i => usados.includes(i));
})());
// Dentro del pliegue, cerrar la sección escondería la única forma de guardar.
check('el botón de guardar centros va en la CABECERA, fuera del pliegue',
    /action=\{\([\s\S]{0,600}Guardar centros/.test(admin826));
// Plegar no puede esconder un problema (v4.790).
check('las secciones con avisos los declaran en su cabecera',
    /warn=\{statWarnings\.length\}/.test(admin826)
    && /warn=\{feedWarnings\.length\}/.test(admin826)
    && /warn=\{centerSkipped\.length\}/.test(admin826));
// En modo privado localStorage lanza, y eso no puede tumbar el editor.
check('la preferencia se guarda envuelta en try',
    /try \{ localStorage\.setItem\('contrib_cards_open'/.test(admin826));

grupo('v4.827 — cada cuánto se consulta y de dónde');
// El cron pasa cada 15 minutos: ése es el PISO, no la frecuencia.
check('el intervalo más corto no baja del paso del cron',
    Math.min(...INTERVAL_OPTIONS.map(o => o.minutes)) === MIN_POLL_MINUTES);
check('el intervalo se acota al catálogo: un valor libre prometería lo que el cron no da',
    normalizeFeed({ intervalMinutes: 1 }).intervalMinutes === DEFAULT_INTERVAL_MINUTES
    && normalizeFeed({ intervalMinutes: 60 }).intervalMinutes === 60
    && normalizeFeed({}).intervalMinutes === DEFAULT_INTERVAL_MINUTES);
const feedListo = { enabled: true, intervalMinutes: 60, sources: [oficial] };
const T0 = new Date('2026-08-16T12:00:00Z');
check('sin consulta previa, le toca', shouldRunNow({ feed: feedListo, lastRunAt: null, now: T0 }).run === true);
check('dentro del intervalo NO le toca, y dice cuánto falta', (() => {
    const r = shouldRunNow({ feed: feedListo, lastRunAt: '2026-08-16T11:30:00Z', now: T0 });
    return r.run === false && r.reason === 'todavia_no' && r.minutesLeft === 30;
})());
check('pasado el intervalo, le toca',
    shouldRunNow({ feed: feedListo, lastRunAt: '2026-08-16T10:30:00Z', now: T0 }).run === true);
// «Leer ahora» es del usuario: hacerle esperar al intervalo sería
// desobedecerlo.
check('«Leer ahora» (force) ignora el intervalo',
    shouldRunNow({ feed: feedListo, lastRunAt: '2026-08-16T11:59:00Z', now: T0, force: true }).run === true);
// Apagada o sin fuentes NO es «todavía no»: es que no hay nada que consultar,
// y decirlo distinto es lo que faltaba cuando se reportó «no funciona».
check('apagada y sin fuentes se distinguen de «todavía no»',
    shouldRunNow({ feed: { ...feedListo, enabled: false }, now: T0 }).reason === 'apagada'
    && shouldRunNow({ feed: { ...feedListo, sources: [] }, now: T0 }).reason === 'sin_fuentes');
// Una fuente con dirección inválida no cuenta como fuente: si contara, el
// barrido gastaría la vuelta en algo que no se puede descargar.
check('una fuente con dirección inválida no cuenta como fuente',
    shouldRunNow({ feed: { ...feedListo, sources: [{ ...oficial, url: 'ftp://x' }] }, now: T0 }).reason === 'sin_fuentes');

check('las plantillas de fuente declaran autoridad y formato válidos',
    FEED_PRESETS.length >= 3
    && FEED_PRESETS.every(p => SOURCE_KINDS[p.kind] && ['texto', 'imagen', 'json'].includes(p.format) && p.note));
// La dirección de una nota o una infografía cambia cada día: dejarla escrita
// sería prometer una integración que no existe.
check('una plantilla con dirección apunta a la UNGRD y es https',
    FEED_PRESETS.filter(p => p.url).every(p => /^https:\/\//.test(p.url))
    && FEED_PRESETS.some(p => p.kind === 'oficial' && /gestiondelriesgo\.gov\.co/.test(p.url)));
// Sólo la oficial puede publicar: una plantilla secundaria marcada oficial
// abriría esa puerta sin que nadie lo decidiera.
check('la plantilla de un medio es SECUNDARIA',
    FEED_PRESETS.find(p => p.id === 'medio')?.kind === 'secundaria');

const ctl827 = readFileSync('server/controllers/contributionCampaignController.js', 'utf8');
// Se sella ANTES de leer: si la invocación muere a mitad, la vuelta siguiente
// no reintenta en el acto y gasta modelo dos veces por lo mismo.
check('la fecha de consulta se sella ANTES de leer',
    /SET "feedRunAt" = NOW\(\)[\s\S]{0,200}const \{ results \} = await readCampaign/.test(ctl827));
check('«Leer ahora» fuerza y el cron no', /force: true/.test(ctl827)
    && /shouldRunNow\(\{ feed: c\.feed, lastRunAt: c\.feedRunAt \}\)/.test(ctl827));
const ensure827 = readFileSync('server/lib/ensureContributionSchema.js', 'utf8');
check('la columna de última consulta existe y está en la comprobación rápida',
    /ADD COLUMN IF NOT EXISTS "feedRunAt" TIMESTAMPTZ/.test(ensure827)
    && /column_name = 'feedRunAt'/.test(ensure827));
const admin827 = readFileSync('src/pages/admin/ContributionCampaigns.tsx', 'utf8');
check('la fuente se elige de una lista, no sólo se escribe',
    /addSourceFromPreset/.test(admin827) && /Elegí de dónde se leen las cifras/.test(admin827));
check('la frecuencia se elige en la pantalla',
    /Cada cuánto se consulta/.test(admin827) && /patchFeed\(\{ intervalMinutes/.test(admin827));
// «Nada nuevo» sobre una campaña sin fuentes hace creer que se consultó algo.
check('sin fuentes, el aviso dice QUÉ falta y no «nada nuevo»',
    /d\.skipped === 'sin_fuentes'/.test(admin827));
check('la sección explica en tres pasos qué hace',
    /aparece acá abajo como/.test(admin827) && /<b>1\.<\/b>/.test(admin827));

grupo('v4.828 — dónde va el panorama y cómo se lee');
const landing828 = readFileSync('src/components/campaign/CampaignLanding.tsx', 'utf8');
// El panorama contesta «¿qué tan grave es esto?», que es la pregunta ANTERIOR
// a «¿cómo ayudo?»: va justo debajo del hero.
check('el panorama va ANTES de «cómo ayudar» en el archivo',
    landing828.indexOf('id="panorama"') < landing828.indexOf('id="como-ayudar"')
    && landing828.indexOf('id="como-ayudar"') < landing828.indexOf('id="centros-de-acopio"'));
// v4.828.2 — DECISIÓN EXPRESA DEL CLIENTE, tomada con el argumento en contra
// delante: v4.828 pasó las cifras a tinta porque el rojo no codifica nada y
// porque la regla v4.820 lo reserva para lo que ACTÚA. El cliente lo pidió dos
// veces con la pieza a la vista: acá el rojo es identidad de la emergencia. La
// prueba fija esa decisión para que no se revierta por criterio propio.
check('las cifras llevan el acento de la campaña (decisión del cliente)', (() => {
    const i = landing828.indexOf('id="panorama"');
    const banda = landing828.slice(i, landing828.indexOf('</section>', i) + 12);
    return /style=\{\{ color: accent \}\}/.test(banda);
})());
// La fuente es lo que hace publicable la cifra: va bajo CADA una.
check('cada cifra muestra su propia fuente', (() => {
    const i = landing828.indexOf('id="panorama"');
    const banda = landing828.slice(i, landing828.indexOf('</section>', i) + 12);
    return /s\.source && <p className="text-\[11px\] text-gray-400/.test(banda);
})());
// Con dos o tres indicadores, una rejilla de cuatro columnas los deja pegados
// a la izquierda.
check('la banda se centra sea cual sea la cantidad de indicadores',
    /flex flex-wrap justify-center[\s\S]{0,400}campaign\.stats\.map/.test(landing828));
// Cada cifra va en su TARJETA (v4.828.1). Y la banda va en BLANCO: el relleno
// de la tarjeta es `gray-50`, así que sobre una banda gris desaparecerían.
check('cada cifra va en su tarjeta, sobre banda blanca', (() => {
    const i = landing828.indexOf('id="panorama"');
    const banda = landing828.slice(i, landing828.indexOf('</section>', i) + 12);
    return /rounded-2xl border border-gray-100 bg-gray-50\/60/.test(banda)
        && /id="panorama" className="[^"]*bg-white/.test(landing828);
})());
// `tabular-nums` da a cada dígito el ancho de un 0 y a este tamaño se ve
// suelto: se reserva para columnas de números.
check('la cifra usa figuras proporcionales, no tabulares', (() => {
    const i = landing828.indexOf('id="panorama"');
    // Se descartan los COMENTARIOS antes de mirar: el comentario que explica
    // por qué no se usan figuras tabulares tiene que poder nombrarlas. Mismo
    // criterio que la comprobación de `border-rotary-blue`.
    const banda = landing828.slice(i, landing828.indexOf('</section>', i) + 12)
        .replace(/\{\/\*[\s\S]*?\*\/\}/g, '').replace(/\/\*[\s\S]*?\*\//g, '');
    return !/tabular-nums/.test(banda);
})());

grupo('v4.829 — el carrusel de videos con vecinos');
const landing829 = readFileSync('src/components/campaign/CampaignLanding.tsx', 'utf8');
// Con DOS videos, pintar el mismo a los dos lados haría creer que hay tres.
// Con la tira lineal ya no hace falta elegir vecinos: están TODOS, y en los
// extremos simplemente no hay nada de ese lado.
check('la tira pinta todas las diapositivas y centra la activa',
    /slidesVideo\.map\(\(v, i\) => \{/.test(landing829)
    && /const activo = i === Math\.min\(Math\.max\(videoPos, 0\), slidesVideo\.length - 1\);/.test(landing829));
// Un vecino es una PREVISUALIZACIÓN: montar dos incrustaciones más por visita
// para enseñar algo que está a medias no se paga.
check('el vecino nunca monta un iframe', (() => {
    const i = landing829.indexOf('const VideoVecino');
    const comp = landing829.slice(i, landing829.indexOf('export default', i) > 0 ? i + 2200 : i + 2200);
    return !/<iframe/.test(comp) && /videoThumb\(entry\.video\)/.test(comp);
})());
// `flex-shrink-0` en el vecino es lo que hace que se CORTE en vez de encogerse
// entero: sin él, el flex lo reduce y se ve completo y diminuto.
// Desde v4.831 el vecino ocupa TODA su diapositiva y quien la achica es el
// `scale` de la diapositiva: con anchos distintos, el paso entre centros
// dejaría de ser constante y la traslación no sería una resta.
check('el vecino ocupa su diapositiva; el achicado es de la diapositiva',
    /className="block w-full rounded-2xl overflow-hidden bg-gray-900 relative/.test(landing829)
    && /flex-shrink-0 w-\[86vw\] lg:w-\[56vw\] xl:w-\[640px\]/.test(landing829));

// El mismo difuminado que la tira de «Rotarios en acción», pero acotado al
// borde: una zona de fundido ancha se come el asomo del vecino.
check('el borde se difumina sólo en el extremo',
    /maskImage: 'linear-gradient\(to right, transparent, black 6%, black 94%, transparent\)'/.test(landing829));
// Regla de v4.818: las flechas no tapan el reproductor ni su barra de
// controles. Ahora caben sobre los vecinos, que están atenuados.
check('las flechas van sobre los vecinos, no sobre el reproductor',
    /hidden lg:flex absolute left-4 xl:left-10 top-1\/2/.test(landing829)
    && /hidden lg:flex absolute right-4 xl:right-10 top-1\/2/.test(landing829));
// Para un lector de pantalla el video es el que suena, no los que asoman.
check('los vecinos quedan fuera del recorrido del teclado y del lector',
    /aria-hidden\s*\n?\s*tabIndex=\{-1\}/.test(landing829));

grupo('v4.830 — los videos rotan solos, con dos frenos');
const landing830 = readFileSync('src/components/campaign/CampaignLanding.tsx', 'utf8');
// La cadencia en UN solo número, como `MS_POR_PIEZA` en la galería. Más
// lenta que la tira de fotos —un video necesita unos segundos para
// reconocerse— y no tanto como para parecer detenida: los 7 s de v4.830 se
// reportaron como «muy lento».
check('la cadencia es un solo número, entre la tira de fotos y los 7 s de v4.830',
    /const VIDEO_ROTA_MS = (\d+);/.test(landing830)
    && Number(landing830.match(/const VIDEO_ROTA_MS = (\d+);/)[1]) > 1800
    && Number(landing830.match(/const VIDEO_ROTA_MS = (\d+);/)[1]) < 7000
    && (landing830.match(/VIDEO_ROTA_MS/g) || []).length === 2);
// Un video embebido se reproduce dentro de un iframe: desde el documento
// padre no hay forma de saber que empezó sin cargar la API del proveedor.
// Lo que sí se observa es que el foco se fue al iframe.
check('con un embebido se detecta que PULSARON el reproductor, sin cargar la API del proveedor',
    /document\.activeElement\?\.tagName === 'IFRAME'/.test(landing830)
    && /window\.addEventListener\('blur', alPerderFoco\)/.test(landing830));
// La banda de arriba y de abajo NO es respiro decorativo: es lo que hace que
// el freno por cursor funcione con un embebido. Medido en el navegador: sin
// ella, sobre el vecino se detenía y sobre el reproductor seguía rotando.
check('hay banda del carrusel por encima y por debajo del reproductor',
    /relative flex items-center py-6 w-max/.test(landing830));
// `videoCount` se calcula ANTES del efecto que lo consume: un `const` de más
// abajo daría un error de zona muerta al evaluar las dependencias.
check('el conteo de videos se declara antes del efecto que lo usa',
    landing830.indexOf('const videoCount =') < landing830.indexOf('if (videoCount < 2'));

grupo('v4.831 — la transición de un video a otro');
const landing831 = readFileSync('src/components/campaign/CampaignLanding.tsx', 'utf8');
// Hasta v4.830 se repintaba el trío entero y el cambio era un corte seco.
check('la tira se traslada con una transición, no se repinta de golpe',
    /transform: `translateX\(\$\{desplazamientoVideos\}px\)`/.test(landing831)
    && /transform \$\{VIDEO_DESLIZA_MS\}ms cubic-bezier/.test(landing831));
// Una clase arbitraria con `cubic-bezier` de comas NO llegó al CSS compilado
// —medido: 0,15 s en vez de 0,9— y una clase que no se genera falla en
// silencio (la lección de v4.719).
check('la duración va en el ESTILO, no en una clase arbitraria de Tailwind',
    /const VIDEO_DESLIZA_MS = \d+;/.test(landing831)
    && !/className="[^"]*duration-\[\d+ms\]/.test(landing831));
// El desplazamiento tiene que ser más CORTO que el intervalo, y con margen:
// si se acercaran, la tira estaría moviéndose casi todo el tiempo y no se
// llegaría a mirar ningún video quieto.
check('el desplazamiento es bastante más corto que el intervalo',
    Number(landing831.match(/const VIDEO_DESLIZA_MS = (\d+);/)[1]) * 4
    < Number(landing831.match(/const VIDEO_ROTA_MS = (\d+);/)[1]));
// El centrado se corrige sobre el desplazamiento ACTUAL: calcularlo desde la
// maquetación depende de cuál sea el ancestro posicionado y de los márgenes
// negativos, y suponerlo mal dejaba el video corrido (medido: 443 en vez de
// 640).
check('el centrado se mide, no se deduce de la maquetación',
    /const actual = new DOMMatrixReadOnly\(getComputedStyle\(el\)\.transform\)\.m41;/.test(landing831)
    && /actual \+ \(w\.left \+ w\.width \/ 2\) - \(r\.left \+ r\.width \/ 2\)/.test(landing831));
// Todas las diapositivas miden lo MISMO y el vecino se achica con `scale`,
// que no ocupa espacio: así el paso entre centros es constante.
check('el vecino se achica con scale, no con otro ancho',
    /transform: `scale\(\$\{activo \? 1 : 0\.66\}\)`/.test(landing831));
// El reproductor de verdad lo monta SÓLO la diapositiva activa: las demás son
// previsualizaciones, así que nunca hay más de una incrustación por visita.
check('sólo la diapositiva activa monta el reproductor',
    /\{activo \? \(/.test(landing831) && /<VideoVecino entry=\{v\} onClick=/.test(landing831));

grupo('v4.832 — siempre tres videos, y la rotación no se para');
const landing832 = readFileSync('src/components/campaign/CampaignLanding.tsx', 'utf8');
// Tres copias es el MÍNIMO que garantiza vecino a los dos lados en cualquier
// posición: se vive en la del medio, así que sobra una entera a cada lado.
// Con dos, el primero de la copia del medio se queda sin nada a la izquierda
// —que es el hueco reportado—.
check('la lista se repite tres veces y se vive en la copia del medio',
    /const VIDEO_COPIAS = 3;/.test(landing832)
    && /Array\.from\(\{ length: VIDEO_COPIAS \}, \(\) => videos\)\.flat\(\)/.test(landing832)
    && /useState\(\(\) => \(videoCount >= VIDEO_CICLICO_MIN \? videoCount : 0\)\)/.test(landing832));
// Con DOS videos la vuelta pondría el MISMO a izquierda y derecha y parecería
// que hay tres: ahí se conserva la tira lineal que rebota (regla v4.829).
check('con dos videos la tira sigue siendo lineal y rebota',
    /const VIDEO_CICLICO_MIN = 3;/.test(landing832)
    && /const videoCiclico = videoCount >= VIDEO_CICLICO_MIN;/.test(landing832)
    && /if \(videoCiclico\) return p \+ 1;/.test(landing832)
    && /sentidoVideo\.current = -1;/.test(landing832));
// El rebase es lo que hace infinita la vuelta sin saltos largos: se hace al
// TERMINAR el desplazamiento y SIN transición, porque es el mismo punto de la
// tira visto desde otra copia.
check('el rebase va al terminar la transición y sin animarse',
    /onTransitionEnd=\{e => \{/.test(landing832)
    && /e\.propertyName !== 'transform'/.test(landing832)
    && /transition: videoSalta \? 'none' :/.test(landing832)
    && (landing832.match(/transition: videoSalta \? 'none' :/g) || []).length === 2);
// El centrado va en un efecto de DISPOSICIÓN: el rebase cambia a la vez qué
// diapositiva manda y cuánto se desplaza la tira, y un efecto normal corre
// después de pintar — se vería un fotograma con el video en el sitio del
// anterior.
check('el centrado se aplica antes de pintar (useLayoutEffect)',
    /React\.useLayoutEffect\(\(\) => \{/.test(landing832));
// El freno tiene que ser REVERSIBLE: hasta v4.831 darle play detenía la
// rotación PARA SIEMPRE y la tira quedaba clavada en un video.
check('con un archivo propio, pausar o terminar reanuda la rotación',
    /onPlay=\{\(\) => setVideoTomado\(true\)\}/.test(landing832)
    && /onPause=\{\(\) => setVideoTomado\(false\)\}/.test(landing832)
    && /onEnded=\{\(\) => setVideoTomado\(false\)\}/.test(landing832));
// Con un embebido no hay estado de reproducción observable: lo que se ve es
// que el foco volvió a nuestra página.
check('con un embebido, que el foco vuelva reanuda la rotación',
    /const alVolver = \(\) => \{ if \(!enIframe\(\)\) setVideoTomado\(false\); \};/.test(landing832)
    && /window\.addEventListener\('focus', alVolver\)/.test(landing832));
// Con la tira cíclica no hay extremos, así que ninguna flecha se desactiva.
// La lineal SÍ los tiene y ahí se conserva la regla de v4.650.
check('sólo la tira lineal desactiva sus flechas',
    /disabled=\{!videoCiclico && videoPos <= 0\}/.test(landing832)
    && /disabled=\{!videoCiclico && videoPos >= videos\.length - 1\}/.test(landing832));
// Hay una diapositiva por copia y un punto por VIDEO: el punto se marca con
// el número del video, no con la posición dentro de la tira.
check('el punto se marca con el número del video, no con la posición',
    /const idxVideo = videos\.length \? \(\(videoPos % videos\.length\) \+ videos\.length\) % videos\.length : 0;/.test(landing832)
    && /aria-current=\{i === idxVideo\}/.test(landing832)
    && /\{idxVideo \+ 1\}\/\{videos\.length\}/.test(landing832));

// ═══════════════════════════════════════════════════════════════════════════
// Quiénes ya aportaron — v4.862
//
// El criterio vive en server/lib/contributorRoll.js y es PURO. Lo que se
// prueba acá es lo que decide si un nombre sale a una página pública, que es
// lo único de este módulo que no se puede corregir después de publicado.
// ═══════════════════════════════════════════════════════════════════════════
grupo('Quiénes ya aportaron — el criterio');

const aporte = (o = {}) => ({ status: 'success', donorName: 'Ana Pérez', isAnonymous: false, date: '2026-08-01T10:00:00Z', ...o });

// LA REGLA DE LA QUE CUELGA TODO: un aporte anónimo no publica nombre. Y se
// decide en el SERVIDOR: si el nombre viajara en el JSON y la pantalla lo
// escondiera, bastaría abrir la consola para leerlo.
check('un aporte anónimo NO publica nombre',
    publicDonorName(aporte({ isAnonymous: true, donorName: 'Ana Pérez' })) === null);
check('un aporte no anónimo SIN nombre tampoco publica nada',
    publicDonorName(aporte({ donorName: '   ' })) === null
    && publicDonorName(aporte({ donorName: null })) === null);
check('un aporte no anónimo con nombre sí lo publica',
    publicDonorName(aporte()) === 'Ana Pérez');

// `isAnonymous` es booleano en la base, pero un `undefined` —una fila vieja,
// un `select` que no lo trajo— no puede leerse como «publicá el nombre»...
// salvo que la columna tiene DEFAULT false y la consulta lo pide siempre. Lo
// que sí se comprueba es que sólo el `true` explícito calla el nombre.
check('sólo `isAnonymous === true` calla el nombre',
    publicDonorName(aporte({ isAnonymous: false })) === 'Ana Pérez'
    && publicDonorName(aporte({ isAnonymous: true })) === null);

// Un aporte reembolsado dejó de ser un ingreso (v4.859): ni cuenta ni nombra.
check('un aporte reembolsado no cuenta ni publica nombre',
    countsInRoll(aporte({ status: 'refunded' })) === false
    && publicDonorName(aporte({ status: 'refunded' })) === null);
check('sólo `success` cuenta',
    countsInRoll(aporte({ status: 'success' })) === true
    && countsInRoll(aporte({ status: 'pending' })) === false
    && countsInRoll(aporte({ status: '' })) === false);
check('el estado se compara sin distinguir mayúsculas',
    countsInRoll(aporte({ status: 'SUCCESS' })) === true);

// El nombre se muestra TAL CUAL: no se recorta a dos palabras. Quien firma
// «María Fernanda Restrepo» no se llama «María Fernanda».
check('un nombre compuesto se conserva entero',
    cleanDonorName('María Fernanda Restrepo') === 'María Fernanda Restrepo');
check('los espacios se normalizan, el nombre no se toca',
    cleanDonorName('  Ana   Pérez  ') === 'Ana Pérez');
check('un nombre larguísimo se recorta SIN partir palabras',
    (() => {
        const largo = 'Juan Sebastián de la Santísima Trinidad Restrepo Gutiérrez';
        const corto = cleanDonorName(largo, 20);
        return corto.length <= 20 && !largo.slice(corto.length).startsWith(corto.slice(-1) + 'x')
            && largo.startsWith(corto) && !/\s$/.test(corto) && corto.split(' ').every(w => largo.split(' ').includes(w));
    })());
check('si la primera palabra ya se pasa del tope, se deja entera antes que mutilada',
    cleanDonorName('Bartolomé', 4) === 'Bartolomé');

// El TOTAL cuenta a los anónimos: la anonimidad esconde el nombre, no el
// hecho. Un aporte anónimo que no sumara le restaría a quien lo hizo el
// reconocimiento de que existió.
grupo('Quiénes ya aportaron — el total y los nombres');
const roll1 = buildContributorRoll([
    aporte({ donorName: 'Ana Pérez', date: '2026-08-01T10:00:00Z' }),
    aporte({ donorName: 'Carlos Ruiz', isAnonymous: true, date: '2026-08-02T10:00:00Z' }),
]);
check('dos aportes, uno anónimo: total 2 y UN solo nombre',
    roll1.total === 2 && eq(roll1.names, ['Ana Pérez']));
check('el aporte anónimo suma al total y se declara aparte',
    roll1.anonymous === 1 && roll1.named === 1);

const roll2 = buildContributorRoll([
    aporte({ donorName: 'Ana Pérez', date: '2026-08-01T10:00:00Z' }),
    aporte({ donorName: 'Beto Gómez', date: '2026-08-03T10:00:00Z' }),
    aporte({ donorName: 'Cami Soto', date: '2026-08-02T10:00:00Z' }),
]);
check('los nombres van del más reciente al más antiguo',
    eq(roll2.names, ['Beto Gómez', 'Cami Soto', 'Ana Pérez']));

// Quien aportó dos veces aparece UNA vez en el carrusel —«Ana · Ana» se lee
// como un fallo— pero sus dos aportes cuentan.
const roll3 = buildContributorRoll([
    aporte({ donorName: 'Ana Pérez' }),
    aporte({ donorName: 'ana pérez', date: '2026-08-05T10:00:00Z' }),
]);
check('un aportante repetido aparece una vez y sus dos aportes cuentan',
    roll3.total === 2 && roll3.names.length === 1);

check('sin aportes válidos, total 0 y ningún nombre',
    (() => { const r = buildContributorRoll([aporte({ status: 'refunded' })]); return r.total === 0 && r.names.length === 0; })());
check('sin lista, no revienta', (() => { const r = buildContributorRoll(null); return r.total === 0 && eq(r.names, []); })());
check('todos anónimos: hay total y no hay nombres',
    (() => {
        const r = buildContributorRoll([aporte({ isAnonymous: true }), aporte({ isAnonymous: true })]);
        return r.total === 2 && r.names.length === 0;
    })());
check('la lista de nombres tiene tope y el total NO',
    (() => {
        const muchos = Array.from({ length: ROLL_MAX_NAMES + 15 }, (_, i) => aporte({ donorName: `Persona ${i}`, date: `2026-08-01T10:00:${String(i).padStart(2, '0')}Z` }));
        const r = buildContributorRoll(muchos);
        return r.names.length === ROLL_MAX_NAMES && r.total === ROLL_MAX_NAMES + 15;
    })());

// ─── Lo que no se ve ejecutando el criterio ────────────────────────────────
grupo('Quiénes ya aportaron — lo que no se ve ejecutando el criterio');
const rollSrc = readFileSync(new URL('../server/lib/contributorRoll.js', import.meta.url), 'utf8');
const ctrlRoll = readFileSync(new URL('../server/controllers/contributionCampaignController.js', import.meta.url), 'utf8');
const rutasRoll = readFileSync(new URL('../server/routes/contribution-campaigns.js', import.meta.url), 'utf8');
const rollTsx = readFileSync(new URL('../src/components/campaign/ContributorRoll.tsx', import.meta.url), 'utf8');
const landingRoll = readFileSync(new URL('../src/components/campaign/CampaignLanding.tsx', import.meta.url), 'utf8');

check('la ruta pública está montada y es de sólo lectura',
    /router\.get\('\/:id\/contributors', getCampaignContributors\);/.test(rutasRoll));

// El endpoint corre en la página pública de una emergencia: degrada, nunca 500.
check('el endpoint degrada a vacío en vez de responder 500',
    /getCampaignContributors[\s\S]*?catch \(e\)[\s\S]*?res\.json\(\{ total: 0, names: \[\] \}\)/.test(ctrlRoll));

// ⚠️ NO se agrega una columna de campaña a `Donation`: es la trampa de
// `logo_intl` en su versión más cara —`Donation` se consulta con findMany sin
// select en media plataforma— y caería sobre el cobro.
check('no se le agrega columna de campaña a Donation',
    !/ALTER TABLE "Donation"/.test(ctrlRoll)
    && !/campaignId\s+String/.test(readFileSync(new URL('../server/prisma/schema.prisma', import.meta.url), 'utf8')
        .split('model Donation {')[1].split('}')[0]));

// El casteo a jsonb de una columna de TEXTO estalla con una sola fila mal
// formada, y Postgres no garantiza que el filtro que lo protege se evalúe
// antes. El SQL filtra amplio y la comprobación exacta se hace en JS.
check('la campaña se comprueba en JS, no casteando rawPayload a jsonb',
    !/rawPayload"?\s*::\s*jsonb/.test(ctrlRoll)
    && /String\(payload\?\.campaignId \|\| ''\) !== String\(campaignId\)/.test(ctrlRoll));

// Un LIMIT truncaría el TOTAL, y un total truncado presentado como total es
// peor que no mostrar ninguno. La cota por fecha no deja fuera nada.
check('la consulta de pagos no lleva LIMIT',
    !/rawPayload" LIKE \$1[\s\S]{0,120}LIMIT/.test(ctrlRoll));

// El total y los nombres salen de la MISMA consulta: con dos fuentes, la
// línea podría decir «3 aportes» y saber sólo dos nombres de tres aportantes
// que sí dieron su nombre, y nadie podría explicar la diferencia.
check('el total sale de las donaciones, no del contador de métricas',
    /const roll = buildContributorRoll\(aportes\);/.test(ctrlRoll)
    && !/donation_completed[\s\S]{0,200}contributorRollFor/.test(ctrlRoll));

// `named` y `anonymous` se quedan del lado del servidor: decir cuántos
// aportes se hicieron en anónimo es lo que quien eligió el anónimo no pidió.
check('la respuesta pública lleva sólo total y nombres',
    /return \{ total: roll\.total, names: roll\.names \};/.test(ctrlRoll));

// Sin vaciar la caché, quien acaba de aportar podría recargar y no verse — y
// esta línea existe justamente para que se vea. Sólo con el aporte
// confirmado: las vistas llegan de a cientos.
check('un aporte confirmado vacía la caché de la línea',
    /if \(type === 'donation_completed'\) invalidateContributorRoll\(campaignId\);/.test(ctrlRoll));
check('un reembolso también la vacía',
    /invalidateContributorRoll\(campaignId\)/.test(
        readFileSync(new URL('../server/controllers/paymentController.js', import.meta.url), 'utf8')));

// Los nombres son DATOS, no lenguaje (v4.662): el traductor del sitio
// convertiría el apellido de alguien en otra palabra.
check('el nombre lleva data-no-translate', /data-no-translate/.test(rollTsx));

// Sin aportes no se pinta nada: «0 aportes» debajo del botón no es un dato
// neutro, es un cartel que desanima justo donde se pide ayuda.
check('sin aportes la línea no se pinta', /if \(!total\) return null;/.test(rollTsx));

// Con un solo nombre no hay intervalo, y el freno del cursor se suelta solo.
check('con menos de dos nombres no hay intervalo',
    /if \(names\.length < 2 \|\| quieto\) return;/.test(rollTsx));
check('el freno del cursor es reversible',
    /onMouseEnter=\{\(\) => setQuieto\(true\)\}/.test(rollTsx)
    && /onMouseLeave=\{\(\) => setQuieto\(false\)\}/.test(rollTsx));

// El singular no es un detalle: «1 aportes» se lee como un texto armado por
// una máquina, justo en la línea que celebra que la campaña acompaña.
check('el rótulo distingue singular de plural',
    /\$\{total\} \$\{total === 1 \? 'aporte' : 'aportes'\}/.test(rollTsx));

// El índice se acota AL LEER: si se quitan nombres —un reembolso—, el
// guardado puede quedar fuera de rango y sin esto habría un render vacío.
check('el índice se acota al leer, no con otro efecto',
    /names\[Math\.min\(idx, names\.length - 1\)\]/.test(rollTsx));

// La línea va JUSTO DEBAJO del botón, dentro de la tarjeta: puesta más abajo
// llegaría cuando quien mira ya decidió.
check('la línea va justo debajo del botón de aportar',
    /\{card\.buttonText \|\| 'APORTAR'\}[\s\S]{0,60}<\/button>[\s\S]{0,600}<ContributorRoll roll=\{roll\} accent=\{accent\} \/>/.test(landingRoll));

// Se pide APARTE de /active: un dato que cambia con cada aporte no tiene por
// qué gobernar el ritmo de la caché de la campaña, y si falla la línea no se
// pinta y la página se ve igual.
check('la línea se pide aparte de la campaña y su fallo no rompe la página',
    /\/contributors`\)/.test(landingRoll)
    && /\.catch\(\(\) => \{ \/\* sin línea; la página no depende de esto \*\/ \}\)/.test(landingRoll));

// No hay espejo en el navegador A PROPÓSITO: el criterio se aplica entero en
// el servidor y la pantalla sólo muestra el resultado, así que un espejo
// sería una copia sin consumidor — y las copias se separan en silencio.
check('no hay espejo del criterio en el navegador',
    !readdirSync(new URL('../src/lib/', import.meta.url)).includes('contributorRoll.ts'));


// ─── Resumen ───────────────────────────────────────────────────────────────
console.log(`\n${ok} comprobaciones pasaron${malos.length ? `, ${malos.length} FALLARON:` : '.'}`);
for (const m of malos) console.log(`  ✗ ${m}`);
process.exit(malos.length ? 1 : 0);
