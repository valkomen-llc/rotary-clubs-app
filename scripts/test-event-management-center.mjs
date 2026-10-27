#!/usr/bin/env node
// ════════════════════════════════════════════════════════════════════
// Centro de Gestión del Evento.  npm run test:management-center
// v4.1259.0
//
// Sin base, sin red. Comprueba lo que hace que el Centro de Gestión del
// dashboard NO sea una segunda implementación: que monte los módulos de
// siempre, que sus cifras salgan de los endpoints de esos módulos, que los
// filtros nuevos vivan en el servidor del módulo (y por tanto también en sus
// exportaciones) y que los dos procesos no se mezclen.
// ════════════════════════════════════════════════════════════════════
import { readFileSync } from 'node:fs';

let pass = 0, fail = 0;
const ok = (name, cond) => { if (cond) { pass++; console.log(`  ✓ ${name}`); } else { fail++; console.log(`  ✗ ${name}`); } };
const leer = (rel) => readFileSync(new URL(`../${rel}`, import.meta.url), 'utf8');

console.log('\n1. Reutiliza los módulos, no los copia');
const centro = leer('src/components/admin/feria/EventManagementCenter.tsx');
ok('monta PostulacionesPagos en modo embebido',
    /import\('\.\.\/\.\.\/\.\.\/pages\/admin\/PostulacionesPagos'\)/.test(centro) && /<PostulacionesPagos embedded eventId=\{eventId\} \/>/.test(centro));
ok('monta la pantalla de Inscripciones del módulo de Eventos',
    /import EventRegistrationTab from '\.\.\/events\/EventRegistrationTab'/.test(centro) && /view="inscripciones"/.test(centro));
const endpoints = [...centro.matchAll(/\$\{API\}(\/[\w\-/]+)/g)].map(m => m[1]);
ok('las cifras salen SÓLO de los tableros de los dos módulos',
    JSON.stringify([...new Set(endpoints)].sort()) === JSON.stringify(['/event-registrations/admin/dashboard', '/project-fair/admin/inteligencia']));
ok('no escribe nada: sin POST, PUT, PATCH ni DELETE', !/method:\s*'(POST|PUT|PATCH|DELETE)'/.test(centro));
ok('un 403/404 oculta el módulo en vez de mostrar una lista vacía',
    /res\.status === 403 \|\| res\.status === 404/.test(centro) && /status: 'denied'/.test(centro));
ok('un fallo se dice con «Reintentar»', /Reintentar/.test(centro));
ok('los textos de estado vacío del pedido',
    /Todavía no hay proyectos postulados para esta edición\./.test(centro) && /Todavía no hay participantes inscritos\./.test(centro));

console.log('\n2. El dashboard');
const dash = leer('src/pages/admin/ProjectFairDashboard.tsx');
ok('la pestaña vive en la URL (?panel=) y «atrás» funciona',
    /searchParams\.set\('panel', next\)/.test(dash) && /addEventListener\('popstate'/.test(dash));
ok('los indicadores y gráficos de siempre siguen en el Resumen',
    /\{panel === 'resumen' && \(<>/.test(dash) && /ÁREA 4: GRÁFICAS DE CRECIMIENTO/.test(dash));
ok('al volver al Resumen se revalidan las cifras',
    /if \(next === 'resumen'\) \{ setRefreshKey\(k => k \+ 1\); fetchDashboard\(true\); \}/.test(dash));

console.log('\n3. El módulo de postulaciones, embebible sin cambiar su página');
const post = leer('src/pages/admin/PostulacionesPagos.tsx');
ok('la edición embebida se fija y se suelta al desmontar',
    /embeddedEventId = embedEventId;\s*return \(\) => \{ embeddedEventId = null; \};/.test(post));
ok('el marco de página está fuera del componente', /^const Frame = /m.test(post));
ok('sin `embedded` la página es la de siempre (lee ?evento= de la URL)',
    /embeddedEventId \|\| new URLSearchParams\(window\.location\.search\)\.get\('evento'\)/.test(post));

console.log('\n4. Los filtros viven en el servidor de cada módulo');
const pf = leer('server/controllers/projectFairAdminController.js');
for (const v of ['postulados', 'en_revision', 'requieren_ajustes', 'aprobados', 'rechazados', 'pago_pendiente', 'pago_confirmado']) {
    ok(`vista de proyectos «${v}»`, new RegExp(`\\{ key: '${v}', label:`).test(pf) && new RegExp(`^\\s+${v}: `, 'm').test(pf));
}
const ev = leer('server/controllers/eventRegistrationAdminController.js');
const iFiltros = ev.indexOf('const buildFilters');
const iAcred = ev.indexOf("query.accredited === 'yes'");
ok('inscripciones: acreditados y pendientes de acreditación', iAcred > 0 && /query\.accredited === 'no'/.test(ev));
ok('el filtro está en buildFilters, así alcanza también a tablero y exportaciones',
    iFiltros > 0 && iAcred > iFiltros && iAcred < ev.indexOf('includeDrafts', iFiltros));
const mgr = leer('src/components/admin/events/EventRegistrationsManager.tsx');
for (const f of ['Todos', 'Pago confirmado', 'Pago pendiente', 'Con acompañantes', 'Sin acompañantes', 'Acreditados', 'Pendientes de acreditación']) {
    ok(`filtro rápido «${f}»`, mgr.includes(`label: '${f}'`));
}

console.log(`\n${fail ? '❌' : '✅'} test:management-center — ${pass} pasaron, ${fail} fallaron.`);
process.exit(fail ? 1 : 0);
