// Rutas del módulo «Redirecciones de Enlaces».
//
// EL GATE ES EL MISMO QUE EL DE `PUT /api/admin/clubs/:id`, que es donde vivían
// las redirecciones hasta v4.992: exactamente los mismos roles. Así, sacar el
// módulo de Configuración a su propia API no le da acceso a nadie que no lo
// tuviera ni se lo quita a quien sí. Un permiso nuevo del RBAC habría cambiado
// quién puede administrarlas sin que nadie lo hubiera decidido.
//
// El sitio NO viaja en el cuerpo: sale del token (ver el controlador). Sólo el
// operador de la plataforma puede pedir otro con `?clubId=`.
//
// ORDEN: las literales van ANTES de las paramétricas. Express casa por orden de
// declaración, así que una literal debajo de su paramétrica es INALCANZABLE y
// el fallo es mudo (v4.859). Lo comprueba `npm run check:routes`.
import express from 'express';
import { authMiddleware, roleMiddleware } from '../middleware/auth.js';
import {
    list, create, update, setStatus, remove, stats, audit,
} from '../controllers/linkRedirectController.js';

const router = express.Router();

// Los mismos roles que guardan la pantalla de Configuración.
const adminRoles = ['administrator', 'club_admin', 'district_admin', 'crowdfunder'];
const gate = [authMiddleware, roleMiddleware(adminRoles)];

router.get('/', ...gate, list);
router.post('/', ...gate, create);

router.get('/:id/stats', ...gate, stats);
router.get('/:id/audit', ...gate, audit);
router.patch('/:id/status', ...gate, setStatus);
router.put('/:id', ...gate, update);
router.delete('/:id', ...gate, remove);

export default router;
