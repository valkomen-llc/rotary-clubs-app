#!/usr/bin/env node
// ════════════════════════════════════════════════════════════════════
// Prueba del criterio de recursos por idioma — v4.699
//
//   npm run test:assets
//
// Qué se comprueba: qué idioma recibe la pieza nacional (Colombia) y cuál la
// internacional. Es una regla corta pero decisiva —decide qué logo ve cada
// visitante— y ya se equivocó una vez en su gemela: hasta v4.651 los botones
// de registro se resolvían por PAÍS en vez de por idioma, así que un visitante
// con el sitio en inglés desde Colombia veía el registro nacional.
//
// Necesita esbuild, que no es dependencia del sitio:  npm i --no-save esbuild
// ════════════════════════════════════════════════════════════════════
import assert from 'node:assert';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const outDir = mkdtempSync(join(tmpdir(), 'assets-test-'));
const BUILT = join(outDir, 'audienceAssets.js');
process.on('exit', () => { try { rmSync(outDir, { recursive: true, force: true }); } catch { } });
execFileSync('npx', ['esbuild', 'src/lib/audienceAssets.ts',
    `--outfile=${BUILT}`, '--format=esm', '--platform=neutral'], { stdio: 'pipe' });

const { isNationalLang, pickLocalizedAsset } = await import(BUILT);

let pass = 0, fail = 0;
const check = (name, fn) => {
    try { fn(); console.log('  ✓', name); pass++; }
    catch (e) { console.log('  ✗', name, '\n      →', e.message); fail++; }
};

const ES = 'https://cdn/logo-es.png';
const EN = 'https://cdn/logo-en.png';

console.log('\n── Quién recibe la versión nacional ───────────────────');

check('«es» es nacional (el selector ofrece un solo español, el colombiano)', () =>
    assert.equal(isNationalLang('es'), true));
check('«es-CO» es nacional', () => assert.equal(isNationalLang('es-CO'), true));
check('mayúsculas/minúsculas no importan', () => assert.equal(isNationalLang('ES-co'), true));

console.log('\n── Quién recibe la versión internacional ──────────────');

for (const code of ['en', 'fr', 'pt', 'de', 'it', 'ja', 'ko']) {
    check(`«${code}» es internacional`, () => assert.equal(isNationalLang(code), false));
}
check('«es-MX» NO es nacional: es un visitante de fuera', () =>
    assert.equal(isNationalLang('es-MX'), false));
check('«es-ES» NO es nacional', () => assert.equal(isNationalLang('es-ES'), false));

console.log('\n── Elección del archivo ───────────────────────────────');

check('en español se sirve el logo en español', () =>
    assert.equal(pickLocalizedAsset(ES, EN, 'es'), ES));
check('en japonés se sirve el internacional (rotulado en inglés)', () =>
    assert.equal(pickLocalizedAsset(ES, EN, 'ja'), EN));
check('en los siete idiomas internacionales se sirve el mismo archivo', () => {
    for (const code of ['en', 'fr', 'pt', 'de', 'it', 'ja', 'ko']) {
        assert.equal(pickLocalizedAsset(ES, EN, code), EN, `falló en ${code}`);
    }
});

console.log('\n── Sin versión internacional configurada ──────────────');
// Es el estado de CASI TODOS los sitios: no debe cambiar nada para ellos.

check('sin internacional, todos los idiomas usan el de siempre', () => {
    for (const code of ['es', 'en', 'ja', 'ko']) {
        assert.equal(pickLocalizedAsset(ES, null, code), ES, `falló en ${code}`);
    }
});
check('una cadena vacía cuenta como "no configurada"', () =>
    assert.equal(pickLocalizedAsset(ES, '   ', 'en'), ES));
check('si sólo hay internacional, se usa también en español', () =>
    assert.equal(pickLocalizedAsset('', EN, 'es'), EN));
check('sin ninguna de las dos, devuelve undefined (no una cadena vacía)', () =>
    assert.equal(pickLocalizedAsset(null, null, 'es'), undefined));
check('nunca deja un hueco pudiendo mostrar algo', () => {
    assert.ok(pickLocalizedAsset(ES, null, 'ko'));
    assert.ok(pickLocalizedAsset(null, EN, 'es'));
});

console.log('\n── Espejo del servidor ────────────────────────────────');

await (async () => {
    const { DEFAULT_NATIONAL_LOCALES } = await import('../server/lib/eventRegistrationSpec.js');
    const { NATIONAL_LANGS } = await import(BUILT);
    check('la lista del navegador coincide con la del servidor', () =>
        assert.deepEqual(
            [...NATIONAL_LANGS].sort(),
            [...DEFAULT_NATIONAL_LOCALES].sort(),
            'si cambia una lista hay que cambiar la otra (ver CLAUDE.md)',
        ));
})();

console.log(`\n${fail ? '✗' : '✓'} ${pass} pasaron, ${fail} fallaron\n`);
process.exit(fail ? 1 : 0);
