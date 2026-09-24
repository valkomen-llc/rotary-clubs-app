import React, { useState, useEffect } from 'react';
import { Link, useParams } from 'react-router-dom';
import Navbar from '../sections/Navbar';
import Footer from '../sections/Footer';
import { useClub } from '../contexts/ClubContext';
import { useCart } from '../contexts/CartContext';
import axios from 'axios';
import { ShoppingCart, PackageOpen, Search, Filter, Sparkles, Tag, ChevronRight } from 'lucide-react';

interface Category {
    id: string;
    name: string;
    slug: string;
}

interface Product {
    id: string;
    name: string;
    slug: string;
    type: string;
    price: number;
    compareAtPrice?: number;
    currency: string;
    stock: number;
    images: string[];
    categoryId?: string;
    category?: { id: string; name: string; slug: string };
    isFeatured?: boolean;
}

export default function Shop() {
    const { categorySlug } = useParams<{ categorySlug?: string }>();
    const { club, isLoading: clubLoading } = useClub();
    const { addToCart, setIsDrawerOpen } = useCart();

    const [products, setProducts] = useState<Product[]>([]);
    const [categories, setCategories] = useState<Category[]>([]);
    const [selectedCategorySlug, setSelectedCategorySlug] = useState<string>(categorySlug || 'all');
    const [isLoading, setIsLoading] = useState(true);
    const [searchQuery, setSearchQuery] = useState('');

    const API_URL = import.meta.env.VITE_API_URL || '/api';

    useEffect(() => {
        if (categorySlug) {
            setSelectedCategorySlug(categorySlug);
        }
    }, [categorySlug]);

    useEffect(() => {
        if (!clubLoading && club) {
            fetchData();
        }
    }, [club, clubLoading]);

    const fetchData = async () => {
        setIsLoading(true);
        try {
            const [prodsRes, catsRes] = await Promise.all([
                axios.get(`${API_URL}/products/public`, { params: { clubId: club?.id } }),
                axios.get(`${API_URL}/products/categories`, { params: { clubId: club?.id } })
            ]);
            setProducts(prodsRes.data || []);
            setCategories(catsRes.data || []);
        } catch (error) {
            console.error('Error fetching store catalog:', error);
        } finally {
            setIsLoading(false);
        }
    };

    const handleAddToCart = (product: Product, e: React.MouseEvent) => {
        e.preventDefault();
        e.stopPropagation();

        addToCart({
            productId: product.id,
            title: product.name,
            unitPrice: product.price,
            qty: 1,
            type: product.type === 'donation' ? 'donation' : 'product',
            image: product.images?.[0]
        });

        setIsDrawerOpen(true);
    };

    // Filter by search and category
    const filteredProducts = products.filter(p => {
        const matchesSearch = p.name.toLowerCase().includes(searchQuery.toLowerCase());
        const matchesCategory =
            selectedCategorySlug === 'all' ||
            p.category?.slug === selectedCategorySlug ||
            categories.find(c => c.slug === selectedCategorySlug)?.id === p.categoryId;
        return matchesSearch && matchesCategory;
    });

    return (
        <div className="min-h-screen bg-gray-50 flex flex-col font-sans">
            <Navbar />

            <main className="flex-1 pt-32 pb-24">
                <div className="max-w-7xl mx-auto px-6">
                    {/* Hero Store Header */}
                    <div className="text-center mb-12">
                        <div className="inline-flex items-center gap-2 py-1 px-4 rounded-full bg-rotary-blue/10 text-rotary-blue font-bold tracking-widest text-xs uppercase mb-4">
                            <Sparkles className="w-3.5 h-3.5" />
                            Tienda Oficial {club?.name ? `• ${club.name}` : ''}
                        </div>
                        <h1 className="text-4xl md:text-5xl font-black text-gray-900 tracking-tight mb-4">
                            Productos, Artículos y <span className="text-rotary-blue">Mercancía</span>
                        </h1>
                        <p className="text-base sm:text-lg text-gray-600 max-w-2xl mx-auto">
                            Artículos con identidad Rotaria para miembros, amigos y comunidad. Cada compra apoya directamente nuestros proyectos de impacto social.
                        </p>
                    </div>

                    {/* Controls: Search + Categories */}
                    <div className="space-y-6 mb-12">
                        <div className="flex flex-col sm:flex-row justify-between items-center gap-4">
                            {/* Search */}
                            <div className="relative w-full sm:w-96">
                                <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400" />
                                <input
                                    type="text"
                                    placeholder="Buscar por nombre o artículo..."
                                    value={searchQuery}
                                    onChange={(e) => setSearchQuery(e.target.value)}
                                    className="w-full pl-12 pr-4 py-3 rounded-2xl border-2 border-transparent bg-white shadow-sm focus:border-rotary-blue/30 focus:shadow-md outline-none transition-all font-medium text-gray-700"
                                />
                            </div>

                            <div className="text-xs font-bold text-gray-400">
                                Mostrando {filteredProducts.length} de {products.length} productos
                            </div>
                        </div>

                        {/* Category Filter Pills */}
                        {categories.length > 0 && (
                            <div className="flex items-center gap-2 overflow-x-auto pb-2 scrollbar-none">
                                <button
                                    onClick={() => setSelectedCategorySlug('all')}
                                    className={`px-5 py-2.5 rounded-full text-xs font-bold transition-all whitespace-nowrap ${selectedCategorySlug === 'all' ? 'bg-rotary-blue text-white shadow-md shadow-rotary-blue/20' : 'bg-white text-gray-600 border border-gray-200 hover:border-gray-300'}`}
                                >
                                    Todos los Productos
                                </button>
                                {categories.map(cat => (
                                    <button
                                        key={cat.id}
                                        onClick={() => setSelectedCategorySlug(cat.slug)}
                                        className={`px-5 py-2.5 rounded-full text-xs font-bold transition-all whitespace-nowrap ${selectedCategorySlug === cat.slug ? 'bg-rotary-blue text-white shadow-md shadow-rotary-blue/20' : 'bg-white text-gray-600 border border-gray-200 hover:border-gray-300'}`}
                                    >
                                        {cat.name}
                                    </button>
                                ))}
                            </div>
                        )}
                    </div>

                    {/* Loading State */}
                    {isLoading ? (
                        <div className="flex flex-col items-center justify-center py-24">
                            <div className="w-12 h-12 border-4 border-rotary-blue/20 border-t-rotary-blue rounded-full animate-spin mb-4" />
                            <p className="text-gray-500 font-medium tracking-wide">Cargando catálogo...</p>
                        </div>
                    ) : filteredProducts.length === 0 ? (
                        <div className="bg-white rounded-3xl p-16 text-center border border-gray-100 shadow-sm max-w-lg mx-auto">
                            <div className="w-20 h-20 bg-gray-50 rounded-full flex items-center justify-center mx-auto mb-4">
                                <PackageOpen className="w-10 h-10 text-gray-300" />
                            </div>
                            <h3 className="text-xl font-bold text-gray-900 mb-2">No se encontraron productos</h3>
                            <p className="text-gray-500 text-sm mb-6">
                                {searchQuery || selectedCategorySlug !== 'all'
                                    ? 'No hay artículos que coincidan con los filtros seleccionados.'
                                    : 'Aún no se han publicado productos en esta tienda virtual.'}
                            </p>
                            {(searchQuery || selectedCategorySlug !== 'all') && (
                                <button
                                    onClick={() => { setSearchQuery(''); setSelectedCategorySlug('all'); }}
                                    className="px-6 py-2.5 bg-gray-900 text-white rounded-xl font-bold text-xs hover:bg-black transition-colors"
                                >
                                    Restablecer Filtros
                                </button>
                            )}
                        </div>
                    ) : (
                        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-8">
                            {filteredProducts.map(product => {
                                const isOutOfStock = product.type === 'physical' && product.stock <= 0;
                                const isLowStock = product.type === 'physical' && product.stock > 0 && product.stock <= 4;
                                const hasDiscount = product.compareAtPrice && product.compareAtPrice > product.price;

                                return (
                                    <Link
                                        to={`/tienda/producto/${product.slug}`}
                                        key={product.id}
                                        className="group bg-white rounded-3xl overflow-hidden border border-gray-100 shadow-sm hover:shadow-xl hover:-translate-y-1.5 transition-all duration-300 flex flex-col"
                                    >
                                        {/* Product Image Box */}
                                        <div className="aspect-[4/5] bg-gray-50 relative overflow-hidden">
                                            {product.images && product.images.length > 0 ? (
                                                <img
                                                    src={product.images[0]}
                                                    alt={product.name}
                                                    className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500"
                                                />
                                            ) : (
                                                <div className="w-full h-full flex flex-col items-center justify-center text-gray-300">
                                                    <PackageOpen className="w-12 h-12 mb-2" />
                                                    <span className="text-xs font-bold uppercase tracking-wider">Sin imagen</span>
                                                </div>
                                            )}

                                            {/* Status Badges */}
                                            <div className="absolute top-4 left-4 flex flex-col gap-1.5 items-start">
                                                {isOutOfStock && (
                                                    <span className="bg-red-500 text-white text-[10px] font-black uppercase px-2.5 py-1 rounded-full shadow-md">
                                                        Agotado
                                                    </span>
                                                )}
                                                {isLowStock && (
                                                    <span className="bg-amber-500 text-white text-[10px] font-black uppercase px-2.5 py-1 rounded-full shadow-md">
                                                        Últimas {product.stock} un.
                                                    </span>
                                                )}
                                                {hasDiscount && (
                                                    <span className="bg-emerald-500 text-white text-[10px] font-black uppercase px-2.5 py-1 rounded-full shadow-md flex items-center gap-1">
                                                        <Tag className="w-2.5 h-2.5" /> Oferta
                                                    </span>
                                                )}
                                            </div>

                                            {product.type === 'digital' && (
                                                <div className="absolute top-4 right-4 bg-purple-600 text-white text-[10px] font-black uppercase px-2.5 py-1 rounded-full shadow-md">
                                                    Digital
                                                </div>
                                            )}
                                        </div>

                                        {/* Info Box */}
                                        <div className="p-6 flex flex-col flex-1">
                                            <div className="text-[11px] font-bold text-gray-400 uppercase tracking-widest mb-1.5">
                                                {product.category?.name || 'Catálogo General'}
                                            </div>
                                            <h3 className="text-base font-bold text-gray-900 mb-3 line-clamp-2 flex-1 group-hover:text-rotary-blue transition-colors">
                                                {product.name}
                                            </h3>

                                            {/* Pricing */}
                                            <div className="flex items-baseline gap-2 mb-4">
                                                <span className="font-black text-xl text-gray-900">
                                                    ${product.price.toLocaleString()}
                                                </span>
                                                {hasDiscount && (
                                                    <span className="text-xs font-bold text-gray-400 line-through">
                                                        ${product.compareAtPrice?.toLocaleString()}
                                                    </span>
                                                )}
                                                <span className="text-[11px] font-bold text-gray-400 ml-auto">
                                                    {product.currency || 'COP'}
                                                </span>
                                            </div>

                                            {/* Action Button */}
                                            <button
                                                onClick={(e) => handleAddToCart(product, e)}
                                                disabled={isOutOfStock}
                                                className="w-full py-3 px-4 bg-gray-50 hover:bg-rotary-blue text-gray-900 hover:text-white rounded-xl font-bold text-sm flex items-center justify-center gap-2 transition-all disabled:opacity-40 disabled:cursor-not-allowed disabled:hover:bg-gray-50 disabled:hover:text-gray-900 shadow-sm"
                                            >
                                                <ShoppingCart className="w-4 h-4" />
                                                {isOutOfStock ? 'Agotado' : 'Agregar al Carrito'}
                                            </button>
                                        </div>
                                    </Link>
                                );
                            })}
                        </div>
                    )}
                </div>
            </main>

            <Footer />
        </div>
    );
}
