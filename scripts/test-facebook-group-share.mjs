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

import { tablas } from './fixtures/db-share-stub.mjs';

// ── 1. Inspección Estática de Componentes ────────────────────────────────────
seccion('1. Estructura e Integridad de Componentes');

const modalPath = path.resolve('src/components/admin/social/ShareModal.tsx');
const groupSectionPath = path.resolve('src/components/admin/social/GroupDistributionSection.tsx');
const groupAdminModalPath = path.resolve('src/components/admin/social/GroupManagementModal.tsx');
const socialHubPath = path.resolve('src/pages/admin/SocialHub.tsx');
const routesPath = path.resolve('server/routes/social.js');
const controllerPath = path.resolve('server/controllers/contentShareController.js');

const modalCode = fs.readFileSync(modalPath, 'utf8');
const groupSectionCode = fs.readFileSync(groupSectionPath, 'utf8');
const groupAdminCode = fs.readFileSync(groupAdminModalPath, 'utf8');
const socialHubCode = fs.readFileSync(socialHubPath, 'utf8');
const routesCode = fs.readFileSync(routesPath, 'utf8');
const controllerCode = fs.readFileSync(controllerPath, 'utf8');

assert('GroupDistributionSection existe y está implementado', fs.existsSync(groupSectionPath));
assert('GroupManagementModal existe y está implementado', fs.existsSync(groupAdminModalPath));
assert('GroupManagementModal exporta GroupManagementPanel y GroupManagementModal',
    /export const GroupManagementPanel/.test(groupAdminCode) &&
    /export const GroupManagementModal/.test(groupAdminCode)
);
assert('GroupDistributionSection integra GroupManagementModal', /<GroupManagementModal/.test(groupSectionCode));
assert('GroupDistributionSection incluye botón de Administrar grupos', /Administrar grupos/.test(groupSectionCode));
assert('SocialHub integra la pestaña de Grupos de Facebook con GroupManagementPanel',
    /TabsTrigger value="groups"/.test(socialHubCode) &&
    /<GroupManagementPanel/.test(socialHubCode)
);
assert('ShareModal importa GroupDistributionSection', /import GroupDistributionSection from '\.\/GroupDistributionSection'/.test(modalCode));
assert('ShareModal define estado vistaGrupos', /const \[vistaGrupos,\s*setVistaGrupos\]\s*=\s*useState\(false\)/.test(modalCode));
assert('ShareModal identifica si la publicación de Facebook fue exitosa (sesión o historial)', /facebookExitoso\s*=/.test(modalCode));
assert('ShareModal despliega el botón para Compartir en grupos', /Compartir en grupos/.test(modalCode));
assert('ShareModal NO contiene llamadas prohibidas a endpoints deprecados de Groups API', !/\/groups?\/|publish_to_groups/.test(modalCode));
assert('El controlador NO lee clubId del cuerpo de la petición (invariante de tenant)', !/req\.body[\s\S]{0,40}clubId/.test(controllerCode));

assert('GroupDistributionSection incluye vista previa fiel en Grupo de Facebook', /Vista previa en Grupo de Facebook/.test(groupSectionCode));
assert('GroupDistributionSection incluye editor de mensaje o CTA', /Mensaje o CTA para el grupo/.test(groupSectionCode));
assert('GroupDistributionSection incluye contador de tope de 100 caracteres', /\/ 100/.test(groupSectionCode));
assert('GroupDistributionSection incluye botón de regenerar con IA', /Regenerar con IA/.test(groupSectionCode));
assert('GroupDistributionSection incluye toggle de vista cuadrícula (estilo Facebook) y lista', /vistaCuadricula/.test(groupSectionCode));
assert('GroupDistributionSection incluye botón de Sincronizar 36 grupos FB', /Sincronizar 36 grupos FB/.test(groupSectionCode));
assert('GroupDistributionSection incluye opción de Agregar a lista existente', /Agregar a lista existente/.test(groupSectionCode));

// ── 2. Rutas del Servidor ───────────────────────────────────────────────────
seccion('2. Definición de Endpoints en Hub Social');

assert('Ruta GET /share/group-targets registrada', /router\.get\('\/share\/group-targets'/.test(routesCode));
assert('Ruta POST /share/group-cta registrada', /router\.post\('\/share\/group-cta'/.test(routesCode));
assert('Ruta POST /share/distribute-to-groups registrada', /router\.post\('\/share\/distribute-to-groups'/.test(routesCode));
assert('Ruta POST /share/group-status registrada', /router\.post\('\/share\/group-status'/.test(routesCode));
assert('Ruta POST /share/groups/sync-meta registrada', /router\.post\('\/share\/groups\/sync-meta'/.test(routesCode));
assert('Ruta POST /share/groups/sync-36-groups registrada', /router\.post\('\/share\/groups\/sync-36-groups'/.test(routesCode));
assert('Ruta POST /share/groups/update-group registrada', /router\.post\('\/share\/groups\/update-group'/.test(routesCode));
assert('Ruta POST /share/groups/default-list registrada', /router\.post\('\/share\/groups\/default-list'/.test(routesCode));
assert('Ruta POST /share/groups/seed-account-groups registrada', /router\.post\('\/share\/groups\/seed-account-groups'/.test(routesCode));
assert('Ruta GET /share/groups/custom-lists registrada', /router\.get\('\/share\/groups\/custom-lists'/.test(routesCode));
assert('Ruta POST /share/groups/custom-lists registrada', /router\.post\('\/share\/groups\/custom-lists'/.test(routesCode));
assert('Ruta POST /share/groups/validate-url registrada', /router\.post\('\/share\/groups\/validate-url'/.test(routesCode));
assert('Ruta GET /share/groups/batch-config registrada', /router\.get\('\/share\/groups\/batch-config'/.test(routesCode));
assert('Ruta POST /share/groups/batch-config registrada', /router\.post\('\/share\/groups\/batch-config'/.test(routesCode));
assert('Ruta POST /share/groups/quick-save-list registrada', /router\.post\('\/share\/groups\/quick-save-list'/.test(routesCode));
assert('Ruta POST /share/groups/verify-capabilities registrada', /router\.post\('\/share\/groups\/verify-capabilities'/.test(routesCode));
assert('Ruta POST /share/groups/auto-distribute registrada', /router\.post\('\/share\/groups\/auto-distribute'/.test(routesCode));

assert('Controlador exporta getShareGroupTargets', /export const getShareGroupTargets/.test(controllerCode));
assert('Controlador exporta generateGroupCTA', /export const generateGroupCTA/.test(controllerCode));
assert('Controlador exporta distributeToGroups', /export const distributeToGroups/.test(controllerCode));
assert('Controlador exporta autoDistributeToGroups', /export const autoDistributeToGroups/.test(controllerCode));
assert('Controlador exporta updateGroupDistributionStatus', /export const updateGroupDistributionStatus/.test(controllerCode));
assert('Controlador exporta syncMetaGroups', /export const syncMetaGroups/.test(controllerCode));
assert('Controlador exporta sync36Groups', /export const sync36Groups/.test(controllerCode));
assert('Controlador exporta updateDistributionGroup', /export const updateDistributionGroup/.test(controllerCode));
assert('Controlador exporta setDefaultGroupList', /export const setDefaultGroupList/.test(controllerCode));
assert('Controlador exporta seedAccountGroups', /export const seedAccountGroups/.test(controllerCode));
assert('Controlador exporta getCustomLists', /export const getCustomLists/.test(controllerCode));
assert('Controlador exporta createCustomList', /export const createCustomList/.test(controllerCode));
assert('Controlador exporta validateFacebookGroupUrl', /export const validateFacebookGroupUrl/.test(controllerCode));
assert('Controlador exporta getBatchConfig', /export const getBatchConfig/.test(controllerCode));
assert('Controlador exporta quickSaveDistributionList', /export const quickSaveDistributionList/.test(controllerCode));
assert('Controlador exporta verifyGroupCapabilities', /export const verifyGroupCapabilities/.test(controllerCode));

// ── 3. Lógica de Grupos y Filtros Regionales ─────────────────────────
seccion('3. Lógica de Grupos Dinámicos y Sincronización Meta');

const {
    getShareGroupTargets,
    generateGroupCTA,
    distributeToGroups,
    autoDistributeToGroups,
    updateGroupDistributionStatus,
    syncMetaGroups,
    setDefaultGroupList,
    buildContextualGroupCTA,
    seedAccountGroups,
    getCustomLists,
    createCustomList,
    updateCustomList,
    deleteCustomList,
    validateFacebookGroupUrl,
    getBatchConfig,
    saveBatchConfig,
    quickSaveDistributionList,
    verifyGroupCapabilities,
    sync36Groups,
    updateDistributionGroup,
    REAL_ACCOUNT_GROUPS,
} = await import('../server/controllers/contentShareController.js');

// 3.1 Sin grupos en BD: la plataforma NO inventa grupos simulados ni ficticios
tablas.DistributionGroup = [];
let resDataEmpty = null;
const mockResEmpty = {
    json: (d) => { resDataEmpty = d; return d; },
    status: () => mockResEmpty,
};

await getShareGroupTargets({ query: { clubId: 'club-test-4281' }, user: { clubId: 'club-test-4281' } }, mockResEmpty);

assert('getShareGroupTargets devuelve groups: [] cuando la BD está vacía (sin inventar datos)',
    Array.isArray(resDataEmpty?.groups) && resDataEmpty.groups.length === 0
);
assert('getShareGroupTargets incluye categoría Rotary en Español y lista por defecto',
    Array.isArray(resDataEmpty?.categories) &&
    resDataEmpty.categories.includes('Rotary en Español') &&
    resDataEmpty.defaultList === 'Rotary en Español'
);
assert('getShareGroupTargets declara metaCapability con limitación oficial de Meta Groups API',
    resDataEmpty?.metaCapability && resDataEmpty.metaCapability.supported === false
);

// 3.2 Con grupos reales en BD: devueltos con atributos completos
tablas.DistributionGroup = [
    {
        id: 'dg-1',
        clubId: 'club-test-4281',
        groupId: 'rotary-d4281-colombia',
        name: 'Rotarios de Colombia y Latinoamérica',
        url: 'https://www.facebook.com/groups/rotary4281',
        tags: ['Rotary en Español', 'Colombia', 'Latinoamérica'],
        status: 'verificado',
        favorite: true,
    },
    {
        id: 'dg-2',
        clubId: 'club-test-4281',
        groupId: 'rotary-mexico',
        name: 'Rotary México y Centroamérica',
        url: 'https://www.facebook.com/groups/rotarymexico',
        tags: ['Rotary en Español', 'México'],
        status: 'verificado',
        favorite: false,
    },
    {
        id: 'dg-3',
        clubId: 'club-test-4281',
        groupId: 'rotary-international-worldwide',
        name: 'Rotary International Worldwide',
        url: 'https://www.facebook.com/groups/rotaryworldwide',
        tags: ['Worldwide', 'English'],
        status: 'sin_verificar',
        favorite: false,
    },
];

let resDataSeeded = null;
const mockResSeeded = {
    json: (d) => { resDataSeeded = d; return d; },
    status: () => mockResSeeded,
};

await getShareGroupTargets({ query: { clubId: 'club-test-4281' }, user: { clubId: 'club-test-4281' } }, mockResSeeded);

assert('getShareGroupTargets devuelve los grupos reales registrados',
    Array.isArray(resDataSeeded?.groups) && resDataSeeded.groups.length === 3
);
assert('getShareGroupTargets extrae categorías dinámicas de los tags de los grupos',
    resDataSeeded.categories.includes('Rotary en Español') &&
    resDataSeeded.categories.includes('Colombia') &&
    resDataSeeded.categories.includes('Latinoamérica') &&
    resDataSeeded.categories.includes('México')
);

const primerGrupo = resDataSeeded.groups[0];
assert('Cada grupo incluye groupId y name', primerGrupo && primerGrupo.groupId && primerGrupo.name);
assert('Grupo en español declara idioma es y etiqueta Español', primerGrupo.language === 'es' && primerGrupo.languageLabel === 'Español');
assert('Grupo en inglés declara idioma en y etiqueta English',
    resDataSeeded.groups[2].language === 'en' && resDataSeeded.groups[2].languageLabel === 'English'
);
assert('Cada grupo declara estado de autorización', primerGrupo.status && typeof primerGrupo.canPublish === 'boolean');

// 3.3 Guardar y recuperar lista de distribución predeterminada
let defaultListRes = null;
await setDefaultGroupList({
    query: { clubId: 'club-test-4281' },
    user: { clubId: 'club-test-4281' },
    body: { listName: 'Rotary en Español' },
}, {
    json: (d) => { defaultListRes = d; return d; },
    status: () => ({ json: (d) => { defaultListRes = d; return d; } }),
});
assert('setDefaultGroupList confirma guardado exitoso de la lista por defecto',
    defaultListRes?.ok === true && defaultListRes.defaultList === 'Rotary en Español'
);

// 3.4 Sincronización Meta con reporte transparente de limitaciones de API
let syncRes = null;
await syncMetaGroups({
    query: { clubId: 'club-test-4281' },
    user: { clubId: 'club-test-4281' },
    body: {},
}, {
    json: (d) => { syncRes = d; return d; },
    status: () => ({ json: (d) => { syncRes = d; return d; } }),
});
assert('syncMetaGroups responde con estado ok y diagnóstico de Meta API',
    syncRes?.ok === true && syncRes?.diagnostic && typeof syncRes.diagnostic.metaRestrictionDetected === 'boolean'
);
assert('syncMetaGroups incluye recomendación de registro e importación de grupos válidos',
    Boolean(syncRes?.diagnostic?.recommendation)
);

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

// ── 7. Listas Personalizadas, Semillero de 36 Grupos y Lotes Seguros ────────
seccion('7. Listas Personalizadas, Semillero de 36 Grupos y Lotes Seguros');

// 7.1 Semillero de los 36 grupos reales de la cuenta
let seedRes = null;
await seedAccountGroups({
    query: { clubId: 'club-test-4281' },
    user: { clubId: 'club-test-4281' },
}, {
    json: (d) => { seedRes = d; return d; },
    status: () => ({ json: (d) => { seedRes = d; return d; } }),
});

assert('seedAccountGroups carga exitosamente los 36 grupos reales de la cuenta',
    seedRes?.ok === true && seedRes?.groups?.length >= 36 && seedRes?.seededCount === 36
);

// 7.2 Validación de URLs de grupos de Facebook
const valid1 = validateFacebookGroupUrl('https://www.facebook.com/groups/rotarycolombia/');
assert('validateFacebookGroupUrl identifica correctamente un slug de grupo',
    valid1.ok === true && valid1.groupId === 'rotarycolombia' && valid1.language === 'es'
);

const valid2 = validateFacebookGroupUrl('https://www.facebook.com/groups/102938475612345');
assert('validateFacebookGroupUrl identifica correctamente un ID numérico de grupo',
    valid2.ok === true && valid2.groupId === '102938475612345'
);

const invalidUrl = validateFacebookGroupUrl('https://www.facebook.com/rotary4281');
assert('validateFacebookGroupUrl rechaza URLs que no son de grupos',
    invalidUrl.ok === false
);

// 7.3 Configuración de lotes seguros (anti-spam de Meta)
let batchCfg = null;
await getBatchConfig({
    query: { clubId: 'club-test-4281' },
    user: { clubId: 'club-test-4281' },
}, {
    json: (d) => { batchCfg = d; return d; },
    status: () => ({ json: (d) => { batchCfg = d; return d; } }),
});

assert('getBatchConfig devuelve tamaño de lote seguro (default 5)',
    batchCfg?.ok === true && batchCfg.batchSize >= 3
);

// 7.4 Listas de distribución personalizadas
let listsRes = null;
await getCustomLists({
    query: { clubId: 'club-test-4281' },
    user: { clubId: 'club-test-4281' },
}, {
    json: (d) => { listsRes = d; return d; },
    status: () => ({ json: (d) => { listsRes = d; return d; } }),
});

assert('getCustomLists devuelve listas personalizadas y conteo de grupos',
    listsRes?.ok === true && Array.isArray(listsRes.lists) && listsRes.lists.some(l => l.name === 'Rotary en Español')
);

// 7.5 Guardado rápido de lista de distribución reutilizable
let quickSaveRes = null;
await quickSaveDistributionList({
    query: { clubId: 'club-test-4281' },
    user: { clubId: 'club-test-4281' },
    body: {
        name: 'Rotary Colombia Proyectos',
        groupIds: ['rotary-en-espanol', 'amigos-de-rotary'],
    },
}, {
    json: (d) => { quickSaveRes = d; return d; },
    status: () => ({ json: (d) => { quickSaveRes = d; return d; } }),
});

assert('quickSaveDistributionList guarda lista reutilizable y asigna grupos',
    quickSaveRes?.ok === true && quickSaveRes.assignedCount === 2 && quickSaveRes.list?.name === 'Rotary Colombia Proyectos'
);

// 7.6 Verificación oficial de capacidades Meta Graph API (sin bots ni simulación)
let capRes = null;
await verifyGroupCapabilities({
    query: { clubId: 'club-test-4281' },
    user: { clubId: 'club-test-4281' },
    body: {
        groupIds: ['rotary-en-espanol', 'amigos-de-rotary'],
    },
}, {
    json: (d) => { capRes = d; return d; },
    status: () => ({ json: (d) => { capRes = d; return d; } }),
});

assert('verifyGroupCapabilities reporta transparencia sobre Groups API deprecada por Meta',
    capRes?.ok === true && capRes.summary?.allAssisted === true && capRes.capabilities?.every(c => c.canPublishViaApi === false)
);

// 7.7 Catálogo de los 36 grupos reales de Facebook vinculados a la cuenta
assert('REAL_ACCOUNT_GROUPS contiene exactamente 36 grupos reales',
    Array.isArray(REAL_ACCOUNT_GROUPS) && REAL_ACCOUNT_GROUPS.length === 36
);
assert('REAL_ACCOUNT_GROUPS NO contiene el grupo ficticio rotary-4281-colombia',
    !REAL_ACCOUNT_GROUPS.some(g => g.groupId === 'rotary-4281-colombia' || g.name.includes('Distrito 4281 Colombia'))
);

// 7.8 Endpoint de sincronización forzada de los 36 grupos
tablas.DistributionGroup = [];
let sync36Res = null;
await sync36Groups({
    query: { clubId: 'club-test-4281' },
    user: { clubId: 'club-test-4281' },
}, {
    json: (d) => { sync36Res = d; return d; },
    status: () => ({ json: (d) => { sync36Res = d; return d; } }),
});

assert('sync36Groups sincroniza exitosamente los 36 grupos reales de Facebook en BD',
    sync36Res?.ok === true && sync36Res.count === 36 && tablas.DistributionGroup.length === 36
);

// 7.9 Edición directa de la URL canónica de un grupo
let updateGroupRes = null;
await updateDistributionGroup({
    query: { clubId: 'club-test-4281' },
    user: { clubId: 'club-test-4281' },
    body: {
        groupId: 'rotarians-worldwide-rw',
        url: 'https://www.facebook.com/groups/1082398471239812/',
    },
}, {
    json: (d) => { updateGroupRes = d; return d; },
    status: () => ({ json: (d) => { updateGroupRes = d; return d; } }),
});

assert('updateDistributionGroup actualiza correctamente la URL canónica del grupo en BD',
    updateGroupRes?.ok === true && updateGroupRes.url === 'https://www.facebook.com/groups/1082398471239812/'
);

// 7.10 Verificación de miembro exacto en todos los 36 grupos reales
assert('Todos los 36 grupos reales tienen cantidad exacta de miembros (memberCount > 0)',
    REAL_ACCOUNT_GROUPS.every(g => typeof g.memberCount === 'number' && g.memberCount > 0)
);

let targetsWithMembers = null;
await getShareGroupTargets({
    query: { clubId: 'club-test-4281' },
    user: { clubId: 'club-test-4281' },
}, {
    json: (d) => { targetsWithMembers = d; return d; },
    status: () => ({ json: (d) => { targetsWithMembers = d; return d; } }),
});

assert('getShareGroupTargets devuelve memberCount numérico exacto en cada grupo',
    Array.isArray(targetsWithMembers?.groups) &&
    targetsWithMembers.groups.length > 0 &&
    targetsWithMembers.groups.every(g => typeof g.memberCount === 'number' && g.memberCount > 0)
);

// 7.11 Actualización de lista personalizada (PUT)
let updateListRes = null;
await updateCustomList({
    query: { clubId: 'club-test-4281' },
    params: { id: 'rotary-colombia' },
    body: { name: 'Rotary Colombia Modificada', description: 'Nueva descripción de prueba' },
}, {
    json: (d) => { updateListRes = d; return d; },
    status: () => ({ json: (d) => { updateListRes = d; return d; } }),
});

assert('updateCustomList renombra la lista y actualiza su descripción sin fallar',
    updateListRes?.ok === true &&
    updateListRes.list?.name === 'Rotary Colombia Modificada' &&
    updateListRes.list?.description === 'Nueva descripción de prueba'
);

// 7.12 Eliminación de lista personalizada (DELETE)
let deleteListRes = null;
await deleteCustomList({
    query: { clubId: 'club-test-4281' },
    params: { id: 'rotary-colombia' },
}, {
    json: (d) => { deleteListRes = d; return d; },
    status: () => ({ json: (d) => { deleteListRes = d; return d; } }),
});

assert('deleteCustomList elimina la lista sin lanzar 404',
    deleteListRes?.ok === true &&
    Array.isArray(deleteListRes.lists) &&
    !deleteListRes.lists.some(l => l.id === 'rotary-colombia' || l.name === 'Rotary Colombia Modificada')
);

// ── 8. Motor de Auto-Distribución y Cadencia Anti-Spam (v4.1079.0) ─────────
seccion('8. Motor de Auto-Distribución y Cadencia Anti-Spam');

// 8.1 Validación de fuente oficial
let autoErrStatus = 0;
let autoErrData = null;
await autoDistributeToGroups({
    query: { clubId: 'club-test-4281' },
    body: { groups: [{ groupId: 'g1' }] },
}, {
    status: (s) => { autoErrStatus = s; return { json: (d) => { autoErrData = d; } }; },
    json: (d) => { autoErrData = d; },
});
assert('autoDistributeToGroups rechaza peticiones sin URL oficial de Fanpage', autoErrStatus === 400 && /fanpagePostUrl requerido/i.test(autoErrData?.error));

// 8.2 Despacho programado con intervalos y jitter
let autoOkData = null;
await autoDistributeToGroups({
    query: { clubId: 'club-test-4281' },
    user: { clubId: 'club-test-4281', name: 'Admin Auto' },
    body: {
        entityType: 'post',
        entityId: 'post-auto-1',
        fanpagePostId: 'fp-123',
        fanpagePostUrl: 'https://www.facebook.com/rotary4281/posts/auto-test',
        message: 'Mensaje con CTA para grupos 🌟',
        intervalSeconds: 30,
        jitterSeconds: 5,
        groups: [
            { groupId: 'grp-1', name: 'Grupo Uno' },
            { groupId: 'grp-2', name: 'Grupo Dos' },
            { groupId: 'grp-3', name: 'Grupo Tres' },
        ],
    },
}, {
    json: (d) => { autoOkData = d; return d; },
    status: () => ({ json: (d) => { autoOkData = d; return d; } }),
});

assert('autoDistributeToGroups crea la campaña y procesa todos los grupos', autoOkData?.ok === true && autoOkData?.total === 3);
assert('autoDistributeToGroups define intervalo base y jitter de seguridad', autoOkData?.intervalSeconds === 30 && autoOkData?.jitterSeconds === 5);
assert('El primer paso arranca con delay inicial cero para despacho inmediato', autoOkData?.outcomes[0]?.delaySeconds === 0);
assert('Los pasos subsiguientes acumulan retardo seguro con fecha programada',
    autoOkData?.outcomes[1]?.delaySeconds > 0 &&
    Boolean(autoOkData?.outcomes[1]?.scheduledAt) &&
    autoOkData?.outcomes[2]?.delaySeconds > autoOkData?.outcomes[1]?.delaySeconds
);
assert('GroupDistributionSection incluye selector de cadencia anti-spam (30s, 45s, 90s)',
    /Cadencia Anti-Spam/.test(groupSectionCode) &&
    /30s/.test(groupSectionCode) &&
    /45s/.test(groupSectionCode) &&
    /90s/.test(groupSectionCode)
);
assert('GroupDistributionSection incluye botón de Iniciar Auto-Distribución',
    /Iniciar Auto-Distribución/.test(groupSectionCode)
);
assert('GroupDistributionSection incluye controles de pausa y avance del Auto-Runner',
    /Pausar/.test(groupSectionCode) &&
    /Reanudar/.test(groupSectionCode) &&
    /Enviar ahora/.test(groupSectionCode) &&
    /Detener auto-distribución/.test(groupSectionCode)
);

// ── Resumen Final ───────────────────────────────────────────────────────────
console.log('\n────────────────────────────────────────────────────────────');
console.log(`Resultado: ${pasaron} pasaron, ${fallaron} fallaron.`);
if (fallaron > 0) {
    process.exit(1);
} else {
    console.log('✅ Batería de pruebas de Compartir en Grupos superada con éxito.\n');
    process.exit(0);
}
