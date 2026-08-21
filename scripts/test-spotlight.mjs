// ════════════════════════════════════════════════════════════════════
// Slider Global / Llamados a la Acción — v4.879
//
//   npm run test:spotlight
//
// Qué se comprueba: el CRITERIO —a qué sitios alcanza un slide, cuándo está
// vigente, a dónde lleva su botón y en qué orden se ven—, que el espejo del
// navegador dé LO MISMO que el servidor, y unas cuantas reglas que sólo se
// pueden leer sobre los archivos: que no haya una segunda sección, que el
// velo no sea configurable y que la tabla no entre en schema.prisma.
//
// No necesita base, credenciales ni red. El bloque del espejo pide `esbuild`
// y se salta solo si no está.
// ════════════════════════════════════════════════════════════════════

import { readFileSync } from 'node:fs';

let ok = 0; const malos = [];
const check = (n, cond, extra = '') => {
    if (cond) { ok++; console.log(`  ✓ ${n}`); }
    else { malos.push(n); console.log(`  ✗ ${n}${extra ? ` — ${extra}` : ''}`); }
};
const grupo = t => console.log(`\n${t}`);
const eq = (a, b) => JSON.stringify(a) === JSON.stringify(b);

const S = await import('../server/lib/spotlightSpec.js');

const AHORA = new Date('2026-08-21T12:00:00Z');
const sitio = { id: 'club-1', district: '4271, 4281', districtId: null };
const otro = { id: 'club-2', district: '4290', districtId: null };

// ════════════════════════════════════════════════════════════════════
grupo('── Catálogos y valores por omisión ──────────────────────');

check('siete tipos de slide', S.SLIDE_TYPES.length === 7);
check('el tipo por omisión existe en el catálogo', S.SLIDE_TYPE_IDS.includes(S.DEFAULT_SLIDE_TYPE));
check('un tipo desconocido cae en el por omisión',
    S.normalizeSlide({ slideType: 'inventado' }).slideType === S.DEFAULT_SLIDE_TYPE);

// Es lo que se pidió —una campaña global se despliega desde un solo lugar—
// y lo que lo hace seguro es que el slide nazca apagado.
check('el alcance por omisión es «todos los sitios»', S.normalizeTargeting({}).mode === 'all');
check('un slide sin `active` explícito nace APAGADO', S.normalizeSlide({}).active === false);
check('`active: true` como texto también enciende', S.normalizeSlide({ active: 'true' }).active === true);

check('el autoplay se acota por arriba',
    S.normalizeSlide({ autoplayMs: 999999 }).autoplayMs === S.MAX_AUTOPLAY_MS);
check('el autoplay se acota por abajo',
    S.normalizeSlide({ autoplayMs: 10 }).autoplayMs === S.MIN_AUTOPLAY_MS);
check('un autoplay ilegible cae en el por omisión',
    S.normalizeSlide({ autoplayMs: 'pronto' }).autoplayMs === S.DEFAULT_AUTOPLAY_MS);

// `campaignId` sólo significa algo con el vínculo elegido: guardarlo igual
// dejaría un id colgando que nadie consume y que confundiría al diagnosticar.
check('sin vínculo de campaña, `campaignId` no se guarda',
    S.normalizeSlide({ linkKind: 'url', campaignId: 'x' }).campaignId === '');
check('con vínculo de campaña, `campaignId` se conserva',
    S.normalizeSlide({ linkKind: 'campaign', campaignId: 'x' }).campaignId === 'x');

// `publishedAt` es la MITAD del desempate del orden: sin él, dos slides de la
// misma prioridad se ordenarían siempre por id y publicar uno nuevo no lo
// adelantaría nunca.
check('`publishedAt` sobrevive a la normalización',
    S.normalizeSlide({ publishedAt: '2026-01-01' }).publishedAt === '2026-01-01');

// ════════════════════════════════════════════════════════════════════
grupo('── Vigencia: se DERIVA de las fechas, sin cron ───────────');

const vivo = { active: true };
check('encendido y sin fechas → vigente (publicación permanente)',
    S.slideState(vivo, AHORA) === 'vigente');
check('apagado → inactivo pase lo que pase con las fechas',
    S.slideState({ active: false, startAt: '2020-01-01' }, AHORA) === 'inactivo');
check('con inicio futuro → programado',
    S.slideState({ active: true, startAt: '2026-09-01' }, AHORA) === 'programado');
check('con final pasado → vencido',
    S.slideState({ active: true, endAt: '2026-08-01' }, AHORA) === 'vencido');
check('dentro de la ventana → vigente',
    S.slideState({ active: true, startAt: '2026-08-01', endAt: '2026-09-01' }, AHORA) === 'vigente');
check('el final gana sobre el inicio (ventana ya cerrada)',
    S.slideState({ active: true, startAt: '2026-09-01', endAt: '2026-08-01' }, AHORA) === 'vencido');
check('una fecha ilegible no rompe: se ignora',
    S.slideState({ active: true, startAt: 'mañana' }, AHORA) === 'vigente');

// La pureza no es decorativa: una función que consulta el reloj por dentro no
// se puede probar (la lección de `yearsSince`, v4.729).
let lanzo = false;
try { S.slideState({ active: true }, null); } catch { lanzo = true; }
check('`slideState` EXIGE `now` por parámetro', lanzo);

// ════════════════════════════════════════════════════════════════════
grupo('── Destinos ──────────────────────────────────────────────');

check('«todos» alcanza a cualquier sitio', S.targetsSite({ mode: 'all' }, sitio));
check('«todos» no alcanza si no hay sitio', !S.targetsSite({ mode: 'all' }, null));

check('por distrito: alcanza al sitio que lo lleva en su lista',
    S.targetsSite({ mode: 'districts', districts: ['4281'] }, sitio));
check('por distrito: NO alcanza a un sitio de otro distrito',
    !S.targetsSite({ mode: 'districts', districts: ['4281'] }, otro));
// `Club.district` es una LISTA («4271, 4281»), no un valor. Comparar por
// igualdad exacta dejó fuera a la mitad de los sitios en v4.747.
check('por distrito: «4271, 4281» cuenta para los DOS',
    S.targetsSite({ mode: 'districts', districts: ['4271'] }, sitio));
check('por distrito: «42811» NO cuenta como 4281',
    !S.targetsSite({ mode: 'districts', districts: ['4281'] }, { id: 'x', district: '42811' }));
check('por distrito: también vale la clave foránea',
    S.targetsSite({ mode: 'districts', districts: ['4290'] }, { id: 'x', districtId: 4290, district: '' }));

check('por sitios: alcanza al elegido', S.targetsSite({ mode: 'clubs', clubIds: ['club-1'] }, sitio));
check('por sitios: no alcanza al que no está', !S.targetsSite({ mode: 'clubs', clubIds: ['club-1'] }, otro));

// La exclusión gana SIEMPRE: quien la escribe está quitando a alguien a
// propósito, y que un alcance positivo la anulara convertiría el control en
// una casilla que a veces no hace nada.
check('la exclusión gana sobre «todos»',
    !S.targetsSite({ mode: 'all', excludeClubIds: ['club-1'] }, sitio));
check('la exclusión gana sobre un sitio elegido a mano',
    !S.targetsSite({ mode: 'clubs', clubIds: ['club-1'], excludeClubIds: ['club-1'] }, sitio));
check('la exclusión gana sobre el distrito',
    !S.targetsSite({ mode: 'districts', districts: ['4281'], excludeClubIds: ['club-1'] }, sitio));
check('excluir a otro no afecta a este sitio',
    S.targetsSite({ mode: 'all', excludeClubIds: ['club-9'] }, sitio));

// ════════════════════════════════════════════════════════════════════
grupo('── Validación: errores frente a avisos ───────────────────');

const v = raw => S.validateSlide(raw);
check('sin nombre no se puede publicar',
    v({ title: 'x', image: 'y' }).errors.some(e => /nombre/i.test(e)));
check('sin imagen, sin título y sin texto no hay slide',
    v({ name: 'n' }).errors.some(e => /no muestra nada/i.test(e)));
check('con sólo texto ya hay algo que mostrar',
    v({ name: 'n', text: 'algo' }).ok);
check('sin imagen es un AVISO, no un error',
    v({ name: 'n', text: 'algo' }).warnings.some(w => /azul del sitio/i.test(w)));
check('una imagen sin texto alternativo avisa',
    v({ name: 'n', image: 'i' }).warnings.some(w => /alternativo/i.test(w)));

check('vínculo de campaña sin campaña elegida es error',
    v({ name: 'n', text: 't', linkKind: 'campaign' }).errors.some(e => /campaña/i.test(e)));
check('botón con texto y sin destino es error',
    v({ name: 'n', text: 't', buttonText: 'Ir' }).errors.some(e => /no se va a dibujar/i.test(e)));
check('destino sin texto de botón es sólo un aviso',
    v({ name: 'n', text: 't', buttonUrl: '/x' }).warnings.some(w => /no tiene texto/i.test(w)));

check('un final anterior al inicio es error',
    v({ name: 'n', text: 't', startAt: '2026-09-01', endAt: '2026-08-01' }).errors.some(e => /posterior/i.test(e)));
check('sin fechas se avisa que la publicación es permanente',
    v({ name: 'n', text: 't' }).warnings.some(w => /permanente/i.test(w)));

check('«distritos» sin ninguno marcado es error',
    v({ name: 'n', text: 't', targeting: { mode: 'districts', districts: [] } }).errors.some(e => /distritos/i.test(e)));
check('«sitios» sin ninguno marcado es error',
    v({ name: 'n', text: 't', targeting: { mode: 'clubs', clubIds: [] } }).errors.some(e => /ningún sitio/i.test(e)));
check('elegir sitios y excluirlos todos es error',
    v({ name: 'n', text: 't', targeting: { mode: 'clubs', clubIds: ['a'], excludeClubIds: ['a'] } })
        .errors.some(e => /excluidos/i.test(e)));

// Tratar un aviso como un error convierte cualquier observación en un
// bloqueo y se dejan de leer (la lección de v4.833).
check('los avisos NUNCA bloquean', v({ name: 'n', text: 't' }).ok === true);

// ════════════════════════════════════════════════════════════════════
grupo('── A dónde lleva el botón ────────────────────────────────');

const campanas = {
    viva: { id: 'viva', servable: true, targeting: { mode: 'all' } },
    dormida: { id: 'dormida', servable: false, targeting: { mode: 'all' } },
    ajena: { id: 'ajena', servable: true, targeting: { mode: 'clubs', clubIds: ['club-9'] } },
};
const link = (raw) => S.resolveSlideLink(raw, sitio, campanas);

check('un enlace normal viaja tal cual',
    link({ linkKind: 'url', buttonUrl: '/proyectos' }).url === '/proyectos');
check('una campaña viva lleva a la página de contribución del sitio',
    link({ linkKind: 'campaign', campaignId: 'viva' }).url === S.CONTRIBUTION_PATH);
check('una campaña que ya no existe no da destino',
    link({ linkKind: 'campaign', campaignId: 'fantasma' }).url === '');
check('…y DICE por qué',
    /ya no existe/i.test(link({ linkKind: 'campaign', campaignId: 'fantasma' }).reason));
check('una campaña inactiva no da destino',
    link({ linkKind: 'campaign', campaignId: 'dormida' }).url === '');
// Es la comprobación que evita el botón que miente: la landing de ESE sitio
// no mostraría esa campaña, así que el botón llevaría a otra cosa.
check('una campaña que no alcanza a este sitio no da destino',
    link({ linkKind: 'campaign', campaignId: 'ajena' }).url === '');
check('…y lo dice con esas palabras',
    /no alcanza a este sitio/i.test(link({ linkKind: 'campaign', campaignId: 'ajena' }).reason));

// ════════════════════════════════════════════════════════════════════
grupo('── Qué ve un sitio, y en qué orden ───────────────────────');

const base = { name: 'n', title: 't', image: 'i', active: true };
const lista = [
    { ...base, id: 'baja', priority: 0, publishedAt: '2026-01-01' },
    { ...base, id: 'alta', priority: 9, publishedAt: '2025-01-01' },
    { ...base, id: 'media', priority: 5 },
    { ...base, id: 'apagado', active: false, priority: 99 },
    { ...base, id: 'ajeno', priority: 50, targeting: { mode: 'clubs', clubIds: ['club-9'] } },
];
const r1 = S.slidesForSite(lista, sitio, AHORA, {});
check('manda la prioridad declarada', eq(r1.slides.map(s => s.id), ['alta', 'media', 'baja']));
check('un slide apagado no se sirve', !r1.slides.some(s => s.id === 'apagado'));
check('un slide que no alcanza al sitio no se sirve', !r1.slides.some(s => s.id === 'ajeno'));
check('lo descartado se DICE con su motivo',
    r1.dropped.length === 2 && r1.dropped.every(d => d.reason));

// Si dependiera del orden en que la base devuelve las filas, el mismo sitio
// vería los slides en otro orden en cada visita (regla de pickDistrictSite).
const mismo = [
    { ...base, id: 'bbb', priority: 3, publishedAt: '2026-01-01' },
    { ...base, id: 'aaa', priority: 3, publishedAt: '2026-01-01' },
];
check('a igual prioridad y fecha, el desempate por id es estable',
    eq(S.slidesForSite(mismo, sitio, AHORA, {}).slides.map(s => s.id), ['aaa', 'bbb'])
    && eq(S.slidesForSite([...mismo].reverse(), sitio, AHORA, {}).slides.map(s => s.id), ['aaa', 'bbb']));
check('a igual prioridad manda la publicación más reciente',
    eq(S.slidesForSite([
        { ...base, id: 'viejo', priority: 3, publishedAt: '2025-01-01' },
        { ...base, id: 'nuevo', priority: 3, publishedAt: '2026-06-01' },
    ], sitio, AHORA, {}).slides.map(s => s.id), ['nuevo', 'viejo']));

// Un slide de campaña existe PARA llevar a la campaña: sin destino no es una
// pieza incompleta, es una pieza que miente.
const conCampana = [
    { ...base, id: 'rota', linkKind: 'campaign', campaignId: 'dormida', buttonText: 'Aportar' },
    { ...base, id: 'sana', linkKind: 'campaign', campaignId: 'viva', buttonText: 'Aportar' },
    { ...base, id: 'normal', buttonText: '', buttonUrl: '' },
];
const r2 = S.slidesForSite(conCampana, sitio, AHORA, campanas);
check('un slide de campaña sin destino se RETIRA entero', !r2.slides.some(s => s.id === 'rota'));
check('un slide de enlace sin botón SÍ se pinta', r2.slides.some(s => s.id === 'normal'));
check('el slide de campaña sano lleva a la página de contribución',
    r2.slides.find(s => s.id === 'sana')?.buttonUrl === S.CONTRIBUTION_PATH);

// Un recorte silencioso convierte «se publicó» en una afirmación falsa.
const muchos = Array.from({ length: S.MAX_SLIDES_PER_SITE + 3 }, (_, i) =>
    ({ ...base, id: `s${i}`, priority: 100 - i }));
const r3 = S.slidesForSite(muchos, sitio, AHORA, {});
check('el tope por sitio se respeta', r3.slides.length === S.MAX_SLIDES_PER_SITE);
check('…y lo que queda fuera se ANOTA', r3.dropped.some(d => /tope por sitio/i.test(d.reason)));

check('una lista vacía no revienta', eq(S.slidesForSite(null, sitio, AHORA, {}).slides, []));

// ════════════════════════════════════════════════════════════════════
grupo('── Reglas que sólo se leen sobre los archivos ────────────');

const seccion = readFileSync('src/sections/SpotlightSection.tsx', 'utf8');
const spec = readFileSync('server/lib/spotlightSpec.js', 'utf8');
const rutas = readFileSync('server/routes/spotlight-slides.js', 'utf8');
const prisma = readFileSync('server/prisma/schema.prisma', 'utf8');
const app = readFileSync('src/App.tsx', 'utf8');

// ⚠️ «No quiero crear una segunda sección» es una regla sobre el COMPONENTE,
// no sobre cuántas veces se monta. v4.879 la leyó mal y comprobaba que hubiera
// UN solo `<SpotlightSection />` en App.tsx — y eso codificaba el defecto:
// `SmartHome` tiene TRES portadas (sitio de fundación, asociación/RYE y sitio
// de club) y el contenedor estaba sólo en la última, así que un llamado global
// marcado «todos los sitios» no llegaba ni a COLROTARIOS ni a LATIR ni a los
// RYE. El servidor lo resolvía y lo mandaba; la portada no lo pintaba, EN
// SILENCIO. Lo que hay que fijar es que el componente sea uno y que TODA
// portada lo monte.
check('no apareció un segundo componente de bloque destacado',
    !/SpotlightCarousel|GlobalSliderSection/.test(app));

// Cada portada es un `<main>`. Una rama nueva que se olvide del contenedor
// falla acá en vez de perder los llamados globales sin avisar.
const portadasDe = (archivo, fuente) =>
    [...fuente.matchAll(/<main[^>]*>([\s\S]*?)<\/main>/g)].map((m, i) => ({
        nombre: `${archivo} · portada ${i + 1}`,
        monta: /<SpotlightSection[\s/>]/.test(m[1]),
    }));

const preview = readFileSync('src/pages/ClubPreview.tsx', 'utf8');
const portadas = [...portadasDe('App.tsx', app), ...portadasDe('ClubPreview.tsx', preview)];

check('se encontraron las cuatro portadas del sitio', portadas.length === 4,
    `encontradas: ${portadas.length}`);
portadas.forEach(p => check(`${p.nombre} monta el Bloque Destacado`, p.monta));

// La vista previa del panel tiene que enseñar lo MISMO que se publica: si le
// falta una sección, el administrador aprueba algo distinto de lo que se ve.
check('la vista previa del panel monta el mismo componente, no una copia',
    /from '\.\.\/sections\/SpotlightSection'/.test(preview));

// El contraste no es una decisión editorial: si el velo se pudiera
// configurar, un administrador podría publicar una pieza ilegible.
check('el velo está escrito en el componente, no llega de la configuración',
    /bg-gradient-to-r from-black\/75/.test(seccion)
    && !/overlay(Opacity|Color)|veloConfig/.test(seccion));

// Un solo slide tiene que verse EXACTAMENTE como antes de este módulo.
check('los controles sólo se pintan con más de un slide',
    /const esCarrusel = total > 1;/.test(seccion) && /esCarrusel && \(/.test(seccion));

// El corte por «no hay nada que mostrar» tiene que ir DESPUÉS de los hooks:
// uno escrito debajo de un return temprano tumba el árbol entero (v4.689).
const posReturn = seccion.indexOf('if (total === 0) return null;');
const ultimoHook = Math.max(
    seccion.lastIndexOf('useEffect('), seccion.lastIndexOf('useState('),
    seccion.lastIndexOf('useMemo('), seccion.lastIndexOf('useCallback('));
check('todos los hooks van ARRIBA del corte', posReturn > ultimoHook);

// El alcance se resuelve con UN criterio. Con dos, un slide podría juzgar
// «activa» una campaña que la landing no sirve.
check('el alcance reutiliza el criterio de las campañas, no lo reescribe',
    /from '\.\/contributionSpec\.js'/.test(spec) && /campaignTargetsSite/.test(spec));
check('el criterio no consulta la base ni la red',
    !/db\.query|import db|fetch\(/.test(spec));

// Express casa por orden de declaración: una literal debajo de su paramétrica
// es INALCANZABLE y el fallo es mudo (v4.859).
check('`/order` se declara ANTES que `/:id`',
    rutas.indexOf("'/order'") < rutas.indexOf("'/:id'"));

// Un modelo declarado en Prisma y todavía inexistente en la base deja en 500
// a todo consumidor Prisma desde el primer despliegue (regla de logo_intl).
check('`SpotlightSlide` NO está en schema.prisma', !/model\s+SpotlightSlide\b/.test(prisma));

const ensure = readFileSync('server/lib/ensureSpotlightSchema.js', 'utf8');
// Se busca la SENTENCIA, no la mención: el comentario que explica por qué
// nunca se hace un DROP tiene que poder nombrarlo sin hacer fallar la prueba
// (la lección de `check:routes` y de la comprobación de `bg-[#28354b]`).
const sinComentarios = ensure.replace(/\/\/[^\n]*/g, '').replace(/--[^\n]*/g, '');
check('la tabla se crea en runtime, sin DROP ni TRUNCATE',
    /CREATE TABLE IF NOT EXISTS "SpotlightSlide"/.test(sinComentarios)
    && !/DROP TABLE|TRUNCATE/i.test(sinComentarios));
// La lista de la comprobación rápida no es un número de versión: si no
// enumera una columna, la da por presente y no se crea nunca (v4.708).
check('la comprobación rápida enumera las columnas que el archivo crea',
    /column_name = 'autoplayMs'/.test(ensure) && /column_name = 'clubId'/.test(ensure));

// La lectura pública corre en la portada de TODOS los sitios.
const ctrl = readFileSync('server/controllers/spotlightSlideController.js', 'utf8');
check('la lectura pública degrada a lista vacía, nunca a 500',
    /degrada a lista vacía/.test(ctrl) && /res\.json\(\{ slides: \[\] \}\)/.test(ctrl));
check('toda escritura invalida la caché',
    (ctrl.match(/invalidateCache\(\)/g) || []).length >= 5);

// ════════════════════════════════════════════════════════════════════
grupo('── El espejo del navegador da LO MISMO ───────────────────');

let build;
try { ({ build } = await import('esbuild')); }
catch {
    console.log('  ⚠ Se omite la paridad de espejos: falta esbuild.  npm i --no-save esbuild');
}

if (build) {
    const out = await build({
        entryPoints: ['src/lib/spotlightSpec.ts'],
        bundle: true, write: false, format: 'esm', platform: 'neutral',
    });
    const M = await import(`data:text/javascript,${encodeURIComponent(out.outputFiles[0].text)}`);

    check('los catálogos de tipos coinciden', eq(M.SLIDE_TYPES, S.SLIDE_TYPES));
    check('los modos de destino coinciden', eq(M.TARGETING_MODES, S.TARGETING_MODES));
    check('los modos de apertura coinciden', eq(M.OPEN_MODES, S.OPEN_MODES));
    check('el tope por sitio coincide', M.MAX_SLIDES_PER_SITE === S.MAX_SLIDES_PER_SITE);
    check('los tiempos de autoplay coinciden',
        M.DEFAULT_AUTOPLAY_MS === S.DEFAULT_AUTOPLAY_MS
        && M.MIN_AUTOPLAY_MS === S.MIN_AUTOPLAY_MS
        && M.MAX_AUTOPLAY_MS === S.MAX_AUTOPLAY_MS);

    // Lo que importa no es que se parezcan: es que den LO MISMO.
    const casos = [
        {}, { name: 'x' }, { active: true }, { active: 'true' },
        { slideType: 'emergencia' }, { slideType: 'nope' },
        { autoplayMs: 1 }, { autoplayMs: 999999 }, { autoplayMs: 'x' },
        { linkKind: 'campaign', campaignId: 'c1' },
        { linkKind: 'url', campaignId: 'c1' },
        { openMode: 'blank' }, { openMode: 'nope' },
        { title: '  con espacios  ', text: '\ttab\n' },
        { targeting: { mode: 'districts', districts: ['4281', '42811', 'x'] } },
        { targeting: { mode: 'clubs', clubIds: ['a', 'a', ''], excludeClubIds: ['b', 'b'] } },
        { targeting: { mode: 'nope' } },
        { priority: '7' }, { priority: 'x' },
        { name: 'n', text: 't', startAt: '2026-09-01', endAt: '2026-08-01' },
        { name: 'n', image: 'i' },
        { name: 'n', text: 't', buttonText: 'Ir' },
        { name: 'n', text: 't', linkKind: 'campaign' },
    ];
    let iguales = 0;
    for (const c of casos) {
        if (!eq(M.normalizeSlide(c), S.normalizeSlide(c))) {
            console.log(`    ↳ normalizeSlide difiere en ${JSON.stringify(c)}`);
        } else iguales++;
    }
    check(`normalizeSlide da lo mismo en los ${casos.length} casos`, iguales === casos.length);

    let igualesV = 0;
    for (const c of casos) {
        const a = M.validateSlide(c), b = S.validateSlide(c);
        if (eq({ ok: a.ok, errors: a.errors, warnings: a.warnings },
               { ok: b.ok, errors: b.errors, warnings: b.warnings })) igualesV++;
        else console.log(`    ↳ validateSlide difiere en ${JSON.stringify(c)}`);
    }
    check(`validateSlide da lo mismo en los ${casos.length} casos`, igualesV === casos.length);

    const estados = [
        { active: false }, { active: true },
        { active: true, startAt: '2026-09-01' },
        { active: true, endAt: '2026-08-01' },
        { active: true, startAt: '2026-08-01', endAt: '2026-09-01' },
        { active: true, startAt: 'mañana' },
    ];
    check('slideState da lo mismo en los seis casos',
        estados.every(e => M.slideState(e, AHORA) === S.slideState(e, AHORA)));

    // ── Lo que sólo existe en el navegador ──
    const g = [S.normalizeSlide({ id: 'g1', name: 'G', title: 'T', image: 'i', active: true })];
    const local = M.normalizeSlide({ id: '__local__', name: 'L', title: 'L', image: 'i', active: true });
    check('el slide local va AL FINAL de los globales',
        eq(M.withLocalSlide(g, local).map(s => s.id), ['g1', '__local__']));
    check('el local se marca como tal, para poder decirlo',
        M.withLocalSlide(g, local)[1].isLocal === true);
    check('sin local, la lista son sólo los globales',
        eq(M.withLocalSlide(g, null).map(s => s.id), ['g1']));
    check('un local vacío no se agrega',
        eq(M.withLocalSlide(g, M.normalizeSlide({ id: 'x' })).map(s => s.id), ['g1']));
    check('sin nada, la lista queda vacía — y entonces no se pinta la sección',
        eq(M.withLocalSlide([], null), []));
    check('el tope también acota la lista final',
        M.withLocalSlide(Array.from({ length: 12 }, (_, i) => S.normalizeSlide({ id: `s${i}` })), local).length
        === M.MAX_SLIDES_PER_SITE);
}

// ════════════════════════════════════════════════════════════════════
console.log(`\n${'─'.repeat(60)}`);
if (malos.length) {
    console.log(`✗ ${malos.length} fallaron de ${ok + malos.length}:`);
    malos.forEach(m => console.log(`   · ${m}`));
    process.exit(1);
}
console.log(`✓ ${ok} comprobaciones, todas bien.`);
