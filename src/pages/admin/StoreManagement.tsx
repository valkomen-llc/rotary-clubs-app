import React, { useState, useEffect } from 'react';
import AdminLayout from '../../components/admin/AdminLayout';
import {
    Package, Plus, Search, X, Edit2, Trash2, Upload,
    Layers, Star, CheckCircle2, AlertCircle, Image as ImageIcon,
    FolderPlus, ExternalLink, ArrowRight, ShoppingBag, Truck, Tag,
    TrendingUp, DollarSign, Clock, RefreshCw, Settings, Building2,
    Eye, ShieldCheck, ChevronRight, FileText, Sparkles, Sliders, Layout
} from 'lucide-react';
import axios from 'axios';
import { useAuth } from '../../hooks/useAuth';
import { useClub } from '../../contexts/ClubContext';
import { toast } from 'sonner';

interface Product {
    id: string;
    name: string;
    slug: string;
    description: string;
    shortDescription?: string;
    type: string;
    price: number;
    compareAtPrice?: number;
    costPrice?: number;
    currency: string;
    stock: number;
    sku?: string;
    images: string[];
    published: boolean;
    featured?: boolean;
    status: string;
    categoryId?: string;
    category?: { id: string; name: string };
    createdAt?: string;
}

interface Category {
    id: string;
    name: string;
    slug: string;
    description?: string;
    _count?: { products: number };
}

interface OrderItem {
    id: string;
    title: string;
    qty: number;
    unitPrice: number;
    total: number;
    metadata?: string;
}

interface Order {
    id: string;
    orderNumber?: string;
    total: number;
    subtotal: number;
    shipping: number;
    discount: number;
    currency: string;
    status: string;
    shippingStatus: string;
    shippingMethod?: string;
    shippingAddress?: string;
    trackingNumber?: string;
    paymentMethod: string;
    paymentStatus: string;
    customerName: string;
    customerEmail: string;
    customerPhone?: string;
    createdAt: string;
    items: OrderItem[];
    history?: string;
}

interface InventoryMovement {
    id: string;
    productId: string;
    productName?: string;
    productSku?: string;
    type: string;
    quantity: number;
    previousStock: number;
    newStock: number;
    reason?: string;
    reference?: string;
    createdBy?: string;
    createdAt: string;
}

interface ShippingMethod {
    id: string;
    clubId: string;
    name: string;
    code: string;
    price: number;
    minOrderFree?: number;
    isActive: boolean;
    description?: string;
}

interface Coupon {
    id: string;
    code: string;
    discountType: string;
    discountValue: number;
    minOrderAmount: number;
    maxUses: number;
    usedCount: number;
    isActive: boolean;
}

export default function StoreManagement() {
    const { token, user } = useAuth();
    const { club } = useClub();
    const activeClubId = club?.id || user?.clubId || user?.club?.id || '';

    type TabType = 'overview' | 'products' | 'categories' | 'inventory' | 'orders' | 'shipping' | 'coupons' | 'settings';
    const [activeTab, setActiveTab] = useState<TabType>('overview');

    // Data States
    const [products, setProducts] = useState<Product[]>([]);
    const [categories, setCategories] = useState<Category[]>([]);
    const [orders, setOrders] = useState<Order[]>([]);
    const [movements, setMovements] = useState<InventoryMovement[]>([]);
    const [shippingMethods, setShippingMethods] = useState<ShippingMethod[]>([]);
    const [coupons, setCoupons] = useState<Coupon[]>([]);

    const [isLoading, setIsLoading] = useState(true);
    const [searchQuery, setSearchQuery] = useState('');

    // Product Modal State
    const [isProductModalOpen, setIsProductModalOpen] = useState(false);
    const [editingProduct, setEditingProduct] = useState<Product | null>(null);
    const [uploading, setUploading] = useState(false);
    const [isSubmitting, setIsSubmitting] = useState(false);
    const [formData, setFormData] = useState({
        name: '',
        slug: '',
        sku: '',
        price: 0,
        compareAtPrice: '',
        stock: 10,
        currency: 'COP',
        type: 'physical',
        categoryId: '',
        shortDescription: '',
        description: '',
        images: [] as string[],
        published: true,
        featured: false
    });

    // Category Modal State
    const [isCategoryModalOpen, setIsCategoryModalOpen] = useState(false);
    const [editingCategory, setEditingCategory] = useState<Category | null>(null);
    const [categoryFormData, setCategoryFormData] = useState({ name: '', slug: '', description: '' });

    // Inventory Adjustment Modal State
    const [isStockModalOpen, setIsStockModalOpen] = useState(false);
    const [adjustingProduct, setAdjustingProduct] = useState<Product | null>(null);
    const [adjustType, setAdjustType] = useState<'inflow' | 'loss' | 'set'>('inflow');
    const [adjustQuantity, setAdjustQuantity] = useState(1);
    const [adjustReason, setAdjustReason] = useState('');

    // Order Detail Modal State
    const [selectedOrder, setSelectedOrder] = useState<Order | null>(null);
    const [orderTrackingInput, setOrderTrackingInput] = useState('');

    // Shipping Method Modal State
    const [isShippingModalOpen, setIsShippingModalOpen] = useState(false);
    const [shippingForm, setShippingForm] = useState({ id: '', name: '', code: 'flat_rate', price: 15000, minOrderFree: 150000, isActive: true });

    // Coupon Modal State
    const [isCouponModalOpen, setIsCouponModalOpen] = useState(false);
    const [couponForm, setCouponForm] = useState({ code: '', discountType: 'percent', discountValue: 10, minOrderAmount: 0, maxUses: 100, isActive: true });

    // Settings State
    interface StoreConfig {
        showHeader: boolean;
        headerStyle: 'compact' | 'standard' | 'hero';
        headerSpacing: 'tight' | 'normal' | 'spacious';
        heroTitle: string;
        heroSubtitle: string;
        showBadge: boolean;
        badgeText: string;
    }

    const defaultStoreConfig: StoreConfig = {
        showHeader: true,
        headerStyle: 'compact',
        headerSpacing: 'tight',
        heroTitle: 'Productos, Artículos y Mercancía',
        heroSubtitle: 'Artículos con identidad Rotaria para miembros, amigos y comunidad. Cada compra apoya directamente nuestros proyectos de impacto social.',
        showBadge: true,
        badgeText: 'Tienda Oficial'
    };

    const [storeConfig, setStoreConfig] = useState<StoreConfig>(defaultStoreConfig);
    const [bankInstructions, setBankInstructions] = useState('');
    const [savingSettings, setSavingSettings] = useState(false);

    const API_URL = import.meta.env.VITE_API_URL || '/api';

    useEffect(() => {
        if (token && activeClubId) {
            fetchAllData();
        }
    }, [token, activeClubId]);

    const fetchAllData = async () => {
        setIsLoading(true);
        try {
            await Promise.all([
                fetchProducts(),
                fetchCategories(),
                fetchOrders(),
                fetchMovements(),
                fetchShippingMethods(),
                fetchCoupons(),
                fetchSettings()
            ]);
        } catch (err) {
            console.error('Error fetching store data:', err);
        } finally {
            setIsLoading(false);
        }
    };

    const fetchProducts = async () => {
        if (!activeClubId) return;
        try {
            const res = await axios.get(`${API_URL}/products`, {
                params: { clubId: activeClubId },
                headers: { Authorization: `Bearer ${token}` }
            });
            setProducts(res.data || []);
        } catch (error: any) {
            console.error('[StoreManagement] Error fetching products:', error);
        }
    };

    const fetchCategories = async () => {
        if (!activeClubId) return;
        try {
            const res = await axios.get(`${API_URL}/products/categories`, {
                params: { clubId: activeClubId },
                headers: { Authorization: `Bearer ${token}` }
            });
            setCategories(res.data || []);
        } catch (error) {
            console.error('[StoreManagement] Error fetching categories:', error);
        }
    };

    const fetchOrders = async () => {
        if (!activeClubId) return;
        try {
            const res = await axios.get(`${API_URL}/orders`, {
                params: { clubId: activeClubId },
                headers: { Authorization: `Bearer ${token}` }
            });
            setOrders(res.data.orders || []);
        } catch (error) {
            console.error('[StoreManagement] Error fetching orders:', error);
        }
    };

    const fetchMovements = async () => {
        if (!activeClubId) return;
        try {
            const res = await axios.get(`${API_URL}/orders/inventory/movements`, {
                params: { clubId: activeClubId },
                headers: { Authorization: `Bearer ${token}` }
            });
            setMovements(res.data.movements || []);
        } catch (error) {
            console.error('[StoreManagement] Error fetching movements:', error);
        }
    };

    const fetchShippingMethods = async () => {
        if (!activeClubId) return;
        try {
            const res = await axios.get(`${API_URL}/orders/shipping-methods`, {
                params: { clubId: activeClubId }
            });
            setShippingMethods(res.data.methods || []);
        } catch (error) {
            console.error('[StoreManagement] Error fetching shipping methods:', error);
        }
    };

    const fetchCoupons = async () => {
        if (!activeClubId) return;
        try {
            const res = await axios.get(`${API_URL}/orders/coupons`, {
                params: { clubId: activeClubId },
                headers: { Authorization: `Bearer ${token}` }
            });
            setCoupons(res.data.coupons || []);
        } catch (error) {
            console.error('[StoreManagement] Error fetching coupons:', error);
        }
    };

    const fetchSettings = async () => {
        if (!activeClubId) return;
        try {
            const res = await axios.get(`${API_URL}/products/settings`, {
                params: { clubId: activeClubId },
                headers: { Authorization: `Bearer ${token}` }
            });
            if (res.data?.storeConfig && typeof res.data.storeConfig === 'object') {
                setStoreConfig(prev => ({ ...prev, ...res.data.storeConfig }));
            }
            if (res.data?.bankInstructions !== undefined) {
                setBankInstructions(res.data.bankInstructions);
            }
        } catch {
            // fallback
        }
    };

    const generateSlug = (name: string) => {
        return name
            .toLowerCase()
            .trim()
            .replace(/[^a-z0-9]+/g, '-')
            .replace(/(^-|-$)+/g, '');
    };

    // ── PRODUCT ACTIONS ──────────────────────────────────────────────────────
    const handleOpenProductModal = (prod?: Product) => {
        if (prod) {
            setEditingProduct(prod);
            setFormData({
                name: prod.name,
                slug: prod.slug,
                sku: prod.sku || '',
                price: prod.price,
                compareAtPrice: prod.compareAtPrice ? String(prod.compareAtPrice) : '',
                stock: prod.stock,
                currency: prod.currency || 'COP',
                type: prod.type || 'physical',
                categoryId: prod.categoryId || '',
                shortDescription: prod.shortDescription || '',
                description: prod.description || '',
                images: prod.images || [],
                published: prod.published !== false && prod.status !== 'draft',
                featured: Boolean(prod.featured)
            });
        } else {
            setEditingProduct(null);
            setFormData({
                name: '',
                slug: '',
                sku: '',
                price: 0,
                compareAtPrice: '',
                stock: 10,
                currency: 'COP',
                type: 'physical',
                categoryId: '',
                shortDescription: '',
                description: '',
                images: [],
                published: true,
                featured: false
            });
        }
        setIsProductModalOpen(true);
    };

    const handleImageUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
        const files = e.target.files;
        if (!files || files.length === 0) return;

        setUploading(true);
        try {
            const uploadedUrls: string[] = [];
            for (let i = 0; i < files.length; i++) {
                const uploadData = new FormData();
                uploadData.append('file', files[i]);
                uploadData.append('folder', 'store');

                const targetUrl = `${API_URL}/media/upload?folder=store&clubId=${activeClubId}`;
                const response = await fetch(targetUrl, {
                    method: 'POST',
                    headers: { 'Authorization': `Bearer ${token}` },
                    body: uploadData
                });

                if (response.ok) {
                    const data = await response.json();
                    if (data.url) uploadedUrls.push(data.url);
                } else {
                    const err = await response.json().catch(() => ({}));
                    throw new Error(err.error || 'Error subiendo imagen');
                }
            }
            if (uploadedUrls.length > 0) {
                setFormData(prev => ({ ...prev, images: [...prev.images, ...uploadedUrls] }));
                toast.success(`${uploadedUrls.length} imagen(es) subida(s)`);
            }
        } catch (error: any) {
            toast.error(error.message || 'Error al subir imágenes');
        } finally {
            setUploading(false);
            if (e.target) e.target.value = '';
        }
    };

    const handleSetCoverImage = (index: number) => {
        if (index === 0) return;
        setFormData(prev => {
            const newImages = [...prev.images];
            const [selected] = newImages.splice(index, 1);
            newImages.unshift(selected);
            return { ...prev, images: newImages };
        });
        toast.success('Imagen establecida como portada');
    };

    const handleRemoveImage = (index: number) => {
        setFormData(prev => ({
            ...prev,
            images: prev.images.filter((_, i) => i !== index)
        }));
    };

    const handleProductSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!activeClubId) {
            toast.error('No se identificó el club actual para asociar el producto');
            return;
        }

        setIsSubmitting(true);
        try {
            const payload = {
                name: formData.name.trim(),
                slug: formData.slug || generateSlug(formData.name),
                sku: formData.sku.trim() || undefined,
                price: parseFloat(String(formData.price)) || 0,
                compareAtPrice: formData.compareAtPrice ? parseFloat(String(formData.compareAtPrice)) : null,
                stock: parseInt(String(formData.stock)) || 0,
                currency: formData.currency,
                type: formData.type,
                categoryId: formData.categoryId ? formData.categoryId : null,
                shortDescription: formData.shortDescription.trim() || null,
                description: formData.description.trim(),
                images: formData.images,
                published: formData.published,
                featured: formData.featured,
                clubId: activeClubId
            };

            if (editingProduct) {
                await axios.put(`${API_URL}/products/${editingProduct.id}`, payload, {
                    headers: { Authorization: `Bearer ${token}` }
                });
                toast.success('Producto actualizado exitosamente');
            } else {
                await axios.post(`${API_URL}/products`, payload, {
                    headers: { Authorization: `Bearer ${token}` }
                });
                toast.success('Producto creado exitosamente');
            }

            setIsProductModalOpen(false);
            fetchProducts();
        } catch (error: any) {
            toast.error(error.response?.data?.error || 'Error al guardar el producto');
        } finally {
            setIsSubmitting(false);
        }
    };

    const handleDeleteProduct = async (id: string, name: string) => {
        if (!window.confirm(`¿Seguro que deseas eliminar "${name}" del catálogo?`)) return;
        try {
            await axios.delete(`${API_URL}/products/${id}`, {
                headers: { Authorization: `Bearer ${token}` }
            });
            toast.success('Producto eliminado');
            fetchProducts();
        } catch (error: any) {
            toast.error(error.response?.data?.error || 'Error al eliminar');
        }
    };

    const handleToggleProductPublished = async (product: Product) => {
        try {
            const res = await axios.patch(`${API_URL}/products/${product.id}/toggle-publish`, {}, {
                headers: { Authorization: `Bearer ${token}` }
            });
            const updated = res.data;
            setProducts(prev => prev.map(p => p.id === product.id ? { ...p, published: updated.published, status: updated.status } : p));
            toast.success(updated.published ? `"${product.name}" habilitado en la tienda` : `"${product.name}" pasado a borrador`);
        } catch (error: any) {
            toast.error(error.response?.data?.error || 'Error al cambiar estado del producto');
        }
    };

    const handlePublishAll = async () => {
        if (!window.confirm('¿Deseas publicar todos los productos en borrador para que sean visibles en la tienda?')) return;
        try {
            const res = await axios.post(`${API_URL}/products/publish-all`, { clubId: activeClubId }, {
                headers: { Authorization: `Bearer ${token}` }
            });
            toast.success(res.data.message || 'Todos los productos han sido publicados');
            fetchProducts();
        } catch (error: any) {
            toast.error(error.response?.data?.error || 'Error al publicar productos');
        }
    };

    // ── CATEGORY ACTIONS ─────────────────────────────────────────────────────
    const handleOpenCategoryModal = (cat?: Category) => {
        if (cat) {
            setEditingCategory(cat);
            setCategoryFormData({ name: cat.name, slug: cat.slug, description: cat.description || '' });
        } else {
            setEditingCategory(null);
            setCategoryFormData({ name: '', slug: '', description: '' });
        }
        setIsCategoryModalOpen(true);
    };

    const handleCategorySubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!categoryFormData.name.trim()) return;

        try {
            const payload = {
                name: categoryFormData.name.trim(),
                slug: categoryFormData.slug || generateSlug(categoryFormData.name),
                description: categoryFormData.description.trim() || undefined,
                clubId: activeClubId
            };

            if (editingCategory) {
                await axios.put(`${API_URL}/products/categories/${editingCategory.id}`, payload, {
                    headers: { Authorization: `Bearer ${token}` }
                });
                toast.success('Categoría actualizada');
            } else {
                await axios.post(`${API_URL}/products/categories`, payload, {
                    headers: { Authorization: `Bearer ${token}` }
                });
                toast.success('Categoría creada');
            }

            setIsCategoryModalOpen(false);
            fetchCategories();
        } catch (error: any) {
            toast.error(error.response?.data?.error || 'Error al guardar categoría');
        }
    };

    const handleDeleteCategory = async (id: string, name: string) => {
        if (!window.confirm(`¿Seguro que deseas eliminar la categoría "${name}"?`)) return;
        try {
            await axios.delete(`${API_URL}/products/categories/${id}`, {
                headers: { Authorization: `Bearer ${token}` }
            });
            toast.success('Categoría eliminada');
            fetchCategories();
            fetchProducts();
        } catch (error: any) {
            toast.error(error.response?.data?.error || 'Error al eliminar categoría');
        }
    };

    // ── INVENTORY ADJUSTMENT ─────────────────────────────────────────────────
    const handleOpenAdjustModal = (product: Product) => {
        setAdjustingProduct(product);
        setAdjustQuantity(1);
        setAdjustType('inflow');
        setAdjustReason('');
        setIsStockModalOpen(true);
    };

    const handleStockSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!adjustingProduct) return;

        try {
            await axios.post(`${API_URL}/orders/inventory/adjust`, {
                productId: adjustingProduct.id,
                clubId: activeClubId,
                type: adjustType,
                quantity: adjustQuantity,
                reason: adjustReason || 'Ajuste manual administrativo'
            }, {
                headers: { Authorization: `Bearer ${token}` }
            });

            toast.success('Inventario actualizado con éxito');
            setIsStockModalOpen(false);
            fetchProducts();
            fetchMovements();
        } catch (error: any) {
            toast.error(error.response?.data?.error || 'Error al ajustar inventario');
        }
    };

    // ── ORDER STATUS UPDATES ─────────────────────────────────────────────────
    const handleUpdateOrderStatus = async (orderId: string, status: string, shippingStatus?: string) => {
        try {
            const res = await axios.patch(`${API_URL}/orders/${orderId}/status`, {
                status,
                shippingStatus,
                trackingNumber: orderTrackingInput || undefined
            }, {
                headers: { Authorization: `Bearer ${token}` }
            });

            toast.success(`Pedido actualizado a ${status}`);
            setSelectedOrder(res.data.order);
            fetchOrders();
            fetchProducts();
            fetchMovements();
        } catch (error: any) {
            toast.error(error.response?.data?.error || 'Error al actualizar pedido');
        }
    };

    // ── SHIPPING METHODS CRUD ────────────────────────────────────────────────
    const handleSaveShippingMethod = async (e: React.FormEvent) => {
        e.preventDefault();
        try {
            await axios.post(`${API_URL}/orders/shipping-methods`, {
                ...shippingForm,
                clubId: activeClubId
            }, {
                headers: { Authorization: `Bearer ${token}` }
            });

            toast.success('Método de envío guardado');
            setIsShippingModalOpen(false);
            fetchShippingMethods();
        } catch (error: any) {
            toast.error(error.response?.data?.error || 'Error al guardar método de envío');
        }
    };

    // ── COUPONS CRUD ─────────────────────────────────────────────────────────
    const handleSaveCoupon = async (e: React.FormEvent) => {
        e.preventDefault();
        try {
            await axios.post(`${API_URL}/orders/coupons`, {
                ...couponForm,
                clubId: activeClubId
            }, {
                headers: { Authorization: `Bearer ${token}` }
            });

            toast.success('Cupón creado con éxito');
            setIsCouponModalOpen(false);
            fetchCoupons();
        } catch (error: any) {
            toast.error(error.response?.data?.error || 'Error al crear cupón');
        }
    };

    // ── SETTINGS SAVE ────────────────────────────────────────────────────────
    const handleSaveSettings = async () => {
        setSavingSettings(true);
        try {
            await axios.post(`${API_URL}/products/settings`, {
                clubId: activeClubId,
                storeConfig,
                bankInstructions
            }, {
                headers: { Authorization: `Bearer ${token}` }
            });
            toast.success('Configuración de tienda guardada exitosamente');
        } catch (error: any) {
            toast.error(error.response?.data?.error || 'Error al guardar configuración');
        } finally {
            setSavingSettings(false);
        }
    };

    // Calculations for Dashboard
    const totalSales = orders.filter(o => o.status === 'paid').reduce((sum, o) => sum + o.total, 0);
    const paidOrdersCount = orders.filter(o => o.status === 'paid').length;
    const averageTicket = paidOrdersCount > 0 ? Math.round(totalSales / paidOrdersCount) : 0;
    const lowStockCount = products.filter(p => p.type === 'physical' && p.stock <= 4).length;

    return (
        <AdminLayout>
            <div className="space-y-8 font-sans pb-16">
                {/* Header Section */}
                <div className="flex flex-col md:flex-row md:items-center justify-between gap-6">
                    <div className="flex items-center gap-4">
                        <div className="w-14 h-14 rounded-3xl bg-sky-100 flex items-center justify-center shadow-sm">
                            <Package className="w-7 h-7 text-rotary-blue" />
                        </div>
                        <div>
                            <div className="flex items-center gap-3">
                                <h1 className="text-2xl font-black text-gray-900 tracking-tight">Centro de Comercio</h1>
                                <span className="text-xs font-bold px-2.5 py-0.5 rounded-full bg-emerald-50 text-emerald-700 border border-emerald-200">
                                    Multi-Tenant Activo
                                </span>
                            </div>
                            <p className="text-sm text-gray-500 mt-1">
                                Administración de catálogo, pedidos e inventario de {club?.name || 'la organización'}.
                            </p>
                        </div>
                    </div>

                    <div className="flex flex-wrap items-center gap-3">
                        <a
                            href="/tienda"
                            target="_blank"
                            rel="noreferrer"
                            className="flex items-center gap-2 px-4 py-2.5 rounded-xl border border-gray-200 bg-white text-gray-700 font-bold hover:bg-gray-50 transition-colors text-sm shadow-sm"
                        >
                            <ExternalLink className="w-4 h-4 text-gray-400" />
                            Ver Tienda Pública
                        </a>
                        <button
                            onClick={() => handleOpenCategoryModal()}
                            className="flex items-center gap-2 px-4 py-2.5 rounded-xl border border-rotary-blue/20 bg-sky-50 text-rotary-blue font-bold hover:bg-sky-100 transition-colors text-sm"
                        >
                            <FolderPlus className="w-4 h-4" />
                            Nueva Categoría
                        </button>
                        <button
                            onClick={() => handleOpenProductModal()}
                            className="flex items-center gap-2 bg-rotary-blue text-white px-5 py-2.5 rounded-xl hover:bg-sky-800 transition-all font-bold shadow-lg shadow-rotary-blue/20 active:scale-95 text-sm"
                        >
                            <Plus className="w-5 h-5" />
                            Nuevo Producto
                        </button>
                    </div>
                </div>

                {/* Tabs Navigation */}
                <div className="flex items-center gap-2 overflow-x-auto border-b border-gray-200 pb-px scrollbar-none">
                    {[
                        { id: 'overview', label: 'Resumen', icon: TrendingUp },
                        { id: 'products', label: 'Productos', icon: Package, count: products.length },
                        { id: 'categories', label: 'Categorías', icon: Layers, count: categories.length },
                        { id: 'inventory', label: 'Inventario', icon: RefreshCw },
                        { id: 'orders', label: 'Pedidos', icon: ShoppingBag, count: orders.length },
                        { id: 'shipping', label: 'Envíos', icon: Truck },
                        { id: 'coupons', label: 'Cupones', icon: Tag },
                        { id: 'settings', label: 'Configuración', icon: Settings }
                    ].map(tab => {
                        const Icon = tab.icon;
                        const isActive = activeTab === tab.id;
                        return (
                            <button
                                key={tab.id}
                                onClick={() => setActiveTab(tab.id as TabType)}
                                className={`flex items-center gap-2 px-4 py-3 border-b-2 font-bold text-sm transition-all whitespace-nowrap ${isActive ? 'border-rotary-blue text-rotary-blue bg-sky-50/30' : 'border-transparent text-gray-500 hover:text-gray-900 hover:border-gray-300'}`}
                            >
                                <Icon className="w-4 h-4" />
                                <span>{tab.label}</span>
                                {tab.count !== undefined && (
                                    <span className={`text-[11px] px-2 py-0.5 rounded-full ${isActive ? 'bg-rotary-blue text-white' : 'bg-gray-100 text-gray-600'}`}>
                                        {tab.count}
                                    </span>
                                )}
                            </button>
                        );
                    })}
                </div>

                {/* TAB 1: OVERVIEW / DASHBOARD */}
                {activeTab === 'overview' && (
                    <div className="space-y-8 animate-in fade-in duration-200">
                        {/* Metrics Cards */}
                        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
                            <div className="bg-white rounded-3xl p-6 border border-gray-100 shadow-sm flex items-center justify-between">
                                <div>
                                    <p className="text-xs font-bold text-gray-400 uppercase tracking-wider mb-1">Ventas Totales</p>
                                    <h3 className="text-2xl font-black text-gray-900">${totalSales.toLocaleString()}</h3>
                                    <span className="text-xs text-emerald-600 font-bold mt-1 inline-block">Pedidos confirmados</span>
                                </div>
                                <div className="w-12 h-12 bg-emerald-50 rounded-2xl flex items-center justify-center">
                                    <DollarSign className="w-6 h-6 text-emerald-600" />
                                </div>
                            </div>

                            <div className="bg-white rounded-3xl p-6 border border-gray-100 shadow-sm flex items-center justify-between">
                                <div>
                                    <p className="text-xs font-bold text-gray-400 uppercase tracking-wider mb-1">Total Pedidos</p>
                                    <h3 className="text-2xl font-black text-gray-900">{orders.length}</h3>
                                    <span className="text-xs text-gray-500 font-bold mt-1 inline-block">{paidOrdersCount} pagados</span>
                                </div>
                                <div className="w-12 h-12 bg-sky-50 rounded-2xl flex items-center justify-center">
                                    <ShoppingBag className="w-6 h-6 text-rotary-blue" />
                                </div>
                            </div>

                            <div className="bg-white rounded-3xl p-6 border border-gray-100 shadow-sm flex items-center justify-between">
                                <div>
                                    <p className="text-xs font-bold text-gray-400 uppercase tracking-wider mb-1">Ticket Promedio</p>
                                    <h3 className="text-2xl font-black text-gray-900">${averageTicket.toLocaleString()}</h3>
                                    <span className="text-xs text-gray-400 font-medium mt-1 inline-block">Por compra realizada</span>
                                </div>
                                <div className="w-12 h-12 bg-purple-50 rounded-2xl flex items-center justify-center">
                                    <TrendingUp className="w-6 h-6 text-purple-600" />
                                </div>
                            </div>

                            <div className="bg-white rounded-3xl p-6 border border-gray-100 shadow-sm flex items-center justify-between">
                                <div>
                                    <p className="text-xs font-bold text-gray-400 uppercase tracking-wider mb-1">Stock Bajo / Agotados</p>
                                    <h3 className="text-2xl font-black text-amber-600">{lowStockCount}</h3>
                                    <span className="text-xs text-gray-400 font-medium mt-1 inline-block">Menos de 5 unidades</span>
                                </div>
                                <div className="w-12 h-12 bg-amber-50 rounded-2xl flex items-center justify-center">
                                    <AlertCircle className="w-6 h-6 text-amber-600" />
                                </div>
                            </div>
                        </div>

                        {/* Recent Orders Overview */}
                        <div className="bg-white rounded-3xl p-6 sm:p-8 border border-gray-100 shadow-sm">
                            <div className="flex items-center justify-between mb-6">
                                <h3 className="text-lg font-black text-gray-900">Últimos Pedidos Recibidos</h3>
                                <button
                                    onClick={() => setActiveTab('orders')}
                                    className="text-xs font-bold text-rotary-blue hover:underline flex items-center gap-1"
                                >
                                    Ver todos los pedidos <ChevronRight className="w-4 h-4" />
                                </button>
                            </div>

                            {orders.length === 0 ? (
                                <p className="text-sm text-gray-400 text-center py-8">Aún no se han recibido pedidos en esta tienda.</p>
                            ) : (
                                <div className="divide-y divide-gray-100">
                                    {orders.slice(0, 5).map(order => (
                                        <div
                                            key={order.id}
                                            onClick={() => { setSelectedOrder(order); setOrderTrackingInput(order.trackingNumber || ''); }}
                                            className="py-4 flex items-center justify-between hover:bg-gray-50 rounded-xl px-3 transition-colors cursor-pointer"
                                        >
                                            <div>
                                                <span className="font-mono text-xs font-bold text-gray-900 block">
                                                    #{order.orderNumber || order.id.slice(-6).toUpperCase()}
                                                </span>
                                                <span className="text-sm text-gray-600 font-medium">{order.customerName}</span>
                                            </div>
                                            <div className="text-right">
                                                <span className="font-black text-gray-900 text-sm block">
                                                    ${order.total.toLocaleString()} {order.currency}
                                                </span>
                                                <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${order.status === 'paid' ? 'bg-emerald-50 text-emerald-700' : 'bg-amber-50 text-amber-700'}`}>
                                                    {order.status}
                                                </span>
                                            </div>
                                        </div>
                                    ))}
                                </div>
                            )}
                        </div>
                    </div>
                )}

                {/* TAB 2: PRODUCTS */}
                {activeTab === 'products' && (
                    <div className="space-y-6 animate-in fade-in duration-200">
                        {/* Draft Warning Banner */}
                        {products.some(p => !p.published) && (
                            <div className="bg-amber-50 border border-amber-200 rounded-2xl p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3 shadow-xs">
                                <div className="flex items-center gap-3">
                                    <div className="w-8 h-8 rounded-xl bg-amber-100 flex items-center justify-center text-amber-700 flex-shrink-0">
                                        <AlertCircle className="w-4 h-4" />
                                    </div>
                                    <div>
                                        <p className="text-sm font-bold text-amber-950">
                                            Tienes {products.filter(p => !p.published).length} producto(s) en modo borrador
                                        </p>
                                        <p className="text-xs text-amber-800">
                                            Solo los productos publicados están visibles para los compradores en la tienda virtual pública.
                                        </p>
                                    </div>
                                </div>
                                <button
                                    onClick={handlePublishAll}
                                    className="px-4 py-2 bg-amber-600 hover:bg-amber-700 text-white rounded-xl text-xs font-bold transition-colors whitespace-nowrap shadow-sm self-start sm:self-auto"
                                >
                                    Habilitar Todos en la Tienda
                                </button>
                            </div>
                        )}

                        {/* Search Bar & Action Buttons */}
                        <div className="flex flex-col sm:flex-row justify-between items-center gap-4 bg-white p-4 rounded-2xl border border-gray-100">
                            <div className="relative w-full sm:w-80">
                                <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                                <input
                                    type="text"
                                    placeholder="Buscar producto o SKU..."
                                    value={searchQuery}
                                    onChange={e => setSearchQuery(e.target.value)}
                                    className="w-full pl-10 pr-4 py-2 bg-gray-50 rounded-xl border border-transparent focus:border-rotary-blue/30 focus:bg-white text-sm outline-none font-medium"
                                />
                            </div>
                            <div className="flex items-center gap-2.5 w-full sm:w-auto">
                                <a
                                    href="/tienda"
                                    target="_blank"
                                    rel="noreferrer"
                                    className="px-3.5 py-2 bg-gray-100 hover:bg-gray-200 text-gray-700 font-bold rounded-xl text-xs flex items-center gap-1.5 transition-colors"
                                >
                                    <ExternalLink className="w-3.5 h-3.5" /> Ver Tienda
                                </a>
                                <button
                                    onClick={() => handleOpenProductModal()}
                                    className="flex-1 sm:flex-initial px-4 py-2 bg-rotary-blue text-white font-bold rounded-xl text-sm flex items-center justify-center gap-2 hover:bg-sky-800 transition-colors shadow-sm shadow-rotary-blue/20"
                                >
                                    <Plus className="w-4 h-4" /> Crear Producto
                                </button>
                            </div>
                        </div>

                        {/* Products Table */}
                        <div className="bg-white rounded-3xl border border-gray-100 shadow-sm overflow-hidden">
                            <div className="overflow-x-auto">
                                <table className="w-full text-left text-sm">
                                    <thead className="bg-gray-50 text-gray-400 uppercase text-[11px] font-bold tracking-wider">
                                        <tr>
                                            <th className="px-6 py-4">Producto</th>
                                            <th className="px-6 py-4">Categoría</th>
                                            <th className="px-6 py-4">Precio</th>
                                            <th className="px-6 py-4">Stock</th>
                                            <th className="px-6 py-4">Estado en Tienda</th>
                                            <th className="px-6 py-4 text-right">Acciones</th>
                                        </tr>
                                    </thead>
                                    <tbody className="divide-y divide-gray-100">
                                        {products
                                            .filter(p => p.name.toLowerCase().includes(searchQuery.toLowerCase()) || (p.sku && p.sku.toLowerCase().includes(searchQuery.toLowerCase())))
                                            .map(product => (
                                                <tr key={product.id} className="hover:bg-gray-50/50 transition-colors">
                                                    <td className="px-6 py-4">
                                                        <div className="flex items-center gap-3">
                                                            <div className="w-12 h-12 rounded-xl bg-gray-50 overflow-hidden border border-gray-100 flex-shrink-0 flex items-center justify-center">
                                                                {product.images?.[0] ? (
                                                                    <img src={product.images[0]} alt={product.name} className="w-full h-full object-cover" />
                                                                ) : (
                                                                    <Package className="w-6 h-6 text-gray-300" />
                                                                )}
                                                            </div>
                                                            <div>
                                                                <h4 className="font-bold text-gray-900 leading-tight">{product.name}</h4>
                                                                {product.sku && <span className="text-[11px] font-mono text-gray-400">SKU: {product.sku}</span>}
                                                            </div>
                                                        </div>
                                                    </td>
                                                    <td className="px-6 py-4 text-gray-600 font-medium">
                                                        {product.category?.name || <span className="text-gray-300 italic">Sin categoría</span>}
                                                    </td>
                                                    <td className="px-6 py-4 font-black text-gray-900">
                                                        ${product.price.toLocaleString()} {product.currency}
                                                    </td>
                                                    <td className="px-6 py-4">
                                                        <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-bold ${product.stock <= 0 ? 'bg-red-50 text-red-700' : product.stock <= 4 ? 'bg-amber-50 text-amber-700' : 'bg-emerald-50 text-emerald-700'}`}>
                                                            {product.stock} un.
                                                        </span>
                                                    </td>
                                                    <td className="px-6 py-4">
                                                        <button
                                                            onClick={() => handleToggleProductPublished(product)}
                                                            title={product.published ? 'Clic para pasar a borrador (ocultar de la tienda)' : 'Clic para habilitar y publicar en la tienda'}
                                                            className={`inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-bold transition-all cursor-pointer ${
                                                                product.published
                                                                    ? 'bg-emerald-50 text-emerald-700 hover:bg-emerald-100 border border-emerald-200'
                                                                    : 'bg-amber-50 text-amber-700 hover:bg-amber-100 border border-amber-200'
                                                            }`}
                                                        >
                                                            <span className={`w-1.5 h-1.5 rounded-full ${product.published ? 'bg-emerald-500' : 'bg-amber-500'}`} />
                                                            {product.published ? 'Publicado (En Tienda)' : 'Borrador (Oculto)'}
                                                        </button>
                                                    </td>
                                                    <td className="px-6 py-4 text-right">
                                                        <div className="flex items-center justify-end gap-2">
                                                            <button
                                                                onClick={() => handleOpenAdjustModal(product)}
                                                                title="Ajustar Stock"
                                                                className="p-2 text-gray-400 hover:text-rotary-blue hover:bg-sky-50 rounded-lg transition-colors"
                                                            >
                                                                <RefreshCw className="w-4 h-4" />
                                                            </button>
                                                            <button
                                                                onClick={() => handleOpenProductModal(product)}
                                                                title="Editar Producto"
                                                                className="p-2 text-gray-400 hover:text-gray-900 hover:bg-gray-100 rounded-lg transition-colors"
                                                            >
                                                                <Edit2 className="w-4 h-4" />
                                                            </button>
                                                            <button
                                                                onClick={() => handleDeleteProduct(product.id, product.name)}
                                                                title="Eliminar"
                                                                className="p-2 text-gray-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors"
                                                            >
                                                                <Trash2 className="w-4 h-4" />
                                                            </button>
                                                        </div>
                                                    </td>
                                                </tr>
                                            ))}
                                    </tbody>
                                </table>
                            </div>
                        </div>
                    </div>
                )}

                {/* TAB 3: CATEGORIES */}
                {activeTab === 'categories' && (
                    <div className="space-y-6 animate-in fade-in duration-200">
                        <div className="flex justify-between items-center bg-white p-4 rounded-2xl border border-gray-100">
                            <h3 className="font-black text-gray-900 text-base">Categorías del Club ({categories.length})</h3>
                            <button
                                onClick={() => handleOpenCategoryModal()}
                                className="px-4 py-2 bg-rotary-blue text-white font-bold rounded-xl text-sm flex items-center gap-2 hover:bg-sky-800 transition-colors"
                            >
                                <Plus className="w-4 h-4" /> Nueva Categoría
                            </button>
                        </div>

                        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
                            {categories.map(cat => (
                                <div key={cat.id} className="bg-white rounded-3xl p-6 border border-gray-100 shadow-sm flex flex-col justify-between">
                                    <div>
                                        <div className="flex items-center justify-between mb-3">
                                            <span className="p-2.5 rounded-2xl bg-sky-50 text-rotary-blue">
                                                <Layers className="w-5 h-5" />
                                            </span>
                                            <div className="flex items-center gap-1">
                                                <button
                                                    onClick={() => handleOpenCategoryModal(cat)}
                                                    className="p-1.5 text-gray-400 hover:text-gray-900 rounded-lg"
                                                >
                                                    <Edit2 className="w-4 h-4" />
                                                </button>
                                                <button
                                                    onClick={() => handleDeleteCategory(cat.id, cat.name)}
                                                    className="p-1.5 text-gray-400 hover:text-red-600 rounded-lg"
                                                >
                                                    <Trash2 className="w-4 h-4" />
                                                </button>
                                            </div>
                                        </div>
                                        <h4 className="text-lg font-bold text-gray-900">{cat.name}</h4>
                                        <p className="text-xs text-gray-400 font-mono mt-1">/tienda/categoria/{cat.slug}</p>
                                        {cat.description && (
                                            <p className="text-sm text-gray-500 mt-3 line-clamp-2">{cat.description}</p>
                                        )}
                                    </div>
                                    <div className="mt-6 pt-4 border-t border-gray-100 flex items-center justify-between text-xs text-gray-400">
                                        <span>Productos vinculados</span>
                                        <span className="font-bold text-gray-900">
                                            {products.filter(p => p.categoryId === cat.id).length}
                                        </span>
                                    </div>
                                </div>
                            ))}
                        </div>
                    </div>
                )}

                {/* TAB 4: INVENTORY */}
                {activeTab === 'inventory' && (
                    <div className="space-y-8 animate-in fade-in duration-200">
                        {/* Current Stock Levels Table */}
                        <div className="bg-white rounded-3xl border border-gray-100 shadow-sm overflow-hidden p-6">
                            <h3 className="text-lg font-black text-gray-900 mb-4">Control de Existencias Físicas</h3>
                            <div className="overflow-x-auto">
                                <table className="w-full text-left text-sm">
                                    <thead className="bg-gray-50 text-gray-400 uppercase text-[11px] font-bold tracking-wider">
                                        <tr>
                                            <th className="px-6 py-3">Producto</th>
                                            <th className="px-6 py-3">SKU</th>
                                            <th className="px-6 py-3">Stock Actual</th>
                                            <th className="px-6 py-3">Disponibilidad</th>
                                            <th className="px-6 py-3 text-right">Acción</th>
                                        </tr>
                                    </thead>
                                    <tbody className="divide-y divide-gray-100">
                                        {products.filter(p => p.type === 'physical').map(p => (
                                            <tr key={p.id}>
                                                <td className="px-6 py-4 font-bold text-gray-900">{p.name}</td>
                                                <td className="px-6 py-4 font-mono text-xs text-gray-500">{p.sku || 'N/A'}</td>
                                                <td className="px-6 py-4 font-black text-base">{p.stock}</td>
                                                <td className="px-6 py-4">
                                                    {p.stock <= 0 ? (
                                                        <span className="px-2.5 py-1 bg-red-50 text-red-700 rounded-full text-xs font-bold">Agotado</span>
                                                    ) : p.stock <= 4 ? (
                                                        <span className="px-2.5 py-1 bg-amber-50 text-amber-700 rounded-full text-xs font-bold">Stock Crítico</span>
                                                    ) : (
                                                        <span className="px-2.5 py-1 bg-emerald-50 text-emerald-700 rounded-full text-xs font-bold">En Existencia</span>
                                                    )}
                                                </td>
                                                <td className="px-6 py-4 text-right">
                                                    <button
                                                        onClick={() => handleOpenAdjustModal(p)}
                                                        className="px-3 py-1.5 bg-gray-50 hover:bg-rotary-blue hover:text-white text-gray-700 font-bold rounded-lg text-xs transition-colors"
                                                    >
                                                        Ajustar
                                                    </button>
                                                </td>
                                            </tr>
                                        ))}
                                    </tbody>
                                </table>
                            </div>
                        </div>

                        {/* Inventory Movements Audit Log */}
                        <div className="bg-white rounded-3xl border border-gray-100 shadow-sm overflow-hidden p-6">
                            <h3 className="text-lg font-black text-gray-900 mb-4">Historial de Movimientos de Inventario</h3>
                            {movements.length === 0 ? (
                                <p className="text-sm text-gray-400 py-6 text-center">No hay registros de movimientos aún.</p>
                            ) : (
                                <div className="overflow-x-auto">
                                    <table className="w-full text-left text-sm">
                                        <thead className="bg-gray-50 text-gray-400 uppercase text-[11px] font-bold tracking-wider">
                                            <tr>
                                                <th className="px-6 py-3">Fecha</th>
                                                <th className="px-6 py-3">Producto</th>
                                                <th className="px-6 py-3">Tipo</th>
                                                <th className="px-6 py-3">Cantidad</th>
                                                <th className="px-6 py-3">Saldo</th>
                                                <th className="px-6 py-3">Motivo / Ref</th>
                                            </tr>
                                        </thead>
                                        <tbody className="divide-y divide-gray-100">
                                            {movements.map(m => (
                                                <tr key={m.id} className="text-xs">
                                                    <td className="px-6 py-3 text-gray-500">{new Date(m.createdAt).toLocaleString('es-CO')}</td>
                                                    <td className="px-6 py-3 font-bold text-gray-900">{m.productName || 'Producto'}</td>
                                                    <td className="px-6 py-3">
                                                        <span className={`px-2 py-0.5 rounded-full font-bold text-[10px] ${m.type === 'sale' ? 'bg-red-50 text-red-700' : 'bg-emerald-50 text-emerald-700'}`}>
                                                            {m.type === 'sale' ? 'Venta' : m.type === 'inflow' ? 'Entrada' : m.type}
                                                        </span>
                                                    </td>
                                                    <td className="px-6 py-3 font-mono font-bold">{m.quantity > 0 ? `+${m.quantity}` : m.quantity}</td>
                                                    <td className="px-6 py-3 font-mono text-gray-600">{m.previousStock} → {m.newStock}</td>
                                                    <td className="px-6 py-3 text-gray-500">{m.reason} ({m.reference})</td>
                                                </tr>
                                            ))}
                                        </tbody>
                                    </table>
                                </div>
                            )}
                        </div>
                    </div>
                )}

                {/* TAB 5: ORDERS */}
                {activeTab === 'orders' && (
                    <div className="space-y-6 animate-in fade-in duration-200">
                        <div className="bg-white rounded-3xl border border-gray-100 shadow-sm overflow-hidden p-6">
                            <h3 className="text-lg font-black text-gray-900 mb-6">Listado de Pedidos ({orders.length})</h3>

                            {orders.length === 0 ? (
                                <p className="text-sm text-gray-400 py-12 text-center">No se han registrado pedidos en este club.</p>
                            ) : (
                                <div className="overflow-x-auto">
                                    <table className="w-full text-left text-sm">
                                        <thead className="bg-gray-50 text-gray-400 uppercase text-[11px] font-bold tracking-wider">
                                            <tr>
                                                <th className="px-6 py-3"># Orden</th>
                                                <th className="px-6 py-3">Fecha</th>
                                                <th className="px-6 py-3">Cliente</th>
                                                <th className="px-6 py-3">Total</th>
                                                <th className="px-6 py-3">Estado Pago</th>
                                                <th className="px-6 py-3">Envío</th>
                                                <th className="px-6 py-3 text-right">Detalle</th>
                                            </tr>
                                        </thead>
                                        <tbody className="divide-y divide-gray-100">
                                            {orders.map(o => (
                                                <tr key={o.id} className="hover:bg-gray-50/50">
                                                    <td className="px-6 py-4 font-mono font-bold text-gray-900">
                                                        #{o.orderNumber || o.id.slice(-6).toUpperCase()}
                                                    </td>
                                                    <td className="px-6 py-4 text-xs text-gray-500">
                                                        {new Date(o.createdAt).toLocaleDateString('es-CO')}
                                                    </td>
                                                    <td className="px-6 py-4">
                                                        <span className="font-bold text-gray-900 block">{o.customerName}</span>
                                                        <span className="text-xs text-gray-400">{o.customerEmail}</span>
                                                    </td>
                                                    <td className="px-6 py-4 font-black text-gray-900">
                                                        ${o.total.toLocaleString()} {o.currency}
                                                    </td>
                                                    <td className="px-6 py-4">
                                                        <span className={`px-2.5 py-1 rounded-full text-xs font-bold ${o.status === 'paid' ? 'bg-emerald-50 text-emerald-700 border border-emerald-200' : 'bg-amber-50 text-amber-700 border border-amber-200'}`}>
                                                            {o.status}
                                                        </span>
                                                    </td>
                                                    <td className="px-6 py-4 text-xs text-gray-600">
                                                        {o.shippingStatus}
                                                    </td>
                                                    <td className="px-6 py-4 text-right">
                                                        <button
                                                            onClick={() => { setSelectedOrder(o); setOrderTrackingInput(o.trackingNumber || ''); }}
                                                            className="p-2 text-gray-400 hover:text-rotary-blue hover:bg-sky-50 rounded-lg transition-colors"
                                                            title="Ver Detalle y Gestionar"
                                                        >
                                                            <Eye className="w-4 h-4" />
                                                        </button>
                                                    </td>
                                                </tr>
                                            ))}
                                        </tbody>
                                    </table>
                                </div>
                            )}
                        </div>
                    </div>
                )}

                {/* TAB 6: SHIPPING METHODS */}
                {activeTab === 'shipping' && (
                    <div className="space-y-6 animate-in fade-in duration-200">
                        <div className="flex justify-between items-center bg-white p-4 rounded-2xl border border-gray-100">
                            <div>
                                <h3 className="font-black text-gray-900 text-base">Tarifas y Métodos de Envío</h3>
                                <p className="text-xs text-gray-500">Configura opciones para retiro en sede o despacho a nivel nacional.</p>
                            </div>
                            <button
                                onClick={() => {
                                    setShippingForm({ id: '', name: '', code: 'flat_rate', price: 15000, minOrderFree: 150000, isActive: true });
                                    setIsShippingModalOpen(true);
                                }}
                                className="px-4 py-2 bg-rotary-blue text-white font-bold rounded-xl text-sm flex items-center gap-2 hover:bg-sky-800 transition-colors"
                            >
                                <Plus className="w-4 h-4" /> Nuevo Método
                            </button>
                        </div>

                        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                            {shippingMethods.map(m => (
                                <div key={m.id} className="bg-white rounded-3xl p-6 border border-gray-100 shadow-sm flex flex-col justify-between">
                                    <div>
                                        <div className="flex items-center justify-between mb-4">
                                            <span className="p-3 bg-sky-50 text-rotary-blue rounded-2xl">
                                                <Truck className="w-6 h-6" />
                                            </span>
                                            <span className={`text-xs font-bold px-2.5 py-1 rounded-full ${m.isActive ? 'bg-emerald-50 text-emerald-700' : 'bg-gray-100 text-gray-500'}`}>
                                                {m.isActive ? 'Activo' : 'Inactivo'}
                                            </span>
                                        </div>
                                        <h4 className="text-lg font-bold text-gray-900">{m.name}</h4>
                                        <p className="text-xs text-gray-400 font-mono mt-1">Código: {m.code}</p>
                                        <div className="mt-4 space-y-1 text-sm">
                                            <p className="text-gray-600">
                                                Precio de envío: <strong className="text-gray-900">${m.price.toLocaleString()} COP</strong>
                                            </p>
                                            {m.minOrderFree ? (
                                                <p className="text-xs text-emerald-600 font-bold">
                                                    Envío gratis en compras mayores a ${m.minOrderFree.toLocaleString()} COP
                                                </p>
                                            ) : null}
                                        </div>
                                    </div>
                                    <div className="mt-6 pt-4 border-t border-gray-100 text-right">
                                        <button
                                            onClick={() => {
                                                setShippingForm({
                                                    id: m.id,
                                                    name: m.name,
                                                    code: m.code,
                                                    price: m.price,
                                                    minOrderFree: m.minOrderFree || 0,
                                                    isActive: m.isActive
                                                });
                                                setIsShippingModalOpen(true);
                                            }}
                                            className="text-xs font-bold text-rotary-blue hover:underline"
                                        >
                                            Editar Método
                                        </button>
                                    </div>
                                </div>
                            ))}
                        </div>
                    </div>
                )}

                {/* TAB 7: COUPONS */}
                {activeTab === 'coupons' && (
                    <div className="space-y-6 animate-in fade-in duration-200">
                        <div className="flex justify-between items-center bg-white p-4 rounded-2xl border border-gray-100">
                            <div>
                                <h3 className="font-black text-gray-900 text-base">Cupones de Descuento</h3>
                                <p className="text-xs text-gray-500">Crea promociones por porcentaje o importe fijo aplicables en el carrito.</p>
                            </div>
                            <button
                                onClick={() => {
                                    setCouponForm({ code: '', discountType: 'percent', discountValue: 10, minOrderAmount: 0, maxUses: 100, isActive: true });
                                    setIsCouponModalOpen(true);
                                }}
                                className="px-4 py-2 bg-rotary-blue text-white font-bold rounded-xl text-sm flex items-center gap-2 hover:bg-sky-800 transition-colors"
                            >
                                <Plus className="w-4 h-4" /> Crear Cupón
                            </button>
                        </div>

                        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                            {coupons.map(c => (
                                <div key={c.id} className="bg-white rounded-3xl p-6 border border-gray-100 shadow-sm flex flex-col justify-between">
                                    <div>
                                        <div className="flex items-center justify-between mb-4">
                                            <span className="p-3 bg-purple-50 text-purple-600 rounded-2xl">
                                                <Tag className="w-6 h-6" />
                                            </span>
                                            <span className={`text-xs font-bold px-2.5 py-1 rounded-full ${c.isActive ? 'bg-emerald-50 text-emerald-700' : 'bg-gray-100 text-gray-500'}`}>
                                                {c.isActive ? 'Activo' : 'Inactivo'}
                                            </span>
                                        </div>
                                        <h4 className="text-xl font-black font-mono text-gray-900">{c.code}</h4>
                                        <p className="text-sm font-bold text-rotary-blue mt-2">
                                            {c.discountType === 'percent' ? `${c.discountValue}% de descuento` : `$${c.discountValue.toLocaleString()} de descuento`}
                                        </p>
                                        <div className="mt-4 text-xs text-gray-500 space-y-1">
                                            <p>Usos: {c.usedCount} de {c.maxUses}</p>
                                            {c.minOrderAmount > 0 && <p>Mínimo compra: ${c.minOrderAmount.toLocaleString()}</p>}
                                        </div>
                                    </div>
                                </div>
                            ))}
                        </div>
                    </div>
                )}

                {/* TAB 8: SETTINGS */}
                {activeTab === 'settings' && (
                    <div className="max-w-4xl space-y-8 animate-in fade-in duration-200">
                        {/* Section 1: Header & Visual Customization */}
                        <div className="bg-white rounded-3xl p-8 border border-gray-100 shadow-sm space-y-6">
                            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-4 border-b border-gray-100">
                                <div>
                                    <h3 className="text-xl font-black text-gray-900 flex items-center gap-2">
                                        <Layout className="w-5 h-5 text-rotary-blue" />
                                        Encabezado y Presentación de la Tienda
                                    </h3>
                                    <p className="text-xs text-gray-500 mt-1">
                                        Personaliza los títulos, márgenes o desactiva el encabezado superior para ahorrar espacio vertical.
                                    </p>
                                </div>
                                <a
                                    href="/tienda"
                                    target="_blank"
                                    rel="noreferrer"
                                    className="px-3.5 py-2 bg-gray-50 hover:bg-gray-100 text-gray-700 border border-gray-200 font-bold rounded-xl text-xs flex items-center gap-1.5 self-start sm:self-auto transition-colors"
                                >
                                    <ExternalLink className="w-3.5 h-3.5" /> Ver Tienda en Vivo
                                </a>
                            </div>

                            {/* Visibility Toggle */}
                            <div className="flex items-center justify-between p-4 bg-gray-50 rounded-2xl border border-gray-100">
                                <div>
                                    <span className="font-bold text-sm text-gray-900 block">
                                        Mostrar Título y Encabezado de la Tienda
                                    </span>
                                    <span className="text-xs text-gray-500">
                                        {storeConfig.showHeader
                                            ? 'El encabezado superior está activo antes del catálogo de productos.'
                                            : 'El encabezado está oculto: los productos aparecen directamente en la parte superior sin ocupar espacio.'}
                                    </span>
                                </div>
                                <label className="relative inline-flex items-center cursor-pointer">
                                    <input
                                        type="checkbox"
                                        checked={storeConfig.showHeader}
                                        onChange={e => setStoreConfig({ ...storeConfig, showHeader: e.target.checked })}
                                        className="sr-only peer"
                                    />
                                    <div className="w-11 h-6 bg-gray-200 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-rotary-blue"></div>
                                </label>
                            </div>

                            {storeConfig.showHeader && (
                                <div className="space-y-6 pt-2">
                                    {/* Style Selection */}
                                    <div>
                                        <label className="block text-xs font-bold text-gray-500 uppercase tracking-wider mb-3">
                                            Estilo del Encabezado
                                        </label>
                                        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                                            {[
                                                { id: 'compact', label: 'Compacto (Recomendado)', desc: 'Bajo perfil (~60px). Título en una fila y productos inmediatamente visibles.' },
                                                { id: 'standard', label: 'Estándar', desc: 'Encabezado centrado moderno con proporciones equilibradas.' },
                                                { id: 'hero', label: 'Destacado / Hero', desc: 'Banner de gran formato centrado con amplio impacto visual.' }
                                            ].map(st => (
                                                <button
                                                    key={st.id}
                                                    type="button"
                                                    onClick={() => setStoreConfig({ ...storeConfig, headerStyle: st.id as any })}
                                                    className={`p-4 rounded-2xl border-2 text-left transition-all ${
                                                        storeConfig.headerStyle === st.id
                                                            ? 'border-rotary-blue bg-sky-50/50 shadow-xs'
                                                            : 'border-gray-100 hover:border-gray-200 bg-white'
                                                    }`}
                                                >
                                                    <span className={`text-xs font-black block mb-1 ${storeConfig.headerStyle === st.id ? 'text-rotary-blue' : 'text-gray-900'}`}>
                                                        {st.label}
                                                    </span>
                                                    <span className="text-[11px] text-gray-500 leading-snug block">
                                                        {st.desc}
                                                    </span>
                                                </button>
                                            ))}
                                        </div>
                                    </div>

                                    {/* Spacing / Margins Selection */}
                                    <div>
                                        <label className="block text-xs font-bold text-gray-500 uppercase tracking-wider mb-3">
                                            Márgenes y Espaciado Vertical
                                        </label>
                                        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                                            {[
                                                { id: 'tight', label: 'Mínimo (Ahorro de Espacio)', desc: 'Márgenes reducidos al mínimo para mostrar más catálogo.' },
                                                { id: 'normal', label: 'Equilibrado', desc: 'Espaciado armónico y legible.' },
                                                { id: 'spacious', label: 'Amplio', desc: 'Márgenes generosos para estilo boutique.' }
                                            ].map(sp => (
                                                <button
                                                    key={sp.id}
                                                    type="button"
                                                    onClick={() => setStoreConfig({ ...storeConfig, headerSpacing: sp.id as any })}
                                                    className={`p-3.5 rounded-2xl border-2 text-left transition-all ${
                                                        storeConfig.headerSpacing === sp.id
                                                            ? 'border-rotary-blue bg-sky-50/50 shadow-xs'
                                                            : 'border-gray-100 hover:border-gray-200 bg-white'
                                                    }`}
                                                >
                                                    <span className={`text-xs font-black block mb-1 ${storeConfig.headerSpacing === sp.id ? 'text-rotary-blue' : 'text-gray-900'}`}>
                                                        {sp.label}
                                                    </span>
                                                    <span className="text-[11px] text-gray-500 leading-snug block">
                                                        {sp.desc}
                                                    </span>
                                                </button>
                                            ))}
                                        </div>
                                    </div>

                                    {/* Badge Customization */}
                                    <div className="p-4 bg-gray-50 rounded-2xl border border-gray-100 space-y-3">
                                        <div className="flex items-center justify-between">
                                            <div>
                                                <span className="font-bold text-xs text-gray-900 block">Mostrar Insignia Superior</span>
                                                <span className="text-[11px] text-gray-500">Ejemplo: "Tienda Oficial • Rotary E-Club Origen"</span>
                                            </div>
                                            <input
                                                type="checkbox"
                                                checked={storeConfig.showBadge}
                                                onChange={e => setStoreConfig({ ...storeConfig, showBadge: e.target.checked })}
                                                className="w-4 h-4 rounded text-rotary-blue accent-rotary-blue"
                                            />
                                        </div>
                                        {storeConfig.showBadge && (
                                            <div>
                                                <label className="block text-[11px] font-bold text-gray-500 uppercase tracking-wider mb-1">Texto de la Insignia</label>
                                                <input
                                                    type="text"
                                                    value={storeConfig.badgeText}
                                                    onChange={e => setStoreConfig({ ...storeConfig, badgeText: e.target.value })}
                                                    placeholder="Tienda Oficial"
                                                    className="w-full px-3 py-2 bg-white border border-gray-200 rounded-xl text-xs outline-none focus:border-rotary-blue font-medium"
                                                />
                                            </div>
                                        )}
                                    </div>

                                    {/* Title and Subtitle Inputs */}
                                    <div className="grid grid-cols-1 gap-4">
                                        <div>
                                            <label className="block text-xs font-bold text-gray-500 uppercase tracking-wider mb-1">
                                                Título Principal de la Tienda
                                            </label>
                                            <input
                                                type="text"
                                                value={storeConfig.heroTitle}
                                                onChange={e => setStoreConfig({ ...storeConfig, heroTitle: e.target.value })}
                                                placeholder="Productos, Artículos y Mercancía"
                                                className="w-full px-4 py-2.5 bg-gray-50 border-2 border-transparent focus:border-rotary-blue/30 focus:bg-white rounded-xl text-sm outline-none font-medium"
                                            />
                                        </div>
                                        <div>
                                            <label className="block text-xs font-bold text-gray-500 uppercase tracking-wider mb-1">
                                                Subtítulo o Mensaje de Impacto Social
                                            </label>
                                            <textarea
                                                rows={2}
                                                value={storeConfig.heroSubtitle}
                                                onChange={e => setStoreConfig({ ...storeConfig, heroSubtitle: e.target.value })}
                                                placeholder="Artículos con identidad Rotaria para miembros, amigos y comunidad..."
                                                className="w-full p-3 bg-gray-50 border-2 border-transparent focus:border-rotary-blue/30 focus:bg-white rounded-xl text-xs outline-none font-medium"
                                            />
                                        </div>
                                    </div>

                                    {/* Live Header Preview Box */}
                                    <div>
                                        <label className="block text-xs font-bold text-gray-500 uppercase tracking-wider mb-2">
                                            Vista Previa en Vivo
                                        </label>
                                        <div className="p-6 bg-gradient-to-b from-gray-50 to-white rounded-2xl border border-gray-200">
                                            {storeConfig.headerStyle === 'compact' ? (
                                                <div className="flex flex-col md:flex-row md:items-end justify-between gap-3 pb-4 border-b border-gray-200/70">
                                                    <div>
                                                        {storeConfig.showBadge && (
                                                            <div className="inline-flex items-center gap-1.5 py-0.5 px-2.5 rounded-full bg-sky-50 text-rotary-blue font-bold text-[10px] uppercase mb-1.5 border border-sky-100">
                                                                <Sparkles className="w-2.5 h-2.5" />
                                                                {storeConfig.badgeText || 'Tienda Oficial'}
                                                            </div>
                                                        )}
                                                        <h4 className="text-xl font-black text-gray-900 tracking-tight">
                                                            {storeConfig.heroTitle || 'Productos, Artículos y Mercancía'}
                                                        </h4>
                                                    </div>
                                                    {storeConfig.heroSubtitle && (
                                                        <p className="text-[11px] text-gray-500 max-w-sm md:text-right">
                                                            {storeConfig.heroSubtitle}
                                                        </p>
                                                    )}
                                                </div>
                                            ) : (
                                                <div className="text-center py-2">
                                                    {storeConfig.showBadge && (
                                                        <div className="inline-flex items-center gap-1.5 py-0.5 px-3 rounded-full bg-rotary-blue/10 text-rotary-blue font-bold text-[10px] uppercase mb-2">
                                                            <Sparkles className="w-3 h-3" />
                                                            {storeConfig.badgeText || 'Tienda Oficial'}
                                                        </div>
                                                    )}
                                                    <h4 className="text-2xl font-black text-gray-900 tracking-tight mb-2">
                                                        {storeConfig.heroTitle || 'Productos, Artículos y Mercancía'}
                                                    </h4>
                                                    {storeConfig.heroSubtitle && (
                                                        <p className="text-xs text-gray-600 max-w-lg mx-auto">
                                                            {storeConfig.heroSubtitle}
                                                        </p>
                                                    )}
                                                </div>
                                            )}
                                        </div>
                                    </div>
                                </div>
                            )}
                        </div>

                        {/* Section 2: Payments & Bank Transfer */}
                        <div className="bg-white rounded-3xl p-8 border border-gray-100 shadow-sm space-y-6">
                            <div>
                                <h3 className="text-xl font-black text-gray-900">Configuración de Pasarela y Pagos</h3>
                                <p className="text-xs text-gray-500 mt-1">Configura las instrucciones de transferencia bancaria local para este club.</p>
                            </div>

                            <div>
                                <label className="block text-xs font-bold text-gray-500 uppercase tracking-wider mb-2">
                                    Instrucciones para Pago por Transferencia / Consignación
                                </label>
                                <textarea
                                    rows={5}
                                    value={bankInstructions}
                                    onChange={e => setBankInstructions(e.target.value)}
                                    placeholder="Ej: Bancolombia Cuenta de Ahorros #123-456789-00 a nombre de Rotary Club... Enviar comprobante a tesoreria@club.org"
                                    className="w-full p-4 bg-gray-50 border-2 border-transparent rounded-2xl focus:border-rotary-blue/30 focus:bg-white transition-all outline-none font-medium text-sm text-gray-800"
                                />
                                <p className="text-xs text-gray-400 mt-2">
                                    Estas instrucciones se mostrarán al comprador en pantalla al seleccionar "Transferencia Bancaria Directa" y en el correo de confirmación.
                                </p>
                            </div>
                        </div>

                        {/* Bottom Actions */}
                        <div className="flex items-center gap-4">
                            <button
                                onClick={handleSaveSettings}
                                disabled={savingSettings}
                                className="px-8 py-3.5 bg-rotary-blue text-white rounded-2xl font-bold text-sm hover:bg-sky-800 transition-colors shadow-md shadow-rotary-blue/20 disabled:opacity-50"
                            >
                                {savingSettings ? 'Guardando...' : 'Guardar Toda la Configuración'}
                            </button>
                            <a
                                href="/tienda"
                                target="_blank"
                                rel="noreferrer"
                                className="px-5 py-3.5 bg-white border border-gray-200 text-gray-700 hover:bg-gray-50 rounded-2xl font-bold text-sm flex items-center gap-2 transition-colors"
                            >
                                <ExternalLink className="w-4 h-4" /> Ver Tienda
                            </a>
                        </div>
                    </div>
                )}

                {/* MODALS */}

                {/* 1. PRODUCT MODAL */}
                {isProductModalOpen && (
                    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm animate-in fade-in duration-200">
                        <div className="bg-white rounded-3xl max-w-2xl w-full max-h-[90vh] overflow-y-auto p-8 shadow-2xl relative">
                            <button
                                onClick={() => setIsProductModalOpen(false)}
                                className="absolute top-6 right-6 p-2 rounded-full hover:bg-gray-100 text-gray-400"
                            >
                                <X className="w-5 h-5" />
                            </button>

                            <h2 className="text-2xl font-black text-gray-900 mb-6">
                                {editingProduct ? 'Editar Producto' : 'Nuevo Producto'}
                            </h2>

                            <form onSubmit={handleProductSubmit} className="space-y-6">
                                <div>
                                    <label className="block text-xs font-bold text-gray-500 uppercase tracking-wider mb-2">Nombre del Producto *</label>
                                    <input
                                        type="text"
                                        required
                                        value={formData.name}
                                        onChange={e => setFormData({ ...formData, name: e.target.value })}
                                        className="w-full px-4 py-3 bg-gray-50 border-2 border-transparent rounded-xl focus:border-rotary-blue/30 focus:bg-white text-sm outline-none font-medium"
                                    />
                                </div>

                                <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                                    <div>
                                        <label className="block text-xs font-bold text-gray-500 uppercase tracking-wider mb-2">Precio de Venta ($) *</label>
                                        <input
                                            type="number"
                                            required
                                            value={formData.price}
                                            onChange={e => setFormData({ ...formData, price: parseFloat(e.target.value) || 0 })}
                                            className="w-full px-4 py-3 bg-gray-50 border-2 border-transparent rounded-xl focus:border-rotary-blue/30 focus:bg-white text-sm outline-none font-medium"
                                        />
                                    </div>
                                    <div>
                                        <label className="block text-xs font-bold text-gray-500 uppercase tracking-wider mb-2">Precio Comparativo ($)</label>
                                        <input
                                            type="number"
                                            value={formData.compareAtPrice}
                                            onChange={e => setFormData({ ...formData, compareAtPrice: e.target.value })}
                                            placeholder="Tachado"
                                            className="w-full px-4 py-3 bg-gray-50 border-2 border-transparent rounded-xl focus:border-rotary-blue/30 focus:bg-white text-sm outline-none font-medium"
                                        />
                                    </div>
                                    <div>
                                        <label className="block text-xs font-bold text-gray-500 uppercase tracking-wider mb-2">Inventario (Stock) *</label>
                                        <input
                                            type="number"
                                            required
                                            value={formData.stock}
                                            onChange={e => setFormData({ ...formData, stock: parseInt(e.target.value, 10) || 0 })}
                                            className="w-full px-4 py-3 bg-gray-50 border-2 border-transparent rounded-xl focus:border-rotary-blue/30 focus:bg-white text-sm outline-none font-medium"
                                        />
                                    </div>
                                </div>

                                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                                    <div>
                                        <label className="block text-xs font-bold text-gray-500 uppercase tracking-wider mb-2">Categoría</label>
                                        <select
                                            value={formData.categoryId}
                                            onChange={e => setFormData({ ...formData, categoryId: e.target.value })}
                                            className="w-full px-4 py-3 bg-gray-50 border-2 border-transparent rounded-xl focus:border-rotary-blue/30 focus:bg-white text-sm outline-none font-medium"
                                        >
                                            <option value="">Ninguna</option>
                                            {categories.map(c => (
                                                <option key={c.id} value={c.id}>{c.name}</option>
                                            ))}
                                        </select>
                                    </div>
                                    <div>
                                        <label className="block text-xs font-bold text-gray-500 uppercase tracking-wider mb-2">SKU / Código</label>
                                        <input
                                            type="text"
                                            value={formData.sku}
                                            onChange={e => setFormData({ ...formData, sku: e.target.value })}
                                            placeholder="Ej. CAM-AZUL-01"
                                            className="w-full px-4 py-3 bg-gray-50 border-2 border-transparent rounded-xl focus:border-rotary-blue/30 focus:bg-white text-sm outline-none font-medium"
                                        />
                                    </div>
                                </div>

                                <div>
                                    <label className="block text-xs font-bold text-gray-500 uppercase tracking-wider mb-2">Descripción</label>
                                    <textarea
                                        rows={4}
                                        value={formData.description}
                                        onChange={e => setFormData({ ...formData, description: e.target.value })}
                                        className="w-full px-4 py-3 bg-gray-50 border-2 border-transparent rounded-xl focus:border-rotary-blue/30 focus:bg-white text-sm outline-none font-medium"
                                    />
                                </div>

                                {/* Images Upload */}
                                <div>
                                    <label className="block text-xs font-bold text-gray-500 uppercase tracking-wider mb-2">Galería de Imágenes</label>
                                    <div className="grid grid-cols-4 gap-3 mb-3">
                                        {formData.images.map((img, idx) => (
                                            <div key={idx} className="aspect-square bg-gray-50 rounded-xl overflow-hidden relative border border-gray-100 group">
                                                <img src={img} alt="Thumb" className="w-full h-full object-cover" />
                                                <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center gap-1">
                                                    {idx !== 0 && (
                                                        <button
                                                            type="button"
                                                            onClick={() => handleSetCoverImage(idx)}
                                                            className="p-1 bg-white rounded text-gray-800 hover:text-rotary-blue"
                                                            title="Hacer portada"
                                                        >
                                                            <Star className="w-3.5 h-3.5" />
                                                        </button>
                                                    )}
                                                    <button
                                                        type="button"
                                                        onClick={() => handleRemoveImage(idx)}
                                                        className="p-1 bg-white rounded text-red-600 hover:bg-red-50"
                                                        title="Eliminar"
                                                    >
                                                        <Trash2 className="w-3.5 h-3.5" />
                                                    </button>
                                                </div>
                                                {idx === 0 && (
                                                    <span className="absolute bottom-1 left-1 bg-rotary-blue text-white text-[9px] font-bold px-1.5 py-0.5 rounded">
                                                        Portada
                                                    </span>
                                                )}
                                            </div>
                                        ))}

                                        <label className="aspect-square rounded-xl border-2 border-dashed border-gray-200 hover:border-rotary-blue flex flex-col items-center justify-center cursor-pointer transition-colors bg-gray-50/50">
                                            <Upload className="w-5 h-5 text-gray-400 mb-1" />
                                            <span className="text-[10px] font-bold text-gray-500">{uploading ? 'Subiendo...' : 'Subir'}</span>
                                            <input type="file" multiple accept="image/*" onChange={handleImageUpload} className="hidden" disabled={uploading} />
                                        </label>
                                    </div>
                                </div>

                                <div className="space-y-3 pt-4 border-t border-gray-100">
                                    <div className={`p-4 rounded-2xl border transition-all ${formData.published ? 'bg-sky-50/70 border-sky-200' : 'bg-gray-50 border-gray-200'}`}>
                                        <label className="flex items-start gap-3 cursor-pointer">
                                            <input
                                                type="checkbox"
                                                checked={formData.published}
                                                onChange={e => setFormData({ ...formData, published: e.target.checked })}
                                                className="w-5 h-5 rounded text-rotary-blue mt-0.5 accent-rotary-blue"
                                            />
                                            <div>
                                                <span className="font-bold text-sm text-gray-900 block">
                                                    {formData.published ? 'Habilitado y Publicado en Tienda' : 'Guardar como Borrador (Oculto)'}
                                                </span>
                                                <span className="text-xs text-gray-500">
                                                    {formData.published
                                                        ? 'El producto aparecerá inmediatamente visible y disponible para la compra en la tienda virtual.'
                                                        : 'El producto no será visible para los compradores en la tienda virtual hasta que se publique.'}
                                                </span>
                                            </div>
                                        </label>
                                    </div>

                                    <label className="flex items-center gap-2 cursor-pointer text-sm font-bold text-gray-700 px-2">
                                        <input
                                            type="checkbox"
                                            checked={formData.featured}
                                            onChange={e => setFormData({ ...formData, featured: e.target.checked })}
                                            className="w-4 h-4 rounded text-rotary-blue accent-rotary-blue"
                                        />
                                        <span>Marcar como Producto Destacado</span>
                                    </label>
                                </div>

                                <div className="flex justify-end gap-3 pt-6 border-t border-gray-100">
                                    <button
                                        type="button"
                                        onClick={() => setIsProductModalOpen(false)}
                                        className="px-6 py-3 rounded-xl border border-gray-200 text-gray-600 font-bold text-sm hover:bg-gray-50"
                                    >
                                        Cancelar
                                    </button>
                                    <button
                                        type="submit"
                                        disabled={isSubmitting}
                                        className="px-6 py-3 bg-rotary-blue text-white rounded-xl font-bold text-sm hover:bg-sky-800 transition-colors shadow-lg shadow-rotary-blue/20 disabled:opacity-50"
                                    >
                                        {isSubmitting ? 'Guardando...' : editingProduct ? 'Actualizar Producto' : 'Crear Producto'}
                                    </button>
                                </div>
                            </form>
                        </div>
                    </div>
                )}

                {/* 2. CATEGORY MODAL */}
                {isCategoryModalOpen && (
                    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm animate-in fade-in duration-200">
                        <div className="bg-white rounded-3xl max-w-md w-full p-8 shadow-2xl relative">
                            <button
                                onClick={() => setIsCategoryModalOpen(false)}
                                className="absolute top-6 right-6 p-2 rounded-full hover:bg-gray-100 text-gray-400"
                            >
                                <X className="w-5 h-5" />
                            </button>

                            <h2 className="text-xl font-black text-gray-900 mb-6">
                                {editingCategory ? 'Editar Categoría' : 'Nueva Categoría'}
                            </h2>

                            <form onSubmit={handleCategorySubmit} className="space-y-4">
                                <div>
                                    <label className="block text-xs font-bold text-gray-500 uppercase tracking-wider mb-2">Nombre *</label>
                                    <input
                                        type="text"
                                        required
                                        value={categoryFormData.name}
                                        onChange={e => setCategoryFormData({ ...categoryFormData, name: e.target.value })}
                                        placeholder="Ej. Pines Rotarios, Camisetas..."
                                        className="w-full px-4 py-3 bg-gray-50 border-2 border-transparent rounded-xl focus:border-rotary-blue/30 focus:bg-white text-sm outline-none font-medium"
                                    />
                                </div>
                                <div>
                                    <label className="block text-xs font-bold text-gray-500 uppercase tracking-wider mb-2">Descripción (opcional)</label>
                                    <textarea
                                        rows={3}
                                        value={categoryFormData.description}
                                        onChange={e => setCategoryFormData({ ...categoryFormData, description: e.target.value })}
                                        className="w-full px-4 py-3 bg-gray-50 border-2 border-transparent rounded-xl focus:border-rotary-blue/30 focus:bg-white text-sm outline-none font-medium"
                                    />
                                </div>

                                <div className="flex justify-end gap-3 pt-6 border-t border-gray-100">
                                    <button
                                        type="button"
                                        onClick={() => setIsCategoryModalOpen(false)}
                                        className="px-5 py-2.5 rounded-xl border border-gray-200 text-gray-600 font-bold text-sm"
                                    >
                                        Cancelar
                                    </button>
                                    <button
                                        type="submit"
                                        className="px-5 py-2.5 bg-rotary-blue text-white rounded-xl font-bold text-sm hover:bg-sky-800"
                                    >
                                        Guardar
                                    </button>
                                </div>
                            </form>
                        </div>
                    </div>
                )}

                {/* 3. INVENTORY ADJUST MODAL */}
                {isStockModalOpen && adjustingProduct && (
                    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm animate-in fade-in duration-200">
                        <div className="bg-white rounded-3xl max-w-md w-full p-8 shadow-2xl relative">
                            <button
                                onClick={() => setIsStockModalOpen(false)}
                                className="absolute top-6 right-6 p-2 rounded-full hover:bg-gray-100 text-gray-400"
                            >
                                <X className="w-5 h-5" />
                            </button>

                            <h2 className="text-xl font-black text-gray-900 mb-1">Ajuste de Stock</h2>
                            <p className="text-xs text-gray-500 mb-6">{adjustingProduct.name} · Stock actual: {adjustingProduct.stock}</p>

                            <form onSubmit={handleStockSubmit} className="space-y-4">
                                <div>
                                    <label className="block text-xs font-bold text-gray-500 uppercase tracking-wider mb-2">Tipo de Operación</label>
                                    <select
                                        value={adjustType}
                                        onChange={e => setAdjustType(e.target.value as any)}
                                        className="w-full px-4 py-3 bg-gray-50 border-2 border-transparent rounded-xl focus:border-rotary-blue/30 focus:bg-white text-sm outline-none font-medium"
                                    >
                                        <option value="inflow">Entrada de Mercancía (+)</option>
                                        <option value="loss">Merma / Pérdida / Daño (-)</option>
                                        <option value="set">Fijar Valor Exacto (=)</option>
                                    </select>
                                </div>

                                <div>
                                    <label className="block text-xs font-bold text-gray-500 uppercase tracking-wider mb-2">Cantidad de Unidades</label>
                                    <input
                                        type="number"
                                        min="1"
                                        required
                                        value={adjustQuantity}
                                        onChange={e => setAdjustQuantity(parseInt(e.target.value, 10) || 1)}
                                        className="w-full px-4 py-3 bg-gray-50 border-2 border-transparent rounded-xl focus:border-rotary-blue/30 focus:bg-white text-sm outline-none font-medium"
                                    />
                                </div>

                                <div>
                                    <label className="block text-xs font-bold text-gray-500 uppercase tracking-wider mb-2">Motivo / Justificación</label>
                                    <input
                                        type="text"
                                        required
                                        placeholder="Ej. Recepción de lote #42, Conteo físico..."
                                        value={adjustReason}
                                        onChange={e => setAdjustReason(e.target.value)}
                                        className="w-full px-4 py-3 bg-gray-50 border-2 border-transparent rounded-xl focus:border-rotary-blue/30 focus:bg-white text-sm outline-none font-medium"
                                    />
                                </div>

                                <div className="flex justify-end gap-3 pt-6 border-t border-gray-100">
                                    <button
                                        type="button"
                                        onClick={() => setIsStockModalOpen(false)}
                                        className="px-5 py-2.5 rounded-xl border border-gray-200 text-gray-600 font-bold text-sm"
                                    >
                                        Cancelar
                                    </button>
                                    <button
                                        type="submit"
                                        className="px-5 py-2.5 bg-rotary-blue text-white rounded-xl font-bold text-sm hover:bg-sky-800"
                                    >
                                        Confirmar Ajuste
                                    </button>
                                </div>
                            </form>
                        </div>
                    </div>
                )}

                {/* 4. ORDER DETAIL MODAL */}
                {selectedOrder && (
                    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm animate-in fade-in duration-200">
                        <div className="bg-white rounded-3xl max-w-2xl w-full max-h-[90vh] overflow-y-auto p-8 shadow-2xl relative">
                            <button
                                onClick={() => setSelectedOrder(null)}
                                className="absolute top-6 right-6 p-2 rounded-full hover:bg-gray-100 text-gray-400"
                            >
                                <X className="w-5 h-5" />
                            </button>

                            <div className="mb-6">
                                <span className="text-xs font-mono font-bold text-gray-400 uppercase tracking-widest block mb-1">
                                    Detalle del Pedido
                                </span>
                                <h2 className="text-2xl font-black text-gray-900 font-mono">
                                    #{selectedOrder.orderNumber || selectedOrder.id.slice(-6).toUpperCase()}
                                </h2>
                                <p className="text-xs text-gray-400 mt-1">
                                    Cliente: <strong>{selectedOrder.customerName}</strong> ({selectedOrder.customerEmail})
                                </p>
                            </div>

                            {/* Items List */}
                            <div className="divide-y divide-gray-100 mb-6">
                                {selectedOrder.items?.map(i => (
                                    <div key={i.id} className="py-3 flex justify-between items-center text-sm">
                                        <div>
                                            <p className="font-bold text-gray-900">{i.title}</p>
                                            <p className="text-xs text-gray-400">{i.qty} un. × ${i.unitPrice.toLocaleString()}</p>
                                        </div>
                                        <span className="font-black text-gray-900">${i.total.toLocaleString()}</span>
                                    </div>
                                ))}
                            </div>

                            {/* Tracking Number Input */}
                            <div className="bg-gray-50 rounded-2xl p-4 mb-6">
                                <label className="block text-xs font-bold text-gray-500 uppercase tracking-wider mb-2">
                                    Guía de Transporte / Envío
                                </label>
                                <div className="flex gap-2">
                                    <input
                                        type="text"
                                        placeholder="Ej. Servientrega 123456789"
                                        value={orderTrackingInput}
                                        onChange={e => setOrderTrackingInput(e.target.value)}
                                        className="flex-1 px-4 py-2 bg-white rounded-xl border border-gray-200 text-sm font-medium outline-none"
                                    />
                                    <button
                                        onClick={() => handleUpdateOrderStatus(selectedOrder.id, selectedOrder.status, selectedOrder.shippingStatus)}
                                        className="px-4 py-2 bg-gray-900 text-white font-bold rounded-xl text-xs hover:bg-black"
                                    >
                                        Guardar Guía
                                    </button>
                                </div>
                            </div>

                            {/* Action Buttons for Order Status */}
                            <div className="flex flex-wrap gap-2 pt-4 border-t border-gray-100">
                                {selectedOrder.status !== 'paid' && (
                                    <button
                                        onClick={() => handleUpdateOrderStatus(selectedOrder.id, 'paid')}
                                        className="px-4 py-2.5 bg-emerald-600 text-white rounded-xl font-bold text-xs hover:bg-emerald-700"
                                    >
                                        Marcar como Pagado
                                    </button>
                                )}
                                <button
                                    onClick={() => handleUpdateOrderStatus(selectedOrder.id, selectedOrder.status, 'shipped')}
                                    className="px-4 py-2.5 bg-sky-600 text-white rounded-xl font-bold text-xs hover:bg-sky-700"
                                >
                                    Marcar como Enviado
                                </button>
                                <button
                                    onClick={() => handleUpdateOrderStatus(selectedOrder.id, selectedOrder.status, 'delivered')}
                                    className="px-4 py-2.5 bg-gray-800 text-white rounded-xl font-bold text-xs hover:bg-black"
                                >
                                    Marcar como Entregado
                                </button>
                                {selectedOrder.status !== 'cancelled' && (
                                    <button
                                        onClick={() => handleUpdateOrderStatus(selectedOrder.id, 'cancelled')}
                                        className="px-4 py-2.5 bg-red-50 text-red-600 rounded-xl font-bold text-xs hover:bg-red-100 ml-auto"
                                    >
                                        Cancelar Pedido
                                    </button>
                                )}
                            </div>
                        </div>
                    </div>
                )}

                {/* 5. SHIPPING METHOD MODAL */}
                {isShippingModalOpen && (
                    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm animate-in fade-in duration-200">
                        <div className="bg-white rounded-3xl max-w-md w-full p-8 shadow-2xl relative">
                            <button
                                onClick={() => setIsShippingModalOpen(false)}
                                className="absolute top-6 right-6 p-2 rounded-full hover:bg-gray-100 text-gray-400"
                            >
                                <X className="w-5 h-5" />
                            </button>

                            <h2 className="text-xl font-black text-gray-900 mb-6">Método de Envío</h2>

                            <form onSubmit={handleSaveShippingMethod} className="space-y-4">
                                <div>
                                    <label className="block text-xs font-bold text-gray-500 uppercase tracking-wider mb-2">Nombre *</label>
                                    <input
                                        type="text"
                                        required
                                        value={shippingForm.name}
                                        onChange={e => setShippingForm({ ...shippingForm, name: e.target.value })}
                                        placeholder="Ej. Envío Nacional Estándar"
                                        className="w-full px-4 py-3 bg-gray-50 border-2 border-transparent rounded-xl focus:border-rotary-blue/30 focus:bg-white text-sm outline-none font-medium"
                                    />
                                </div>
                                <div className="grid grid-cols-2 gap-4">
                                    <div>
                                        <label className="block text-xs font-bold text-gray-500 uppercase tracking-wider mb-2">Costo ($) *</label>
                                        <input
                                            type="number"
                                            required
                                            value={shippingForm.price}
                                            onChange={e => setShippingForm({ ...shippingForm, price: parseFloat(e.target.value) || 0 })}
                                            className="w-full px-4 py-3 bg-gray-50 border-2 border-transparent rounded-xl focus:border-rotary-blue/30 focus:bg-white text-sm outline-none font-medium"
                                        />
                                    </div>
                                    <div>
                                        <label className="block text-xs font-bold text-gray-500 uppercase tracking-wider mb-2">Gratis desde ($)</label>
                                        <input
                                            type="number"
                                            value={shippingForm.minOrderFree}
                                            onChange={e => setShippingForm({ ...shippingForm, minOrderFree: parseFloat(e.target.value) || 0 })}
                                            className="w-full px-4 py-3 bg-gray-50 border-2 border-transparent rounded-xl focus:border-rotary-blue/30 focus:bg-white text-sm outline-none font-medium"
                                        />
                                    </div>
                                </div>

                                <div className="flex justify-end gap-3 pt-6 border-t border-gray-100">
                                    <button
                                        type="button"
                                        onClick={() => setIsShippingModalOpen(false)}
                                        className="px-5 py-2.5 rounded-xl border border-gray-200 text-gray-600 font-bold text-sm"
                                    >
                                        Cancelar
                                    </button>
                                    <button
                                        type="submit"
                                        className="px-5 py-2.5 bg-rotary-blue text-white rounded-xl font-bold text-sm hover:bg-sky-800"
                                    >
                                        Guardar
                                    </button>
                                </div>
                            </form>
                        </div>
                    </div>
                )}

                {/* 6. COUPON MODAL */}
                {isCouponModalOpen && (
                    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm animate-in fade-in duration-200">
                        <div className="bg-white rounded-3xl max-w-md w-full p-8 shadow-2xl relative">
                            <button
                                onClick={() => setIsCouponModalOpen(false)}
                                className="absolute top-6 right-6 p-2 rounded-full hover:bg-gray-100 text-gray-400"
                            >
                                <X className="w-5 h-5" />
                            </button>

                            <h2 className="text-xl font-black text-gray-900 mb-6">Nuevo Cupón de Descuento</h2>

                            <form onSubmit={handleSaveCoupon} className="space-y-4">
                                <div>
                                    <label className="block text-xs font-bold text-gray-500 uppercase tracking-wider mb-2">Código del Cupón *</label>
                                    <input
                                        type="text"
                                        required
                                        value={couponForm.code}
                                        onChange={e => setCouponForm({ ...couponForm, code: e.target.value.toUpperCase() })}
                                        placeholder="Ej. ROTARY2026"
                                        className="w-full px-4 py-3 bg-gray-50 border-2 border-transparent rounded-xl focus:border-rotary-blue/30 focus:bg-white text-sm outline-none font-bold uppercase"
                                    />
                                </div>

                                <div className="grid grid-cols-2 gap-4">
                                    <div>
                                        <label className="block text-xs font-bold text-gray-500 uppercase tracking-wider mb-2">Tipo</label>
                                        <select
                                            value={couponForm.discountType}
                                            onChange={e => setCouponForm({ ...couponForm, discountType: e.target.value })}
                                            className="w-full px-4 py-3 bg-gray-50 border-2 border-transparent rounded-xl focus:border-rotary-blue/30 focus:bg-white text-sm outline-none font-medium"
                                        >
                                            <option value="percent">Porcentaje (%)</option>
                                            <option value="fixed">Monto Fijo ($)</option>
                                        </select>
                                    </div>
                                    <div>
                                        <label className="block text-xs font-bold text-gray-500 uppercase tracking-wider mb-2">Valor *</label>
                                        <input
                                            type="number"
                                            required
                                            value={couponForm.discountValue}
                                            onChange={e => setCouponForm({ ...couponForm, discountValue: parseFloat(e.target.value) || 0 })}
                                            className="w-full px-4 py-3 bg-gray-50 border-2 border-transparent rounded-xl focus:border-rotary-blue/30 focus:bg-white text-sm outline-none font-medium"
                                        />
                                    </div>
                                </div>

                                <div>
                                    <label className="block text-xs font-bold text-gray-500 uppercase tracking-wider mb-2">Mínimo de Compra ($)</label>
                                    <input
                                        type="number"
                                        value={couponForm.minOrderAmount}
                                        onChange={e => setCouponForm({ ...couponForm, minOrderAmount: parseFloat(e.target.value) || 0 })}
                                        className="w-full px-4 py-3 bg-gray-50 border-2 border-transparent rounded-xl focus:border-rotary-blue/30 focus:bg-white text-sm outline-none font-medium"
                                    />
                                </div>

                                <div className="flex justify-end gap-3 pt-6 border-t border-gray-100">
                                    <button
                                        type="button"
                                        onClick={() => setIsCouponModalOpen(false)}
                                        className="px-5 py-2.5 rounded-xl border border-gray-200 text-gray-600 font-bold text-sm"
                                    >
                                        Cancelar
                                    </button>
                                    <button
                                        type="submit"
                                        className="px-5 py-2.5 bg-rotary-blue text-white rounded-xl font-bold text-sm hover:bg-sky-800"
                                    >
                                        Crear Cupón
                                    </button>
                                </div>
                            </form>
                        </div>
                    </div>
                )}
            </div>
        </AdminLayout>
    );
}
