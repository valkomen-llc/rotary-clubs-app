// ════════════════════════════════════════════════════════════════════
// /api/institutional — v4.932.0
//
// ⚠️ EL ORDEN DE LAS RUTAS IMPORTA. Express casa por orden de declaración, así
// que una literal debajo de su paramétrica es INALCANZABLE y el fallo es mudo:
// la petición cae en el manejador equivocado y contesta cualquier cosa. Acá las
// literales (`/catalog`, `/accounts`, `/audit`, `/me`) van ANTES que las que
// llevan `:id` o `:userId`. Lo comprueba `npm run check:routes`.
//
// ⚠️ LA GUARDIA VA EN LA RUTA **Y OTRA VEZ** EN EL CONTROLADOR. Se protegen por
// separado a propósito: una ruta que se reordene o se copie a otro archivo
// perdería la guardia sin que nada avise, y lo que hay detrás es la creación de
// identidades con acceso al panel.
// ════════════════════════════════════════════════════════════════════
import express from 'express';
import { authMiddleware } from '../middleware/auth.js';
import { requireAccountAdmin, requireActiveAccount } from '../middleware/institutionalGuard.js';
import {
    getCatalog, listAccounts, createAccount, grantAccess, updateOwner,
    revokeAccess, sendAccessInstructions, setOwnerPassword, getAudit,
    getMe, updateMe, changeMyPassword,
} from '../controllers/institutionalAccessController.js';

const router = express.Router();

// Toda ruta exige una sesión de plataforma. La audiencia la comprueba
// `authMiddleware`: el token del panel de un club no llega hasta acá.
router.use(authMiddleware);

// ── El propio perfil ─────────────────────────────────────────────────
//
// Cualquier sesión de plataforma, incluida la de un administrador. NO lleva
// `requireActiveAccount`: quien está suspendido tampoco tiene sesión que abrir
// —`authenticatePlatform` se lo impide—, y si la tuviera de antes, lo que
// necesita es poder ver su perfil y leer que está suspendido.
router.get('/me', getMe);
router.patch('/me', updateMe);
router.post('/me/password', changeMyPassword);

// ── Administración ───────────────────────────────────────────────────
//
// `requireAccountAdmin` es `requirePermission('email_accounts')`: un usuario
// institucional NUNCA lo tiene —el permiso está marcado `adminOnly` y
// `normalizePermissions` lo descarta al guardar— así que no llega ni al
// listado ni al alta ni a las contraseñas de nadie.
router.get('/catalog', requireAccountAdmin, getCatalog);
router.get('/audit', requireAccountAdmin, getAudit);
router.get('/accounts', requireAccountAdmin, listAccounts);
router.post('/accounts', requireAccountAdmin, requireActiveAccount, createAccount);

// Paramétricas al final de su grupo.
router.post('/accounts/:id/access', requireAccountAdmin, requireActiveAccount, grantAccess);
router.patch('/owners/:userId', requireAccountAdmin, requireActiveAccount, updateOwner);
router.delete('/owners/:userId/access', requireAccountAdmin, requireActiveAccount, revokeAccess);
router.post('/owners/:userId/instructions', requireAccountAdmin, requireActiveAccount, sendAccessInstructions);
// Fijar la contraseña de acceso de otra persona es poder entrar como ella: pasa
// por la misma guardia y, además, por `canResetAccessPassword` en el
// controlador — un administrador de sitio no alcanza a otro administrador.
router.post('/owners/:userId/password', requireAccountAdmin, requireActiveAccount, setOwnerPassword);

export default router;
