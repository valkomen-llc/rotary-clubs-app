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
    donationPresets,
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
check('un CTA de centros NO se pinta hasta que la sección exista (F3)',
    landing.includes("IMPLEMENTED_SECTIONS.includes('centers')") && !/IMPLEMENTED_SECTIONS = \[[^\]]*'centers'/.test(landing));
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

// ─── Resumen ───────────────────────────────────────────────────────────────
console.log(`\n${ok} comprobaciones pasaron${malos.length ? `, ${malos.length} FALLARON:` : '.'}`);
for (const m of malos) console.log(`  ✗ ${m}`);
process.exit(malos.length ? 1 : 0);
