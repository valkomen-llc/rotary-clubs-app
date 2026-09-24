import React, { useState, useEffect } from 'react';
import { useParams, Link, useNavigate } from 'react-router-dom';
import Navbar from '../sections/Navbar';
import Footer from '../sections/Footer';
import { useClub } from '../contexts/ClubContext';
import { useCart } from '../contexts/CartContext';
import axios from 'axios';
import { ArrowLeft, ShoppingCart, PackageOpen, CheckCircle2, ShieldCheck, Truck, Zap, Tag } from 'lucide-react';
import { toast } from 'sonner';

interface Product {
    id: string;
    name: string;
    slug: string;
    description: string;
    type: string;
    price: number;
    compareAtPrice?: number;
    currency: string;
    stock: number;
    sku?: string;
    images: string[];
    category?: { id: string; name: string; slug: string };
}

export default function ProductDetail() {
    const { slug } = useParams<{ slug: string }>();
    const navigate = useNavigate();
    const { club, isLoading: clubLoading } = useClub();
    const { addToCart, setIsDrawerOpen } = useCart();

    const [product, setProduct] = useState<Product | null>(null);
    const [isLoading, setIsLoading] = useState(true);
    const [activeImageIndex, setActiveImageIndex] = useState(0);
    const [quantity, setQuantity] = useState(1);

    const API_URL = import.meta.env.VITE_API_URL || '/api';

    useEffect(() => {
        if (!clubLoading && club && slug) {
            fetchProduct();
        }
    }, [club, clubLoading, slug]);

    const fetchProduct = async () => {
        setIsLoading(true);
        try {
            const res = await axios.get(`${API_URL}/products/public/product`, {
                params: { clubId: club?.id, slug }
            });
            setProduct(res.data);
            setQuantity(1);
        } catch (error) {
            console.error('Error fetching product detail:', error);
        } finally {
            setIsLoading(false);
        }
    };

    const handleAddToCart = () => {
        if (!product) return;
        addToCart({
            productId: product.id,
            title: product.name,
            unitPrice: product.price,
            qty: quantity,
            type: product.type === 'donation' ? 'donation' : 'product',
            image: product.images?.[0]
        });
        setIsDrawerOpen(true);
    };

    const handleBuyNow = () => {
        if (!product) return;
        addToCart({
            productId: product.id,
            title: product.name,
            unitPrice: product.price,
            qty: quantity,
            type: product.type === 'donation' ? 'donation' : 'product',
            image: product.images?.[0]
        });
        navigate('/checkout');
    };

    if (isLoading) {
        return (
            <div className="min-h-screen bg-gray-50 flex flex-col font-sans">
                <Navbar />
                <div className="flex-1 flex items-center justify-center pt-32 pb-24">
                    <div className="w-12 h-12 border-4 border-rotary-blue/20 border-t-rotary-blue rounded-full animate-spin" />
                </div>
                <Footer />
            </div>
        );
    }

    if (!product) {
        return (
            <div className="min-h-screen bg-gray-50 flex flex-col font-sans">
                <Navbar />
                <div className="flex-1 flex flex-col items-center justify-center text-center p-6 pt-32 pb-24">
                    <div className="w-20 h-20 bg-white rounded-3xl shadow-sm flex items-center justify-center mx-auto mb-6">
                        <PackageOpen className="w-10 h-10 text-gray-300" />
                    </div>
                    <h2 className="text-3xl font-black text-gray-900 mb-2">Producto no disponible</h2>
                    <p className="text-gray-500 mb-8 max-w-sm">El artículo que estás buscando no existe o ya no se encuentra en el catálogo.</p>
                    <Link to="/tienda" className="px-8 py-3.5 bg-rotary-blue text-white font-bold rounded-2xl hover:bg-sky-800 transition-colors shadow-lg shadow-rotary-blue/20">
                        Volver a la Tienda
                    </Link>
                </div>
                <Footer />
            </div>
        );
    }

    const isOutOfStock = product.type === 'physical' && product.stock <= 0;
    const isLowStock = product.type === 'physical' && product.stock > 0 && product.stock <= 5;
    const hasDiscount = product.compareAtPrice && product.compareAtPrice > product.price;

    return (
        <div className="min-h-screen bg-gray-50 flex flex-col font-sans">
            <Navbar />

            <main className="flex-1 pt-32 pb-24">
                <div className="max-w-7xl mx-auto px-6">
                    {/* Breadcrumbs */}
                    <div className="flex items-center gap-2 text-xs font-bold text-gray-400 mb-8 overflow-x-auto whitespace-nowrap">
                        <Link to="/" className="hover:text-rotary-blue transition-colors">Inicio</Link>
                        <span>/</span>
                        <Link to="/tienda" className="hover:text-rotary-blue transition-colors">Tienda</Link>
                        {product.category && (
                            <>
                                <span>/</span>
                                <Link to={`/tienda/categoria/${product.category.slug}`} className="hover:text-rotary-blue transition-colors">
                                    {product.category.name}
                                </Link>
                            </>
                        )}
                        <span>/</span>
                        <span className="text-gray-900 line-clamp-1">{product.name}</span>
                    </div>

                    <div className="bg-white rounded-[2.5rem] p-6 lg:p-12 border border-gray-100 shadow-sm">
                        <div className="flex flex-col lg:flex-row gap-12 lg:gap-16">
                            {/* Product Images Gallery */}
                            <div className="w-full lg:w-1/2 flex flex-col gap-4">
                                <div className="aspect-square bg-gray-50 rounded-3xl overflow-hidden border border-gray-100 relative flex items-center justify-center">
                                    {product.images && product.images.length > 0 ? (
                                        <img
                                            src={product.images[activeImageIndex]}
                                            alt={product.name}
                                            className="w-full h-full object-contain p-4 transition-all duration-300"
                                        />
                                    ) : (
                                        <div className="w-full h-full flex flex-col items-center justify-center text-gray-300">
                                            <PackageOpen className="w-16 h-16 mb-2" />
                                            <span className="text-sm font-bold">Sin imagen</span>
                                        </div>
                                    )}

                                    {/* Badges */}
                                    <div className="absolute top-4 left-4 flex flex-col gap-2">
                                        {hasDiscount && (
                                            <span className="bg-emerald-500 text-white text-xs font-bold uppercase px-3 py-1 rounded-full shadow-md flex items-center gap-1">
                                                <Tag className="w-3 h-3" /> Oferta
                                            </span>
                                        )}
                                        {isOutOfStock && (
                                            <span className="bg-red-500 text-white text-xs font-bold uppercase px-3 py-1 rounded-full shadow-md">
                                                Agotado
                                            </span>
                                        )}
                                        {isLowStock && (
                                            <span className="bg-amber-500 text-white text-xs font-bold uppercase px-3 py-1 rounded-full shadow-md">
                                                Solo {product.stock} disponibles
                                            </span>
                                        )}
                                    </div>
                                </div>

                                {product.images && product.images.length > 1 && (
                                    <div className="flex gap-3 overflow-x-auto pb-2 scrollbar-none">
                                        {product.images.map((img, idx) => (
                                            <button
                                                key={idx}
                                                onClick={() => setActiveImageIndex(idx)}
                                                className={`flex-none w-20 h-20 rounded-2xl overflow-hidden border-2 transition-all p-1 bg-gray-50 ${activeImageIndex === idx ? 'border-rotary-blue shadow-md' : 'border-gray-200 opacity-60 hover:opacity-100'}`}
                                            >
                                                <img src={img} alt={`Miniatura ${idx + 1}`} className="w-full h-full object-cover rounded-xl" />
                                            </button>
                                        ))}
                                    </div>
                                )}
                            </div>

                            {/* Product Info & Actions */}
                            <div className="w-full lg:w-1/2 flex flex-col">
                                <div className="mb-6">
                                    <span className="text-xs font-bold tracking-widest text-rotary-blue uppercase bg-rotary-blue/10 px-3 py-1 rounded-full inline-block mb-3">
                                        {product.category?.name || 'Catálogo Oficial'}
                                    </span>
                                    <h1 className="text-3xl sm:text-4xl font-black text-gray-900 tracking-tight leading-tight mb-4">
                                        {product.name}
                                    </h1>

                                    {product.sku && (
                                        <p className="text-xs text-gray-400 font-mono mb-4">SKU: {product.sku}</p>
                                    )}

                                    {/* Pricing Box */}
                                    <div className="flex items-baseline gap-4 mb-4">
                                        <span className="text-4xl font-black text-rotary-blue">
                                            ${product.price.toLocaleString()}
                                        </span>
                                        {hasDiscount && (
                                            <span className="text-lg font-bold text-gray-400 line-through">
                                                ${product.compareAtPrice?.toLocaleString()}
                                            </span>
                                        )}
                                        <span className="text-sm font-bold text-gray-500">
                                            {product.currency || 'COP'}
                                        </span>
                                    </div>
                                </div>

                                <div className="h-px w-full bg-gray-100 mb-6" />

                                {/* Description */}
                                <div className="mb-8">
                                    <h3 className="text-xs font-bold text-gray-400 uppercase tracking-wider mb-2">Descripción del Producto</h3>
                                    <p className="text-gray-600 leading-relaxed whitespace-pre-line text-sm sm:text-base">
                                        {product.description || 'Sin descripción detallada por el momento.'}
                                    </p>
                                </div>

                                {/* Quantity Selector */}
                                {!isOutOfStock && product.type === 'physical' && (
                                    <div className="mb-8">
                                        <label className="block text-xs font-bold text-gray-400 uppercase tracking-wider mb-3">
                                            Cantidad
                                        </label>
                                        <div className="inline-flex items-center border-2 border-gray-100 rounded-2xl bg-gray-50 overflow-hidden">
                                            <button
                                                onClick={() => setQuantity(Math.max(1, quantity - 1))}
                                                className="px-4 py-2.5 text-gray-600 hover:bg-gray-200 transition-colors font-bold text-base"
                                            >
                                                -
                                            </button>
                                            <span className="w-12 text-center font-bold text-gray-900 text-sm">{quantity}</span>
                                            <button
                                                onClick={() => setQuantity(Math.min(product.stock, quantity + 1))}
                                                className="px-4 py-2.5 text-gray-600 hover:bg-gray-200 transition-colors font-bold text-base"
                                            >
                                                +
                                            </button>
                                        </div>
                                        <span className="text-xs text-gray-400 ml-4 font-medium">
                                            {product.stock} unidades en existencia
                                        </span>
                                    </div>
                                )}

                                {/* Action Buttons */}
                                <div className="space-y-3 mb-8">
                                    <button
                                        onClick={handleAddToCart}
                                        disabled={isOutOfStock}
                                        className="w-full py-4 bg-rotary-blue hover:bg-sky-800 text-white rounded-2xl font-black text-base flex items-center justify-center gap-3 transition-all shadow-xl shadow-rotary-blue/20 disabled:opacity-50 disabled:cursor-not-allowed"
                                    >
                                        <ShoppingCart className="w-5 h-5" />
                                        {isOutOfStock ? 'Agotado' : 'Agregar al Carrito'}
                                    </button>

                                    {!isOutOfStock && (
                                        <button
                                            onClick={handleBuyNow}
                                            className="w-full py-4 bg-emerald-600 hover:bg-emerald-700 text-white rounded-2xl font-black text-base flex items-center justify-center gap-3 transition-all shadow-xl shadow-emerald-600/20"
                                        >
                                            <Zap className="w-5 h-5" />
                                            Comprar Ahora
                                        </button>
                                    )}
                                </div>

                                {/* Trust Badges */}
                                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-6 border-t border-gray-100 text-xs text-gray-600">
                                    <div className="flex items-center gap-2 bg-gray-50 p-3 rounded-xl border border-gray-100">
                                        <ShieldCheck className="w-4 h-4 text-emerald-500 flex-shrink-0" />
                                        <span>Garantía Oficial Rotary</span>
                                    </div>
                                    <div className="flex items-center gap-2 bg-gray-50 p-3 rounded-xl border border-gray-100">
                                        <Truck className="w-4 h-4 text-rotary-blue flex-shrink-0" />
                                        <span>Envíos a todo el país</span>
                                    </div>
                                </div>
                            </div>
                        </div>
                    </div>
                </div>
            </main>

            <Footer />
        </div>
    );
}
