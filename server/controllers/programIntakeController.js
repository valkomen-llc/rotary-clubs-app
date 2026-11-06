// ════════════════════════════════════════════════════════════════════
// Programas — el formulario institucional — controlador — v4.1286.0
//
// PÚBLICO (sin cuenta, como Visitas del Gobernador): el acceso a un borrador
// es un SECRETO de 32 bytes que viaja en la cabecera `X-Intake-Token` —
// nunca en una URL que quede en registros— y del que sólo se guarda el hash.
// Recuperarlo en otro dispositivo exige el correo: el enlace nuevo llega a
// ese buzón, y la respuesta es la misma exista o no un borrador. Con sesión
// iniciada, el envío queda además ligado a la cuenta.
//
// ADMINISTRACIÓN: revisar por ítem, pedir ajustes, aplicar. Aplicar crea
// solicitudes del flujo editorial (`ProgramChangeRequest`) con el envío como
// origen: no publica ni sobrescribe nada aprobado.
//
// Elegir un programa o un club en el formulario NO da permisos: nada de esto
// crea `ProgramMember`. Ver `docs/claude/formulario-institucional-de-programas.md`.
// ════════════════════════════════════════════════════════════════════
import jwt from 'jsonwebtoken';
import db from '../lib/db.js';
import ensureProgramSchema from '../lib/ensureProgramSchema.js';
import * as S from '../lib/programStore.js';
import * as I from '../lib/programIntakeStore.js';
import * as N from '../lib/programNotify.js';
import { resolveScope, contextFor, abilitiesFor } from '../lib/programAccess.js';
import { catalogDistricts } from '../lib/clubCatalog.js';
import { JWT_SECRET } from '../middleware/auth.js';
import {
    PROGRAM_CATEGORIES, isPubliclyVisible, contentTitleOf, NEWSLETTER_CONSENT_TEXT,
} from '../lib/programSpec.js';
import {
    SUBMISSION_TYPES, SUBMISSION_TYPE_IDS, INTAKE_STATES, ITEM_DECISIONS, REVIEWABLE_DECISIONS, INTAKE_SECTION_KEYS, INTAKE_EDITABLE, FILE_PURPOSES,
    intakeLimits, checkIntakeFile, shapeIntakeConfig, resolveIntakeForm, shapeIntakeSection, validateIntakeSection, validateIntakeSubmit, intakeItems,
    currentValuesFor, newIntakeToken, hashIntakeToken, isTokenShape, shapeConsents, canTransitionIntake, sectionSpec, fmtSize, EMAIL_RE,
    INTAKE_DATA_CONSENT, INTAKE_RIGHTS_CONSENT, INTAKE_NEWSLETTER_CONSENT, INTAKE_SECTIONS,
} from '../lib/programIntakeSpec.js';
import {
    newIntakeKey, intakeKeyBelongs, presignSinglePut, startMultipart, presignParts, listUploadedParts, completeMultipart, abortMultipart,
    inspectIntakeObject, signedIntakeUrl, deleteIntakeObject,
} from '../lib/programIntakeFiles.js';

console.log('[programas] v4.1286.0 cargado — Formulario institucional de programas: envíos por secciones con borrador seguro, archivos privados con carga reanudable y revisión por ítem hacia el flujo editorial');

const fail = (res, e, code = 500) => {
    if (code >= 500) console.error('[programas:formulario]', e?.message || e);
    return res.status(code).json({ error: e?.message || 'Error' });
};
const hostOf = (req) => String(req.headers['x-forwarded-host'] || req.headers.host || '').split(',')[0].trim().slice(0, 200);
const actorOf = (req) => ({ id: req.user?.id || null, name: req.user?.name || req.user?.email || 'Administración', clubId: req.user?.clubId || null });
const intq = (v, d) => { const n = Number.parseInt(v, 10); return Number.isFinite(n) && n > 0 ? n : d; };
const linkFor = (host, token) => `${process.env.PLATFORM_FORM_URL || (host ? `https://${host}` : '')}/formulario-programas?continuar=${encodeURIComponent(token)}`;

/** Sesión OPCIONAL: si el navegador manda un token válido, el envío se liga a la cuenta. Nunca da permisos. */
const optionalUser = async (req) => {
    const h = String(req.headers.authorization || '');
    const t = h.startsWith('Bearer ') ? h.slice(7) : '';
    if (!t || t === 'null' || t === 'undefined') return null;
    try {
        const d = jwt.verify(t, JWT_SECRET);
        const id = d?.id || d?.userId || null;
        if (!id) return null;
        const u = (await db.query(`SELECT id, email, name FROM "User" WHERE id = $1`, [id]).catch(() => ({ rows: [] }))).rows[0];
        return u ? { id: u.id, email: String(u.email || '').toLowerCase(), name: u.name || '' } : null;
    } catch { return null; }
};

/** ¿Qué programas reciben información por este formulario? Los vinculados al distrito y con el formulario habilitado. */
async function openPrograms(district) {
    await ensureProgramSchema();
    const { rows } = await db.query(
        `SELECT DISTINCT p.id, p.slug, p.name, p.category, p.status, p."logoUrl", p.profile, p."intakeConfig"
           FROM "Program" p JOIN "ProgramDistrictLink" l ON l."programId" = p.id
          WHERE p.status <> 'archivado' AND l.status = 'activa' AND ($1::int = 0 OR l."districtNumber" = $1)
          ORDER BY p.name`,
        [district]
    );
    return rows.filter(p => shapeIntakeConfig(p.intakeConfig).enabled);
}

const programForForm = (p) => ({
    slug: p.slug, name: p.name, category: p.category, shortName: p.profile?.shortName || '', logoUrl: p.logoUrl || '',
    categoryLabel: PROGRAM_CATEGORIES.find(c => c.id === p.category)?.label || '',
});
const formFor = (p) => resolveIntakeForm(p, p.intakeConfig, { categories: PROGRAM_CATEGORIES.map(c => ({ id: c.id, label: c.label })) });

/** Los registros publicados que una actualización puede señalar (sólo su título: nada interno). */
async function existingRecords(program, { wide = false } = {}) {
    const { rows } = await db.query(
        `SELECT id, kind, title, data FROM "ProgramContent" WHERE "programId" = $1 AND status = 'publicado' AND "scopeType" = 'central' AND kind = ANY($2::text[]) ORDER BY kind, "sortOrder", title`,
        [program.id, ['clinic', 'team', 'story', 'indicator', 'donation']]
    );
    return rows.filter(c => wide || isPubliclyVisible(c.kind, c.data)).map(c => ({
        id: c.id, kind: c.kind, title: contentTitleOf(c.kind, c.data) || c.title,
        detail: c.kind === 'clinic' ? [c.data?.city, c.data?.region].filter(Boolean).join(', ') : c.kind === 'story' ? (c.data?.format === 'testimonio' ? 'Testimonio' : 'Historia') : '',
        format: c.kind === 'story' ? (c.data?.format || 'historia') : undefined,
    }));
}

const tokenOf = (req) => String(req.headers['x-intake-token'] || '').trim();
/** El envío del secreto, o 404 (la respuesta no distingue «no existe» de «no es tuyo»). */
async function loadByToken(req, res) {
    const token = tokenOf(req);
    if (!isTokenShape(token)) { res.status(404).json({ error: 'El enlace no es válido o venció. Pide uno nuevo con tu correo.' }); return null; }
    const intake = await I.getIntakeByTokenHash(hashIntakeToken(token));
    if (!intake) { res.status(404).json({ error: 'El enlace no es válido o venció. Pide uno nuevo con tu correo.' }); return null; }
    const program = await S.getProgram(intake.programId);
    if (!program) { res.status(404).json({ error: 'El programa ya no existe.' }); return null; }
    return { intake, program };
}

/** Lo que quien envía ve de SU envío: sin el historial interno ni quién revisó. */
const ownerView = async (intake) => {
    const files = await I.filesOf(intake.id);
    const items = intakeItems(intake);
    const review = intake.review || {};
    const adjustments = items.filter(i => review[i.key]?.status === 'ajustes').map(i => ({ key: i.key, section: i.section, label: i.label, note: review[i.key]?.note || '' }));
    return {
        id: intake.id, publicRef: intake.publicRef, status: intake.status, statusLabel: INTAKE_STATES[intake.status]?.label || intake.status,
        submissionType: intake.submissionType, sections: intake.sections, sender: intake.sender, data: intake.data, consents: intake.consents,
        editable: INTAKE_EDITABLE.includes(intake.status), reviewNote: intake.status === 'ajustes' ? (intake.reviewNote || '') : '', adjustments,
        lastSavedAt: intake.lastSavedAt, submittedAt: intake.submittedAt, version: intake.version,
        files: files.map(f => ({ id: f.id, purpose: f.purpose, filename: f.filename, bytes: Number(f.bytes), kind: f.kind, status: f.status, format: f.format })),
    };
};

const shapeSender = (raw = {}) => shapeIntakeSection('remitente', raw);
const shapeSections = (raw) => (Array.isArray(raw) ? Array.from(new Set(raw.map(String).filter(k => INTAKE_SECTION_KEYS.includes(k) && !sectionSpec(k)?.always))) : []);

// ════════════════════════════════════════════════════════════════════
// PÚBLICO
// ════════════════════════════════════════════════════════════════════

// GET /public/intake/programas?district=4281
export const publicIntakePrograms = async (req, res) => {
    try {
        const district = intq(req.query.district, 4281);
        const programs = await openPrograms(district);
        const districts = await catalogDistricts().catch(() => []);
        res.setHeader('Cache-Control', 'no-store');
        res.json({ district, programs: programs.map(programForForm), submissionTypes: SUBMISSION_TYPES, districts });
    } catch (e) { return fail(res, e); }
};

// GET /public/intake/form/:slug
export const publicIntakeForm = async (req, res) => {
    try {
        await ensureProgramSchema();
        const program = await S.getProgram(req.params.slug);
        if (!program || program.status === 'archivado' || !shapeIntakeConfig(program.intakeConfig).enabled) return res.status(404).json({ error: 'Este programa no recibe información por el formulario.' });
        const limits = intakeLimits();
        res.setHeader('Cache-Control', 'no-store');
        res.json({
            program: programForForm(program), form: formFor(program), records: await existingRecords(program),
            limits: { ...limits, label: `Fotografías hasta ${fmtSize(limits.image)} · videos hasta ${fmtSize(limits.video)} · audios hasta ${fmtSize(limits.audio)} · documentos hasta ${fmtSize(limits.document)} · archivos de diseño hasta ${fmtSize(limits.design)}. Hasta ${limits.filesPerIntake} archivos por envío.` },
            purposes: Object.fromEntries(Object.entries(FILE_PURPOSES).map(([k, v]) => [k, { label: v.label, exts: v.exts }])),
            consents: { data: INTAKE_DATA_CONSENT, rights: INTAKE_RIGHTS_CONSENT, newsletter: INTAKE_NEWSLETTER_CONSENT },
            submissionTypes: SUBMISSION_TYPES, districts: await catalogDistricts().catch(() => []),
        });
    } catch (e) { return fail(res, e); }
};

// POST /public/intake/start  { slug, submissionType, sections[], sender{}, consents{} }
export const publicIntakeStart = async (req, res) => {
    try {
        if (String(req.body?.website_url || '').trim()) return res.status(201).json({ ok: true }); // trampa para bots
        const program = await S.getProgram(String(req.body?.slug || ''));
        if (!program || program.status === 'archivado' || !shapeIntakeConfig(program.intakeConfig).enabled) return res.status(404).json({ error: 'Este programa no recibe información por el formulario.' });
        const submissionType = SUBMISSION_TYPE_IDS.includes(req.body?.submissionType) ? req.body.submissionType : '';
        if (!submissionType) return res.status(400).json({ error: 'Elige el tipo de envío.', errors: [{ section: 'inicio', field: 'submissionType', message: 'Elige el tipo de envío.' }] });
        const sender = shapeSender(req.body?.sender || {});
        if (!EMAIL_RE.test(sender.email || '')) return res.status(400).json({ error: 'Escribe tu correo: es la única forma de recuperar el borrador.', errors: [{ section: 'remitente', field: 'email', message: 'Escribe un correo válido.' }] });
        const user = await optionalUser(req);
        const token = newIntakeToken();
        const intake = await I.createIntake({
            programId: program.id, submissionType, sections: shapeSections(req.body?.sections), sender, consents: shapeConsents(req.body?.consents),
            tokenHash: hashIntakeToken(token), ownerUserId: user?.id || null, originHost: hostOf(req),
        });
        const mail = await N.sendIntakeLink({ program, intake, link: linkFor(hostOf(req), token), reason: 'start' }).catch(() => ({ sent: false }));
        res.status(201).json({ ok: true, token, emailSent: Boolean(mail?.sent), intake: await ownerView(intake) });
    } catch (e) { return fail(res, e); }
};

// GET /public/intake/draft   (X-Intake-Token)
export const publicIntakeDraft = async (req, res) => {
    try {
        const L = await loadByToken(req, res); if (!L) return;
        res.setHeader('Cache-Control', 'no-store');
        res.json({ intake: await ownerView(L.intake), program: programForForm(L.program) });
    } catch (e) { return fail(res, e); }
};

// PUT /public/intake/draft/meta  { submissionType, sections, sender, consents }
export const publicIntakeSaveMeta = async (req, res) => {
    try {
        const L = await loadByToken(req, res); if (!L) return;
        if (!INTAKE_EDITABLE.includes(L.intake.status)) return res.status(409).json({ error: 'Este envío ya está en revisión: no se puede editar.' });
        const submissionType = SUBMISSION_TYPE_IDS.includes(req.body?.submissionType) ? req.body.submissionType : L.intake.submissionType;
        const sender = req.body?.sender ? shapeSender(req.body.sender) : L.intake.sender;
        if (!EMAIL_RE.test(sender.email || '')) return res.status(400).json({ error: 'El correo es necesario para recuperar el borrador.' });
        const user = await optionalUser(req);
        const row = await I.saveMeta(L.intake.id, {
            submissionType, sections: req.body?.sections ? shapeSections(req.body.sections) : L.intake.sections, sender,
            consents: req.body?.consents ? shapeConsents(req.body.consents) : L.intake.consents, ownerUserId: user?.id || null,
        });
        if (!row) return res.status(409).json({ error: 'Este envío ya está en revisión: no se puede editar.' });
        res.json({ ok: true, savedAt: row.lastSavedAt, version: row.version });
    } catch (e) { return fail(res, e); }
};

// PUT /public/intake/draft/section/:key  { data }
export const publicIntakeSaveSection = async (req, res) => {
    try {
        const L = await loadByToken(req, res); if (!L) return;
        const key = String(req.params.key || '');
        const spec = sectionSpec(key);
        if (!spec || spec.always) return res.status(400).json({ error: 'Sección desconocida.' });
        if (!INTAKE_EDITABLE.includes(L.intake.status)) return res.status(409).json({ error: 'Este envío ya está en revisión: no se puede editar.' });
        const form = formFor(L.program);
        if (!form.sections.some(s => s.k === key)) return res.status(400).json({ error: 'Esa sección no aplica a este programa.' });
        const value = shapeIntakeSection(key, req.body?.data || {});
        // Los archivos que la sección cita tienen que ser de ESTE envío.
        const mine = new Set((await I.filesOf(L.intake.id)).map(f => f.id));
        const cited = JSON.stringify(value).match(/"id":"([A-Za-z0-9_-]{8,64})"/g)?.map(x => x.slice(6, -1)) || [];
        if (cited.some(id => !mine.has(id))) return res.status(400).json({ error: 'Hay un archivo que no pertenece a este envío. Vuelve a adjuntarlo.' });
        const row = await I.saveSection(L.intake.id, key, value);
        if (!row) return res.status(409).json({ error: 'Este envío ya está en revisión: no se puede editar.' });
        // Guardar nunca bloquea: los avisos de formato vuelven para mostrarlos, no para rechazar.
        res.json({ ok: true, savedAt: row.lastSavedAt, version: row.version, data: value, warnings: validateIntakeSection(form, key, value) });
    } catch (e) { return fail(res, e); }
};

// POST /public/intake/draft/submit  { consents }
export const publicIntakeSubmit = async (req, res) => {
    try {
        const L = await loadByToken(req, res); if (!L) return;
        if (!INTAKE_EDITABLE.includes(L.intake.status)) return res.status(409).json({ error: 'Este envío ya se envió.' });
        const consents = req.body?.consents ? shapeConsents(req.body.consents) : L.intake.consents;
        const form = formFor(L.program);
        const pending = (await I.filesOf(L.intake.id)).filter(f => f.status !== 'ready');
        if (pending.length) return res.status(409).json({ error: `Hay ${pending.length} archivo(s) que no terminaron de cargar: espera, reintenta o quítalos.` });
        const errors = validateIntakeSubmit(form, { ...L.intake, consents });
        if (errors.length) return res.status(400).json({ error: errors[0].message, errors });
        await I.saveMeta(L.intake.id, { submissionType: L.intake.submissionType, sections: L.intake.sections, sender: L.intake.sender, consents });
        const row = await I.submitIntake(L.intake.id, { consentText: { data: INTAKE_DATA_CONSENT, rights: consents.rights ? INTAKE_RIGHTS_CONSENT : null, newsletter: consents.newsletter ? INTAKE_NEWSLETTER_CONSENT : null, at: new Date().toISOString() } });
        if (!row) return res.status(409).json({ error: 'Este envío ya se envió.' });
        // La suscripción a novedades es un consentimiento APARTE: sólo si se marcó.
        if (consents.newsletter && L.intake.sender?.email) {
            await S.subscribe({ programId: L.program.id, email: L.intake.sender.email, name: [L.intake.sender.firstName, L.intake.sender.lastName].filter(Boolean).join(' '), consentText: NEWSLETTER_CONSENT_TEXT, origin: { host: hostOf(req) } }).catch(() => {});
        }
        N.notifyIntakeSubmitted({ program: L.program, intake: row, members: await S.listMembers(L.program.id), host: hostOf(req) }).catch(() => {});
        res.json({ ok: true, intake: await ownerView(row) });
    } catch (e) { return fail(res, e); }
};

// POST /public/intake/recover  { email }  → siempre la misma respuesta
export const publicIntakeRecover = async (req, res) => {
    const same = { ok: true, message: 'Si hay borradores asociados a ese correo, te enviamos un enlace para continuarlos. Revisa también la carpeta de correo no deseado.' };
    try {
        const email = String(req.body?.email || '').trim().toLowerCase();
        if (!EMAIL_RE.test(email)) return res.status(400).json({ error: 'Escribe un correo válido.' });
        const drafts = await I.draftsByEmail(email);
        for (const d of drafts.slice(0, 5)) {
            const token = newIntakeToken();
            await I.addTokenHash(d.id, hashIntakeToken(token));
            const program = await S.getProgram(d.programId);
            const intake = await I.getIntake(d.id);
            N.sendIntakeLink({ program, intake, link: linkFor(intake.originHost || hostOf(req), token), reason: 'recover' }).catch(() => {});
        }
        res.json(same);
    } catch (e) { console.warn('[programas:formulario] recuperación:', e?.message); res.json(same); }
};

// GET /public/intake/mine  (con sesión) → los envíos ligados a la cuenta
export const publicIntakeMine = async (req, res) => {
    try {
        const user = await optionalUser(req);
        if (!user) return res.json({ drafts: [] });
        res.json({ drafts: (await I.draftsByUser(user.id)).map(d => ({ publicRef: d.publicRef, programName: d.programName, programSlug: d.programSlug, status: d.status, statusLabel: INTAKE_STATES[d.status]?.label || d.status, lastSavedAt: d.lastSavedAt })) });
    } catch (e) { return fail(res, e); }
};

// POST /public/intake/mine/:ref/open  (con sesión) → un secreto nuevo para el envío propio
export const publicIntakeOpenMine = async (req, res) => {
    try {
        const user = await optionalUser(req);
        if (!user) return res.status(401).json({ error: 'Inicia sesión.' });
        const intake = await I.getIntake(String(req.params.ref || ''));
        if (!intake || intake.ownerUserId !== user.id) return res.status(404).json({ error: 'Envío no encontrado.' });
        const token = newIntakeToken();
        await I.addTokenHash(intake.id, hashIntakeToken(token));
        res.json({ token });
    } catch (e) { return fail(res, e); }
};

// ─── Archivos del envío ───────────────────────────────────────────────

// POST /public/intake/files/presign  { filename, size, purpose }
export const publicIntakePresign = async (req, res) => {
    try {
        const L = await loadByToken(req, res); if (!L) return;
        if (!INTAKE_EDITABLE.includes(L.intake.status)) return res.status(409).json({ error: 'Este envío ya está en revisión.' });
        const limits = intakeLimits();
        const filename = String(req.body?.filename || '').slice(0, 240);
        const size = Number(req.body?.size) || 0;
        const purpose = String(req.body?.purpose || '');
        const juicio = checkIntakeFile({ filename, size, purpose }, limits);
        if (!juicio.ok) return res.status(400).json({ error: juicio.errores[0], errores: juicio.errores });
        if ((await I.countFiles(L.intake.id)) >= limits.filesPerIntake) return res.status(400).json({ error: `Este envío ya tiene ${limits.filesPerIntake} archivos. Para más material, comparte un enlace o crea otro envío.` });
        if (juicio.multipart) {
            // Reanudar: el MISMO archivo con una carga a medias sigue desde sus partes.
            const prev = await I.pendingUploadFor(L.intake.id, { filename, bytes: size, purpose });
            if (prev && intakeKeyBelongs(prev.storageKey, L.program.id, L.intake.id)) {
                const done = await listUploadedParts({ key: prev.storageKey, uploadId: prev.uploadId }).catch(() => null);
                if (done) return res.json({ ok: true, mode: 'multipart', fileId: prev.id, partSize: limits.partSize, parts: Math.ceil(size / limits.partSize), done: done.map(p => p.partNumber), resumed: true });
            }
            const key = newIntakeKey(L.program.id, L.intake.id, juicio.ext);
            const { uploadId } = await startMultipart({ key, contentType: juicio.mime });
            const f = await I.createFile({ intakeId: L.intake.id, programId: L.program.id, purpose, storageKey: key, filename, contentType: juicio.mime, bytes: size, kind: juicio.kind, uploadId });
            return res.json({ ok: true, mode: 'multipart', fileId: f.id, partSize: limits.partSize, parts: Math.ceil(size / limits.partSize), done: [] });
        }
        const key = newIntakeKey(L.program.id, L.intake.id, juicio.ext);
        const { uploadUrl } = await presignSinglePut({ key, contentType: juicio.mime });
        const f = await I.createFile({ intakeId: L.intake.id, programId: L.program.id, purpose, storageKey: key, filename, contentType: juicio.mime, bytes: size, kind: juicio.kind });
        res.json({ ok: true, mode: 'single', fileId: f.id, uploadUrl, contentType: juicio.mime });
    } catch (e) { return fail(res, e); }
};

const fileOfIntake = async (L, fileId, res) => {
    const f = await I.getFile(String(fileId || ''));
    if (!f || f.intakeId !== L.intake.id || !intakeKeyBelongs(f.storageKey, L.program.id, L.intake.id)) { res.status(404).json({ error: 'Archivo no encontrado.' }); return null; }
    return f;
};

// POST /public/intake/files/parts  { fileId, partNumbers[] }
export const publicIntakeParts = async (req, res) => {
    try {
        const L = await loadByToken(req, res); if (!L) return;
        const f = await fileOfIntake(L, req.body?.fileId, res); if (!f) return;
        if (f.status !== 'uploading' || !f.uploadId) return res.status(409).json({ error: 'Esta carga ya terminó.' });
        const max = Math.ceil(Number(f.bytes) / intakeLimits().partSize);
        const nums = (Array.isArray(req.body?.partNumbers) ? req.body.partNumbers : []).map(n => Number.parseInt(n, 10)).filter(n => n >= 1 && n <= max).slice(0, 20);
        res.json({ urls: await presignParts({ key: f.storageKey, uploadId: f.uploadId, partNumbers: nums }) });
    } catch (e) { return fail(res, e); }
};

// POST /public/intake/files/complete  { fileId }  → valida el objeto REAL
export const publicIntakeComplete = async (req, res) => {
    try {
        const L = await loadByToken(req, res); if (!L) return;
        const f = await fileOfIntake(L, req.body?.fileId, res); if (!f) return;
        if (f.status === 'ready') return res.json({ ok: true, file: { id: f.id, filename: f.filename, bytes: Number(f.bytes), status: f.status, kind: f.kind, purpose: f.purpose } });
        if (f.uploadId) {
            try { await completeMultipart({ key: f.storageKey, uploadId: f.uploadId }); }
            catch (e) { return res.status(409).json({ error: `La carga no se pudo cerrar (${String(e.message).slice(0, 100)}). Reintenta: las partes ya subidas se conservan.` }); }
        }
        const ext = String(f.filename).split('.').pop().toLowerCase();
        let real;
        try { real = await inspectIntakeObject(f.storageKey, ext); } catch { return res.status(409).json({ error: 'No encontramos el archivo subido. Reintenta la carga.' }); }
        const juicio = checkIntakeFile({ filename: f.filename, size: real.bytes, purpose: f.purpose });
        if (!real.bytes || !juicio.ok || !real.format) {
            await deleteIntakeObject(f.storageKey, L.program.id, L.intake.id);
            await I.markFileDeleted(f.id);
            return res.status(400).json({ error: !real.format ? `El contenido del archivo no corresponde a un .${ext}. No se guardó.` : (juicio.errores[0] || 'Archivo no válido.') });
        }
        const row = await I.markFileReady(f.id, { bytes: real.bytes, format: real.format, contentType: real.contentType });
        res.json({ ok: true, file: { id: row.id, filename: row.filename, bytes: Number(row.bytes), status: row.status, kind: row.kind, purpose: row.purpose, format: row.format } });
    } catch (e) { return fail(res, e); }
};

// DELETE /public/intake/files/:fileId
export const publicIntakeDeleteFile = async (req, res) => {
    try {
        const L = await loadByToken(req, res); if (!L) return;
        if (!INTAKE_EDITABLE.includes(L.intake.status)) return res.status(409).json({ error: 'Este envío ya está en revisión.' });
        const f = await fileOfIntake(L, req.params.fileId, res); if (!f) return;
        if (f.uploadId) await abortMultipart({ key: f.storageKey, uploadId: f.uploadId });
        await deleteIntakeObject(f.storageKey, L.program.id, L.intake.id);
        await I.markFileDeleted(f.id);
        res.json({ ok: true });
    } catch (e) { return fail(res, e); }
};

// GET /public/intake/files/:fileId/url → lectura firmada de 2 minutos, sólo para el titular del enlace
export const publicIntakeFileUrl = async (req, res) => {
    try {
        const L = await loadByToken(req, res); if (!L) return;
        const f = await fileOfIntake(L, req.params.fileId, res); if (!f) return;
        if (f.status !== 'ready') return res.status(409).json({ error: 'El archivo todavía no terminó de cargar.' });
        res.setHeader('Cache-Control', 'no-store');
        res.json({ url: await signedIntakeUrl(f.storageKey, { filename: f.filename, contentType: f.contentType }), expiresIn: 120 });
    } catch (e) { return fail(res, e); }
};

// ════════════════════════════════════════════════════════════════════
// ADMINISTRACIÓN
// ════════════════════════════════════════════════════════════════════

async function loadProgram(req, res, ability = 'view') {
    await ensureProgramSchema();
    const program = await S.getProgram(req.params.id);
    if (!program) { res.status(404).json({ error: 'Programa no encontrado.' }); return null; }
    const scope = await resolveScope(req);
    const grant = abilitiesFor(scope, program, await contextFor(program.id, scope));
    if (!grant.can(ability)) { res.status(403).json({ error: 'No tienes acceso a este programa.' }); return null; }
    return { program, scope, grant };
}
async function loadIntake(req, res, ability = 'review') {
    const L = await loadProgram(req, res, ability); if (!L) return null;
    const intake = await I.getIntake(String(req.params.intakeId || ''));
    if (!intake || intake.programId !== L.program.id) { res.status(404).json({ error: 'Envío no encontrado.' }); return null; }
    return { ...L, intake };
}

const catalogs = () => ({
    states: INTAKE_STATES, decisions: ITEM_DECISIONS, submissionTypes: SUBMISSION_TYPES,
    sections: INTAKE_SECTIONS.map(s => ({ k: s.k, title: s.title, always: Boolean(s.always), target: s.target, landing: s.landing })),
});

// GET /admin/:id/intake-config
export const adminIntakeConfig = async (req, res) => {
    try {
        const L = await loadProgram(req, res, 'view'); if (!L) return;
        const config = shapeIntakeConfig(L.program.intakeConfig);
        res.json({
            config, form: formFor(L.program), raw: INTAKE_SECTIONS.map(s => ({
                k: s.k, title: s.title, always: Boolean(s.always), need: s.need || [], target: s.target, landing: s.landing,
                fields: s.fields.filter(f => f.t !== 'heading').map(f => ({ k: f.k, l: f.l, t: f.t, health: Boolean(f.health), clinical: Boolean(f.clinical), pub: f.pub || '', need: (s.need || []).includes(f.k), fields: f.t === 'list' ? f.fields.filter(x => x.t !== 'heading').map(x => ({ k: x.k, l: x.l, t: x.t, health: Boolean(x.health), need: (f.need || []).includes(x.k), pub: x.pub || '' })) : undefined })),
            })),
            canEdit: L.grant.can('editProgram'), formPath: `/formulario-programas?programa=${encodeURIComponent(L.program.slug)}`, catalogs: catalogs(),
        });
    } catch (e) { return fail(res, e); }
};

// PUT /admin/:id/intake-config  { config }
export const adminSaveIntakeConfig = async (req, res) => {
    try {
        const L = await loadProgram(req, res, 'editProgram'); if (!L) return;
        const config = shapeIntakeConfig(req.body?.config || {});
        const row = await S.setIntakeConfig(L.program.id, config, { actor: actorOf(req) });
        res.json({ config: shapeIntakeConfig(row.intakeConfig), form: formFor(row) });
    } catch (e) { return fail(res, e); }
};

// GET /admin/:id/intakes?status&q&page
export const adminListIntakes = async (req, res) => {
    try {
        const L = await loadProgram(req, res, 'review'); if (!L) return;
        res.json({ ...(await I.listIntakes(L.program.id, { status: String(req.query.status || ''), q: String(req.query.q || '').slice(0, 80), page: intq(req.query.page, 1), perPage: Math.min(intq(req.query.perPage, 25), 100) })), catalogs: catalogs() });
    } catch (e) { return fail(res, e); }
};

// GET /admin/:id/intakes/:intakeId → ítems con lo vigente al lado
export const adminGetIntake = async (req, res) => {
    try {
        const L = await loadIntake(req, res); if (!L) return;
        const { intake, program } = L;
        const files = await I.filesOf(intake.id);
        const items = [];
        for (const it of intakeItems(intake)) {
            let current = null;
            if (it.kind === 'fields') current = currentValuesFor(it, program);
            else if (it.ref) {
                const c = await S.getContent(it.ref);
                current = c && c.programId === program.id ? { id: c.id, title: c.title, status: c.status, data: c.data, version: c.version } : { missing: true };
            }
            items.push({ ...it, current, decision: intake.review?.[it.key] || { status: 'pendiente' } });
        }
        await S.audit({ programId: program.id, entityType: 'intake', entityId: intake.id, action: 'viewed', actor: actorOf(req), detail: { ref: intake.publicRef } });
        res.json({
            intake: { ...intake, tokenHashes: undefined }, items, form: formFor(program),
            files: files.map(f => ({ id: f.id, purpose: f.purpose, filename: f.filename, bytes: Number(f.bytes), kind: f.kind, format: f.format, status: f.status, mediaUrl: f.mediaUrl, programFileId: f.programFileId, promoteError: f.promoteError })),
            changeRequests: await I.changeRequestsOf(intake.id),
            canApply: L.grant.can('review'), canApprove: L.grant.can('approve'), catalogs: catalogs(),
        });
    } catch (e) { return fail(res, e); }
};

// POST /admin/:id/intakes/:intakeId/items  { key, status, note, sourceVerified }
export const adminDecideItem = async (req, res) => {
    try {
        const L = await loadIntake(req, res); if (!L) return;
        if (!['enviado', 'en_revision', 'aplicado'].includes(L.intake.status)) return res.status(409).json({ error: 'El envío no está en revisión.' });
        const key = String(req.body?.key || '');
        const it = intakeItems(L.intake).find(i => i.key === key);
        if (!it) return res.status(404).json({ error: 'Ítem no encontrado.' });
        if (L.intake.review?.[key]?.status === 'aplicado') return res.status(409).json({ error: 'Ese ítem ya se aplicó: su seguimiento sigue en la revisión editorial.' });
        const status = String(req.body?.status || '');
        if (!REVIEWABLE_DECISIONS.includes(status)) return res.status(400).json({ error: 'Decisión desconocida.' });
        const note = String(req.body?.note || '').trim().slice(0, 1000);
        if ((status === 'ajustes' || status === 'descartado') && note.length < 5) return res.status(400).json({ error: 'Escribe el motivo (mínimo 5 caracteres): quien envió lo verá.' });
        const needsSource = ['clinic', 'indicator', 'donation'].includes(it.target);
        if (status === 'aprobado' && needsSource && req.body?.sourceVerified !== true) return res.status(400).json({ error: 'Confirma que verificaste la fuente de este registro.' });
        const row = await I.setItemDecision(L.intake.id, key, { status, note, sourceVerified: req.body?.sourceVerified === true, dataHash: I.itemHash(it) }, { actor: actorOf(req) });
        res.json({ decision: row.review[key], status: row.status });
    } catch (e) { return fail(res, e); }
};

// POST /admin/:id/intakes/:intakeId/status  { to, note }
export const adminIntakeStatus = async (req, res) => {
    try {
        const L = await loadIntake(req, res); if (!L) return;
        const to = String(req.body?.to || '');
        const note = String(req.body?.note || '').trim().slice(0, 2000);
        if (!canTransitionIntake(L.intake.status, to)) return res.status(409).json({ error: `No se puede pasar de «${INTAKE_STATES[L.intake.status]?.label}» a «${INTAKE_STATES[to]?.label || to}».` });
        if ((to === 'ajustes' || to === 'archivado') && note.length < 5) return res.status(400).json({ error: 'Escribe el motivo (mínimo 5 caracteres).' });
        const row = await I.transitionIntake(L.intake.id, to, { actor: actorOf(req), note });
        let link = null; let emailSent = false;
        if (to === 'ajustes') {
            // Un secreto NUEVO para quien envió: el panel lo puede copiar si el correo no está configurado.
            const token = newIntakeToken();
            await I.addTokenHash(row.id, hashIntakeToken(token));
            link = linkFor(row.originHost || hostOf(req), token);
            emailSent = Boolean((await N.sendIntakeLink({ program: L.program, intake: row, link, reason: 'ajustes' }).catch(() => ({ sent: false })))?.sent);
        }
        res.json({ intake: { ...row, tokenHashes: undefined }, link, emailSent });
    } catch (e) { return fail(res, e); }
};

// POST /admin/:id/intakes/:intakeId/apply  { keys? }
export const adminApplyIntake = async (req, res) => {
    try {
        const L = await loadIntake(req, res); if (!L) return;
        if (!['en_revision', 'enviado', 'aplicado'].includes(L.intake.status)) return res.status(409).json({ error: 'Sólo se aplica un envío en revisión.' });
        const keys = Array.isArray(req.body?.keys) ? req.body.keys.map(String) : null;
        const out = await I.applyItems(L.intake.id, { keys, actor: actorOf(req), reviewerName: req.user?.name || req.user?.email || '' });
        if (!out.ok) return res.status(409).json({ error: out.error });
        const created = out.results.flatMap(r => r.changeRequests);
        if (created.some(c => c.status === 'enviado')) {
            const members = await S.listMembers(L.program.id);
            for (const c of created.filter(x => x.status === 'enviado').slice(0, 3)) {
                const cr = await S.getChangeRequest(c.id);
                N.notifyChangeSubmitted({ program: L.program, request: cr, members, host: hostOf(req) }).catch(() => {});
            }
        }
        res.json({ results: out.results, intake: { ...out.intake, tokenHashes: undefined } });
    } catch (e) { return fail(res, e); }
};

// GET /admin/:id/intakes/:intakeId/files/:fileId/url  → firmado 2 min y auditado
export const adminIntakeFileUrl = async (req, res) => {
    try {
        const L = await loadIntake(req, res); if (!L) return;
        const f = await I.getFile(String(req.params.fileId || ''));
        if (!f || f.intakeId !== L.intake.id) return res.status(404).json({ error: 'Archivo no encontrado.' });
        const sensitive = ['authorization', 'document', 'support'].includes(f.purpose);
        if (sensitive && !(L.grant.can('review') || L.grant.can('medicalApprove'))) return res.status(403).json({ error: 'Los soportes son privados.' });
        await S.audit({ programId: L.program.id, entityType: 'intake_file', entityId: f.id, action: 'downloaded', actor: actorOf(req), detail: { ref: L.intake.publicRef, purpose: f.purpose } });
        res.setHeader('Cache-Control', 'no-store');
        res.json({ url: await signedIntakeUrl(f.storageKey, { filename: f.filename, contentType: f.contentType, inline: req.query.inline !== '0' }), expiresIn: 120 });
    } catch (e) { return fail(res, e); }
};

// GET /admin/:id/media-bank → lo publicado desde envíos, con su uso sugerido
export const adminMediaBank = async (req, res) => {
    try {
        const L = await loadProgram(req, res, 'view'); if (!L) return;
        res.json({ media: await I.mediaBank(L.program.id) });
    } catch (e) { return fail(res, e); }
};

export const _internals = { optionalUser, existingRecords, openPrograms, linkFor };

export default {
    publicIntakePrograms, publicIntakeForm, publicIntakeStart, publicIntakeDraft, publicIntakeSaveMeta, publicIntakeSaveSection, publicIntakeSubmit,
    publicIntakeRecover, publicIntakeMine, publicIntakeOpenMine, publicIntakePresign, publicIntakeParts, publicIntakeComplete, publicIntakeDeleteFile, publicIntakeFileUrl,
    adminIntakeConfig, adminSaveIntakeConfig, adminListIntakes, adminGetIntake, adminDecideItem, adminIntakeStatus, adminApplyIntake, adminIntakeFileUrl, adminMediaBank,
};
