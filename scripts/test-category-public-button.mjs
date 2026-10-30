// ════════════════════════════════════════════════════════════════════
// Mostrar u ocultar el botón de una categoría en la ficha pública — v4.1266
//
// Sin base, sin credenciales y sin red. Comprueba el CRITERIO:
//
//   1. Una categoría existente (sin el dato, o con nulo) sigue VISIBLE. Sólo
//      `false` explícito la esconde.
//   2. Esconder el botón es SÓLO visibilidad: el botón sale `hidden` aunque
//      tenga mensaje de cierre, y la categoría sigue abierta.
//   3. Cada categoría es independiente: esconder una no esconde las demás, y
//      si se esconde «Etapa 1» pasa «Etapa 2» de la MISMA audiencia — nunca
//      una de otra audiencia (manda el idioma, v4.652).
//   4. La columna nueva está enumerada en el atajo del ensure (trampa v4.908).
//   5. La ficha: sin botón de categoría, el secundario (COLROTARIOS) pasa a
//      ser la acción principal y no queda ningún contenedor vacío.
//
//   npm run test:category-public-button
// ════════════════════════════════════════════════════════════════════
import { readFileSync, unlinkSync } from 'node:fs';
import { pathToFileURL } from 'node:url';
import { build } from 'esbuild';
import {
    normalizeCategory, resolveCtaButtons, categoryWindow,
} from '../server/lib/eventRegistrationSpec.js';

let ok = 0; const malos = [];
const check = (n, c, e = '') => {
    if (c) { ok++; console.log(`  ✓ ${n}`); }
    else { malos.push(n); console.log(`  ✗ ${n}${e ? ` — ${e}` : ''}`); }
};
const grupo = t => console.log(`\n${t}`);
const leer = f => readFileSync(f, 'utf8');

// La forma en que el controlador público le pasa las categorías a los botones.
const cat = (key, extra = {}) => ({
    ...normalizeCategory({ key, name: key, audience: 'national', currency: 'COP', price: 850000, ...extra }),
    remaining: null,
});

grupo('1. Las categorías existentes no cambian');
check('sin el dato → visible', normalizeCategory({ key: 'a' }).showPublicButton === true);
check('con null → visible', normalizeCategory({ key: 'a', showPublicButton: null }).showPublicButton === true);
check('con true → visible', normalizeCategory({ key: 'a', showPublicButton: true }).showPublicButton === true);
check('sólo false la esconde', normalizeCategory({ key: 'a', showPublicButton: false }).showPublicButton === false);

const config = {
    buttons: [
        { key: 'etapa1', categoryKey: 'etapa_1', label: 'Inscripción - Etapa 1', role: 'primary', audience: 'national', order: 1 },
        { key: 'etapa2', categoryKey: 'etapa_2', label: 'Inscripción - Etapa 2', role: 'primary', audience: 'national', order: 2 },
        { key: 'intl', categoryKey: 'internacional', label: 'Registro Internacional', role: 'primary', audience: 'international', order: 3 },
        { key: 'acomp', categoryKey: 'acompanantes', label: 'Acompañantes', role: 'secondary', order: 4, unavailableMessage: 'Cerrado' },
    ],
};
const base = () => [
    cat('etapa_1'), cat('etapa_2'),
    cat('internacional', { audience: 'international', currency: 'USD', price: 250 }),
    cat('acompanantes'),
];

grupo('2. Con todo visible, los botones son los de siempre');
{
    const r = resolveCtaButtons({ categories: base(), config, audience: 'national' });
    check('principal = Etapa 1', r.primary?.categoryKey === 'etapa_1', r.primary?.categoryKey);
    check('principal visible y con precio', r.primary && !r.primary.hidden && r.primary.price === 850000);
    check('sin marca de oculto', !r.primary?.hiddenByAdmin);
    check('secundario visible', r.secondary.length === 1 && !r.secondary[0].hidden);
}

grupo('3. Ocultar «Etapa 1»');
{
    const cats = base();
    cats[0] = cat('etapa_1', { showPublicButton: false });
    cats[1] = cat('etapa_2', { showPublicButton: false });
    const r = resolveCtaButtons({ categories: cats, config, audience: 'national' });
    check('el principal sale oculto', r.primary?.hidden === true, JSON.stringify(r.primary));
    check('marcado como oculto por el administrador', r.primary?.hiddenByAdmin === true);
    check('NO cae al registro internacional para un visitante nacional', r.primary?.categoryKey !== 'internacional');
    check('el secundario no se ve afectado', r.secondary.length === 1 && !r.secondary[0].hidden);
    check('la categoría sigue abierta (disponibilidad intacta)', categoryWindow(cats[0]).open === true);
    check('su enlace directo sigue existiendo', r.primary?.href === '/registro?categoria=etapa_1');
}
{
    const cats = base();
    cats[0] = cat('etapa_1', { showPublicButton: false });
    const r = resolveCtaButtons({ categories: cats, config, audience: 'national' });
    check('con «Etapa 2» visible, pasa a ser el principal', r.primary?.categoryKey === 'etapa_2' && !r.primary.hidden,
        r.primary?.categoryKey);
    const intl = resolveCtaButtons({ categories: cats, config, audience: 'international' });
    check('el visitante internacional sigue viendo el suyo', intl.primary?.categoryKey === 'internacional' && !intl.primary.hidden);
}
{
    const cats = base();
    cats[3] = cat('acompanantes', { showPublicButton: false });
    const r = resolveCtaButtons({ categories: cats, config, audience: 'national' });
    check('oculto aunque tenga mensaje de cierre', r.secondary[0]?.hidden === true && r.secondary[0]?.hiddenByAdmin === true);
    check('esconder el secundario no toca al principal', r.primary?.categoryKey === 'etapa_1' && !r.primary.hidden);
}

grupo('4. La base');
{
    const ensure = leer('server/lib/ensureEventRegistrationSchema.js');
    check('la columna se crea con DEFAULT true y NOT NULL',
        /addColumn\('EventRegistrationCategory', 'showPublicButton', 'BOOLEAN NOT NULL DEFAULT true'\)/.test(ensure));
    check('y está enumerada en el atajo',
        /OWNED_CATEGORY_COLUMNS = \[[^\]]*'showPublicButton'/.test(ensure));
    check('el atajo la comprueba', /\[OWNED_CATEGORY_COLUMNS\]/.test(ensure));
    const store = leer('server/lib/eventRegistrationStore.js');
    check('el upsert la escribe', /"showPublicButton" = EXCLUDED\."showPublicButton"/.test(store));
    check('la lectura la trae', /showPublicButton: row\.showPublicButton/.test(store));
    check('el controlador público la pasa a los botones',
        /showPublicButton: category\.showPublicButton !== false/.test(leer('server/controllers/eventRegistrationController.js')));
}

grupo('5. La ficha pública');
{
    const bundleFile = `scripts/.tmp-category-public-button-${process.pid}.mjs`;
    await build({
        stdin: {
            contents: `
                import { createElement as h } from 'react';
                import { renderToStaticMarkup } from 'react-dom/server';
                import { MemoryRouter } from 'react-router-dom';
                import RegistrationPanel from './src/components/RegistrationPanel';
                import EventRegistrationCta, { ctaHiddenByAdmin, hasVisibleCta } from './src/components/EventRegistrationCta';
                export const render = (props) => renderToStaticMarkup(h(MemoryRouter, null, h(RegistrationPanel, props)));
                export const renderCta = (cta) => renderToStaticMarkup(h(MemoryRouter, null, h(EventRegistrationCta, { cta, eventRef: 'villavicencio2027' })));
                export { ctaHiddenByAdmin, hasVisibleCta };
            `,
            resolveDir: process.cwd(), loader: 'tsx',
        },
        // Los paquetes quedan fuera del bundle y se resuelven desde
        // node_modules: por eso el archivo va junto a este script y se borra.
        bundle: true, format: 'esm', platform: 'node', jsx: 'automatic',
        packages: 'external', outfile: bundleFile, logLevel: 'silent',
    });
    let m;
    try { m = await import(pathToFileURL(bundleFile).href); }
    finally { try { unlinkSync(bundleFile); } catch { /* ya no está */ } }

    const cats = base();
    cats[0] = cat('etapa_1', { showPublicButton: false });
    cats[1] = cat('etapa_2', { showPublicButton: false });
    const hidden = resolveCtaButtons({ categories: cats, config: { buttons: config.buttons.slice(0, 2) }, audience: 'national' });
    check('sin botones visibles', !m.hasVisibleCta(hidden));
    check('ctaHiddenByAdmin lo reconoce', m.ctaHiddenByAdmin(hidden) === true);
    check('la botonera no pinta nada (ni contenedor vacío)', m.renderCta(hidden) === '');
    const closed = resolveCtaButtons({
        categories: [cat('etapa_1', { closesAt: '2000-01-01' })],
        config: { buttons: config.buttons.slice(0, 1) }, audience: 'national',
    });
    check('una categoría CERRADA no se confunde con oculta', m.ctaHiddenByAdmin(closed) === false);

    const visible = resolveCtaButtons({ categories: base(), config, audience: 'national' });
    const conBoton = m.renderCta(visible);
    check('visible: botón y precio en el mismo bloque',
        conBoton.includes('Inscripción - Etapa 1') && /850\.000/.test(conBoton), conBoton.slice(0, 200));

    const colrotarios = { secondaryLabel: 'Aporte realizado desde COLROTARIOS', secondaryLink: 'https://colrotarios.org/aportes' };
    const solo = m.render({ title: 'XIII Conferencia', subtitle: 'Villavicencio', startDate: '2099-05-28T00:00:00Z', ...colrotarios });
    const aSolo = solo.match(/<a [^>]*>Aporte realizado desde COLROTARIOS<\/a>/)?.[0] || '';
    check('COLROTARIOS sigue visible y con su enlace', aSolo.includes('href="https://colrotarios.org/aportes"'));
    check('…pasa a la piel sólida (acción principal)', aSolo.includes('bg-rotary-blue'), aSolo);
    check('…a todo el ancho de la columna', !aSolo.includes('max-w-[220px]') && aSolo.includes('w-full'), aSolo);
    check('…sin el margen negativo de la pareja', !aSolo.includes('-mt-2.5'));
    check('el contador regresivo se mantiene', solo.includes('Días') && solo.includes('Segundos'));
    check('va inmediatamente debajo del contador',
        solo.indexOf('Segundos') < solo.indexOf('COLROTARIOS') && !/Inscripci/.test(solo));

    const pareja = m.render({ ...colrotarios, actions: 'BOTONERA' });
    const aPareja = pareja.match(/<a [^>]*>Aporte realizado desde COLROTARIOS<\/a>/)?.[0] || '';
    check('con el botón de inscripción visible, COLROTARIOS queda como antes (suave, 220 px)',
        aPareja.includes('bg-sky-100') && aPareja.includes('max-w-[220px]') && aPareja.includes('-mt-2.5'), aPareja);
}

grupo('6. El panel de administración');
{
    const ui = leer('src/components/admin/events/EventCategoriesManager.tsx');
    check('el interruptor existe con el nombre pedido',
        ui.includes('Mostrar botón de inscripción en la página pública') && ui.includes('role="switch"'));
    check('con el texto explicativo',
        ui.includes('Ocultarlo no elimina la categoría ni afecta las inscripciones o pagos existentes.'));
    check('la etiqueta «Oculto» en la cabecera', ui.includes('Oculto en la página pública'));
    check('una categoría nueva nace visible', /showPublicButton: true/.test(ui));
}

console.log(`\n${ok} correctas, ${malos.length} fallidas`);
if (malos.length) process.exit(1);
