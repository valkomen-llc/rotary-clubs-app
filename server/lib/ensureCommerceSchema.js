// ════════════════════════════════════════════════════════════════════════════
// Commerce SaaS Multi-Tenant — ESQUEMA EN RUNTIME
// v4.1096.0
//
// Asegura la integridad del esquema de Commerce (Product, ProductCategory,
// ProductVariant, Order, OrderItem) de manera perezosa e idempotente.
//
// Añade columnas necesarias para el modelo extendido de productos sin requerir
// migraciones destructivas (ADD COLUMN IF NOT EXISTS).
// ════════════════════════════════════════════════════════════════════════════

import db from './db.js';

let _commerceSchemaReady = false;

const PRODUCT_COLUMNS = [
    ['Product', 'type'],
    ['Product', 'stock'],
    ['Product', 'sku'],
    ['Product', 'published'],
    ['Product', 'compareAtPrice'],
    ['Product', 'costPrice'],
    ['Product', 'shortDescription'],
    ['Product', 'seoTitle'],
    ['Product', 'seoDescription'],
    ['Product', 'weight'],
    ['Product', 'featured'],
];

const CATEGORY_COLUMNS = [
    ['ProductCategory', 'description'],
    ['ProductCategory', 'image'],
    ['ProductCategory', 'position'],
    ['ProductCategory', 'status'],
    ['ProductCategory', 'seoTitle'],
    ['ProductCategory', 'seoDescription'],
];

async function isCommerceSchemaReady() {
    try {
        const { rows } = await db.query(
            `SELECT table_name, column_name FROM information_schema.columns
              WHERE table_schema = 'public'
                AND (
                  (table_name = 'Product' AND column_name IN ('type', 'stock', 'sku', 'published', 'compareAtPrice', 'costPrice', 'shortDescription', 'seoTitle', 'seoDescription', 'weight', 'featured'))
                  OR
                  (table_name = 'ProductCategory' AND column_name IN ('description', 'image', 'position', 'status', 'seoTitle', 'seoDescription'))
                )`
        );
        const existing = new Set(rows.map(r => `${r.table_name}.${r.column_name}`));
        const allProductCols = PRODUCT_COLUMNS.every(([tbl, col]) => existing.has(`${tbl}.${col}`));
        const allCategoryCols = CATEGORY_COLUMNS.every(([tbl, col]) => existing.has(`${tbl}.${col}`));
        return allProductCols && allCategoryCols;
    } catch {
        return false;
    }
}

export async function ensureCommerceSchema() {
    if (_commerceSchemaReady) return;
    if (await isCommerceSchemaReady()) {
        _commerceSchemaReady = true;
        return;
    }

    try {
        // ── 1. Columnas adicionales para ProductCategory ─────────────────────
        await db.query(`
            ALTER TABLE "ProductCategory"
                ADD COLUMN IF NOT EXISTS "description" TEXT,
                ADD COLUMN IF NOT EXISTS "image" TEXT,
                ADD COLUMN IF NOT EXISTS "position" INTEGER NOT NULL DEFAULT 0,
                ADD COLUMN IF NOT EXISTS "status" TEXT NOT NULL DEFAULT 'active',
                ADD COLUMN IF NOT EXISTS "seoTitle" TEXT,
                ADD COLUMN IF NOT EXISTS "seoDescription" TEXT;
        `);

        // ── 2. Columnas adicionales para Product ──────────────────────────────
        await db.query(`
            ALTER TABLE "Product"
                ADD COLUMN IF NOT EXISTS "type" TEXT NOT NULL DEFAULT 'physical',
                ADD COLUMN IF NOT EXISTS "stock" INTEGER NOT NULL DEFAULT 0,
                ADD COLUMN IF NOT EXISTS "sku" TEXT,
                ADD COLUMN IF NOT EXISTS "published" BOOLEAN NOT NULL DEFAULT true,
                ADD COLUMN IF NOT EXISTS "compareAtPrice" DOUBLE PRECISION,
                ADD COLUMN IF NOT EXISTS "costPrice" DOUBLE PRECISION,
                ADD COLUMN IF NOT EXISTS "shortDescription" TEXT,
                ADD COLUMN IF NOT EXISTS "seoTitle" TEXT,
                ADD COLUMN IF NOT EXISTS "seoDescription" TEXT,
                ADD COLUMN IF NOT EXISTS "weight" DOUBLE PRECISION,
                ADD COLUMN IF NOT EXISTS "featured" BOOLEAN NOT NULL DEFAULT false;
        `);

        // ── 3. Índices de optimización multi-tenant ───────────────────────────
        await db.query(`CREATE INDEX IF NOT EXISTS "Product_clubId_status_idx" ON "Product"("clubId", "status")`);
        await db.query(`CREATE INDEX IF NOT EXISTS "Product_clubId_published_idx" ON "Product"("clubId", "published")`);
        await db.query(`CREATE INDEX IF NOT EXISTS "Product_clubId_slug_idx" ON "Product"("clubId", "slug")`);
        await db.query(`CREATE INDEX IF NOT EXISTS "ProductCategory_clubId_idx" ON "ProductCategory"("clubId")`);

        // ── 4. Columnas para Order (Soporte extendido de pedidos) ──────────────
        await db.query(`
            ALTER TABLE "Order"
                ADD COLUMN IF NOT EXISTS "orderNumber" TEXT,
                ADD COLUMN IF NOT EXISTS "shippingStatus" TEXT NOT NULL DEFAULT 'pending',
                ADD COLUMN IF NOT EXISTS "shippingMethod" TEXT,
                ADD COLUMN IF NOT EXISTS "shippingAddress" TEXT,
                ADD COLUMN IF NOT EXISTS "trackingNumber" TEXT,
                ADD COLUMN IF NOT EXISTS "paymentMethod" TEXT NOT NULL DEFAULT 'stripe',
                ADD COLUMN IF NOT EXISTS "paymentStatus" TEXT NOT NULL DEFAULT 'pending',
                ADD COLUMN IF NOT EXISTS "paymentNotes" TEXT,
                ADD COLUMN IF NOT EXISTS "notes" TEXT,
                ADD COLUMN IF NOT EXISTS "history" TEXT;
        `);
        await db.query(`CREATE INDEX IF NOT EXISTS "Order_clubId_status_idx" ON "Order"("clubId", "status")`);
        await db.query(`CREATE INDEX IF NOT EXISTS "Order_clubId_orderNumber_idx" ON "Order"("clubId", "orderNumber")`);

        // ── 5. ProductVariant ──────────────────────────────────────────────────
        await db.query(`
            CREATE TABLE IF NOT EXISTS "ProductVariant" (
                "id" TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
                "productId" TEXT NOT NULL,
                "sku" TEXT,
                "attributes" TEXT NOT NULL DEFAULT '{}',
                "priceOverride" DOUBLE PRECISION,
                "stock" INTEGER NOT NULL DEFAULT 0,
                "createdAt" TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
                "updatedAt" TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
            );
            CREATE INDEX IF NOT EXISTS "ProductVariant_productId_idx" ON "ProductVariant"("productId");
        `);

        // ── 6. InventoryMovement (Trazabilidad de existencias) ──────────────────
        await db.query(`
            CREATE TABLE IF NOT EXISTS "InventoryMovement" (
                "id" TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
                "clubId" TEXT NOT NULL,
                "productId" TEXT NOT NULL,
                "variantId" TEXT,
                "type" TEXT NOT NULL,
                "quantity" INTEGER NOT NULL,
                "previousStock" INTEGER NOT NULL DEFAULT 0,
                "newStock" INTEGER NOT NULL DEFAULT 0,
                "reason" TEXT,
                "reference" TEXT,
                "createdBy" TEXT,
                "createdAt" TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
            );
            CREATE INDEX IF NOT EXISTS "InventoryMovement_clubId_productId_idx" ON "InventoryMovement"("clubId", "productId");
            CREATE INDEX IF NOT EXISTS "InventoryMovement_clubId_createdAt_idx" ON "InventoryMovement"("clubId", "createdAt");
        `);

        // ── 7. CommerceShippingMethod (Métodos de Envío por Club) ──────────────
        await db.query(`
            CREATE TABLE IF NOT EXISTS "CommerceShippingMethod" (
                "id" TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
                "clubId" TEXT NOT NULL,
                "name" TEXT NOT NULL,
                "code" TEXT NOT NULL,
                "price" DOUBLE PRECISION NOT NULL DEFAULT 0,
                "minOrderFree" DOUBLE PRECISION,
                "isActive" BOOLEAN NOT NULL DEFAULT true,
                "description" TEXT,
                "createdAt" TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
                "updatedAt" TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
            );
            CREATE INDEX IF NOT EXISTS "CommerceShippingMethod_clubId_idx" ON "CommerceShippingMethod"("clubId", "isActive");
        `);

        // ── 8. CommerceCoupon (Cupones y Descuentos) ───────────────────────────
        await db.query(`
            CREATE TABLE IF NOT EXISTS "CommerceCoupon" (
                "id" TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
                "clubId" TEXT NOT NULL,
                "code" TEXT NOT NULL,
                "discountType" TEXT NOT NULL DEFAULT 'percent',
                "discountValue" DOUBLE PRECISION NOT NULL DEFAULT 0,
                "minOrderAmount" DOUBLE PRECISION NOT NULL DEFAULT 0,
                "maxUses" INTEGER NOT NULL DEFAULT 100,
                "usedCount" INTEGER NOT NULL DEFAULT 0,
                "isActive" BOOLEAN NOT NULL DEFAULT true,
                "startDate" TIMESTAMP WITH TIME ZONE,
                "endDate" TIMESTAMP WITH TIME ZONE,
                "createdAt" TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
                "updatedAt" TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
            );
            CREATE INDEX IF NOT EXISTS "CommerceCoupon_clubId_code_idx" ON "CommerceCoupon"("clubId", "code");
        `);

        _commerceSchemaReady = true;
        console.log('[COMMERCE] ensureCommerceSchema completado — columnas e índices listos en PostgreSQL');
    } catch (error) {
        console.error('[COMMERCE] ensureCommerceSchema fallo parcial (no bloqueante):', error?.message);
    }
}

export default ensureCommerceSchema;
