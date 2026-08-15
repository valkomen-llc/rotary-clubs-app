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

import { readFileSync } from 'node:fs';

import {
    CAMPAIGN_TYPES, DEFAULT_CAMPAIGN_TYPE, campaignTypeCatalog,
    CAMPAIGN_STATUSES, STATUS_LABELS, canTransition, effectiveStatus, isServable,
    normalizeTargeting, targetsSite, pickCampaignForSite,
    SECTION_IDS, normalizeContent, hexOrEmpty, acceptableCtaUrl,
    normalizeStats, validateStats, validateForPublish, latestStatDate,
    OVERRIDE_WHITELIST, sanitizeOverride, resolveForSite, slugify,
    donationPresets, normalizeCenters, groupCenters,
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

// ─── Resumen ───────────────────────────────────────────────────────────────
console.log(`\n${ok} comprobaciones pasaron${malos.length ? `, ${malos.length} FALLARON:` : '.'}`);
for (const m of malos) console.log(`  ✗ ${m}`);
process.exit(malos.length ? 1 : 0);
