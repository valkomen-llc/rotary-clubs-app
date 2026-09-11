/**
 * Recuperación por escena del Creador de Reels — v4.1028
 *
 * Reporte con la ficha delante: «3/5 escenas listas», dos en error tras
 * «consumir sus 2 generaciones», el Reel entero en `error`, y ninguna vía que
 * no fuera regenerarlo todo y pagar otra vez las tres que sí salieron.
 *
 * Acá se prueba el CRITERIO —la escalera de estrategias, el preflight, la
 * clasificación del fallo del proveedor, el único punto de decisión de la
 * recuperación, la llave de idempotencia— y, leyendo los archivos, el CABLEADO
 * que ninguna prueba pura ve: que una escena con clip no se toque nunca, que
 * el respaldo no se presente como lista, que un asset entre a la Biblioteca en
 * cuanto exista, y que el Reel quede «incompleto» en vez de morir.
 *
 * No necesita base, credenciales ni red.
 */
import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import path from 'path';
import {
    STRATEGY_LADDER, DEFAULT_SCENE_STRATEGY, SCENE_STRATEGIES, nextStrategy, isSceneStrategy,
    MAX_PAID_GENERATIONS, ABSOLUTE_PAID_CAP, MAX_TRANSIENT_RETRIES, transientBackoffSec,
    SCENE_FAILURE_CODES, failureCodeOf, classifyProviderFailure,
    assessSceneMotionRisk, planSceneRecovery, sceneIdempotencyKey,
    USABLE_SCENE_STATUSES, isUsableSceneStatus, SCENE_STATUSES, REEL_STATUSES, isResumableReelStatus,
    buildScenePrompt, CONSERVATIVE_PEOPLE_CLAUSE,
} from '../server/lib/reelSpec.js';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = (p) => readFileSync(path.join(root, p), 'utf8');
let pass = 0, fail = 0;
const check = (name, ok, extra = '') => {
    if (ok) { pass++; console.log(`  OK    ${name}`); }
    else { fail++; console.log(`  FALLA ${name}${extra ? ` — ${extra}` : ''}`); }
};

// ───────────────────────────────────────────────────────────────────────────
console.log('\n▸ 1. La escalera de estrategias');
check('son tres peldaños en este orden: narrativo → conservador → fotografico',
    JSON.stringify(STRATEGY_LADDER) === JSON.stringify(['narrativo', 'conservador', 'fotografico']));
check('el peldaño por defecto es el narrativo', DEFAULT_SCENE_STRATEGY === 'narrativo');
check('sólo el último es sin IA y cuesta cero',
    SCENE_STRATEGIES.fotografico.paid === false
    && SCENE_STRATEGIES.narrativo.paid === true && SCENE_STRATEGIES.conservador.paid === true);
check('nextStrategy sube un peldaño y se detiene en el último',
    nextStrategy('narrativo') === 'conservador' && nextStrategy('conservador') === 'fotografico' && nextStrategy('fotografico') === 'fotografico');
check('una estrategia desconocida no es estrategia', !isSceneStrategy('cinematico') && !isSceneStrategy(''));
check('el tope de generaciones PAGAS es dos, y el absoluto una más',
    MAX_PAID_GENERATIONS === 2 && ABSOLUTE_PAID_CAP === 3);
check('el retroceso de un fallo técnico crece y se acota',
    transientBackoffSec(0) === 30 && transientBackoffSec(1) === 120 && transientBackoffSec(2) === 300 && transientBackoffSec(9) === 300
    && MAX_TRANSIENT_RETRIES === 3);

// ───────────────────────────────────────────────────────────────────────────
console.log('\n▸ 2. Preflight: el prompt se adapta a la fotografía');
const entrega = {
    hasPeople: true, personCount: 2, peopleDensity: 'sparse',
    interactions: [{ from: 'the volunteer in white', action: 'hands a food bag to', to: 'the girl in pink' }],
};
const r1 = assessSceneMotionRisk(entrega);
check('una entrega de objeto es riesgo ALTO y arranca en conservador',
    r1.level === 'alto' && r1.strategy === 'conservador' && r1.transfers === 1);
check('...y el motivo lo dice', r1.reasons.some(x => /objeto pasando entre personas/.test(x)));
const denso = { hasPeople: true, personCount: 9, peopleDensity: 'dense', interactions: [] };
check('un grupo denso también es alto', assessSceneMotionRisk(denso).level === 'alto');
const vacia = { hasPeople: false, personCount: 0, interactions: [] };
check('una foto sin personas es riesgo bajo y arranca en narrativo',
    assessSceneMotionRisk(vacia).level === 'bajo' && assessSceneMotionRisk(vacia).strategy === 'narrativo');
const trio = { hasPeople: true, personCount: 3, peopleDensity: 'sparse', interactions: [] };
check('tres personas sin interacción es riesgo medio, y sigue en narrativo',
    assessSceneMotionRisk(trio).level === 'medio' && assessSceneMotionRisk(trio).strategy === 'narrativo');
check('sin análisis no revienta', assessSceneMotionRisk(null).level === 'bajo');

// ───────────────────────────────────────────────────────────────────────────
console.log('\n▸ 3. El prompt conservador: la pose se sostiene, vive el ambiente');
const base = { style: 'documental', durationSec: 5, analysis: { ...entrega, motionHint: 'the bag moves', summary: 'entrega' } };
const pNarr = buildScenePrompt({ ...base, strategy: 'narrativo' });
const pCons = buildScenePrompt({ ...base, strategy: 'conservador' });
check('el conservador lleva la cláusula que sostiene la pose', pCons.includes(CONSERVATIVE_PEOPLE_CLAUSE.slice(0, 40)));
check('el narrativo no la lleva', !pNarr.includes(CONSERVATIVE_PEOPLE_CLAUSE.slice(0, 40)));
check('los dos caben en el presupuesto de Kling (2500)', pNarr.length <= 2500 && pCons.length <= 2500, `${pNarr.length}/${pCons.length}`);
check('el conservador SOSTIENE la interacción fotografiada en su instante, sin que progrese',
    /interaction is held at the instant of the photograph and does not progress/.test(pCons));
check('y NO pide caminar, cruzar ni entregar',
    !/walks across|changes sides|hands over the object/i.test(CONSERVATIVE_PEOPLE_CLAUSE));
check('la cámara sigue fija en el conservador', /locked off/i.test(pCons));

// ───────────────────────────────────────────────────────────────────────────
console.log('\n▸ 4. Un fallo del proveedor: técnico o definitivo');
check('429 / rate limit es transitorio', classifyProviderFailure('HTTP 429 Too Many Requests') === 'transient');
check('un timeout es transitorio', classifyProviderFailure('request timed out after 30s') === 'transient');
check('un 503 es transitorio', classifyProviderFailure('KIE 503 service unavailable') === 'transient');
check('ECONNRESET es transitorio', classifyProviderFailure('read ECONNRESET') === 'transient');
check('un rechazo del contenido es DEFINITIVO', classifyProviderFailure('This field is required: image_urls') === 'permanent');
check('ante la duda es definitivo', classifyProviderFailure('') === 'permanent' && classifyProviderFailure('unknown weirdness') === 'permanent');

console.log('\n▸ 5. El código del fallo semántico sale de la medición');
check('invención → invented_person', failureCodeOf({ people: { invented: true } }) === 'invented_person');
check('acción invertida gana sobre la invención', failureCodeOf({ people: { invented: true, actionReversed: true } }) === 'action_reversed');
check('desaparición → missing_person', failureCodeOf({ people: { missingPerson: true } }) === 'missing_person');
check('marca → brand_altered', failureCodeOf({ brandAltered: true }) === 'brand_altered');
check('texto → text_illegible', failureCodeOf({ textIllegible: true }) === 'text_illegible');
check('sin defecto → null', failureCodeOf({ state: 'ok' }) === null);
check('todo código del catálogo declara su clase',
    Object.values(SCENE_FAILURE_CODES).every(c => ['technical', 'semantic', 'quality'].includes(c.kind) && c.label));
check('los que produce la medición están en el catálogo',
    ['invented_person', 'missing_person', 'action_reversed', 'brand_altered', 'text_illegible'].every(k => SCENE_FAILURE_CODES[k]));

// ───────────────────────────────────────────────────────────────────────────
console.log('\n▸ 6. planSceneRecovery: el único punto de decisión');
const now = new Date('2026-09-11T12:00:00Z');
const lista = { status: 'ready', videoUrl: 'https://x/a.mp4', attempts: 1, strategy: 'narrativo' };
check('una escena con clip se SALTA: no se genera ni se cobra',
    planSceneRecovery(lista, { now }).action === 'skip');
check('...también si quedó en revisión o es foto en movimiento',
    planSceneRecovery({ ...lista, status: 'needs_review' }, { now }).action === 'skip'
    && planSceneRecovery({ ...lista, status: 'fallback_ready' }, { now }).action === 'skip');
check('una escena en error con clip viejo NO se salta',
    planSceneRecovery({ ...lista, status: 'error' }, { now }).action !== 'skip');
check('con `ignoreClip` el control de fidelidad puede decidir sobre un clip recién llegado',
    planSceneRecovery(lista, { now, ignoreClip: true }).action === 'retry_paid');

const fallo1 = { status: 'error', videoUrl: null, attempts: 1, strategy: 'narrativo', errorCode: 'action_reversed', lifecycle: { strategiesTried: ['narrativo'] } };
const p1 = planSceneRecovery(fallo1, { now });
check('tras el primer fallo narrativo: UNA generación más, en conservador',
    p1.action === 'retry_paid' && p1.strategy === 'conservador');
const fallo2 = { ...fallo1, attempts: 2, strategy: 'conservador', lifecycle: { strategiesTried: ['narrativo', 'conservador'] } };
const p2 = planSceneRecovery(fallo2, { now });
check('tras el fallo conservador: RESPALDO sin IA, cero créditos',
    p2.action === 'fallback' && p2.strategy === 'fotografico');
const agotada = { ...fallo1, attempts: ABSOLUTE_PAID_CAP };
check('con el tope absoluto alcanzado NUNCA se paga otra generación, venga de donde venga',
    planSceneRecovery(agotada, { now }).action === 'fallback');
check('...y el motivo dice cuántas consumió', /Consumió 3 generaciones/.test(planSceneRecovery(agotada, { now }).reason));
const esperando = { status: 'pending', videoUrl: null, attempts: 0, errorCode: 'provider_transient', nextAttemptAt: '2026-09-11T12:05:00Z' };
check('un fallo técnico en espera ESPERA, no sube de peldaño ni cobra',
    planSceneRecovery(esperando, { now }).action === 'wait');
check('vencida la espera, se vuelve a intentar',
    planSceneRecovery(esperando, { now: new Date('2026-09-11T12:06:00Z') }).action !== 'wait');
check('pedido a mano «fotografico» es respaldo aunque queden generaciones',
    planSceneRecovery(fallo1, { now, forceStrategy: 'fotografico' }).action === 'fallback');
check('pedido a mano «conservador» es una generación paga con esa estrategia',
    planSceneRecovery(fallo1, { now, forceStrategy: 'conservador' }).action === 'retry_paid'
    && planSceneRecovery(fallo1, { now, forceStrategy: 'conservador' }).strategy === 'conservador');
check('una estrategia forzada desconocida se ignora',
    planSceneRecovery(fallo1, { now, forceStrategy: 'lo-que-sea' }).action === 'retry_paid');
check('el conservador NO se repite: si ya se probó, respaldo',
    planSceneRecovery({ ...fallo1, lifecycle: { strategiesTried: ['narrativo', 'conservador'] } }, { now }).action === 'fallback');

// ───────────────────────────────────────────────────────────────────────────
console.log('\n▸ 7. La llave de idempotencia');
const k = (o) => sceneIdempotencyKey({ projectId: 'p', sceneId: 's', promptVersion: 1, sourceUrl: 'https://x/a.jpg', strategy: 'narrativo', ...o });
check('es determinista', k({}) === k({}));
check('mide 40 y es hexadecimal', /^[0-9a-f]{40}$/.test(k({})));
check('cambia con la versión del prompt', k({}) !== k({ promptVersion: 2 }));
check('cambia con la estrategia', k({}) !== k({ strategy: 'conservador' }));
check('cambia con la fotografía', k({}) !== k({ sourceUrl: 'https://x/b.jpg' }));
check('cambia con la escena', k({}) !== k({ sceneId: 't' }));

// ───────────────────────────────────────────────────────────────────────────
console.log('\n▸ 8. Los estados nuevos');
check('`fallback_ready` es terminal, utilizable y marcado como respaldo',
    SCENE_STATUSES.fallback_ready?.terminal === true && SCENE_STATUSES.fallback_ready?.fallback === true && isUsableSceneStatus('fallback_ready'));
check('`error` NO es utilizable', !isUsableSceneStatus('error') && !USABLE_SCENE_STATUSES.includes('error'));
check('`incomplete` es terminal y se puede continuar',
    REEL_STATUSES.incomplete?.terminal === true && isResumableReelStatus('incomplete'));
check('`ready` no se continúa', !isResumableReelStatus('ready'));

// ───────────────────────────────────────────────────────────────────────────
console.log('\n▸ 9. El cableado (leído sobre los archivos)');
{
    const ctrl = read('server/controllers/reelController.js');
    check('UN solo constructor de prompt de escena (`composeScenePrompt`)',
        (ctrl.match(/buildScenePrompt\(/g) || []).length === 1);
    check('el despacho calcula la llave y NO vuelve a llamar al proveedor si ya hay tarea con la misma',
        /current\[0\]\?\.kieJobId && current\[0\]\?\.idempotencyKey === idempotencyKey/.test(ctrl));
    check('un fallo transitorio DEVUELVE el intento reclamado y programa la espera',
        /attempts = GREATEST\(attempts - 1, 0\), status = 'pending'/.test(ctrl) && /"nextAttemptAt" = NOW\(\) \+/.test(ctrl));
    check('el despacho pendiente respeta la espera (`nextAttemptAt`)', /nextAttemptAt/.test(ctrl.slice(ctrl.indexOf('const dispatchPendingScene'), ctrl.indexOf('const dispatchPendingScene') + 2500)));
    check('el tope absoluto de generaciones se aplica en el despacho',
        />= ABSOLUTE_PAID_CAP\)/.test(ctrl));
    check('el respaldo NO se presenta como lista: estado propio `fallback_ready`',
        /fallback \? 'fallback_ready' : \(markForReview \? 'needs_review' : 'ready'\)/.test(ctrl));
    check('si el respaldo falla la escena queda en error SIN clip',
        /"errorCode" = 'fallback_failed', "videoUrl" = NULL/.test(ctrl));
    check('el montaje acepta SÓLO lo utilizable (`hasUsableClip`)',
        /const usable = scenes\s*\n?\s*\.filter\(s => hasUsableClip\(s\)\)/.test(ctrl));
    check('con escenas utilizables el Reel queda INCOMPLETO, no en error',
        /usable\.length > 0 \? 'incomplete' : 'error'/.test(ctrl) && /const status = usable > 0 \? 'incomplete' : 'error'/.test(ctrl));
    check('«Continuar» conserva TODO lo que tiene clip y retoma sólo lo demás',
        /const preserved = scenes\.filter\(s => hasUsableClip\(s\)\)/.test(ctrl)
        && /const targets = scenes\.filter\(s => !hasUsableClip\(s\)/.test(ctrl));
    check('...y lo dice en la nota del proyecto',
        /ya generadas se conservan y no vuelven a consumir créditos/.test(ctrl));
    check('regenerar a mano RECLAMA la fila por su estado', /WHERE id = \$1 AND status = \$11 RETURNING \*/.test(ctrl));
    check('la decisión de recuperación pasa por `planSceneRecovery`, no por aritmética suelta',
        (ctrl.match(/planSceneRecovery\(/g) || []).length >= 3 && !/sc\.attempts >= MAX_AUTO_RETRIES/.test(ctrl));
    check('todo asset válido entra a la Biblioteca en cuanto existe (ingesta, respaldo, revisión)',
        (ctrl.match(/await saveSceneToLibrary\(/g) || []).length >= 3);
    check('la Biblioteca es idempotente por clave de S3', /"s3Key" = \$1/.test(ctrl.slice(ctrl.indexOf('const saveSceneToLibrary'), ctrl.indexOf('const saveSceneToLibrary') + 3000)));
    check('el consumo se registra con créditos 0 cuando el proveedor falló', /credits: 0, ms: 0, status: 'error'/.test(ctrl));
    check('el respaldo automático está ACOTADO', /MAX_AUTO_RECOVERIES/.test(ctrl) && /MAX_FALLBACK_ATTEMPTS/.test(ctrl));
    check('cancelar no toca una escena ya resuelta con foto en movimiento', /NOT IN \('ready', 'needs_review', 'fallback_ready'/.test(ctrl.slice(ctrl.indexOf('export const cancelReel'), ctrl.indexOf('export const cancelReel') + 2500)));

    const schema = read('server/lib/ensureReelSchema.js');
    for (const col of ['strategy', 'promptVersion', 'idempotencyKey', 'errorCode', 'nextAttemptAt', 'mediaId', 'lifecycle']) {
        check(`la columna nueva «${col}» está enumerada en el atajo del ensure (trampa v4.908)`,
            new RegExp(`\\['ReelScene', '${col}'\\]`).test(schema) && new RegExp(`ADD COLUMN IF NOT EXISTS "?${col}"?`).test(schema));
    }

    const engine = read('server/lib/submissionReelEngine.js');
    check('el workflow de la solicitud traduce `incomplete` a «incompleto»', /incomplete: 'incompleto'/.test(engine));
    check('...y llama a las tres vías del controlador, no a un motor propio',
        /resumeReelProject, fallbackReelScene, regenerateReelScene/.test(engine)
        && (engine.match(/INSERT INTO "ReelProject"/g) || []).length === 0);
    const spec = read('server/lib/submissionReelSpec.js');
    check('«incompleto» NO es un estado de trabajo: no se sondea hasta pulsar Continuar',
        /incompleto:\s*\{[^}]*\}/.test(spec) && !/incompleto:\s*\{[^}]*working:\s*true/.test(spec));
    check('...y de ahí sólo se sale continuando o descartando', /incompleto:\s*\['descartado'\]/.test(spec));

    const rutas = read('server/routes/contribution-campaigns.js') + read('server/routes/contentStudio.js');
    check('las tres vías tienen ruta en la solicitud Y en el Estudio',
        /reel\/resume/.test(rutas) && /reel\/scenes\/:sceneId\/fallback/.test(rutas)
        && /\/reels\/:id\/resume/.test(rutas) && /\/reels\/:id\/scenes\/:sceneId\/fallback/.test(rutas));

    const mirror = read('src/lib/submissionReelSpec.ts');
    check('el espejo del navegador conoce «incompleto» y no lo sondea',
        /incompleto:\s*\{[^}]*label: 'Incompleto'/.test(mirror) && !/incompleto:\s*\{[^}]*working: true/.test(mirror));
    const ts = read('src/lib/reelSpec.ts');
    check('el espejo tipado conoce `incomplete`, `fallback_ready` y `isSceneUsable`',
        /'incomplete'/.test(ts) && /'fallback_ready'/.test(ts) && /export const isSceneUsable/.test(ts));

    const panel = read('src/components/admin/contribution/SubmissionReelPanel.tsx');
    check('la ficha ofrece «Continuar N escenas pendientes» y no «Regenerar Reel»',
        /Continuar \{pendientes\.length\} escena/.test(panel) && !/Regenerar Reel/.test(panel));
    check('...dice que lo generado está guardado y no vuelve a consumir créditos',
        /ya generadas están guardadas y no volverán a consumir créditos/.test(panel));
    check('...y por escena fallida ofrece reintento, simplificar, foto en movimiento y editar',
        /Reintentar automáticamente/.test(panel) && /Simplificar movimiento/.test(panel)
        && /Usar imagen con movimiento cinematográfico/.test(panel) && /Editar en el Estudio/.test(panel));
    check('las acciones sólo aparecen sobre una escena SIN clip', /const puedeActuar = !esUsable/.test(panel));
    check('la ficha llama a `/resume` y a `/scenes/:id/fallback`',
        /pedir\('\/resume'/.test(panel) && /\/scenes\/\$\{sceneId\}\/fallback/.test(panel));

    const creator = read('src/components/admin/content-studio/VideoCreator.tsx');
    check('el Estudio tiene la foto en movimiento como acción por escena, sólo en error',
        /scenes\/\$\{scene\.id\}\/fallback/.test(creator) && /onFallback && scene\.status === 'error'/.test(creator));
    const lib = read('src/components/admin/content-studio/ReelLibrary.tsx');
    check('la Biblioteca rotula «Continuar» sobre un Reel incompleto', /reel\.status === 'incomplete'/.test(lib));
}

console.log(`\n${fail === 0 ? '✓' : '✗'} ${pass} pruebas pasan, ${fail} fallan\n`);
process.exit(fail === 0 ? 0 : 1);
