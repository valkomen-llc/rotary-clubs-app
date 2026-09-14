#!/usr/bin/env node
// ════════════════════════════════════════════════════════════════════
// ANALÍTICA DE REDES SOCIALES.  npm run test:social:analytics
// v4.1053.0
//
// SIN BASE, SIN CREDENCIALES Y SIN RED. El criterio es puro y se ejercita
// directamente; el aislamiento multi-tenant y el cableado se leen de los
// archivos, que es lo único que ve un `WHERE` aflojado o un módulo que empieza
// a importar el cliente de Meta desde donde no debe.
//
// Lo que protege, en orden de lo que costaría equivocarse:
//
//   1. QUE NO SE MEZCLEN MÉTRICAS ENTRE SITIOS. Es la exigencia literal del
//      pedido y el error más caro del módulo: el aislamiento va en el `WHERE`,
//      nunca en la pantalla. Una sesión sin sitio recibe `[]` —«ninguno»—, no
//      `null` —«todos»—: es la lección de `mailboxScopeFor` (v4.932), y acá lo
//      que se filtraría es el rendimiento de la cuenta de otra organización.
//
//   2. QUE UN TOKEN NO VIAJE AL NAVEGADOR, ni recortado. Las consultas a Meta
//      son server-side y la credencial se lee en UN solo punto.
//
//   3. QUE UN FALLO DE LA API NO SE PINTE COMO UN CERO (punto 14 del pedido).
//      `aggregate` devuelve `null` cuando no hay dato, y el estado de la
//      sincronización es un catálogo CERRADO que distingue «no hubo actividad»
//      de «faltan permisos» y de «Meta no contestó».
//
//   4. QUE NO SE INVENTE HISTÓRICO QUE META NO PUEDE DAR. `effectiveStart`
//      acota la ventana de cada métrica y DEVUELVE EL MOTIVO; el catálogo
//      declara lo que la UI de Facebook muestra y la API no expone, en vez de
//      aproximarlo.
//
//   5. QUE UN PORCENTAJE NO MIENTA. De 0 a 40 no es «+100 %»: es una cifra que
//      no se puede expresar en porcentaje, y se dice así.
//
//   6. QUE RESINCRONIZAR NO DUPLIQUE LA SERIE. La idempotencia es del índice
//      único (cuenta × día × métrica), no de una lectura previa.
//
//   7. QUE NO SE ROMPA LA INTEGRACIÓN QUE YA FUNCIONA. Los permisos de
//      estadísticas se SUMAN a los que ya se piden, el cliente de publicación
//      no se toca, y este módulo no abre un segundo camino hacia Meta.
// ════════════════════════════════════════════════════════════════════
import { readFileSync } from 'node:fs';

const SPEC = await import('../server/lib/socialMetricsSpec.js');

let ok = 0; const malos = [];
const check = (n, cond, extra = '') => {
    if (cond) { ok++; console.log(`  ✓ ${n}`); }
    else { malos.push(n); console.log(`  ✗ ${n}${extra ? ` — ${extra}` : ''}`); }
};
const eq = (n, a, b) => check(n, JSON.stringify(a) === JSON.stringify(b), `esperaba ${JSON.stringify(b)}, dio ${JSON.stringify(a)}`);
const grupo = t => console.log(`\n${t}`);
const leer = f => readFileSync(f, 'utf8');
/** El archivo SIN comentarios: el comentario que explica un cambio no puede
 *  hacer fallar la comprobación que lo defiende (la lección de v4.1005). */
const codigo = f => leer(f)
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .split('\n').filter(l => !/^\s*(\/\/|\*)/.test(l)).join('\n');
/** El cuerpo de una función exportada, hasta la siguiente. Buscar en el
 *  ARCHIVO entero pasa en verde con el defecto reintroducido en otra función
 *  (la lección de v4.1012). */
const cuerpo = (src, nombre) => {
    const i = src.indexOf(nombre);
    if (i < 0) return '';
    const resto = src.slice(i + nombre.length);
    const fin = resto.search(/\nexport (const|function|default)/);
    return fin < 0 ? resto : resto.slice(0, fin);
};

const specSrc  = codigo('server/lib/socialMetricsSpec.js');
const syncSrc  = codigo('server/lib/socialAnalyticsSync.js');
const storeSrc = codigo('server/lib/socialAnalyticsStore.js');
const ctrlSrc  = codigo('server/controllers/socialAnalyticsController.js');
const metaSrc  = codigo('server/lib/metaInsights.js');
const ddlSrc   = codigo('server/lib/ensureSocialAnalyticsSchema.js');

// ════════════════════════════════════════════════════════════════════
grupo('1. El catálogo de métricas — lo que Meta puede dar, no lo que la UI muestra');

const fb = SPEC.metricsFor({ platform: 'facebook' });
const ig = SPEC.metricsFor({ platform: 'instagram' });
check('Hay métricas declaradas para Facebook', fb.length > 0);
check('Hay métricas declaradas para Instagram', ig.length > 0);

// Cada métrica tiene que poder contestar de dónde sale. Una entrada sin
// endpoint ni campo real es un nombre copiado de una pantalla.
//
// ⚠️ UNA DERIVADA ES LA EXCEPCIÓN Y SE DECLARA COMO TAL. `source: 'derived'`
// no viaja a Meta en ninguna consulta —se calcula de lo ya guardado— así que
// exigirle un endpoint sería exigirle una arista que por definición no tiene.
// Lo que sí se le exige es decir DE QUÉ sale (`derivedFrom`), o sería un
// número sin procedencia.
const pedidas = SPEC.METRICS.filter(m => m.source !== 'derived');
const incompletas = pedidas.filter(m => !m.canonical || !m.platform || !m.level || !m.endpoint || !m.permission || !m.metric);
eq('⚠️ Ninguna métrica se declara sin endpoint, permiso y nivel', incompletas.map(m => m.canonical), []);

const derivadas = SPEC.METRICS.filter(m => m.source === 'derived');
const derivadasFlojas = derivadas.filter(m => !m.canonical || !m.platform || !m.level || !m.derivedFrom || m.endpoint || m.metric);
eq('⚠️ Una métrica derivada declara su origen y NO declara endpoint', derivadasFlojas.map(m => m.canonical), []);
// Y lo que dice derivar tiene que existir en su misma plataforma.
const origenHuerfano = derivadas.filter(m => !SPEC.metricByCanonical(m.platform, m.derivedFrom));
eq('…y su origen existe en el catálogo de su plataforma', origenHuerfano.map(m => m.canonical), []);

const nivelesMalos = SPEC.METRICS.filter(m => !SPEC.METRIC_LEVELS.includes(m.level));
eq('El nivel sale del catálogo cerrado', nivelesMalos.map(m => m.canonical), []);

const estadosMalos = SPEC.METRICS.filter(m => !SPEC.METRIC_STATUS[m.status]);
eq('El estado de cada métrica sale del catálogo cerrado', estadosMalos.map(m => m.canonical), []);

// Lo canónico es único POR PLATAFORMA: el mismo nombre en las dos es legítimo
// —«alcance» existe en las dos— pero repetido dentro de una es una colisión
// que haría que una tapara a la otra en la serie.
const dup = [];
for (const p of ['facebook', 'instagram']) {
    const vistos = new Set();
    for (const m of SPEC.METRICS.filter(x => x.platform === p)) {
        if (vistos.has(m.canonical)) dup.push(`${p}:${m.canonical}`);
        vistos.add(m.canonical);
    }
}
eq('⚠️ Ningún nombre canónico se repite dentro de una plataforma', dup, []);

// Una deprecada no se pide: pedirla gasta una llamada para recibir siempre el
// mismo rechazo, y encima puede tumbar el lote entero.
const deprecadas = SPEC.METRICS.filter(m => m.status === SPEC.METRIC_STATUS.deprecated);
const pedidasFb = SPEC.insightMetricNames({ platform: 'facebook', level: 'account' });
const colada = deprecadas.filter(m => pedidasFb.includes(m.metric));
eq('⚠️ Una métrica deprecada NO entra en la lista que se le pide a Meta', colada.map(m => m.canonical), []);
check('…y se conserva declarada, con su fecha y su reemplazo',
      deprecadas.every(m => m.deprecatedOn || m.replacedBy || m.note));

// El punto 16 del pedido: lo que la UI de Facebook muestra y la API no expone
// se DOCUMENTA como tal, no se aproxima.
check('⚠️ Lo que la UI de Meta muestra y la API no da está DECLARADO', SPEC.UI_ONLY_METRICS.length > 0);
check('…y cada entrada dice por qué no se puede', SPEC.UI_ONLY_METRICS.every(m => m.reason));
// ⚠️ Se compara por `id`, que es el campo que estas entradas SÍ tienen: con
// `canonical` —que no existe acá— el filtro daba siempre vacío y la
// comprobación pasaba sin comprobar nada (una prueba vacua afirma lo
// contrario de lo que dice, v4.896).
check('…y cada una tiene id y rótulo', SPEC.UI_ONLY_METRICS.every(m => m.id && m.label));
const inventada = SPEC.UI_ONLY_METRICS.filter(m => SPEC.METRICS.some(x => x.canonical === m.id));
eq('…y ninguna se aproxima con una métrica de la serie', inventada.map(m => m.id), []);
// La demografía es el caso que el pedido nombra como pestaña: no se guarda
// como serie porque Meta no la da con fecha, y eso se DICE.
check('⚠️ La demografía está declarada como no disponible, no aproximada',
      SPEC.UI_ONLY_METRICS.some(m => m.id === 'audience_demographics'));
check('…y ninguna métrica de la serie finge ser demografía',
      !SPEC.METRICS.some(m => /(^|_)(audience|gender|age|city|country)(_|$)/.test(m.canonical)));

grupo('2. La versión de la Graph API — aislada del camino que ya publica');
check('⚠️ Las estadísticas tienen su PROPIA versión de la Graph API',
      /META_INSIGHTS_GRAPH_VERSION/.test(specSrc));
check('…y no es la v18.0 del publicador, que Meta ya retiró',
      SPEC.GRAPH_VERSION !== 'v18.0');
// Si compartieran constante, subir la versión para leer estadísticas movería
// el camino que publica —que hoy funciona— sin que nadie lo pidiera.
check('⚠️ El módulo de estadísticas NO importa la versión del publicador',
      !/from '.*metaService\.js'/.test(metaSrc) || !/GRAPH_VERSION/.test(metaSrc.split("metaService.js'")[0] || ''));

grupo('3. Las fechas — construidas por partes, nunca con `new Date("2026-08-14")`');
// `new Date('2026-08-14')` es medianoche UTC y leída en otra zona devuelve el
// día anterior (la lección de v4.991).
check('⚠️ Ninguna fecha se parsea con `new Date(cadena)`',
      !/new Date\(\s*(key|from|to|dia|str\()/.test(specSrc));
eq('addDays cruza el fin de mes', SPEC.addDays('2026-07-31', 1), '2026-08-01');
eq('addDays cruza el fin de año', SPEC.addDays('2026-12-31', 1), '2027-01-01');
eq('addDays hacia atrás', SPEC.addDays('2026-03-01', -1), '2026-02-28');
eq('daysBetween cuenta los días', SPEC.daysBetween('2026-07-01', '2026-07-08'), 7);
eq('daysBetween de un rango invertido es negativo', SPEC.daysBetween('2026-07-08', '2026-07-01'), -7);
check('isDayKey rechaza lo que no es una fecha', !SPEC.isDayKey('ayer') && !SPEC.isDayKey('2026-7-1') && SPEC.isDayKey('2026-07-01'));

grupo('4. El rango — resuelto con `today` como PARÁMETRO');
// Una función que consulta el reloj por dentro no se puede probar.
check('⚠️ `resolveRange` recibe el día, no lo consulta', /resolveRange = \(\{[^}]*today/.test(specSrc));
eq('«últimos 7 días» incluye hoy', SPEC.resolveRange({ preset: 'last_7', today: '2026-09-14' }),
   { preset: 'last_7', from: '2026-09-08', to: '2026-09-14' });
eq('«desde el inicio» arranca en la fecha de seguimiento', SPEC.resolveRange({ preset: 'since_start', today: '2026-09-14' }),
   { preset: 'since_start', from: SPEC.TRACKING_START, to: '2026-09-14' });
eq('un preset desconocido cae al de siempre, no rompe',
   SPEC.resolveRange({ preset: 'la-semana-pasada', today: '2026-09-14' }).preset, 'last_28');
eq('⚠️ un rango a mano invertido se endereza (es un error de dedo)',
   SPEC.resolveRange({ preset: 'custom', from: '2026-09-10', to: '2026-09-01', today: '2026-09-14' }),
   { preset: 'custom', from: '2026-09-01', to: '2026-09-10' });
eq('⚠️ un rango a mano NO se puede pedir hacia el futuro',
   SPEC.resolveRange({ preset: 'custom', from: '2026-09-01', to: '2099-01-01', today: '2026-09-14' }).to, '2026-09-14');
eq('un rango a mano incompleto cae al de siempre',
   SPEC.resolveRange({ preset: 'custom', from: '2026-09-01', today: '2026-09-14' }).preset, 'last_28');

eq('el período anterior es de la misma longitud y pegado al actual',
   SPEC.previousRange({ from: '2026-09-08', to: '2026-09-14' }), { from: '2026-09-01', to: '2026-09-07' });
eq('un rango inválido no tiene período anterior', SPEC.previousRange({ from: 'x', to: 'y' }), null);

grupo('5. El troceo — Meta acota una consulta a 93 días');
// ⚠️ Pedir julio a hoy de una sola vez NO devuelve un error: devuelve menos de
// lo pedido, y el histórico queda con un hueco que nadie ve.
const v = SPEC.splitWindows({ from: '2026-01-01', to: '2026-09-14' });
check('un rango largo se trocea', v.length > 1);
check('⚠️ ninguna ventana pasa del tope de Meta',
      v.every(w => SPEC.daysBetween(w.from, w.to) + 1 <= SPEC.MAX_WINDOW_DAYS));
eq('la primera ventana empieza donde se pidió', v[0].from, '2026-01-01');
eq('la última termina donde se pidió', v[v.length - 1].to, '2026-09-14');
// Sin huecos ni solapes: un solape duplicaría el día y un hueco lo perdería.
let contiguas = true;
for (let i = 1; i < v.length; i++) if (SPEC.addDays(v[i - 1].to, 1) !== v[i].from) contiguas = false;
check('⚠️ las ventanas son contiguas: ni hueco ni solape', contiguas);
eq('un rango corto es UNA ventana', SPEC.splitWindows({ from: '2026-09-01', to: '2026-09-14' }).length, 1);
eq('un rango inválido no produce ninguna', SPEC.splitWindows({ from: 'x', to: '2026-09-14' }), []);

grupo('6. No se pide el histórico que Meta no tiene');
// El caso real: `follower_count` de Instagram guarda 30 días. Pedirle julio
// devuelve VACÍO —no un error— y el backfill lo reintentaría para siempre.
const limitada = { historyDays: 30 };
const r1 = SPEC.effectiveStart({ metric: limitada, from: '2026-07-01', today: '2026-09-14' });
check('⚠️ la ventana se acota a lo que la métrica guarda', r1.clamped === true);
eq('…y arranca en el día más viejo que existe', r1.from, '2026-08-16');
check('⚠️ …y DICE por qué, que es lo que el panel enseña en vez de un cero', !!r1.reason);

const r2 = SPEC.effectiveStart({ metric: { historyDays: null }, from: '2026-07-01', today: '2026-09-14' });
eq('una métrica con histórico largo no se acota', r2, { from: '2026-07-01', clamped: false, reason: null });

const r3 = SPEC.effectiveStart({ metric: { historyDays: 0 }, from: '2026-07-01', today: '2026-09-14' });
eq('⚠️ una métrica de sólo-hoy se pide sólo para hoy', r3.from, '2026-09-14');
check('…y se explica que la serie se construye capturándola cada día', !!r3.reason);

// Instagram no puede tener backfill a la fecha de inicio y eso está declarado.
const igLimitadas = ig.filter(m => Number.isFinite(m.historyDays));
check('⚠️ El límite de histórico de Instagram está DECLARADO, no descubierto en producción',
      igLimitadas.length > 0);

grupo('7. Agregación — un hueco no es un cero (punto 14 del pedido)');
const serie = [
    { metricDate: '2026-09-01', value: 10 },
    { metricDate: '2026-09-02', value: 20 },
    { metricDate: '2026-09-03', value: 30 },
];
eq('un flujo se SUMA', SPEC.aggregate({ rows: serie, cumulative: false }), 60);
eq('⚠️ un estado toma el ÚLTIMO valor, no la suma', SPEC.aggregate({ rows: serie, cumulative: true }), 30);
eq('…y el último es el del día más reciente, venga como venga la lista',
   SPEC.aggregate({ rows: [...serie].reverse(), cumulative: true }), 30);
eq('⚠️ sin ningún dato devuelve null, NUNCA cero', SPEC.aggregate({ rows: [], cumulative: false }), null);
eq('…tampoco con filas sin valor', SPEC.aggregate({ rows: [{ metricDate: '2026-09-01', value: null }] }), null);
eq('un cero MEDIDO sí es cero', SPEC.aggregate({ rows: [{ metricDate: '2026-09-01', value: 0 }] }), 0);
check('⚠️ `aggregate` no usa `|| 0`, que convertiría un hueco en una afirmación',
      !/\|\|\s*0/.test(cuerpo(specSrc, 'const aggregate')));

grupo('8. Comparación — un porcentaje que no se puede calcular no se inventa');
eq('la variación normal', SPEC.compare({ current: 120, previous: 100 }),
   { current: 120, previous: 100, delta: 20, percent: 20, basis: 'ok' });
const cero = SPEC.compare({ current: 40, previous: 0 });
eq('⚠️ de 0 a 40 NO es «+100 %»', cero.percent, null);
eq('…se da la variación absoluta y se dice que no hay base', [cero.delta, cero.basis], [40, 'sin_base']);
eq('de 0 a 0 no es un movimiento', SPEC.compare({ current: 0, previous: 0 }).basis, 'sin_movimiento');
eq('⚠️ sin dato actual no se compara nada', SPEC.compare({ current: null, previous: 100 }).basis, 'sin_dato');
eq('sin período anterior se dice', SPEC.compare({ current: 100, previous: null }).basis, 'sin_periodo_anterior');
eq('una caída da porcentaje negativo', SPEC.compare({ current: 50, previous: 100 }).percent, -50);

eq('el engagement rate se calcula con denominador', SPEC.engagementRate({ engagement: 50, views: 1000 }), 5);
eq('⚠️ sin denominador NO se calcula', SPEC.engagementRate({ engagement: 50, views: 0 }), null);
eq('…ni sin numerador', SPEC.engagementRate({ engagement: null, views: 1000 }), null);

grupo('9. El estado de la sincronización — «sin datos» y «error» no se ven igual');
check('El catálogo de estados es CERRADO', SPEC.SYNC_STATE_KEYS.length > 0);
check('…y un estado inventado no existe', SPEC.syncStateOf('inventado') === null);
check('…y cada uno tiene rótulo y tono', SPEC.SYNC_STATE_KEYS.every(k => SPEC.SYNC_STATES[k].label && SPEC.SYNC_STATES[k].tone));
check('⚠️ «faltan permisos» es un estado propio, no un cero', !!SPEC.SYNC_STATES.no_permission);
check('⚠️ «token vencido» es otro: se corrige en otro sitio', !!SPEC.SYNC_STATES.token_expired);
check('⚠️ «Meta no contestó» es otro más', !!SPEC.SYNC_STATES.provider_down);

eq('un token vencido se reconoce', SPEC.classifyMetaError({ code: 190 }), 'token_expired');
eq('un token caducado por subcódigo también', SPEC.classifyMetaError({ code: 102, error_subcode: 463 }), 'token_expired');
eq('un permiso que falta se reconoce', SPEC.classifyMetaError({ code: 10 }), 'no_permission');
eq('…y por el texto del mensaje también', SPEC.classifyMetaError({ code: 3, message: '(#3) Requires permission' }), 'no_permission');
eq('un límite de consultas se reconoce', SPEC.classifyMetaError({ code: 4 }), 'rate_limited');
eq('…y el límite por app de un usuario también', SPEC.classifyMetaError({ code: 17 }), 'rate_limited');
eq('una caída de Meta se reconoce', SPEC.classifyMetaError({ code: 2 }), 'provider_down');
eq('⚠️ una métrica retirada NO es un error de la cuenta',
   SPEC.classifyMetaError({ code: 100, message: '(#100) metric[0] must be one of the following' }), 'invalid_metric');
eq('⚠️ ante la duda, `error`: no se disfraza de un estado conocido',
   SPEC.classifyMetaError({ code: 9999, message: 'algo raro' }), 'error');

check('⚠️ Sólo se reintenta lo que puede salir distinto',
      SPEC.isRetryable('rate_limited') && SPEC.isRetryable('provider_down'));
check('…un permiso que falta NO se reintenta: gastaría la ventana para el mismo rechazo',
      !SPEC.isRetryable('no_permission') && !SPEC.isRetryable('token_expired') && !SPEC.isRetryable('error'));

grupo('10. ⚠️ El aislamiento entre sitios — va en el WHERE, nunca en la pantalla');
// Es la exigencia literal del pedido: «Nunca mezclar métricas entre tenants».
check('⚠️ Una sesión sin sitio recibe `[]` (ninguno), no `null` (todos)',
      /clubIds:\s*\[\]/.test(cuerpo(ctrlSrc, 'const resolveScope')));
check('…y sólo el operador de la plataforma puede recibir `null`',
      /isOperator\(req\)/.test(cuerpo(ctrlSrc, 'const resolveScope')));
// `[]` tiene que FORZAR el vacío en el SQL, no leerse como «sin filtro».
check('⚠️ El store distingue `[]` de `null` al armar el WHERE',
      /Array\.isArray\(clubIds\)/.test(storeSrc));
check('…y `[]` fuerza FALSE en vez de devolver el ecosistema entero',
      /FALSE/.test(cuerpo(storeSrc, 'const accountsWithSyncState')));

// Todas las rutas pasan por el MISMO punto. Con una resolución por ruta, la
// séptima se olvida y el fallo es MUDO: contesta de más.
const llamadas = (ctrlSrc.match(/accountsInScope\(/g) || []).length;
check('⚠️ TODA ruta resuelve su alcance por el mismo punto', llamadas >= 6, `${llamadas} llamadas`);
check('…y ese punto existe una sola vez',
      (ctrlSrc.match(/const accountsInScope\s*=/g) || []).length === 1);
// Una cuenta ajena NO EXISTE: confirmar que existe ya es filtrar que existe.
check('⚠️ Una cuenta fuera del alcance responde 404, no 403',
      /status\(404\)/.test(ctrlSrc) && !/status\(403\)[\s\S]{0,200}cuenta/i.test(ctrlSrc));
// El sitio sale del token. Si viniera del cuerpo, acotar no serviría de nada.
check('⚠️ El sitio del no-operador sale del TOKEN, nunca del cuerpo',
      /req\.user\?\.clubId/.test(cuerpo(ctrlSrc, 'const resolveScope')));

grupo('11. ⚠️ El token no sale al navegador, ni recortado');
check('La respuesta pública de una cuenta se compone en UN punto',
      (ctrlSrc.match(/const publicAccount\s*=/g) || []).length === 1);
check('⚠️ …y no incluye la credencial',
      !/accessToken|refreshToken/.test(cuerpo(ctrlSrc, 'const publicAccount')));
check('⚠️ El listado de cuentas NO selecciona el token',
      !/"accessToken"|"refreshToken"/.test(cuerpo(storeSrc, 'const accountsWithSyncState')));
// La credencial se lee APARTE y sólo en el momento de consultar a Meta.
check('⚠️ El token se lee en un solo punto del sincronizador',
      (syncSrc.match(/tokenOf\(/g) || []).length <= 2);
check('…reutilizando el lector que ya existe, no un segundo descifrado propio',
      /from '\.\/socialPublishingService\.js'/.test(leer('server/lib/socialAnalyticsSync.js')));
check('⚠️ Ningún módulo del dashboard devuelve el token en un JSON',
      !/res\.json\([^)]*[Tt]oken/.test(ctrlSrc));

grupo('12. La idempotencia — es del índice único, no de una lectura previa');
// Entre un SELECT y un INSERT caben dos vueltas del cron; lo único que impide
// la fila duplicada es la restricción de la base.
check('⚠️ La llave de la serie es cuenta × día × métrica',
      /UNIQUE INDEX[\s\S]{0,160}"accountId",\s*"metricDate",\s*metric/.test(ddlSrc));
check('…y la escritura resuelve el choque en la base',
      /ON CONFLICT \("accountId","metricDate",metric\) DO UPDATE/.test(syncSrc));
// No es un índice parcial: las tres columnas son NOT NULL, así que el
// ON CONFLICT va a secas (la trampa de v4.648).
check('⚠️ Ese índice NO es parcial, así que el ON CONFLICT no repite predicado',
      !/UNIQUE INDEX[\s\S]{0,200}"accountId",\s*"metricDate",\s*metric[\s\S]{0,80}WHERE/.test(ddlSrc));
check('El contenido también lleva su llave única', /UNIQUE INDEX[\s\S]{0,160}"accountId",\s*"externalId"/.test(ddlSrc));
check('…y sus métricas, la suya', /UNIQUE INDEX[\s\S]{0,160}"contentId",\s*"metricDate",\s*metric/.test(ddlSrc));

grupo('13. El reclamo — dos vueltas del cron no sincronizan la misma cuenta');
// El precio de que lo hicieran no es una fila duplicada —de eso se ocupa el
// ON CONFLICT— sino gastar dos veces la ventana de consultas de Meta.
check('⚠️ La cuenta se RECLAMA antes de llamar a Meta',
      /const claimAccount\s*=/.test(syncSrc));
check('…y el reclamo VENCE: una corrida que murió no bloquea para siempre',
      /CLAIM_TTL_MIN/.test(syncSrc) && /claimedAt/.test(syncSrc));
check('⚠️ Todo final de intento libera el reclamo, con su motivo',
      /"claimedAt" = NULL/.test(syncSrc) && /const closeRun\s*=/.test(syncSrc));
check('La incremental arranca donde quedó la anterior', /lastSyncedThrough/.test(syncSrc));
check('⚠️ …con un día de solape: Meta consolida la cifra del mismo día',
      /addDays\([^)]*,\s*-1\)/.test(cuerpo(syncSrc, 'const syncAccount')));

grupo('14. El barrido — presupuesto de tiempo y nada se pierde en silencio');
check('⚠️ El barrido tiene presupuesto: la función corta a los 300 s',
      /timeBudgetMs/.test(syncSrc));
check('…y lo que no entra se DEVUELVE en `pending`, no se descarta',
      /pending:\s*pendientes/.test(syncSrc));
check('⚠️ Una excepción de una cuenta no se lleva el barrido',
      /catch \(e\)[\s\S]{0,220}resultados\.push/.test(cuerpo(syncSrc, 'const sweepAnalytics')));
const cronSrc = codigo('server/routes/cron.js');
check('El cron está declarado', /\/social-analytics-tick/.test(cronSrc));
check('⚠️ …y protegido por CRON_SECRET, como el resto',
      /social-analytics-tick[\s\S]{0,400}CRON_SECRET/.test(cronSrc));
const vercel = JSON.parse(leer('vercel.json'));
const cronCfg = vercel.crons.find(c => c.path === '/api/cron/social-analytics-tick');
check('…y agendado en vercel.json', !!cronCfg);
// Las métricas diarias de Meta tienen resolución de DÍA: preguntar cada minuto
// no adelanta un número y sí gasta la ventana de consultas de la aplicación.
check('⚠️ …cada horas, no cada minuto: el dato tiene resolución de día',
      !!cronCfg && cronCfg.schedule !== '* * * * *');

grupo('15. Las llamadas a Meta — con tope de tiempo y reintento acotado');
// Ninguna espera sin tope (regla de v4.875): esto corre dentro de un cron y
// dentro del sondeo de una pantalla.
check('⚠️ Ninguna consulta a Meta va sin tope de tiempo',
      /AbortSignal\.timeout|signal:/.test(metaSrc));
check('El reintento tiene tope', /MAX_RETRIES/.test(metaSrc));
check('⚠️ …y sólo reintenta lo que puede salir distinto',
      /isRetryable\(/.test(metaSrc));
check('…con espera creciente y jitter, para no golpear a la vez',
      /Math\.random\(\)/.test(cuerpo(metaSrc, 'const backoffMs')));
// ⚠️ Una métrica muerta dentro de un lote tumba la consulta ENTERA, así que el
// sondeo pregunta una por una: es lo que convierte el catálogo en una
// hipótesis comprobable contra el token real.
check('⚠️ El sondeo pregunta métrica por métrica, no en lote',
      /const probeAccount\s*=/.test(metaSrc));
check('…y la medición de contenido cae a una por una cuando el lote se cae',
      /invalid_metric/.test(cuerpo(metaSrc, 'const fetchContentMetrics')));
check('La paginación tiene tope: un `paging.next` que no termina colgaría el proceso',
      /paging/.test(metaSrc) && /(MAX_PAGES|<=\s*20|< 20)/.test(metaSrc));

grupo('16. ⚠️ No se rompe la integración que ya funciona');
const metaService = leer('server/services/metaService.js');
// Los permisos de estadísticas se SUMAN a los que ya se piden. Un segundo
// flujo de OAuth daría dos tokens del mismo usuario para la misma Página y
// ninguna forma de saber cuál manda.
check('⚠️ Los permisos de publicación siguen pidiéndose, todos',
      ['pages_show_list', 'pages_read_engagement', 'pages_manage_posts',
       'pages_manage_metadata', 'instagram_basic', 'instagram_content_publish',
       'business_management'].every(s => metaService.includes(`'${s}'`)));
check('…y los de estadísticas se AGREGAN a esa misma lista',
      /'read_insights'/.test(metaService) && /'instagram_manage_insights'/.test(metaService));
check('⚠️ No hay un segundo flujo de OAuth',
      (metaService.match(/export const buildAuthUrl/g) || []).length === 1);
// La analítica no publica: si importara el publicador, un cambio pensado para
// leer podría colarse en el camino que escribe en la cuenta de una institución.
// Se mira el CÓDIGO, no el archivo: el comentario que explica de dónde se
// viene tiene que poder nombrar el módulo sin hacer fallar la comprobación que
// lo defiende (la lección de v4.1005).
check('⚠️ La analítica NO importa el servicio que PUBLICA en Meta',
      !/socialPublishService\.js/.test(syncSrc) && !/socialPublishService\.js/.test(metaSrc));
check('…ni el controller de analítica publica nada',
      !/publishContentToTarget|publishPost/.test(ctrlSrc));
// El módulo viejo de insights se conserva: sus rutas siguen sirviendo a quien
// tenga el bundle anterior en caché.
const rutas = leer('server/routes/social.js');
check('⚠️ Las rutas de `/insights` se conservan enteras',
      /\/insights\/overview/.test(rutas) && /\/insights\/refresh/.test(rutas));
check('…y las de analítica se suman aparte', /\/analytics\/overview/.test(rutas));
// Literales antes de la paramétrica: una literal debajo de su paramétrica es
// inalcanzable y el fallo es MUDO (`check:routes`).
check('⚠️ `/analytics/content` se declara ANTES de `/analytics/content/:id`',
      rutas.indexOf("'/analytics/content'") < rutas.indexOf("'/analytics/content/:id'"));

// ⚠️ UN PARÁMETRO QUE EL MANEJADOR LEE Y LA RUTA NO DECLARA LLEGA `undefined`,
// y el fallo es MUDO: el manejador busca por un id vacío, no encuentra nada y
// contesta 404 sobre una cuenta que sí existe. No lo ve `check:routes` —la
// ruta está bien formada— ni el typecheck —esto es `.js` fuera de `src`—. Es
// la forma de v4.1027 con un nombre en vez de un manejador ausente.
const RUTAS_ANALYTICS = [...rutas.matchAll(/router\.(get|post)\('(\/analytics[^']*)',\s*authMiddleware,\s*(\w+)\)/g)]
    .map(m => ({ path: m[2], handler: m[3] }));
// ⚠️ SE EXIGE EL CONJUNTO, NO UN NÚMERO (la lección de v4.1008). Fijada en
// «ocho», una ruta nueva y legítima hace fallar la prueba POR EXISTIR, y lo
// cómodo entonces es subir el número — que es exactamente perder la
// comprobación. Lo que no puede pasar es que una de éstas DESAPAREZCA o deje
// de pasar por `authMiddleware`.
const RUTAS_ESPERADAS = [
    '/analytics/scope', '/analytics/catalog', '/analytics/overview',
    '/analytics/content', '/analytics/content/:id', '/analytics/sync/:accountId',
    '/analytics/sync', '/analytics/probe/:accountId', '/analytics/verify/:accountId',
];
const faltanRutas = RUTAS_ESPERADAS.filter((r) => !RUTAS_ANALYTICS.some((x) => x.path === r));
eq('⚠️ Todas las rutas de analítica están registradas y autenticadas', faltanRutas, []);
const paramsRotos = [];
for (const r of RUTAS_ANALYTICS) {
    const declarados = [...r.path.matchAll(/:(\w+)/g)].map(m => m[1]);
    const leidos = [...new Set([...cuerpo(ctrlSrc, `const ${r.handler} =`).matchAll(/req\.params\.(\w+)/g)].map(m => m[1]))];
    for (const leido of leidos) if (!declarados.includes(leido)) paramsRotos.push(`${r.path} lee req.params.${leido}`);
}
eq('⚠️ Todo `req.params` que un manejador lee está declarado en su ruta', paramsRotos, []);

grupo('17. ⚠️ Las tablas viven fuera de Prisma');
// Una columna declarada en `schema.prisma` y todavía inexistente deja en 500
// toda consulta `findMany` sin `select` — y acá caería sobre el camino que
// PUBLICA (regla de `logo_intl`, v4.699). El `build` no ejecuta `db push`.
const prismaSchema = leer('server/prisma/schema.prisma');
for (const t of ['SocialDailyMetric', 'SocialContentItem', 'SocialContentMetric', 'SocialSyncRun']) {
    check(`⚠️ \`${t}\` NO está declarada en Prisma`, !new RegExp(`model ${t}\\b`).test(prismaSchema));
    check(`…y sí se crea en runtime`, new RegExp(`"${t}"`).test(ddlSrc));
}
check('⚠️ `SocialAccount` no gana ni una columna por la analítica',
      !/model SocialAccount[\s\S]*?\n\}/.test(prismaSchema) || !/lastAnalyticsSync|insightsState/.test(prismaSchema));
// El atajo del ensure tiene que enumerar cada ADD COLUMN (trampa de v4.908):
// `CREATE TABLE IF NOT EXISTS` no amplía nada.
const addCols = [...ddlSrc.matchAll(/ADD COLUMN IF NOT EXISTS\s+"?(\w+)"?/g)].map(m => m[1]);
const faltan = addCols.filter(c => !new RegExp(`'${c}'`).test(ddlSrc));
eq('⚠️ Todo ADD COLUMN está enumerado en el atajo del ensure', faltan, []);
// Ni una comilla invertida dentro del SQL en template literal: cierra el
// literal y el módulo entero deja de parsear (v4.721.1, v4.847, v4.1017).
const sqlBloques = [...leer('server/lib/ensureSocialAnalyticsSchema.js').matchAll(/db\.query\(`([\s\S]*?)`\)/g)].map(m => m[1]);
check('⚠️ Ninguna comilla invertida dentro de un SQL en template literal',
      sqlBloques.every(b => !b.includes('`')));

grupo('18. La agregación ocurre en la base, no trayendo filas al navegador');
// Con las filas crudas, un rango de un año por cuenta son miles de filas por
// visita para calcular cuatro números.
check('⚠️ Los totales se agregan en SQL', /SUM\(/.test(cuerpo(storeSrc, 'const totalsByMetric')));
check('⚠️ …y un acumulado toma el ÚLTIMO valor, no la suma',
      /ARRAY_AGG\([\s\S]{0,80}ORDER BY "metricDate" DESC/.test(cuerpo(storeSrc, 'const totalsByMetric')));
check('Ninguna consulta corre dentro de un bucle',
      !/for\s*\([^)]*\)\s*\{[\s\S]{0,300}await db\.query/.test(storeSrc));
check('El histórico de sincronizaciones tiene tope de filas',
      /LIMIT/.test(cuerpo(storeSrc, 'const syncHistory')));

grupo('19. La cobertura — qué se sabe y desde cuándo se dice, no se supone');
check('⚠️ La cobertura del histórico se DEVUELVE', /const coverage\s*=/.test(storeSrc));
check('…y el overview la manda a la pantalla', /coverage/.test(ctrlSrc));
// Un KPI sin dato no se pinta como cero: se omite y la pantalla dice por qué.
check('⚠️ Un KPI sin dato NO se convierte en cero',
      /current === null/.test(ctrlSrc) || /!== null/.test(cuerpo(ctrlSrc, 'const getAnalyticsOverview')));
check('El estado de la sincronización viaja RESUELTO a la pantalla',
      /sync:/.test(cuerpo(ctrlSrc, 'const publicAccount')));

grupo('20. La operación administrativa queda registrada');
// Requisito de seguridad del pedido: «Registrar operaciones administrativas de
// reconexión/resync».
check('⚠️ Una resincronización a mano queda auditada',
      /auditSocial/.test(ctrlSrc));
check('…y el sondeo de métricas también', /auditSocial/.test(cuerpo(ctrlSrc, 'const postAnalyticsProbe')));

// ════════════════════════════════════════════════════════════════════
grupo('21. ⚠️ LOS PERMISOS SE LEEN DE META, NO DE LO QUE PEDIMOS (v4.1055)');
// El defecto de fondo del módulo: `metaSync` guardaba en `permissions` la
// lista SOLICITADA (`META_SCOPES`). Sobre esa lista no se puede afirmar nada
// —pedir un permiso no lo concede— y producía las dos mitades del reporte: las
// cuentas conectadas antes de v4.1053 salían como «no concedió el permiso» y,
// en cuanto alguien reconectaba, el aviso desaparecía SIN que Meta hubiera
// concedido nada. Verificado a la inversa: devolviendo `META_SCOPES` a los dos
// upserts, esta sección falla.
const syncMetaSrc = codigo('server/lib/metaSync.js');
const metaSvcSrc  = codigo('server/services/metaService.js');
const checkSrc    = codigo('server/lib/metaPermissionCheck.js');

check('⚠️ `debug_token` devuelve los permisos CONCEDIDOS y se leen',
      /data\.scopes/.test(metaSvcSrc) || /info\.scopes/.test(metaSvcSrc));
check('…y un permiso granular también cuenta como concedido',
      /granular/.test(cuerpo(metaSvcSrc, 'const readTokenGrant')));
check('⚠️ HAY UNA SOLA LLAMADA A `debug_token`',
      (metaSvcSrc.match(/debug_token\?input_token/g) || []).length === 1);
check('…y `readGranularScopes` se sirve de ella en vez de repetirla',
      /readGranularScopes = async \(userToken\) => \(await readTokenGrant/.test(metaSvcSrc));

check('⚠️ Lo que se GUARDA como permisos es lo concedido, no lo pedido',
      !/permissions: META_SCOPES/.test(syncMetaSrc) && /permissions: permisosGuardados/.test(syncMetaSrc));
check('⚠️ …y `null` no se confunde con «no concedió nada»',
      /permisosConcedidos \|\| META_SCOPES/.test(syncMetaSrc));
check('…y se DECLARA si se pudo comprobar o no',
      /permissionsSource/.test(syncMetaSrc));
check('⚠️ Falta un permiso de estadísticas → se dice CON SU CAUSA',
      /insights_scope_missing/.test(syncMetaSrc) && /App Review/.test(syncMetaSrc));
check('…y el permiso sale del catálogo compartido, no escrito otra vez',
      /INSIGHTS_SCOPES/.test(syncMetaSrc) && !/'read_insights'/.test(syncMetaSrc));

grupo('22. El veredicto distingue «se comprobó y falta» de «no se comprobó»');
const readiness = cuerpo(syncSrc, 'const insightsReadiness');
check('⚠️ Una lista que nadie midió NO cierra la puerta',
      /permissionsSource/.test(readiness) && /verificado/.test(readiness));
check('…y con la lista verificada y el permiso ausente, sí',
      /verificado && !permisos\.includes\(scope\)/.test(readiness));
check('⚠️ Se distingue App Review de «lo desmarcaron»',
      /app_review/.test(readiness) && /user_declined/.test(readiness));
check('⚠️ La tarea ANALYZE sobre la Página se comprueba aparte del permiso',
      /ANALYZE/.test(readiness) && /page_task/.test(readiness));
check('…y cada bloqueo lleva su salida', /fix:/.test(readiness));

grupo('23. La comprobación en vivo le pregunta a META, no a nuestros registros');
check('⚠️ Inspecciona el token contra Meta', /readTokenGrant/.test(checkSrc));
check('…y hace una consulta REAL a la arista de estadísticas',
      /\/insights\?metric=/.test(checkSrc));
check('⚠️ MANDA LA ARISTA: si responde, la cuenta puede leer',
      /edge\?\.ok/.test(checkSrc));
check('⚠️ El catálogo de bloqueos es CERRADO y cada uno trae su salida',
      Object.keys((await import('../server/lib/metaPermissionCheck.js')).BLOCKERS).length >= 8);
const BLK = (await import('../server/lib/metaPermissionCheck.js')).BLOCKERS;
eq('…y ninguno se queda sin `fix`', Object.entries(BLK).filter(([, v]) => !v.fix).map(([k]) => k), []);
check('⚠️ Sólo se pisa `permissions` cuando se pudo MEDIR',
      /concedidos \? \{ permissions: concedidos \}/.test(checkSrc));
check('⚠️ NO publica ni escribe en Meta: sólo lee',
      !/method:\s*'POST'/.test(checkSrc) && !/socialPublishService/.test(checkSrc));
check('⚠️ El token NUNCA se registra', !/console\.(log|warn|error)[^\n]*(accessToken|userToken|pageToken)/.test(checkSrc));

grupo('24. El registro técnico de cada intento (requisito 6)');
check('⚠️ `diagnostics` está declarada y enumerada en el atajo del ensure',
      /diagnostics JSONB/.test(ddlSrc) && /column_name IN \('diagnostics'\)/.test(ddlSrc));
check('…y se escribe con cada cierre de intento', /diagnostics = \$9/.test(syncSrc));
const diag = cuerpo(syncSrc, 'export const syncAccount');
for (const campo of ['tokenKind', 'endpoint', 'requestedFrom', 'requestedTo', 'graphVersion']) {
    check(`…y guarda «${campo}»`, new RegExp(campo).test(diag));
}
check('⚠️ El rango RECUPERADO sale de las filas, no del pedido',
      /recoveredFrom/.test(diag) && /dias\[0\]/.test(diag));
check('…y un fallo declara que no recuperó nada', /recoveredFrom: null/.test(diag));
// ⚠️ SE COMPRUEBA QUE SE LEA `error_subcode` DE META, no que la palabra
// «subcode» aparezca: con `subcode: null` escrito en la rama del catch, la
// comprobación pasaba en verde con la propagación quitada. Una prueba vacua
// afirma lo contrario de lo que dice (v4.896).
check('⚠️ El código y el SUBCÓDIGO de Meta se propagan',
      /metaSubcode/.test(diag) && /err\.error_subcode/.test(metaSrc)
      && /metaSubcode: r\.subcode/.test(metaSrc));
check('…y el estado HTTP también', /httpStatus/.test(diag) && /httpStatus: resp\.status/.test(metaSrc));
check('⚠️ El diagnóstico NUNCA lleva el token',
      !/token:\s*(token|accessToken)/.test(diag));

grupo('25. Reautorizar no rompe lo que ya publica');
check('⚠️ Los permisos de publicación SIGUEN pidiéndose',
      ['pages_show_list', 'pages_manage_posts', 'instagram_content_publish']
          .every((p) => metaSvcSrc.includes(p)));
check('⚠️ …y los de estadísticas se SUMAN a esa lista, no la reemplazan',
      metaSvcSrc.includes('read_insights') && metaSvcSrc.includes('instagram_manage_insights'));
check('⚠️ `auth_type=rerequest` fuerza la pantalla de selección completa',
      /rerequest/.test(metaSvcSrc));
check('⚠️ Reautorizar NO duplica cuentas: se escribe por upsert',
      /socialAccount\.upsert/.test(syncMetaSrc));
check('…y el sincronizador sigue siendo UNO',
      (syncMetaSrc.match(/export const syncMetaAccountsForClub/g) || []).length === 1);
const panelSrc = leer('src/components/admin/analytics/SocialAnalytics.tsx');
check('⚠️ El panel NO abre un segundo OAuth: usa `/social/connect/meta`',
      /social\/connect\/meta/.test(panelSrc));
check('…y ofrece la salida donde está el aviso', /Reautorizar Meta/.test(panelSrc));
check('…y la comprobación en vivo, por cuenta', /verify\/\$\{accountId\}/.test(panelSrc));
check('⚠️ Ninguna respuesta se lee con `.json()` a ciegas (v4.946)',
      !/await\s+\w+\.json\(\)/.test(panelSrc));

// ════════════════════════════════════════════════════════════════════
grupo('26. Las capacidades por métrica — v4.1056');

// ⚠️ EL ERROR REPORTADO EN FACEBOOK. `page_fan_adds` y `page_fan_removes`
// contestaban «(#100) el valor debe ser una métrica de insights válida»: Meta
// retiró la familia «fans» y también su reemplazo `page_daily_follows*`. Lo
// que no se puede pedir NO se pide.
const pedidasFbAhora = SPEC.insightMetricNames({ platform: 'facebook', level: 'account' });
check('⚠️ `page_fan_adds` ya NO se le pide a Meta', !pedidasFbAhora.includes('page_fan_adds'));
check('⚠️ `page_fan_removes` tampoco', !pedidasFbAhora.includes('page_fan_removes'));
check('…y siguen declaradas, con su fecha y su motivo',
      ['followers_gained', 'followers_lost'].every(c => {
          const m = SPEC.metricByCanonical('facebook', c);
          return m && m.status === 'deprecated' && m.deprecatedOn && m.note;
      }));
// Y no se inventa un reemplazo que Meta tampoco tiene.
check('⚠️ NO se cuela ninguna métrica `page_daily_follows*` como reemplazo',
      !pedidasFbAhora.some(m => /page_daily_(un)?follows/.test(m)));

// El crecimiento neto: lo único que sí se puede afirmar.
const netoFb = SPEC.metricByCanonical('facebook', 'followers_net');
check('⚠️ El crecimiento NETO se deriva, no se le pide a Meta',
      netoFb && netoFb.source === 'derived' && netoFb.derivedFrom === 'followers');
check('…y NO se publica un desglose de altas y bajas que Meta no da',
      !SPEC.metricsFor({ platform: 'facebook' }).some(m => ['followers_gained', 'followers_lost'].includes(m.canonical)));

// ⚠️ EL ERROR REPORTADO EN INSTAGRAM (1/2): `views` exige `metric_type`.
const igViews = SPEC.metricByCanonical('instagram', 'views');
check('⚠️ `views` de Instagram declara `metric_type=total_value`', igViews?.metricType === 'total_value');
check('…y NO se le pone a `reach`, que Meta acepta sin él',
      !SPEC.metricByCanonical('instagram', 'reach')?.metricType);
check('…ni a ninguna métrica de Facebook',
      !SPEC.metricsFor({ platform: 'facebook', includeDeprecated: true }).some(m => m.metricType));

// ⚠️ EL ERROR REPORTADO EN INSTAGRAM (2/2): más de 30 días entre since y until.
eq('⚠️ El tope de ventana de Instagram es 30 días', SPEC.PLATFORM_WINDOW_DAYS.instagram, 30);
eq('…y el de Facebook, 93', SPEC.PLATFORM_WINDOW_DAYS.facebook, 93);
const planReach = SPEC.planMetric({ metric: SPEC.metricByCanonical('instagram', 'reach'), from: '2026-07-01', to: '2026-09-14', today: '2026-09-14' });
check('⚠️ Ninguna ventana de `reach` supera los 30 días',
      planReach.windows.length > 1 && planReach.windows.every(v => SPEC.daysBetween(v.from, v.to) < 30));
// Contiguas y sin solape: un hueco pierde días y un solape los pide dos veces.
const ventanasPegadas = planReach.windows.every((v, i) => i === 0 || SPEC.addDays(planReach.windows[i - 1].to, 1) === v.from);
check('…y son contiguas, sin solaparse ni dejar días fuera', ventanasPegadas);
eq('…y cubren el rango entero', [planReach.windows[0].from, planReach.windows[planReach.windows.length - 1].to], ['2026-07-01', '2026-09-14']);

// Una métrica agregada no tiene serie: se pide de a un día o no se atribuye.
eq('⚠️ Una métrica `total_value` se pide en ventanas de UN día', SPEC.maxWindowFor(igViews), 1);
check('…y su forma de respuesta se declara', SPEC.responseShapeOf(igViews) === 'aggregate');

// Facebook no hereda el tope de Instagram ni al revés.
check('⚠️ Cada plataforma usa SU tope, no el de al lado',
      SPEC.maxWindowFor(SPEC.metricByCanonical('facebook', 'views')) === 93
      && SPEC.maxWindowFor(SPEC.metricByCanonical('instagram', 'reach')) === 30);

// ════════════════════════════════════════════════════════════════════
grupo('27. Un límite de Meta no es un fallo de permisos');

const planSeg = SPEC.planMetric({ metric: SPEC.metricByCanonical('instagram', 'followers_gained'), from: '2026-07-01', to: '2026-09-14', today: '2026-09-14' });
check('⚠️ La retención de 30 días ACOTA la ventana, no falla', planSeg.limited === true && planSeg.windows.length === 1);
eq('…y no pide lo que Meta no guarda', planSeg.windows[0].from, '2026-08-16');
check('…y dice por qué', /30 días/.test(planSeg.reason || ''));

check('⚠️ «historia_acotada» es un LÍMITE, no un fallo', SPEC.noteSeverity({ code: 'historia_acotada' }) === 'limit');
check('⚠️ «metrica_retirada» también', SPEC.noteSeverity({ code: 'metrica_retirada' }) === 'limit');
check('…pero un token vencido es un FALLO', SPEC.noteSeverity({ code: 'token_expired' }) === 'failure');
check('…y un código que nadie declaró cuenta como fallo, no como límite',
      SPEC.noteSeverity({ code: 'algo_que_nadie_declaro' }) === 'failure');

eq('⚠️ Sólo límites → «sincronizada con limitaciones»',
   SPEC.classifyRun({ notes: [{ code: 'historia_acotada' }], wrote: 40 }), 'limited');
eq('…y ese estado NO bloquea', SPEC.SYNC_STATES.limited.blocking, false);
eq('…y se pinta en verde, no en ámbar', SPEC.SYNC_STATES.limited.tone, 'ok');
eq('Sin nada que reportar → «sincronización completa»', SPEC.classifyRun({ notes: [], wrote: 40 }), 'ok');
eq('⚠️ Un fallo real sí degrada a «en parte»',
   SPEC.classifyRun({ notes: [{ code: 'historia_acotada' }, { code: 'error' }], wrote: 40 }), 'partial');
eq('⚠️ Un fallo de permisos tapa a un límite, nunca al revés',
   SPEC.classifyRun({ notes: [{ code: 'historia_acotada' }, { code: 'no_permission' }], wrote: 40 }), 'no_permission');
eq('…y sin una sola fila escrita no es «en parte»: no se sincronizó nada',
   SPEC.classifyRun({ notes: [{ code: 'error' }], wrote: 0 }), 'error');

// El botón «Comprobar permisos con Meta», sólo con evidencia real.
check('⚠️ Una retención NO ofrece «Comprobar permisos con Meta»',
      SPEC.needsPermissionCheck({ status: 'limited', notes: [{ code: 'historia_acotada' }] }) === false);
check('…ni una métrica retirada', SPEC.needsPermissionCheck({ status: 'limited', notes: [{ code: 'metrica_retirada' }] }) === false);
check('…y un permiso que falta SÍ lo ofrece',
      SPEC.needsPermissionCheck({ status: 'no_permission', notes: [] }) === true);
check('…y un token vencido también',
      SPEC.needsPermissionCheck({ status: 'ok', notes: [{ code: 'token_expired' }] }) === true);

// ════════════════════════════════════════════════════════════════════
grupo('28. El crecimiento neto sale de capturas, y un hueco se dice');

const neto = SPEC.deriveFollowersNet({ rows: [
    { metricDate: '2026-09-01', value: 100 },
    { metricDate: '2026-09-02', value: 104 },
    { metricDate: '2026-09-04', value: 110 },
] });
eq('⚠️ Sólo entre días CONSECUTIVOS', neto.rows.map(r => r.metricDate), ['2026-09-02']);
eq('…con el valor neto', neto.rows[0].value, 4);
eq('⚠️ El salto sobre un hueco NO se reparte entre los días', neto.gapDays.length, 1);
check('…y un hueco se DECLARA', neto.gapDays[0].from === '2026-09-02' && neto.gapDays[0].to === '2026-09-04');
eq('⚠️ Una sola captura no produce ningún neto',
   SPEC.deriveFollowersNet({ rows: [{ metricDate: '2026-09-01', value: 100 }] }).rows.length, 0);
check('⚠️ Un neto NEGATIVO se conserva: perder seguidores es un dato',
      SPEC.deriveFollowersNet({ rows: [
          { metricDate: '2026-09-01', value: 100 }, { metricDate: '2026-09-02', value: 95 },
      ] }).rows[0].value === -5);
// Lo que NO se hace: deducir altas y bajas de un neto.
check('⚠️ NO se fabrican altas ni bajas a partir del neto',
      SPEC.deriveFollowersNet({ rows: [
          { metricDate: '2026-09-01', value: 100 }, { metricDate: '2026-09-02', value: 104 },
      ] }).rows.every(r => r.canonical === 'followers_net'));

// ════════════════════════════════════════════════════════════════════
grupo('29. La petición que de verdad sale hacia Meta');

// ⚠️ EL CRITERIO PUEDE ESTAR ENTERO Y EL DEFECTO VIVIR EN EL CAMINO (v4.744).
// Acá se ejecuta `fetchAccountSeries` con `fetch` sustituido y se MIRAN las
// URLs que arma: es lo único que demuestra que el plan del catálogo llega de
// verdad a la consulta.
const META = await import('../server/lib/metaInsights.js');
const urls = [];
const fetchReal = globalThis.fetch;
globalThis.fetch = async (url) => {
    urls.push(String(url));
    return {
        ok: true, status: 200,
        json: async () => ({ data: [{ name: 'x', values: [{ value: 7, end_time: '2026-09-02T07:00:00+0000' }] }] }),
    };
};
const serieIg = await META.fetchAccountSeries({
    platform: 'instagram', platformId: 'IG1', accessToken: 'SECRETO-NO-DEBE-SALIR',
    from: '2026-07-01', to: '2026-09-14', today: '2026-09-14',
});
globalThis.fetch = fetchReal;

const urlsDe = (m) => urls.filter(u => u.includes(`metric=${m}&`) || u.includes(`metric=${m}`));
check('⚠️ Ninguna consulta pide más de 30 días en Instagram', urls.every(u => {
    const a = /since=(\d{4}-\d{2}-\d{2})/.exec(u); const b = /until=(\d{4}-\d{2}-\d{2})/.exec(u);
    return !a || !b || SPEC.daysBetween(a[1], b[1]) < 30;
}));
check('⚠️ `views` viaja con `metric_type=total_value`',
      urlsDe('views').length > 0 && urlsDe('views').every(u => u.includes('metric_type=total_value')));
check('…y `reach` NO lo lleva',
      urlsDe('reach').length > 0 && urlsDe('reach').every(u => !u.includes('metric_type=')));
check('⚠️ `views` se pide de a un día para poder atribuirla',
      urlsDe('views').every(u => {
          const a = /since=(\d{4}-\d{2}-\d{2})/.exec(u); const b = /until=(\d{4}-\d{2}-\d{2})/.exec(u);
          return a && b && a[1] === b[1];
      }));
check('⚠️ No se pide `follower_count` antes de lo que Meta guarda',
      urlsDe('follower_count').every(u => !/since=2026-0[78]-0/.test(u)));
check('⚠️ El presupuesto de llamadas acota la vuelta', serieIg.calls <= 120);
check('…y lo que no entró se DICE, sin perderse',
      serieIg.notes.some(n => n.code === 'presupuesto') || serieIg.coveredThrough !== null);
check('⚠️ Una vuelta acotada deja su marca de agua', SPEC.isDayKey(serieIg.coveredThrough || '') || serieIg.coveredThrough === null);

// Facebook: su propio tope, sus propias métricas.
urls.length = 0;
globalThis.fetch = async (url) => {
    urls.push(String(url));
    return { ok: true, status: 200, json: async () => ({ data: [] }) };
};
await META.fetchAccountSeries({
    platform: 'facebook', platformId: 'FB1', accessToken: 'SECRETO-NO-DEBE-SALIR',
    from: '2026-07-01', to: '2026-09-14', today: '2026-09-14',
});
globalThis.fetch = fetchReal;
check('⚠️ Facebook NO pide las métricas que Meta retiró',
      !urls.some(u => /page_fan_adds|page_fan_removes|page_daily_follows/.test(u)));
check('…y usa su propio tope de 93 días, no el de Instagram',
      urls.some(u => {
          const a = /since=(\d{4}-\d{2}-\d{2})/.exec(u); const b = /until=(\d{4}-\d{2}-\d{2})/.exec(u);
          return a && b && SPEC.daysBetween(a[1], b[1]) > 30;
      }));

// ════════════════════════════════════════════════════════════════════
grupo('30. El diagnóstico y la pantalla');

// ⚠️ NUNCA EL TOKEN. El diagnóstico existe para poder saber por qué falló una
// métrica sin volver a reproducirlo a ciegas — no para filtrar la credencial.
urls.length = 0;
globalThis.fetch = async (url) => {
    urls.push(String(url));
    return {
        ok: false, status: 400,
        json: async () => ({ error: { message: '(#100) must be a valid insights metric', code: 100 } }),
    };
};
const fallo = await META.fetchAccountSeries({
    platform: 'facebook', platformId: 'FB1', accessToken: 'SECRETO-NO-DEBE-SALIR',
    from: '2026-09-01', to: '2026-09-14', today: '2026-09-14',
});
globalThis.fetch = fetchReal;
const diagTexto = JSON.stringify(fallo.diagnostics || []);
check('⚠️ El diagnóstico NO lleva el token, ni recortado', !/SECRETO/.test(diagTexto));
check('…y sí la petición: métrica, ventana y código de Meta',
      /"since"/.test(diagTexto) && /"until"/.test(diagTexto) && /"metaCode":100/.test(diagTexto));
check('⚠️ Una métrica retirada NO se reporta como problema de permisos',
      fallo.notes.every(n => n.code !== 'no_permission'));

// Sin comentarios: el comentario que explica el cambio no puede hacer fallar
// la comprobación que lo defiende (la lección de v4.1005).
const panelUi = codigo('src/components/admin/analytics/SocialAnalytics.tsx');
// La INVARIANTE, no la distancia: el rótulo del botón vive DENTRO del bloque
// que abre `needsPermissionCheck`. Atada a una ventana de caracteres se rompía
// al crecer el `className` — la lección de v4.984.
const botonCondicionado = (() => {
    const i = panelUi.indexOf('Comprobar permisos con Meta');
    if (i < 0) return false;
    const antes = panelUi.slice(0, i);
    const abre = antes.lastIndexOf('&& (');          // apertura del bloque condicional
    if (abre < 0) return false;
    const cond = antes.slice(antes.lastIndexOf('{(', abre), abre);
    return /needsPermissionCheck/.test(cond);
})();
check('⚠️ El botón de permisos está CONDICIONADO, no siempre a la vista', botonCondicionado);
check('⚠️ Un límite se pinta distinto de una avería',
      /severity === 'limit'/.test(panelUi));
check('⚠️ El servidor resuelve la severidad; la pantalla no la deduce',
      /noteSeverity/.test(ctrlSrc) && !/LIMIT_NOTE_CODES/.test(panelUi));
check('⚠️ «limited» cuenta como sincronización buena en el resumen',
      /'limited'/.test(panelUi));
check('⚠️ …y la marca de agua avanza con «limited», o el backfill se repetiría siempre',
      /status IN \('ok','limited','partial'\)/.test(syncSrc));

// ════════════════════════════════════════════════════════════════════
console.log(`\n${'─'.repeat(60)}`);
if (malos.length) {
    console.log(`✗ ${malos.length} de ${ok + malos.length} fallaron:`);
    malos.forEach(m => console.log(`   · ${m}`));
    process.exit(1);
}
console.log(`✓ ${ok} comprobaciones, todas en verde.`);
