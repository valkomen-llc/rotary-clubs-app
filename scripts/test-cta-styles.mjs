// ════════════════════════════════════════════════════════════════════
// El aspecto de los botones CTA — pruebas del CRITERIO — v4.719
//
// Sin base, sin credenciales y sin red. Dos cosas que se comprueban aquí y no
// se ven mirando una pantalla:
//
//   1. Que las clases estén DECLARADAS UNA SOLA VEZ. El defecto que esto
//      corrige es que «Postular Proyecto» y el botón secundario de la ficha de
//      un evento se pintaban por separado, así que la misma acción se veía de
//      dos maneras y nada obligaba a que se parecieran.
//   2. Que las clases EXISTAN en el CSS compilado. Una clase de Tailwind mal
//      escrita no da error: simplemente no genera regla y el botón se queda sin
//      ese estilo en silencio. Es exactamente lo que le pasaba a
//      `hover:bg-rotary-blue/90`.
//
//   npm run test:cta
// ════════════════════════════════════════════════════════════════════
import { readFileSync, readdirSync, existsSync } from 'node:fs';
import { build } from 'esbuild';

const out = await build({
    entryPoints: ['src/lib/ctaStyles.ts'],
    bundle: true, write: false, format: 'esm', platform: 'neutral',
});
const { CTA_SOLID, CTA_SOFT, ctaSkin } = await import(
    `data:text/javascript,${encodeURIComponent(out.outputFiles[0].text)}`);

let ok = 0; const malos = [];
const check = (n, c, e = '') => {
    if (c) { ok++; console.log(`  ✓ ${n}`); }
    else { malos.push(n); console.log(`  ✗ ${n}${e ? ` — ${e}` : ''}`); }
};
const grupo = t => console.log(`\n${t}`);

const leer = f => readFileSync(f, 'utf8');

grupo('Las dos pieles');
check('la sólida es azul Rotary con letra blanca',
    CTA_SOLID.base === 'bg-rotary-blue text-white', CTA_SOLID.base);
check('la suave es azul claro con letra azul',
    CTA_SOFT.base === 'bg-sky-100 text-rotary-blue', CTA_SOFT.base);
check('cada una trae su hover', Boolean(CTA_SOLID.hover && CTA_SOFT.hover));
check('el hover de la sólida NO usa el modificador de opacidad',
    !CTA_SOLID.hover.includes('/'), `${CTA_SOLID.hover} no genera regla`);

grupo('Un botón apagado no reacciona al cursor');
check('con hover cuando lleva a algún sitio',
    ctaSkin(CTA_SOFT) === 'bg-sky-100 text-rotary-blue hover:bg-sky-200', ctaSkin(CTA_SOFT));
check('sin hover cuando está deshabilitado',
    ctaSkin(CTA_SOFT, false) === 'bg-sky-100 text-rotary-blue', ctaSkin(CTA_SOFT, false));
check('interactivo por defecto', ctaSkin(CTA_SOLID).includes('hover:'));

grupo('Nadie las escribe a mano');
// El botón del encabezado y el de la ficha del evento tienen que salir de la
// MISMA constante: es lo único que impide que se separen en silencio.
const navbar = leer('src/sections/Navbar.tsx');
const ficha = leer('src/components/EventRegistrationCta.tsx');
const preview = leer('src/components/admin/events/EventCtaManager.tsx');

check('el encabezado toma los colores del módulo', navbar.includes("from '../lib/ctaStyles'"));
check('la ficha del evento también', ficha.includes("from '../lib/ctaStyles'"));
check('y la vista previa del panel, la tercera', preview.includes('ctaStyles'));

for (const [nombre, src] of [['el encabezado', navbar], ['la ficha', ficha], ['la vista previa', preview]]) {
    check(`${nombre} no repite el fondo azul claro`,
        !src.includes('bg-sky-100 text-rotary-blue'));
}
check('la ficha ya no pinta el contorno azul marino a mano',
    !ficha.includes('border-[#1B2B4D]'));
check('ni la vista previa', !preview.includes('border-[#1B2B4D]'));

grupo('Las clases existen de verdad en el CSS compilado');
// Una clase de Tailwind mal escrita no falla: no genera regla. Sólo el CSS
// construido lo dice, y por eso se mira aquí y no en el navegador.
const dist = 'dist/assets';
const hoja = existsSync(dist) && readdirSync(dist).find(f => /^index-.*\.css$/.test(f));
if (!hoja) {
    console.log('  · sin dist/: se omite (corre `npm run build` para comprobarlo)');
} else {
    const css = leer(`${dist}/${hoja}`);
    // En el CSS las clases van con los dos puntos escapados: `.hover\:bg-sky-200`.
    const existe = cls => css.includes(`.${cls.replace(/[:/.]/g, m => `\\${m}`)}`);
    for (const cls of [...CTA_SOLID.base.split(' '), CTA_SOLID.hover,
                       ...CTA_SOFT.base.split(' '), CTA_SOFT.hover]) {
        check(`«${cls}» genera regla`, existe(cls), 'la clase no llegó al CSS');
    }
}

console.log(`\n${ok}/${ok + malos.length} comprobaciones OK`);
if (malos.length) { console.log(malos.map(m => `  - ${m}`).join('\n')); process.exit(1); }
