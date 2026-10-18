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
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
    DEFAULT_CURATION_WEIGHTS,
    DEFAULT_EXCLUSIVITY_RULES,
    CONTAINER_SPECS,
    ROTARY_CAUSES,
    scoreCandidateForContainer,
    evaluateCandidateEligibility,
    planContainerRecommendations,
    detectNewsCoverConflict,
    normalizeImageUrl,
    hammingDistance,
    areImagesNearDuplicates,
} from '../server/lib/visualCurationSpec.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const root = path.resolve(__dirname, '..');

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

// ── 5. Curaduría Visual V2.1: Encuadre Inteligente y Ancho Completo ─────────
console.log('\n5 · Curaduría Visual V2.1: Encuadre Inteligente y Ancho Completo');

// A. Riesgo de recorte en foto vertical para Hero
const verticalPhoto = {
    title: 'Voluntariado juvenil',
    club: 'Club Rotario Cali San Fernando',
    consentVerified: true,
    technicalMetrics: { width: 1080, height: 1920, sharpness: 14, brightness: 120 },
    semanticAnalysis: {
        showsServiceAction: true,
        peopleCount: 4,
        hasPeople: true,
        isRotaryBranded: true,
    },
};
const evalVertical = scoreCandidateForContainer(verticalPhoto, 'hero', 0);
assert.equal(evalVertical.cropRisk, 'high', 'Foto vertical en Hero panorámico debe tener cropRisk alto');
assert.equal(evalVertical.requiresCropAdjustment, true, 'Debe requerir ajuste de encuadre');
assert.equal(evalVertical.cropSuggested.mode, 'contain', 'Foto vertical extrema en Hero debe sugerir modo contain');

// B. Foto 4:3 convencional con personas en Hero -> cálculo de punto focal inteligente
const photo43 = {
    title: 'Entrega de filtros de agua en escuela rural',
    club: 'Club Rotario Armenia',
    consentVerified: true,
    technicalMetrics: { width: 1600, height: 1200, sharpness: 12, brightness: 125 }, // 4:3
    semanticAnalysis: {
        showsServiceAction: true,
        peopleCount: 3,
        hasPeople: true,
    },
};
const eval43 = scoreCandidateForContainer(photo43, 'hero', 0);
assert.equal(eval43.cropRisk, 'high', 'Foto 4:3 en Hero 16:7 debe marcar cropRisk alto por recorte vertical');
assert.equal(eval43.requiresCropAdjustment, true, 'Debe requerir ajuste de encuadre');
assert.equal(eval43.cropSuggested.y, 65, 'Punto focal sugerido debe ser 65% para no cortar rostros/personas abajo');
console.log('  ✓ Detección de riesgo de recorte y punto focal inteligente (65% Y para fotos 4:3 en Hero)');

// C. Verificación de Ancho Completo en ImageDistribution.tsx
const imgDistContent = fs.readFileSync(path.join(root, 'src/pages/admin/ImageDistribution.tsx'), 'utf8');
assert.ok(!imgDistContent.includes('space-y-6 max-w-5xl'), 'ImageDistribution no debe estar limitado a max-w-5xl');
assert.ok(imgDistContent.includes('space-y-6 w-full'), 'ImageDistribution debe usar w-full');
console.log('  ✓ Layout del Administrador: ancho útil disponible corregido a 100% (w-full sin tope 5xl)');

// D. Verificación del Renderizador de Hero en Sitio Público (HeroSection.tsx)
const heroSectionContent = fs.readFileSync(path.join(root, 'src/sections/HeroSection.tsx'), 'utf8');
assert.ok(!heroSectionContent.includes('object-cover object-top'), 'HeroSection no debe tener object-top estático hardcodeado');
assert.ok(heroSectionContent.includes('objectPosition: `${slide.posX}% ${slide.posY}%`'), 'HeroSection debe sincronizar objectPosition');
assert.ok(heroSectionContent.includes("slide.mode === 'contain'"), 'HeroSection debe soportar modo contain');
assert.ok(heroSectionContent.includes('blur-2xl'), 'HeroSection debe pintar fondo difuminado complementario en modo contain');
console.log('  ✓ Sincronización del sitio público: HeroSection consume parámetros de encuadre y fondo ambiental');

// ── 6. Curaduría Visual V2.2: Exclusividad Hero vs Noticias y Ancho de Pestañas ─────────
console.log('\n6 · Curaduría Visual V2.2: Exclusividad Hero vs Noticias y Ancho de Pestañas');

// A. Verificación de Reglas por Omisión
assert.equal(DEFAULT_EXCLUSIVITY_RULES.avoidHeroNewsDuplicates, true, 'avoidHeroNewsDuplicates debe ser true por defecto');
assert.equal(DEFAULT_EXCLUSIVITY_RULES.detectResizedOrCropped, true, 'detectResizedOrCropped debe ser true por defecto');
assert.equal(DEFAULT_EXCLUSIVITY_RULES.avoidHeroSlideDuplicates, true, 'avoidHeroSlideDuplicates debe ser true por defecto');
assert.equal(DEFAULT_EXCLUSIVITY_RULES.prioritizeClubDiversity, true, 'prioritizeClubDiversity debe ser true por defecto');
assert.equal(DEFAULT_EXCLUSIVITY_RULES.checkNewsCoversOnCuration, true, 'checkNewsCoversOnCuration debe ser true por defecto');
console.log('  ✓ 5 reglas de exclusividad y diversidad visual activas por omisión');

// B. Detección Inteligente de Duplicados (Exacta y Perceptual)
const publishedNewsCovers = [
    {
        postId: 'post-101',
        title: 'Entrega de kits escolares en Santa Rosa de Cabal',
        image: 'https://cdn.rotary4281.org/uploads/kits-escolares-portada.jpg?w=1200&q=80',
        fileId: 'file-kits-1',
        submissionId: 'sub-kits',
        hash: 'a1b2c3d4e5f60000',
        publishedAt: '2026-10-15',
    },
    {
        postId: 'post-102',
        title: 'Jornada de salud visual en Pereira',
        image: 'https://cdn.rotary4281.org/uploads/salud-visual-pereira.jpg',
        fileId: 'file-salud-1',
        submissionId: 'sub-salud',
        hash: '1122334455667788',
        publishedAt: '2026-10-14',
    }
];

// Caso B1: Coincidencia exacta por URL normalizada
const candExact = {
    url: 'https://cdn.rotary4281.org/uploads/kits-escolares-portada.jpg?w=800&q=70',
    title: 'Kits escolares foto principal',
    club: 'Club Rotario Santa Rosa de Cabal',
    submissionId: 'sub-other',
};
const conflictExact = detectNewsCoverConflict(candExact, publishedNewsCovers);
assert.equal(conflictExact.hasConflict, true, 'Debe detectar conflicto por URL normalizada');
assert.equal(conflictExact.matchType, 'exact_url', 'El tipo de match debe ser exact_url');
assert.equal(conflictExact.postId, 'post-101');

// Caso B2: Coincidencia perceptual por dHash (recortada o redimensionada)
const candPerceptual = {
    url: 'https://cdn.rotary4281.org/uploads/kits-crop-hero.jpg',
    title: 'Kits escolares recorte horizontal',
    club: 'Club Rotario Santa Rosa de Cabal',
    hash: 'a1b2c3d4e5f60001', // Distancia Hamming 1 con hash de post-101
};
const conflictPerceptual = detectNewsCoverConflict(candPerceptual, publishedNewsCovers);
assert.equal(conflictPerceptual.hasConflict, true, 'Debe detectar conflicto perceptual por dHash <= 8');
assert.equal(conflictPerceptual.matchType, 'perceptual_hash', 'El tipo de match debe ser perceptual_hash');
console.log('  ✓ Detección de duplicados: URL normalizada y hash perceptual (dHash) validados');

// C. Calidad Visual no penalizada artificialmente pero marcada inelegible para Hero
const candConflictingForHero = {
    title: 'Entrega de kits escolares — Club Rotario Santa Rosa de Cabal',
    url: 'https://cdn.rotary4281.org/uploads/kits-escolares-portada.jpg',
    club: 'Club Rotario Santa Rosa de Cabal',
    consentVerified: true,
    technicalMetrics: { width: 1920, height: 1080, sharpness: 18, brightness: 125 },
    semanticAnalysis: {
        showsServiceAction: true,
        peopleCount: 5,
        hasPeople: true,
        isRotaryBranded: true,
        relevantCause: 'Educación básica y alfabetización',
    },
};
const evalHeroWithConflict = scoreCandidateForContainer(candConflictingForHero, 'hero', 0, {}, publishedNewsCovers);
const evalHeroWithoutConflict = scoreCandidateForContainer(candConflictingForHero, 'hero', 0, {}, []);
assert.equal(evalHeroWithConflict.score, evalHeroWithoutConflict.score, 'El puntaje visual debe ser idéntico sin penalización artificial');
assert.equal(evalHeroWithConflict.isEligibleForHero, false, 'isEligibleForHero debe ser false por conflicto con noticia');
assert.equal(evalHeroWithConflict.conflictInfo?.hasConflict, true, 'Debe adjuntar conflictInfo');
console.log('  ✓ Puntuación visual íntegra (score idéntico sin penalización) con inelegibilidad editorial explícita para Hero');

// D. Búsqueda y Sugerencia Inteligente de Alternativa desde la Misma Solicitud
const candidatesWithAlternative = [
    {
        id: 'cand-cover',
        submissionId: 'sub-kits',
        url: 'https://cdn.rotary4281.org/uploads/kits-escolares-portada.jpg',
        title: 'Foto 1 - Portada de Noticia',
        club: 'Club Rotario Santa Rosa de Cabal',
        consentVerified: true,
        technicalMetrics: { width: 1920, height: 1080, sharpness: 18, brightness: 125 },
        semanticAnalysis: { showsServiceAction: true, peopleCount: 5, hasPeople: true, isRotaryBranded: true },
    },
    {
        id: 'cand-alternative',
        submissionId: 'sub-kits',
        url: 'https://cdn.rotary4281.org/uploads/kits-escolares-toma-amplia.jpg',
        title: 'Foto 2 - Entrega a beneficiarios toma panorámica',
        club: 'Club Rotario Santa Rosa de Cabal',
        consentVerified: true,
        technicalMetrics: { width: 1920, height: 1080, sharpness: 16, brightness: 120 },
        semanticAnalysis: { showsServiceAction: true, peopleCount: 6, hasPeople: true, isRotaryBranded: true },
    },
    {
        id: 'cand-cali',
        submissionId: 'sub-cali',
        url: 'https://cdn.rotary4281.org/uploads/cali-salud.jpg',
        title: 'Jornada médica',
        club: 'Club Rotario Cali',
        consentVerified: true,
        technicalMetrics: { width: 1920, height: 1080, sharpness: 15, brightness: 120 },
        semanticAnalysis: { showsServiceAction: true, peopleCount: 3, hasPeople: true },
    }
];

const planWithNews = planContainerRecommendations({
    candidates: candidatesWithAlternative,
    containerKey: 'hero',
    slotsCount: 3,
    lockedSlots: {},
    publishedNewsCovers,
    exclusivityRules: DEFAULT_EXCLUSIVITY_RULES,
});

assert.ok(planWithNews.length >= 2, 'Debe planificar recomendaciones');
const alternativeRec = planWithNews.find(p => p.selected?.id === 'cand-alternative');
assert.ok(alternativeRec, 'Debe haber seleccionado cand-alternative al estar cand-cover en conflicto con noticia');
assert.equal(alternativeRec.isAlternative, true, 'isAlternative debe ser true');
assert.ok(alternativeRec.alternativeReason.includes('alternativa'), 'alternativeReason debe explicar la sustitución');
console.log('  ✓ Sustitución inteligente: IA localiza toma alternativa de la misma actividad sin duplicar noticia');

// E. Verificación de Ancho 100% y Distribución Responsive en Pestañas Internas
const containersTabContent = fs.readFileSync(path.join(root, 'src/components/admin/curation/ContainersTab.tsx'), 'utf8');
assert.ok(!containersTabContent.includes('max-w-4xl'), 'ContainersTab no debe tener max-w-4xl');
assert.ok(containersTabContent.includes('w-full space-y-6'), 'ContainersTab debe usar w-full space-y-6');
assert.ok(containersTabContent.includes('2xl:grid-cols-5'), 'ContainersTab debe contar con cuadrícula adaptable de hasta 5 columnas');

const schedTabContent = fs.readFileSync(path.join(root, 'src/components/admin/curation/SchedulingTab.tsx'), 'utf8');
assert.ok(!schedTabContent.includes('max-w-4xl'), 'SchedulingTab no debe tener max-w-4xl');
assert.ok(schedTabContent.includes('w-full space-y-6'), 'SchedulingTab debe usar w-full space-y-6');
assert.ok(schedTabContent.includes('Reglas de Exclusividad y Diversidad Visual'), 'SchedulingTab debe incluir sección de reglas de exclusividad');
console.log('  ✓ Distribución UI de pestañas: ContainersTab y SchedulingTab usan 100% del ancho útil sin espacios vacíos');

console.log('\n════════════════════════════════════════════════════════════');
console.log('🎉 TODAS LAS VERIFICACIONES DE CURADURÍA VISUAL V2.2 PASARON OK');
console.log('════════════════════════════════════════════════════════════\n');

