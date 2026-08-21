// ════════════════════════════════════════════════════════════════════
// Traer el Bloque Destacado de un sitio al Slider Global — v4.882
//
//   npm run test:spotlight:import
//
// Se reportó así: «el del distrito 4281 debería quedar dentro del slider
// global para que se pueda administrar». El bloque propio de un sitio vive
// repartido en DOS pantallas —el texto en Configuración / Identidad y la
// imagen en Imágenes del Sitio— y copiarlo a mano es la forma segura de
// equivocarse en una URL o de perder el icono.
//
// Prueba el CAMINO, no sólo el criterio: la base se sustituye en memoria con
// un hook de resolución de módulos, así que NO hace falta Postgres, ni
// credenciales, ni red. Es la lección de v4.744 —`pickDistrictSite` era
// correcto y el defecto estaba en el camino—.
// ════════════════════════════════════════════════════════════════════

import { register } from 'node:module';
import { pathToFileURL } from 'node:url';
import { writeFileSync, mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

let ok = 0; const malos = [];
const check = (n, cond, extra = '') => {
    if (cond) { ok++; console.log(`  ✓ ${n}`); }
    else { malos.push(n); console.log(`  ✗ ${n}${extra ? ` — ${extra}` : ''}`); }
};
const grupo = t => console.log(`\n${t}`);

// ── La base, en memoria ────────────────────────────────────────────
//
// Sólo entiende las consultas que este camino ejecuta. Devolver filas de más
// no importa: lo que se prueba es qué se lee, qué se escribe y en qué orden.
const estado = {
    clubs: [
        { id: 'c-4281', name: 'Distrito 4281', domain: 'rotary4281.org', subdomain: null, type: 'district' },
        { id: 'c-vacio', name: 'Club Sin Bloque', domain: '', subdomain: 'vacio', type: 'club' },
    ],
    settings: [{ clubId: 'c-4281', key: 'spotlight_section_content', value: JSON.stringify({
        title: 'Acción constante, impacto duradero: la promesa de Rotary para erradicar la polio',
        text: 'Desde 1988, Rotary y nuestros aliados hemos vacunado contra la polio a más de 3 mil millones de niños.',
        buttonText: 'Más información', buttonUrl: 'https://endpolio.org', icon: 'star',
    }) }],
    imagenes: [{ clubId: 'c-4281', content: JSON.stringify({ spotlight: { url: 'https://x/polio.jpg', alt: 'Vacunación' } }) }],
    slides: [],
};
const consultas = [];

const db = {
    query: async (sql, args = []) => {
        consultas.push({ sql: sql.replace(/\s+/g, ' ').trim(), args });
        const q = sql.replace(/\s+/g, ' ');

        if (/FROM "Club" c/.test(q)) {
            const clubId = /AND c\.id = \$1/.test(q) ? args[0] : null;
            return { rows: estado.clubs.filter(c => !clubId || c.id === clubId).map(c => ({
                id: c.id, name: c.name, domain: c.domain, subdomain: c.subdomain, type: c.type,
                texto: estado.settings.find(s => s.clubId === c.id)?.value || null,
                imagenes: estado.imagenes.find(i => i.clubId === c.id)?.content || null,
            })) };
        }
        if (/SELECT DISTINCT targeting/.test(q)) {
            return { rows: estado.slides.map(s => ({ clubs: JSON.stringify(s.targeting.clubIds || []) })) };
        }
        if (/INSERT INTO "SpotlightSlide"/.test(q)) {
            const [name, slideType, content, active, startAt, endAt, priority, autoplayMs, targeting, clubId, by] = args;
            const row = { id: `s${estado.slides.length + 1}`, name, slideType, content: JSON.parse(content),
                active, startAt, endAt, priority, autoplayMs, targeting: JSON.parse(targeting), clubId,
                createdBy: by, createdAt: new Date(), updatedAt: new Date(), publishedAt: active ? new Date() : null };
            estado.slides.push(row);
            return { rows: [row] };
        }
        if (/UPDATE "Setting" SET value/.test(q)) {
            const f = estado.settings.find(s => s.clubId === args[0] && s.key === 'spotlight_section_content');
            if (f) f.value = '{}';
            return { rows: [], rowCount: f ? 1 : 0 };
        }
        if (/UPDATE "ContentSection" SET content/.test(q)) {
            const f = estado.imagenes.find(i => i.clubId === args[0]);
            if (f) { const j = JSON.parse(f.content); delete j.spotlight; f.content = JSON.stringify(j); }
            return { rows: [], rowCount: f ? 1 : 0 };
        }
        return { rows: [] };
    },
};

// Se sustituyen `db.js` y el `ensure*` (que sólo crea tablas) por dobles.
const dir = mkdtempSync(join(tmpdir(), 'spot-'));
writeFileSync(join(dir, 'hook.mjs'), `
export async function resolve(spec, ctx, next) {
    if (spec.endsWith('/lib/db.js')) return next('${pathToFileURL(join(dir, 'db.mjs')).href}', ctx);
    if (spec.endsWith('/ensureSpotlightSchema.js')) return next('${pathToFileURL(join(dir, 'ensure.mjs')).href}', ctx);
    return next(spec, ctx);
}`);
writeFileSync(join(dir, 'db.mjs'), `export default globalThis.__db; export const query = (...a) => globalThis.__db.query(...a);`);
writeFileSync(join(dir, 'ensure.mjs'), `export const ensureSpotlightSchema = async () => {};`);
globalThis.__db = db;
register(pathToFileURL(join(dir, 'hook.mjs')).href);

const ctrl = await import('../server/controllers/spotlightSlideController.js');

const responder = () => {
    const r = { code: 200, body: null };
    r.status = c => { r.code = c; return r; };
    r.json = b => { r.body = b; return r; };
    return r;
};

// ════════════════════════════════════════════════════════════════════
grupo('── Qué sitios se ofrecen ─────────────────────────────────');

let res = responder();
await ctrl.listImportable({ user: { id: 'u1' } }, res);
const sitios = res.body?.sites || [];
check('responde 200', res.code === 200);
check('ofrece el sitio que TIENE bloque', sitios.some(s => s.clubId === 'c-4281'));
check('NO ofrece el sitio sin bloque', !sitios.some(s => s.clubId === 'c-vacio'));
check('trae el título que se ve en la portada',
    (sitios[0]?.title || '').startsWith('Acción constante'));
check('trae la imagen, que vive en OTRA pantalla', sitios[0]?.image === 'https://x/polio.jpg');
check('trae el dominio, para reconocer el sitio', sitios[0]?.domain === 'rotary4281.org');

// ════════════════════════════════════════════════════════════════════
grupo('── Importar SIN reemplazar: no toca el sitio ─────────────');

res = responder();
await ctrl.importLocalBlock({ user: { id: 'u1' }, body: { clubId: 'c-4281' } }, res);
check('responde 201', res.code === 201);
check('el slide NACE APAGADO', estado.slides[0]?.active === false);
check('apunta SÓLO a ese sitio, no a todos',
    estado.slides[0]?.targeting?.mode === 'clubs'
    && estado.slides[0]?.targeting?.clubIds?.[0] === 'c-4281',
    JSON.stringify(estado.slides[0]?.targeting));
check('conserva el texto del botón', estado.slides[0]?.content?.buttonText === 'Más información');
check('conserva el destino', estado.slides[0]?.content?.buttonUrl === 'https://endpolio.org');
check('conserva la imagen y su texto alternativo',
    estado.slides[0]?.content?.image === 'https://x/polio.jpg' && estado.slides[0]?.content?.imageAlt === 'Vacunación');
check('el nombre interno dice de dónde vino', /Distrito 4281/.test(estado.slides[0]?.name || ''));
// ⚠️ Lo que NO se tocó importa tanto como lo que sí.
check('el sitio CONSERVA su bloque propio',
    JSON.parse(estado.settings[0].value).title?.startsWith('Acción constante'));
check('…y su imagen', !!JSON.parse(estado.imagenes[0].content).spotlight);
check('la respuesta dice que no se publicó', res.body?.publicado === false);

// ════════════════════════════════════════════════════════════════════
grupo('── Importar REEMPLAZANDO: las dos cosas, o ninguna ───────');

res = responder();
await ctrl.importLocalBlock({ user: { id: 'u1' }, body: { clubId: 'c-4281', replace: true } }, res);
check('responde 201', res.code === 201);
check('esta vez el slide nace ENCENDIDO', estado.slides[1]?.active === true);
check('el texto del sitio quedó vacío', JSON.parse(estado.settings[0].value).title === undefined);
check('la imagen salió del hueco del bloque', !JSON.parse(estado.imagenes[0].content).spotlight);
check('la respuesta lo dice', res.body?.publicado === true && res.body?.bloqueLocalVaciado === true);
// El sitio no se queda ni duplicado ni vacío: el slide encendido lo reemplaza.
check('el slide encendido apunta a ese sitio',
    estado.slides[1]?.targeting?.clubIds?.[0] === 'c-4281');

// ════════════════════════════════════════════════════════════════════
grupo('── Lo que NO se puede importar ───────────────────────────');

res = responder();
await ctrl.importLocalBlock({ user: { id: 'u1' }, body: { clubId: 'c-vacio', replace: true } }, res);
check('un sitio sin bloque se rechaza con su motivo', res.code === 422 && /no tiene/.test(res.body?.error || ''));
check('…y no creó ningún slide', estado.slides.length === 2);

res = responder();
await ctrl.importLocalBlock({ user: { id: 'u1' }, body: {} }, res);
check('sin sitio se rechaza', res.code === 400);

res = responder();
await ctrl.importLocalBlock({ user: { id: 'u1' }, body: { clubId: 'no-existe' } }, res);
check('un sitio inexistente da 404', res.code === 404);

// ⚠️ Si el bloque no se puede publicar, NO se vacía nada: dejar la portada sin
// bloque porque la validación falló sería cambiar un problema de
// administración por uno de contenido.
estado.clubs.push({ id: 'c-roto', name: 'Club Roto', domain: '', subdomain: 'roto', type: 'club' });
estado.settings.push({ clubId: 'c-roto', key: 'spotlight_section_content',
    value: JSON.stringify({ title: 'Tiene título', buttonText: 'Pulsá acá' }) }); // botón sin destino
res = responder();
await ctrl.importLocalBlock({ user: { id: 'u1' }, body: { clubId: 'c-roto', replace: true } }, res);
check('un bloque que no se puede publicar se rechaza', res.code === 422);
check('…y el sitio conserva lo suyo',
    JSON.parse(estado.settings.find(s => s.clubId === 'c-roto').value).title === 'Tiene título');
check('…y no quedó ningún slide a medias', estado.slides.length === 2);

// ════════════════════════════════════════════════════════════════════
grupo('── El alta normal y la importación comparten la inserción ─');

const archivo = (await import('node:fs')).readFileSync('server/controllers/spotlightSlideController.js', 'utf8');
check('hay UN solo INSERT de slides en el controlador',
    (archivo.match(/INSERT INTO "SpotlightSlide"/g) || []).length === 1,
    'con dos, el día que se agregue una columna una vía se queda sin ella');

// ════════════════════════════════════════════════════════════════════
console.log(`\n${'─'.repeat(60)}`);
if (malos.length) {
    console.log(`✗ ${malos.length} fallaron de ${ok + malos.length}:`);
    malos.forEach(m => console.log(`   · ${m}`));
    process.exit(1);
}
console.log(`✓ ${ok} comprobaciones, todas bien.`);
