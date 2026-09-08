// Rutas de Campañas de Contribución — v4.803
//
// Las de gestión son del OPERADOR de la plataforma (mismo criterio que
// /api/admin/districts): la campaña alcanza a muchos sitios, así que no es
// una pantalla de club. Las dos públicas son de sólo lectura: la campaña
// activa de UN sitio y la vista previa con token firmado.

import express from 'express';
import { authMiddleware, roleMiddleware, SITE_ADMIN_ROLES } from '../middleware/auth.js';
import { requireRoleOrPermission } from '../middleware/institutionalGuard.js';
import {
    listCampaigns, getCampaignBoard, getCampaign, createCampaign, updateCampaign,
    transitionCampaign, deleteCampaign, issuePreviewToken,
    getActiveCampaign, getPreviewCampaign, getCampaignContributors,
    listCenters, saveCenters, previewCentersPaste,
    getSiteCampaign, listSiteCampaigns, saveSiteOverride, saveSiteCenters,
    trackCampaignEvent, getCampaignMetrics,
    listReadings, runReadings, decideReading,
} from '../controllers/contributionCampaignController.js';
import {
    getSubmissionForm, presignSubmissionFile, submitContent,
    listCampaignSubmissions, getSubmissionCounts, getCampaignSubmission,
    changeSubmissionStatus, approveSubmission, markSubmissionUsage,
    deleteSubmissionFile, getSubmissionShare,
    requireCampaignAccess, listSubmissionsInbox, getInboxCounts, listPendingSubmissions, assignSubmissionOwner,
} from '../controllers/contentSubmissionController.js';
import {
    getSubmissionArticle, generateSubmissionArticle, advanceSubmissionArticle, retrySubmissionArticle,
    regenerateSubmissionArticle, updateSubmissionArticleMedia, sendSubmissionArticleMediaToLibrary, changeSubmissionArticleStatus, publishSubmissionArticle,
    duplicateSubmissionArticle, restoreSubmissionArticleVersion, getSubmissionArticleStats, listPendingArticles,
    locateInboxSubmission,
} from '../controllers/submissionArticleController.js';

const router = express.Router();
const superAdminOnly = roleMiddleware(['administrator']);

// Públicas — sin sesión. `active` corre en cada visita de la página de
// aportes (Fase 2) y degrada a { campaign: null } ante cualquier fallo.
router.get('/active', getActiveCampaign);

// F4 — la vía del ADMINISTRADOR DEL SITIO: lo que su club puede tocar
// (whitelist de sanitizeOverride) y sus centros propios. El clubId sale del
// token, nunca del body. Van ANTES de /:id para que «site» no se lea como id.
//
// ⚠️ EL ROL DE SIEMPRE **O** EL PERMISO (v4.986). Un usuario institucional
// entra a «Campañas de Contribución» con `contribution_campaigns.edit`, que es
// lo que le concede `INSTITUTIONAL_BASE`; sustituir la lista de roles por el
// permiso a secas es lo elegante y lo peligroso —si la consulta del grant falla,
// el panel se quedaría sin esta pantalla para los administradores de siempre—.
// Con la disyunción, lo que hoy funciona no puede romperse (regla de v4.941).
// Y se declara por ACCIÓN: leer pide `.view`, escribir pide `.edit`.
const siteRead = requireRoleOrPermission(SITE_ADMIN_ROLES, 'contribution_campaigns.view');
const siteWrite = requireRoleOrPermission(SITE_ADMIN_ROLES, 'contribution_campaigns.edit');

// v4.986 — TODAS las campañas que alcanzan al sitio, con su información local.
// `/site/current` se conserva y contesta lo mismo de antes (regla aditiva).
router.get('/site/campaigns', authMiddleware, siteRead, listSiteCampaigns);
router.get('/site/current', authMiddleware, siteRead, getSiteCampaign);
router.put('/site/override', authMiddleware, siteWrite, saveSiteOverride);
router.put('/site/centers', authMiddleware, siteWrite, saveSiteCenters);

// ── Aportes de contenido (v4.968) ──
// El formulario PÚBLICO: sin sesión, como el resto de los formularios del
// sitio. `:ref` es el slug o el id — lo que se comparte es el slug y lo que no
// cambia es el id (patrón de `/eventos/:ref`, v4.658). Van ANTES de `/:id`
// para que «submissions» no se lea como un id de campaña.
//
// Lo que llega por acá NUNCA se publica solo: entra en «Recibido», los
// archivos van a un prefijo SIN lectura pública y sólo aprobar los mueve a la
// Biblioteca. Es estructural, no una regla de pantalla.
router.get('/submissions/form/:ref', getSubmissionForm);
router.post('/submissions/form/:ref/presign', presignSubmissionFile);
router.post('/submissions/form/:ref', submitContent);

// ── La bandeja TRANSVERSAL (v4.999) ──
//
// «Qué solicitudes alcanza esta sesión», sin pasar por el editor de una
// campaña. `siteRead`/`siteWrite` y no `superAdminOnly`: el alcance real lo
// resuelve `campaignIdsInScope` DENTRO del controlador, con el mismo criterio
// con el que este sitio ya edita esas campañas. Esconder la pantalla no
// protegería el endpoint de quien lo conoce (v4.868); lo que protege es el
// `WHERE`.
//
// Van ANTES de `/:id` o «submissions» se leería como el id de una campaña, con
// un fallo MUDO: la petición caería en el manejador equivocado (`check:routes`).
router.get('/submissions/inbox', authMiddleware, siteRead, listSubmissionsInbox);
router.get('/submissions/inbox/counts', authMiddleware, siteRead, getInboxCounts);
// El icono del encabezado (v4.1005): las que esperan a alguien, con su
// contador. LITERAL, así que va antes de `/submissions/inbox/:submissionId`
// o «pending» se leería como el id de una solicitud (`check:routes`).
router.get('/submissions/inbox/pending', authMiddleware, siteRead, listPendingSubmissions);
router.post('/submissions/inbox/:submissionId/assign', authMiddleware, siteWrite, assignSubmissionOwner);
// Los borradores de noticia listos (la campana del panel) y la ubicación de una
// solicitud por id, para abrir la ficha desde un enlace. Las literales van
// ANTES de la paramétrica (`check:routes`).
router.get('/submissions/articles/pending', authMiddleware, siteRead, listPendingArticles);
router.get('/submissions/inbox/:submissionId', authMiddleware, siteRead, locateInboxSubmission);

router.get('/:id/preview', getPreviewCampaign);
// v4.862 — cuántos aportes lleva la campaña y quiénes dieron su nombre. Sólo
// lectura, sin sesión y sin PII: un aporte anónimo no viaja acá ni con el
// nombre escondido — se descarta en el servidor (ver contributorRoll.js).
router.get('/:id/contributors', getCampaignContributors);
// F5 — la página reporta vista y clics. Público y sin PII; los eventos que
// valen dinero (checkout, donación) los escribe el servidor, no el navegador.
router.post('/:id/track', trackCampaignEvent);

// ─── Gestión — LA MISMA HERRAMIENTA para el operador y para un sitio (v4.987)
//
// ⚠️ EL ALCANCE LO RESUELVE EL CONTROLADOR, NO LA RUTA. Hasta v4.986 estas
// rutas eran `superAdminOnly` y por eso el sitio necesitaba una pantalla
// aparte —la vieja «Maneras de Contribuir» rebautizada—, que se quedaba atrás
// en cada mejora de la del operador. Ahora entra también el administrador del
// sitio, y `scopedCampaign` decide qué campañas existen para él: las SUYAS
// (las administra enteras) y las que le ALCANZAN (las ve y administra su
// información local). Para las demás responde 404 — un 403 confirmaría que
// existen.
//
// Se declara por ACCIÓN (leer pide `.view`, escribir pide `.edit`) y con el
// rol de siempre **O** el permiso: sustituir la lista de roles por el permiso
// a secas dejaría al panel sin esta pantalla si la consulta del grant falla
// (regla de v4.941).
router.get('/', authMiddleware, siteRead, listCampaigns);
router.post('/', authMiddleware, siteWrite, createCampaign);
// El tablero va ANTES de `/:id`: Express casa por orden de declaración y una
// literal debajo de su paramétrica es inalcanzable —«board» se leería como el
// id de una campaña— con un fallo mudo (`check:routes`).
router.get('/board', authMiddleware, siteRead, getCampaignBoard);
router.get('/:id', authMiddleware, siteRead, getCampaign);
router.put('/:id', authMiddleware, siteWrite, updateCampaign);
router.post('/:id/status', authMiddleware, siteWrite, transitionCampaign);
router.post('/:id/preview-token', authMiddleware, siteRead, issuePreviewToken);
// F3 — centros de acopio CENTRALES (los locales de cada club llegan en F4
// por su propia ruta: mezclar los dos editores en una haría fácil que el
// batch central pisara filas ajenas). Guardar exige PROPIEDAD de la campaña.
router.get('/:id/centers', authMiddleware, siteRead, listCenters);
router.put('/:id/centers', authMiddleware, siteWrite, saveCenters);
// v4.994 — vista previa de lo pegado desde una hoja de cálculo. Sólo LEE y
// compara; agregar y guardar siguen siendo del editor y del PUT de arriba.
router.post('/:id/centers/preview', authMiddleware, siteWrite, previewCentersPaste);
router.get('/:id/metrics', authMiddleware, siteRead, getCampaignMetrics);
// v4.825 — la lectura automatizada del «Panorama de la emergencia». Decidir
// una lectura escribe un indicador de la campaña, así que exige propiedad:
// sobre una campaña de la plataforma pone una cifra en la página de muchos
// sitios a la vez, no en la de uno.
router.get('/:id/readings', authMiddleware, siteRead, listReadings);
router.post('/:id/readings/run', authMiddleware, siteWrite, runReadings);
router.post('/:id/readings/:readingId', authMiddleware, siteWrite, decideReading);
// ⚠️ LA BANDEJA YA NO ES `superAdminOnly` (v4.999). Lo era desde v4.968 y ése
// era el defecto reportado: el tablero le enseñaba a un sitio «15 solicitudes»
// de una campaña que ese sitio publica y al pulsar no había nada. Estaba
// declarado como pendiente conocido desde v4.987.
//
// El gate pasa a ser `requireCampaignAccess`, que es el MISMO `scopedCampaign`
// con el que este sitio ya abre, edita y publica esa campaña. Una campaña
// fuera del alcance responde 404 —no 403— y por eso el middleware va DELANTE
// de cada manejador: la puerta vive en la ruta, no dentro de cada handler,
// donde el noveno se olvidaría con un fallo mudo.
router.get('/:id/submissions', authMiddleware, siteRead, requireCampaignAccess, listCampaignSubmissions);
router.get('/:id/submissions/counts', authMiddleware, siteRead, requireCampaignAccess, getSubmissionCounts);
router.get('/:id/submissions/share', authMiddleware, siteRead, requireCampaignAccess, getSubmissionShare);
router.get('/:id/submissions/:submissionId', authMiddleware, siteRead, requireCampaignAccess, getCampaignSubmission);
router.post('/:id/submissions/:submissionId/status', authMiddleware, siteWrite, requireCampaignAccess, changeSubmissionStatus);
router.post('/:id/submissions/:submissionId/approve', authMiddleware, siteWrite, requireCampaignAccess, approveSubmission);
router.post('/:id/submissions/:submissionId/usage', authMiddleware, siteWrite, requireCampaignAccess, markSubmissionUsage);
router.delete('/:id/submissions/:submissionId/files/:fileId', authMiddleware, siteWrite, requireCampaignAccess, deleteSubmissionFile);

// ─── Solicitud → artículo de noticia (v4.1000) ─────────────────────────────
// Mismo gate que la solicitud; publicar exige además el permiso con el que ese
// usuario publicaría desde Noticias. No hay un segundo criterio.
const newsPublish = requireRoleOrPermission(['administrator', 'club_admin', 'district_admin', 'editor', 'crowdfunder'], 'news.publish');
router.get('/:id/submissions/:submissionId/article', authMiddleware, siteRead, requireCampaignAccess, getSubmissionArticle);
router.get('/:id/submissions/:submissionId/article/stats', authMiddleware, siteRead, requireCampaignAccess, getSubmissionArticleStats);
router.post('/:id/submissions/:submissionId/article/generate', authMiddleware, siteWrite, requireCampaignAccess, generateSubmissionArticle);
router.post('/:id/submissions/:submissionId/article/advance', authMiddleware, siteWrite, requireCampaignAccess, advanceSubmissionArticle);
router.post('/:id/submissions/:submissionId/article/retry', authMiddleware, siteWrite, requireCampaignAccess, retrySubmissionArticle);
router.post('/:id/submissions/:submissionId/article/regenerate', authMiddleware, siteWrite, requireCampaignAccess, regenerateSubmissionArticle);
router.put('/:id/submissions/:submissionId/article/media', authMiddleware, siteWrite, requireCampaignAccess, updateSubmissionArticleMedia);
router.post('/:id/submissions/:submissionId/article/library', authMiddleware, siteWrite, requireCampaignAccess, sendSubmissionArticleMediaToLibrary);
router.post('/:id/submissions/:submissionId/article/status', authMiddleware, siteWrite, requireCampaignAccess, changeSubmissionArticleStatus);
router.post('/:id/submissions/:submissionId/article/publish', authMiddleware, siteWrite, requireCampaignAccess, newsPublish, publishSubmissionArticle);
router.post('/:id/submissions/:submissionId/article/duplicate', authMiddleware, siteWrite, requireCampaignAccess, duplicateSubmissionArticle);
router.post('/:id/submissions/:submissionId/article/versions/:versionId/restore', authMiddleware, siteWrite, requireCampaignAccess, restoreSubmissionArticleVersion);

// Borrar exige PROPIEDAD (lo comprueba el controlador) y además que sea un
// borrador que nunca se publicó.
router.delete('/:id', authMiddleware, siteWrite, deleteCampaign);

export default router;
