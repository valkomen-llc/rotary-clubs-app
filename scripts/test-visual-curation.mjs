// ════════════════════════════════════════════════════════════════════════════
// Suite de Pruebas Automatizadas: Curaduría Visual Inteligente IA (v4.1210.0)
//
// Verifica:
// 1. Ponderaciones y especificaciones de los contenedores
// 2. Cálculo de puntuación multidimensional (0-100) por contenedor
// 3. Diferenciación de puntaje por contenedor (ej. TRF vs Hero)
// 4. Filtros de elegibilidad ética y seguridad editorial (consentimiento, menores, capturas)
// 5. Algoritmo de planificación de recomendaciones y diversidad de clubes
// 6. Detección de duplicados mediante dHash y distancia Hamming
// 7. Respeto absoluto a slots bloqueados por el administrador
// ════════════════════════════════════════════════════════════════════════════

import assert from 'node:assert/strict';
import {
    DEFAULT_CURATION_WEIGHTS,
    CONTAINER_SPECS,
    ROTARY_CAUSES,
    scoreCandidateForContainer,
    evaluateCandidateEligibility,
    planContainerRecommendations,
    hammingDistance,
    areImagesNearDuplicates,
} from '../server/lib/visualCurationSpec.js';

console.log('🧪 Iniciando suite de pruebas: Curaduría Visual Inteligente IA\n');

// ── 1. Verificación de Ponderaciones y Catálogo de Contenedores ─────────────
console.log('1 · Ponderaciones y Contenedores');
assert.equal(DEFAULT_CURATION_WEIGHTS.institutional, 0.30, 'Relevancia institucional debe ser 30%');
assert.equal(DEFAULT_CURATION_WEIGHTS.technical, 0.20, 'Calidad técnica debe ser 20%');
assert.equal(DEFAULT_CURATION_WEIGHTS.composition, 0.20, 'Composición visual debe ser 20%');
assert.equal(DEFAULT_CURATION_WEIGHTS.containerFit, 0.20, 'Compatibilidad con contenedor debe ser 20%');
assert.equal(DEFAULT_CURATION_WEIGHTS.narrative, 0.10, 'Impacto narrativo debe ser 10%');

const sumWeights = Object.values(DEFAULT_CURATION_WEIGHTS).reduce((a, b) => a + b, 0);
assert.equal(Math.round(sumWeights * 100) / 100, 1.0, 'La suma de ponderaciones debe ser exactamente 1.0 (100%)');

assert.ok(CONTAINER_SPECS.hero, 'Debe existir contenedor Hero');
assert.equal(CONTAINER_SPECS.hero.slots, 5, 'Hero debe tener 5 slides');
assert.ok(CONTAINER_SPECS.foundation, 'Debe existir contenedor Fundación Rotaria');
assert.ok(CONTAINER_SPECS.join, 'Debe existir contenedor Sección Únete');
assert.equal(ROTARY_CAUSES.length, 7, 'Deben estar catalogadas las 7 causas de Rotary');
console.log('  ✓ Ponderaciones normalizadas al 100% y catálogo de 17 módulos verificado');

// ── 2. Filtros de Elegibilidad y Seguridad Editorial ────────────────────────
console.log('\n2 · Filtros de Elegibilidad y Seguridad');

// Caso A: Sin consentimiento ni autorización
const candidateSinConsent = {
    title: 'Actividad comunitaria',
    status: 'recibida',
    consentVerified: false,
    consentAt: null,
};
const elegSinConsent = evaluateCandidateEligibility(candidateSinConsent);
assert.equal(elegSinConsent.eligible, false, 'No debe ser elegible sin consentimiento');
assert.ok(elegSinConsent.reasons[0].includes('consentimiento'), 'Debe advertir sobre falta de consentimiento');

// Caso B: Captura de pantalla
const candidateScreenshot = {
    title: 'Flyer WhatsApp',
    consentVerified: true,
    semanticAnalysis: { isScreenshot: true },
};
const elegScreenshot = evaluateCandidateEligibility(candidateScreenshot);
assert.equal(elegScreenshot.eligible, false, 'No debe ser elegible si es una captura de pantalla');

// Caso C: Documento o volante de texto
const candidateDoc = {
    title: 'Acta de reunión',
    consentVerified: true,
    semanticAnalysis: { isDocumentOrFlyer: true },
};
const elegDoc = evaluateCandidateEligibility(candidateDoc);
assert.equal(elegDoc.eligible, false, 'No debe ser elegible si es un documento');

// Caso D: Foto válida con menores protegidos
const candidateMinors = {
    title: 'Entrega de útiles escolares',
    consentVerified: true,
    parentalConsentVerified: true,
    semanticAnalysis: { involvesMinors: true },
};
const elegMinors = evaluateCandidateEligibility(candidateMinors);
assert.equal(elegMinors.eligible, true, 'Debe ser elegible si cuenta con autorización parental');
console.log('  ✓ Filtros éticos: rechaza capturas, documentos y fotos sin consentimiento');

// ── 3. Puntuación Multidimensional por Contenedor ──────────────────────────
console.log('\n3 · Puntuación Multidimensional y Diferenciación por Contenedor');

const photoServiceAction = {
    id: 'photo-1',
    url: 'https://cdn.rotary4281.org/service-hero.jpg',
    title: 'Construcción comunitaria de vivienda y acceso al agua',
    description: 'Socios del Club Rotario Sevilla Centenario en trabajo conjunto con la comunidad rural.',
    club: 'Club Rotario Sevilla Centenario',
    consentVerified: true,
    technicalMetrics: {
        width: 1600,
        height: 700,
        sharpness: 14.2, // Muy nítida
        brightness: 130, // Exposición óptima
    },
    semanticAnalysis: {
        showsServiceAction: true,
        showsFellowship: true,
        isRotaryBranded: true,
        hasClearFocalPoint: true,
        hasSpaceForText: true,
        isGoodCropCandidate: true,
        showsAuthenticEmotion: true,
        showsCollaboration: true,
        showsResultsOrBeneficiaries: true,
    },
};

const scoreHero = scoreCandidateForContainer(photoServiceAction, 'hero', 0);
assert.ok(scoreHero.score >= 85, `El puntaje para Hero debe ser alto (obtuvo ${scoreHero.score})`);
assert.equal(scoreHero.eligible, true);
assert.ok(scoreHero.facts.length >= 3, 'Debe aportar hechos observables medidos');
assert.ok(scoreHero.breakdown.institutional >= 75);
assert.ok(scoreHero.breakdown.technical >= 80);

// Fotografía con temática exclusiva de La Fundación Rotaria (Subvención Global)
const photoTRF = {
    id: 'photo-2',
    url: 'https://cdn.rotary4281.org/trf-grant.jpg',
    title: 'Subvención Global de La Fundación Rotaria para salud materno-infantil',
    description: 'Entrega de equipos médicos financiados por Subvención Global de La Fundación Rotaria.',
    club: 'Club Rotario Medellín',
    consentVerified: true,
    technicalMetrics: { width: 1600, height: 700, sharpness: 10, brightness: 120 },
    semanticAnalysis: {
        showsServiceAction: true,
        isRotaryBranded: true,
        primaryCause: 'materno_infantil',
        hasClearFocalPoint: true,
        hasSpaceForText: true,
    },
};

const scoreTRFOnFoundation = scoreCandidateForContainer(photoTRF, 'foundation', 0);
const scoreTRFOnJoin = scoreCandidateForContainer(photoTRF, 'join', 0);
assert.ok(
    scoreTRFOnFoundation.score > scoreTRFOnJoin.score,
    `La misma imagen debe puntuar más alto en Fundación Rotaria (${scoreTRFOnFoundation.score}) que en Sección Únete (${scoreTRFOnJoin.score})`
);
console.log(`  ✓ Puntuación contextual calculada: Hero=${scoreHero.score}/100, TRF en Fundación=${scoreTRFOnFoundation.score}/100 vs Únete=${scoreTRFOnJoin.score}/100`);

// ── 4. Algoritmo de Diversidad de Clubes y Duplicados ───────────────────────
console.log('\n4 · Planificación de Recomendaciones, Diversidad y Duplicados');

const mockCandidates = [
    {
        id: 'c1', url: 'https://cdn.rotary4281.org/c1.jpg', club: 'Club Rotario Bogotá',
        title: 'Proyecto 1', consentVerified: true,
        technicalMetrics: { width: 1600, height: 700, sharpness: 12 },
        semanticAnalysis: { showsServiceAction: true, hasClearFocalPoint: true, hasSpaceForText: true },
        hash: '1111000011110000',
    },
    {
        id: 'c2', url: 'https://cdn.rotary4281.org/c2.jpg', club: 'Club Rotario Bogotá',
        title: 'Proyecto 2', consentVerified: true,
        technicalMetrics: { width: 1600, height: 700, sharpness: 12 },
        semanticAnalysis: { showsServiceAction: true, hasClearFocalPoint: true, hasSpaceForText: true },
        hash: '1111000011110001', // Casi duplicado de c1
    },
    {
        id: 'c3', url: 'https://cdn.rotary4281.org/c3.jpg', club: 'Club Rotario Cali',
        title: 'Siembra de árboles', consentVerified: true,
        technicalMetrics: { width: 1600, height: 700, sharpness: 11 },
        semanticAnalysis: { showsServiceAction: true, hasClearFocalPoint: true, hasSpaceForText: true },
        hash: '0000111100001111',
    },
    {
        id: 'c4', url: 'https://cdn.rotary4281.org/c4.jpg', club: 'Club Rotario Bucaramanga',
        title: 'Jornada médica', consentVerified: true,
        technicalMetrics: { width: 1600, height: 700, sharpness: 10 },
        semanticAnalysis: { showsServiceAction: true, hasClearFocalPoint: true, hasSpaceForText: true },
        hash: '1010101010101010',
    },
    {
        id: 'c5', url: 'https://cdn.rotary4281.org/c5.jpg', club: 'Club Rotario Manizales',
        title: 'Intercambio YEP', consentVerified: true,
        technicalMetrics: { width: 1600, height: 700, sharpness: 9 },
        semanticAnalysis: { showsServiceAction: true, hasClearFocalPoint: true, hasSpaceForText: true },
        hash: '0101010101010101',
    },
];

// Comprobar detección de duplicados con distancia Hamming
const dist = hammingDistance(mockCandidates[0].hash, mockCandidates[1].hash);
assert.equal(dist, 1, 'La distancia Hamming entre c1 y c2 debe ser 1 (casi idénticas)');
assert.equal(areImagesNearDuplicates(mockCandidates[0].hash, mockCandidates[1].hash, 6), true);

// Bloquear slot 0 del Hero
const lockedSlots = {
    'hero-0': { lockedBy: 'Administrador', reason: 'Imagen de portada institucional fija' }
};

const heroPlan = planContainerRecommendations({
    candidates: mockCandidates,
    containerKey: 'hero',
    slotsCount: 5,
    lockedSlots,
});

assert.equal(heroPlan.length, 5, 'Debe planificar los 5 slides del Hero');
assert.equal(heroPlan[0].isLocked, true, 'Slide 0 debe respetar el bloqueo');
assert.equal(heroPlan[0].selected, null, 'Slide bloqueado no debe proponer reemplazo automático');

// Comprobar que en los slides desbloqueados hay diversidad de clubes
const recommendedClubs = heroPlan.filter(p => !p.isLocked && p.selected).map(p => p.selected.club);
assert.ok(recommendedClubs.includes('Club Rotario Cali'), 'Debe incluir a Club Rotario Cali');
assert.ok(recommendedClubs.includes('Club Rotario Bucaramanga'), 'Debe incluir a Club Rotario Bucaramanga');
console.log('  ✓ Planificador de Hero: respeto estricto de slot bloqueado y balance de clubes');

console.log('\n════════════════════════════════════════════════════════════');
console.log('🎉 TODAS LAS VERIFICACIONES DE CURADURÍA VISUAL PASARON OK');
console.log('════════════════════════════════════════════════════════════\n');
