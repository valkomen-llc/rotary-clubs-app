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
} from '../controllers/contentSubmissionController.js';

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
// La BANDEJA — operador de la plataforma, como el resto de la gestión: una
// campaña alcanza a muchos sitios y su material no es de uno solo.
router.get('/:id/submissions', authMiddleware, superAdminOnly, listCampaignSubmissions);
router.get('/:id/submissions/counts', authMiddleware, superAdminOnly, getSubmissionCounts);
router.get('/:id/submissions/share', authMiddleware, superAdminOnly, getSubmissionShare);
router.get('/:id/submissions/:submissionId', authMiddleware, superAdminOnly, getCampaignSubmission);
router.post('/:id/submissions/:submissionId/status', authMiddleware, superAdminOnly, changeSubmissionStatus);
router.post('/:id/submissions/:submissionId/approve', authMiddleware, superAdminOnly, approveSubmission);
router.post('/:id/submissions/:submissionId/usage', authMiddleware, superAdminOnly, markSubmissionUsage);
router.delete('/:id/submissions/:submissionId/files/:fileId', authMiddleware, superAdminOnly, deleteSubmissionFile);

// Borrar exige PROPIEDAD (lo comprueba el controlador) y además que sea un
// borrador que nunca se publicó.
router.delete('/:id', authMiddleware, siteWrite, deleteCampaign);

export default router;
