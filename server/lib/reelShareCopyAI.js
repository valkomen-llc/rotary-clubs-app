// ════════════════════════════════════════════════════════════════════════════
// «✨ Regenerar copy» — la orquestación (v4.1052)
//
// El CRITERIO vive en `reelShareCopy.js` y es puro. Acá está lo que toca el
// mundo: leer el guion del Reel, llamar al modelo, reintentar con la regla
// concreta que rompió y reparar por código lo que quede.
//
// ⚠️ ESTO NO TOCA EL REEL. No importa el cliente de KIE, ni el compositor, ni
// el motor de música, ni el de narración: lo único que produce es TEXTO. Una
// prueba lee este archivo y falla si aparece cualquiera de ellos — regenerar
// el pie de una publicación no puede costar un crédito de video, y el fallo
// sería MUDO (el copy sale igual y el gasto aparece en el medidor un mes
// después).
//
// ⚠️ EL MODELO ESCRIBE Y EL CÓDIGO DECIDE. Las reglas son aritmética —cuántos
// caracteres, si hay un `#`, si el último carácter es un emoji— y un modelo
// las incumple con naturalidad aunque se le pidan. Se le devuelve LA REGLA
// CONCRETA con su número y se reintenta; pedirle «revisá el formato» no
// corrige nada (la regla del sitio desde `templateComposer.js`).
//
// ⚠️ Y NUNCA SE TIRA EL TRABAJO. Agotados los intentos se repara por código
// —quitar los hashtags, acortar sin partir palabras, cerrar con el emoji— y se
// entrega CON SUS AVISOS. Un copy dos caracteres largo es mejor que ningún
// copy, y quien publica lo ve antes de pulsar (v4.891).
// ════════════════════════════════════════════════════════════════════════════
import db from './db.js';
import { generateCopy } from '../services/copywritingService.js';
import { INSTITUTIONAL_VOICE } from './institutionalVoice.js';
import { resolveFactGuard, systemWithFacts } from './reelFacts.js';
import { validateEmergencyCopy, buildRetryInstruction } from './emergencySpec.js';
import {
    COPY_POLICIES, ARTICLE_COPY_POLICIES, copyPolicyFor,
    composeShareCopy, composeArticleCopy, validateShareCopy,
    buildShareCopyPrompt, buildArticleCopyPrompt, readShareCopy,
    retryInstructionFor, COPY_RULES_TEXT, ARTICLE_COPY_RULES_TEXT,
    cleanQuotesAndSymbols, hashtagsIn, linksIn,
} from './reelShareCopy.js';

const str = (v) => (typeof v === 'string' ? v.trim() : '');

/** Tres intentos: el primero y dos reescrituras con la regla rota delante. Un
 *  modelo que falló dos veces por lo mismo no acierta a la tercera, y cada
 *  vuelta cuesta una llamada. */
const MAX_TRIES = 3;

// ─── El contexto ────────────────────────────────────────────────────────────

/** El guion hablado del Reel, que es lo que mejor resume lo que la pieza
 *  CUENTA. Se lee de su tabla y, si no hay fila, del guion aprobado a mano que
 *  viaja en la `config` (v4.1012). Un fallo leyéndolo NO cuesta la generación:
 *  se genera con el resto del contexto. */
const narrationOf = async (reel) => {
    const deConfig = str(reel?.config?.narration?.script);
    try {
        const { rows } = await db.query(
            `SELECT script FROM "ReelNarration" WHERE "projectId" = $1 AND "isCurrent" = TRUE LIMIT 1`,
            [reel.id]
        );
        return str(rows[0]?.script) || deConfig;
    } catch (e) {
        console.warn('[share-copy] guion del Reel:', e.message);
        return deConfig;
    }
};

/**
 * Todo lo que se sabe de la pieza, junto.
 *
 * ⚠️ LO QUE NO SE SABE NO SE MENCIONA. `buildShareCopyPrompt` descarta los
 * campos vacíos en vez de escribir «Campaña: (sin datos)»: un hueco declarado
 * es una invitación a que el modelo lo llene, y acá lo que llenaría es el pie
 * de una publicación institucional (la lección de v4.783 y v4.967).
 */
export const buildReelCopyContext = async ({ reel, existingCopy = '' }) => {
    const cfg = reel?.config || {};
    const emergencia = cfg.emergency || null;
    const guard = resolveFactGuard({ emergencyContext: emergencia, facts: cfg.facts || null });
    return {
        title: str(reel?.title),
        organizationName: str(reel?.organizationName),
        publicationType: str(reel?.publicationType) && reel.publicationType !== 'standard' ? str(reel.publicationType) : '',
        interestArea: str(reel?.interestArea) && reel.interestArea !== 'general' ? str(reel.interestArea) : '',
        campaign: str(emergencia?.title) || str(cfg.campaign?.title) || '',
        narration: await narrationOf(reel),
        existingCopy: str(existingCopy),
        sourceContext: str(cfg.submission?.summary) || str(cfg.sourceContext) || '',
        durationSec: reel?.durationSec != null ? Number(reel.durationSec) : null,
        sceneCount: Number.isFinite(Number(cfg.sceneCount)) ? Number(cfg.sceneCount) : null,
        factsBrief: str(guard.brief),
        guard,
    };
};

// ─── El intento que MENOS reglas rompió ─────────────────────────────────────
//
// No se guarda el último por ser el último: un segundo intento puede salir
// peor que el primero. Se puntúa lo que costaría repararlo — lo caro es tener
// que ACORTAR, porque ahí se pierde contenido; quitar un hashtag no cuesta
// nada (v4.891).
const puntuar = ({ veredicto, datos, arreglado, faltaEnlace = false }) => {
    if (!arreglado.text) return 1000;
    let p = 0;
    if (!datos.ok) p += 200;                       // inventar un dato es lo peor
    if (!veredicto.ok) p += 50;                    // el modelo no cumplió
    if (arreglado.cut === 'palabra') p += 10;      // hubo que cortar a mitad de frase
    else if (arreglado.cut === 'oracion') p += 5;  // se perdió una frase entera
    if (faltaEnlace) p += 20;                      // se olvidó el enlace: se repone, pero cuenta
    if (arreglado.sanitized) p += 1;               // traía hashtags
    return p;
};

// ─── El bucle, UNO solo ─────────────────────────────────────────────────────
//
// ⚠️ NO HAY UN SEGUNDO MOTOR DE COPY, y de eso cuelga todo lo demás. El Reel y
// el artículo se diferencian en TRES datos —la política, cómo se le pide al
// modelo y cómo se repara lo que devuelve— y en nada más: los tres intentos,
// la puntuación del mejor, el reintento con la regla concreta, la validación
// de veracidad y la reparación por código son los mismos. Escrito dos veces,
// el día que se corrija el manejo de un rechazo del proveedor una mitad se
// queda atrás y el fallo es MUDO — las dos siguen devolviendo un texto, y lo
// que se separa es qué sale a la cuenta de una institución.
const runShareCopyLoop = async ({
    policy, system, buildPrompt, backup, repair,
    guard = { universe: null }, field = 'copy', instruction = '', provider = null,
    hashtagNote = 'El redactor devolvió hashtags y se quitaron.',
}) => {
    const notas = [];
    let mejor = null;
    let proveedor = null;
    let modelo = null;
    let ultimoFallo = null;
    let intentos = 0;
    let extra = str(instruction);

    for (let i = 0; i < MAX_TRIES; i++) {
        let crudo;
        try {
            intentos++;
            const r = await generateCopy({
                ...(provider ? { provider } : {}),
                system,
                userText: buildPrompt(extra),
                temperature: 0.6,
                // Un JSON con el texto de una publicación. El adaptador de
                // Gemini sube su propio piso, así que esto no lo estrangula.
                maxTokens: 900,
                jsonMode: true,
            });
            // ⚠️ `generateCopy` devuelve `{ content }`, NUNCA `.text`: leerlo
            // con el campo equivocado cae al respaldo EN SILENCIO y la varita
            // devolvería siempre lo mismo (la lección de v4.901).
            crudo = readShareCopy(r?.content);
            proveedor = r?.provider || proveedor;
            modelo = r?.model || modelo;
        } catch (e) {
            ultimoFallo = e.message;
            console.warn(`[share-copy] intento ${i + 1}:`, e.message);
            break; // La cadena de proveedores ya reintentó por dentro.
        }

        // ⚠️ SE JUZGA LO QUE EL MODELO ESCRIBIÓ, NO LO QUE QUEDARÍA DESPUÉS DE
        // REPARARLO. Es la diferencia entre pedirle una reescritura y
        // arreglárselo por lo bajo: la reparación corrige el largo, los
        // hashtags y el cierre, así que validar sobre su salida daría «cumple»
        // SIEMPRE y el modelo no reescribiría nunca — y el cliente pidió
        // expresamente una reescritura más concisa, no un recorte.
        const veredicto = validateShareCopy(crudo, policy);

        // ⚠️ EL BUCLE ES MÁS ESTRICTO QUE LA PUERTA DE PUBLICAR, y es a
        // propósito. `wantsLink` AVISA cuando lo mira una persona —Facebook
        // publica igual, el enlace viaja aparte— pero acá se le está pidiendo
        // a un modelo la estructura que el cliente enumeró: gancho, contexto,
        // llamado a la acción y ENLACE. Así que si la omite se le vuelve a
        // pedir con la regla concreta, y agotados los intentos la reparación
        // la escribe por código con la URL EXACTA — que es además lo que
        // impide que un modelo acorte o invente una dirección.
        const faltaEnlace = !!policy.wantsLink && !linksIn(crudo).length;

        // ── Veracidad ────────────────────────────────────────────────────
        // El MISMO validador de la Campaña de Emergencia: un segundo criterio
        // de cifras se separaría del primero en silencio. Sólo corre cuando la
        // pieza afirma hechos comprobables (`universe`).
        let datos = { ok: true, issues: [] };
        if (guard.universe && str(crudo)) {
            datos = validateEmergencyCopy(crudo, guard.universe, { field });
        }

        // Lo que quedaría si hubiera que entregarlo tal cual: se calcula acá
        // para poder PUNTUAR el intento, no para reemplazar el veredicto.
        const arreglado = repair(crudo);
        const candidato = { crudo, veredicto, datos, arreglado, faltaEnlace };
        const p = puntuar(candidato);
        if (!mejor || p < mejor.puntos) mejor = { ...candidato, puntos: p };

        if (veredicto.ok && datos.ok && !faltaEnlace) break;

        // La regla concreta, con su número. Lo de los datos manda: inventar
        // una cifra es peor que pasarse de largo, y pasarse de largo es peor
        // que quedarse sin el enlace —que la reparación sabe reponer—.
        extra = !datos.ok
            ? buildRetryInstruction(datos.issues)
            : retryInstructionFor(
                veredicto.ok && faltaEnlace
                    ? { code: 'no_link' }
                    : { ...veredicto, hashtags: hashtagsIn(crudo) },
                policy,
            );
    }

    // ── Sin modelo, o con todos caídos ────────────────────────────────────
    if (!mejor) {
        if (ultimoFallo) notas.push(`No se pudo consultar al redactor (${ultimoFallo}).`);
        const v = validateShareCopy(backup.text, policy);
        return {
            copy: backup.text,
            ok: v.ok,
            source: 'plantilla',
            provider: null, model: null, attempts: intentos,
            notes: [...notas, backup.note],
            warnings: v.warnings || [],
            verdict: v,
        };
    }

    // ── Lo que se entrega ─────────────────────────────────────────────────
    //
    // Si el modelo cumplió, sale su texto tal cual. Si no, se repara por
    // código y se DICE qué hubo que hacerle: entregar un texto ajustado como
    // si lo hubiera escrito la IA sería afirmar algo que no pasó.
    const limpio = mejor.veredicto.ok && mejor.datos.ok && !mejor.faltaEnlace;
    const salida = limpio ? str(mejor.crudo) : mejor.arreglado.text;
    const final = validateShareCopy(salida, policy);

    if (!limpio) {
        if (mejor.arreglado.sanitized) notas.push(hashtagNote);
        if (mejor.arreglado.cut === 'oracion') notas.push('El texto llegó largo: se conservaron las frases completas que entraban.');
        if (mejor.arreglado.cut === 'palabra') notas.push('El texto llegó largo y hubo que acortarlo. Revisalo antes de publicar.');
        if (mejor.faltaEnlace) notas.push('El redactor no cerró con la dirección de la noticia y se agregó al final, exactamente como la resolvió el sitio.');
        if (!mejor.datos.ok) notas.push(...mejor.datos.issues);
        if (!final.ok) notas.push(final.reason);
    }

    return {
        copy: salida,
        ok: final.ok,
        source: limpio ? 'ia' : 'ia_reparado',
        provider: proveedor,
        model: modelo,
        attempts: intentos,
        notes: notas,
        warnings: final.warnings || [],
        verdict: final,
    };
};

// ─── Generar ────────────────────────────────────────────────────────────────

/**
 * Escribe el pie con el que sale un Reel.
 *
 * @returns {{ copy, ok, source, provider, model, attempts, notes, warnings, verdict }}
 *
 * `source` dice de dónde salió el texto: `ia` cuando el modelo lo escribió
 * cumpliendo, `ia_reparado` cuando hubo que ajustarlo por código y `plantilla`
 * cuando no hubo modelo y se compuso con lo que la pieza ya tenía escrito.
 * Presentar los tres igual haría creer que la IA escribió algo que no escribió.
 */
export const generateReelShareCopy = async ({
    reel, entityType = 'reel', existingCopy = '', instruction = '', provider = null,
}) => {
    const policy = copyPolicyFor(entityType) || COPY_POLICIES.reel;
    const ctx = await buildReelCopyContext({ reel, existingCopy });

    // El respaldo se compone ANTES de llamar a nadie: es lo que se entrega si
    // no hay proveedor configurado o si todos fallan, y componerlo acá hace
    // imposible quedarse sin nada que devolver.
    const respaldo = composeShareCopy(str(existingCopy) || ctx.narration || ctx.title, { policy });

    return runShareCopyLoop({
        policy,
        system: systemWithFacts(`${INSTITUTIONAL_VOICE}\n\n${COPY_RULES_TEXT(policy)}`, ctx.guard),
        buildPrompt: (extra) => buildShareCopyPrompt({ ...ctx, policy, instruction: extra }),
        backup: {
            text: respaldo.text,
            note: 'El texto se compuso con lo que el Reel ya tenía escrito, sin pasar por la IA.',
        },
        repair: (crudo) => composeShareCopy(crudo, { policy }),
        guard: ctx.guard,
        field: 'copy del Reel',
        instruction, provider,
        hashtagNote: 'El redactor devolvió hashtags y se quitaron: los Reels se publican sin ellos.',
    });
};

// ─── El copy de un ARTÍCULO, por red ────────────────────────────────────────
//
// ⚠️ MISMO BUCLE, OTRA POLÍTICA. Lo único propio del artículo son el contexto
// —titular, extracto y cuerpo, no un guion hablado—, el brief que dictó el
// cliente y la reparación, que además de acortar y quitar hashtags VUELVE A
// PEGAR EL CIERRE con la dirección canónica.
//
// ⚠️ LA DIRECCIÓN LA PONE EL CÓDIGO, NO EL MODELO. Se le pide que la escriba
// —así el texto fluye hacia ella— y la reparación la reemplaza por la
// exacta: un modelo que acorte la URL, le agregue un parámetro o invente otra
// mandaría el tráfico a una dirección que no existe, y eso no se deshace
// editando el artículo después de publicar.
export const generateArticleShareCopy = async ({
    post, network = 'facebook', publicUrl = '', organizationName = '',
    instruction = '', provider = null,
}) => {
    const policy = ARTICLE_COPY_POLICIES[str(network).toLowerCase()] || ARTICLE_COPY_POLICIES.facebook;
    const url = str(publicUrl);
    const fuenteCruda = str(post?.socialCopy) || str(post?.excerpt) || str(post?.title);
    const fuente = cleanQuotesAndSymbols(fuenteCruda);

    const ctx = {
        title: cleanQuotesAndSymbols(str(post?.title)),
        excerpt: cleanQuotesAndSymbols(str(post?.excerpt)),
        // El cuerpo llega con el HTML del editor: al modelo se le manda el
        // TEXTO limpio sin comillas tipográficas extrañas.
        body: cleanQuotesAndSymbols(String(post?.content || '').replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim()),
        organizationName: str(organizationName),
        existingCopy: fuente,
        publicUrl: url,
    };

    const respaldo = composeArticleCopy({ source: fuente, title: ctx.title, publicUrl: url, policy });

    return runShareCopyLoop({
        policy,
        system: `${INSTITUTIONAL_VOICE}\n\n${ARTICLE_COPY_RULES_TEXT(policy)}`,
        buildPrompt: (extra) => buildArticleCopyPrompt({ ...ctx, policy, instruction: extra }),
        backup: {
            text: respaldo.text,
            note: 'El texto se compuso con lo que la noticia ya tenía escrito, sin pasar por la IA.',
        },
        repair: (crudo) => composeArticleCopy({ source: crudo, title: ctx.title, publicUrl: url, policy }),
        field: `copy de ${policy.label}`,
        instruction, provider,
        hashtagNote: 'El redactor devolvió hashtags y se quitaron: las publicaciones salen sin ellos.',
    });
};

export default { generateReelShareCopy, generateArticleShareCopy, buildReelCopyContext };
