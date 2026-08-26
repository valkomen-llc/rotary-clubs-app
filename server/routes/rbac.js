// ════════════════════════════════════════════════════════════════════
// /api/rbac — Usuarios y permisos. v4.937.0
//
// ⚠️ EL ORDEN DE LAS RUTAS IMPORTA. Express casa por orden de declaración, así
// que una literal debajo de su paramétrica es INALCANZABLE y el fallo es mudo:
// la petición cae en el manejador equivocado y contesta cualquier cosa —en
// v4.859 «guardar la tarifa» acabó contestando «Estado inválido»—. Acá las
// literales (`/me`, `/catalog`, `/roles`, `/users`, `/audit`) van ANTES que las
// que llevan `:id` o `:userId`, y dentro de cada grupo `/roles/duplicate` va
// antes que `/roles/:id`. Lo comprueba `npm run check:routes`.
//
// ⚠️ LA GUARDIA VA EN LA RUTA **Y OTRA VEZ** EN EL CONTROLADOR. Una ruta que se
// reordene o se copie a otro archivo perdería la guardia sin que nada avise, y
// lo que hay detrás es quién entra al panel y con qué permisos.
// ════════════════════════════════════════════════════════════════════
import express from 'express';
import { authMiddleware } from '../middleware/auth.js';
import { requirePermission, requireActiveAccount } from '../middleware/institutionalGuard.js';
import {
    getCatalog, getMyAccess, getRoles, postRole, postDuplicateRole, patchRole,
    deleteRoleHandler, getUsers, getUser, putUserRole, patchUserPermissions,
    putUserStatus, postRevokeSessions, deleteUserMembership, getAuditLog,
} from '../controllers/rbacController.js';

const router = express.Router();

// Toda ruta exige una sesión de plataforma. La audiencia la comprueba
// `authMiddleware`: el token del panel de un club no llega hasta acá.
router.use(authMiddleware);

// ── Lo propio ────────────────────────────────────────────────────────
//
// NO exige permiso: toda sesión tiene derecho a saber qué puede hacer, y lo que
// devuelve es SUYO. Es lo que consume la barra lateral.
router.get('/me', getMyAccess);

// ── Catálogo y roles ─────────────────────────────────────────────────
router.get('/catalog', requirePermission('roles.view'), getCatalog);
router.get('/audit', requirePermission('audit.view'), getAuditLog);
router.get('/roles', requirePermission('roles.view'), getRoles);
router.post('/roles', requirePermission('roles.manage'), requireActiveAccount, postRole);
// Literal ANTES que la paramétrica de abajo, o sería inalcanzable.
router.post('/roles/duplicate', requirePermission('roles.manage'), requireActiveAccount, postDuplicateRole);
router.patch('/roles/:id', requirePermission('roles.manage'), requireActiveAccount, patchRole);
router.delete('/roles/:id', requirePermission('roles.manage'), requireActiveAccount, deleteRoleHandler);

// ── Usuarios ─────────────────────────────────────────────────────────
router.get('/users', requirePermission('users.view'), getUsers);
router.get('/users/:userId', requirePermission('users.view'), getUser);
router.put('/users/:userId/role', requirePermission('users.manage'), requireActiveAccount, putUserRole);
router.patch('/users/:userId/permissions', requirePermission('users.manage'), requireActiveAccount, patchUserPermissions);
router.put('/users/:userId/status', requirePermission('users.manage'), requireActiveAccount, putUserStatus);
router.post('/users/:userId/sessions/revoke', requirePermission('users.manage'), requireActiveAccount, postRevokeSessions);
router.delete('/users/:userId', requirePermission('users.manage'), requireActiveAccount, deleteUserMembership);

export default router;
