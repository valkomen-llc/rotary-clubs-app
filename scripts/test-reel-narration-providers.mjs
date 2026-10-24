#!/usr/bin/env node
// ════════════════════════════════════════════════════════════════════
// LA VOZ EN OFF: proveedores, diagnóstico y respaldo.  npm run test:reels:voice
// v4.1236.0
//
// Cierra el reporte «No se pudo generar la narración. Revisá los avisos del
// Reel»: cada fallo de un motor de voz tiene que salir con SU código y SU
// motivo, el respaldo tiene que obedecer a la política (no a un reflejo) y la
// síntesis tiene que medirse de punta a punta con un MP3 real.
//
// NO necesita base, credenciales ni red: `fetch` se reemplaza por un doble que
// contesta como ElevenLabs y OpenAI contestan de verdad (cuerpos de error
// copiados de su documentación), y el MP3 lo fabrica el propio ffmpeg-static.
// ════════════════════════════════════════════════════════════════════
import { readFileSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';

// Las variables se fijan ANTES de importar: el tope de tiempo se lee al cargar.
process.env.REEL_TTS_TIMEOUT_MS = '300';
process.env.ELEVENLABS_API_KEY = 'xi-test-key';
process.env.OPENAI_API_KEY = 'sk-test-key';
delete process.env.ELEVENLABS_MODEL;
delete process.env.OPENAI_TTS_MODEL;
delete process.env.REEL_TTS_PROVIDER;
delete process.env.REEL_TTS_AUTO_FALLBACK;

const N = await import('../server/lib/reelNarration.js');

let total = 0, passed = 0;
const check = (desc, ok, extra = '') => {
    total++;
    if (ok) { passed++; console.log(`  OK    ${desc}`); }
    else { console.error(`  FAIL  ${desc}${extra ? ` — ${extra}` : ''}`); process.exitCode = 1; }
};
const expectError = async (fn) => { try { await fn(); return null; } catch (e) { return e; } };

// ─── Doble de `fetch` ──────────────────────────────────────────────────────
const realFetch = globalThis.fetch;
let calls = [];
let routes = [];
const respond = (status, body, type = 'application/json') =>
    new Response(typeof body === 'string' || body instanceof Uint8Array ? body : JSON.stringify(body), { status, headers: { 'content-type': type } });
globalThis.fetch = async (url, init = {}) => {
    const u = String(url);
    const body = init.body ? JSON.parse(init.body) : null;
    calls.push({ url: u, body, headers: init.headers || {} });
    for (const r of routes) {
        if (r.match(u)) return r.reply({ url: u, body, init });
    }
    throw new TypeError(`fetch failed (sin ruta para ${u})`);
};
const reset = (...r) => { calls = []; routes = r; };
// La llamada de SÍNTESIS (ElevenLabs puede leer antes las voces de la cuenta).
const ttsCall = () => calls.find(c => /text-to-speech|audio\/speech/.test(c.url));
const audio = Buffer.alloc(4096, 7);
const OK_EL = { match: u => u.includes('api.elevenlabs.io/v1/text-to-speech'), reply: () => respond(200, audio, 'audio/mpeg') };
const OK_OA = { match: u => u.includes('api.openai.com/v1/audio/speech'), reply: () => respond(200, audio, 'audio/mpeg') };
const FAIL = (host, status, body) => ({ match: u => u.includes(host), reply: () => respond(status, body) });

console.log('\n▸ Clasificación de los errores reales de cada proveedor');
{
    const c = (p, s, b) => N.classifyTtsFailure(p, s, typeof b === 'string' ? b : JSON.stringify(b));
    check('OpenAI 401 → auth', c('openai', 401, { error: { message: 'Incorrect API key provided: sk-proj-abcd****wxyz.', type: 'invalid_request_error', code: 'invalid_api_key' } }).code === 'auth');
    check('OpenAI 401 → el mensaje NO lleva el fragmento de la clave',
        !/sk-proj-abcd/.test(c('openai', 401, { error: { message: 'Incorrect API key provided: sk-proj-abcd****wxyz.', code: 'invalid_api_key' } }).message));
    check('OpenAI 429 insufficient_quota → quota (no «demasiadas solicitudes»)', c('openai', 429, { error: { message: 'You exceeded your current quota', type: 'insufficient_quota', code: 'insufficient_quota' } }).code === 'quota');
    check('OpenAI 429 «no credits remaining» → quota, no «esperá y reintentá» (el caso de producción, v4.1237)',
        c('openai', 429, { error: { message: 'You have no credits remaining. Add credits to continue using the API at https://platform.openai.com/settings/organization/billing/.', type: 'insufficient_quota' } }).code === 'quota'
        && c('openai', 429, { error: { message: 'You have no credits remaining. Add credits to continue using the API.' } }).code === 'quota');
    check('OpenAI 429 rate_limit_exceeded → rate_limit', c('openai', 429, { error: { message: 'Rate limit reached', code: 'rate_limit_exceeded' } }).code === 'rate_limit');
    check('OpenAI 404 modelo → model_unsupported', c('openai', 404, { error: { message: 'The model `tts-9` does not exist', code: 'model_not_found' } }).code === 'model_unsupported');
    check('OpenAI 400 voz inválida → voice_not_found', c('openai', 400, { error: { message: "Invalid value for 'voice': 'xyz'." } }).code === 'voice_not_found');
    check('ElevenLabs 401 quota_exceeded → quota', c('elevenlabs', 401, { detail: { status: 'quota_exceeded', message: 'This request exceeds your quota of 10000.' } }).code === 'quota');
    check('ElevenLabs 401 invalid_api_key → auth', c('elevenlabs', 401, { detail: { status: 'invalid_api_key', message: 'Invalid API key' } }).code === 'auth');
    const perm = c('elevenlabs', 401, { detail: { status: 'missing_permissions', message: 'The API key you used is missing the permission text_to_speech' } });
    check('ElevenLabs 401 missing_permissions → auth, y dice qué permiso', perm.code === 'auth' && /Text to Speech/.test(perm.message));
    check('ElevenLabs 401 detected_unusual_activity → auth con motivo propio', /actividad inusual/.test(c('elevenlabs', 401, { detail: { status: 'detected_unusual_activity', message: 'Unusual activity detected. Free Tier usage disabled.' } }).message));
    check('ElevenLabs 404 voice_not_found → voice_not_found', c('elevenlabs', 404, { detail: { status: 'voice_not_found', message: 'A voice with the voice_id abc was not found.' } }).code === 'voice_not_found');
    check('ElevenLabs 422 de validación (detail como lista) → bad_request con el detalle', (() => {
        const e = c('elevenlabs', 422, { detail: [{ loc: ['body', 'text'], msg: 'field required', type: 'value_error.missing' }] });
        return e.code === 'bad_request' && /field required/.test(e.message);
    })());
    check('ElevenLabs 500 → provider_down', c('elevenlabs', 500, 'Internal Server Error').code === 'provider_down');
    check('Todo código tiene rótulo y estado HTTP', Object.values(N.TTS_ERRORS).every(t => t.label && t.status));
}

console.log('\n▸ La petición a ElevenLabs');
{
    reset(OK_EL);
    await N.synthesize({ text: 'Hola comunidad.', provider: 'elevenlabs', language: 'es-CO' });
    check('con eleven_multilingual_v2 NO manda language_code (el modelo no lo admite)', ttsCall() && !('language_code' in ttsCall().body));
    check('pide MP3 explícito y codifica el id de la voz', /output_format=mp3_44100_128/.test(ttsCall().url));
    process.env.ELEVENLABS_MODEL = 'eleven_turbo_v2_5';
    reset(OK_EL);
    await N.synthesize({ text: 'Hola comunidad.', provider: 'elevenlabs', language: 'es-CO' });
    check('con eleven_turbo_v2_5 SÍ manda language_code = es', ttsCall()?.body?.language_code === 'es');
    delete process.env.ELEVENLABS_MODEL;
}

console.log('\n▸ La voz elegida a mano');
{
    reset(OK_OA);
    const out = await N.synthesize({ text: 'Hola.', provider: 'openai', voiceId: 'coral' });
    check('OpenAI recibe la voz elegida', calls[0]?.body?.voice === 'coral' && out.voiceId === 'coral');
    check('OpenAI con tts-1 recibe velocidad acotada', calls[0]?.body?.speed === 1 && calls[0]?.body?.model === 'tts-1');
    reset(OK_OA);
    const bad = await expectError(() => N.synthesize({ text: 'Hola.', provider: 'openai', voiceId: 'no-existe', fallback: false }));
    check('una voz que OpenAI no tiene → voice_not_found SIN llamar al proveedor', bad?.code === 'voice_not_found' && calls.length === 0);
    process.env.OPENAI_TTS_MODEL = 'gpt-4o-mini-tts';
    reset(OK_OA);
    await N.synthesize({ text: 'Hola.', provider: 'openai', language: 'es-CO', style: 'institucional' });
    check('con gpt-4o-mini-tts pide el acento por instrucciones', /Colombian/.test(calls[0]?.body?.instructions || '') && !('speed' in calls[0].body));
    delete process.env.OPENAI_TTS_MODEL;
}

console.log('\n▸ Política de respaldo');
{
    const quotaEL = FAIL('api.elevenlabs.io', 401, { detail: { status: 'quota_exceeded', message: 'This request exceeds your quota.' } });

    reset(quotaEL, OK_OA);
    const e1 = await expectError(() => N.synthesize({ text: 'Hola.', provider: 'elevenlabs', fallback: false }));
    check('fallback:false → devuelve el fallo de ElevenLabs con su código', e1?.code === 'quota' && e1?.provider === 'elevenlabs');
    check('fallback:false → NO gasta una síntesis en OpenAI', !calls.some(c => c.url.includes('openai')));

    reset(quotaEL, OK_OA);
    const r2 = await N.synthesize({ text: 'Hola.', provider: 'elevenlabs', fallback: true });
    check('fallback:true → sale con OpenAI y dice de dónde venía', r2.provider === 'openai' && r2.fallbackFrom === 'elevenlabs' && r2.fallbackCode === 'quota');
    check('fallback:true → un solo intento de respaldo', calls.filter(c => c.url.includes('openai')).length === 1);

    reset(quotaEL, FAIL('api.openai.com', 429, { error: { message: 'You exceeded your current quota', code: 'insufficient_quota' } }));
    const e3 = await expectError(() => N.synthesize({ text: 'Hola.', provider: 'elevenlabs', fallback: true }));
    check('si el respaldo también falla, se informan LOS DOS', e3?.code === 'quota' && e3?.fallbackError?.provider === 'openai' && /respaldo con OpenAI TTS también falló/.test(e3.message));

    reset(quotaEL, OK_OA);
    const r4 = await N.synthesize({ text: 'Hola.', provider: 'elevenlabs' });
    check('fallback ausente → manda REEL_TTS_AUTO_FALLBACK (encendido por defecto)', r4.provider === 'openai');
    process.env.REEL_TTS_AUTO_FALLBACK = 'off';
    reset(quotaEL, OK_OA);
    const e5 = await expectError(() => N.synthesize({ text: 'Hola.', provider: 'elevenlabs' }));
    check('REEL_TTS_AUTO_FALLBACK=off apaga el respaldo automático', e5?.code === 'quota');
    delete process.env.REEL_TTS_AUTO_FALLBACK;

    const savedKey = process.env.ELEVENLABS_API_KEY;
    delete process.env.ELEVENLABS_API_KEY;
    reset(OK_OA);
    const e6 = await expectError(() => N.synthesize({ text: 'Hola.', provider: 'elevenlabs', fallback: false }));
    check('elegir un motor sin credencial → not_configured nombrando la variable (antes se cambiaba en silencio)',
        e6?.code === 'not_configured' && /ELEVENLABS_API_KEY/.test(e6.message) && calls.length === 0);
    process.env.ELEVENLABS_API_KEY = savedKey;

    const e7 = await expectError(() => N.synthesize({ text: '   ', provider: 'openai' }));
    check('guion vacío → empty_script, sin llamar a nadie', e7?.code === 'empty_script');
}

console.log('\n▸ Tiempo, conexión y respuestas vacías');
{
    reset({ match: u => u.includes('openai'), reply: ({ init }) => new Promise((_, rej) => init.signal.addEventListener('abort', () => rej(init.signal.reason))) });
    // `AbortSignal.timeout` usa un temporizador que no retiene el proceso: en
    // el servidor lo retiene Express; acá, un intervalo mientras dura la prueba.
    const keepAlive = setInterval(() => { }, 50);
    const t = await expectError(() => N.synthesize({ text: 'Hola.', provider: 'openai', fallback: false }));
    clearInterval(keepAlive);
    check('un proveedor colgado corta por tiempo → timeout', t?.code === 'timeout', t?.message);

    reset();
    const n = await expectError(() => N.synthesize({ text: 'Hola.', provider: 'openai', fallback: false }));
    check('sin red → network', n?.code === 'network');

    reset({ match: u => u.includes('openai'), reply: () => respond(200, Buffer.alloc(10), 'audio/mpeg') });
    const v = await expectError(() => N.synthesize({ text: 'Hola.', provider: 'openai', fallback: false }));
    check('un 200 sin audio → empty_audio', v?.code === 'empty_audio');
}

console.log('\n▸ De punta a punta: guion → síntesis → MP3 REAL → medición');
{
    const ffmpeg = (await import('ffmpeg-static')).default;
    const { measureAudioDuration } = await import('../server/lib/reelFfmpeg.js');
    const dir = mkdtempSync(path.join(tmpdir(), 'voz-'));
    const mp3 = path.join(dir, 'voz.mp3');
    const gen = spawnSync(ffmpeg, ['-y', '-f', 'lavfi', '-i', 'sine=frequency=220:duration=12.6', '-ac', '1', '-b:a', '64k', mp3]);
    if (gen.status !== 0) {
        check('ffmpeg fabrica un MP3 de prueba', false, String(gen.stderr).slice(-200));
    } else {
        const real = readFileSync(mp3);
        reset({ match: u => u.includes('openai'), reply: () => respond(200, real, 'audio/mpeg') });
        const fitted = await N.fitNarrationToDuration({
            scenes: [], durationSec: 15, language: 'es-CO', style: 'institucional',
            ttsProvider: 'openai', voiceId: 'nova', fallback: false,
            scriptOverride: 'En Ibagué, los clubes se unieron en una jornada de juegos tradicionales.',
            measureAudio: measureAudioDuration
        });
        check('mide el archivo REAL (12,6 s ± 0,15)', Math.abs(fitted.actualSec - 12.6) < 0.15, String(fitted.actualSec));
        check('el guion aprobado no se reescribe (un solo intento, cero llamadas de texto)', fitted.attempts.length === 1 && calls.length === 1);
        check('devuelve proveedor, modelo y voz para el registro', fitted.ttsProvider === 'openai' && fitted.ttsModel === 'tts-1' && fitted.voiceId === 'nova');
        check('el búfer devuelto es el MP3 del proveedor', Buffer.compare(fitted.audioBuffer, real) === 0);

        reset({ match: u => u.includes('openai'), reply: () => respond(200, Buffer.alloc(4096, 1), 'audio/mpeg') });
        const m = await expectError(() => N.fitNarrationToDuration({
            scenes: [], durationSec: 15, ttsProvider: 'openai', fallback: false,
            scriptOverride: 'Hola.', measureAudio: measureAudioDuration
        }));
        check('un audio que ffmpeg no puede leer → measure_failed (no un error genérico)', m?.code === 'measure_failed', m?.message);
    }
    rmSync(dir, { recursive: true, force: true });
}

console.log('\n▸ Estado de los proveedores (llamadas de lectura, sin síntesis)');
{
    reset(
        { match: u => u.endsWith('/v1/user/subscription'), reply: () => respond(200, { character_count: 9500, character_limit: 10000, next_character_count_reset_unix: 1800000000, tier: 'starter' }) },
        { match: u => u.endsWith('/v1/voices'), reply: () => respond(200, { voices: [
            { voice_id: 'abcColombia1', name: 'Valentina', labels: { accent: 'colombian', gender: 'female', language: 'es' }, category: 'professional' },
            { voice_id: '21m00Tcm4TlvDq8ikWAM', name: 'Rachel', labels: { accent: 'american', gender: 'female' }, category: 'premade' },
            { voice_id: 'onwK4e9ZLuTAKqWW03F9', name: 'Daniel', labels: { accent: 'british', gender: 'male' }, category: 'premade' }
        ] }) },
        FAIL('api.openai.com/v1/models', 401, { error: { message: 'Incorrect API key provided', code: 'invalid_api_key' } })
    );
    const [el, oa] = await N.ttsProvidersStatus({ force: true });
    check('ElevenLabs: conectado con la cuota que informa', el.state === 'ok' && el.quota?.remaining === 500 && el.quota?.limit === 10000);
    check('ElevenLabs: lista las voces de la cuenta, latinas primero', el.voices[0]?.id === 'abcColombia1' && el.voices.length === 3);
    check('ElevenLabs: dice cuántas voces hispanas hay', /Una voz con acento hispano/.test(el.accentNote || ''));
    check('OpenAI con credencial rechazada: estado auth y voces del catálogo', oa.state === 'auth' && oa.voices.length === 9);
    check('ninguna llamada de estado sintetiza', !calls.some(c => /text-to-speech|audio\/speech/.test(c.url)));

    N.resetTtsCaches();
    reset({ match: u => u.endsWith('/v1/user/subscription'), reply: () => respond(200, { character_count: 10000, character_limit: 10000 }) },
        { match: u => u.endsWith('/v1/voices'), reply: () => respond(401, { detail: { status: 'missing_permissions' } }) });
    const q = await N.checkTtsProvider('elevenlabs', { force: true });
    check('ElevenLabs con la cuota agotada → estado quota, antes de gastar nada', q.state === 'quota');
    check('sin permiso para listar voces, ofrece las voces por defecto', q.voices.length === 2);

    const saved = process.env.OPENAI_API_KEY;
    delete process.env.OPENAI_API_KEY;
    const nc = await N.checkTtsProvider('openai', { force: true });
    check('sin credencial → not_configured, sin llamar al proveedor', nc.state === 'not_configured' && /OPENAI_API_KEY/.test(nc.message));
    process.env.OPENAI_API_KEY = saved;

    const cached = await N.checkTtsProvider('elevenlabs');
    check('el estado se cachea (abrir diez fichas no son veinte llamadas)', cached === q);
}

console.log('\n▸ La voz automática de ElevenLabs sale de la cuenta (v4.1237)');
{
    const cuenta = [
        { id: 'enMale00001', label: 'Daniel', gender: 'male', accent: 'british', language: 'en', locales: [] },
        { id: 'esFem000001', label: 'Lucía', gender: 'female', accent: 'castilian', language: 'es', locales: ['es-ES'] },
        { id: 'coFem000001', label: 'Valentina', gender: 'female', accent: 'colombian', language: 'es', locales: ['es-CO'] },
        { id: 'mxMale00001', label: 'Mateo', gender: 'male', accent: 'mexican', language: 'es', locales: ['es-MX'] }
    ];
    check('femenina + Español · Colombia → la voz colombiana', N.pickAccountVoice(cuenta, { gender: 'female', language: 'es-CO' })?.id === 'coFem000001');
    check('femenina + Español · España → la castellana', N.pickAccountVoice(cuenta, { gender: 'female', language: 'es-ES' })?.id === 'esFem000001');
    check('masculina + Colombia → un hombre hispanohablante, nunca una mujer por el acento', N.pickAccountVoice(cuenta, { gender: 'male', language: 'es-CO' })?.id === 'mxMale00001');
    check('sin voces → null', N.pickAccountVoice([], { gender: 'female' }) === null);

    // Sin elegir voz, ElevenLabs tiene que pedir la colombiana de la cuenta,
    // no la Rachel fija de v4.1236.
    N.resetTtsCaches();
    const VOCES = { match: u => u.endsWith('/v1/voices'), reply: () => respond(200, { voices: [
        { voice_id: '21m00Tcm4TlvDq8ikWAM', name: 'Rachel', labels: { accent: 'american', gender: 'female' } },
        { voice_id: 'abcColombia1', name: 'Sara', labels: { gender: 'female' }, verified_languages: [{ language: 'es', accent: 'colombian', locale: 'es-CO' }] }
    ] }) };
    reset(VOCES, OK_EL);
    const out = await N.synthesize({ text: 'Hola.', provider: 'elevenlabs', gender: 'female', language: 'es-CO', fallback: false });
    check('sin voz elegida, ElevenLabs usa la mejor voz de la CUENTA (idioma verificado es-CO)', /text-to-speech\/abcColombia1\?/.test(ttsCall()?.url || '') && out.voiceId === 'abcColombia1', ttsCall()?.url);
    reset(VOCES, OK_EL);
    await N.synthesize({ text: 'Hola.', provider: 'elevenlabs', gender: 'female', language: 'es-CO', fallback: false });
    check('las voces de la cuenta se cachean: la segunda síntesis no las vuelve a pedir', !calls.some(c => c.url.endsWith('/v1/voices')));
    process.env.ELEVENLABS_VOICE_FEMALE = 'envVoice0001';
    reset(OK_EL);
    await N.synthesize({ text: 'Hola.', provider: 'elevenlabs', gender: 'female', fallback: false });
    check('una voz fijada por entorno manda sobre la elección automática', /text-to-speech\/envVoice0001\?/.test(ttsCall()?.url || ''));
    delete process.env.ELEVENLABS_VOICE_FEMALE;
}

console.log('\n▸ Voz de la Biblioteca que el plan no admite → voz propia de la cuenta (v4.1238)');
{
    const lib = N.classifyTtsFailure('elevenlabs', 402, JSON.stringify({ detail: { status: 'payment_required', message: 'Free users cannot use library voices via the API. Please upgrade your subscription to use this voice.' } }), { voiceId: 'libCO0000001' });
    check('se clasifica como voz no disponible, no como «sin saldo»', lib.code === 'voice_not_found' && /Biblioteca de voces/.test(lib.message));

    N.resetTtsCaches();
    const VOCES = { match: u => u.endsWith('/v1/voices'), reply: () => respond(200, { voices: [
        { voice_id: 'libCO0000001', name: 'Sara', category: 'professional', labels: { gender: 'female' }, verified_languages: [{ language: 'es', accent: 'colombian', locale: 'es-CO' }] },
        { voice_id: 'ownES0000001', name: 'Lucía', category: 'generated', labels: { gender: 'female', language: 'es', accent: 'latin american' } },
        { voice_id: 'premadeEN001', name: 'Rachel', category: 'premade', labels: { gender: 'female', accent: 'american' } }
    ] }) };
    const LIB_REJECT = { match: u => u.includes('/text-to-speech/libCO0000001'), reply: () => respond(402, { detail: { status: 'payment_required', message: 'Free users cannot use library voices via the API.' } }) };
    reset(VOCES, LIB_REJECT, OK_EL);
    const out = await N.synthesize({ text: 'Hola.', provider: 'elevenlabs', gender: 'female', language: 'es-CO', fallback: false });
    check('la automática rechazada se reintenta UNA vez con la mejor voz propia hispana', out.voiceId === 'ownES0000001'
        && calls.filter(c => c.url.includes('/text-to-speech/')).length === 2, calls.map(c => c.url).join(' '));
    reset(VOCES, LIB_REJECT, OK_EL);
    await N.synthesize({ text: 'Hola.', provider: 'elevenlabs', gender: 'female', language: 'es-CO', fallback: false });
    check('desde ahí «Automática» va directo a las propias (no vuelve a gastar un intento fallido)', calls.filter(c => c.url.includes('/text-to-speech/')).length === 1 && /ownES0000001/.test(ttsCall()?.url || ''));
    reset(VOCES, LIB_REJECT, OK_EL);
    const elegida = await expectError(() => N.synthesize({ text: 'Hola.', provider: 'elevenlabs', voiceId: 'libCO0000001', fallback: false }));
    check('una voz elegida A MANO no se cambia en silencio: se informa', elegida?.code === 'voice_not_found');
}

console.log('\n▸ «Verificar conexión» sintetiza de verdad (v4.1238)');
{
    N.resetTtsCaches();
    reset({ match: u => u.includes('openai'), reply: () => respond(429, { error: { message: 'You have no credits remaining. Add credits to continue using the API.' } }) });
    const p1 = await N.probeTtsProvider('openai');
    check('OpenAI sin saldo → la prueba falla con quota', !p1.ok && p1.code === 'quota');
    check('la prueba cuesta 5 caracteres y una sola llamada', p1.chars === 5 && calls.length === 1 && calls[0].body.input === 'Hola.');
    reset(OK_OA);
    const p2 = await N.probeTtsProvider('openai');
    check('con saldo → ok, con modelo y voz', p2.ok && p2.model === 'tts-1' && p2.voiceId === 'nova');
    reset({ match: u => u.includes('openai'), reply: () => respond(429, { error: { message: 'no credits' } }) }, OK_EL);
    await N.probeTtsProvider('openai');
    check('la prueba nunca usa el respaldo (probaría el otro motor)', !calls.some(c => c.url.includes('elevenlabs')));
}

console.log('\n▸ «Conectado» no es «con saldo»: el último intento real cuenta (v4.1237)');
{
    const C = await import('../server/controllers/reelController.js');
    const ok = { id: 'openai', state: 'ok', message: 'Conectado (modelo tts-1).' };
    const sinSaldo = C.withRecentOutcome(ok, { status: 'error', code: 'quota', detail: 'quota: OpenAI TTS rechazó la locución por límite de consumo', createdAt: new Date().toISOString() });
    check('un fallo de cuota reciente vuelve la tarjeta «Sin cuota»', sinSaldo.state === 'quota' && sinSaldo.lastFailure?.code === 'quota' && !/^quota:/.test(sinSaldo.lastFailure.message));
    const viejo429 = C.withRecentOutcome(ok, { status: 'error', code: 'rate_limit', detail: 'rate_limit: … «You have no credits remaining. Add credits…»', createdAt: new Date().toISOString() });
    check('los intentos que v4.1236 anotó como rate_limit por «no credits» también cuentan', viejo429.state === 'quota');
    check('un éxito posterior lo borra', C.withRecentOutcome(ok, { status: 'ok', code: null }).state === 'ok');
    check('un fallo transitorio (timeout) no bloquea la tarjeta', C.withRecentOutcome(ok, { status: 'error', code: 'timeout', detail: 'x' }).state === 'ok');
    const recargado = C.withProbe(sinSaldo, { ok: true, provider: 'openai', model: 'tts-1', voiceId: 'nova' });
    check('una prueba exitosa borra el «Sin cuota» (después de recargar saldo)', recargado.state === 'ok' && recargado.lastFailure === null);
    const caido = C.withProbe(ok, { ok: false, provider: 'openai', code: 'quota', message: 'sin saldo' });
    check('una prueba fallida bloquea aunque la lectura diga «Conectado»', caido.state === 'quota' && caido.lastFailure?.code === 'quota');
}

console.log('\n▸ Cableado: el servidor y la pantalla hablan el mismo idioma');
{
    // Sin comentarios: el comentario que cuenta la causa cita el código viejo.
    const ctrl = readFileSync(new URL('../server/controllers/reelController.js', import.meta.url), 'utf8')
        .split('\n').filter(l => !l.trim().startsWith('//')).join('\n');
    const routes = readFileSync(new URL('../server/routes/contentStudio.js', import.meta.url), 'utf8');
    const panel = readFileSync(new URL('../src/components/admin/content-studio/ReelNarrationPanel.tsx', import.meta.url), 'utf8');
    check('la voz ya no se enciende con jsonb_set (no creaba config.narration)', !/jsonb_set\(config, '\{narration,enabled\}'/.test(ctrl));
    check('enableNarrationConfig fusiona el objeto narration exista o no', /jsonb_build_object\(\s*'narration'/.test(ctrl));
    check('el genérico «No se pudo generar la narración. Revisá los avisos» ya no existe', !/Revisá los avisos del Reel/.test(ctrl));
    check('rutas: estado, muestra y aplicar', /\/reels\/narration\/providers'/.test(routes) && /\/reels\/narration\/preview'/.test(routes) && /\/reels\/:id\/narration\/:narrationId\/apply'/.test(routes));
    check('las rutas literales van antes que /reels/:id', routes.indexOf("'/reels/narration/providers'") < routes.indexOf("router.get('/reels/:id',"));
    check('el panel genera como BORRADOR y aplica aparte', /apply: false/.test(panel) && /\/narration\/\$\{version\.id\}\/apply/.test(panel));
    check('el panel muestra la oferta de respaldo del servidor', /failure\.fallback/.test(panel) && /Intentarlo con/.test(panel));
    check('el panel no lee .json() a ciegas', !/\.json\(\)/.test(panel));
    check('una tarjeta que no puede generar no se puede elegir', /const selectable = isUsable\(p\)/.test(panel) && /BLOCKED_STATES = new Set\(\['quota', 'auth'/.test(panel));
    check('el respaldo automático arranca encendido', /allowFallback: prefs\.allowFallback \?\? true/.test(panel));
    check('«Verificar conexión» manda el Reel para la síntesis de prueba', /refresh=1&reelId=/.test(panel));
}

globalThis.fetch = realFetch;
console.log(`\n${passed}/${total} comprobaciones${passed === total ? ' — todo en orden.' : ' — HAY FALLOS.'}\n`);
