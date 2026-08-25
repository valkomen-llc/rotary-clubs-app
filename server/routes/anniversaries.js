// ════════════════════════════════════════════════════════════════════
// Aniversarios IA — rutas
// v4.895.0
//
// ⚠️ EL ORDEN IMPORTA. Express casa por orden de declaración y una ruta
// literal declarada DEBAJO de su paramétrica es INALCANZABLE: la petición cae
// en el manejador de la paramétrica con el nombre de la ruta como parámetro, y
// el fallo es MUDO —no da 404, da la respuesta del manejador equivocado—. Lo
// comprueba `npm run check:routes`; acá las literales van primero.
//
// ── DOS SUPERFICIES EN UN SOLO ARCHIVO ──────────────────────────────
//
// `/public/*` NO lleva autenticación: es el formulario que abre cualquiera
// desde el sitio de un club. Todo lo demás va detrás de `authMiddleware` Y de
// un rol de operador — y el controlador lo comprueba OTRA VEZ, porque una ruta
// que se reordene perdería la guardia sin que nada avise.
//
// Están juntas a propósito: son el mismo módulo, y separarlas en dos archivos
// deja que una se mueva sin la otra.
// ════════════════════════════════════════════════════════════════════
import express from 'express';
import { authMiddleware, roleMiddleware } from '../middleware/auth.js';
import {
    getCatalog, getConfig, putConfig, postPublish, postUnpublish,
    getVersions, postRestoreVersion, getClubs, getPieces,
    postTestPhoto, postTestAnalyze, postTestCopy, postTestCompose, getTestPiece,
    getEngine, putEngine, postEngineActivate,
    postBenchmarkRun, getBenchmarkRun, postBenchmarkVote,
} from '../controllers/anniversaryController.js';
import {
    getPublicConfig, getPublicClubs, postPublicPhoto,
    postPublicAnalyze, postPublicCopy, postPublicCompose, getPublicPiece,
} from '../controllers/anniversaryPublicController.js';

const router = express.Router();

// El operador de la plataforma. La configuración gobierna piezas que salen
// firmadas por clubes de todo el ecosistema; no es contenido de un sitio.
const operador = roleMiddleware(['administrator', 'superadmin']);

// ─── Público (sin sesión) ──────────────────────────────────────────────
router.get('/public/config', getPublicConfig);
router.get('/public/clubs', getPublicClubs);
router.post('/public/photo', postPublicPhoto);
router.post('/public/analyze', postPublicAnalyze);
router.post('/public/copy', postPublicCopy);
router.post('/public/compose', postPublicCompose);
router.get('/public/piece/:id', getPublicPiece);

// ─── Panel (operador de la plataforma) ─────────────────────────────────
router.get('/catalog', authMiddleware, operador, getCatalog);
router.get('/config', authMiddleware, operador, getConfig);
router.put('/config', authMiddleware, operador, putConfig);
router.post('/publish', authMiddleware, operador, postPublish);
router.post('/unpublish', authMiddleware, operador, postUnpublish);
router.get('/versions', authMiddleware, operador, getVersions);
router.get('/clubs', authMiddleware, operador, getClubs);
router.get('/pieces', authMiddleware, operador, getPieces);

// El panel de pruebas: la MISMA cadena que el formulario público, corriendo
// contra el BORRADOR. Las literales antes que `/test/piece/:id`.
router.post('/test/photo', authMiddleware, operador, postTestPhoto);
router.post('/test/analyze', authMiddleware, operador, postTestAnalyze);
router.post('/test/copy', authMiddleware, operador, postTestCopy);
router.post('/test/compose', authMiddleware, operador, postTestCompose);
router.get('/test/piece/:id', authMiddleware, operador, getTestPiece);

// El motor de imagen y su benchmark (v4.897). Del operador, como el resto del
// panel. Las literales de `/engine` y `/benchmark` van ANTES que sus
// paramétricas — el orden es lo que `check:routes` hace cumplir.
router.get('/engine', authMiddleware, operador, getEngine);
router.put('/engine', authMiddleware, operador, putEngine);
router.post('/engine/activate', authMiddleware, operador, postEngineActivate);
router.post('/benchmark', authMiddleware, operador, postBenchmarkRun);
router.post('/benchmark/vote', authMiddleware, operador, postBenchmarkVote);

// Paramétricas al final de su grupo.
router.get('/benchmark/:id', authMiddleware, operador, getBenchmarkRun);
router.post('/versions/:id/restore', authMiddleware, operador, postRestoreVersion);

export default router;
