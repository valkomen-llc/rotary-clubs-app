#!/usr/bin/env node
// ════════════════════════════════════════════════════════════════════
// Prueba de la capa de proveedores de traducción — v4.661
//
//   npm run test:i18n:providers
//
// No llama a ningún servicio real: sustituye `fetch` para poder provocar a
// voluntad las respuestas que rompen el alineamiento.
//
// Lo que se comprueba es el CONTRATO: un lote de N textos devuelve N
// traducciones en el mismo orden, o falla. Hasta v4.660 se le pedía al modelo
// una lista numerada que luego se deshacía con una expresión regular por
// índice; bastaba que una traducción contuviera "[2]" o que el modelo se
// saltara una línea para que todo lo siguiente quedara corrido — y entonces
// cada texto se guardaba en la caché con la traducción de OTRO, de forma
// permanente. Por eso un lote mal formado se descarta entero.
// ════════════════════════════════════════════════════════════════════
import assert from 'node:assert';

process.env.GEMINI_API_KEY = 'prueba';
process.env.OPENAI_API_KEY = 'prueba';
process.env.DEEPL_API_KEY = 'prueba:fx';

const { translateBatch } = await import('../server/lib/translationProviders.js');

let pass = 0, fail = 0;
const check = async (name, fn) => {
    try { await fn(); console.log('  ✓', name); pass++; }
    catch (e) { console.log('  ✗', name, '\n      →', e.message); fail++; }
};

/** Sustituye fetch por una respuesta fija. */
function stub(payload, ok = true) {
    globalThis.fetch = async () => ({
        ok,
        status: ok ? 200 : 500,
        text: async () => (typeof payload === 'string' ? payload : JSON.stringify(payload)),
    });
}
const gemini = text => ({ candidates: [{ content: { parts: [{ text }] } }] });

const TRES = ['Regístrate ahora', 'Feria de Proyectos', 'Ver más'];

console.log('\n── Gemini: forma correcta ─────────────────────────────');

await check('un array JSON limpio se acepta y conserva el orden', async () => {
    stub(gemini(JSON.stringify(['Register now', 'Project Fair', 'See more'])));
    const { translations } = await translateBatch(TRES, 'en', { provider: 'gemini' });
    assert.deepEqual(translations, ['Register now', 'Project Fair', 'See more']);
});

await check('un array envuelto en ```json … ``` se rescata', async () => {
    stub(gemini('```json\n["Register now","Project Fair","See more"]\n```'));
    const { translations } = await translateBatch(TRES, 'en', { provider: 'gemini' });
    assert.equal(translations[1], 'Project Fair');
});

await check('{"translations":[…]} también se acepta', async () => {
    stub(gemini(JSON.stringify({ translations: ['A', 'B', 'C'] })));
    const { translations } = await translateBatch(TRES, 'en', { provider: 'gemini' });
    assert.deepEqual(translations, ['A', 'B', 'C']);
});

await check('un hueco vacío se rellena con el original, no queda en blanco', async () => {
    stub(gemini(JSON.stringify(['Register now', '', 'See more'])));
    const { translations } = await translateBatch(TRES, 'en', { provider: 'gemini' });
    assert.equal(translations[1], 'Feria de Proyectos');
});

console.log('\n── Gemini: formas que ANTES desalineaban ──────────────');

await check('faltan elementos → falla el lote (no se guarda nada corrido)', async () => {
    stub(gemini(JSON.stringify(['Register now', 'Project Fair'])));   // 2 para 3
    await assert.rejects(() => translateBatch(TRES, 'en', { provider: 'gemini' }), /2.*para 3|descarta/i);
});

await check('sobran elementos → falla el lote', async () => {
    stub(gemini(JSON.stringify(['A', 'B', 'C', 'D'])));
    await assert.rejects(() => translateBatch(TRES, 'en', { provider: 'gemini' }), /descarta|para 3/i);
});

await check('una traducción que contiene "[2]" NO corre el resto', async () => {
    // Con el parser por regex de v4.660 este corchete partía la lista en dos.
    stub(gemini(JSON.stringify(['Ver la nota [2] al pie', 'Project Fair', 'See more'])));
    const { translations } = await translateBatch(TRES, 'en', { provider: 'gemini' });
    assert.equal(translations.length, 3);
    assert.equal(translations[1], 'Project Fair', 'el segundo debe seguir siendo el segundo');
    assert.equal(translations[2], 'See more');
});

await check('respuesta que no es JSON → falla en vez de inventar', async () => {
    stub(gemini('Claro, aquí tienes las traducciones que me pediste.'));
    await assert.rejects(() => translateBatch(TRES, 'en', { provider: 'gemini' }));
});

await check('respuesta vacía → falla con motivo', async () => {
    stub({ candidates: [{ finishReason: 'SAFETY' }] });
    await assert.rejects(() => translateBatch(TRES, 'en', { provider: 'gemini' }), /SAFETY|contenido/i);
});

await check('HTTP 500 del proveedor → falla', async () => {
    stub('rate limited', false);
    await assert.rejects(() => translateBatch(TRES, 'en', { provider: 'gemini' }), /500/);
});

console.log('\n── OpenAI ─────────────────────────────────────────────');

await check('{"t":[…]} se interpreta', async () => {
    stub({ choices: [{ message: { content: JSON.stringify({ t: ['A', 'B', 'C'] }) } }] });
    const { translations } = await translateBatch(TRES, 'en', { provider: 'openai' });
    assert.deepEqual(translations, ['A', 'B', 'C']);
});

await check('largo distinto → falla', async () => {
    stub({ choices: [{ message: { content: JSON.stringify({ t: ['A'] }) } }] });
    await assert.rejects(() => translateBatch(TRES, 'en', { provider: 'openai' }));
});

console.log('\n── DeepL ──────────────────────────────────────────────');

await check('la respuesta nativa se mapea en orden', async () => {
    stub({ translations: [{ text: 'A' }, { text: 'B' }, { text: 'C' }] });
    const { translations } = await translateBatch(TRES, 'en', { provider: 'deepl' });
    assert.deepEqual(translations, ['A', 'B', 'C']);
});

await check('un idioma que DeepL no admite se rechaza antes de llamar', async () => {
    stub({});
    await assert.rejects(() => translateBatch(TRES, 'xx', { provider: 'deepl' }), /no admite/i);
});

console.log('\n── Varios ─────────────────────────────────────────────');

await check('un proveedor desconocido se rechaza', async () => {
    await assert.rejects(() => translateBatch(TRES, 'en', { provider: 'inventado' }), /desconocido/i);
});

await check('un lote vacío no llama a nadie', async () => {
    globalThis.fetch = async () => { throw new Error('no debería llamarse'); };
    const { translations } = await translateBatch([], 'en', { provider: 'gemini' });
    assert.deepEqual(translations, []);
});

console.log(`\n${fail ? '✗' : '✓'} ${pass} pasaron, ${fail} fallaron\n`);
process.exit(fail ? 1 : 0);
