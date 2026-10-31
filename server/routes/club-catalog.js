// ════════════════════════════════════════════════════════════════════
// Rutas del Catálogo Maestro de Clubes — v4.1269.0
// Ver `docs/claude/catalogo-maestro-de-clubes.md`.
// ════════════════════════════════════════════════════════════════════
import express from 'express';
import { authMiddleware, SITE_ADMIN_ROLES } from '../middleware/auth.js';
import { requireRoleOrPermission } from '../middleware/institutionalGuard.js';
import { lightPublicLimit } from '../middleware/rotaryPublicLimit.js';
import { clubCatalogFresh } from '../lib/clubCatalog.js';
import * as ctrl from '../controllers/clubCatalogController.js';

const router = express.Router();
router.use(clubCatalogFresh);

const ver = [authMiddleware, requireRoleOrPermission(SITE_ADMIN_ROLES, 'clubs.view')];
// El alcance por DISTRITO lo decide además el controlador (`catalogScopeFor`):
// el permiso dice qué clase de cosa se puede hacer; el alcance, sobre cuáles filas.
const gestionar = [authMiddleware, requireRoleOrPermission(SITE_ADMIN_ROLES, 'clubs.manage')];

// ── Público (literales) ──────────────────────────────────────────────
router.get('/public/clubs', lightPublicLimit, ctrl.publicClubs);
router.get('/public/districts', lightPublicLimit, ctrl.publicDistricts);

// ── Administración (literales antes que paramétricas) ─────────────────
router.get('/admin/clubs', ...ver, ctrl.adminList);
router.get('/admin/duplicates', ...ver, ctrl.adminDuplicates);
router.get('/admin/changes', ...ver, ctrl.adminChanges);
router.post('/admin/clubs', ...gestionar, ctrl.adminCreate);
router.post('/admin/merge', ...gestionar, ctrl.adminMerge);
router.post('/admin/not-duplicate', ...gestionar, ctrl.adminDismissDuplicate);
router.post('/admin/import/preview', ...gestionar, ctrl.adminImportPreview);
router.post('/admin/import/commit', ...gestionar, ctrl.adminImportCommit);

// ── Paramétricas ─────────────────────────────────────────────────────
router.get('/admin/clubs/:id', ...ver, ctrl.adminDetail);
router.put('/admin/clubs/:id', ...gestionar, ctrl.adminUpdate);
router.post('/admin/clubs/:id/status', ...gestionar, ctrl.adminStatus);
router.post('/admin/clubs/:id/verify', ...gestionar, ctrl.adminVerify);
router.post('/admin/clubs/:id/unmerge', ...gestionar, ctrl.adminUnmerge);
router.get('/public/club/:id', lightPublicLimit, ctrl.publicClub);

export default router;
