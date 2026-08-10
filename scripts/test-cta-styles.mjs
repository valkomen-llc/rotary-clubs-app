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
// v4.751 — El panel de inscripción de un evento: la cuenta regresiva y el
// botón «Inscripciones» son de esta misma familia y llevaban un naranja
// escrito a mano que no pertenecía a ninguna paleta del sitio.
const panel = leer('src/components/RegistrationPanel.tsx');

check('el encabezado toma los colores del módulo', navbar.includes("from '../lib/ctaStyles'"));
check('la ficha del evento también', ficha.includes("from '../lib/ctaStyles'"));
check('y la vista previa del panel, la tercera', preview.includes('ctaStyles'));
check('el panel de inscripción, la cuarta', panel.includes("from '../lib/ctaStyles'"));

for (const [nombre, src] of [['el encabezado', navbar], ['la ficha', ficha], ['la vista previa', preview], ['el panel de inscripción', panel]]) {
    check(`${nombre} no repite el fondo azul claro`,
        !src.includes('bg-sky-100 text-rotary-blue'));
}
check('la ficha ya no pinta el contorno azul marino a mano',
    !ficha.includes('border-[#1B2B4D]'));
check('ni la vista previa', !preview.includes('border-[#1B2B4D]'));

// El naranja no salía de ninguna paleta del sitio y no se repetía en ninguna
// otra parte. Se busca la CLASE, no la mención: el comentario que explica de
// dónde se viene tiene que poder nombrar el valor viejo sin hacer fallar la
// prueba.
const naranja = /(?:bg|text|border)-\[#(?:D57D2C|c46f23)\]/i;
for (const [nombre, src] of [
    ['el panel de inscripción', panel],
    ['la botonera de la ficha', ficha],
    ['la vista previa del panel', preview],
]) {
    check(`${nombre} ya no PINTA el naranja escrito a mano`, !naranja.test(src));
}

// v4.752 — El principal y el secundario son la PAREJA declarada: uno sólido que
// pesa y uno suave a su lado. Es lo único que distingue cuál es el registro
// principal, porque desde v4.719.1 los dos tienen el mismo alto y la misma
// letra a propósito.
check('la botonera pinta el principal con la piel sólida',
    ficha.includes("variant === 'primary' ? CTA_SOLID : CTA_SOFT"));
check('y la vista previa hace lo mismo, con el mismo criterio',
    preview.includes("b.role === 'primary' ? CTA_SOLID : CTA_SOFT"));
check('ninguna de las dos repite el azul lleno a mano',
    !ficha.includes('bg-rotary-blue text-white') && !preview.includes('bg-rotary-blue text-white'));
// La cuenta regresiva no se pulsa: reaccionar al cursor prometería algo que no
// va a pasar. Es la razón de ser del segundo parámetro de `ctaSkin`.
check('la cuenta regresiva va SIN hover', panel.includes('ctaSkin(CTA_SOFT, false)'));
// El mismo «Inscripciones» se pinta por dos caminos —el panel cuando el evento
// no tiene categorías, y la botonera cuando sí—: con pieles distintas se vería
// de dos maneras según una configuración que el visitante no conoce.
check('y el botón del panel va en la piel SÓLIDA, como el principal de la botonera',
    /button: ctaSkin\(CTA_SOLID\)/.test(panel));
// La Feria tiene identidad propia (dorado y azul marino) y se respeta: lo que
// se unifica es el tema POR DEFECTO, no toda personalización.
check('el tema propio de la Feria se conserva',
    leer('src/pages/RegistroFeria.tsx').includes("counter: 'bg-[#F7A81B] text-[#17458F]'"));

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
