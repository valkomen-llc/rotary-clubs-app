// ════════════════════════════════════════════════════════════════════
// Director Creativo IA — el CRITERIO — v4.838
//
// Prueba `creativeDNA.js` (puro) y la parte medible de `creativeAnalysis.js`.
// NO necesita base, credenciales ni red: el DNA se arma con datos escritos acá
// y las imágenes se generan con sharp en el momento.
//
// Los números que se comprueban están MEDIDOS contra casos donde se sabe la
// respuesta —un fondo liso con texto, una textura tipo fotografía, las propias
// composiciones del módulo— y no puestos a ojo. Es la regla del sitio: al
// ajustar un umbral, medirlo.
//
//   npm run test:creative
// ════════════════════════════════════════════════════════════════════

import { readFileSync } from 'node:fs';
import {
    DNA_VERSION, ZONE_ROLES, ZONE_BANDS, TYPE_CHARACTERS, TYPE_JUMPS, FOOT_STYLES, PHOTO_MASKS,
    TITLE_SCALE_RANGE, ACCENT_MIN_CHROMA, ACCENT_MIN_DISTANCE,
    luminance, contrastRatio, chroma, rgbDistance,
    normalizeMeasured, normalizeDescribed, mergePalettes, consolidate,
    deriveBrand, deriveStyle, applyProfile, mergeBranding, isHeadlineNode,
    legibilityScore, densityScore, brandComplianceScore, styleConsistencyScore, scorePiece,
} from '../server/lib/creativeDNA.js';
import { templateFor, CAMPAIGN_TEMPLATES } from '../server/lib/campaignTemplates.js';
import { compileTemplate, FONTS, MASK_SHAPES } from '../server/lib/designSpec.js';

let ok = 0; const malos = [];
const check = (n, cond, extra = '') => {
    if (cond) { ok++; console.log(`  ✓ ${n}`); }
    else { malos.push(n); console.log(`  ✗ ${n}${extra ? ` — ${extra}` : ''}`); }
};
const grupo = (t) => console.log(`\n${t}`);

// ─── Catálogos ─────────────────────────────────────────────────────────

grupo('Los catálogos son CERRADOS');
check('el modelo no puede inventar un rol de zona',
    normalizeDescribed({ zonas: [{ rol: 'banner-lateral' }, { rol: 'foto' }] }).zonas.length === 1);
check('y lo descartado se REPORTA, no se traga',
    normalizeDescribed({ zonas: [{ rol: 'banner-lateral' }] }).descartes.length === 1);
check('un carácter desconocido cae al neutro, no rompe',
    normalizeDescribed({ caracter: 'art-deco' }).caracter === 'grotesca-normal');
check('una zona repetida no duplica: la primera manda',
    normalizeDescribed({ zonas: [{ rol: 'foto', banda: 'superior' }, { rol: 'foto', banda: 'inferior' }] }).zonas.length === 1);
check('las máscaras del DNA son las de designSpec más «ninguna»',
    PHOTO_MASKS.length === MASK_SHAPES.length + 1 && MASK_SHAPES.every(m => PHOTO_MASKS.includes(m)));
check('la escala del titular está acotada por arriba y por abajo',
    TITLE_SCALE_RANGE.min > 0.5 && TITLE_SCALE_RANGE.max < 2);

grupo('Lo medido se acota, no se cree');
{
    const m = normalizeMeasured({
        paleta: [{ hex: 'no-es-un-color', cobertura: 0.9 }, { hex: '#abc', cobertura: 0.5 }, { hex: '#0B2B5C', cobertura: 2 }],
        tintaCobertura: -3, fotoCobertura: 9, contrasteMin: 900,
    });
    check('un color ilegible se descarta', m.paleta.every(c => /^#[0-9A-F]{6}$/.test(c.hex)));
    check('la forma corta de un color se expande', m.paleta.some(c => c.hex === '#AABBCC'));
    check('las coberturas se acotan a 0-1', m.tintaCobertura === 0 && m.fotoCobertura === 1);
    check('el contraste se acota a la escala real (1-21)', m.contrasteMin === 21);
    check('la paleta sale ordenada por cobertura', m.paleta[0].cobertura >= m.paleta[1].cobertura);
}

// ─── Color ─────────────────────────────────────────────────────────────

grupo('El acento se DISTINGUE del fondo, no sólo contrasta');
// El caso que obligó a cambiar el criterio: el rojo de las referencias sobre su
// azul marino da un contraste WCAG de 2,37 —por debajo del 3 que pide el
// estándar hasta para texto grande— y se ve perfectamente, porque lo que los
// separa es el TONO.
check('el rojo sobre azul marino contrasta POCO en luminancia',
    contrastRatio('#C8102E', '#0C2A5E') < 3, contrastRatio('#C8102E', '#0C2A5E').toFixed(2));
check('…y aun así se elige como acento, que es lo que hacen las referencias',
    deriveBrand([{ hex: '#0C2A5E', cobertura: .86 }, { hex: '#C8102E', cobertura: .11 }, { hex: '#F7A81B', cobertura: .02 }]).accent === '#C8102E');
check('un TINTE del propio fondo NO es un acento',
    deriveBrand([{ hex: '#5B1A22', cobertura: .8 }, { hex: '#8F5F5C', cobertura: .2 }]).accent === null);
check('el rojo institucional está muy por encima del piso de saturación',
    chroma('#C8102E') >= ACCENT_MIN_CHROMA * 1.8, chroma('#C8102E').toFixed(2));
check('el malva está muy por debajo', chroma('#8F5F5C') < ACCENT_MIN_CHROMA, chroma('#8F5F5C').toFixed(2));
check('la distancia también manda: un tono casi igual no separa',
    rgbDistance('#0C2A5E', '#0D2B60') < ACCENT_MIN_DISTANCE);
check('la tinta se elige por LEGIBILIDAD, no de la paleta: sobre claro va oscura',
    deriveBrand([{ hex: '#F2F2F2', cobertura: .7 }, { hex: '#1E7A3C', cobertura: .3 }]).ink === '#0F1E3D');
check('y sobre oscuro, blanca',
    deriveBrand([{ hex: '#0C2A5E', cobertura: 1 }]).ink === '#FFFFFF');
check('sin paleta no se inventa una marca', deriveBrand([]) === null);
check('la luminancia sigue la fórmula del estándar (blanco 1, negro 0)',
    Math.abs(luminance('#FFFFFF') - 1) < 1e-6 && luminance('#000000') === 0);

grupo('Las paletas de varias referencias se juntan por CERCANÍA');
{
    // Dos piezas de la misma campaña usan «el mismo azul» y el JPEG lo devuelve
    // con dos o tres unidades de diferencia. Sin agrupar, la paleta saldría con
    // seis azules casi iguales y ningún acento.
    const p = mergePalettes([
        [{ hex: '#0B2B5C', cobertura: .6 }, { hex: '#C8102E', cobertura: .1 }],
        [{ hex: '#0C2A5E', cobertura: .65 }, { hex: '#C4102A', cobertura: .08 }],
    ]);
    check('los dos azules casi iguales se funden en uno', p.filter(c => c.hex.startsWith('#0')).length === 1);
    check('y los dos rojos también', p.filter(c => c.hex.startsWith('#C')).length === 1);
    check('el tono del grupo es el de MAYOR cobertura, no un promedio inventado',
        p.some(c => c.hex === '#0C2A5E'), p.map(c => c.hex).join(','));
    check('las coberturas quedan normalizadas', Math.abs(p.reduce((s, c) => s + c.cobertura, 0) - 1) < 1e-6);
}

// ─── Consolidación ─────────────────────────────────────────────────────

const REF = (over = {}) => ({
    measured: { paleta: [{ hex: '#0B2B5C', cobertura: .8 }, { hex: '#C8102E', cobertura: .12 }], tintaCobertura: 0.18, fotoCobertura: 0.3, contrasteMin: 9, proporcion: '4:5' },
    described: { zonas: [{ rol: 'foto', banda: 'superior', lado: 'derecha', borde: 'curva' }], caracter: 'condensada-pesada', saltoTipografico: 'extremo', pie: 'curvo', ...over },
});

grupo('Consolidar es aritmética, no una opinión de un modelo');
{
    const dna = consolidate([REF(), REF(), REF({ caracter: 'serif-institucional' })]);
    check('el DNA declara su versión', dna.version === DNA_VERSION);
    check('lo categórico se decide por MODA: dos contra uno', dna.derived.fontTitular === 'condensed');
    check('lo numérico por MEDIANA, no por media', dna.measured.tintaCobertura === 0.18);
    check('una zona vista en menos de la mitad de las referencias NO es un rasgo',
        consolidate([REF(), REF({ zonas: [] }), REF({ zonas: [] })]).described.zonas.length === 0);
    check('sin ninguna descripción el perfil vale igual, con lo medido',
        !!consolidate([{ measured: REF().measured }, { measured: REF().measured }])?.derived?.brand);
    check('y entonces el derivado cae a lo neutro, no a algo inventado',
        consolidate([{ measured: REF().measured }])?.derived?.fontTitular === 'brand');
    check('sin nada legible no hay perfil', consolidate([{}, {}]) === null);
}

grupo('El derivado traduce con tablas cerradas');
{
    const d = deriveStyle({ measured: REF().measured, described: normalizeDescribed(REF().described) });
    check('«condensada-pesada» da la condensada empaquetada', d.fontTitular === 'condensed');
    check('el cuerpo siempre va en la de marca', d.fontTexto === 'brand');
    check('«extremo» agranda el titular', d.escalaTitular > 1);
    check('«plano» lo achica', deriveStyle({ described: normalizeDescribed({ saltoTipografico: 'plano' }) }).escalaTitular < 1);
    check('una foto con borde curvo arriba a la derecha da el barrido',
        d.mascaraFoto === 'sweep');
    check('a la izquierda, el barrido espejado',
        deriveStyle({ described: normalizeDescribed({ zonas: [{ rol: 'foto', banda: 'superior', lado: 'izquierda', borde: 'curva' }] }) }).mascaraFoto === 'sweepLeft');
    check('un borde recto no recorta nada',
        deriveStyle({ described: normalizeDescribed({ zonas: [{ rol: 'foto', borde: 'recta' }] }) }).mascaraFoto === 'ninguna');
    check('las familias que elige EXISTEN en el catálogo del compositor',
        FONTS.some(f => f.id === d.fontTitular) && FONTS.some(f => f.id === d.fontTexto));
}

// ─── Aplicar ───────────────────────────────────────────────────────────

grupo('Aplicar el perfil MODULA; no mueve ningún recuadro');
{
    const dna = consolidate([REF({ caracter: 'serif-institucional', saltoTipografico: 'plano', pie: 'recto', zonas: [{ rol: 'foto', borde: 'recta' }] }), REF({ caracter: 'serif-institucional', saltoTipografico: 'plano', pie: 'recto', zonas: [{ rol: 'foto', borde: 'recta' }] })]);
    for (const tpl of CAMPAIGN_TEMPLATES) {
        const mod = applyProfile(tpl, dna);
        const movido = mod.nodes.some((n, i) => {
            const o = tpl.nodes[i];
            return n.id !== o.id || n.x !== o.x || n.y !== o.y || n.w !== o.w || n.h !== o.h;
        });
        if (movido) { check(`«${tpl.id}»: ningún recuadro se mueve`, false); break; }
    }
    check('ninguna de las diez composiciones cambia de geometría con un perfil aplicado',
        CAMPAIGN_TEMPLATES.every(tpl => applyProfile(tpl, dna).nodes.every((n, i) => {
            const o = tpl.nodes[i];
            return n.id === o.id && n.x === o.x && n.y === o.y && n.w === o.w && n.h === o.h;
        })));

    const base = templateFor('impacto_estadistico', 'post_1_1');
    const mod = applyProfile(base, dna);
    const nodo = (t, id) => t.nodes.find(n => n.id === id);
    check('el titular toma la familia del perfil', nodo(mod, 'titulo').fontFamily === 'serif');
    check('y su tamaño se escala', nodo(mod, 'titulo').fontSize < nodo(base, 'titulo').fontSize);
    check('el VALOR de una cifra es titular', nodo(mod, 'cifra1').fontFamily === 'serif');
    // El defecto que se encontró probando: valor y etiqueta declaran el MISMO
    // `role`, así que por rol la etiqueta recibía la letra de titular.
    check('pero su ETIQUETA es cuerpo, no titular', nodo(mod, 'cifra1_label').fontFamily === 'brand');
    check('y su fuente también', nodo(mod, 'cifra1_fuente').fontFamily === 'brand');
    check('la fotografía deja de recortarse en curva si la referencia es recta',
        nodo(mod, 'foto').mask === null);
    check('y el VELO sigue el mismo recorte, o queda un escalón',
        nodo(mod, 'velo').shape === 'rect');
    check('el pie cambia de forma pero NO desaparece: es la firma institucional',
        nodo(mod, 'pie_banda').shape === 'rect' && !!nodo(mod, 'pie_banda'));
    check('los escudos de la familia Rotary siguen ahí',
        mod.nodes.filter(n => /^familia\d$/.test(n.id)).length === 4);
    check('sin perfil, la plantilla sale intacta', applyProfile(base, null) === base);
}

grupo('La distinción titular/cuerpo sale del id, no sólo del rol');
check('cifra1 es titular', isHeadlineNode({ id: 'cifra1', role: 'cifra' }));
check('cifra1_label no', !isHeadlineNode({ id: 'cifra1_label', role: 'cifra' }));
check('elemento2 sí, elemento2_detalle no',
    isHeadlineNode({ id: 'elemento2', role: 'elemento' }) && !isHeadlineNode({ id: 'elemento2_detalle', role: 'elemento' }));
check('un párrafo nunca es titular', !isHeadlineNode({ id: 'contexto', role: 'texto' }));

grupo('El color de la CAMPAÑA manda sobre el del perfil');
{
    const dna = consolidate([REF(), REF()]);
    check('lo que la campaña eligió se conserva',
        mergeBranding({ primary: '#123456' }, dna).primary === '#123456');
    check('y lo que dejó vacío lo rellena el perfil',
        mergeBranding({ primary: '#123456' }, dna).accent === '#C8102E');
    check('sin perfil no se inventa nada', Object.keys(mergeBranding({ primary: '#123456' }, null)).length === 1);
}

// ─── Indicadores ───────────────────────────────────────────────────────

grupo('Los cuatro indicadores son DETERMINISTAS y se explican');
{
    const dna = consolidate([REF(), REF()]);
    const vars = {
        titulo: 'Colombia te necesita', cta: 'Dona ahora', url: 'rotary4281.org', insignia: 'Emergencia',
        cifra1: '289', cifra1_label: 'personas', cifra1_fuente: 'UNGRD',
        imagen: 'https://x/f.png', logo: 'https://x/l.png', familia1: 'https://x/r.png',
    };
    const tpl = applyProfile(templateFor('impacto_estadistico', 'post_1_1'), dna);
    const doc = compileTemplate({ template: tpl, variables: vars, branding: mergeBranding({}, dna) });
    const q = scorePiece(doc, dna, { allowedFonts: FONTS.map(f => f.id) });

    check('una pieza bien compuesta es legible', q.legibilidad.score === 10, JSON.stringify(q.legibilidad.checks.filter(c => !c.ok)));
    check('cada indicador trae su DESGLOSE, no sólo la nota',
        Object.values(q).every(r => Array.isArray(r.checks)));
    check('con logotipo y escudos, la marca cumple', q.marca.score >= 8, String(q.marca.score));
    check('el estilo aplicado da consistencia alta', q.estilo.score === 10, String(q.estilo.score));

    // Dos textos encimados: es exactamente lo que el indicador existe para ver.
    const roto = { ...doc, nodes: [...doc.nodes, { ...doc.nodes.find(n => n.id === 'titulo'), id: 'x' }] };
    check('dos textos encimados bajan la legibilidad', legibilityScore(roto).score < 10);
    check('y se dice CUÁNTOS', legibilityScore(roto).checks.find(c => c.id === 'solape').detalle.includes('2'));

    check('sin perfil, la consistencia de estilo NO se inventa: se declara sin medir',
        styleConsistencyScore(doc, null).score === null);
    check('sin referencia de densidad tampoco',
        densityScore(doc, { derived: {} }).score === null);
    check('un texto FUERA del lienzo se detecta',
        legibilityScore({ nodes: [{ id: 'a', type: 'text', text: 'x', x: 0.9, y: 0.2, w: 0.3, h: 0.1 }] })
            .checks.find(c => c.id === 'lienzo').ok === false);
    check('sin logotipo, la marca lo dice',
        brandComplianceScore({ nodes: [] }, null).checks.find(c => c.id === 'logo').ok === false);
}

grupo('La consistencia NO se mide contra la referencia');
// Es la decisión que más importa de las cuatro: comparar la pieza con la
// referencia daría nota baja POR CONSTRUCCIÓN —otro contenido, otra fotografía,
// otras cifras—. Es la lección de v4.664 y la de v4.675.
{
    const fuente = readFileSync('server/lib/creativeDNA.js', 'utf8');
    const cuerpo = fuente.slice(fuente.indexOf('export const styleConsistencyScore'));
    check('no compara imágenes ni huellas perceptuales',
        !/hash|huella|perceptual|structuralCompare|sharp/i.test(cuerpo));
    check('puntúa una lista de propiedades del perfil',
        /familia_titular/.test(cuerpo) && /borde_foto/.test(cuerpo));
}

// ─── Medición con sharp ────────────────────────────────────────────────

grupo('Medir: texto y fotografía tienen la misma varianza y hay que separarlos');
let sharp = null;
try { sharp = (await import('sharp')).default; } catch { /* opcional */ }
if (!sharp) {
    console.log('  … se salta: falta sharp');
} else {
    const { measureReference } = await import('../server/lib/creativeAnalysis.js');
    const W = 600, H = 600;

    const conTexto = await sharp({ create: { width: W, height: H, channels: 3, background: '#0B2B5C' } })
        .composite([{ input: Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}">${
            Array.from({ length: 12 }, (_, i) => `<text x="40" y="${60 + i * 46}" font-size="34" font-family="sans-serif" fill="white">COLOMBIA TE NECESITA</text>`).join('')
        }</svg>`) }]).png().toBuffer();

    const buf = Buffer.alloc(W * H * 3);
    for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
        const i = (y * W + x) * 3;
        const base = 120 + 60 * Math.sin(x / 37) + 40 * Math.cos(y / 23);
        // Ruido determinista: la prueba no puede depender del azar.
        const n = ((x * 7919 + y * 104729) % 71) - 35;
        buf[i] = Math.max(0, Math.min(255, base + n));
        buf[i + 1] = Math.max(0, Math.min(255, base * 0.8 + n));
        buf[i + 2] = Math.max(0, Math.min(255, base * 0.6 + n));
    }
    const comoFoto = await sharp(buf, { raw: { width: W, height: H, channels: 3 } }).png().toBuffer();

    const t = await measureReference(conTexto);
    const f = await measureReference(comoFoto);
    check('un fondo liso con texto NO se cuenta como fotografía', t.fotoCobertura < 0.05, `${(t.fotoCobertura * 100).toFixed(0)} %`);
    check('…y su tinta se cuenta de verdad', t.tintaCobertura > 0.05, `${(t.tintaCobertura * 100).toFixed(1)} %`);
    check('una textura tipo fotografía sí se cuenta como fotografía', f.fotoCobertura > 0.6, `${(f.fotoCobertura * 100).toFixed(0)} %`);
    check('…y casi no aporta tinta', f.tintaCobertura < 0.05, `${(f.tintaCobertura * 100).toFixed(1)} %`);
    check('el contraste de letra blanca sobre azul es ALTO', t.contrasteMin > 6, t.contrasteMin.toFixed(1));
    check('la proporción se lee de la imagen', t.proporcion === '1:1', t.proporcion);
    check('el fondo domina la paleta', t.paleta[0].cobertura > 0.5);
    check('medir dos veces la misma imagen da lo mismo',
        JSON.stringify(await measureReference(conTexto)) === JSON.stringify(t));
    check('una imagen ilegible se reporta como null, no lanza',
        (await measureReference(Buffer.from('no soy una imagen'))) === null);
}

// ─── La pantalla no traduce a medias ───────────────────────────────────

grupo('Los rótulos de la pantalla cubren los catálogos');
{
    const dialogo = readFileSync('src/components/admin/content-studio/CreativeProfileDialog.tsx', 'utf8');
    // Un valor sin rótulo se pinta con su id crudo, que no le dice nada a quien
    // configura. Es la misma lección que `RETIRED_LABELS` en el registro de
    // eventos: al agregar un valor al catálogo, agregar su rótulo.
    check('toda máscara tiene su rótulo en español', PHOTO_MASKS.every(m => dialogo.includes(`${m}:`) || dialogo.includes(`'${m}'`)));
    check('todo estilo de pie tiene el suyo', FOOT_STYLES.every(p => dialogo.includes(`${p}:`)));
    check('todo carácter tipográfico tiene el suyo', TYPE_CHARACTERS.every(c => dialogo.includes(`'${c}'`)));
}

grupo('El módulo no se puede saltar el alcance');
{
    const ctrl = readFileSync('server/controllers/creativeProfileController.js', 'utf8');
    check('el alcance va en el WHERE, no en la pantalla', /WHERE .*"isCurrent".*"clubId" = \$1/.test(ctrl));
    check('el perfil que se usa lo RESUELVE el servidor', /export const resolveProfileFor/.test(ctrl));
    check('un sitio no puede reescribir un estilo de la plataforma', /clubId === null && club !== null/.test(ctrl));
    check('volver a analizar crea una VERSIÓN, no reescribe', /"isCurrent" = FALSE/.test(ctrl) && /INSERT INTO "CreativeProfile"/.test(ctrl));
    check('no hay UPDATE del dna de una versión existente', !/UPDATE "CreativeProfile" SET dna/.test(ctrl));
    const post = readFileSync('server/controllers/campaignPostController.js', 'utf8');
    check('el compositor aplica el perfil ANTES de compilar, no dibuja aparte',
        /applyProfile\(plantillaBase, profile\.dna\)/.test(post) && /compileTemplate\(\{ template, variables, branding \}\)/.test(post));
}

console.log(`\n${ok} comprobaciones pasaron${malos.length ? `, ${malos.length} FALLARON:` : '.'}`);
for (const m of malos) console.log(`  ✗ ${m}`);
process.exit(malos.length ? 1 : 0);
