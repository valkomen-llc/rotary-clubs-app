// ════════════════════════════════════════════════════════════════════════════
// Alias históricos de robots.txt y sitemap.xml.
//
// Este archivo tenía una SEGUNDA implementación completa del sitemap y del
// robots.txt, distinta de la de `seoController.js` y con los mismos defectos que
// aquélla arrastraba: direcciones con `/#/` —que todo buscador resuelve a la
// portada— y `Disallow: /#/admin/`, que no bloquea nada porque el fragmento
// nunca llega al servidor.
//
// Dos implementaciones del mismo archivo es una garantía de que se separen: la
// que se corrige es siempre la que alguien encontró primero. Ahora las dos
// rutas delegan en el único controlador del módulo.
//
// Las direcciones BUENAS son `/robots.txt` y `/sitemap.xml`, en la raíz del
// dominio, que es donde las pide un rastreador (se montan en `api/index.js`).
// Estas se conservan por si alguna configuración externa todavía las apunta.
//
// `/og/:type/:id` se retiró: devolvía metadatos para que alguien los inyectara
// por su cuenta, y desde v4.703 el <head> lo resuelve el servidor en
// `server/lib/seoRender.js`. Nada en la aplicación lo llamaba.
import express from 'express';
import { getRobotsTxt, getSitemap } from '../controllers/seoController.js';

const router = express.Router();

router.get('/robots.txt', getRobotsTxt);
router.get('/sitemap.xml', getSitemap);

export default router;
