#!/usr/bin/env node
// ════════════════════════════════════════════════════════════════════
// Batería de pruebas: Compartir en Grupos de Facebook con Vista Previa y CTA (v4.1075.0)
//
// Valida:
// 1. Grupos autorizados y categorización (Rotary en Español, Colombia, Latam, México).
// 2. La Fanpage como origen oficial y el permalink de Facebook como objeto a distribuir.
// 3. Generación automática y contextual de CTA rotario (máx 100 caracteres, terminado en emoji).
// 4. Vista previa fiel a Meta Feed con autor, mensaje, tarjeta de Fanpage e imagen destacada.
// 5. Generación de enlaces seguros de distribución mediante dialog oficial de Meta.
// 6. Aislamiento multi-tenant y estricto respeto a la deprecación de Groups API.
// 7. Seguimiento y actualización de estados individuales (publicado, pendiente, error).
// ════════════════════════════════════════════════════════════════════

import fs from 'node:fs';
import path from 'node:path';
import { register } from 'node:module';
import { pathToFileURL } from 'node:url';

const HERE = pathToFileURL(`${process.cwd()}/`).href;
const DB = new URL('./scripts/fixtures/db-share-stub.mjs', HERE).href;
const META = new URL('./scripts/fixtures/meta-share-stub.mjs', HERE).href;
const CRYPTO = new URL('./scripts/fixtures/crypto-share-stub.mjs', HERE).href;
const PRISMA = new URL('./scripts/fixtures/prisma-share-stub.mjs', HERE).href;

register(
    `data:text/javascript,export async function resolve(s,c,n){
        if(/(^|\\/)db\\.js$/.test(s)) return {url:encodeURI(${JSON.stringify(DB)}),shortCircuit:true};
        if(/socialPublishService\\.js$/.test(s)) return {url:encodeURI(${JSON.stringify(META)}),shortCircuit:true};
        if(/tokenCrypto\\.js$/.test(s)) return {url:encodeURI(${JSON.stringify(CRYPTO)}),shortCircuit:true};
        if(/(^|\\/)prisma\\.js$/.test(s)) return {url:encodeURI(${JSON.stringify(PRISMA)}),shortCircuit:true};
        return n(s,c);
     }`,
    HERE
);

let pasaron = 0;
let fallaron = 0;

const assert = (desc, cond, extra = '') => {
    if (cond) {
        pasaron++;
        console.log(`  ✓ ${desc}`);
    } else {
        fallaron++;
        console.error(`  ✗ ${desc}${extra ? ` — ${extra}` : ''}`);
    }
};

const seccion = (titulo) => console.log(`\n── ${titulo} ──────────────────────────────`);

// ── 1. Inspección Estática de Componentes ────────────────────────────────────
seccion('1. Estructura e Integridad de Componentes');

const modalPath = path.resolve('src/components/admin/social/ShareModal.tsx');
const groupSectionPath = path.resolve('src/components/admin/social/GroupDistributionSection.tsx');
const routesPath = path.resolve('server/routes/social.js');
const controllerPath = path.resolve('server/controllers/contentShareController.js');

const modalCode = fs.readFileSync(modalPath, 'utf8');
const groupSectionCode = fs.readFileSync(groupSectionPath, 'utf8');
const routesCode = fs.readFileSync(routesPath, 'utf8');
const controllerCode = fs.readFileSync(controllerPath, 'utf8');

assert('GroupDistributionSection existe y está implementado', fs.existsSync(groupSectionPath));
assert('ShareModal importa GroupDistributionSection', /import GroupDistributionSection from '\.\/GroupDistributionSection'/.test(modalCode));
assert('ShareModal define estado vistaGrupos', /const \[vistaGrupos,\s*setVistaGrupos\]\s*=\s*useState\(false\)/.test(modalCode));
assert('ShareModal identifica si la publicación de Facebook fue exitosa (sesión o historial)', /facebookExitoso\s*=/.test(modalCode));
assert('ShareModal despliega el botón para Compartir en grupos', /Compartir en grupos/.test(modalCode));
assert('ShareModal NO contiene llamadas prohibidas a endpoints deprecados de Groups API', !/\/groups?\/|publish_to_groups/.test(modalCode));
assert('El controlador NO lee clubId del cuerpo de la petición (invariante de tenant)', !/req\.body[\s\S]{0,40}clubId/.test(controllerCode));

// Verificaciones de Vista Previa y Editor de CTA en GroupDistributionSection
assert('GroupDistributionSection incluye vista previa fiel en Grupo de Facebook', /Vista previa en Grupo de Facebook/.test(groupSectionCode));
assert('GroupDistributionSection incluye editor de mensaje o CTA', /Mensaje o CTA para el grupo/.test(groupSectionCode));
assert('GroupDistributionSection incluye contador de tope de 100 caracteres', /\/ 100/.test(groupSectionCode));
assert('GroupDistributionSection incluye botón de regenerar con IA', /Regenerar con IA/.test(groupSectionCode));

// ── 2. Rutas del Servidor ───────────────────────────────────────────────────
seccion('2. Definición de Endpoints en Hub Social');

assert('Ruta GET /share/group-targets registrada', /router\.get\('\/share\/group-targets'/.test(routesCode));
assert('Ruta POST /share/group-cta registrada', /router\.post\('\/share\/group-cta'/.test(routesCode));
assert('Ruta POST /share/distribute-to-groups registrada', /router\.post\('\/share\/distribute-to-groups'/.test(routesCode));
assert('Ruta POST /share/group-status registrada', /router\.post\('\/share\/group-status'/.test(routesCode));
assert('Controlador exporta getShareGroupTargets', /export const getShareGroupTargets/.test(controllerCode));
assert('Controlador exporta generateGroupCTA', /export const generateGroupCTA/.test(controllerCode));
assert('Controlador exporta distributeToGroups', /export const distributeToGroups/.test(controllerCode));
assert('Controlador exporta updateGroupDistributionStatus', /export const updateGroupDistributionStatus/.test(controllerCode));

// ── 3. Lógica de Grupos y Filtros Regionales ─────────────────────────
seccion('3. Lógica de Grupos y Filtros Regionales');

const {
    getShareGroupTargets,
    generateGroupCTA,
    distributeToGroups,
    updateGroupDistributionStatus,
    buildContextualGroupCTA,
} = await import('../server/controllers/contentShareController.js');

// Mock req / res para getShareGroupTargets
let resData = null;
const mockRes = {
    json: (d) => { resData = d; return d; },
    status: () => mockRes,
};

await getShareGroupTargets({ query: { clubId: 'club-test-4281' }, user: { clubId: 'club-test-4281' } }, mockRes);

assert('getShareGroupTargets responde con lista de grupos', Array.isArray(resData?.groups) && resData.groups.length > 0);
assert('getShareGroupTargets incluye categorías regionales esperadas',
    Array.isArray(resData?.categories) &&
    resData.categories.includes('Rotary en Español') &&
    resData.categories.includes('Colombia') &&
    resData.categories.includes('Latinoamérica') &&
    resData.categories.includes('México')
);

const primerGrupo = resData.groups[0];
assert('Cada grupo incluye groupId y name', primerGrupo && primerGrupo.groupId && primerGrupo.name);
assert('Cada grupo declara idioma y etiqueta de idioma', primerGrupo.language === 'es' && primerGrupo.languageLabel === 'Español');
assert('Cada grupo declara estado de autorización', primerGrupo.status && typeof primerGrupo.canPublish === 'boolean');

// ── 4. Generación y Validación de CTA Contextual ─────────────────────────────
seccion('4. Generación de CTA Contextual (máx. 100 caracteres y emoji final)');

const ctaAgua = buildContextualGroupCTA({
    title: 'Filtros de agua potable en El Hormiguero y Cascajal',
    excerpt: 'Entrega de filtros de agua para comunidades rurales del Valle.',
    content: 'Proyecto conjunto de clubes rotarios para llevar saneamiento y agua potable.',
});
assert('CTA de agua no supera 100 caracteres', ctaAgua.length <= 100, `Largo: ${ctaAgua.length}`);
assert('CTA de agua termina en emoji y contiene emoji de agua', /\p{Extended_Pictographic}\s*$/u.test(ctaAgua) && ctaAgua.includes('💧'));

const ctaSalud = buildContextualGroupCTA({
    title: 'Jornada de salud médica y odontológica en zona rural',
    excerpt: 'Atención primaria y prevención para más de 300 familias.',
});
assert('CTA de salud no supera 100 caracteres', ctaSalud.length <= 100, `Largo: ${ctaSalud.length}`);
assert('CTA de salud termina en emoji y contiene emoji de salud', /\p{Extended_Pictographic}\s*$/u.test(ctaSalud) && ctaSalud.includes('🩺'));

const ctaEducacion = buildContextualGroupCTA({
    title: 'Entrega de becas y kits escolares a niños de escasos recursos',
    excerpt: 'Apoyo a la educación primaria para prevenir la deserción escolar.',
});
assert('CTA de educación no supera 100 caracteres', ctaEducacion.length <= 100, `Largo: ${ctaEducacion.length}`);
assert('CTA de educación termina en emoji y contiene emoji escolar', /\p{Extended_Pictographic}\s*$/u.test(ctaEducacion) && ctaEducacion.includes('📚'));

const ctaGeneral = buildContextualGroupCTA({
    title: 'Reunión de compañerismo y planificación rotaria',
});
assert('CTA general no supera 100 caracteres', ctaGeneral.length <= 100, `Largo: ${ctaGeneral.length}`);
assert('CTA general termina en emoji', /\p{Extended_Pictographic}\s*$/u.test(ctaGeneral));

// ── 5. Distribución con Fanpage y Mensaje CTA ─────────────────────────────────
seccion('5. Distribución con Fanpage como Fuente Oficial y Mensaje CTA');

let errStatus = 0;
let errData = null;
const mockErrRes = {
    status: (s) => { errStatus = s; return mockErrRes; },
    json: (d) => { errData = d; return d; },
};

await distributeToGroups({
    query: { clubId: 'club-test-4281' },
    body: { entityId: 'post-123', groups: [{ groupId: 'g-1' }] },
}, mockErrRes);

assert('distributeToGroups rechaza peticiones sin la URL oficial de la Fanpage', errStatus === 400 && /fanpagePostUrl requerido/i.test(errData?.error));

let distData = null;
const mockOkRes = {
    json: (d) => { distData = d; return d; },
    status: () => mockOkRes,
};

const fanpageUrlPrueba = 'https://www.facebook.com/rotary4281/posts/1029384756';
const ctaPrueba = 'Conoce cómo Rotary transforma comunidades a través del servicio y la solidaridad. 🌎';

await distributeToGroups({
    query: { clubId: 'club-test-4281' },
    user: { clubId: 'club-test-4281', name: 'Admin Rotario' },
    body: {
        entityType: 'post',
        entityId: 'post-123',
        fanpagePostId: 'rotary4281_1029384756',
        fanpagePostUrl: fanpageUrlPrueba,
        message: ctaPrueba,
        groups: [
            { groupId: 'rotary-d4281-colombia', name: 'Rotary Distrito 4281 Colombia', url: 'https://www.facebook.com/groups/rotary4281' },
            { groupId: 'rotarios-latam', name: 'Rotarios de Latinoamérica', url: 'https://www.facebook.com/groups/rotarioslatam' },
        ],
    },
}, mockOkRes);

assert('distributeToGroups procesa los grupos seleccionados', distData?.ok === true && distData.outcomes?.length === 2);
assert('distributeToGroups conserva la URL de Fanpage como enlace a compartir', distData?.fanpagePostUrl === fanpageUrlPrueba);
assert('distributeToGroups almacena y devuelve el mensaje de acompañamiento para grupos', distData?.message === ctaPrueba && distData.outcomes[0].message === ctaPrueba);

const outcome1 = distData.outcomes[0];
assert('El outcome de cada grupo arranca en estado pendiente', outcome1.status === 'pending');
assert('El outcome de cada grupo genera el enlace oficial de Meta Dialog con el permalink de la Fanpage',
    outcome1.dialogUrl.includes('https://www.facebook.com/sharer/sharer.php?u=') &&
    outcome1.dialogUrl.includes(encodeURIComponent(fanpageUrlPrueba))
);

// ── 6. Actualización de Estados Individuales ────────────────────────────────
seccion('6. Actualización de Estados Individuales');

let statusRes = null;
await updateGroupDistributionStatus({
    query: { clubId: 'club-test-4281' },
    body: {
        entityType: 'post',
        entityId: 'post-123',
        groupId: 'rotary-d4281-colombia',
        status: 'published',
    },
}, {
    json: (d) => { statusRes = d; return d; },
    status: () => ({ json: (d) => { statusRes = d; return d; } }),
});

assert('updateGroupDistributionStatus confirma cambio a publicado', statusRes?.ok === true && statusRes.status === 'published');

// ── Resumen Final ───────────────────────────────────────────────────────────
console.log('\n────────────────────────────────────────────────────────────');
console.log(`Resultado: ${pasaron} pasaron, ${fallaron} fallaron.`);
if (fallaron > 0) {
    process.exit(1);
} else {
    console.log('✅ Batería de pruebas de Compartir en Grupos superada con éxito.\n');
    process.exit(0);
}
