import { useState, useEffect } from 'react';
import AdminLayout from '../../components/admin/AdminLayout';
import { Package, Plus, Search, X, Edit2, Trash2, Upload } from 'lucide-react';
import axios from 'axios';
import { useAuth } from '../../hooks/useAuth';
import { toast } from 'sonner';

interface Product {
    id: string;
    name: string;
    slug: string;
    description: string;
    type: string;
    price: number;
    currency: string;
    stock: number;
    sku: string;
    images: string[];
    published: boolean;
    categoryId?: string;
    category?: { name: string };
}

export default function StoreManagement() {
    const { token, user } = useAuth();
    const [products, setProducts] = useState<Product[]>([]);
    const [categories, setCategories] = useState<any[]>([]);
    const [isLoading, setIsLoading] = useState(true);
    const [searchQuery, setSearchQuery] = useState('');

    const [isModalOpen, setIsModalOpen] = useState(false);
    const [editingProduct, setEditingProduct] = useState<Product | null>(null);
    const [uploading, setUploading] = useState(false);
    const [isSubmitting, setIsSubmitting] = useState(false);

    const [formData, setFormData] = useState({
        name: '', slug: '', description: '', type: 'physical',
        price: 0, currency: 'COP', stock: 0, sku: '', images: [] as string[],
        published: true, categoryId: ''
    });

    const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:5001/api';

    useEffect(() => {
        if (token) {
            fetchProducts();
            fetchCategories();
        }
    }, [token]);

    const fetchProducts = async () => {
        setIsLoading(true);
        try {
            const res = await axios.get(`${API_URL}/products`, { headers: { Authorization: `Bearer ${token}` } });
            setProducts(res.data);
        } catch (error) {
            console.error(error);
            toast.error('Error cargando productos');
        } finally {
            setIsLoading(false);
        }
    };

    const fetchCategories = async () => {
        try {
            const res = await axios.get(`${API_URL}/products/categories`, { headers: { Authorization: `Bearer ${token}` } });
            setCategories(res.data);
        } catch (error) {
            console.error(error);
        }
    };

    const handleOpenModal = (prod?: Product) => {
        if (prod) {
            setEditingProduct(prod);
            setFormData({
                name: prod.name, slug: prod.slug, description: prod.description || '', type: prod.type,
                price: prod.price, currency: prod.currency, stock: prod.stock, sku: prod.sku || '',
                images: prod.images || [], published: prod.published, categoryId: prod.categoryId || ''
            });
        } else {
            setEditingProduct(null);
            setFormData({
                name: '', slug: '', description: '', type: 'physical',
                price: 0, currency: 'COP', stock: 0, sku: '', images: [],
                published: true, categoryId: ''
            });
        }
        setIsModalOpen(true);
    };

    const handleImageUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
        const files = e.target.files;
        if (!files || files.length === 0) return;

        setUploading(true);
        try {
            for (let i = 0; i < files.length; i++) {
                const uploadData = new FormData();
                uploadData.append('file', files[i]);
                uploadData.append('folder', 'store');

                const targetUrl = `${API_URL}/media/upload?folder=store&clubId=${user?.club?.id || user?.clubId || ''}`.replace(/\/+/g, '/').replace(':/', '://');
                const response = await fetch(targetUrl, {
                    method: 'POST',
                    headers: { 'Authorization': `Bearer ${token}` },
                    body: uploadData
                });

                if (response.ok) {
                    const data = await response.json();
                    setFormData(prev => ({ ...prev, images: [...prev.images, data.url] }));
                }
            }
            toast.success('Imágenes subidas');
        } catch (error) {
            toast.error('Error al subir imágenes');
        } finally {
            setUploading(false);
        }
    };

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        setIsSubmitting(true);
        try {
            if (editingProduct) {
                await axios.put(`${API_URL}/products/${editingProduct.id}`, formData, { headers: { Authorization: `Bearer ${token}` } });
                toast.success('Producto actualizado');
            } else {
                await axios.post(`${API_URL}/products`, formData, { headers: { Authorization: `Bearer ${token}` } });
                toast.success('Producto creado');
            }
            setIsModalOpen(false);
            fetchProducts();
        } catch (error) {
            toast.error('Error al guardar el producto');
        } finally {
            setIsSubmitting(false);
        }
    };

    const handleDelete = async (id: string) => {
        if (!window.confirm('¿Seguro de eliminar este producto?')) return;
        try {
            await axios.delete(`${API_URL}/products/${id}`, { headers: { Authorization: `Bearer ${token}` } });
            toast.success('Producto eliminado');
            fetchProducts();
        } catch (error) {
            toast.error('Error al eliminar');
        }
    };

    const generateSlug = (name: string) => {
        return name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)+/g, '');
    };

    const filteredProducts = products.filter(p =>
        p.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
        (p.sku && p.sku.toLowerCase().includes(searchQuery.toLowerCase()))
    );

    return (
        <AdminLayout>
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-6 mb-8">
                <div className="flex items-center gap-4">
                    <div className="w-12 h-12 rounded-2xl bg-sky-100 flex items-center justify-center">
                        <Package className="w-6 h-6 text-rotary-blue" />
                    </div>
                    <div>
                        <h1 className="text-2xl font-black text-gray-900 tracking-tight">Tienda y Productos</h1>
                        <p className="text-sm text-gray-500 mt-1">
                            Gestiona el catálogo de artículos y aportes · {products.length} productos
                        </p>
                    </div>
                </div>
                <button onClick={() => handleOpenModal()} className="flex items-center gap-2 bg-rotary-blue text-white px-5 py-2.5 rounded-xl hover:bg-sky-800 transition-all font-bold shadow-xl shadow-blue-900/20 active:scale-95">
                    <Plus className="w-5 h-5" />
                    Nuevo Producto
                </button>
            </div>

            <div className="bg-white border border-gray-100 rounded-3xl p-6 shadow-sm">
                <div className="flex gap-4 mb-6">
                    <div className="flex-1 relative">
                        <Search className="w-5 h-5 text-gray-400 absolute left-4 top-1/2 -translate-y-1/2" />
                        <input
                            type="text"
                            placeholder="Buscar productos por nombre o SKU..."
                            className="w-full pl-11 pr-4 py-3 bg-gray-50 border-2 border-transparent rounded-xl focus:border-rotary-blue/30 focus:bg-white outline-none font-medium transition-all"
                            value={searchQuery}
                            onChange={(e) => setSearchQuery(e.target.value)}
                        />
                    </div>
                </div>

                {isLoading ? (
                    <div className="text-center py-12 text-gray-500 font-medium">Cargando productos...</div>
                ) : filteredProducts.length > 0 ? (
                    <table className="w-full text-left border-collapse">
                        <thead>
                            <tr className="border-b border-gray-100">
                                <th className="py-4 text-xs font-bold text-gray-400 uppercase tracking-widest pl-2">Producto</th>
                                <th className="py-4 text-xs font-bold text-gray-400 uppercase tracking-widest">SKU</th>
                                <th className="py-4 text-xs font-bold text-gray-400 uppercase tracking-widest">Precio</th>
                                <th className="py-4 text-xs font-bold text-gray-400 uppercase tracking-widest">Estado</th>
                                <th className="py-4 text-xs font-bold text-gray-400 uppercase tracking-widest text-right pr-2">Acciones</th>
                            </tr>
                        </thead>
                        <tbody>
                            {filteredProducts.map(prod => (
                                <tr key={prod.id} className="border-b border-gray-50 hover:bg-gray-50/50 transition-colors">
                                    <td className="py-4 pl-2">
                                        <div className="flex items-center gap-3">
                                            <div className="w-10 h-10 rounded-lg overflow-hidden bg-gray-100 border border-gray-200">
                                                {prod.images && prod.images.length > 0 ? (
                                                    <img src={prod.images[0]} alt={prod.name} className="w-full h-full object-cover" />
                                                ) : (
                                                    <div className="w-full h-full flex items-center justify-center"><Package className="w-5 h-5 text-gray-300" /></div>
                                                )}
                                            </div>
                                            <div>
                                                <p className="font-bold text-gray-900">{prod.name}</p>
                                                <p className="text-xs text-gray-400">{prod.category?.name || prod.type}</p>
                                            </div>
                                        </div>
                                    </td>
                                    <td className="py-4 font-mono text-sm text-gray-600">{prod.sku || '-'}</td>
                                    <td className="py-4 font-black text-gray-900">${prod.price.toLocaleString()}</td>
                                    <td className="py-4">
                                        <span className={`px-2 py-1 rounded-md text-[10px] font-bold uppercase ${prod.published ? 'bg-emerald-50 text-emerald-600' : 'bg-gray-100 text-gray-500'}`}>
                                            {prod.published ? 'Público' : 'Oculto'}
                                        </span>
                                    </td>
                                    <td className="py-4 pr-2 text-right">
                                        <button onClick={() => handleOpenModal(prod)} className="p-2 text-gray-400 hover:text-rotary-blue transition-colors rounded-lg hover:bg-sky-50"><Edit2 className="w-4 h-4" /></button>
                                        <button onClick={() => handleDelete(prod.id)} className="p-2 text-gray-400 hover:text-red-500 transition-colors rounded-lg hover:bg-red-50"><Trash2 className="w-4 h-4" /></button>
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                ) : (
                    <div className="text-center py-16 px-4">
                        <div className="w-20 h-20 bg-gray-50 rounded-full flex items-center justify-center mx-auto mb-4 border border-gray-100">
                            <Package className="w-8 h-8 text-gray-300" />
                        </div>
                        <h3 className="text-lg font-bold text-gray-900 mb-2">No se encontraron productos</h3>
                        <p className="text-gray-500 max-w-sm mx-auto mb-6">Comienza a agregar productos físicos o digitales a tu catálogo.</p>
                        <button onClick={() => handleOpenModal()} className="text-rotary-blue font-bold px-6 py-2.5 bg-sky-50 rounded-xl hover:bg-sky-100 transition-colors">
                            Crear Producto
                        </button>
                    </div>
                )}
            </div>

            {isModalOpen && (
                <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm animate-in fade-in duration-200">
                    <div className="bg-white rounded-3xl shadow-2xl w-full max-w-4xl overflow-hidden flex flex-col max-h-[92vh]">
                        <div className="px-8 py-5 border-b border-gray-100 flex justify-between items-center bg-gray-50/50">
                            <h2 className="text-xl font-bold text-gray-800">{editingProduct ? 'Editar Producto' : 'Nuevo Producto'}</h2>
                            <button onClick={() => setIsModalOpen(false)} className="p-2 hover:bg-white rounded-full text-gray-400 transition-colors shadow-sm">
                                <X className="w-6 h-6" />
                            </button>
                        </div>

                        <div className="flex-1 overflow-y-auto p-8">
                            <form id="productForm" onSubmit={handleSubmit} className="space-y-6">
                                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                                    <div className="md:col-span-2">
                                        <label className="block text-sm font-bold text-gray-700 mb-2">Nombre del Producto</label>
                                        <input type="text" required className="w-full px-4 py-3 border border-gray-200 rounded-xl focus:ring-2 focus:ring-rotary-blue/20 outline-none font-bold"
                                            value={formData.name} onChange={(e) => setFormData({ ...formData, name: e.target.value, slug: generateSlug(e.target.value) })} />
                                    </div>

                                    <div>
                                        <label className="block text-sm font-bold text-gray-700 mb-2">Precio de Venta ($)</label>
                                        <input type="number" required className="w-full px-4 py-3 border border-gray-200 rounded-xl focus:ring-2 focus:ring-rotary-blue/20 outline-none"
                                            value={formData.price} onChange={(e) => setFormData({ ...formData, price: parseFloat(e.target.value) })} />
                                    </div>

                                    <div>
                                        <label className="block text-sm font-bold text-gray-700 mb-2">Inventario (Unidades)</label>
                                        <input type="number" required className="w-full px-4 py-3 border border-gray-200 rounded-xl focus:ring-2 focus:ring-rotary-blue/20 outline-none"
                                            value={formData.stock} onChange={(e) => setFormData({ ...formData, stock: parseInt(e.target.value) })} />
                                    </div>

                                    <div>
                                        <label className="block text-sm font-bold text-gray-700 mb-2">Tipo</label>
                                        <select className="w-full px-4 py-3 border border-gray-200 rounded-xl focus:ring-2 focus:ring-rotary-blue/20 outline-none"
                                            value={formData.type} onChange={(e) => setFormData({ ...formData, type: e.target.value })}>
                                            <option value="physical">Físico (Ej. Camisetas, Pines)</option>
                                            <option value="digital">Digital</option>
                                            <option value="membership">Membresía</option>
                                            <option value="donation">Donación Especial</option>
                                        </select>
                                    </div>

                                    <div>
                                        <label className="block text-sm font-bold text-gray-700 mb-2">Categoría (Opcional)</label>
                                        <select className="w-full px-4 py-3 border border-gray-200 rounded-xl focus:ring-2 focus:ring-rotary-blue/20 outline-none"
                                            value={formData.categoryId || ''} onChange={(e) => setFormData({ ...formData, categoryId: e.target.value })}>
                                            <option value="">Ninguna</option>
                                            {categories.map(c => (
                                                <option key={c.id} value={c.id}>{c.name}</option>
                                            ))}
                                        </select>
                                    </div>

                                    <div className="md:col-span-2">
                                        <label className="block text-sm font-bold text-gray-700 mb-2">Descripción (Solo texto plano para el MVP)</label>
                                        <textarea className="w-full px-4 py-3 border border-gray-200 rounded-xl focus:ring-2 focus:ring-rotary-blue/20 outline-none h-32"
                                            value={formData.description} onChange={(e) => setFormData({ ...formData, description: e.target.value })}></textarea>
                                    </div>

                                    <div className="md:col-span-2">
                                        <label className="block text-sm font-bold text-gray-700 mb-2">Galería de Imágenes (Subir múltiples)</label>
                                        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
                                            {formData.images.map((url, idx) => (
                                                <div key={idx} className="aspect-square rounded-xl overflow-hidden border border-gray-200 relative group">
                                                    <img src={url} alt="" className="w-full h-full object-cover" />
                                                    <button type="button" onClick={() => setFormData(p => ({ ...p, images: p.images.filter((_, i) => i !== idx) }))} className="absolute top-2 right-2 p-1.5 bg-red-500 text-white rounded-full opacity-0 group-hover:opacity-100 transition-opacity"><X className="w-3 h-3" /></button>
                                                </div>
                                            ))}
                                            <div className="aspect-square rounded-xl border-2 border-dashed border-gray-200 flex flex-col items-center justify-center bg-gray-50 hover:bg-gray-100 transition-colors relative">
                                                <Upload className="w-6 h-6 text-gray-400 mb-2" />
                                                <span className="text-[10px] font-bold text-gray-400 uppercase">Añadir Foto</span>
                                                <input type="file" multiple accept=".jpg,.jpeg,.png" className="absolute inset-0 opacity-0 cursor-pointer" onChange={handleImageUpload} disabled={uploading} />
                                            </div>
                                        </div>
                                    </div>

                                    <div className="md:col-span-2 flex items-center gap-3">
                                        <input type="checkbox" id="published" checked={formData.published} onChange={(e) => setFormData({ ...formData, published: e.target.checked })} className="w-5 h-5 rounded border-gray-300 text-rotary-blue focus:ring-rotary-blue" />
                                        <label htmlFor="published" className="text-sm font-bold text-gray-700">Producto Público (Visible en la Tienda)</label>
                                    </div>
                                </div>
                            </form>
                        </div>

                        <div className="p-6 border-t border-gray-100 bg-gray-50 flex justify-end gap-3">
                            <button type="button" onClick={() => setIsModalOpen(false)} className="px-6 py-2.5 text-gray-500 font-bold hover:text-gray-700">Cancelar</button>
                            <button form="productForm" type="submit" disabled={isSubmitting || uploading} className="bg-rotary-blue text-white px-8 py-2.5 rounded-xl font-bold shadow-lg shadow-rotary-blue/20 disabled:opacity-50">
                                {isSubmitting ? 'Guardando...' : (editingProduct ? 'Guardar Cambios' : 'Crear Producto')}
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </AdminLayout>
    );
}
