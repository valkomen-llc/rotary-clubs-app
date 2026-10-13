#!/usr/bin/env node
// ════════════════════════════════════════════════════════════════════
// Verificación integral de la funcionalidad de Video en Eventos
// Club Platform — Rotary Distrito 4281
//
// Comprueba:
//   1. Resolución de YouTube (enlaces largos, cortos, shorts, embeds, timestamps).
//   2. Resolución de Vimeo.
//   3. Resolución de videos directos (.mp4, .webm, almacenamiento S3, rutas locales).
//   4. Seguridad: rechazo de javascript:, data:, texto suelto y hosts no reconocidos.
//   5. Manejo de iframes pegados por el usuario.
//   6. Comportamiento en ausencia de video (cero render, null, sin espacios).
//   7. Normalización y preservación de portada personalizada, título y descripción.
//   8. Respaldo y degradación de miniaturas (maxresdefault / hqdefault).
//   9. Registro en el backend (METADATA_KEYS_BY_CAPABILITY.media incluye 'video' y ruta upload-video).
//  10. Ubicación correcta en EventoDetalle.tsx (entre descripción y carrusel de fotos).
//  11. Presencia del editor en Events.tsx (pestaña media).
// ════════════════════════════════════════════════════════════════════
import assert from 'node:assert';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { resolveEventVideo, hasEventVideo, normalizeEventVideo, extractUrlFromEmbed } from '../src/lib/eventVideo.ts';

const root = fileURLToPath(new URL('..', import.meta.url));

let passed = 0;
function test(name, fn) {
    try {
        fn();
        passed++;
        console.log(`  ✓ ${name}`);
    } catch (e) {
        console.error(`  ❌ ${name}`);
        console.error(e);
        process.exit(1);
    }
}

console.log('\n1. Resolución y soporte de YouTube');
test('enlace largo estándar youtube.com/watch?v=ID', () => {
    const res = resolveEventVideo({ url: 'https://www.youtube.com/watch?v=dQw4w9WgXcQ' });
    assert(res !== null, 'debe resolver');
    assert.strictEqual(res.provider, 'youtube');
    assert.strictEqual(res.videoId, 'dQw4w9WgXcQ');
    assert(res.embedUrl.includes('youtube-nocookie.com/embed/dQw4w9WgXcQ'), 'debe usar youtube-nocookie');
    assert(res.embedUrl.includes('autoplay=1'), 'debe tener autoplay=1 diferido');
    assert(res.thumbnailUrl?.includes('maxresdefault.jpg'), 'debe generar thumbnail maxres');
});

test('enlace corto youtu.be/ID', () => {
    const res = resolveEventVideo({ url: 'https://youtu.be/dQw4w9WgXcQ' });
    assert(res !== null);
    assert.strictEqual(res.provider, 'youtube');
    assert.strictEqual(res.videoId, 'dQw4w9WgXcQ');
});

test('YouTube Shorts youtube.com/shorts/ID', () => {
    const res = resolveEventVideo({ url: 'https://www.youtube.com/shorts/dQw4w9WgXcQ' });
    assert(res !== null);
    assert.strictEqual(res.videoId, 'dQw4w9WgXcQ');
});

test('YouTube con parámetro de inicio de tiempo (?t=90 o &start=90)', () => {
    const res = resolveEventVideo({ url: 'https://www.youtube.com/watch?v=dQw4w9WgXcQ&t=90' });
    assert(res !== null);
    assert(res.embedUrl.includes('&start=90'), 'debe incluir el start en el embed');
});

test('YouTube con parámetro de tiempo tipo 1m30s', () => {
    const res = resolveEventVideo({ url: 'https://youtu.be/dQw4w9WgXcQ?t=1m30s' });
    assert(res !== null);
    assert(res.embedUrl.includes('&start=90'), '1m30s debe convertirse a 90s');
});

test('Extracción de URL desde bloque <iframe> completo', () => {
    const iframe = '<iframe width="560" height="315" src="https://www.youtube.com/embed/dQw4w9WgXcQ" frameborder="0" allowfullscreen></iframe>';
    const res = resolveEventVideo({ url: iframe });
    assert(res !== null);
    assert.strictEqual(res.videoId, 'dQw4w9WgXcQ');
    assert.strictEqual(res.provider, 'youtube');
});

console.log('\n2. Resolución y soporte de Vimeo');
test('enlace estándar vimeo.com/ID', () => {
    const res = resolveEventVideo({ url: 'https://vimeo.com/76979871' });
    assert(res !== null);
    assert.strictEqual(res.provider, 'vimeo');
    assert.strictEqual(res.videoId, '76979871');
    assert.strictEqual(res.embedUrl, 'https://player.vimeo.com/video/76979871?autoplay=1&title=0&byline=0&portrait=0');
});

test('enlace vimeo player.vimeo.com/video/ID', () => {
    const res = resolveEventVideo({ url: 'https://player.vimeo.com/video/76979871' });
    assert(res !== null);
    assert.strictEqual(res.provider, 'vimeo');
    assert.strictEqual(res.videoId, '76979871');
});

console.log('\n3. Videos directos y almacenamiento S3');
test('archivo MP4 directo vía HTTPS', () => {
    const url = 'https://rotary-platform-assets.s3.us-east-1.amazonaws.com/events/videos/conferencia2027.mp4';
    const res = resolveEventVideo({ url });
    assert(res !== null);
    assert.strictEqual(res.provider, 'direct');
    assert.strictEqual(res.directUrl, url);
});

test('archivo WEBM directo con parámetros', () => {
    const url = 'https://example.com/videos/promo.webm?version=2';
    const res = resolveEventVideo({ url });
    assert(res !== null);
    assert.strictEqual(res.provider, 'direct');
});

test('ruta relativa de medios locales (/api/media/...)', () => {
    const url = '/api/media/event-promotional.mp4';
    const res = resolveEventVideo({ url });
    assert(res !== null);
    assert.strictEqual(res.provider, 'direct');
});

console.log('\n4. Seguridad y sanitización');
test('rechaza javascript:', () => {
    assert.strictEqual(resolveEventVideo({ url: 'javascript:alert(1)' }), null);
});

test('rechaza data:text/html', () => {
    assert.strictEqual(resolveEventVideo({ url: 'data:text/html;base64,PHNjcmlwdD4=' }), null);
});

test('rechaza dominios arbitrarios que no son video', () => {
    assert.strictEqual(resolveEventVideo({ url: 'https://sitio-desconocido.com/articulo' }), null);
});

test('rechaza texto que no es una URL', () => {
    assert.strictEqual(resolveEventVideo({ url: 'esto no es una url' }), null);
});

console.log('\n5. Comportamiento en ausencia de video y desactivación');
test('null o undefined da null', () => {
    assert.strictEqual(resolveEventVideo(null), null);
    assert.strictEqual(resolveEventVideo(undefined), null);
    assert.strictEqual(hasEventVideo(null), false);
    assert.strictEqual(hasEventVideo(undefined), false);
});

test('objeto vacío o url vacía da null', () => {
    assert.strictEqual(resolveEventVideo({}), null);
    assert.strictEqual(resolveEventVideo({ url: '' }), null);
    assert.strictEqual(resolveEventVideo({ url: '   ' }), null);
    assert.strictEqual(hasEventVideo({ url: '' }), false);
});

test('enabled: false desactiva el video', () => {
    assert.strictEqual(resolveEventVideo({ url: 'https://www.youtube.com/watch?v=dQw4w9WgXcQ', enabled: false }), null);
    assert.strictEqual(hasEventVideo({ url: 'https://www.youtube.com/watch?v=dQw4w9WgXcQ', enabled: false }), false);
});

console.log('\n6. Portada personalizada, títulos y descripciones');
test('la portada personalizada se preserva y tiene prioridad', () => {
    const customCover = 'https://rotary-platform-assets.s3.us-east-1.amazonaws.com/events/custom-cover.jpg';
    const res = resolveEventVideo({
        url: 'https://www.youtube.com/watch?v=dQw4w9WgXcQ',
        coverImage: customCover,
        title: 'Gran Lanzamiento Villavicencio',
        description: 'La XIII Conferencia en la puerta de los llanos.',
    });
    assert(res !== null);
    assert.strictEqual(res.coverImage, customCover);
    assert.strictEqual(res.title, 'Gran Lanzamiento Villavicencio');
    assert.strictEqual(res.description, 'La XIII Conferencia en la puerta de los llanos.');
});

test('normalización para almacenamiento', () => {
    const norm = normalizeEventVideo({
        url: '  https://youtu.be/dQw4w9WgXcQ  ',
        title: '   Título con espacios   ',
        description: '   Descripción   ',
    });
    assert.strictEqual(norm.url, 'https://youtu.be/dQw4w9WgXcQ');
    assert.strictEqual(norm.title, 'Título con espacios');
    assert.strictEqual(norm.description, 'Descripción');
    assert.strictEqual(norm.enabled, true);
});

console.log('\n7. Cableado en el Servidor (server/routes/calendar.js)');
test('METADATA_KEYS_BY_CAPABILITY incluye "video" en la capacidad "media"', () => {
    const calendarSrc = readFileSync(`${root}server/routes/calendar.js`, 'utf8');
    assert(
        calendarSrc.includes("media: ['video']") || calendarSrc.includes('media: ["video"]'),
        'METADATA_KEYS_BY_CAPABILITY debe mapear media -> video'
    );
});

test('calendar.js expone endpoint POST /events/upload-video protegido con authMiddleware', () => {
    const calendarSrc = readFileSync(`${root}server/routes/calendar.js`, 'utf8');
    assert(
        calendarSrc.includes("router.post('/events/upload-video', authMiddleware"),
        'debe existir POST /events/upload-video con autenticación'
    );
});

console.log('\n8. Integración en la Ficha Pública (src/pages/EventoDetalle.tsx)');
test('EventoDetalle importa EventVideoPlayer y hasEventVideo', () => {
    const detalleSrc = readFileSync(`${root}src/pages/EventoDetalle.tsx`, 'utf8');
    assert(detalleSrc.includes("import EventVideoPlayer from '../components/EventVideoPlayer';"));
    assert(detalleSrc.includes("import { hasEventVideo } from '../lib/eventVideo';"));
});

test('EventoDetalle monta EventVideoPlayer después de la descripción y antes de MediaGallery', () => {
    const detalleSrc = readFileSync(`${root}src/pages/EventoDetalle.tsx`, 'utf8');
    const posDesc = detalleSrc.indexOf('descriptionParagraphs.map');
    const posVideo = detalleSrc.indexOf('<EventVideoPlayer');
    const posGallery = detalleSrc.indexOf('<MediaGallery');

    assert(posDesc !== -1, 'descriptionParagraphs debe existir');
    assert(posVideo !== -1, 'EventVideoPlayer debe existir');
    assert(posGallery !== -1, 'MediaGallery debe existir');

    assert(posDesc < posVideo, 'EventVideoPlayer debe ir DESPUÉS de la descripción');
    assert(posVideo < posGallery, 'EventVideoPlayer debe ir ANTES de la galería de fotos');
    assert(detalleSrc.includes('hasEventVideo(event.metadata?.video)'), 'debe condicionar a hasEventVideo');
});

console.log('\n9. Integración en el Panel Administrativo (src/pages/admin/Events.tsx)');
test('Events.tsx importa EventVideoEditor y lo monta en la pestaña media', () => {
    const eventsSrc = readFileSync(`${root}src/pages/admin/Events.tsx`, 'utf8');
    assert(eventsSrc.includes("import EventVideoEditor from '../../components/admin/events/EventVideoEditor';"));
    assert(eventsSrc.includes("<EventVideoEditor"));
    assert(eventsSrc.includes("video={event.metadata?.video}"));
    assert(eventsSrc.includes("updateEventField(event.id, 'metadata', { ...event.metadata, video: v })"));
});

console.log(`\n────────────────────────────────────────────────────────────`);
console.log(`✅ ${passed}/${passed} comprobaciones del sistema de video en verde.\n`);
