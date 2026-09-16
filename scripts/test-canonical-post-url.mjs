#!/usr/bin/env node
// ════════════════════════════════════════════════════════════════════
// Prueba del criterio canónico global de URLs de publicaciones
//
// Comprueba:
// 1. Que `siteHost` y `canonicalPostUrl` prioricen el dominio propio activo
//    sobre subdominios técnicos (*.clubplatform.org).
// 2. Que `canonicalPostUrl` re-ancle cualquier URL interna técnica hacia el
//    dominio principal activo del sitio correspondiente.
// 3. Que `publicHostFor` en `server/lib/submissionArticleEngine.js` consulte
//    la fila de District con manejo de tipos seguro y orden por dominio propio.
// 4. Que `resolveDistrictEntity` en `server/routes/clubs.js` propague el dominio
//    propio del distrito a `activeEntity`.
// 5. Que `siteForPost` en `server/lib/postPublicUrl.js` devuelva el sitio de
//    la sesión cuando la publicación está replicada o dirigida a él.
// ════════════════════════════════════════════════════════════════════
import assert from 'node:assert';
import { readFileSync } from 'node:fs';

const leer = (p) => readFileSync(new URL(`../${p}`, import.meta.url), 'utf8');

let pass = 0, fail = 0;
const check = (name, fn) => {
    try { fn(); console.log('  ✓', name); pass++; }
    catch (e) { console.log('  ✗', name, '\n      →', e.message); fail++; }
};

console.log('\n── 1. Generación de URL Canónica (`server/lib/postSlug.js`) ─────────');

const { canonicalPostUrl, siteHost, articleUrl } = await import('../server/lib/postSlug.js');

check('siteHost prefiere domain sobre subdomain', () => {
    assert.equal(siteHost({ domain: 'rotary4281.org', subdomain: 'd4281' }), 'rotary4281.org');
    assert.equal(siteHost({ domain: 'https://www.calinorte.org/', subdomain: 'cali' }), 'calinorte.org');
});

check('siteHost descarta subdominios técnicos cuando hay dominio personalizado', () => {
    assert.equal(siteHost({ domain: 'rotary4281.org', subdomain: 'distrito-4281-de-rotary-international' }), 'rotary4281.org');
});

check('siteHost usa subdomain solo si no hay ningún dominio personalizado', () => {
    assert.equal(siteHost({ domain: null, subdomain: 'calinorte' }), 'calinorte.org' ? 'calinorte.clubplatform.org' : '');
});

check('canonicalPostUrl reescribe subdominios internos de clubplatform al dominio activo', () => {
    const post = {
        publicUrl: 'https://distrito-4281-de-rotary-international.clubplatform.org/blog/rotary-quimbaya-entrega-carpas-lamparas-solares-quindio',
        slug: 'rotary-quimbaya-entrega-carpas-lamparas-solares-quindio',
        id: 'post-123'
    };
    const club = {
        domain: 'rotary4281.org',
        subdomain: 'distrito-4281-de-rotary-international'
    };
    const canUrl = canonicalPostUrl(post, club);
    assert.equal(canUrl, 'https://rotary4281.org/blog/rotary-quimbaya-entrega-carpas-lamparas-solares-quindio');
});

check('canonicalPostUrl genera la URL correcta con slug y dominio propio', () => {
    const post = {
        slug: 'mi-gran-noticia',
        id: 'post-abc'
    };
    const club = {
        domain: 'rotary4281.org'
    };
    const canUrl = canonicalPostUrl(post, club);
    assert.equal(canUrl, 'https://rotary4281.org/blog/mi-gran-noticia');
});

check('canonicalPostUrl sin slug cae al id de la publicación', () => {
    const post = {
        slug: null,
        id: 'post-uuid-999'
    };
    const club = {
        domain: 'rotary4281.org'
    };
    const canUrl = canonicalPostUrl(post, club);
    assert.equal(canUrl, 'https://rotary4281.org/blog/post-uuid-999');
});

check('canonicalPostUrl sin dominio propio usa subdominio de plataforma', () => {
    const post = {
        slug: 'noticia-nueva',
        id: 'post-1'
    };
    const club = {
        domain: null,
        subdomain: 'clubdemo'
    };
    const canUrl = canonicalPostUrl(post, club);
    assert.equal(canUrl, 'https://clubdemo.clubplatform.org/blog/noticia-nueva');
});

console.log('\n── 2. Resolución de Host en Servidor (`submissionArticleEngine.js`) ──');

const engineCode = leer('server/lib/submissionArticleEngine.js');

check('publicHostFor importa canonicalDomain', () => {
    assert.match(engineCode, /import\s*\{[^}]*canonicalDomain[^}]*\}\s*from\s*['"]\.\/domains\.js['"]/);
});

check('publicHostFor consulta District con tipos seguros y orden por dominio propio', () => {
    assert.match(engineCode, /SELECT domain, subdomain FROM "District"/);
    assert.match(engineCode, /\(\$1::text IS NOT NULL AND id::text = \$1\)/);
    assert.match(engineCode, /cardinality\(\$2::int\[\]\) > 0 AND number = ANY\(\$2::int\[\]\)/);
    assert.match(engineCode, /\$3::text <> '' AND lower\(coalesce\(subdomain, ''\)\) = \$3/);
    assert.match(engineCode, /ORDER BY \(id::text = \$1\) DESC, \(domain IS NOT NULL AND domain <> ''\) DESC/);
    assert.match(engineCode, /const distDomain = canonicalDomain\(rows\[0\]\?\.domain\)/);
});

console.log('\n── 3. Propagación de Dominio de Distrito (`server/routes/clubs.js`) ──');

const routesClubs = leer('server/routes/clubs.js');

check('resolveDistrictEntity propaga el dominio del distrito a activeEntity', () => {
    assert.match(routesClubs, /domain:\s*canonicalDomain\(club\.domain\)\s*\|\|\s*canonicalDomain\(district\.domain\)\s*\|\|\s*null/);
});

console.log('\n── 4. Resolución de Sitio de Sesión (`server/lib/postPublicUrl.js`) ─');

const postPublicUrlCode = leer('server/lib/postPublicUrl.js');

check('siteForPost prioriza la sesión cuando está en los destinos declarados', () => {
    assert.match(postPublicUrlCode, /if\s*\(sesion\s*&&\s*destinos\.includes\(sesion\)\)\s*\{\s*return\s*\{\s*clubId:\s*sesion/);
});

console.log('\n── 5. Integración en Componentes de Frontend ────────────────────────');

const newsCode = leer('src/pages/admin/News.tsx');
check('News.tsx usa canonicalPostUrl para el botón Ver publicación', () => {
    assert.match(newsCode, /import\s*\{[^}]*canonicalPostUrl[^}]*\}\s*from\s*['"][^'"]*postSlug['"]/);
    assert.match(newsCode, /canonicalPostUrl\(post,\s*club\)/);
    assert.match(newsCode, /href=\{canonicalPostUrl\(post,\s*club\)!/);
});

check('News.tsx usa canonicalPostUrl para la previsualización en editor', () => {
    assert.match(newsCode, /url=\{canonicalPostUrl\(\{ slug: formData\.slug/);
});

const submissionPanelCode = leer('src/components/admin/contribution/SubmissionArticlePanel.tsx');
check('SubmissionArticlePanel.tsx usa canonicalPostUrl para VER PUBLICACIÓN', () => {
    assert.match(submissionPanelCode, /import\s*\{[^}]*canonicalPostUrl[^}]*\}\s*from\s*['"][^'"]*postSlug['"]/);
    assert.match(submissionPanelCode, /canonicalPostUrl\(\{ publicUrl: a\.publicUrl/);
});

const shareModalCode = leer('src/components/admin/social/ShareModal.tsx');
check('ShareModal.tsx usa canonicalPostUrl para mostrar la URL canónica', () => {
    assert.match(shareModalCode, /import\s*\{[^}]*canonicalPostUrl[^}]*\}\s*from\s*['"][^'"]*postSlug['"]/);
    assert.match(shareModalCode, /canonicalPostUrl\(\{ publicUrl: datos\.publicUrl/);
});

console.log(`\n${fail === 0 ? '✅' : '❌'}  ${pass} pasaron, ${fail} fallaron\n`);
process.exit(fail === 0 ? 0 : 1);
