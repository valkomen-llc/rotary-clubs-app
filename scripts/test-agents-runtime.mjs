#!/usr/bin/env node
// ════════════════════════════════════════════════════════════════════
// AI Agent Command Center — Fase 2: runtime, gateway y consumo (v4.1316.0)
// npm run test:agents:runtime — sin base ni red. Corre en `prebuild`.
// ════════════════════════════════════════════════════════════════════
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const REPO = new URL('..', import.meta.url).pathname.replace(/\/$/, '');
const read = (p) => readFileSync(`${REPO}/${p}`, 'utf8');
let n = 0;
const ok = (c, m) => { assert.ok(c, m); n++; };
const eq = (a, b, m) => { assert.deepEqual(a, b, m); n++; };

const S = await import(`${REPO}/server/lib/agentRuntimeSpec.js`);
const G = await import(`${REPO}/server/lib/agentGateway.js`);
const U = await import(`${REPO}/server/lib/aiUsage.js`);

// ─── 1. Gateway: conversiones puras ───────────────────────────────────
const tools = [{ name: 'events_list', description: 'x', parameters: { type: 'object', properties: { limit: { type: 'integer' } }, required: [], additionalProperties: false } }];
const msgs = [
    { role: 'user', content: 'hola' },
    { role: 'assistant', content: '', toolCalls: [{ id: 'c1', name: 'events_list', args: { limit: 3 } }] },
    { role: 'tool', toolCallId: 'c1', name: 'events_list', content: '{"ok":true}' },
];
const gReq = G.toGeminiRequest({ system: 'S', messages: msgs, tools });
eq(gReq.systemInstruction.parts[0].text, 'S', 'Gemini: instrucción de sistema aparte');
eq(gReq.contents.map(c => c.role), ['user', 'model', 'user'], 'Gemini: roles user/model, la respuesta de herramienta vuelve como user');
ok(gReq.contents[1].parts[0].functionCall.name === 'events_list' && gReq.contents[2].parts[0].functionResponse, 'Gemini: functionCall y functionResponse');
eq(gReq.tools[0].functionDeclarations[0].parameters.type, 'OBJECT', 'Gemini: tipos en mayúscula');
ok(!('additionalProperties' in gReq.tools[0].functionDeclarations[0].parameters), 'Gemini: sin claves que rechaza');
const gRes = G.fromGeminiResponse({ candidates: [{ finishReason: 'STOP', content: { parts: [{ text: 'a' }, { functionCall: { name: 'events_list', args: { limit: 2 } } }] } }], usageMetadata: { promptTokenCount: 10, candidatesTokenCount: 5 } });
eq([gRes.text, gRes.toolCalls[0].name, gRes.usage], ['a', 'events_list', { inputTokens: 10, outputTokens: 5 }], 'Gemini: texto, llamadas y tokens');
const oReq = G.toOpenAIRequest({ model: 'gpt-4o-mini', system: 'S', messages: msgs, tools });
eq(oReq.messages.map(m => m.role), ['system', 'user', 'assistant', 'tool'], 'OpenAI: roles');
eq(oReq.messages[2].tool_calls[0].function.arguments, '{"limit":3}', 'OpenAI: argumentos como texto JSON');
eq(oReq.messages[3].tool_call_id, 'c1', 'OpenAI: respuesta enlazada a la llamada');
const oRes = G.fromOpenAIResponse({ choices: [{ finish_reason: 'tool_calls', message: { content: null, tool_calls: [{ id: 'x', function: { name: 'events_list', arguments: '{bad' } }] } }], usage: { prompt_tokens: 7, completion_tokens: 3 } });
ok(oRes.toolCalls[0].args.__invalid, 'OpenAI: argumentos ilegibles NO revientan, se marcan');
eq(oRes.usage, { inputTokens: 7, outputTokens: 3 }, 'OpenAI: tokens');
const aReq = G.toAnthropicRequest({ model: 'claude-x', system: 'S', messages: msgs, tools });
eq(aReq.system, 'S', 'Anthropic: system aparte');
eq(aReq.messages[2].content[0].type, 'tool_result', 'Anthropic: tool_result');
eq(aReq.tools[0].input_schema.type, 'object', 'Anthropic: input_schema');
const aRes = G.fromAnthropicResponse({ content: [{ type: 'text', text: 'ok' }, { type: 'tool_use', id: 't', name: 'events_list', input: {} }], usage: { input_tokens: 4, output_tokens: 2 } });
eq([aRes.text, aRes.toolCalls[0].id, aRes.usage.outputTokens], ['ok', 't', 2], 'Anthropic: texto, llamada y tokens');
{
    let calls = 0;
    const fake = async () => { calls++; throw new Error('401 inválida'); };
    const recorded = [];
    await assert.rejects(G.chatWithTools({ slug: 'gemini-2.5-flash', system: 's', messages: [], explicit: true, callImpl: fake, recordImpl: async (m) => { recorded.push(m); }, resolveImpl: async (slug) => ({ slug, provider: 'google', modelId: slug, apiKey: 'x' }) }), /401/);
    eq(recorded.map(r => r.ok), [false], 'la falla también se mide (sin tocar la base en la prueba)');
    eq(calls, 1, 'un modelo elegido a mano NO cae a otro proveedor');
    n++;
}

// ─── 2. Consumo de IA ─────────────────────────────────────────────────
eq(U.estimateCostUsd({ model: 'gpt-4o-mini', inputTokens: 1_000_000, outputTokens: 1_000_000 }).costUsd, 0.75, 'costo = tokens × precio por millón');
eq(U.estimateCostUsd({ model: 'modelo-raro', inputTokens: 10 }), { costUsd: 0, priced: false }, 'un modelo sin precio se marca, no se inventa');
eq(U.usageFromResponse('google', { usageMetadata: { promptTokenCount: 3, candidatesTokenCount: 2, thoughtsTokenCount: 1 } }), { inputTokens: 3, outputTokens: 3 }, 'Gemini: el razonamiento cuenta como salida');
eq(U.usageFromResponse('anthropic', { usage: { input_tokens: 5, output_tokens: 6 } }), { inputTokens: 5, outputTokens: 6 }, 'Anthropic: tokens');
const ctxSeen = await U.withAiContext({ feature: 'agents', siteId: 'S1' }, async () => U.withAiContext({ runId: 'R1' }, async () => U.currentAiContext()));
eq(ctxSeen, { feature: 'agents', siteId: 'S1', runId: 'R1' }, 'el contexto de atribución se anida');
eq(U.currentAiContext(), {}, 'y no se filtra fuera');

// ─── 3. Riesgo, concesiones y aprobaciones ────────────────────────────
const tool = (k) => S.toolByKey(k);
eq(S.decideToolUse({ tool: tool('events_list'), grantMode: 'read' }).decision, 'run', 'lectura con concesión de lectura: corre');
eq(S.decideToolUse({ tool: tool('content_create_news_draft'), grantMode: 'read' }).decision, 'deny', 'un borrador NO entra en «sólo lectura»');
eq(S.decideToolUse({ tool: tool('content_create_news_draft'), grantMode: 'draft' }).decision, 'run', 'borrador con concesión de borrador: corre');
eq(S.decideToolUse({ tool: tool('content_publish_news'), grantMode: 'draft' }).decision, 'deny', 'publicar NO entra en «hasta borradores»');
eq(S.decideToolUse({ tool: tool('content_publish_news'), grantMode: 'act_with_approval' }).decision, 'approval', 'publicar SIEMPRE pide aprobación (N3)');
eq(S.decideToolUse({ tool: tool('events_list'), grantMode: null }).decision, 'deny', 'sin concesión, nada');
eq(S.decideToolUse({ tool: null, grantMode: 'read' }).decision, 'deny', 'herramienta desconocida, nada');
const h1 = S.approvalHash({ tool: 'content_publish_news', args: { postId: '1', a: 2 }, siteId: 'S' });
eq(h1, S.approvalHash({ tool: 'content_publish_news', args: { a: 2, postId: '1' }, siteId: 'S' }), 'la huella no depende del orden de las claves');
ok(h1 !== S.approvalHash({ tool: 'content_publish_news', args: { postId: '2', a: 2 }, siteId: 'S' }), 'cambiar la carga cambia la huella');
ok(h1 !== S.approvalHash({ tool: 'content_publish_news', args: { postId: '1', a: 2 }, siteId: 'OTRO' }), 'cambiar el sitio cambia la huella');
for (const t of S.TOOL_CATALOG) ok(!('siteId' in (t.parameters.properties || {})) && !('clubId' in (t.parameters.properties || {})), `${t.key}: el sitio NUNCA es un argumento`);
ok(S.TOOL_CATALOG.every(t => ['N0', 'N1', 'N2', 'N3'].includes(t.risk)), 'todo riesgo es N0–N3');
ok(S.PROHIBITED.length >= 5, 'lo prohibido está enumerado');
eq(S.sanitizeToolArgs(tool('events_registration_review'), { eventId: 'E', otro: 'x', siteId: 'Z' }).args, { eventId: 'E' }, 'lo que no está en el esquema se descarta (incluido un siteId inyectado)');
ok(S.sanitizeToolArgs(tool('events_registration_review'), {}).errors.length === 1, 'falta lo obligatorio');
ok(S.canDelegate({ chain: ['a', 'b'], targetInstallationId: 'c' }).ok, 'delegar dentro del tope');
ok(!S.canDelegate({ chain: ['a', 'b', 'c'], targetInstallationId: 'd' }).ok, 'profundidad máxima 3');
ok(!S.canDelegate({ chain: ['a'], targetInstallationId: 'a' }).ok, 'no se delega a sí mismo');
eq([S.retryDelayMs(1), S.retryDelayMs(2), S.retryDelayMs(3)], [60_000, 240_000, 960_000], 'reintentos a 1, 4 y 16 minutos');
ok(S.canTransitionTask('queued', 'running') && !S.canTransitionTask('succeeded', 'queued'), 'transiciones de tareas');

// ─── 4. Programaciones (hora de Colombia) ─────────────────────────────
eq(S.parseCadence('daily@07:00'), { kind: 'daily', h: 7, min: 0 }, 'diaria');
eq(S.parseCadence('every@5'), null, 'cada 5 minutos NO (mínimo 15)');
eq(S.parseCadence('event@fair_submission.created').type, 'fair_submission.created', 'por evento');
const from = new Date('2026-11-11T13:00:00Z'); // 08:00 en Bogotá
eq(S.nextRunAt('daily@07:00', from).toISOString(), '2026-11-12T12:00:00.000Z', 'diaria 07:00 Bogotá ya pasada → mañana 12:00 UTC');
eq(S.nextRunAt('daily@09:30', from).toISOString(), '2026-11-11T14:30:00.000Z', 'diaria 09:30 Bogotá → hoy');
eq(S.nextRunAt('weekly@1@07:00', from).toISOString(), '2026-11-16T12:00:00.000Z', '2026-11-11 es miércoles → el lunes 16');
eq(S.nextRunAt('event@x.y', from), null, 'los de evento no tienen hora');
eq(S.describeCadence('weekly@5@18:00'), 'Cada viernes a las 18:00', 'descripción legible');

// ─── 5. Piloto: inscripciones ─────────────────────────────────────────
const now = new Date('2026-11-11T12:00:00Z');
const reg = (o) => ({ id: o.id, email: 'a@x.org', status: 'pending_payment', totalAmount: 100, currency: 'USD', firstName: 'A', lastName: 'B', phone: '300', createdAt: '2026-11-10T00:00:00Z', ...o });
const comp = (o) => ({ id: o.id, email: 'z@x.org', status: 'submitted', paymentMethod: 'transferencia', receiptKey: 'k', firstName: 'Z', lastName: 'Y', documentNumber: '123456', phone: '300', createdAt: '2026-11-10T00:00:00Z', ...o });
const rr = S.reviewRegistrations({
    now,
    registrations: [
        reg({ id: 'r1', email: 'dup@x.org' }),
        reg({ id: 'r2', email: 'DUP@x.org ' }),
        reg({ id: 'r3', status: 'paid', paidAt: null, stripePaymentIntentId: null, receiptUrl: null, email: 'p@x.org' }),
        reg({ id: 'r4', status: 'cancelled', email: 'dup@x.org' }),
        reg({ id: 'r5', email: 'viejo@x.org', createdAt: '2026-10-01T00:00:00Z' }),
    ],
    completed: [
        comp({ id: 'c1', receiptKey: null }),
        comp({ id: 'c2', email: 'otro@x.org', documentNumber: '123456' }),
        comp({ id: 'c3', email: 'c3@x.org', documentNumber: '999999', phone: '' }),
    ],
});
const kinds = (k) => rr.findings.filter(f => f.kind === k);
eq(kinds('possible_duplicate').length, 2, 'duplicados por correo (sin mayúsculas ni espacios) y por documento');
ok(!kinds('possible_duplicate').some(f => f.related.some(r => r.id === 'r4')), 'una inscripción cancelada no cuenta como duplicado');
eq(kinds('missing_receipt').map(f => f.registrationId), ['c1'], 'sin comprobante');
eq(kinds('payment_state_mismatch').map(f => f.registrationId), ['r3'], '«pagado» sin pago ni comprobante');
ok(kinds('stale_pending').some(f => f.registrationId === 'r5'), 'pendiente de pago hace semanas');
ok(kinds('incomplete_data').some(f => f.registrationId === 'c3'), 'datos incompletos');
eq(rr.findings[0].severity, 'high', 'lo urgente primero');
ok(rr.findings.every(f => f.registrationId && f.evidence), 'TODO hallazgo cita su fila y su evidencia');

// ─── 6. Piloto: postulaciones ─────────────────────────────────────────
const good = { id: 's1', projectName: 'Agua limpia para Tumaco', projectDescription: 'x'.repeat(220), focusArea: 'agua', budgetUsd: 15000, clubName: 'Club Uno', district: '4281', email: 'a@x.org', phone: '3001234567', status: 'paid' };
eq(S.reviewSubmission(good).complete, true, 'una postulación completa');
const bad = S.reviewSubmission({ ...good, projectDescription: 'corta', budgetUsd: 100, status: 'pending_payment' });
ok(!bad.complete && bad.missing.some(m => m.key === 'projectDescription'), 'descripción insuficiente');
ok(bad.issues.some(i => i.field === 'budgetUsd') && bad.issues.some(i => i.field === 'status'), 'presupuesto dudoso y pago informativo');
ok(bad.issues.every(i => i.field && i.evidence), 'cada observación nombra el campo');

// ─── 7. Piloto: comunicaciones ────────────────────────────────────────
ok(!S.toneReview('Rotary International anuncia que el club ganó todo, garantizado.').ok, 'hablar en nombre de RI y garantizar: se marca');
ok(S.toneReview('El Club Rotario de Pasto entregó 120 filtros de agua a familias de la vereda El Encano, con el apoyo de socios y voluntarios de la comunidad.').ok, 'un texto normal pasa');
ok(['event_registration_review', 'fair_submission_review', 'institutional_comms'].every(k => S.WORKFLOWS[k]?.pilot), 'los tres pilotos');
ok(S.PILOT_TEMPLATES.every(p => p.tools.every(([t, m]) => S.toolByKey(t) && S.GRANT_MODES[m])), 'los agentes piloto piden herramientas y modos que existen');
ok(S.PILOT_TEMPLATES.find(p => p.key === 'pilot-comunicaciones').tools.some(([t, m]) => t === 'content_publish_news' && m === 'act_with_approval'), 'el piloto de comunicaciones publica SÓLO con aprobación');

// ─── 8. Invariantes ───────────────────────────────────────────────────
const exec = read('server/lib/agentToolExecutors.js');
ok(!/args\.(siteId|clubId)/.test(exec), 'ningún ejecutor toma el sitio de los argumentos');
ok(/if \(!ctx\.approved\)/.test(exec), 'publicar exige la marca de aprobado');
const rt = read('server/lib/agentRuntimeStore.js');
ok(/FOR UPDATE SKIP LOCKED/.test(rt), 'el reclamo de tareas usa SKIP LOCKED');
ok(/approvalHash\(\{ tool: a\.tool, args: a\.args, siteId: a\.siteId \}\) !== a\.hash/.test(rt), 'al aprobar se verifica la huella');
ok(/WHERE id = \$1 AND status = 'pending' RETURNING id/.test(rt), 'aprobar es atómico: dos clics no ejecutan dos veces');
ok(/settings\.killSwitch/.test(rt), 'el interruptor general detiene la ejecución');
ok(/monthSpendUsd/.test(rt), 'el presupuesto mensual se respeta');
const router = read('server/lib/ai-router.js');
ok(/await recordAiUsage\(\{ \.\.\.meter, latencyMs: Date\.now\(\) - t0, ok: true/.test(router) && /ok: false, error: err\?\.message/.test(router), 'el enrutador mide aciertos y fallas');
const usage = read('server/lib/aiUsage.js');
ok(/Promise\.race\(\[work, new Promise/.test(usage), 'medir tiene tope de tiempo y no lanza');
const vercel = JSON.parse(read('vercel.json'));
ok(vercel.crons.some(c => c.path === '/api/cron/agents-tick' && c.schedule === '* * * * *'), 'el cron del runtime corre cada minuto');
const cron = read('server/routes/cron.js');
ok(/router\.get\('\/agents-tick'[\s\S]{0,300}CRON_SECRET/.test(cron), 'el cron exige CRON_SECRET');
for (const [file, type] of [['server/lib/completedRegistrationStore.js', 'event_registration.completed'], ['server/controllers/eventRegistrationController.js', 'event_registration.created'], ['server/controllers/projectFairController.js', 'fair_submission.created'], ['server/lib/contentSubmissionStore.js', 'content_submission.received']]) {
    ok(read(file).includes(`emitAgentEvent('${type}'`), `${type} se emite`);
}
const ev = read('server/lib/agentEvents.js');
ok(!/agentRuntimeStore|agentGateway/.test(ev), 'el emisor es liviano: no arrastra el runtime a los módulos');
const { OWNED_COLUMNS } = await import(`${REPO}/server/lib/ensureAgentCenterSchema.js`);
const guard = read('scripts/db-push-guard.mjs');
const claude = read('CLAUDE.md');
for (const t of [...Object.keys(OWNED_COLUMNS), ...Object.keys(U.OWNED_COLUMNS)]) {
    ok(guard.includes(t) && claude.includes('`' + t + '`'), `${t} protegida (guardián y CLAUDE.md)`);
}

console.log(`✓ test-agents-runtime: ${n} comprobaciones`);
