// ════════════════════════════════════════════════════════════════════════════
// Tres defectos del cableado del Creador de Reels — v4.1011
//
// Los tres son MUDOS: el código es válido, los tipos están bien y ninguna otra
// comprobación los ve. Se miran leyendo los archivos, que es lo único que ve un
// cableado a medias entre dos pantallas (la lección de v4.889/v4.890).
//
// Verificadas a la inversa: revirtiendo cualquiera de las tres, fallan.
// ════════════════════════════════════════════════════════════════════════════
import fs from 'node:fs';
import path from 'node:path';

const raiz = path.resolve(import.meta.dirname, '..');
const leer = (p) => fs.readFileSync(path.join(raiz, p), 'utf8');

/** El archivo SIN comentarios: los de este repo explican POR QUÉ no se hace
 *  algo, así que una comprobación textual encuentra en la explicación justo lo
 *  que vino a prohibir (v4.1005). */
const codigo = (p) => leer(p)
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .split('\n').filter(l => !/^\s*(\/\/|--)/.test(l)).join('\n');

let ok = 0, fail = 0;
const check = (n, c, e = '') => { c ? ok++ : (fail++, console.log(`  ✗ ${n}${e ? ' — ' + e : ''}`)); };

// ─── 1. La trampa de v4.908 ────────────────────────────────────────────────
console.log('\n· El atajo del ensure de Reels');
{
    const s = leer('server/lib/ensureReelSchema.js');
    const alters = [...s.matchAll(/ALTER TABLE "(\w+)" ADD COLUMN IF NOT EXISTS "?(\w+)"?/g)]
        .map(m => `${m[1]}.${m[2]}`);
    const atajo = [...s.matchAll(/\['(\w+)', '(\w+)'\]/g)].map(m => `${m[1]}.${m[2]}`);
    const faltan = alters.filter(a => !atajo.includes(a));

    check('hay columnas que enumerar', alters.length > 0);
    // ⚠️ ES LA COMPROBACIÓN QUE IMPORTA. `CREATE TABLE IF NOT EXISTS` no amplía
    // nada: una columna agregada SOLA y sin enumerar deja el atajo dando la
    // base por al día y su `ALTER` no corre JAMÁS. Hoy las que faltaban no
    // hacían daño por CASUALIDAD —entraban junto a una hermana enumerada—, y
    // esa casualidad se acaba con la próxima columna.
    check('TODO ADD COLUMN está enumerado en el atajo', faltan.length === 0,
        `${faltan.length} sin enumerar: ${faltan.join(', ')}`);
}

// ─── 2. La pestaña de «Promocionar» ────────────────────────────────────────
console.log('\n· La pestaña del Estudio');
{
    const estudio = codigo('src/pages/admin/ContentStudio.tsx');
    // Se LEE del Estudio qué es cada id en vez de darlo por sabido: si algún
    // día se renombran, esta prueba tiene que seguir diciendo la verdad.
    const bloque = (v) => {
        const i = estudio.indexOf(`<TabsContent value="${v}"`);
        return i < 0 ? '' : estudio.slice(i, i + 400);
    };
    check('`create` es el Creador de Video', /VideoCreator/.test(bloque('create')));
    check('`post` es el Generador de Publicaciones', /PostGenerator/.test(bloque('post')));
    check('el prefill del post llega por `post`', /PostGenerator prefill/.test(bloque('post')));

    const ficha = codigo('src/components/admin/contribution/SubmissionDetail.tsx');
    const promo = ficha.slice(ficha.indexOf('const promocionar'));
    const cuerpo = promo.slice(0, promo.indexOf('};') + 2);
    check('«Promocionar» va al Generador de Publicaciones', /tab:\s*'post'/.test(cuerpo));
    check('y NO al Creador de Video, donde su prefill no llega',
        !/tab:\s*'create'/.test(cuerpo));
}

// ─── 3. La organización que firma ──────────────────────────────────────────
console.log('\n· La organización de un Reel manual');
{
    const ctrl = codigo('server/controllers/reelController.js');
    check('el motor la acepta y titula con ella',
        /organizationName\s*=\s*null/.test(ctrl) && /buildReelTitle\(\{ organizationName/.test(ctrl));

    const vc = codigo('src/components/admin/content-studio/VideoCreator.tsx');
    check('el creador la manda en el POST',
        /organizationName:\s*config\.organizationName \|\| undefined/.test(vc));
    check('vacío viaja como `undefined`, no como cadena vacía',
        !/organizationName:\s*config\.organizationName,/.test(vc));
    check('y tiene de dónde salir: el sitio del panel',
        /useClub/.test(vc) && /organizationName: club\.name/.test(vc));
    // ⚠️ CON `[]` NO LLEGARÍA NUNCA: el club viene del contexto en un render
    // posterior al del efecto de opciones (la lección de `conQr`, v4.836).
    const efecto = vc.slice(vc.indexOf('if (!club?.name) return;'));
    check('en un efecto con `club` en las dependencias',
        /\}, \[club\?\.name\]\);/.test(efecto.slice(0, 300)));
    check('y sólo rellena lo vacío: lo del usuario manda',
        /c\.organizationName \? c :/.test(vc));
}

console.log(`\n${fail ? '✗' : '✓'} ${ok} comprobaciones, ${fail} fallos\n`);
process.exit(fail ? 1 : 0);
