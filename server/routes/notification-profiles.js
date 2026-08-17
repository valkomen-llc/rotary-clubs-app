// ════════════════════════════════════════════════════════════════════
// Notificaciones de Contribuciones — rutas
// v4.856.0 (Fase 1)
//
// TODAS son del operador de la plataforma. Un perfil lleva la identidad
// institucional de un tercero y decide desde qué dominio sale el correo: que
// lo edite el administrador de un sitio permitiría firmar como otra
// organización. El controlador lo comprueba OTRA VEZ con `isOperator` — la
// ruta y el controlador se protegen por separado a propósito, porque una ruta
// que se reordene o se copie a otro archivo perdería la guardia sin que nada
// avise.
// ════════════════════════════════════════════════════════════════════
import express from 'express';
import { authMiddleware, roleMiddleware } from '../middleware/auth.js';
import {
    getNotificationOptions,
    listBeneficiaries, saveBeneficiary, deleteBeneficiary,
    listProfiles, saveProfile, deleteProfile,
    getTemplate, saveTemplate, listTemplateVersions,
    previewTemplate, sendTestEmail, resolveForSite, listDomains,
} from '../controllers/notificationProfileController.js';

const router = express.Router();
const soloOperador = roleMiddleware(['administrator']);

router.use(authMiddleware, soloOperador);

router.get('/options', getNotificationOptions);

// Las entidades beneficiarias. `/beneficiaries` va ANTES que cualquier `/:id`
// del router para que «beneficiaries» no se lea como un identificador de
// perfil — misma trampa que `/site/*` en las campañas.
router.get('/beneficiaries', listBeneficiaries);
router.post('/beneficiaries', saveBeneficiary);
router.put('/beneficiaries/:id', saveBeneficiary);
router.delete('/beneficiaries/:id', deleteBeneficiary);

// Las plantillas, versionadas.
router.get('/templates', getTemplate);
router.get('/templates/versions', listTemplateVersions);
router.post('/templates', saveTemplate);

// Vista previa, prueba y comprobación del alcance.
router.post('/preview', previewTemplate);
router.post('/test', sendTestEmail);
router.get('/resolve', resolveForSite);
// v4.857 — Qué dominios están verificados y qué sitios pueden enviar desde lo
// suyo. Es lo que permite EXPLICAR por qué un correo salió desde el dominio
// central en vez del propio.
router.get('/domains', listDomains);

// Los perfiles. Van al final: `/:id` se come cualquier ruta que se declare
// después.
router.get('/', listProfiles);
router.post('/', saveProfile);
router.put('/:id', saveProfile);
router.delete('/:id', deleteProfile);

export default router;
