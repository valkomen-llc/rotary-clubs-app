import express from 'express';
import { authMiddleware, roleMiddleware } from '../middleware/auth.js';
import {
    getAdminProducts,
    getPublicProducts,
    getPublicProductBySlug,
    createProduct,
    updateProduct,
    deleteProduct,
    getCategories
} from '../controllers/productController.js';

const router = express.Router();

// Public routes (must be defined BEFORE authMiddleware)
router.get('/public', getPublicProducts);
router.get('/public/product', getPublicProductBySlug);

// All store/product admin routes are protected
router.use(authMiddleware);

const adminRoles = ['administrator', 'club_admin'];

// Categories
router.get('/categories', roleMiddleware(adminRoles), getCategories);

// Products
router.get('/', roleMiddleware(adminRoles), getAdminProducts);
router.post('/', roleMiddleware(adminRoles), createProduct);
router.put('/:id', roleMiddleware(adminRoles), updateProduct);
router.delete('/:id', roleMiddleware(adminRoles), deleteProduct);

export default router;
