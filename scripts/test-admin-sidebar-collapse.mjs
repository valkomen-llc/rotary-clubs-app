// ════════════════════════════════════════════════════════════════════
// test:admin:sidebar-collapse — la barra lateral minimizable (v4.1333), sin
// navegador: invariantes leídas de los archivos. Corre en `prebuild`. La
// prueba en navegador es `test:admin:sidebar-collapse:ui`.
// ════════════════════════════════════════════════════════════════════
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const REPO = new URL('..', import.meta.url).pathname.replace(/\/$/, '');
const read = (p) => readFileSync(`${REPO}/${p}`, 'utf8');
let n = 0;
const ok = (c, m) => { assert.ok(c, m); n++; console.log(`  ✓ ${m}`); };

const lib = read('src/components/admin/sidebarCollapse.tsx');
const layout = read('src/components/admin/AdminLayout.tsx');

ok(/\(min-width: 1024px\)/.test(lib) && /mini: collapsed && isDesktop/.test(lib), 'minimizar sólo aplica en escritorio (≥ 1024 px): el cajón del teléfono va entero');
ok(/try \{ return sessionStorage\.getItem\(SIDEBAR_EXPANDED_KEY\) !== '1'; \} catch \{ return true; \}/.test(lib), 'arranca MINIMIZADA: sólo la marca de esta pestaña la abre, y si el almacenamiento falla, minimizada (v4.1341)');
ok(!/localStorage/.test(lib.replace(/\/\/.*$/gm, '')), 'la preferencia vieja de localStorage ya no se lee ni se escribe (v4.1341)');
ok(/setCollapsed\(c => \{/.test(lib), 'alternar usa el estado actual (funciona aunque el almacenamiento falle)');
ok(/className="pointer-events-none fixed z-\[200\]/.test(lib) && /role="tooltip"/.test(lib), 'el título flotante es fijo (la lista con overflow no lo recorta) y es un tooltip accesible');
ok(/onFocus: show\(label\)/.test(lib) && /onBlur: hide/.test(lib), 'el título aparece también con el teclado');
ok(/<SidebarTooltip tip=\{navTip\.tip\} \/>/.test(layout) && layout.indexOf('<SidebarTooltip') > layout.indexOf('</aside>'), 'el globo se pinta FUERA de la barra');
ok(/aria-label="Minimizar menú"/.test(layout) && /hidden lg:inline-flex/.test(layout), 'botón «Minimizar menú» sólo en escritorio');
ok(/aria-label="Maximizar menú"/.test(layout), 'botón «Maximizar menú» en la barra minimizada');
ok(/aria-label=\{mini \? item\.label : undefined\}/.test(layout) && /\{\.\.\.navTip\.propsFor\(item\.label\)\}/.test(layout), 'cada ícono conserva su nombre accesible y su título');
ok(/\{!mini && <span className="flex-1">\{item\.label\}<\/span>\}/.test(layout), 'minimizada: sólo íconos');
ok(/\$\{mini \? 'lg:w-20' : ''\}/.test(layout), 'ancho 80 px minimizada, 288 px maximizada');
ok(/miniRef\.current/.test(layout) && /sidebar\.setCollapsed\(false\)/.test(layout), '⌘K maximiza antes de enfocar el buscador');
ok(/\{mini && \(\s*<Link to="\/"[^>]*data-logo-encabezado/.test(layout) && layout.indexOf('data-logo-encabezado') < layout.indexOf('{currentPageTitle}</h2>'), 'minimizada, el logotipo va en el encabezado, antes del título (v4.1334)');
const miniBlock = layout.slice(layout.indexOf('{mini ? ('), layout.indexOf('/* Brand Header */'));
ok(!/<img /.test(miniBlock), 'la barra minimizada no pinta el logotipo (no se duplica ni se vuelve ilegible)');
ok(!/const \w+ = \(\) => \(?\s*<aside/.test(layout), 'ningún componente declarado dentro del layout');

console.log(`\n✅ ${n} comprobaciones, todas en verde.`);
