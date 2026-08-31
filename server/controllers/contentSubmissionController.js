// ════════════════════════════════════════════════════════════════════
// Aportes de contenido a una campaña — la ORQUESTACIÓN — v4.968.0
//
// TRES SUPERFICIES:
//   · el formulario PÚBLICO (sin sesión): configuración, prefirma y envío;
//   · la BANDEJA del operador: listar, ficha, transiciones y aprobación;
//   · la promoción a la Biblioteca y el seguimiento del uso.
//
// El CRITERIO vive en `contentSubmissionSpec.js` (puro) y la I/O en
// `contentSubmissionStore.js` / `submissionFiles.js`. Acá no hay criterio.
// ════════════════════════════════════════════════════════════════════

import db from '../lib/db.js';
import prisma from '../lib/prisma.js';
import ensureContributionSchema from '../lib/ensureContributionSchema.js';
import { normalizeContent, effectiveStatus } from '../lib/contributionSpec.js';
// ⚠️ EL CATÁLOGO DE DISTRITOS Y CLUBES ES UNO SOLO (v4.707) y viaja desde el
// SERVIDOR, no copiado al bundle: copiarlo daría dos listas que se separan en
// silencio, y el día que el Distrito agregue un club el formulario ofrecería
// una lista vieja. Es la misma decisión que la inscripción a eventos (v4.708).
import { DISTRICT_CATALOG } from '../lib/rotaryClubs.js';
import {
    shapeSubmission, validateSubmission, consentTextFor, consentIsConfigured,
    inviteMessageFor, normalizeSubmissionsConfig, SUBMISSION_STATES,
    nextStates, stateLabel, USAGE_CHANNELS, usageIsMeasured, MAX_FILES,
    IMAGE_TYPES, VIDEO_TYPES, IMAGE_MAX_BYTES, VIDEO_MAX_BYTES,
} from '../lib/contentSubmissionSpec.js';
import {
    presignSubmissionUpload, headSubmissionFile, signedSubmissionUrl,
    stagingKeyBelongs, deleteStagingObject,
} from '../lib/submissionFiles.js';
import {
    createSubmission, listSubmissions, countByState, getSubmission, filesOf,
    eventsOf, transitionSubmission, promoteToLibrary, markUsage, usageOf,
} from '../lib/contentSubmissionStore.js';
import EmailService from '../services/EmailService.js';

const fail = (res, e, code = 500) => {
    console.error('[submissions]', e?.message || e);
    // El motivo se propaga TEXTUAL: «no se pudo» a secas obliga a diagnosticar
    // a ciegas (regla de `FeeRulesPanel`, v4.859).
    res.status(code).json({ error: e?.message || 'Error inesperado', detail: String(e?.message || '').slice(0, 300) });
};

const actorOf = (req) => ({ actor: req.user?.id || null, actorName: req.user?.name || req.user?.email || null });

// ─── Resolución de la campaña por su enlace público ────────────────────
//
// Acepta el SLUG o el id, como `/eventos/:ref` desde v4.658: el slug es lo que
// se comparte y el id es lo que no cambia. Sólo devuelve campañas que de
// verdad pueden recibir — una archivada no tiene por qué seguir abierta.
const campaignByRef = async (ref) => {
    await ensureContributionSchema();
    const { rows } = await db.query(
        `SELECT * FROM "ContributionCampaign" WHERE slug = $1 OR id = $1 LIMIT 1`, [String(ref || '')]
    );
    return rows[0] || null;
};

const RECEPCION_ABIERTA = ['active', 'scheduled', 'paused'];

/**
 * ⚠️ QUE EL FORMULARIO ESTÉ ABIERTO LO DECIDE EL SERVIDOR, y son dos
 * condiciones: que el interruptor esté encendido y que la campaña esté viva.
 * Se comprueba al PINTAR y otra vez al RECIBIR — esconder el formulario no
 * protegería el endpoint de quien conoce la dirección (v4.868).
 *
 * Una campaña `paused` sigue recibiendo a propósito: pausar detiene lo que la
 * campaña MUESTRA, no lo que un club ya hizo y quiere documentar.
 */
const receptionState = (campaign, now = new Date()) => {
    const content = normalizeContent(campaign.content);
    const config = normalizeSubmissionsConfig(content.submissions);
    const estado = effectiveStatus(campaign, now);
    if (!config.enabled) return { abierto: false, motivo: 'La recepción de contenido de esta campaña no está habilitada.', config, content, estado };
    if (!RECEPCION_ABIERTA.includes(estado)) {
        return { abierto: false, motivo: `Esta campaña ya no está recibiendo contenido (${estado === 'finished' ? 'finalizada' : estado}).`, config, content, estado };
    }
    return { abierto: true, motivo: null, config, content, estado };
};

// ─── GET /submissions/form/:ref — público ──────────────────────────────

export const getSubmissionForm = async (req, res) => {
    try {
        const campaign = await campaignByRef(req.params.ref);
        if (!campaign) return res.status(404).json({ error: 'No encontramos esta campaña.' });
        const { abierto, motivo, config, content } = receptionState(campaign);

        res.json({
            campaign: {
                id: campaign.id,
                slug: campaign.slug,
                name: campaign.name,
                title: content.hero.title,
                badge: content.hero.badge,
                location: content.location,
                image: content.hero.image || content.hero.images?.[0]?.url || '',
                theme: content.theme,
            },
            open: abierto,
            closedReason: motivo,
            headline: config.headline,
            intro: config.intro,
            thanksMessage: config.thanksMessage,
            consentText: consentTextFor(config),
            // Se DICE si el texto legal todavía es el provisional: el visitante
            // acepta algo y tiene derecho a saber que la organización aún no
            // publicó su política definitiva.
            consentIsProvisional: !consentIsConfigured(config.consentText),
            // Distrito → Clubes, como en la postulación y en el registro a un
            // evento. La lista AYUDA A ESCRIBIR y no cierra los valores: el
            // desplegable termina en «Mi club no está en la lista» (v4.706).
            catalogs: { districts: DISTRICT_CATALOG },
            limits: {
                maxFiles: MAX_FILES,
                imageTypes: IMAGE_TYPES,
                videoTypes: VIDEO_TYPES,
                imageMaxMb: IMAGE_MAX_BYTES / 1048576,
                videoMaxMb: VIDEO_MAX_BYTES / 1048576,
            },
        });
    } catch (e) { fail(res, e); }
};

// ─── POST /submissions/form/:ref/presign — público ─────────────────────

export const presignSubmissionFile = async (req, res) => {
    try {
        const campaign = await campaignByRef(req.params.ref);
        if (!campaign) return res.status(404).json({ error: 'No encontramos esta campaña.' });
        const { abierto, motivo } = receptionState(campaign);
        if (!abierto) return res.status(403).json({ error: motivo });

        const { contentType, filename, size } = req.body || {};
        const salida = await presignSubmissionUpload({ campaignId: campaign.id, contentType, filename, size });
        if (!salida.ok) return res.status(400).json({ error: salida.errores.join(' ') });
        res.json(salida);
    } catch (e) { fail(res, e); }
};

// ─── POST /submissions/form/:ref — público ─────────────────────────────

export const submitContent = async (req, res) => {
    try {
        const campaign = await campaignByRef(req.params.ref);
        if (!campaign) return res.status(404).json({ error: 'No encontramos esta campaña.' });
        const { abierto, motivo, config } = receptionState(campaign);
        if (!abierto) return res.status(403).json({ error: motivo });

        // `shapeSubmission` no acepta estado ni campaña: la frontera es
        // ESTRUCTURAL, lo que no se puede expresar no se puede pedir.
        const data = shapeSubmission(req.body);
        const juicio = validateSubmission(data, { districtCatalog: DISTRICT_CATALOG });
        if (!juicio.ok) return res.status(400).json({ error: juicio.errors[0], errors: juicio.errors });

        // El objeto REAL: existe, pesa lo que dice y es de ESTA campaña. Lo
        // declarado al prefirmar no obliga a nada.
        const archivos = [];
        for (const f of data.files) {
            if (!stagingKeyBelongs(f.key, campaign.id)) {
                return res.status(400).json({ error: 'Uno de los archivos no corresponde a esta campaña. Volvé a adjuntarlo.' });
            }
            const head = await headSubmissionFile(f.key, { filename: f.filename, contentType: f.contentType });
            if (!head.ok) return res.status(400).json({ error: head.error });
            archivos.push({ ...f, bytes: head.bytes, kind: head.kind, contentType: head.mime || f.contentType });
        }

        const submission = await createSubmission({
            campaignId: campaign.id, data, files: archivos,
            // El texto EXACTO que esta persona aceptó, copiado a su fila.
            consentText: consentTextFor(config),
            warnings: juicio.warnings,
        });

        // El aviso al equipo NUNCA revierte la solicitud: ya está guardada y
        // perderla porque no salió un correo sería cambiar un problema de
        // comunicación por uno de contenido (regla de los desembolsos, v4.885).
        avisarAlEquipo({ campaign, config, submission, archivos }).catch(() => {});

        res.json({
            ok: true,
            id: submission.id,
            thanksMessage: config.thanksMessage,
            // Lo que faltó se DEVUELVE: quien envía puede completarlo escribiendo
            // al correo, y el panel lo verá para poder pedirlo.
            warnings: juicio.warnings,
        });
    } catch (e) { fail(res, e); }
};

/**
 * Avisa al equipo. Reutiliza `EmailService.sendPlatformEmail` — un segundo
 * camino de correo se separaría en silencio y dejaría estos avisos fuera de la
 * infraestructura de siempre.
 *
 * ⚠️ `sendPlatformEmail` NUNCA lanza: contesta `{ success, error }`. Esperar
 * una excepción registraría como enviado un correo que el proveedor rechazó
 * (la lección de v4.945).
 */
async function avisarAlEquipo({ campaign, config, submission, archivos }) {
    if (!config.notifyEmails.length) return;
    const fotos = archivos.filter(a => a.kind === 'image').length;
    const videos = archivos.filter(a => a.kind === 'video').length;
    const html = `
        <p>Llegó un aporte de contenido para <strong>${escapar(campaign.name)}</strong>.</p>
        <p>
          <strong>${escapar(submission.senderName)}</strong>${submission.club ? ` — ${escapar(submission.club)}` : ''}<br>
          ${escapar(submission.senderEmail)}${submission.senderPhone ? ` · ${escapar(submission.senderPhone)}` : ''}
        </p>
        ${submission.title ? `<p><strong>${escapar(submission.title)}</strong></p>` : ''}
        ${submission.story ? `<p>${escapar(submission.story).slice(0, 600)}</p>` : ''}
        <p>${fotos} fotografía(s) y ${videos} video(s). Está en <em>Recibido</em> — todavía no se publicó nada.</p>
        <p>Se revisa en Campañas de Contribución → ${escapar(campaign.name)} → Solicitudes de contenido.</p>`;
    for (const to of config.notifyEmails) {
        const r = await EmailService.sendPlatformEmail({
            to,
            subject: `Nuevo aporte de contenido — ${campaign.name}`,
            html,
            text: `Llegó un aporte de contenido para ${campaign.name} de ${submission.senderName} (${submission.senderEmail}). ${fotos} foto(s), ${videos} video(s). Está en Recibido.`,
        });
        if (!r?.success) console.warn(`[submissions] aviso a ${to} no salió: ${r?.error || 'sin motivo'}`);
    }
}

const escapar = (v) => String(v ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

// ─── La bandeja — operador ─────────────────────────────────────────────

export const listCampaignSubmissions = async (req, res) => {
    try {
        const campaignId = req.params.id;
        const filas = await listSubmissions(campaignId, req.query);
        const uso = await usageOf(filas.map(f => f.id));
        const conteo = await countByState(campaignId);
        res.json({
            submissions: filas.map(f => ({ ...f, usage: uso[f.id] || {} })),
            counts: conteo,
            states: Object.values(SUBMISSION_STATES),
            channels: Object.values(USAGE_CHANNELS).map(c => ({ ...c, measured: usageIsMeasured(c.id) })),
        });
    } catch (e) { fail(res, e); }
};

/** El contador del rótulo. Va aparte para que abrir el editor de la campaña no
 *  tenga que traerse la bandeja entera. */
export const getSubmissionCounts = async (req, res) => {
    try { res.json(await countByState(req.params.id)); }
    catch (e) { fail(res, e); }
};

export const getCampaignSubmission = async (req, res) => {
    try {
        const { id, submissionId } = req.params;
        const submission = await getSubmission(id, submissionId);
        // Para quien pregunta por una solicitud de otra campaña, esa solicitud
        // no existe: un 403 confirmaría que existe.
        if (!submission) return res.status(404).json({ error: 'No encontramos esa solicitud.' });

        const archivos = await filesOf(submissionId);
        // El archivo se MIRA sin descargarlo: si ya está en la Biblioteca se
        // sirve su URL pública; si sigue en staging, un enlace firmado que
        // caduca — no hay dirección compartible de un material sin aprobar.
        const conUrl = [];
        for (const f of archivos) {
            conUrl.push({
                id: f.id, kind: f.kind, filename: f.filename, bytes: Number(f.bytes) || 0,
                mediaId: f.mediaId, promotedAt: f.promotedAt, promoteError: f.promoteError,
                url: f.mediaUrl || await signedSubmissionUrl(f.s3Key),
                inLibrary: !!f.mediaId,
            });
        }
        const uso = await usageOf([submissionId]);
        res.json({
            submission,
            files: conUrl,
            events: await eventsOf(submissionId),
            usage: uso[submissionId] || {},
            nextStates: nextStates(submission.status),
        });
    } catch (e) { fail(res, e); }
};

export const changeSubmissionStatus = async (req, res) => {
    try {
        const { id, submissionId } = req.params;
        const { to, reason } = req.body || {};
        const r = await transitionSubmission({ campaignId: id, id: submissionId, to, reason, ...actorOf(req) });
        if (!r.ok) {
            const code = r.reason === 'no_existe' ? 404 : 409;
            return res.status(code).json({ error: r.detalle || 'No se pudo cambiar el estado.', reason: r.reason });
        }
        res.json({ ok: true, submission: r.submission });
    } catch (e) { fail(res, e); }
};

/**
 * «Aprobar y enviar a Biblioteca» — UNA acción, dos efectos.
 *
 * El estado pasa a `listo_difusion` sólo si de verdad llegó algún archivo a la
 * Biblioteca: marcarlo antes afirmaría que el material está disponible cuando
 * la copia falló. Y NO es atómico: cada archivo reporta su desenlace.
 */
export const approveSubmission = async (req, res) => {
    try {
        const { id, submissionId } = req.params;
        const submission = await getSubmission(id, submissionId);
        if (!submission) return res.status(404).json({ error: 'No encontramos esa solicitud.' });

        // A qué sitio entra el material. La campaña puede declarar su
        // beneficiario; si no, entra al sitio del operador y, sin ninguno de
        // los dos, a la Biblioteca de la plataforma.
        const { rows } = await db.query(`SELECT "recipientClubId" FROM "ContributionCampaign" WHERE id = $1`, [id]);
        const clubId = req.body?.clubId || rows[0]?.recipientClubId || req.user?.clubId || null;

        if (submission.status !== 'aprobado' && submission.status !== 'listo_difusion') {
            const paso = await transitionSubmission({ campaignId: id, id: submissionId, to: 'aprobado', ...actorOf(req) });
            if (!paso.ok) return res.status(409).json({ error: paso.detalle || 'No se pudo aprobar.', reason: paso.reason });
        }

        const promocion = await promoteToLibrary({
            campaignId: id, submission, clubId, ...actorOf(req),
        });

        let final = await getSubmission(id, submissionId);
        if (promocion.promovidos > 0 && final.status === 'aprobado') {
            const paso = await transitionSubmission({ campaignId: id, id: submissionId, to: 'listo_difusion', ...actorOf(req) });
            if (paso.ok) final = paso.submission;
        }

        res.json({
            ok: promocion.fallidos === 0,
            submission: final,
            promotion: promocion,
            // Lo que no se pudo promover se NOMBRA con su motivo: «se aprobó»
            // sobre una promoción a medias haría creer que el material está en
            // la Biblioteca cuando no llegó.
            message: promocion.fallidos
                ? `${promocion.promovidos} de ${promocion.total} archivo(s) llegaron a la Biblioteca; ${promocion.fallidos} falló(aron).`
                : `${promocion.promovidos} archivo(s) en la Biblioteca.`,
        });
    } catch (e) { fail(res, e); }
};

/** Marca a mano que el material se usó en un canal (correo, WhatsApp, web). */
export const markSubmissionUsage = async (req, res) => {
    try {
        const { id, submissionId } = req.params;
        const { channel, reference = '', detail = '' } = req.body || {};
        const submission = await getSubmission(id, submissionId);
        if (!submission) return res.status(404).json({ error: 'No encontramos esa solicitud.' });

        const r = await markUsage({ campaignId: id, submissionId, channel, reference, detail, ...actorOf(req) });
        if (!r.ok) return res.status(400).json({ error: 'Ese canal no está en el catálogo.' });

        // Marcar un uso NO cambia el estado por su cuenta salvo el salto que
        // el uso demuestra: si estaba listo para difusión y ya se usó, está
        // publicado. De cualquier otro estado no se deduce nada.
        if (submission.status === 'listo_difusion') {
            await transitionSubmission({ campaignId: id, id: submissionId, to: 'publicado', ...actorOf(req) });
        }
        const uso = await usageOf([submissionId]);
        res.json({ ok: true, usage: uso[submissionId] || {}, submission: await getSubmission(id, submissionId) });
    } catch (e) { fail(res, e); }
};

/** Borra el archivo de staging y su fila. Sólo antes de promover: una vez en
 *  la Biblioteca, el archivo se administra desde ahí. */
export const deleteSubmissionFile = async (req, res) => {
    try {
        const { id, submissionId, fileId } = req.params;
        const { rows } = await db.query(
            `SELECT * FROM "ContributionSubmissionFile" WHERE id = $1 AND "submissionId" = $2 AND "campaignId" = $3`,
            [fileId, submissionId, id]
        );
        const f = rows[0];
        if (!f) return res.status(404).json({ error: 'No encontramos ese archivo.' });
        if (f.mediaId) return res.status(409).json({ error: 'Ese archivo ya está en la Biblioteca Multimedia: se administra desde ahí.' });
        await deleteStagingObject(f.s3Key);
        await db.query(`DELETE FROM "ContributionSubmissionFile" WHERE id = $1`, [fileId]);
        res.json({ ok: true });
    } catch (e) { fail(res, e); }
};

/** El texto para compartir el enlace, con el nombre de la campaña puesto. */
export const getSubmissionShare = async (req, res) => {
    try {
        const { rows } = await db.query(`SELECT * FROM "ContributionCampaign" WHERE id = $1`, [req.params.id]);
        const campaign = rows[0];
        if (!campaign) return res.status(404).json({ error: 'No encontramos esta campaña.' });
        const content = normalizeContent(campaign.content);
        const config = normalizeSubmissionsConfig(content.submissions);

        // La dirección la resuelve el SERVIDOR con el dominio del sitio, no el
        // navegador: compuesta allá daría una distinta según por dónde se
        // entró al panel (regla del calendario de la distribución, v4.864).
        const url = await formUrlFor(campaign, req);
        res.json({
            url,
            enabled: config.enabled,
            inviteMessage: inviteMessageFor(campaign, config, url),
            campaignName: campaign.name,
        });
    } catch (e) { fail(res, e); }
};

async function formUrlFor(campaign, req) {
    const ruta = `/aportar-contenido/${campaign.slug || campaign.id}`;
    try {
        const clubId = campaign.recipientClubId || req.user?.clubId;
        if (clubId) {
            const club = await prisma.club.findUnique({ where: { id: clubId }, select: { domain: true, subdomain: true } });
            if (club?.domain) return `https://${String(club.domain).replace(/^https?:\/\//, '').replace(/\/+$/, '')}${ruta}`;
            if (club?.subdomain) return `https://${club.subdomain}.clubplatform.org${ruta}`;
        }
    } catch { /* sin dominio propio, cae al de la plataforma */ }
    const host = req.get?.('host') || 'app.clubplatform.org';
    return `https://${String(host).replace(/^https?:\/\//, '')}${ruta}`;
}

export default {
    getSubmissionForm, presignSubmissionFile, submitContent,
    listCampaignSubmissions, getSubmissionCounts, getCampaignSubmission,
    changeSubmissionStatus, approveSubmission, markSubmissionUsage,
    deleteSubmissionFile, getSubmissionShare,
};
