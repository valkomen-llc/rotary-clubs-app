#!/usr/bin/env node
// ════════════════════════════════════════════════════════════════════
// Video Pitch Profesional — el criterio y las invariantes (v4.1293.0)
// npm run test:video-pitch
//
// Sin base ni red: los estados y sus transiciones, el formulario (precarga,
// avance, validación), los archivos (tipo REAL por los bytes, advertencias
// que no rechazan), la estructura del guion y la auditoría de cifras de la IA,
// y las invariantes que ninguna otra barrera ve: el estado sólo cambia por
// `applyStatus`, el módulo no toca el pago ni los formularios, los permisos de
// cada ruta, el orden de las literales, el atajo del ensure y la lista de
// tablas protegidas. El recorrido completo contra Postgres y un S3 simulado
// es `npm run test:video-pitch:e2e`.
// ════════════════════════════════════════════════════════════════════
import { readFileSync } from 'node:fs';
import assert from 'node:assert/strict';
import {
    STATUSES, STORED_STATUS_KEYS, statusMeta, canTransition, participantCanEdit, bulkStatusAllowed, transitionRequirements,
    ADMIN_TRANSITIONS, summarizeRequests, normalizeAnswers, prefillFrom, completionOf, validateForSubmit, checkUploadMeta,
    sniffKind, judgeUploadedFile, qualityWarnings, sceneDurations, normalizeScript, narrationFits, notificationFor,
    requestNumber, requestsCsv, clampTargetSeconds, GUIDED_QUESTIONS, CONTEXT_TOPICS, projectContextOf,
} from '../server/lib/videoPitchSpec.js';
import { buildDossier, buildUserPrompt, parseModelJson, auditScript } from '../server/lib/videoPitchAI.js';
import { OWNED_COLUMNS } from '../server/lib/ensureVideoPitchSchema.js';
import {
    COMMERCIAL_STATUSES, DEFAULT_PLANS, normalizePlanInput, planNeedsNewVersion, planSnapshot, toStripeAmount, fromStripeAmount, readSessionOutcome,
    reusableSession, commercialStatusOf, productionGate, canChoosePlan, cardCopyOf, formatMoney, normalizeCreditsBreakdown, CREDIT_STAGES,
} from '../server/lib/videoPitchCommerce.js';

let n = 0;
const ok = (cond, msg) => { assert.ok(cond, msg); n++; console.log(`  ✓ ${msg}`); };
const read = (p) => readFileSync(new URL(`../${p}`, import.meta.url), 'utf8');

console.log('── Estados y transiciones');
ok(STATUSES.length === 13 && STORED_STATUS_KEYS.length === 12, 'trece estados visuales; doce se guardan («No solicitado» es virtual)');
ok(['draft', 'submitted', 'in_review', 'info_required', 'script_in_progress', 'script_pending_approval', 'script_approved', 'in_production', 'video_in_review', 'finished', 'delivered', 'cancelled'].every(k => STORED_STATUS_KEYS.includes(k)), 'los doce estados del pedido existen');
ok(statusMeta('info_required').label === 'Información adicional requerida', 'rótulo del pedido');
ok(canTransition('submitted', 'in_review') && !canTransition('submitted', 'delivered'), 'el comité avanza por etapas, no salta a entregado');
ok(canTransition('draft', 'submitted', { actor: 'participant' }) && !canTransition('draft', 'in_review', { actor: 'participant' }), 'el club sólo envía');
ok(canTransition('script_pending_approval', 'script_approved', { actor: 'participant' }) && canTransition('script_pending_approval', 'script_in_progress', { actor: 'participant' }), 'el club aprueba o pide ajustes al guion');
ok(!canTransition('in_production', 'delivered') && canTransition('finished', 'delivered'), 'se entrega desde «Finalizado»');
ok(Object.keys(ADMIN_TRANSITIONS).every(k => STORED_STATUS_KEYS.includes(k)) && Object.values(ADMIN_TRANSITIONS).flat().every(k => STORED_STATUS_KEYS.includes(k)), 'ninguna transición apunta a un estado inexistente');
ok(participantCanEdit('draft') && participantCanEdit('info_required') && !participantCanEdit('submitted'), 'editable sólo en borrador o cuando el comité pidió información');
ok(bulkStatusAllowed('submitted', 'in_review') && !bulkStatusAllowed('submitted', 'delivered'), 'en bloque sólo pares seguros');
ok(/guion aprobado/.test(transitionRequirements('in_production', { hasApprovedScript: false })) && transitionRequirements('in_production', { hasApprovedScript: true }) === null, 'producir exige guion aprobado');
ok(/video final/.test(transitionRequirements('delivered', { hasDeliverable: false })) && transitionRequirements('delivered', { hasDeliverable: true }) === null, 'entregar exige el video');
const kp = summarizeRequests([{ status: 'submitted' }, { status: 'info_required' }, { status: 'script_in_progress' }, { status: 'in_production' }, { status: 'delivered' }, { status: 'draft' }]);
ok(kp.total === 5 && kp.new === 1 && kp.pending_info === 1 && kp.pending_script === 1 && kp.in_production === 1 && kp.delivered === 1, 'indicadores de la bandeja (el borrador no cuenta)');

console.log('── Formulario');
const submission = { id: 's1', publicRef: 'FP-1', firstName: 'Ana', lastName: 'Ruiz', email: 'Ana@Club.org', phone: '+57 300 1234567', clubName: 'Club Valledupar', district: '4271', projectName: 'Agua limpia', projectDescription: 'Pozos para tres veredas.', focusAreaLabel: 'Agua', budgetUsd: 25000 };
const master = { identificacion: { city: 'Valledupar' }, objetivos: { generalObjective: 'Reducir enfermedades.' }, necesidades: { needs: 'No hay agua potable.', needsResponse: 'Tres pozos.', beneficiaries: 'Familias rurales', beneficiariesCount: '450 personas' }, presupuesto: { budgetTable: { projectCost: { pesos: '100000000', usd: '25000' } } } };
const pre = prefillFrom({ submission, masterAnswers: master });
ok(pre.identification.responsibleName === 'Ana Ruiz' && pre.identification.email === 'ana@club.org' && pre.identification.whatsapp === '+57 300 1234567', 'bloque A precargado desde la postulación');
ok(pre.suggestions.problem === 'No hay agua potable.' && pre.suggestions.beneficiaries.includes('450 personas') && pre.suggestions.location === 'Valledupar · 4271', 'sugerencias desde la Formulación');
ok(/100000000 COP/.test(pre.suggestions.resources) && /25.000 USD|25,000 USD/.test(pre.suggestions.resources), 'recursos: costo de la Formulación y presupuesto de la postulación');
ok(GUIDED_QUESTIONS.length === 7 && CONTEXT_TOPICS.length === 10, 'siete claves heredadas de las preguntas guiadas; diez temas de contexto');
const ctx = projectContextOf({ submission, masterAnswers: master });
ok(ctx.hasProjectContext && ctx.hasFormulation && ctx.items.some(i => i.key === 'problem' && i.value === 'No hay agua potable.'), 'el contexto que se le muestra al club sale de la postulación y la Formulación');
ok(!projectContextOf({ submission: { id: 'x' }, masterAnswers: null }).hasProjectContext, 'sin postulación descrita ni Formulación no hay contexto');
ok(normalizeAnswers({ story: { problem: 'viejo', description: '' } }).story.problem === 'viejo' && !('location' in normalizeAnswers({ story: {} }).story), 'las respuestas guiadas de un borrador anterior se conservan, pero no se crean vacías');
const empty = normalizeAnswers({});
ok(empty.story.description === '' && empty.preferences.language === '' && empty.consent.mediaAuthorization === false, 'respuestas vacías normalizadas');
ok(normalizeAnswers({ preferences: { language: 'klingon' }, consent: { mediaAuthorization: 'yes' } }).preferences.language === '' && normalizeAnswers({ consent: { mediaAuthorization: 'yes' } }).consent.mediaAuthorization === false, 'nada fuera del catálogo entra');
const full = { identification: pre.identification, story: { description: 'x'.repeat(120), problem: 'p' }, preferences: { language: 'es', objective: 'funding' }, consent: { mediaAuthorization: true } };
ok(completionOf({}) === 0 && completionOf(full, { fileCount: 0 }) > 60 && completionOf(full, { fileCount: 2 }) > completionOf(full, { fileCount: 0 }), 'el avance crece con lo obligatorio y con los materiales');
const bad = validateForSubmit({ identification: { responsibleName: 'A', email: 'nope', whatsapp: '12' }, story: { description: 'corto' }, preferences: {}, consent: {} });
ok(!bad.ok && bad.errors.length === 5 && bad.errors.some(e => e.field === 'consent.mediaAuthorization') && !bad.errors.some(e => e.field === 'story.description'), 'enviar incompleto: errores por campo, incluido el consentimiento; la información adicional NO es obligatoria');
ok(validateForSubmit({ ...full, story: { description: '' } }, { fileCount: 1, hasProjectContext: false }).warnings.some(w => /Formulación/.test(w)) && validateForSubmit({ ...full, story: { description: '' } }, { fileCount: 1, hasProjectContext: true }).warnings.length === 0, 'sin contexto del proyecto y sin información adicional se ADVIERTE, no se bloquea');
ok(validateForSubmit(full, { fileCount: 0 }).ok && validateForSubmit(full, { fileCount: 0 }).warnings.length === 1 && validateForSubmit(full, { fileCount: 1 }).warnings.length === 0, 'sin materiales se puede enviar, con advertencia');
ok(!validateForSubmit({ ...full, preferences: { language: 'es', objective: 'other' } }).ok, '«Otro» objetivo exige describirlo');

console.log('── Archivos');
ok(checkUploadMeta({ filename: 'foto.JPG', size: 10 }).ok && checkUploadMeta({ filename: 'clip.mov', size: 10 }).kind === 'video' && checkUploadMeta({ filename: 'a.pdf', size: 10 }).kind === 'document', 'JPG, MOV y PDF se admiten');
ok(!checkUploadMeta({ filename: 'a.gif', size: 10 }).ok && !checkUploadMeta({ filename: 'a.mp4', size: 0 }).ok, 'GIF no; vacío no');
ok(!checkUploadMeta({ filename: 'v.mp4', size: 600 * 1024 * 1024, env: {} }).ok && checkUploadMeta({ filename: 'v.mp4', size: 600 * 1024 * 1024, env: { VIDEO_PITCH_MAX_VIDEO_MB: '1000' } }).ok, 'el tope de video es configurable por entorno');
ok(!checkUploadMeta({ filename: 'final.jpg', size: 10, role: 'deliverable' }).ok && checkUploadMeta({ filename: 'final.mp4', size: 10, role: 'deliverable' }).ok, 'el video final sólo puede ser video');
const jpg = Buffer.concat([Buffer.from([0xFF, 0xD8, 0xFF, 0xE0]), Buffer.alloc(64, 1)]);
const png = Buffer.concat([Buffer.from([0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A]), Buffer.alloc(64, 1)]);
const mp4 = Buffer.concat([Buffer.from([0, 0, 0, 0x18]), Buffer.from('ftypisom'), Buffer.alloc(64, 1)]);
const mov = Buffer.concat([Buffer.from([0, 0, 0, 0x14]), Buffer.from('ftypqt  '), Buffer.alloc(64, 1)]);
const pdf = Buffer.concat([Buffer.from('%PDF-1.7\n'), Buffer.alloc(64, 32)]);
ok(sniffKind(jpg).ext === 'jpg' && sniffKind(png).ext === 'png' && sniffKind(mp4).ext === 'mp4' && sniffKind(mov).ext === 'mov' && sniffKind(pdf).kind === 'document', 'el tipo REAL se reconoce por los bytes');
ok(sniffKind(Buffer.from('MZ\x90\x00' + 'x'.repeat(20))) === null, 'un ejecutable no es nada admitido');
ok(judgeUploadedFile({ filename: 'a.jpg', bytes: jpg.length, head: jpg }).ok && !judgeUploadedFile({ filename: 'a.png', bytes: pdf.length, head: pdf }).ok, 'un PDF renombrado a .png se rechaza');
ok(!judgeUploadedFile({ filename: 'a.jpg', bytes: 0, head: jpg }).ok, 'el peso REAL manda: cero bytes es rechazo');
ok(qualityWarnings({ kind: 'image', width: 1080, height: 1920 }).some(w => /vertical/.test(w)), 'vertical: advierte');
ok(qualityWarnings({ kind: 'image', width: 1280, height: 720 }).some(w => /Resolución baja/.test(w)) && qualityWarnings({ kind: 'image', width: 1920, height: 1080 }).length === 0, 'baja resolución advierte; Full HD 16:9 no');
ok(qualityWarnings({ kind: 'video', width: 1920, height: 1080, durationSec: 2 }).some(w => /corto/.test(w)) && qualityWarnings({ kind: 'document' }).length === 0, 'clip muy corto advierte; un PDF no se juzga');

console.log('── Guion');
ok(sceneDurations(150).reduce((a, b) => a + b, 0) === 150 && sceneDurations(180).length === 5, 'cinco escenas que suman la duración objetivo');
ok(clampTargetSeconds(999) === 180 && clampTargetSeconds(10) === 60 && clampTargetSeconds('x') === 150, 'la duración se acota entre 1:00 y 3:00, por defecto 2:30');
const scenes = [1, 2, 3, 4, 5].map(i => ({ number: i, narration: `Narración ${i}`, materials: i === 1 ? ['f1', 'ajeno'] : [] }));
const norm = normalizeScript({ title: 'T', scenes, missingInfo: ['Cuántas personas'] }, { targetSeconds: 150, fileIds: ['f1'] });
ok(norm.ok && norm.script.scenes.length === 5 && norm.script.scenes[0].title === 'Gancho emocional' && norm.script.totalSeconds === 150, 'guion normalizado con la estructura fija y las duraciones del plan');
ok(norm.script.scenes[0].materials.join() === 'f1', 'un material que no existe NO se cita');
ok(!normalizeScript({ scenes: scenes.slice(0, 3) }).ok, 'faltan escenas: no vale');
ok(narrationFits('palabra '.repeat(60), 30).fits && !narrationFits('palabra '.repeat(120), 30).fits, 'la narración tiene que caber a 140 palabras por minuto');
const dossier = buildDossier({ request: { answers: { story: { description: 'Pozos para 450 personas en tres veredas.', beneficiaries: '450 personas' }, preferences: { objective: 'funding' } } }, submission, masterAnswers: master, files: [{ id: 'f1', role: 'material', kind: 'image', fileName: 'a.jpg' }, { id: 'f2', role: 'deliverable', kind: 'video', fileName: 'final.mp4' }] });
ok(dossier.lines.some(l => /\[postulación\]/.test(l)) && dossier.lines.some(l => /\[Formulación\]/.test(l)) && dossier.lines.some(l => /\[solicitud\]/.test(l)), 'el expediente dice la fuente de cada hecho');
ok(dossier.materials.length === 1 && dossier.materials[0].id === 'f1', 'la IA sólo ve los materiales del club, no el video final');
const prompt = buildUserPrompt({ dossier, language: 'en_sub_es', tone: 'hopeful', targetSeconds: 150, instructions: 'Menciona al club' });
ok(/narración en inglés/.test(prompt) && /INSTRUCCIONES DEL COMITÉ/.test(prompt) && /id f1/.test(prompt), 'el prompt lleva idioma hablado, instrucciones y los materiales por id');
ok(parseModelJson('```json\n{"a":1}\n```').a === 1 && parseModelJson('Aquí va: {"a":2} fin').a === 2 && parseModelJson('nada') === null, 'el JSON se extrae aunque venga envuelto');
const audit = auditScript({ scenes: [{ number: 1, narration: 'Beneficia a 450 personas con 3 pozos y 25000 USD.', onScreenText: '' }, { number: 2, narration: 'Ya llegó a 900 familias.', onScreenText: '' }] }, dossier);
ok(!audit.ok && audit.suspicious.length === 1 && audit.suspicious[0].value === '900', 'una cifra que no está en el expediente se señala; las que sí, no');
ok(notificationFor('submitted').kind === 'received' && notificationFor('in_review') === null && notificationFor('delivered').kind === 'delivered', 'avisos sólo en los hitos del pedido');
ok(requestNumber(2027, 7) === 'VP-2027-0007', 'número de solicitud');
const csv = requestsCsv([{ number: 'VP-2027-0001', projectName: 'P; uno', clubName: 'C', district: '4271', responsibleName: 'R', email: 'e', whatsapp: 'w', status: 'submitted', materialCount: 2, assigneeName: null, submittedAt: 'x', updatedAt: 'y' }]);
ok(csv.startsWith('﻿Número;Proyecto') && csv.includes('"P; uno"') && csv.includes('Solicitud enviada'), 'CSV con BOM, «;» y el estado en palabras');

console.log('── Capa comercial (v4.1296)');
ok(COMMERCIAL_STATUSES.length === 8 && DEFAULT_PLANS.length === 2 && DEFAULT_PLANS[0].priceAmount === 99 && DEFAULT_PLANS[1].priceAmount === 135, 'ocho estados comerciales; dos planes iniciales: USD 99 y USD 135');
ok(DEFAULT_PLANS[1].deliverables.join() === '16:9,9:16' && DEFAULT_PLANS[0].deliverables.join() === '16:9', 'el Integral entrega horizontal y vertical; el Esencial sólo horizontal');
ok(!DEFAULT_PLANS.some(p => p.features.some(f => /garantiza/i.test(f))) && DEFAULT_PLANS[1].features.some(f => /sujeto a sus políticas editoriales/.test(f)), 'la publicación en redes no se promete como garantizada');
ok(DEFAULT_PLANS[0].creditsIncluded === 1000 && DEFAULT_PLANS[1].creditsIncluded === 1400 && CREDIT_STAGES.length === 5, 'créditos de producción IA: 1.000 el Esencial, 1.400 el Integral; cinco etapas');
ok(DEFAULT_PLANS.every(p => normalizeCreditsBreakdown(p.creditsBreakdown).reduce((a, b) => a + b.share, 0) === 100) && normalizeCreditsBreakdown(DEFAULT_PLANS[1].creditsBreakdown).some(b => b.key === 'vertical') && !normalizeCreditsBreakdown(DEFAULT_PLANS[0].creditsBreakdown).some(b => b.key === 'vertical'), 'el reparto de cada plan suma 100 y sólo el Integral lleva la etapa vertical');
ok(normalizeCreditsBreakdown([{ key: 'script', share: 1 }, { key: 'scenes', share: 2 }, { key: 'nope', share: 9 }]).map(b => `${b.key}:${b.share}`).join() === 'script:33,scenes:67' && normalizeCreditsBreakdown([]).length === 0, 'el reparto se normaliza a 100 y descarta etapas desconocidas');
ok(planNeedsNewVersion({ ...planSnapshot({ code: 'a', name: 'A', priceAmount: 99, currency: 'USD', features: [], deliverables: ['16:9'], creditsIncluded: 1000, creditsBreakdown: [{ key: 'script', share: 100 }] }) }, { ...planSnapshot({ code: 'a', name: 'A', priceAmount: 99, currency: 'USD', features: [], deliverables: ['16:9'], creditsIncluded: 1200, creditsBreakdown: [{ key: 'script', share: 100 }] }) }), 'cambiar los créditos también crea versión: es lo que se le mostró al club');
ok(read('src/components/project-forms/VideoPitchRequestView.tsx').includes('¿Qué cubre el precio?') && read('src/components/project-forms/VideoPitchRequestView.tsx').includes('créditos de producción IA incluidos'), 'el modal explica qué cubre el precio y muestra los créditos por plan');
const np = normalizePlanInput({ code: 'Mi Plan!', name: 'X', priceAmount: '12.345', currency: 'usd', features: 'a\n\nb', deliverables: ['16:9', 'raro'], maxDurationSec: 9999, revisionRounds: -1 });
ok(np.ok && np.plan.code === 'miplan' && np.plan.priceAmount === 12.35 && np.plan.currency === 'USD' && np.plan.features.join() === 'a,b' && np.plan.deliverables.join() === '16:9' && np.plan.maxDurationSec === 600 && np.plan.revisionRounds === 0, 'un plan se normaliza: código limpio, dos decimales, características por línea, formatos conocidos, topes');
ok(!normalizePlanInput({ code: 'x', name: 'X', priceAmount: -1, deliverables: ['16:9'] }).ok && !normalizePlanInput({ code: 'x', name: 'X', priceAmount: 1, currency: 'EUR', deliverables: ['16:9'] }).ok && !normalizePlanInput({ code: 'x', name: 'X', priceAmount: 1, deliverables: [] }).ok, 'precio negativo, moneda ajena y sin formatos: rechazados');
const base = planSnapshot({ code: 'a', name: 'A', priceAmount: 99, currency: 'USD', features: ['x'], deliverables: ['16:9'], maxDurationSec: 180, revisionRounds: 3 });
ok(planNeedsNewVersion(base, { ...base, priceAmount: 100 }) && planNeedsNewVersion(base, { ...base, features: ['x', 'y'] }) && !planNeedsNewVersion(base, { ...base }), 'cambiar precio o características exige versión nueva; nada más, no');
ok(toStripeAmount(99, 'USD') === 9900 && toStripeAmount(135.5, 'USD') === 13550 && toStripeAmount(400000, 'COP') === 400000 && fromStripeAmount(9900, 'USD') === 99, 'unidad mínima de Stripe: centavos en USD, enteros en COP');
ok(formatMoney(99, 'USD') === 'USD 99' && formatMoney(135, 'USD') === 'USD 135' && /COP/.test(formatMoney(400000, 'COP')), 'importes para leer');
ok(readSessionOutcome({ status: 'complete', payment_status: 'unpaid' }) === 'unpaid' && readSessionOutcome({ status: 'complete', payment_status: 'paid' }) === 'paid' && readSessionOutcome({ status: 'expired' }) === 'expired', 'una sesión completa NO es una sesión pagada');
const open = { status: 'open', payment_status: 'unpaid', url: 'u', expires_at: Math.floor(Date.now() / 1000) + 3600, currency: 'usd', amount_total: 9900 };
ok(reusableSession(open, { amount: 99, currency: 'USD' }) && !reusableSession(open, { amount: 135, currency: 'USD' }) && !reusableSession({ ...open, currency: 'cop' }, { amount: 99, currency: 'USD' }) && !reusableSession({ ...open, expires_at: Math.floor(Date.now() / 1000) + 60 }, { amount: 99, currency: 'USD' }), 'una sesión se reutiliza sólo con el mismo importe, la misma moneda y vida suficiente');
ok(commercialStatusOf({ request: {}, order: null }) === 'no_plan' && commercialStatusOf({ request: { planId: 'p' }, order: null }) === 'plan_selected' && commercialStatusOf({ request: {}, order: { status: 'processing' } }) === 'processing' && commercialStatusOf({ request: {}, order: { status: 'paid' } }) === 'paid' && commercialStatusOf({ request: { planId: 'p' }, order: { status: 'cancelled' } }) === 'plan_selected', 'el estado comercial se deriva de la orden vigente');
ok(/pago confirmado/.test(productionGate('script_in_progress', { commercialStatus: 'pending_payment' })) && productionGate('script_in_progress', { commercialStatus: 'paid' }) === null && productionGate('script_in_progress', { commercialStatus: 'pending_payment', paymentWaived: true }) === null && productionGate('in_review', { commercialStatus: 'no_plan' }) === null, 'la compuerta: producir exige pago o exoneración; revisar no');
ok(canChoosePlan({ commercialStatus: 'pending_payment', requestStatus: 'draft' }) && !canChoosePlan({ commercialStatus: 'paid', requestStatus: 'submitted' }) && !canChoosePlan({ commercialStatus: 'no_plan', requestStatus: 'cancelled' }), 'el plan se cambia hasta pagar; nunca en una solicitud cancelada');
const cB = cardCopyOf({ exists: true, requestStatus: 'draft', commercialStatus: 'pending_payment', available: true });
ok(cB.headline === 'Tu solicitud y materiales están guardados. Solo falta completar el pago.' && cB.actions.map(a => a.key).join() === 'pay,open,plan' && cB.actions[0].label === 'Pagar Video Pitch', 'tarjeta caso B: pendiente de pago con Pagar, Completar información y Cambiar plan');
ok(cardCopyOf({ exists: true, requestStatus: 'draft', commercialStatus: 'no_plan', available: true }).actions[0].label === 'Continuar solicitud', 'tarjeta caso A: borrador');
ok(cardCopyOf({ exists: true, requestStatus: 'in_review', commercialStatus: 'paid', available: true }).headline === 'Pago confirmado. Estamos revisando la información de tu proyecto.', 'tarjeta caso C: pagado');
ok(cardCopyOf({ exists: true, requestStatus: 'in_production', commercialStatus: 'paid', available: true }).headline === 'Tu Video Pitch está en proceso de producción.', 'tarjeta caso D: en producción');
ok(cardCopyOf({ exists: true, requestStatus: 'delivered', commercialStatus: 'paid', available: true }).actions[0].label === 'Ver video' && cardCopyOf({ exists: false, requestStatus: 'not_requested', commercialStatus: 'no_plan', available: true }).actions[0].label === 'Solicitar Video Pitch', 'tarjeta caso E: entregado; y sin solicitud: «Solicitar Video Pitch»');
const commerceCtrl = read('server/controllers/videoPitchCommerceController.js');
ok((commerceCtrl.match(/SET status = 'paid'/g) || []).length === 1 && commerceCtrl.indexOf("SET status = 'paid'") > commerceCtrl.indexOf('export const applyStripeOutcome'), 'una orden se marca pagada en UN solo sitio: applyStripeOutcome, con lo que Stripe dice');
ok(/unit_amount: toStripeAmount\(order\.amount, order\.currency\)/.test(commerceCtrl) && !/req\.body\?\.amount|req\.body\.amount|body\.price/.test(commerceCtrl), 'el importe de Checkout sale de la ORDEN, nunca del cuerpo de la petición');
ok(/ON CONFLICT \("stripeEventId"\) DO NOTHING/.test(commerceCtrl), 'cada evento de Stripe se registra una vez');
ok(!/metadata: \{[^}]*submissionId/.test(commerceCtrl), 'la metadata de la sesión no lleva submissionId: no se cruza con el enrutador de la Feria');
const pay = read('server/controllers/paymentController.js');
ok(pay.includes("metadata.type === 'video_pitch_order'") && pay.includes('routeVideoPitchEvent(event, \'refunded\')') && pay.includes('routeVideoPitchEvent(event, \'expired\')'), 'el webhook único de la plataforma enruta pagos, fallos, expiraciones y reembolsos del Video Pitch');
const ensure2 = read('server/lib/ensureVideoPitchSchema.js');
ok(/WHERE status IN \('pending_payment', 'processing', 'failed'\)/.test(ensure2), 'una sola orden abierta por solicitud: lo garantiza un índice único parcial');
const viewSrc = read('src/components/project-forms/VideoPitchRequestView.tsx');
ok(viewSrc.includes('Solicitar Video Pitch') && !viewSrc.includes("'Enviar solicitud'") && viewSrc.includes('Elige tu Video Pitch Profesional') && viewSrc.includes('Guardar y pagar después') && viewSrc.includes('Pagar ahora'), 'el botón dice «Solicitar Video Pitch» y abre el modal de planes con pagar ahora o después');
ok(!/USD 99|USD 135|\$99|\$135/.test(viewSrc) && !/USD 99|USD 135|\$99|\$135/.test(read('src/components/admin/feria/VideoPitchAdmin.tsx')), 'ningún precio escrito en el frontend: vienen de la configuración');
ok(viewSrc.includes("'vp_session'") && viewSrc.includes('/checkout/sync') && viewSrc.includes('clientRevision'), 'al volver de Stripe el servidor verifica la sesión; el autoguardado manda su revisión');
const adminSrc = read('src/components/admin/feria/VideoPitchAdmin.tsx');
ok(adminSrc.includes("['commerce', 'Plan y pago', CreditCard]") && adminSrc.includes('const PlansConfig = ') && adminSrc.includes('Autorizar sin pago'), 'la ficha tiene «Plan y pago», el módulo tiene Configuración de planes y la exoneración auditada');

console.log('── Invariantes del controlador');
const ctrl = read('server/controllers/videoPitchController.js');
const requestUpdates = ctrl.match(/UPDATE "VideoPitchRequest" SET [^;]*?WHERE/g) || [];
const statusSets = (ctrl.match(/'status = \$2'/g) || []).length;
ok(requestUpdates.length > 5 && requestUpdates.every(u => !/\bstatus\s*=/.test(u)) && statusSets === 1
    && ctrl.indexOf("'status = $2'") > ctrl.indexOf('const applyStatus') && ctrl.indexOf("'status = $2'") < ctrl.indexOf('// PORTAL DEL PARTICIPANTE'),
    'el estado de la solicitud se escribe en UN solo sitio: applyStatus');
ok(!/UPDATE "ProjectFairSubmission"|UPDATE "ProjectFairMasterForm"|UPDATE "ProjectFairProjectForm"|UPDATE "ProjectFairAccount"|workflowStatus" =/.test(ctrl), 'el módulo no toca el pago, el estado del proyecto, los formularios ni la cuenta');
ok(ctrl.includes('req.portal.submissionId') && ctrl.includes('WHERE id = $1 AND "submissionId" = $2'), 'la postulación sale del token y la cuenta tiene que ser de esa postulación');
ok(!/amazonaws\.com/.test(ctrl) && !/amazonaws\.com/.test(read('src/components/project-forms/VideoPitchRequestView.tsx')) && !/amazonaws\.com/.test(read('src/components/admin/feria/VideoPitchAdmin.tsx')), 'ninguna URL fija de almacenamiento');
ok(ctrl.indexOf('judgeUploadedFile(') > 0 && ctrl.indexOf('inspectVideoPitchObject(') < ctrl.indexOf('judgeUploadedFile('), 'el archivo se juzga por el objeto REAL ya subido');
ok(/ON CONFLICT \("requestId", "dedupeKey"\) DO NOTHING RETURNING id/.test(ctrl), 'un aviso por cambio: la clave de deduplicación es única');
ok(/request\.status === 'delivered' && \(file\.id === request\.deliverableFileId/.test(ctrl), 'el club sólo ve el video cuando está ENTREGADO');
ok(/\['sent_to_participant', 'approved'\]\.includes\(s\.status\)/.test(ctrl), 'el club sólo ve los guiones que el comité le mandó o aprobó');
const cap = (name) => ctrl.match(new RegExp(`export const ${name} = withSchema\\([\\s\\S]*?\\}, '(\\w+)'\\);`))?.[1];
ok(['adminUpdate', 'adminSetStatus', 'adminBulk', 'adminPresign', 'adminRegisterFile', 'adminDeleteFile', 'adminGenerateScript', 'adminSaveScript', 'adminSetCurrentScript', 'adminSendScript', 'adminApproveScript'].every(h => cap(h) === 'changeStatus'), 'asignar, cambiar estado, guiones y archivos exigen «changeStatus»');
ok(cap('adminList') === 'view' && cap('adminGet') === 'view' && cap('adminFileUrl') === 'view' && cap('adminGetScript') === 'view', 'consultar exige «view»');
ok(cap('adminExportCsv') === 'export' && cap('adminComment') === 'comment', 'exportar exige «export»; comentar, «comment»');
ok(ctrl.trimEnd().endsWith('};') && ctrl.lastIndexOf('export default {') > ctrl.lastIndexOf('export const'), '`export default` al final del archivo');

console.log('── Rutas');
const routes = read('server/routes/project-fair.js');
const line = (frag) => routes.split('\n').find(l => l.includes(frag)) || '';
ok(['/portal/video-pitch\'', '/portal/video-pitch/submit\'', '/portal/video-pitch/files/presign\'', '/portal/video-pitch/files\'', '/portal/video-pitch/files/:fileId/url\'', '/portal/video-pitch/script/decision\'', '/portal/video-pitch/messages\''].every(p => line(p).includes('portal.portalAuth')), 'las rutas del club exigen la sesión del panel');
ok(['/admin/video-pitch\'', '/admin/video-pitch/export.csv\'', '/admin/video-pitch/:id\'', '/admin/video-pitch/:id/files/:fileId/url\''].every(p => line(p).includes('authMiddleware') && line(p).includes('fairRead')), 'las de lectura exigen sesión y acceso al módulo');
ok(['/admin/video-pitch/bulk\'', '/admin/video-pitch/:id/status\'', '/admin/video-pitch/:id/scripts/generate\'', '/admin/video-pitch/:id/scripts/:scriptId/approve\''].every(p => line(p).includes('authMiddleware') && line(p).includes('fairEdit')), 'las de gestión exigen sesión y edición del módulo');
ok(routes.indexOf("'/admin/video-pitch/export.csv'") < routes.indexOf("'/admin/video-pitch/:id'") && routes.indexOf("'/admin/video-pitch/bulk'") < routes.indexOf("'/admin/video-pitch/:id'"), 'las literales van antes de la paramétrica');

console.log('── Esquema y tablas protegidas');
const ensure = read('server/lib/ensureVideoPitchSchema.js');
const adds = [...ensure.matchAll(/ALTER TABLE "(\w+)" ADD COLUMN IF NOT EXISTS "?(\w+)"?/g)].map(m => `${m[1]}.${m[2]}`);
const owned = Object.entries(OWNED_COLUMNS).flatMap(([t, c]) => c.map(x => `${t}.${x}`));
ok(adds.every(a => owned.includes(a)) && owned.every(o => adds.includes(o)), 'todo ADD COLUMN del ensure está enumerado en OWNED_COLUMNS (y viceversa)');
const claude = read('CLAUDE.md');
const guard = read('scripts/db-push-guard.mjs');
for (const t of Object.keys(OWNED_COLUMNS)) ok(claude.includes(`\`${t}\``) && guard.includes(t), `${t}: en la lista del guardián de db:push y de CLAUDE.md`);
ok(claude.includes('docs/claude/video-pitch.md') && read('docs/claude/video-pitch.md').length > 2000, 'el módulo tiene su archivo en docs/claude y está en la tabla');

console.log('── «Mi proyecto»');
const mp = read('src/pages/MiProyecto.tsx');
const grid = mp.slice(mp.indexOf('Formularios y recursos del proyecto'));
const iNext = grid.indexOf('<NextStepCard');
const iVp = grid.indexOf('<VideoPitchCard');
const iClose = grid.indexOf('</div>', grid.indexOf('forms.map(form => <FormCardTile'));
ok(iNext > 0 && iNext < iVp && iVp < iClose, 'la tarjeta de Video Pitch cierra la cuadrícula, después de la plantilla y de 31A');
ok(!read('src/components/project-forms/VideoPitchCard.tsx').includes('sm:col-span-2') && mp.indexOf('<ProjectVideoCard') < mp.indexOf('<VideoPitchCard'), 'una columna, al lado de la tarjeta del video propio (v4.1298)');
ok(mp.includes("get('videoPitch') === '1'") && mp.includes('<VideoPitchRequestView'), 'la solicitud vive en la URL (?videoPitch=1) y se abre a pantalla completa');
const view = read('src/components/project-forms/VideoPitchRequestView.tsx');
ok(!/^\s+const [A-Z]\w* = \(\{[^)]*\}\) => \(?\s*</m.test(view.slice(view.indexOf('const VideoPitchRequestView'))), 'ningún componente declarado dentro de la vista');
ok(/setTimeout\(\(\) => \{ save\(true\); \}, 3000\)/.test(view), 'autoguardado tres segundos después de dejar de escribir');
ok(view.includes('Confirmo que el club cuenta con autorización'), 'consentimiento sobre los materiales, junto a la carga');
ok(!view.includes('vp-q-') && view.includes('Lo que ya sabemos de tu proyecto') && view.includes('Información adicional para el video'), 'el bloque B es UN campo opcional, con el contexto del proyecto en sólo lectura (v4.1295)');
const admin = read('src/components/admin/feria/VideoPitchAdmin.tsx');
ok(!/^\s+const [A-Z]\w* = \(\{[^)]*\}\) => \(?\s*</m.test(admin.slice(admin.indexOf('const VideoPitchAdmin = '))), 'ningún componente declarado dentro de la bandeja');
ok(read('src/pages/admin/PostulacionesPagos.tsx').includes("['videopitch', 'Videos de proyectos', Clapperboard]") && read('src/components/admin/AdminLayout.tsx').includes("path: '/admin/postulaciones-pagos?tab=videopitch'"), 'pestaña «Videos de proyectos» (que monta el Video Pitch) y entrada en el menú lateral');

console.log(`\n✅ ${n} comprobaciones, todas en verde.`);
