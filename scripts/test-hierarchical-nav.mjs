#!/usr/bin/env node
// ════════════════════════════════════════════════════════════════════
// Prueba unitaria completa del Gestor de Menús Jerárquicos y Submenús
//
//   node scripts/test-hierarchical-nav.mjs
// ════════════════════════════════════════════════════════════════════
import assert from 'node:assert';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const outDir = mkdtempSync(join(tmpdir(), 'nav-test-'));
const BUILT = join(outDir, 'navigation.js');
process.on('exit', () => { try { rmSync(outDir, { recursive: true, force: true }); } catch { } });
execFileSync('npx', ['esbuild', 'src/lib/navigation.ts', `--outfile=${BUILT}`, '--format=esm', '--platform=neutral'], { stdio: 'pipe' });

const {
    normalizeNavItems,
    buildNavTree,
    flattenNavTree,
    getItemLevel,
    canSetParent,
    getValidParentCandidates,
    indentItem,
    outdentItem,
    reparentItem,
    deleteItemSafely,
    moveItem,
    MAX_NAV_LEVELS,
} = await import(BUILT);

let pass = 0, fail = 0;
const test = (name, fn) => {
    try {
        fn();
        console.log('  ✓', name);
        pass++;
    } catch (e) {
        console.error('  ✗', name, '\n      →', e.message);
        fail++;
    }
};

console.log('\n── 1. Normalización y Compatibilidad Hacia Atrás ──────────────');

test('normaliza lista legada plana sin IDs ni parentId', () => {
    const legacy = [
        { kind: 'fixed', key: 'inicio', label: 'Inicio', enabled: true },
        { kind: 'custom', label: 'Términos', href: '/', enabled: true },
        { kind: 'custom', label: 'Términos y Condiciones al Ganador Absoluto', href: 'https://pdf...', external: true, enabled: true },
    ];
    const normalized = normalizeNavItems(legacy);
    assert.equal(normalized.length, 3);
    assert.equal(normalized[0].id, 'fixed-inicio');
    assert.equal(normalized[0].parentId, null);
    assert.equal(normalized[1].parentId, null);
    assert.ok(normalized[1].id.length > 0);
    assert.equal(normalized[2].parentId, null);
    assert.equal(normalized[2].external, true);
});

test('conserva IDs y parentId existentes', () => {
    const items = [
        { id: 'item-1', kind: 'custom', label: 'Padre', href: '/padre', parentId: null },
        { id: 'item-2', kind: 'custom', label: 'Hijo', href: '/hijo', parentId: 'item-1' },
    ];
    const normalized = normalizeNavItems(items);
    assert.equal(normalized[0].id, 'item-1');
    assert.equal(normalized[1].parentId, 'item-1');
});

test('evita auto-referencias durante la normalización', () => {
    const bad = [{ id: 'bad-1', kind: 'custom', label: 'Bad', parentId: 'bad-1' }];
    const normalized = normalizeNavItems(bad);
    assert.equal(normalized[0].parentId, null);
});

console.log('\n── 2. Cálculo de Niveles y Límites Jerárquicos ────────────────');

test('calcula nivel 1 para elementos raíz', () => {
    const items = normalizeNavItems([
        { id: 'root-1', label: 'Inicio' },
        { id: 'root-2', label: 'Contacto' },
    ]);
    assert.equal(getItemLevel('root-1', items), 1);
    assert.equal(getItemLevel('root-2', items), 1);
});

test('calcula nivel 2 para submenús directos', () => {
    const items = normalizeNavItems([
        { id: 'root-1', label: 'Padre' },
        { id: 'sub-1', label: 'Submenú', parentId: 'root-1' },
    ]);
    assert.equal(getItemLevel('sub-1', items), 2);
});

test('calcula nivel 3 para sub-submenús', () => {
    const items = normalizeNavItems([
        { id: 'root-1', label: 'Abuelo' },
        { id: 'sub-1', label: 'Padre', parentId: 'root-1' },
        { id: 'sub-sub-1', label: 'Nieto', parentId: 'sub-1' },
    ]);
    assert.equal(getItemLevel('sub-sub-1', items), 3);
});

test('limita nivel máximo a MAX_NAV_LEVELS (3)', () => {
    const items = normalizeNavItems([
        { id: 'l1', label: 'Nivel 1' },
        { id: 'l2', label: 'Nivel 2', parentId: 'l1' },
        { id: 'l3', label: 'Nivel 3', parentId: 'l2' },
        { id: 'l4', label: 'Nivel 4 forzado', parentId: 'l3' },
    ]);
    assert.equal(getItemLevel('l4', items), 3);
});

console.log('\n── 3. Validación Anti-Ciclos y Límite de Profundidad ──────────');

test('rechaza que un elemento sea su propio padre', () => {
    const items = normalizeNavItems([{ id: 'a', label: 'Item A' }]);
    const check = canSetParent('a', 'a', items);
    assert.equal(check.allowed, false);
});

test('rechaza dependencias circulares directas (A -> B -> A)', () => {
    const items = normalizeNavItems([
        { id: 'a', label: 'Item A' },
        { id: 'b', label: 'Item B', parentId: 'a' },
    ]);
    // Intentar que A dependa de B
    const check = canSetParent('a', 'b', items);
    assert.equal(check.allowed, false);
});

test('rechaza dependencias circulares profundas (A -> B -> C -> A)', () => {
    const items = normalizeNavItems([
        { id: 'a', label: 'Item A' },
        { id: 'b', label: 'Item B', parentId: 'a' },
        { id: 'c', label: 'Item C', parentId: 'b' },
    ]);
    // Intentar que A dependa de C
    const check = canSetParent('a', 'c', items);
    assert.equal(check.allowed, false);
});

test('rechaza anidamiento superior a 3 niveles', () => {
    const items = normalizeNavItems([
        { id: 'l1', label: 'Nivel 1' },
        { id: 'l2', label: 'Nivel 2', parentId: 'l1' },
        { id: 'l3', label: 'Nivel 3', parentId: 'l2' },
        { id: 'new', label: 'Nuevo' },
    ]);
    // Intentar que 'new' sea hijo de l3 (sería nivel 4)
    const check = canSetParent('new', 'l3', items);
    assert.equal(check.allowed, false);
});

test('rechaza mover un elemento con hijos si el subárbol superaría 3 niveles', () => {
    const items = normalizeNavItems([
        { id: 'p1', label: 'Padre 1' },
        { id: 'c1', label: 'Hijo 1', parentId: 'p1' },
        { id: 'p2', label: 'Padre 2' },
        { id: 'c2', label: 'Hijo 2', parentId: 'p2' },
    ]);
    // p1 tiene al hijo c1. Si p1 pasa a ser hijo de c2 (que ya es nivel 2), p1 sería nivel 3 y c1 nivel 4
    const check = canSetParent('p1', 'c2', items);
    assert.equal(check.allowed, false);
});

console.log('\n── 4. Candidatos Válidos para Selección de Padre ──────────────');

test('obtiene únicamente candidatos seguros como elemento padre', () => {
    const items = normalizeNavItems([
        { id: 'root-1', label: 'Inicio' },
        { id: 'root-2', label: 'Nosotros' },
        { id: 'sub-2a', label: 'Historia', parentId: 'root-2' },
    ]);
    // Para root-2 (que tiene a sub-2a con altura 1):
    // Puede ser hijo de root-1 (nivel 1 -> root-2 nivel 2 -> sub-2a nivel 3).
    // NO puede ser hijo de sub-2a (su descendiente).
    const candidatesForRoot2 = getValidParentCandidates('root-2', items);
    const candidateIds = candidatesForRoot2.map(c => c.id);
    assert.deepEqual(candidateIds, ['root-1']);
});

console.log('\n── 5. Construcción y Aplanamiento del Árbol (NavTree) ─────────');

test('construye estructura de árbol con hijos anidados correctamente', () => {
    const items = normalizeNavItems([
        { id: 'inicio', label: 'Inicio', parentId: null },
        { id: 'nosotros', label: 'Nosotros', parentId: null },
        { id: 'mision', label: 'Misión', parentId: 'nosotros' },
        { id: 'vision', label: 'Visión', parentId: 'nosotros' },
        { id: 'contacto', label: 'Contacto', parentId: null },
    ]);
    const tree = buildNavTree(items);
    assert.equal(tree.length, 3); // inicio, nosotros, contacto
    assert.equal(tree[0].id, 'inicio');
    assert.equal(tree[1].id, 'nosotros');
    assert.equal(tree[1].children.length, 2);
    assert.equal(tree[1].children[0].id, 'mision');
    assert.equal(tree[1].children[1].id, 'vision');
    assert.equal(tree[2].id, 'contacto');
});

test('aplanamiento conserva orden de recorrido y relaciones', () => {
    const items = normalizeNavItems([
        { id: 'nosotros', label: 'Nosotros', parentId: null },
        { id: 'mision', label: 'Misión', parentId: 'nosotros' },
    ]);
    const tree = buildNavTree(items);
    const flat = flattenNavTree(tree);
    assert.equal(flat.length, 2);
    assert.equal(flat[0].id, 'nosotros');
    assert.equal(flat[0].parentId, null);
    assert.equal(flat[1].id, 'mision');
    assert.equal(flat[1].parentId, 'nosotros');
});

console.log('\n── 6. Acciones de Sangría (Indent / Outdent) ──────────────────');

test('indentItem convierte un elemento en submenú del elemento previo', () => {
    let items = normalizeNavItems([
        { id: 'terminos', label: 'Términos' },
        { id: 'pdf', label: 'Términos Ganador Absoluto' },
    ]);
    items = indentItem(1, items);
    assert.equal(items[1].parentId, 'terminos');
    assert.equal(getItemLevel('pdf', items), 2);
});

test('outdentItem promueve un submenú hacia el menú principal', () => {
    let items = normalizeNavItems([
        { id: 'terminos', label: 'Términos' },
        { id: 'pdf', label: 'Términos Ganador Absoluto', parentId: 'terminos' },
    ]);
    items = outdentItem(1, items);
    assert.equal(items[1].parentId, null);
    assert.equal(getItemLevel('pdf', items), 1);
});

console.log('\n── 7. Eliminación Segura (Promoción de Huérfanos) ─────────────');

test('deleteItemSafely promueve submenús directos al padre del elemento borrado', () => {
    const items = normalizeNavItems([
        { id: 'padre', label: 'Padre', parentId: null },
        { id: 'hijo', label: 'Hijo', parentId: 'padre' },
        { id: 'nieto', label: 'Nieto', parentId: 'hijo' },
    ]);
    // Eliminar 'hijo': 'nieto' debe ser promovido a hijo de 'padre'
    const afterDelete = deleteItemSafely('hijo', items);
    assert.equal(afterDelete.length, 2);
    const nieto = afterDelete.find(i => i.id === 'nieto');
    assert.ok(nieto);
    assert.equal(nieto.parentId, 'padre');
    assert.equal(getItemLevel('nieto', afterDelete), 2);
});

console.log('\n── 8. Caso Real: Jaque Mate a la Polio ────────────────────────');

test('estructura requerida para Jaque Mate a la Polio funciona a la perfección', () => {
    const jaqueMateNav = normalizeNavItems([
        { kind: 'fixed', key: 'inicio', label: 'Inicio', enabled: true },
        { kind: 'custom', label: 'Maneras de Contribuir', href: '/maneras-de-contribuir', enabled: true },
        { id: 'terminos', kind: 'custom', label: 'Términos', href: '/', enabled: true },
        {
            id: 'terminos-ganador-absoluto',
            kind: 'custom',
            label: 'Términos y Condiciones al Ganador Absoluto',
            href: 'https://rotary-platform-assets.s3.us-east-1.amazonaws.com/clubs/3032b804-c726-4303-91e8-0f24d19ae3e1/documents/1791465933083-Terminos-y-condiciones-del-Ganador-Absoluto-III-Open-IRT-Jaque-Mate.pdf',
            external: true,
            enabled: true,
            parentId: 'terminos',
        },
        { kind: 'fixed', key: 'contacto', label: 'Contacto', enabled: true },
    ]);

    const tree = buildNavTree(jaqueMateNav);
    assert.equal(tree.length, 4); // inicio, maneras de contribuir, terminos, contacto

    const terminosNode = tree.find(n => n.id === 'terminos');
    assert.ok(terminosNode, 'El menú Términos debe estar presente como menú principal');
    assert.equal(terminosNode.children.length, 1, 'Términos debe tener exactamente 1 submenú');

    const subItem = terminosNode.children[0];
    assert.equal(subItem.id, 'terminos-ganador-absoluto');
    assert.equal(subItem.label, 'Términos y Condiciones al Ganador Absoluto');
    assert.equal(subItem.external, true);
    assert.ok(subItem.href.includes('Terminos-y-condiciones-del-Ganador-Absoluto-III-Open-IRT-Jaque-Mate.pdf'));
    assert.equal(subItem.level, 2);
});

console.log(`\n========================================`);
console.log(`Pruebas completadas: ${pass} exitosas, ${fail} fallidas.`);
if (fail > 0) process.exit(1);
