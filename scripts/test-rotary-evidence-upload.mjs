// Test suite para la regla de evidencias de Rotary en Acción (v4.1120)
// Verifica el comportamiento de selección, acumulación, deduplicación,
// límites de fotos/videos y validación de 5 fotos, 10 fotos, 10 fotos + 1 video, etc.

import assert from 'node:assert/strict';
import {
    checkFileMeta,
    kindOf,
    validateSubmission,
    MIN_PHOTOS,
    MAX_PHOTOS,
    MAX_VIDEOS,
    MAX_FILES,
    IMAGE_MAX_BYTES,
    VIDEO_MAX_BYTES
} from '../server/lib/contentSubmissionSpec.js';

console.log('--- TEST 1: Constantes de límites ---');
assert.equal(MIN_PHOTOS, 5, 'Mínimo de fotos debe ser 5');
assert.equal(MAX_PHOTOS, 10, 'Máximo de fotos debe ser 10');
assert.equal(MAX_VIDEOS, 1, 'Máximo de videos debe ser 1');
assert.equal(MAX_FILES, 11, 'Máximo de archivos totales debe ser 11 (10 fotos + 1 video)');
assert.equal(IMAGE_MAX_BYTES, 25 * 1024 * 1024, 'Tope de fotos debe ser 25 MB');
assert.equal(VIDEO_MAX_BYTES, 200 * 1024 * 1024, 'Tope de videos debe ser 200 MB');
console.log('✓ Límites correctamente establecidos');

console.log('\n--- TEST 2: checkFileMeta con ambas firmas (móvil y servidor) ---');
// Firma { name, type, size }
const metaFoto1 = checkFileMeta({ name: 'foto1.jpg', type: 'image/jpeg', size: 3.7 * 1024 * 1024 });
assert.equal(metaFoto1.ok, true, 'Foto válida con { name, type }');
assert.equal(metaFoto1.kind, 'image');

// Firma { filename, contentType, size }
const metaFoto2 = checkFileMeta({ filename: 'foto2.png', contentType: 'image/png', size: 4 * 1024 * 1024 });
assert.equal(metaFoto2.ok, true, 'Foto válida con { filename, contentType }');
assert.equal(metaFoto2.kind, 'image');

// Video de 71.2 MB (caso real de la captura)
const metaVideo = checkFileMeta({ name: '1001663674.mp4', type: 'video/mp4', size: 71.2 * 1024 * 1024 });
assert.equal(metaVideo.ok, true, 'Video de 71.2 MB debe ser válido');
assert.equal(metaVideo.kind, 'video');

// Archivo inválido
const metaTxt = checkFileMeta({ name: 'documento.pdf', type: 'application/pdf', size: 1024 });
assert.equal(metaTxt.ok, false, 'PDF debe ser rechazado');
assert.equal(metaTxt.kind, null);

// Video > 200 MB
const metaVideoGigante = checkFileMeta({ name: 'pesado.mp4', type: 'video/mp4', size: 201 * 1024 * 1024 });
assert.equal(metaVideoGigante.ok, false, 'Video > 200 MB debe ser rechazado');

// Foto > 25 MB
const metaFotoGigante = checkFileMeta({ name: 'pesada.jpg', type: 'image/jpeg', size: 26 * 1024 * 1024 });
assert.equal(metaFotoGigante.ok, false, 'Foto > 25 MB debe ser rechazada');
console.log('✓ checkFileMeta valida tipos y pesos correctamente');

console.log('\n--- TEST 3: Simulación de selección y acumulación incremental ---');
// Simulación del estado y la función agregarArchivos
let adjuntos = [];
const agregarSimulado = (nuevosArchivos) => {
    let currentPhotos = adjuntos.filter(a => a.kind === 'image').length;
    let currentVideos = adjuntos.filter(a => a.kind === 'video').length;
    const itemsToAdd = [];
    const errores = [];

    for (const f of nuevosArchivos) {
        const meta = checkFileMeta({ contentType: f.type, filename: f.name, size: f.size });
        if (!meta.ok) {
            errores.push(`${f.name}: error`);
            continue;
        }

        const yaExiste = adjuntos.some(a => a.file.name === f.name && a.file.size === f.size && a.file.lastModified === f.lastModified)
            || itemsToAdd.some(a => a.file.name === f.name && a.file.size === f.size && a.file.lastModified === f.lastModified);
        if (yaExiste) continue;

        const kind = meta.kind;
        if (kind === 'video') {
            if (currentVideos >= MAX_VIDEOS) {
                errores.push(`Solo se permite 1 video`);
                continue;
            }
            currentVideos++;
        } else {
            if (currentPhotos >= MAX_PHOTOS) {
                errores.push(`Solo se permiten 10 fotos`);
                continue;
            }
            currentPhotos++;
        }

        itemsToAdd.push({ id: Math.random().toString(), file: f, kind, estado: 'uploaded' });
    }

    adjuntos = [...adjuntos, ...itemsToAdd];
    return { agregados: itemsToAdd.length, errores };
};

// Paso A: Selección inicial de 4 fotos
const lote1 = [
    { name: 'foto1.jpg', type: 'image/jpeg', size: 3000000, lastModified: 1000 },
    { name: 'foto2.jpg', type: 'image/jpeg', size: 3100000, lastModified: 2000 },
    { name: 'foto3.jpg', type: 'image/jpeg', size: 3200000, lastModified: 3000 },
    { name: 'foto4.jpg', type: 'image/jpeg', size: 3300000, lastModified: 4000 },
];
agregarSimulado(lote1);
assert.equal(adjuntos.length, 4, 'Deben haber 4 fotos');
const fotosLote1 = adjuntos.filter(a => a.kind === 'image').length;
assert.equal(fotosLote1, 4);
const faltanPasoA = Math.max(0, MIN_PHOTOS - fotosLote1);
assert.equal(faltanPasoA, 1, 'Falta 1 fotografía');

// Paso B: El usuario selecciona la 5ta foto faltante
const lote2 = [
    { name: 'foto5.jpg', type: 'image/jpeg', size: 3400000, lastModified: 5000 },
];
agregarSimulado(lote2);
assert.equal(adjuntos.length, 5, 'Deben haber 5 fotos ahora');
const fotosLote2 = adjuntos.filter(a => a.kind === 'image').length;
assert.equal(fotosLote2, 5);
const faltanPasoB = Math.max(0, MIN_PHOTOS - fotosLote2);
assert.equal(faltanPasoB, 0, 'La advertencia de que falta fotografía desaparece');

// Paso C: Deduplicación: re-seleccionar la foto 5 no la duplica
agregarSimulado(lote2);
assert.equal(adjuntos.length, 5, 'Deduplicación evita que foto 5 se agregue 2 veces');

// Paso D: Agregar 5 fotos más hasta 10 fotos
const lote3 = [
    { name: 'foto6.jpg', type: 'image/jpeg', size: 3000000, lastModified: 6000 },
    { name: 'foto7.jpg', type: 'image/jpeg', size: 3000000, lastModified: 7000 },
    { name: 'foto8.jpg', type: 'image/jpeg', size: 3000000, lastModified: 8000 },
    { name: 'foto9.jpg', type: 'image/jpeg', size: 3000000, lastModified: 9000 },
    { name: 'foto10.jpg', type: 'image/jpeg', size: 3000000, lastModified: 10000 },
];
agregarSimulado(lote3);
assert.equal(adjuntos.filter(a => a.kind === 'image').length, 10, 'Deben haber 10 fotos');

// Paso E: Intentar agregar foto 11 (debe ser bloqueada)
const loteFoto11 = [
    { name: 'foto11.jpg', type: 'image/jpeg', size: 3000000, lastModified: 11000 },
];
const res11 = agregarSimulado(loteFoto11);
assert.equal(res11.agregados, 0, 'Foto 11 no se debe agregar');
assert.equal(adjuntos.filter(a => a.kind === 'image').length, 10, 'Se mantienen 10 fotos');

// Paso F: Agregar 1 video de 71.2 MB
const loteVideo = [
    { name: '1001663674.mp4', type: 'video/mp4', size: 71.2 * 1024 * 1024, lastModified: 12000 },
];
agregarSimulado(loteVideo);
assert.equal(adjuntos.filter(a => a.kind === 'video').length, 1, 'Debe haber 1 video');
assert.equal(adjuntos.length, 11, 'Total de 11 archivos (10 fotos + 1 video)');

// Paso G: Intentar agregar un segundo video (debe ser bloqueado)
const loteSegundoVideo = [
    { name: 'segundo_video.mp4', type: 'video/mp4', size: 20000000, lastModified: 13000 },
];
const resVideo2 = agregarSimulado(loteSegundoVideo);
assert.equal(resVideo2.agregados, 0, 'Segundo video no se debe agregar');
assert.equal(adjuntos.filter(a => a.kind === 'video').length, 1, 'Se mantiene 1 video');

console.log('✓ Acumulación, deduplicación y límites en cliente verificados con éxito');

console.log('\n--- TEST 4: Validación en Backend (validateSubmission) ---');

const baseData = {
    senderName: 'María Pérez',
    senderEmail: 'maria@ejemplo.org',
    consent: true,
    story: 'Jornada de salud y vacunación realizada por el club en el municipio.',
    title: 'Jornada de Salud',
};

// Caso 1: 4 fotos + 1 video (NO VÁLIDO: video no cuenta como foto para las 5 mínimas)
const caso4Fotos1Video = {
    ...baseData,
    files: [
        { key: 'k1', filename: 'foto1.jpg', contentType: 'image/jpeg' },
        { key: 'k2', filename: 'foto2.jpg', contentType: 'image/jpeg' },
        { key: 'k3', filename: 'foto3.jpg', contentType: 'image/jpeg' },
        { key: 'k4', filename: 'foto4.jpg', contentType: 'image/jpeg' },
        { key: 'kv1', filename: 'video.mp4', contentType: 'video/mp4' },
    ],
};
const v1 = validateSubmission(caso4Fotos1Video, { minPhotos: 5, maxPhotos: 10, maxVideos: 1 });
assert.equal(v1.ok, false, '4 fotos + 1 video no debe ser válido');
assert.match(v1.errors[0], /al menos 5 fotografías/i, 'Mensaje debe indicar al menos 5 fotografías requeridas');

// Caso 2: 5 fotos (VÁLIDO)
const caso5Fotos = {
    ...baseData,
    files: [
        { key: 'k1', filename: 'foto1.jpg', contentType: 'image/jpeg' },
        { key: 'k2', filename: 'foto2.jpg', contentType: 'image/jpeg' },
        { key: 'k3', filename: 'foto3.jpg', contentType: 'image/jpeg' },
        { key: 'k4', filename: 'foto4.jpg', contentType: 'image/jpeg' },
        { key: 'k5', filename: 'foto5.jpg', contentType: 'image/jpeg' },
    ],
};
const v2 = validateSubmission(caso5Fotos, { minPhotos: 5, maxPhotos: 10, maxVideos: 1 });
assert.equal(v2.ok, true, '5 fotos deben ser válidas');

// Caso 3: 5 fotos + 1 video (VÁLIDO)
const caso5Fotos1Video = {
    ...baseData,
    files: [
        ...caso5Fotos.files,
        { key: 'kv1', filename: 'video.mp4', contentType: 'video/mp4' },
    ],
};
const v3 = validateSubmission(caso5Fotos1Video, { minPhotos: 5, maxPhotos: 10, maxVideos: 1 });
assert.equal(v3.ok, true, '5 fotos + 1 video deben ser válidas');

// Caso 4: 10 fotos + 1 video (VÁLIDO: 11 archivos en total)
const caso10Fotos1Video = {
    ...baseData,
    files: [
        { key: 'k1', filename: 'foto1.jpg', contentType: 'image/jpeg' },
        { key: 'k2', filename: 'foto2.jpg', contentType: 'image/jpeg' },
        { key: 'k3', filename: 'foto3.jpg', contentType: 'image/jpeg' },
        { key: 'k4', filename: 'foto4.jpg', contentType: 'image/jpeg' },
        { key: 'k5', filename: 'foto5.jpg', contentType: 'image/jpeg' },
        { key: 'k6', filename: 'foto6.jpg', contentType: 'image/jpeg' },
        { key: 'k7', filename: 'foto7.jpg', contentType: 'image/jpeg' },
        { key: 'k8', filename: 'foto8.jpg', contentType: 'image/jpeg' },
        { key: 'k9', filename: 'foto9.jpg', contentType: 'image/jpeg' },
        { key: 'k10', filename: 'foto10.jpg', contentType: 'image/jpeg' },
        { key: 'kv1', filename: 'video.mp4', contentType: 'video/mp4' },
    ],
};
const v4 = validateSubmission(caso10Fotos1Video, { minPhotos: 5, maxPhotos: 10, maxVideos: 1 });
assert.equal(v4.ok, true, '10 fotos + 1 video deben ser válidas');

// Caso 5: 11 fotos (NO VÁLIDO: máx 10 fotos)
const caso11Fotos = {
    ...baseData,
    files: [
        ...caso10Fotos1Video.files.filter(f => f.filename.startsWith('foto')),
        { key: 'k11', filename: 'foto11.jpg', contentType: 'image/jpeg' },
    ],
};
const v5 = validateSubmission(caso11Fotos, { minPhotos: 5, maxPhotos: 10, maxVideos: 1 });
assert.equal(v5.ok, false, '11 fotos deben ser rechazadas');
assert.match(v5.errors[0], /hasta 10 fotografías/i);

// Caso 6: 5 fotos + 2 videos (NO VÁLIDO: máx 1 video)
const caso5Fotos2Videos = {
    ...baseData,
    files: [
        ...caso5Fotos.files,
        { key: 'kv1', filename: 'video1.mp4', contentType: 'video/mp4' },
        { key: 'kv2', filename: 'video2.mp4', contentType: 'video/mp4' },
    ],
};
const v6 = validateSubmission(caso5Fotos2Videos, { minPhotos: 5, maxPhotos: 10, maxVideos: 1 });
assert.equal(v6.ok, false, '5 fotos + 2 videos deben ser rechazados');
assert.match(v6.errors[0], /máximo 1 video/i);

console.log('✓ Validaciones de servidor (4+1 video, 5, 5+1 video, 10+1 video, 11 fotos, 5+2 videos) probadas con éxito');
console.log('\nTODAS LAS PRUEBAS PASARON EXITOSAMENTE 🎉');
