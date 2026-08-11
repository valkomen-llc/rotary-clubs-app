// ════════════════════════════════════════════════════════════════════
// El nombre del sitio dentro de una frase — v4.759.0
//
//   npm run test:site-name
//
// Qué se comprueba: el CRITERIO —cómo se arma la frase con el nombre y sin él—
// y, leyendo los archivos, que ninguna página pública vuelva a escribir «Rotary
// Club» haciendo de nombre del sitio.
//
// Lo segundo hace falta porque el defecto no da ningún error: la página compila,
// se pinta y se lee bien; sólo que dice el nombre de otra organización. Eso no
// lo ve el typecheck y en el sitio del Distrito 4281 vivió versiones.
//
// La parte pura no necesita nada; el bundle del criterio pide `esbuild` y se
// salta solo si no está.
// ════════════════════════════════════════════════════════════════════

import { readFileSync } from 'node:fs';

let ok = 0; const malos = [];
const check = (n, cond, extra = '') => {
    if (cond) { ok++; console.log(`  ✓ ${n}`); }
    else { malos.push(n); console.log(`  ✗ ${n}${extra ? ` — ${extra}` : ''}`); }
};
const grupo = t => console.log(`\n${t}`);
const eq = (a, b) => JSON.stringify(a) === JSON.stringify(b);

let build;
try {
    ({ build } = await import('esbuild'));
} catch {
    console.log('⚠ Se omite: falta esbuild.  npm i --no-save esbuild');
    process.exit(0);
}

const out = await build({
    entryPoints: ['src/lib/siteName.ts'],
    bundle: true, write: false, format: 'esm', platform: 'neutral',
});
const spec = await import(`data:text/javascript,${encodeURIComponent(out.outputFiles[0].text)}`);
const { siteName, siteSentence, siteSentenceText } = spec;

// Las páginas donde el nombre del sitio aparece dentro de una frase.
const PAGINAS = [
    'src/pages/Blog.tsx',
    'src/pages/EstadosFinancieros.tsx',
    'src/pages/Proyectos.tsx',
];
const fuente = Object.fromEntries(PAGINAS.map(p => [p, readFileSync(p, 'utf8')]));

// ════════════════════════════════════════════════════════════════════
grupo('── De dónde sale el nombre ────────────────────────────');

check('sale de `club.name`', siteName({ name: 'Distrito 4281' }) === 'Distrito 4281');
check('se recortan los espacios', siteName({ name: '  Distrito 4281  ' }) === 'Distrito 4281');

// El contexto del sitio se resuelve por red: el primer render puede no tenerlo,
// y una página a medio cargar no puede reventar.
for (const raw of [null, undefined, {}, { name: null }, { name: 42 }, { name: '   ' }, 'texto', 0]) {
    check(`sin nombre utilizable devuelve cadena vacía — ${JSON.stringify(raw)}`,
        siteName(raw) === '');
}

// ════════════════════════════════════════════════════════════════════
grupo('── La frase con nombre ────────────────────────────────');

const partes = { before: 'Actualizaciones de ', after: '. Al día.', withoutName: 'Al día.' };

check('el nombre va aparte, no pegado al texto',
    eq(siteSentence('Distrito 4281', partes),
        { before: 'Actualizaciones de ', name: 'Distrito 4281', after: '. Al día.' }));

check('la frase completa se lee bien',
    siteSentenceText(siteSentence('Distrito 4281', partes))
        === 'Actualizaciones de Distrito 4281. Al día.');

// Es lo que obliga a que el nombre viaje en su propia pieza: se marca con
// `data-no-translate` porque es identidad, no lenguaje.
check('el nombre nunca queda dentro de `before` ni de `after`',
    !siteSentence('Distrito 4281', partes).before.includes('Distrito')
    && !siteSentence('Distrito 4281', partes).after.includes('Distrito'));

// ── El artículo ────────────────────────────────────────────────────
// «del Feria de Proyectos» es lo que produciría un artículo fijo. Deducir el
// género de un nombre propio no se puede hacer bien, así que no hay artículo.
for (const p of PAGINAS) {
    check(`ninguna frase de ${p.split('/').pop()} termina en artículo antes del nombre`,
        !/(?:before|withoutName):\s*'[^']*\b(?:del|de la|de los|de las)\s*'/.test(fuente[p]));
}

for (const nombre of [
    'Distrito 4281',
    'Club Rotario Bogotá',
    'Rotary E-Club Origen',
    'Feria de Proyectos Rotary Colombia',
    'Zona 23',
]) {
    check(`«de ${nombre}» se arma igual sea cual sea el género`,
        siteSentenceText(siteSentence(nombre, partes)) === `Actualizaciones de ${nombre}. Al día.`);
}

// ════════════════════════════════════════════════════════════════════
grupo('── La frase sin nombre ────────────────────────────────');

// Poner un nombre genérico de respaldo es volver a escribir el nombre de otro,
// que es justo el defecto que esto corrige.
for (const vacio of ['', '   ', siteName(null)]) {
    const s = siteSentence(vacio, partes);
    check(`sin nombre no se inventa ninguno — ${JSON.stringify(vacio)}`,
        s.name === '' && !s.before.includes('Rotary Club'));
    check(`sin nombre queda una frase completa — ${JSON.stringify(vacio)}`,
        siteSentenceText(s) === 'Al día.');
}

check('la variante sin nombre no arrastra la preposición suelta',
    !/\s(?:de|del|a través de)\s*$/.test(siteSentence('', partes).before));

// ════════════════════════════════════════════════════════════════════
grupo('── Que nadie vuelva a escribir el nombre a mano ───────');

for (const p of PAGINAS) {
    // El texto exacto que estaba escrito en el código y salía igual en los
    // cientos de sitios alojados.
    check(`${p.split('/').pop()} no dice «del Rotary Club»`,
        !/\bdel Rotary Club\b/.test(fuente[p]));
    check(`${p.split('/').pop()} arma la frase con el criterio compartido`,
        fuente[p].includes("from '../lib/siteName'")
        && fuente[p].includes('siteSentence(siteName(club)'));
    check(`${p.split('/').pop()} pinta el nombre con el componente que lo marca`,
        fuente[p].includes("from '../components/SiteSentence'")
        && fuente[p].includes('<SiteSentence'));
}

// La marca vive en UN solo sitio a propósito: escrita a mano en tres páginas,
// la que se olvide no da error, sólo deja que el traductor cambie el nombre.
const comp = readFileSync('src/components/SiteSentence.tsx', 'utf8');
check('el componente marca el nombre como intraducible',
    comp.includes('data-no-translate'));
// Se mira el JSX, no el archivo entero: el comentario de arriba nombra la marca
// para explicarla, y eso no es marcar nada.
// El contenido del `<span>` se fija ENTERO: es la única forma de decir que lo
// marcado es el nombre y nada más. Un `[\s\S]*` después de la etiqueta se
// llevaría por delante el `{parts.after}` que va legítimamente fuera de ella.
check('sólo se marca el NOMBRE, no la frase entera',
    /<span data-no-translate>\{parts\.name\}<\/span>/.test(comp)
    && comp.split('<span data-no-translate>').length === 2);

// Una cabecera con descripción cargada desde el panel manda sobre la frase por
// defecto: lo que escribió una persona no lo pisa nada.
for (const p of ['src/pages/Blog.tsx', 'src/pages/EstadosFinancieros.tsx']) {
    check(`${p.split('/').pop()} respeta la descripción del panel`,
        fuente[p].includes('sections.header?.description ||'));
}

// ════════════════════════════════════════════════════════════════════
console.log(`\n${malos.length ? '✗' : '✓'} ${ok} comprobaciones, ${malos.length} fallos`);
if (malos.length) { malos.forEach(m => console.log(`   · ${m}`)); process.exit(1); }
