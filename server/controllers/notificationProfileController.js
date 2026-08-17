// ════════════════════════════════════════════════════════════════════
// Notificaciones de Contribuciones — perfiles, beneficiarios y plantillas
// v4.856.0 (Fase 1)
//
// La orquestación. El CRITERIO —qué perfil le toca a un sitio, qué le falta a
// una plantilla, cómo se compone el correo— vive en `notificationSpec.js` y
// `notificationTemplate.js`, que son puros y tienen pruebas.
//
// ── ESTO ES DEL OPERADOR DE LA PLATAFORMA ───────────────────────────
//
// Un perfil lleva la identidad institucional de un TERCERO —el nombre con el
// que firma una fundación— y decide desde qué dominio sale el correo. Que lo
// edite el administrador de un sitio permitiría firmar como Colrotarios desde
// cualquier parte. Lo comprueban las rutas con `superAdminOnly`, no la
// pantalla: esconder un botón no sirve, quien conoce el endpoint se lo saltea.
//
// ── LA FASE 1 NO MANDA CORREOS DE APORTES ───────────────────────────
//
// Se configura, se previsualiza y se manda una PRUEBA a una dirección que
// escribe el administrador. El recibo real sigue saliendo como en v4.855; lo
// cambia la Fase 2, cuando exista la resolución del remitente.
// ════════════════════════════════════════════════════════════════════
import db from '../lib/db.js';
import EmailService from '../services/EmailService.js';
import ensureNotificationSchema from '../lib/ensureNotificationSchema.js';
import {
    beneficiaryShape, profileShape, validateProfile, pickProfileFor,
    availableEvents, RECIPIENT_KINDS, isKnownEvent, isKnownRecipientKind,
    PREFERRED_SENDERS, defaultEventRules, normalizeEmail,
} from '../lib/notificationSpec.js';
import {
    templateShape, validateTemplate, renderTemplate, defaultTemplate,
    sampleVariables, TEMPLATE_VARIABLES, BLOCK_TYPES,
} from '../lib/notificationTemplate.js';
import { normalizeTargeting } from '../lib/contributionSpec.js';

const fail = (res, e, code = 500, msg = null) => {
    console.error('[NOTIF-PROFILE]', e?.message || e);
    res.status(code).json({ error: msg || e?.message || 'Error inesperado' });
};

const isOperator = (req) => req.user?.role === 'administrator';

/** El correo de quien está operando, para la traza de quién cambió qué. */
const quien = (req) => String(req.user?.email || req.user?.id || '').slice(0, 200) || null;

/* ─── Forma de salida ────────────────────────────────────────────────*/

const beneficiaryOut = (r) => ({
    id: r.id, legalName: r.legalName, tradeName: r.tradeName || r.legalName,
    taxId: r.taxId, logoUrl: r.logoUrl, email: r.email, website: r.website,
    phone: r.phone, address: r.address, contactName: r.contactName,
    notes: r.notes, active: r.active,
    createdAt: r.createdAt, updatedAt: r.updatedAt,
});

const profileOut = (r) => ({
    id: r.id, name: r.name, active: r.active, isDefault: r.isDefault,
    priority: r.priority, beneficiaryId: r.beneficiaryId,
    identity: r.identity || {}, routing: r.routing || {}, events: r.events || {},
    targeting: normalizeTargeting(r.targeting),
    internalRecipients: Array.isArray(r.internalRecipients) ? r.internalRecipients : [],
    notes: r.notes, createdAt: r.createdAt, updatedAt: r.updatedAt,
});

/* ════════════════════════════════════════════════════════════════════
   EL CATÁLOGO — lo que la pantalla necesita para dibujarse
   ════════════════════════════════════════════════════════════════════ */

// GET /api/notification-profiles/options
export const getNotificationOptions = async (req, res) => {
    try {
        if (!isOperator(req)) return res.status(403).json({ error: 'Esta configuración es del operador de la plataforma.' });
        await ensureNotificationSchema();

        // Los sitios, para elegir el alcance. Sólo id, nombre y distrito: lo
        // que hace falta para una lista, y nada más.
        const { rows: sitios } = await db.query(
            `SELECT id, name, district, "districtId" FROM "Club" ORDER BY name ASC LIMIT 500`
        );

        res.json({
            events: availableEvents(),
            // Los que todavía no tienen fuente se declaran aparte, con su
            // motivo: ofrecerlos como casillas daría controles que no hacen
            // nada, y esconderlos haría creer que no están previstos.
            unavailableEvents: (await import('../lib/notificationSpec.js'))
                .NOTIFICATION_EVENTS.filter(e => !e.available),
            recipientKinds: RECIPIENT_KINDS,
            preferredSenders: PREFERRED_SENDERS,
            variables: TEMPLATE_VARIABLES,
            blockTypes: BLOCK_TYPES,
            sites: sitios,
            defaultEvents: defaultEventRules(),
        });
    } catch (e) { fail(res, e); }
};

/* ════════════════════════════════════════════════════════════════════
   BENEFICIARIOS
   ════════════════════════════════════════════════════════════════════ */

// GET /api/notification-profiles/beneficiaries
export const listBeneficiaries = async (req, res) => {
    try {
        if (!isOperator(req)) return res.status(403).json({ error: 'Esta configuración es del operador de la plataforma.' });
        await ensureNotificationSchema();
        const { rows } = await db.query(`SELECT * FROM "NotificationBeneficiary" ORDER BY active DESC, "legalName" ASC`);
        res.json(rows.map(beneficiaryOut));
    } catch (e) { fail(res, e); }
};

// POST /api/notification-profiles/beneficiaries  ·  PUT .../:id
export const saveBeneficiary = async (req, res) => {
    try {
        if (!isOperator(req)) return res.status(403).json({ error: 'Esta configuración es del operador de la plataforma.' });
        await ensureNotificationSchema();

        const b = beneficiaryShape(req.body);
        if (!b) return res.status(400).json({ error: 'Falta el nombre legal de la entidad.' });
        const activo = req.body?.active !== false;
        const id = req.params?.id || null;

        if (id) {
            const { rows } = await db.query(
                `UPDATE "NotificationBeneficiary"
                    SET "legalName"=$2, "tradeName"=$3, "taxId"=$4, "logoUrl"=$5, email=$6,
                        website=$7, phone=$8, address=$9, "contactName"=$10, notes=$11,
                        active=$12, "updatedBy"=$13, "updatedAt"=NOW()
                  WHERE id=$1 RETURNING *`,
                [id, b.legalName, b.tradeName, b.taxId, b.logoUrl, b.email, b.website,
                    b.phone, b.address, b.contactName, b.notes, activo, quien(req)]
            );
            if (!rows[0]) return res.status(404).json({ error: 'La entidad no existe.' });
            return res.json(beneficiaryOut(rows[0]));
        }

        const { rows } = await db.query(
            `INSERT INTO "NotificationBeneficiary"
                ("legalName","tradeName","taxId","logoUrl",email,website,phone,address,"contactName",notes,active,"createdBy","updatedBy")
             VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$12) RETURNING *`,
            [b.legalName, b.tradeName, b.taxId, b.logoUrl, b.email, b.website,
                b.phone, b.address, b.contactName, b.notes, activo, quien(req)]
        );
        res.status(201).json(beneficiaryOut(rows[0]));
    } catch (e) { fail(res, e, 400); }
};

// DELETE /api/notification-profiles/beneficiaries/:id
export const deleteBeneficiary = async (req, res) => {
    try {
        if (!isOperator(req)) return res.status(403).json({ error: 'Esta configuración es del operador de la plataforma.' });
        await ensureNotificationSchema();

        // Una entidad que algún perfil usa NO se borra: el perfil quedaría
        // firmando en nombre de algo que no existe, y con él todos los correos
        // de los sitios que ese perfil alcanza. Se desactiva. Mismo criterio
        // que una categoría de evento con inscripciones (v4.648).
        const { rows: usada } = await db.query(
            `SELECT id, name FROM "NotificationProfile" WHERE "beneficiaryId" = $1 LIMIT 5`, [req.params.id]
        );
        if (usada.length) {
            return res.status(409).json({
                error: `No se puede eliminar: la usan ${usada.length} perfil(es) (${usada.map(u => u.name).join(', ')}). Desactivala en su lugar.`,
            });
        }
        await db.query(`DELETE FROM "NotificationBeneficiary" WHERE id = $1`, [req.params.id]);
        res.json({ ok: true });
    } catch (e) { fail(res, e); }
};

/* ════════════════════════════════════════════════════════════════════
   PERFILES
   ════════════════════════════════════════════════════════════════════ */

// GET /api/notification-profiles
export const listProfiles = async (req, res) => {
    try {
        if (!isOperator(req)) return res.status(403).json({ error: 'Esta configuración es del operador de la plataforma.' });
        await ensureNotificationSchema();
        const { rows } = await db.query(
            `SELECT * FROM "NotificationProfile" ORDER BY active DESC, priority DESC, "updatedAt" DESC`
        );
        const { rows: bens } = await db.query(`SELECT * FROM "NotificationBeneficiary"`);
        const porId = Object.fromEntries(bens.map(b => [b.id, beneficiaryOut(b)]));

        res.json(rows.map(r => {
            const p = profileOut(r);
            const ben = p.beneficiaryId ? porId[p.beneficiaryId] || null : null;
            // La validación viaja CON el perfil: un perfil que no puede
            // notificar tiene que verse así en la lista, no sólo al abrirlo.
            return { ...p, beneficiary: ben, validation: validateProfile(p, { beneficiary: ben }) };
        }));
    } catch (e) { fail(res, e); }
};

// POST /api/notification-profiles  ·  PUT /api/notification-profiles/:id
export const saveProfile = async (req, res) => {
    try {
        if (!isOperator(req)) return res.status(403).json({ error: 'Esta configuración es del operador de la plataforma.' });
        await ensureNotificationSchema();

        const p = profileShape(req.body);
        if (!p) return res.status(400).json({ error: 'Falta el nombre del perfil.' });
        const targeting = normalizeTargeting(req.body?.targeting);
        const id = req.params?.id || null;

        const args = [
            p.name, p.active, p.isDefault, p.priority, p.beneficiaryId,
            JSON.stringify(p.identity), JSON.stringify(p.routing), JSON.stringify(p.events),
            JSON.stringify(targeting), JSON.stringify(p.internalRecipients), p.notes, quien(req),
        ];

        const { rows } = id
            ? await db.query(
                `UPDATE "NotificationProfile"
                    SET name=$2, active=$3, "isDefault"=$4, priority=$5, "beneficiaryId"=$6,
                        identity=$7::jsonb, routing=$8::jsonb, events=$9::jsonb,
                        targeting=$10::jsonb, "internalRecipients"=$11::jsonb, notes=$12,
                        "updatedBy"=$13, "updatedAt"=NOW()
                  WHERE id=$1 RETURNING *`, [id, ...args])
            : await db.query(
                `INSERT INTO "NotificationProfile"
                    (name, active, "isDefault", priority, "beneficiaryId", identity, routing, events,
                     targeting, "internalRecipients", notes, "createdBy", "updatedBy")
                 VALUES ($1,$2,$3,$4,$5,$6::jsonb,$7::jsonb,$8::jsonb,$9::jsonb,$10::jsonb,$11,$12,$12)
                 RETURNING *`, args);

        if (!rows[0]) return res.status(404).json({ error: 'El perfil no existe.' });
        const guardado = profileOut(rows[0]);

        // Un perfil nuevo estrena su plantilla de fábrica. Sin ella, quien
        // acaba de crearlo abre el editor y encuentra una pantalla en blanco
        // sin saber por dónde empezar — y la plantilla por defecto es además
        // el texto que el pedido especificó.
        if (!id) await sembrarPlantilla(guardado.id, quien(req));

        const ben = guardado.beneficiaryId ? await leerBeneficiario(guardado.beneficiaryId) : null;
        res.status(id ? 200 : 201).json({
            ...guardado, beneficiary: ben,
            validation: validateProfile(guardado, { beneficiary: ben }),
        });
    } catch (e) { fail(res, e, 400); }
};

// DELETE /api/notification-profiles/:id
export const deleteProfile = async (req, res) => {
    try {
        if (!isOperator(req)) return res.status(403).json({ error: 'Esta configuración es del operador de la plataforma.' });
        await ensureNotificationSchema();
        // Las plantillas se van con él: son suyas y no sirven sin su perfil.
        // Las ENTREGAS ya registradas NO se tocan — son la traza de correos que
        // de verdad salieron, y borrarlas dejaría aportes sin poder explicar.
        await db.query(`DELETE FROM "NotificationTemplate" WHERE "profileId" = $1`, [req.params.id]);
        await db.query(`DELETE FROM "NotificationProfile" WHERE id = $1`, [req.params.id]);
        res.json({ ok: true });
    } catch (e) { fail(res, e); }
};

const leerBeneficiario = async (id) => {
    if (!id) return null;
    const { rows } = await db.query(`SELECT * FROM "NotificationBeneficiary" WHERE id = $1 LIMIT 1`, [id]);
    return rows[0] ? beneficiaryOut(rows[0]) : null;
};

/* ════════════════════════════════════════════════════════════════════
   PLANTILLAS — versionadas
   ════════════════════════════════════════════════════════════════════ */

const sembrarPlantilla = async (profileId, autor) => {
    const t = defaultTemplate();
    await db.query(
        `INSERT INTO "NotificationTemplate" ("profileId", event, "recipientKind", version, "isCurrent", subject, preheader, blocks, "createdBy")
         VALUES ($1,'payment_confirmed','donor',1,TRUE,$2,$3,$4::jsonb,$5)`,
        [profileId, t.subject, t.preheader, JSON.stringify(t.blocks), autor]
    );
};

/**
 * La plantilla que le toca a una combinación, con el FALLBACK del criterio 19:
 *
 *   1. la específica de la CAMPAÑA
 *   2. la del PERFIL
 *   3. la GLOBAL de la plataforma (perfil y campaña en NULL)
 *   4. la de fábrica, escrita en el código
 *
 * El paso 4 es el que hace verdadera la promesa: ninguna contribución se queda
 * sin notificación porque falte una personalización.
 *
 * El «template del sitio» que enumeraba el pedido NO existe todavía: un sitio
 * no puede editar plantillas en esta fase, así que declarar el escalón sería
 * prometer un nivel que nadie puede llenar.
 */
export const resolveTemplate = async ({ profileId = null, campaignId = null, event = 'payment_confirmed', recipientKind = 'donor' }) => {
    const ev = isKnownEvent(event) ? event : 'payment_confirmed';
    const rk = isKnownRecipientKind(recipientKind) ? recipientKind : 'donor';

    const intentos = [
        campaignId ? { sql: `"campaignId" = $1`, args: [campaignId], origen: 'campaña' } : null,
        profileId ? { sql: `"profileId" = $1 AND "campaignId" IS NULL`, args: [profileId], origen: 'perfil' } : null,
        { sql: `"profileId" IS NULL AND "campaignId" IS NULL`, args: [], origen: 'plataforma' },
    ].filter(Boolean);

    for (const i of intentos) {
        const { rows } = await db.query(
            `SELECT * FROM "NotificationTemplate"
              WHERE ${i.sql} AND event = $${i.args.length + 1} AND "recipientKind" = $${i.args.length + 2} AND "isCurrent"
              LIMIT 1`,
            [...i.args, ev, rk]
        );
        if (rows[0]) return { template: templateShape(rows[0]), version: rows[0].version, source: i.origen, id: rows[0].id };
    }
    return { template: defaultTemplate(), version: 0, source: 'fábrica', id: null };
};

// GET /api/notification-profiles/templates?profileId=&campaignId=&event=&recipientKind=
export const getTemplate = async (req, res) => {
    try {
        if (!isOperator(req)) return res.status(403).json({ error: 'Esta configuración es del operador de la plataforma.' });
        await ensureNotificationSchema();
        const r = await resolveTemplate({
            profileId: req.query.profileId || null,
            campaignId: req.query.campaignId || null,
            event: req.query.event,
            recipientKind: req.query.recipientKind,
        });
        res.json({ ...r, validation: validateTemplate(r.template) });
    } catch (e) { fail(res, e); }
};

// POST /api/notification-profiles/templates
export const saveTemplate = async (req, res) => {
    try {
        if (!isOperator(req)) return res.status(403).json({ error: 'Esta configuración es del operador de la plataforma.' });
        await ensureNotificationSchema();

        const profileId = req.body?.profileId || null;
        const campaignId = req.body?.campaignId || null;
        const event = isKnownEvent(req.body?.event) ? req.body.event : 'payment_confirmed';
        const recipientKind = isKnownRecipientKind(req.body?.recipientKind) ? req.body.recipientKind : 'donor';
        const t = templateShape(req.body?.template);

        const v = validateTemplate(t);
        // Se valida ANTES de escribir: guardar una plantilla que no se puede
        // enviar deja una versión inservible marcada como vigente, y la
        // siguiente notificación sale con ella.
        if (!v.ok) return res.status(422).json({ error: 'La plantilla no se puede guardar todavía.', errors: v.errors, warnings: v.warnings });

        // NUNCA se actualiza una fila: se baja la bandera de la vigente y se
        // inserta una versión nueva. Es lo que permite explicar un aporte de
        // hace seis meses con la plantilla que lo generó. Mismo patrón que
        // `ReelCopy`.
        //
        // El índice único es PARCIAL (`WHERE "isCurrent"`), así que NO se usa
        // `ON CONFLICT`: tendría que repetir el predicado o la sentencia falla
        // entera (v4.648). Bajar la bandera primero es más simple y más claro.
        const { rows: previas } = await db.query(
            `UPDATE "NotificationTemplate" SET "isCurrent" = FALSE
              WHERE COALESCE("profileId",'') = COALESCE($1::text,'')
                AND COALESCE("campaignId",'') = COALESCE($2::text,'')
                AND event = $3 AND "recipientKind" = $4 AND "isCurrent"
              RETURNING version`,
            [profileId, campaignId, event, recipientKind]
        );
        const siguiente = (previas[0]?.version || 0) + 1;

        const { rows } = await db.query(
            `INSERT INTO "NotificationTemplate"
                ("profileId","campaignId",event,"recipientKind",version,"isCurrent",subject,preheader,blocks,"createdBy")
             VALUES ($1,$2,$3,$4,$5,TRUE,$6,$7,$8::jsonb,$9) RETURNING *`,
            [profileId, campaignId, event, recipientKind, siguiente, t.subject, t.preheader, JSON.stringify(t.blocks), quien(req)]
        );
        res.status(201).json({ template: templateShape(rows[0]), version: rows[0].version, id: rows[0].id, warnings: v.warnings });
    } catch (e) { fail(res, e, 400); }
};

// GET /api/notification-profiles/templates/versions?profileId=&campaignId=&event=&recipientKind=
export const listTemplateVersions = async (req, res) => {
    try {
        if (!isOperator(req)) return res.status(403).json({ error: 'Esta configuración es del operador de la plataforma.' });
        await ensureNotificationSchema();
        const { rows } = await db.query(
            `SELECT id, version, "isCurrent", subject, "createdBy", "createdAt"
               FROM "NotificationTemplate"
              WHERE COALESCE("profileId",'') = COALESCE($1::text,'')
                AND COALESCE("campaignId",'') = COALESCE($2::text,'')
                AND event = $3 AND "recipientKind" = $4
              ORDER BY version DESC LIMIT 50`,
            [req.query.profileId || null, req.query.campaignId || null,
                isKnownEvent(req.query.event) ? req.query.event : 'payment_confirmed',
                isKnownRecipientKind(req.query.recipientKind) ? req.query.recipientKind : 'donor']
        );
        res.json(rows);
    } catch (e) { fail(res, e); }
};

/* ════════════════════════════════════════════════════════════════════
   VISTA PREVIA Y ENVÍO DE PRUEBA
   ════════════════════════════════════════════════════════════════════ */

/** El contexto de una vista previa: valores de ejemplo, con el beneficiario
 *  real del perfil si lo tiene — así se ve lo que se va a ver. */
const contextoDePrueba = async (profile) => {
    const ben = profile?.beneficiaryId ? await leerBeneficiario(profile.beneficiaryId) : null;
    const vars = sampleVariables();
    if (ben) vars.beneficiary_name = ben.tradeName || ben.legalName;
    return { vars, beneficiary: ben };
};

// POST /api/notification-profiles/preview
export const previewTemplate = async (req, res) => {
    try {
        if (!isOperator(req)) return res.status(403).json({ error: 'Esta configuración es del operador de la plataforma.' });
        await ensureNotificationSchema();

        const perfil = req.body?.profileId ? await leerPerfil(req.body.profileId) : null;
        const t = req.body?.template
            ? templateShape(req.body.template)
            : (await resolveTemplate({ profileId: req.body?.profileId, campaignId: req.body?.campaignId })).template;

        const { vars, beneficiary } = await contextoDePrueba(perfil);
        const salida = renderTemplate({ template: t, vars, identity: perfil?.identity || {}, beneficiary });

        res.json({
            ...salida,
            validation: validateTemplate(t),
            // El remitente TODAVÍA no se resuelve: eso es la Fase 2. Decirlo es
            // mejor que enseñar una dirección que no va a ser la real.
            sender: {
                name: perfil?.identity?.fromName || null,
                replyTo: perfil?.identity?.replyTo || null,
                addressNote: 'La dirección de envío la resuelve el servidor con el dominio del sitio de origen (Fase 2).',
            },
        });
    } catch (e) { fail(res, e, 400); }
};

const leerPerfil = async (id) => {
    const { rows } = await db.query(`SELECT * FROM "NotificationProfile" WHERE id = $1 LIMIT 1`, [id]);
    return rows[0] ? profileOut(rows[0]) : null;
};

// POST /api/notification-profiles/test
export const sendTestEmail = async (req, res) => {
    try {
        if (!isOperator(req)) return res.status(403).json({ error: 'Esta configuración es del operador de la plataforma.' });
        await ensureNotificationSchema();

        const to = normalizeEmail(req.body?.to);
        if (!to || !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(to)) {
            return res.status(400).json({ error: 'Escribí una dirección de correo válida.' });
        }

        const perfil = req.body?.profileId ? await leerPerfil(req.body.profileId) : null;
        const t = req.body?.template
            ? templateShape(req.body.template)
            : (await resolveTemplate({ profileId: req.body?.profileId, campaignId: req.body?.campaignId })).template;
        const v = validateTemplate(t);
        if (!v.ok) return res.status(422).json({ error: 'La plantilla no se puede enviar todavía.', errors: v.errors });

        const { vars, beneficiary } = await contextoDePrueba(perfil);
        const salida = renderTemplate({ template: t, vars, identity: perfil?.identity || {}, beneficiary });

        // La prueba sale por el camino de plataforma, con el remitente de
        // siempre: la resolución del dominio propio es la Fase 2, y prometer
        // acá una dirección que todavía no se resuelve daría una prueba que no
        // prueba lo que se va a usar. Se DICE en la respuesta.
        const nombre = perfil?.identity?.fromName || 'Club Platform for Rotary';
        const resultado = await EmailService.sendPlatformEmail({
            to,
            subject: `[PRUEBA] ${salida.subject}`,
            html: salida.html,
            from: `"${nombre.replace(/"/g, '')}" <noreply@clubplatform.org>`,
            replyTo: perfil?.identity?.replyTo || undefined,
        });

        // El error del proveedor se propaga TEXTUAL: convertirlo en «no se
        // pudo enviar» deja a quien corrige sin saber qué.
        if (!resultado?.success) {
            return res.status(502).json({
                error: `El proveedor rechazó el envío: ${resultado?.error || 'sin motivo devuelto'}`,
            });
        }
        res.json({
            ok: true, messageId: resultado.messageId || null, to,
            note: 'La prueba salió por el remitente central. La resolución del dominio propio del sitio llega en la Fase 2.',
            missing: salida.missing,
        });
    } catch (e) { fail(res, e, 502); }
};

/* ════════════════════════════════════════════════════════════════════
   QUÉ PERFIL LE TOCA A UN SITIO — la comprobación del alcance
   ════════════════════════════════════════════════════════════════════ */

// GET /api/notification-profiles/resolve?clubId=&campaignId=
//
// Existe para que el operador pueda COMPROBAR el alcance antes de publicar:
// «¿qué perfil le toca al Distrito 4281?». Sin esto, la única forma de
// saberlo sería hacer un aporte de verdad.
export const resolveForSite = async (req, res) => {
    try {
        if (!isOperator(req)) return res.status(403).json({ error: 'Esta configuración es del operador de la plataforma.' });
        await ensureNotificationSchema();

        const clubId = String(req.query.clubId || '').trim();
        if (!clubId) return res.status(400).json({ error: 'Falta el sitio.' });
        const { rows: sitio } = await db.query(
            `SELECT id, name, district, "districtId" FROM "Club" WHERE id = $1 LIMIT 1`, [clubId]
        );
        if (!sitio[0]) return res.status(404).json({ error: 'El sitio no existe.' });

        const { rows } = await db.query(`SELECT * FROM "NotificationProfile"`);
        const perfiles = rows.map(profileOut);

        let campaign = null;
        if (req.query.campaignId) {
            const { rows: c } = await db.query(
                `SELECT id, name, "notificationProfileId" FROM "ContributionCampaign" WHERE id = $1 LIMIT 1`,
                [String(req.query.campaignId)]
            ).catch(() => ({ rows: [] }));
            campaign = c[0] || null;
        }

        const r = pickProfileFor({ profiles: perfiles, site: sitio[0], campaign });
        const ben = r.profile?.beneficiaryId ? await leerBeneficiario(r.profile.beneficiaryId) : null;
        const plantilla = await resolveTemplate({
            profileId: r.profile?.id || null,
            campaignId: campaign?.id || null,
        });

        res.json({
            site: sitio[0],
            profile: r.profile ? { ...r.profile, beneficiary: ben } : null,
            // El MOTIVO viaja siempre: es lo que contesta «¿por qué este aporte
            // salió firmado así?» sin tener que leer el código.
            reason: r.reason,
            template: { version: plantilla.version, source: plantilla.source },
        });
    } catch (e) { fail(res, e); }
};

export default {
    getNotificationOptions,
    listBeneficiaries, saveBeneficiary, deleteBeneficiary,
    listProfiles, saveProfile, deleteProfile,
    getTemplate, saveTemplate, listTemplateVersions, resolveTemplate,
    previewTemplate, sendTestEmail, resolveForSite,
};
