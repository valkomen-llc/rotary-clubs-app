import { useState, useEffect } from 'react';
import { useParams, Link, useNavigate } from 'react-router-dom';
import Navbar from '../sections/Navbar';
import Footer from '../sections/Footer';
import { useClub } from '../contexts/ClubContext';
import { useCart } from '../contexts/CartContext';
import axios from 'axios';
import { ArrowLeft, ShoppingCart, PackageOpen, LayoutGrid, CheckCircle2 } from 'lucide-react';

interface Product {
    id: string;
    name: string;
    slug: string;
    description: string;
    type: string;
    price: number;
    currency: string;
    stock: number;
    images: string[];
    category?: { name: string };
}

export default function ProductDetail() {
    const { slug } = useParams<{ slug: string }>();
    const navigate = useNavigate();
    const { club, isLoading: clubLoading } = useClub();
    const { addToCart, setIsDrawerOpen } = useCart();

    const [product, setProduct] = useState<Product | null>(null);
    const [isLoading, setIsLoading] = useState(true);
    const [activeImageIndex, setActiveImageIndex] = useState(0);

    const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:5001/api';

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
        } catch (error) {
            console.error('Error fetching product detail:', error);
            // Could redirect to 404 or show error
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
            qty: 1,
            type: product.type === 'donation' ? 'donation' : 'product',
            image: product.images?.[0]
        });
        setIsDrawerOpen(true);
    };

    if (isLoading) {
        return (
            <div className="min-h-screen bg-white flex flex-col">
                <Navbar />
                <div className="flex-1 flex items-center justify-center">
                    <div className="w-12 h-12 border-4 border-rotary-blue/20 border-t-rotary-blue rounded-full animate-spin"></div>
                </div>
            </div>
        );
    }

    if (!product) {
        return (
            <div className="min-h-screen bg-white flex flex-col">
                <Navbar />
                <div className="flex-1 flex flex-col items-center justify-center text-center p-6">
                    <PackageOpen className="w-16 h-16 text-gray-300 mb-4" />
                    <h2 className="text-3xl font-black text-gray-900 mb-2">Producto no encontrado</h2>
                    <p className="text-gray-500 mb-8">El artículo que estás buscando no existe o ya no está disponible.</p>
                    <Link to="/shop" className="px-6 py-3 bg-rotary-blue text-white font-bold rounded-xl hover:bg-sky-800 transition-colors">
                        Volver a la Tienda
                    </Link>
                </div>
            </div>
        );
    }

    return (
        <div className="min-h-screen bg-white flex flex-col font-sans">
            <Navbar />

            <main className="flex-1 pt-32 pb-24">
                <div className="max-w-7xl mx-auto px-6">

                    <button
                        onClick={() => navigate('/shop')}
                        className="flex items-center gap-2 text-sm font-bold text-gray-500 hover:text-rotary-blue transition-colors mb-8"
                    >
                        <ArrowLeft className="w-4 h-4" /> Volver a la Tienda
                    </button>

                    <div className="bg-white rounded-[2.5rem] p-6 lg:p-12 border border-gray-100 shadow-xl shadow-gray-200/40">
                        <div className="flex flex-col lg:flex-row gap-12 lg:gap-20">

                            {/* Product Images */}
                            <div className="w-full lg:w-1/2 flex flex-col gap-4">
                                <div className="aspect-[4/5] sm:aspect-square bg-gray-50 rounded-3xl overflow-hidden border border-gray-100 relative">
                                    {product.images && product.images.length > 0 ? (
                                        <img
                                            src={product.images[activeImageIndex]}
                                            alt={product.name}
                                            className="w-full h-full object-contain"
                                        />
                                    ) : (
                                        <div className="w-full h-full flex flex-col items-center justify-center text-gray-300">
                                            <PackageOpen className="w-16 h-16 mb-4" />
                                            <span className="font-bold">Sin imagen</span>
                                        </div>
                                    )}
                                </div>

                                {product.images && product.images.length > 1 && (
                                    <div className="flex gap-4 overflow-x-auto pb-2 -mx-2 px-2 snap-x">
                                        {product.images.map((img, idx) => (
                                            <button
                                                key={idx}
                                                onClick={() => setActiveImageIndex(idx)}
                                                className={`flex-none w-24 h-24 rounded-2xl overflow-hidden border-2 snap-start transition-all ${activeImageIndex === idx ? 'border-rotary-blue opacity-100' : 'border-transparent opacity-60 hover:opacity-100'}`}
                                            >
                                                <img src={img} alt={`Thumb ${idx}`} className="w-full h-full object-cover" />
                                            </button>
                                        ))}
                                    </div>
                                )}
                            </div>

                            {/* Product Details */}
                            <div className="w-full lg:w-1/2 flex flex-col">
                                <div className="mb-8">
                                    <div className="flex items-center gap-3 mb-4">
                                        <div className="text-xs font-bold text-gray-400 uppercase tracking-widest pl-1 border-l-2 border-rotary-blue">
                                            {product.category?.name || 'Catálogo Oficial'}
                                        </div>
                                        {product.type === 'digital' && (
                                            <span className="bg-purple-100 text-purple-700 text-xs font-bold px-2 py-0.5 rounded-md">Digital</span>
                                        )}
                                    </div>
                                    <h1 className="text-3xl sm:text-4xl lg:text-5xl font-black text-gray-900 tracking-tight leading-tight mb-6">
                                        {product.name}
                                    </h1>
                                    <div className="flex items-center gap-4">
                                        <span className="text-4xl font-black text-rotary-blue">
                                            ${product.price.toLocaleString()}
                                        </span>
                                        <span className="text-lg font-bold text-gray-400 mt-2">
                                            {product.currency}
                                        </span>
                                    </div>
                                </div>

                                <div className="h-px w-full bg-gray-100 mb-8"></div>

                                <div className="prose prose-lg prose-gray mb-10 text-gray-600">
                                    {product.description ? (
                                        <p className="whitespace-pre-line">{product.description}</p>
                                    ) : (
                                        <p className="italic text-gray-400">Sin descripción adicional.</p>
                                    )}
                                </div>

                                <div className="space-y-4 mb-10">
                                    <div className="flex items-center gap-3 text-sm font-bold text-gray-700">
                                        <CheckCircle2 className="w-5 h-5 text-emerald-500" />
                                        <span>Garantía Rotary Club</span>
                                    </div>
                                    <div className="flex items-center gap-3 text-sm font-bold text-gray-700">
                                        <CheckCircle2 className="w-5 h-5 text-emerald-500" />
                                        <span>Pago 100% Seguro por Stripe</span>
                                    </div>
                                    {product.type === 'physical' && (
                                        <div className="flex items-center gap-3 text-sm font-bold text-gray-700">
                                            <LayoutGrid className="w-5 h-5 text-rotary-blue" />
                                            <span>Inventario Disponible: {product.stock > 0 ? product.stock : <span className="text-red-500">Agotado</span>}</span>
                                        </div>
                                    )}
                                </div>

                                <div className="mt-auto pt-8 border-t border-gray-100">
                                    <button
                                        onClick={handleAddToCart}
                                        disabled={product.type === 'physical' && product.stock <= 0}
                                        className="w-full py-5 bg-rotary-blue hover:bg-sky-800 text-white rounded-2xl font-black text-lg flex items-center justify-center gap-3 transition-all hover:scale-[1.02] shadow-xl shadow-rotary-blue/20 disabled:opacity-50 disabled:hover:scale-100 disabled:cursor-not-allowed"
                                    >
                                        <ShoppingCart className="w-6 h-6" />
                                        {product.type === 'physical' && product.stock <= 0 ? 'FUERA DE STOCK' : 'AGREGAR AL CARRITO'}
                                    </button>
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
