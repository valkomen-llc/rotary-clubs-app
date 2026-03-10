import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

// Get all products for a club (Admin View)
export const getAdminProducts = async (req, res) => {
    try {
        const clubId = req.user.role === 'administrator' ? req.query.clubId : req.user.clubId;
        if (!clubId) return res.status(400).json({ error: 'clubId is required' });

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
        console.error('Error fetching admin products:', error);
        res.status(500).json({ error: 'Error fetching products' });
    }
};

// Get public published products for a club store
export const getPublicProducts = async (req, res) => {
    try {
        const { clubId } = req.query;
        if (!clubId) return res.status(400).json({ error: 'clubId is required' });

        const products = await prisma.product.findMany({
            where: { clubId, published: true },
            include: { category: true, variants: true },
            orderBy: { name: 'asc' }
        });

        res.json(products);
    } catch (error) {
        console.error('Error fetching public products:', error);
        res.status(500).json({ error: 'Error fetching products' });
    }
};

// Get public product by slug
export const getPublicProductBySlug = async (req, res) => {
    try {
        const { clubId, slug } = req.query;
        if (!clubId || !slug) return res.status(400).json({ error: 'clubId and slug are required' });

        const product = await prisma.product.findFirst({
            where: { clubId, slug, published: true },
            include: { category: true, variants: true }
        });

        if (!product) return res.status(404).json({ error: 'Product not found' });

        res.json(product);
    } catch (error) {
        console.error('Error fetching product by slug:', error);
        res.status(500).json({ error: 'Error fetching product' });
    }
};


// Create a new product
export const createProduct = async (req, res) => {
    try {
        const {
            name, slug, description, type, price, currency,
            stock, sku, images, published, categoryId, clubId, variants
        } = req.body;

        const targetClubId = req.user.role === 'administrator' ? (clubId || req.user.clubId) : req.user.clubId;

        const product = await prisma.product.create({
            data: {
                name,
                slug,
                description,
                type: type || 'physical', // physical, digital, donation, membership
                price: parseFloat(price) || 0,
                currency: currency || 'USD',
                stock: parseInt(stock) || 0,
                sku,
                images: images || [],
                published: published || false,
                clubId: targetClubId,
                categoryId,
                ...(variants && variants.length > 0 && {
                    variants: {
                        create: variants.map(v => ({
                            name: v.name,
                            sku: v.sku,
                            price: v.price ? parseFloat(v.price) : null,
                            stock: v.stock ? parseInt(v.stock) : null
                        }))
                    }
                })
            },
            include: {
                category: true,
                variants: true
            }
        });

        res.status(201).json(product);
    } catch (error) {
        console.error('Error creating product:', error);
        res.status(500).json({ error: 'Error creating product' });
    }
};

// Update an existing product
export const updateProduct = async (req, res) => {
    try {
        const { id } = req.params;
        const {
            name, slug, description, type, price, currency,
            stock, sku, images, published, categoryId, variants
        } = req.body;

        // Verify ownership
        const existingProduct = await prisma.product.findUnique({ where: { id } });
        if (!existingProduct) return res.status(404).json({ error: 'Product not found' });

        if (req.user.role !== 'administrator' && existingProduct.clubId !== req.user.clubId) {
            return res.status(403).json({ error: 'Access denied' });
        }

        // We use a transaction to safely update variants (delete old, create new) if provided
        const updateData = {
            name,
            slug,
            description,
            type,
            price: price !== undefined ? parseFloat(price) : undefined,
            currency,
            stock: stock !== undefined ? parseInt(stock) : undefined,
            sku,
            images,
            published,
            categoryId
        };

        let product;

        if (variants) {
            product = await prisma.$transaction(async (tx) => {
                await tx.productVariant.deleteMany({ where: { productId: id } });

                return await tx.product.update({
                    where: { id },
                    data: {
                        ...updateData,
                        variants: {
                            create: variants.map(v => ({
                                name: v.name,
                                sku: v.sku,
                                price: v.price ? parseFloat(v.price) : null,
                                stock: v.stock ? parseInt(v.stock) : null
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
        console.error('Error updating product:', error);
        res.status(500).json({ error: 'Error updating product' });
    }
};

// Delete a product
export const deleteProduct = async (req, res) => {
    try {
        const { id } = req.params;

        // Verify ownership
        const existingProduct = await prisma.product.findUnique({ where: { id } });
        if (!existingProduct) return res.status(404).json({ error: 'Product not found' });

        if (req.user.role !== 'administrator' && existingProduct.clubId !== req.user.clubId) {
            return res.status(403).json({ error: 'Access denied' });
        }

        // Delete (variants will be deleted by cascade or Prisma relation if configured)
        await prisma.product.delete({ where: { id } });
        res.json({ message: 'Product deleted successfully' });
    } catch (error) {
        console.error('Error deleting product:', error);
        res.status(500).json({ error: 'Error deleting product' });
    }
};

// Get product categories
export const getCategories = async (req, res) => {
    try {
        const clubId = req.user.role === 'administrator' ? req.query.clubId : req.user.clubId;
        if (!clubId) return res.status(400).json({ error: 'clubId is required' });

        const categories = await prisma.productCategory.findMany({
            where: { clubId },
            orderBy: { name: 'asc' }
        });

        res.json(categories);
    } catch (error) {
        console.error('Error fetching categories:', error);
        res.status(500).json({ error: 'Error fetching categories' });
    }
};

export default {
    getAdminProducts,
    getPublicProducts,
    getPublicProductBySlug,
    createProduct,
    updateProduct,
    deleteProduct,
    getCategories
};
