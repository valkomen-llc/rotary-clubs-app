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
const incompletas = SPEC.METRICS.filter(m => !m.canonical || !m.platform || !m.level || !m.endpoint || !m.permission);
eq('⚠️ Ninguna métrica se declara sin endpoint, permiso y nivel', incompletas.map(m => m.canonical), []);

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
check('Las ocho rutas de analítica están registradas', RUTAS_ANALYTICS.length === 8, `${RUTAS_ANALYTICS.length}`);
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
console.log(`\n${'─'.repeat(60)}`);
if (malos.length) {
    console.log(`✗ ${malos.length} de ${ok + malos.length} fallaron:`);
    malos.forEach(m => console.log(`   · ${m}`));
    process.exit(1);
}
console.log(`✓ ${ok} comprobaciones, todas en verde.`);
