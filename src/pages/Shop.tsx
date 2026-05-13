import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import Navbar from '../sections/Navbar';
import Footer from '../sections/Footer';
import { useClub } from '../contexts/ClubContext';
import { useCart } from '../contexts/CartContext';
import axios from 'axios';
import { ShoppingCart, PackageOpen, Search } from 'lucide-react';

interface Product {
    id: string;
    name: string;
    slug: string;
    type: string;
    price: number;
    currency: string;
    stock: number;
    images: string[];
    category?: { name: string };
}

export default function Shop() {
    const { club, isLoading: clubLoading } = useClub();
    const { addToCart, setIsDrawerOpen } = useCart();
    const [products, setProducts] = useState<Product[]>([]);
    const [isLoading, setIsLoading] = useState(true);
    const [searchQuery, setSearchQuery] = useState('');

    const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:5001/api';

    useEffect(() => {
        if (!clubLoading && club) {
            fetchProducts();
        }
    }, [club, clubLoading]);

    const fetchProducts = async () => {
        setIsLoading(true);
        try {
            const res = await axios.get(`${API_URL}/products/public`, { params: { clubId: club?.id } });
            setProducts(res.data);
        } catch (error) {
            console.error('Error fetching public products:', error);
        } finally {
            setIsLoading(false);
        }
    };

    const handleAddToCart = (product: Product, e: React.MouseEvent) => {
        e.preventDefault(); // Prevent navigating to detail page if clicked from link wrapper
        e.stopPropagation();

        // Use general "product" logic. If the product is a donation ticket disguised as a product, 'type' helps.
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

    const filteredProducts = products.filter(p => p.name.toLowerCase().includes(searchQuery.toLowerCase()));

    return (
        <div className="min-h-screen bg-gray-50 flex flex-col font-sans">
            <Navbar />

            <main className="flex-1 pt-32 pb-24">
                <div className="max-w-7xl mx-auto px-6">

                    {/* Header */}
                    <div className="text-center mb-16">
                        <span className="inline-block py-1 px-3 rounded-full bg-rotary-blue/10 text-rotary-blue font-bold tracking-widest text-sm mb-4">
                            TIENDA OFICIAL
                        </span>
                        <h1 className="text-4xl md:text-5xl font-black text-gray-900 tracking-tight mb-4">
                            Productos y <span className="text-rotary-blue">Membresías</span>
                        </h1>
                        <p className="text-lg text-gray-600 max-w-2xl mx-auto">
                            Apoya a nuestro club adquiriendo artículos oficiales, mercancía y aportes especiales directamente desde nuestra tienda virtual.
                        </p>
                    </div>

                    {/* Controls */}
                    <div className="flex flex-col md:flex-row justify-between items-center gap-4 mb-12">
                        <div className="relative w-full md:w-96">
                            <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400" />
                            <input
                                type="text"
                                placeholder="Buscar en la tienda..."
                                value={searchQuery}
                                onChange={(e) => setSearchQuery(e.target.value)}
                                className="w-full pl-12 pr-4 py-3 rounded-2xl border-2 border-transparent bg-white shadow-sm focus:border-rotary-blue/30 focus:shadow-md outline-none transition-all font-medium text-gray-700"
                            />
                        </div>
                        <div className="text-sm font-bold text-gray-500">
                            {filteredProducts.length} producto(s)
                        </div>
                    </div>

                    {/* Loading State */}
                    {isLoading ? (
                        <div className="flex flex-col items-center justify-center py-24">
                            <div className="w-12 h-12 border-4 border-rotary-blue/20 border-t-rotary-blue rounded-full animate-spin mb-4"></div>
                            <p className="text-gray-500 font-medium tracking-wide">Cargando catálogo...</p>
                        </div>
                    ) : filteredProducts.length === 0 ? (
                        <div className="bg-white rounded-3xl p-16 text-center border border-gray-100 shadow-sm">
                            <div className="w-24 h-24 bg-gray-50 rounded-full flex items-center justify-center mx-auto mb-6">
                                <PackageOpen className="w-10 h-10 text-gray-300" />
                            </div>
                            <h3 className="text-2xl font-bold text-gray-900 mb-2">No se encontraron productos</h3>
                            <p className="text-gray-500">Intenta buscar con otros términos o vuelve más tarde.</p>
                        </div>
                    ) : (
                        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-8">
                            {filteredProducts.map(product => (
                                <Link
                                    to={`/shop/product/${product.slug}`}
                                    key={product.id}
                                    className="group bg-white rounded-3xl overflow-hidden border border-gray-100 shadow-sm hover:shadow-xl hover:-translate-y-1 transition-all duration-300 flex flex-col"
                                >
                                    {/* Product Image */}
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
                                                <span className="text-sm font-bold">Sin imagen</span>
                                            </div>
                                        )}

                                        {/* Badge Type */}
                                        {product.type === 'digital' && (
                                            <div className="absolute top-4 left-4 bg-purple-500 text-white text-xs font-bold px-3 py-1 rounded-full shadow-md">Digital</div>
                                        )}
                                        {product.type === 'membership' && (
                                            <div className="absolute top-4 left-4 bg-amber-500 text-white text-xs font-bold px-3 py-1 rounded-full shadow-md">Membresía</div>
                                        )}
                                    </div>

                                    {/* Product Info */}
                                    <div className="p-6 flex flex-col flex-1">
                                        <div className="text-xs font-bold text-gray-400 uppercase tracking-wider mb-2">
                                            {product.category?.name || 'Catálogo'}
                                        </div>
                                        <h3 className="text-lg font-bold text-gray-900 mb-2 line-clamp-2 flex-1 group-hover:text-rotary-blue transition-colors">
                                            {product.name}
                                        </h3>

                                        <div className="flex items-end justify-between mt-4">
                                            <div className="font-black text-xl text-gray-900">
                                                ${product.price.toLocaleString()} <span className="text-sm text-gray-500 font-medium">{product.currency}</span>
                                            </div>
                                        </div>

                                        <button
                                            onClick={(e) => handleAddToCart(product, e)}
                                            disabled={product.type === 'physical' && product.stock <= 0}
                                            className="mt-6 w-full py-3 px-4 bg-gray-50 hover:bg-rotary-blue text-gray-900 hover:text-white rounded-xl font-bold flex items-center justify-center gap-2 transition-colors disabled:opacity-50 disabled:cursor-not-allowed disabled:hover:bg-gray-50 disabled:hover:text-gray-900"
                                        >
                                            <ShoppingCart className="w-4 h-4" />
                                            {product.type === 'physical' && product.stock <= 0 ? 'Agotado' : 'Agregar al Carrito'}
                                        </button>
                                    </div>
                                </Link>
                            ))}
                        </div>
                    )}
                </div>
            </main>

            <Footer />
        </div>
    );
}
