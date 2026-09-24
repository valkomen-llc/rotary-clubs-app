import prisma from '../lib/prisma.js';
import { ensureCommerceSchema } from '../lib/ensureCommerceSchema.js';

// Resuelve de forma segura el clubId del tenant según rol y contexto
function resolveClubId(req) {
    if (req.user?.role === 'administrator') {
        return req.body?.clubId || req.query?.clubId || req.user?.clubId || null;
    }
    return req.user?.clubId || null;
}

// Obtener todos los productos de un club (Vista Admin)
export const getAdminProducts = async (req, res) => {
    const clubId = resolveClubId(req);
    try {
        await ensureCommerceSchema();
        if (!clubId) return res.status(400).json({ error: 'clubId es requerido' });

        const products = await prisma.product.findMany({
            where: { clubId },
            include: {
                category: true,
                variants: true
            },
            orderBy: { createdAt: 'desc' }
        });

        res.json(products);
    } catch (error) {
        console.error('[COMMERCE_ERROR] GET_ADMIN_PRODUCTS_FAILED', {
            clubId,
            userId: req.user?.id,
            error: error?.message
        });
        res.status(500).json({ error: 'Error al cargar los productos' });
    }
};

// Obtener productos públicos publicados para la tienda del club
export const getPublicProducts = async (req, res) => {
    const { clubId } = req.query;
    try {
        await ensureCommerceSchema();
        if (!clubId) return res.status(400).json({ error: 'clubId es requerido' });

        const products = await prisma.product.findMany({
            where: {
                clubId,
                status: 'active',
                published: true
            },
            include: { category: true, variants: true },
            orderBy: { name: 'asc' }
        });

        res.json(products);
    } catch (error) {
        console.error('[COMMERCE_ERROR] GET_PUBLIC_PRODUCTS_FAILED', {
            clubId,
            error: error?.message
        });
        res.status(500).json({ error: 'Error al cargar los productos de la tienda' });
    }
};

// Obtener producto público por slug
export const getPublicProductBySlug = async (req, res) => {
    const { clubId, slug } = req.query;
    try {
        await ensureCommerceSchema();
        if (!clubId || !slug) return res.status(400).json({ error: 'clubId y slug son requeridos' });

        const product = await prisma.product.findFirst({
            where: {
                clubId,
                slug,
                status: 'active',
                published: true
            },
            include: { category: true, variants: true }
        });

        if (!product) return res.status(404).json({ error: 'Producto no encontrado' });

        res.json(product);
    } catch (error) {
        console.error('[COMMERCE_ERROR] GET_PUBLIC_PRODUCT_BY_SLUG_FAILED', {
            clubId,
            slug,
            error: error?.message
        });
        res.status(500).json({ error: 'Error al cargar el producto' });
    }
};

// Crear un nuevo producto
export const createProduct = async (req, res) => {
    const targetClubId = resolveClubId(req);
    try {
        await ensureCommerceSchema();

        if (!targetClubId) {
            return res.status(400).json({ error: 'clubId es requerido para identificar la organización' });
        }

        const {
            name, slug, description, shortDescription, type, price, compareAtPrice, costPrice,
            currency, stock, sku, images, published, categoryId, status,
            featured, weight, seoTitle, seoDescription, isDigital, shippingRequired, variants
        } = req.body;

        if (!name || typeof name !== 'string' || !name.trim()) {
            return res.status(400).json({ error: 'El nombre del producto es obligatorio' });
        }

        // Sanitizar y validar categoryId
        let validCategoryId = null;
        if (categoryId && typeof categoryId === 'string' && categoryId.trim() !== '') {
            const catExists = await prisma.productCategory.findFirst({
                where: { id: categoryId.trim(), clubId: targetClubId }
            });
            if (catExists) {
                validCategoryId = catExists.id;
            } else {
                console.warn(`[COMMERCE] Categoría "${categoryId}" no encontrada en club ${targetClubId}. Se guardará sin categoría.`);
            }
        }

        // Generar slug limpio
        const cleanSlug = (slug || name)
            .toLowerCase()
            .trim()
            .replace(/[^a-z0-9]+/g, '-')
            .replace(/(^-|-$)+/g, '') || `prod-${Date.now()}`;

        // Determinar status y published coherentes
        const isPublished = published !== undefined ? Boolean(published) : true;
        const finalStatus = status || (isPublished ? 'active' : 'draft');

        const product = await prisma.product.create({
            data: {
                name: name.trim(),
                slug: cleanSlug,
                description: description || '',
                shortDescription: shortDescription || null,
                type: type || 'physical', // physical, digital, donation, membership
                price: parseFloat(price) || 0,
                compareAtPrice: compareAtPrice ? parseFloat(compareAtPrice) : null,
                costPrice: costPrice ? parseFloat(costPrice) : null,
                currency: (currency || 'COP').toUpperCase(),
                stock: parseInt(stock) || 0,
                sku: (sku && String(sku).trim()) || null,
                images: Array.isArray(images) ? images : [],
                status: finalStatus,
                published: isPublished,
                featured: Boolean(featured),
                weight: weight ? parseFloat(weight) : null,
                seoTitle: seoTitle || null,
                seoDescription: seoDescription || null,
                isDigital: type === 'digital' || Boolean(isDigital),
                shippingRequired: type !== 'digital' && shippingRequired !== false,
                clubId: targetClubId,
                categoryId: validCategoryId,
                ...(variants && Array.isArray(variants) && variants.length > 0 && {
                    variants: {
                        create: variants.map(v => ({
                            sku: v.sku || null,
                            attributes: typeof v.attributes === 'string' ? v.attributes : JSON.stringify(v.attributes || { name: v.name || '' }),
                            priceOverride: v.price ? parseFloat(v.price) : null,
                            stock: v.stock !== undefined ? parseInt(v.stock) : 0
                        }))
                    }
                })
            },
            include: {
                category: true,
                variants: true
            }
        });

        console.log(`[COMMERCE] Producto creado exitosamente: "${product.name}" (${product.id}) en club ${targetClubId}`);
        res.status(201).json(product);
    } catch (error) {
        console.error('[COMMERCE_ERROR] PRODUCT_CREATE_FAILED', {
            operation: 'createProduct',
            tenant: targetClubId,
            userId: req.user?.id,
            userRole: req.user?.role,
            errorCode: error?.code,
            databaseError: error?.message,
            timestamp: new Date().toISOString()
        });
        res.status(500).json({
            error: 'No pudimos crear el producto. Inténtalo nuevamente.',
            detail: error?.message
        });
    }
};

// Actualizar un producto existente
export const updateProduct = async (req, res) => {
    try {
        await ensureCommerceSchema();
        const { id } = req.params;
        const {
            name, slug, description, shortDescription, type, price, compareAtPrice, costPrice,
            currency, stock, sku, images, published, categoryId, status,
            featured, weight, seoTitle, seoDescription, isDigital, shippingRequired, variants
        } = req.body;

        const existingProduct = await prisma.product.findUnique({ where: { id } });
        if (!existingProduct) return res.status(404).json({ error: 'Producto no encontrado' });

        // Verificación estricta multi-tenant
        if (req.user.role !== 'administrator' && existingProduct.clubId !== req.user.clubId) {
            return res.status(403).json({ error: 'Acceso denegado: este producto pertenece a otra organización' });
        }

        // Sanitizar categoryId
        let validCategoryId = existingProduct.categoryId;
        if (categoryId !== undefined) {
            if (categoryId && typeof categoryId === 'string' && categoryId.trim() !== '') {
                const catExists = await prisma.productCategory.findFirst({
                    where: { id: categoryId.trim(), clubId: existingProduct.clubId }
                });
                validCategoryId = catExists ? catExists.id : null;
            } else {
                validCategoryId = null;
            }
        }

        const isPublished = published !== undefined ? Boolean(published) : existingProduct.published;
        const finalStatus = status || (isPublished ? 'active' : 'draft');

        const updateData = {
            ...(name !== undefined && { name: name.trim() }),
            ...(slug !== undefined && { slug: slug.trim() }),
            ...(description !== undefined && { description }),
            ...(shortDescription !== undefined && { shortDescription }),
            ...(type !== undefined && { type }),
            ...(price !== undefined && { price: parseFloat(price) || 0 }),
            ...(compareAtPrice !== undefined && { compareAtPrice: compareAtPrice ? parseFloat(compareAtPrice) : null }),
            ...(costPrice !== undefined && { costPrice: costPrice ? parseFloat(costPrice) : null }),
            ...(currency !== undefined && { currency: currency.toUpperCase() }),
            ...(stock !== undefined && { stock: parseInt(stock) || 0 }),
            ...(sku !== undefined && { sku: sku ? String(sku).trim() : null }),
            ...(images !== undefined && { images }),
            ...(published !== undefined && { published: isPublished }),
            status: finalStatus,
            ...(featured !== undefined && { featured: Boolean(featured) }),
            ...(weight !== undefined && { weight: weight ? parseFloat(weight) : null }),
            ...(seoTitle !== undefined && { seoTitle }),
            ...(seoDescription !== undefined && { seoDescription }),
            ...(isDigital !== undefined && { isDigital: Boolean(isDigital) }),
            ...(shippingRequired !== undefined && { shippingRequired: Boolean(shippingRequired) }),
            categoryId: validCategoryId
        };

        let product;
        if (variants && Array.isArray(variants)) {
            product = await prisma.$transaction(async (tx) => {
                await tx.productVariant.deleteMany({ where: { productId: id } });
                return await tx.product.update({
                    where: { id },
                    data: {
                        ...updateData,
                        variants: {
                            create: variants.map(v => ({
                                sku: v.sku || null,
                                attributes: typeof v.attributes === 'string' ? v.attributes : JSON.stringify(v.attributes || { name: v.name || '' }),
                                priceOverride: v.price ? parseFloat(v.price) : null,
                                stock: v.stock !== undefined ? parseInt(v.stock) : 0
                            }))
                        }
                    },
                    include: { category: true, variants: true }
                });
            });
        } else {
            product = await prisma.product.update({
                where: { id },
                data: updateData,
                include: { category: true, variants: true }
            });
        }

        res.json(product);
    } catch (error) {
        console.error('[COMMERCE_ERROR] PRODUCT_UPDATE_FAILED', {
            id: req.params?.id,
            error: error?.message
        });
        res.status(500).json({ error: 'Error al actualizar el producto' });
    }
};

// Eliminar un producto
export const deleteProduct = async (req, res) => {
    try {
        const { id } = req.params;
        const existingProduct = await prisma.product.findUnique({ where: { id } });
        if (!existingProduct) return res.status(404).json({ error: 'Producto no encontrado' });

        if (req.user.role !== 'administrator' && existingProduct.clubId !== req.user.clubId) {
            return res.status(403).json({ error: 'Acceso denegado' });
        }

        await prisma.product.delete({ where: { id } });
        res.json({ message: 'Producto eliminado con éxito' });
    } catch (error) {
        console.error('[COMMERCE_ERROR] PRODUCT_DELETE_FAILED', { id: req.params?.id, error: error?.message });
        res.status(500).json({ error: 'Error al eliminar el producto' });
    }
};

// Obtener categorías de un club
export const getCategories = async (req, res) => {
    const clubId = resolveClubId(req);
    try {
        await ensureCommerceSchema();
        if (!clubId) return res.status(400).json({ error: 'clubId es requerido' });

        const categories = await prisma.productCategory.findMany({
            where: { clubId },
            include: {
                _count: {
                    select: { products: true }
                }
            },
            orderBy: [{ position: 'asc' }, { name: 'asc' }]
        });

        res.json(categories);
    } catch (error) {
        console.error('[COMMERCE_ERROR] GET_CATEGORIES_FAILED', { clubId, error: error?.message });
        res.status(500).json({ error: 'Error al cargar categorías' });
    }
};

// Crear una categoría
export const createCategory = async (req, res) => {
    const clubId = resolveClubId(req);
    try {
        await ensureCommerceSchema();
        if (!clubId) return res.status(400).json({ error: 'clubId es requerido' });

        const { name, slug, description, image, position, status, seoTitle, seoDescription } = req.body;
        if (!name || typeof name !== 'string' || !name.trim()) {
            return res.status(400).json({ error: 'El nombre de la categoría es obligatorio' });
        }

        const cleanSlug = (slug || name)
            .toLowerCase()
            .trim()
            .replace(/[^a-z0-9]+/g, '-')
            .replace(/(^-|-$)+/g, '') || `cat-${Date.now()}`;

        const category = await prisma.productCategory.create({
            data: {
                name: name.trim(),
                slug: cleanSlug,
                description: description || null,
                image: image || null,
                position: parseInt(position) || 0,
                status: status || 'active',
                seoTitle: seoTitle || null,
                seoDescription: seoDescription || null,
                clubId
            }
        });

        res.status(201).json(category);
    } catch (error) {
        console.error('[COMMERCE_ERROR] CREATE_CATEGORY_FAILED', { clubId, error: error?.message });
        res.status(500).json({ error: 'Error al crear la categoría' });
    }
};

// Actualizar una categoría
export const updateCategory = async (req, res) => {
    try {
        await ensureCommerceSchema();
        const { id } = req.params;
        const { name, slug, description, image, position, status, seoTitle, seoDescription } = req.body;

        const existingCategory = await prisma.productCategory.findUnique({ where: { id } });
        if (!existingCategory) return res.status(404).json({ error: 'Categoría no encontrada' });

        if (req.user.role !== 'administrator' && existingCategory.clubId !== req.user.clubId) {
            return res.status(403).json({ error: 'Acceso denegado' });
        }

        const category = await prisma.productCategory.update({
            where: { id },
            data: {
                ...(name && { name: name.trim() }),
                ...(slug && { slug: slug.trim() }),
                ...(description !== undefined && { description }),
                ...(image !== undefined && { image }),
                ...(position !== undefined && { position: parseInt(position) || 0 }),
                ...(status && { status }),
                ...(seoTitle !== undefined && { seoTitle }),
                ...(seoDescription !== undefined && { seoDescription })
            }
        });

        res.json(category);
    } catch (error) {
        console.error('[COMMERCE_ERROR] UPDATE_CATEGORY_FAILED', { id: req.params?.id, error: error?.message });
        res.status(500).json({ error: 'Error al actualizar categoría' });
    }
};

// Eliminar una categoría
export const deleteCategory = async (req, res) => {
    try {
        const { id } = req.params;
        const existingCategory = await prisma.productCategory.findUnique({ where: { id } });
        if (!existingCategory) return res.status(404).json({ error: 'Categoría no encontrada' });

        if (req.user.role !== 'administrator' && existingCategory.clubId !== req.user.clubId) {
            return res.status(403).json({ error: 'Acceso denegado' });
        }

        // Desvincular productos antes de borrar categoría para evitar cascade delete no intencional
        await prisma.product.updateMany({
            where: { categoryId: id },
            data: { categoryId: null }
        });

        await prisma.productCategory.delete({ where: { id } });
        res.json({ message: 'Categoría eliminada con éxito' });
    } catch (error) {
        console.error('[COMMERCE_ERROR] DELETE_CATEGORY_FAILED', { id: req.params?.id, error: error?.message });
        res.status(500).json({ error: 'Error al eliminar categoría' });
    }
};

export default {
    getAdminProducts,
    getPublicProducts,
    getPublicProductBySlug,
    createProduct,
    updateProduct,
    deleteProduct,
    getCategories,
    createCategory,
    updateCategory,
    deleteCategory
};
