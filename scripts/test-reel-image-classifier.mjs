// ════════════════════════════════════════════════════════════════════════════
// Pruebas unitarias para el clasificador de imágenes de Reels y la regla de 5 fotos
// ════════════════════════════════════════════════════════════════════════════
import test from 'node:test';
import assert from 'node:assert/strict';
import {
    classifyImageForReel,
    auditSubmissionPhotosForReel,
    MIN_OPTIMAL_REEL_PHOTOS,
} from '../server/lib/reelImageClassifier.js';

test('El umbral óptimo para Reels es exactamente 5 fotografías', () => {
    assert.equal(MIN_OPTIMAL_REEL_PHOTOS, 5);
});

test('Reconoce una fotografía genuina de actividad', () => {
    const f = { id: 'f1', filename: 'entrega_mercados_01.jpg', kind: 'image' };
    const res = classifyImageForReel(f);
    assert.equal(res.isRealPhoto, true);
    assert.equal(res.isGraphic, false);
    assert.equal(res.type, 'fotografia');
});

test('Detecta banners por nombre de archivo', () => {
    const f1 = { id: 'f1', filename: 'banner_evento.jpg', kind: 'image' };
    const f2 = { id: 'f2', filename: 'portada_facebook.png', kind: 'image' };
    const f3 = { id: 'f3', filename: 'cabecera-web.jpeg', kind: 'image' };

    assert.equal(classifyImageForReel(f1).isGraphic, true);
    assert.equal(classifyImageForReel(f1).type, 'banner');
    assert.equal(classifyImageForReel(f2).isGraphic, true);
    assert.equal(classifyImageForReel(f3).isGraphic, true);
});

test('Detecta tarjetas de invitación y convocatorias por nombre de archivo', () => {
    const f1 = { id: 'f1', filename: 'invitacion_cena_gala.jpg', kind: 'image' };
    const f2 = { id: 'f2', filename: 'tarjeta_bienvenida.png', kind: 'image' };
    const f3 = { id: 'f3', filename: 'convocatoria_becas.jpeg', kind: 'image' };

    assert.equal(classifyImageForReel(f1).isGraphic, true);
    assert.equal(classifyImageForReel(f1).type, 'invitacion');
    assert.equal(classifyImageForReel(f2).isGraphic, true);
    assert.equal(classifyImageForReel(f3).isGraphic, true);
});

test('Detecta afiches y flyers por nombre de archivo', () => {
    const f1 = { id: 'f1', filename: 'flyer_concierto.jpg', kind: 'image' };
    const f2 = { id: 'f2', filename: 'afiche_jornada_vacunacion.png', kind: 'image' };
    const f3 = { id: 'f3', filename: 'volante_informativo.jpeg', kind: 'image' };

    assert.equal(classifyImageForReel(f1).isGraphic, true);
    assert.equal(classifyImageForReel(f1).type, 'flyer');
    assert.equal(classifyImageForReel(f2).isGraphic, true);
    assert.equal(classifyImageForReel(f3).isGraphic, true);
});

test('Detecta capturas de pantalla y documentos a través del análisis de visión', () => {
    const f1 = { id: 'f1', filename: 'adjunto1.jpg', kind: 'image' };
    const mediaCaptura = { analysis: { vision: { screenshot: true } } };
    const resCaptura = classifyImageForReel(f1, mediaCaptura);
    assert.equal(resCaptura.isGraphic, true);
    assert.equal(resCaptura.type, 'captura');

    const f2 = { id: 'f2', filename: 'adjunto2.jpg', kind: 'image' };
    const mediaDoc = { analysis: { vision: { document: true } } };
    const resDoc = classifyImageForReel(f2, mediaDoc);
    assert.equal(resDoc.isGraphic, true);
    assert.equal(resDoc.type, 'documento');
});

test('Detecta banners por proporciones ultra-panorámicas', () => {
    const f = { id: 'f1', filename: 'diseno_horizontal.jpg', kind: 'image' };
    const media = { analysis: { measured: { width: 1920, height: 600 } } }; // ratio 3.2
    const res = classifyImageForReel(f, media);
    assert.equal(res.isGraphic, true);
    assert.equal(res.type, 'banner');
});

test('Auditoría con 5 fotos reales resulta ÓPTIMA para Reel', () => {
    const files = [
        { id: 'f1', filename: 'foto_1.jpg', kind: 'image' },
        { id: 'f2', filename: 'foto_2.jpg', kind: 'image' },
        { id: 'f3', filename: 'foto_3.jpg', kind: 'image' },
        { id: 'f4', filename: 'foto_4.jpg', kind: 'image' },
        { id: 'f5', filename: 'foto_5.jpg', kind: 'image' },
    ];
    const audit = auditSubmissionPhotosForReel(files);
    assert.equal(audit.totalImages, 5);
    assert.equal(audit.realPhotoCount, 5);
    assert.equal(audit.graphicCount, 0);
    assert.equal(audit.isOptimal, true);
    assert.equal(audit.canAutoGenerate, true);
    assert.equal(audit.status, 'optimo');
});

test('Auditoría con 5 imágenes donde 2 son banners/invitaciones NO resulta óptima y requiere mapeo', () => {
    const files = [
        { id: 'f1', filename: 'foto_comunidad_1.jpg', kind: 'image' },
        { id: 'f2', filename: 'banner_promocional.jpg', kind: 'image' },
        { id: 'f3', filename: 'tarjeta_invitacion.png', kind: 'image' },
        { id: 'f4', filename: 'foto_entrega_refrigerios.jpg', kind: 'image' },
        { id: 'f5', filename: 'foto_voluntarios.jpg', kind: 'image' },
    ];
    const audit = auditSubmissionPhotosForReel(files);
    assert.equal(audit.totalImages, 5);
    assert.equal(audit.realPhotoCount, 3);
    assert.equal(audit.graphicCount, 2);
    assert.equal(audit.isOptimal, false);
    assert.equal(audit.canAutoGenerate, false);
    assert.equal(audit.status, 'requiere_mapeo');
    assert.match(audit.statusMessage, /requiere al menos 5 fotos/i);
});

test('Auditoría con 7 imágenes donde 2 son flyers pero 5 son fotos reales resulta ÓPTIMA', () => {
    const files = [
        { id: 'f1', filename: 'foto_1.jpg', kind: 'image' },
        { id: 'f2', filename: 'flyer_evento.jpg', kind: 'image' },
        { id: 'f3', filename: 'banner_header.png', kind: 'image' },
        { id: 'f4', filename: 'foto_2.jpg', kind: 'image' },
        { id: 'f5', filename: 'foto_3.jpg', kind: 'image' },
        { id: 'f6', filename: 'foto_4.jpg', kind: 'image' },
        { id: 'f7', filename: 'foto_5.jpg', kind: 'image' },
    ];
    const audit = auditSubmissionPhotosForReel(files);
    assert.equal(audit.totalImages, 7);
    assert.equal(audit.realPhotoCount, 5);
    assert.equal(audit.graphicCount, 2);
    assert.equal(audit.isOptimal, true);
    assert.equal(audit.canAutoGenerate, true);
    assert.equal(audit.status, 'optimo');
});
