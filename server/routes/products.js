import express from 'express';
import { authMiddleware, roleMiddleware } from '../middleware/auth.js';
import {
    getAdminProducts,
    getPublicProducts,
    getPublicProductBySlug,
    createProduct,
    updateProduct,
    deleteProduct,
    getCategories,
    createCategory,
    updateCategory,
    deleteCategory,
    togglePublishProduct,
    publishAllProducts,
    getStoreSettings,
    updateStoreSettings
} from '../controllers/productController.js';

const router = express.Router();

// ── Rutas Públicas (catálogo y ajustes para visitantes y compradores) ──────────
router.get('/public', getPublicProducts);
router.get('/public/product', getPublicProductBySlug);
router.get('/public/categories', getCategories);
router.get('/categories', getCategories);
router.get('/settings', getStoreSettings);

// ── Rutas Protegidas de Administración de Tienda ──────────────────────────────
router.use(authMiddleware);

const adminRoles = ['administrator', 'superadmin', 'club_admin', 'district_admin'];

// Ajustes de Tienda
router.post('/settings', roleMiddleware(adminRoles), updateStoreSettings);
router.put('/settings', roleMiddleware(adminRoles), updateStoreSettings);

// Publicación rápida y masiva (deben definirse antes de /:id para evitar colisiones)
router.post('/publish-all', roleMiddleware(adminRoles), publishAllProducts);

// Categorías CRUD
router.post('/categories', roleMiddleware(adminRoles), createCategory);
router.put('/categories/:id', roleMiddleware(adminRoles), updateCategory);
router.delete('/categories/:id', roleMiddleware(adminRoles), deleteCategory);

// Productos CRUD
router.get('/', roleMiddleware(adminRoles), getAdminProducts);
router.post('/', roleMiddleware(adminRoles), createProduct);
router.patch('/:id/toggle-publish', roleMiddleware(adminRoles), togglePublishProduct);
router.put('/:id', roleMiddleware(adminRoles), updateProduct);
router.delete('/:id', roleMiddleware(adminRoles), deleteProduct);

export default router;
