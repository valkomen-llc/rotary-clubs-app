/**
 * LA I/O DE UNA FUENTE DE COBRO: LA FERIA DE PROYECTOS — v4.1025.
 *
 * El criterio vive en `collectionSources.js` y es puro; acá está lo que toca la
 * base. La separación es la de `seoRules.js` frente a `seoAudit.js`, y acá pesa
 * más que de costumbre: un repartidor de importes que sólo se ejercita contra
 * Postgres termina sin pruebas, y entonces nadie se entera de que una cifra
 * cambió de signo.
 *
 * Dos caminos entran por acá y comparten TODO lo que decide una cifra:
 *
 *   · EN VIVO — al confirmar el pago, `confirmPaidSession` registra el
 *     movimiento del cobro.
 *   · HACIA ATRÁS — `rebuildProjectFairPayments` crea el movimiento de las
 *     inscripciones que se pagaron cuando nadie había atado la Feria a su
 *     sitio, y que por eso no tienen ninguno.
 *
 * ⚠️ UN SOLO CONSTRUCTOR DE LA FILA (`paymentDraftFor`). Con uno por camino, el
 * día que se agregue una línea al recargo una de las dos copias se queda sin
 * ella y el fallo es MUDO: las dos siguen creando un `Payment` y lo que se
 * separa es cuánto dice que le toca al sitio. Una prueba cuenta los llamadores.
 */

import db from './db.js';
import { normalizeCurrency } from './money.js';
import {
    COLLECTION_SOURCES,
    resolveCollectionSite,
    splitCollectionAmounts,
} from './collectionSources.js';

const FUENTE = COLLECTION_SOURCES.project_fair;

/** Cuánto puede tardar una pasada de reconstrucción antes de ceder el turno. */
const PRESUPUESTO_MS = Number(process.env.COLLECTION_REBUILD_BUDGET_MS) || 20000;
/** Cuántas inscripciones se miran de una vez. */
const TOPE = Number(process.env.COLLECTION_REBUILD_MAX) || 500;

/**
 * LA REFERENCIA DEL COBRO, y es la MISMA en los dos caminos.
 *
 * Es lo que hace idempotente todo esto: el índice único
 * `Payment_provider_providerRef_key` es quien decide que un cobro ya está
 * registrado. Con una referencia distinta según por dónde se entre, la
 * reconstrucción duplicaría lo que el camino en vivo ya escribió — y duplicar
 * acá es contar dos veces un dinero que entró una.
 */
export const providerRefOf = (row = {}) =>
    String(row.stripePaymentIntentId || row.stripeSessionId || '').trim() || null;

/** El desglose del recargo que el cobro guardó, si lo guardó. */
export const surchargeOf = (row = {}) => {
    const md = row.metadata && typeof row.metadata === 'object' ? row.metadata : {};
    const s = md?.payment?.surcharge;
    return s && typeof s === 'object' && Number(s.amount) > 0 ? s : null;
};

/**
 * El precio PUBLICADO de la inscripción, con su moneda.
 *
 * Se congela al enviar el formulario (v4.648) y es, por construcción de este
 * flujo, lo que la organización tiene que recibir: el recargo se le suma a
 * quien se inscribe justamente para dejarlo intacto (v4.980).
 */
export const publishedPriceOf = (row = {}) => {
    const modo = String(row.priceMode || '').toUpperCase() === 'USD' ? 'USD' : 'COP';
    const importe = modo === 'USD' ? Number(row.amountUsd) : Number(row.amountCop);
    return { amount: Number.isFinite(importe) && importe > 0 ? importe : null, currency: modo };
};

/**
 * EL SITIO DEL EVENTO DE LA EDICIÓN.
 *
 * `CalendarEvent.clubId` es NOT NULL, así que toda edición tiene uno. No se
 * deduce nada: se lee lo que declaró quien creó la edición.
 *
 * Degrada a `null` y NUNCA lanza: esto corre dentro del webhook que acredita un
 * cobro, y una consulta caída no puede tumbar la confirmación de un pago.
 */
export const editionSiteOf = async (eventId) => {
    const id = String(eventId || '').trim();
    if (!id) return null;
    try {
        const { rows } = await db.query('SELECT "clubId" FROM "CalendarEvent" WHERE id = $1 LIMIT 1', [id]);
        return String(rows?.[0]?.clubId || '').trim() || null;
    } catch (e) {
        console.warn('[collections] no pude resolver el sitio de la edición:', e?.message);
        return null;
    }
};

/**
 * A QUÉ SITIO PERTENECE ESTE COBRO.
 *
 * `submission.clubId` es lo que la Convocatoria declaró cuando se creó la
 * inscripción; la edición es la señal de respaldo. El orden lo fija el criterio
 * puro y no se repite acá — con la cascada escrita en dos sitios, el mismo cobro
 * resolvería a sitios distintos según por dónde se pregunte.
 */
export const siteForSubmission = async (submission = {}) => {
    const porEdicion = submission.clubId ? null : await editionSiteOf(submission.eventId);
    return resolveCollectionSite({
        configuredClubId: submission.clubId,
        editionClubId: porEdicion,
    });
};

/**
 * LA FILA DEL MOVIMIENTO, ya repartida. **Puro**: recibe la inscripción y el
 * sitio, y no consulta nada.
 *
 * Devuelve `{ ok: false, motivo }` en vez de una fila a medias: un `Payment`
 * con el neto mal es dinero mal contado, y prefiere no existir a existir
 * equivocado. Los motivos están en `REBUILD_REASONS`.
 */
export const paymentDraftFor = (submission = {}, { clubId = null } = {}) => {
    const providerRef = providerRefOf(submission);
    if (!providerRef) return { ok: false, motivo: 'sin_referencia' };
    if (!clubId) return { ok: false, motivo: 'sin_sitio' };

    const currency = normalizeCurrency(submission.chargeCurrency || submission.currency);
    if (!currency) return { ok: false, motivo: 'sin_moneda' };

    const total = Number(submission.amountReceived) || 0;
    const publicado = publishedPriceOf(submission);
    const reparto = splitCollectionAmounts({
        total,
        currency,
        surcharge: surchargeOf(submission),
        publishedAmount: publicado.amount,
        publishedCurrency: publicado.currency,
    });
    if (!reparto.ok) return { ok: false, motivo: reparto.motivo, avisos: reparto.avisos };

    return {
        ok: true,
        avisos: reparto.avisos,
        basis: reparto.basis,
        row: {
            provider: 'stripe',
            providerRef,
            status: 'succeeded',
            amount: total,
            applicationFee: reparto.applicationFee,
            netAmount: reparto.netAmount,
            currency,
            isPlatformCollection: true,
            clubId,
            paidAt: submission.paidAt || null,
            rawPayload: {
                // ⚠️ EL TIPO ES LA LLAVE POR LA QUE ESTE COBRO SE RECONOCE
                // DESPUÉS: de él salen su rótulo en el correo de traslado y su
                // fuente. Cambiarlo deja los cobros anteriores sin nombre.
                type: FUENTE.payloadType,
                submissionId: submission.id,
                publicRef: submission.publicRef || null,
                // Quién se inscribió. Sin esto, la tabla del correo de traslado
                // dice «Aportante sin nombre» una vez por inscripción: doce
                // renglones idénticos que no sirven para cuadrar nada.
                clubName: submission.clubName || null,
                district: submission.district || null,
                projectName: submission.projectName || null,
                sessionId: submission.stripeSessionId || null,
                // De dónde salió cada cifra. Presentar lo medido y lo derivado
                // igual es lo que hace que un libro deje de servir para cuadrar.
                basis: reparto.basis,
                surcharge: surchargeOf(submission),
            },
        },
    };
};

/** El INSERT. Idempotente por el índice único `(provider, providerRef)`. */
export const insertPayment = async (draft) => {
    const r = draft.row;
    const { rows } = await db.query(
        `INSERT INTO "Payment"
             (id, provider, "providerRef", status, amount, "applicationFee", "netAmount",
              currency, "isPlatformCollection", "clubId", "rawPayload", "createdAt", "updatedAt")
         VALUES (gen_random_uuid()::text, $1,$2,$3,$4,$5,$6,$7,true,$8,$9, COALESCE($10::timestamptz, NOW()), NOW())
         ON CONFLICT (provider, "providerRef") DO NOTHING
         RETURNING id`,
        [
            r.provider, r.providerRef, r.status, r.amount, r.applicationFee, r.netAmount,
            r.currency, r.clubId, JSON.stringify(r.rawPayload), r.paidAt,
        ]
    );
    return rows?.[0]?.id || null;
};

/**
 * LAS INSCRIPCIONES PAGADAS QUE TODAVÍA NO TIENEN MOVIMIENTO.
 *
 * El `LEFT JOIN` contra `Payment` es lo que hace la pasada IDEMPOTENTE por la
 * FORMA de la consulta y no por un candado: un cobro ya reconstruido deja de
 * ser candidato solo, así que correr esto diez veces hace trabajo la primera.
 * Es el patrón de `walletSweep` (v4.846).
 */
export const pendingCollections = async ({ limit = TOPE } = {}) => {
    const { rows } = await db.query(
        `SELECT s.id, s."publicRef", s."clubName", s.district, s."projectName",
                s."clubId", s."eventId", s."priceMode", s."amountCop", s."amountUsd",
                s."amountReceived", s."chargeCurrency", s."paidAt", s.metadata,
                s."stripePaymentIntentId", s."stripeSessionId"
           FROM "ProjectFairSubmission" s
           LEFT JOIN "Payment" p
                  ON p.provider = 'stripe'
                 AND p."providerRef" = COALESCE(s."stripePaymentIntentId", s."stripeSessionId")
          WHERE s.status = 'paid'
            AND COALESCE(s."stripePaymentIntentId", s."stripeSessionId") IS NOT NULL
            AND p.id IS NULL
          ORDER BY s."paidAt" ASC NULLS LAST
          LIMIT $1`,
        [limit]
    );
    return rows || [];
};

/**
 * LA RECONSTRUCCIÓN HACIA ATRÁS.
 *
 * ⚠️ DE ENSAYO POR DEFECTO. Sin `apply` no escribe nada y devuelve lo que
 * haría: es el patrón de la carga del libro mayor (v4.848) y lo valioso es lo
 * mismo — mirar antes de tocar dinero. **Lo que NO se pudo reconstruir es la
 * mitad del resultado**, agrupado por motivo con ejemplos: un listado de
 * doscientas filas no lo lee nadie, y sin esa parte «no pasó nada» es
 * indistinguible de «no se pudo».
 *
 * ⚠️ NO INVENTA NINGUNA FECHA DE LIBERACIÓN. El movimiento nace sin
 * `availableOn`, así que `bucketOf` lo deja «en tránsito» —el lado seguro— y el
 * barrido que ya existe va a preguntárselo a Stripe con su referencia. Escribir
 * acá una fecha estimada sería presentar una cuenta nuestra como el calendario
 * del proveedor, que es justo lo que la Bóveda no hace.
 *
 * ⚠️ NO TOCA EL LIBRO MAYOR. Está en sombra y su carga hacia atrás es otra cosa,
 * con su propio informe de conciliación (v4.848).
 */
export const rebuildProjectFairPayments = async ({
    clubId = null, apply = false, budgetMs = PRESUPUESTO_MS, limit = TOPE,
} = {}) => {
    const arranque = Date.now();
    const resumen = {
        source: FUENTE.id, apply: !!apply,
        mirados: 0, reconstruidos: 0, pendientes: 0,
        porMoneda: {}, ejemplos: [], noReconstruidos: {}, avisos: {},
    };

    let candidatos;
    try {
        candidatos = await pendingCollections({ limit });
    } catch (e) {
        return { ...resumen, error: `No pude leer las inscripciones pagadas: ${e?.message}` };
    }

    const anotar = (mapa, clave, ejemplo) => {
        if (!mapa[clave]) mapa[clave] = { total: 0, ejemplos: [] };
        mapa[clave].total += 1;
        if (mapa[clave].ejemplos.length < 3 && ejemplo) mapa[clave].ejemplos.push(ejemplo);
    };

    for (const fila of candidatos) {
        if (Date.now() - arranque > budgetMs) {
            resumen.pendientes = candidatos.length - resumen.mirados;
            break;
        }
        resumen.mirados += 1;
        const ref = fila.publicRef || fila.id;

        const sitio = await siteForSubmission(fila);
        // Un sitio pedido a mano acota la pasada: sin esto, quien abre la
        // Bóveda de un sitio reconstruiría también los cobros de otro.
        if (clubId && sitio.clubId && sitio.clubId !== clubId) continue;

        const draft = paymentDraftFor(fila, { clubId: sitio.clubId });
        if (!draft.ok) {
            anotar(resumen.noReconstruidos, draft.motivo, ref);
            continue;
        }
        for (const aviso of draft.avisos || []) anotar(resumen.avisos, aviso, ref);

        const moneda = draft.row.currency;
        resumen.porMoneda[moneda] = (resumen.porMoneda[moneda] || 0) + draft.row.netAmount;
        if (resumen.ejemplos.length < 5) {
            resumen.ejemplos.push({
                ref, clubName: fila.clubName || null,
                amount: draft.row.amount, netAmount: draft.row.netAmount,
                currency: moneda, basis: draft.basis, signal: sitio.signal, clubId: sitio.clubId,
            });
        }

        if (!apply) { resumen.reconstruidos += 1; continue; }

        try {
            const id = await insertPayment(draft);
            if (id) resumen.reconstruidos += 1;
            else anotar(resumen.noReconstruidos, 'ya_registrado', ref);
        } catch (e) {
            anotar(resumen.noReconstruidos, `error: ${e?.message || 'desconocido'}`, ref);
        }
    }

    return resumen;
};

export default {
    providerRefOf, surchargeOf, publishedPriceOf, editionSiteOf, siteForSubmission,
    paymentDraftFor, insertPayment, pendingCollections, rebuildProjectFairPayments,
};
