import { useState } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { Sparkles, Eye, EyeOff, Loader2, ArrowRight } from 'lucide-react';
import { useAuth } from '../hooks/useAuth';

export default function AppLogin() {
    const { login } = useAuth();
    const navigate = useNavigate();
    const [email, setEmail] = useState('');
    const [password, setPassword] = useState('');
    const [showPassword, setShowPassword] = useState(false);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState('');

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        setError('');
        setLoading(true);
        try {
            const apiUrl = import.meta.env.VITE_API_URL || '/api';
            const resp = await fetch(`${apiUrl}/auth/login`.replace(/\/+/g, '/').replace(':/', '://'), {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ email, password }),
            });
            const data = await resp.json();
            if (!resp.ok) {
                setError(data.error || 'Correo o contraseña incorrectos.');
                return;
            }
            login(data.token, data.user);
            navigate('/admin/dashboard');
        } catch {
            setError('Error de conexión. Por favor intenta de nuevo.');
        } finally {
            setLoading(false);
        }
    };

    return (
        <div className="min-h-screen bg-rotary-concrete bg-gradient-to-br from-blue-50 to-white flex items-center justify-center p-6">
            <div className="w-full max-w-md">
                {/* Header */}
                <div className="text-center mb-8">
                    <div className="flex items-center justify-center gap-2.5 mb-4">
                        <div className="w-10 h-10 rounded-2xl bg-[#019fcb] flex items-center justify-center shadow-lg shadow-blue-200">
                            <Sparkles className="w-5 h-5 text-white" />
                        </div>
                        <span className="font-black text-gray-900 text-xl">ClubPlatform</span>
                    </div>
                    <h1 className="text-3xl font-black text-gray-900 mb-2">Panel de Administración</h1>
                    <p className="text-gray-500">Accede al panel de tu club</p>
                </div>

                {/* Card */}
                <div className="bg-white rounded-3xl shadow-xl border border-gray-100 overflow-hidden">
                    <div className="bg-gradient-to-r from-gray-50 to-gray-50/50 px-8 py-5 border-b border-gray-100">
                        <h2 className="text-lg font-black text-gray-900">Iniciar Sesión</h2>
                        <p className="text-xs text-gray-400 mt-0.5">Ingresa tus credenciales para continuar</p>
                    </div>

                    <form onSubmit={handleSubmit} className="p-8 space-y-5">
                        <div>
                            <label className="block text-sm font-bold text-gray-700 mb-2">
                                Correo Electrónico
                            </label>
                            <input
                                type="email"
                                value={email}
                                onChange={e => setEmail(e.target.value)}
                                required
                                className="w-full px-4 py-3.5 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-[#013388]/20 focus:border-[#013388] transition-all"
                                placeholder="admin@tuclub.org"
                            />
                        </div>
                        <div>
                            <label className="block text-sm font-bold text-gray-700 mb-2">
                                Contraseña
                            </label>
                            <div className="relative">
                                <input
                                    type={showPassword ? 'text' : 'password'}
                                    value={password}
                                    onChange={e => setPassword(e.target.value)}
                                    required
                                    className="w-full px-4 py-3.5 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-[#013388]/20 focus:border-[#013388] transition-all pr-12"
                                    placeholder="••••••••"
                                />
                                <button type="button" onClick={() => setShowPassword(v => !v)}
                                    className="absolute right-4 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600 transition-colors">
                                    {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                                </button>
                            </div>
                        </div>

                        {error && (
                            <div className="bg-red-50 border border-red-100 text-red-600 text-sm px-4 py-3 rounded-xl">
                                {error}
                            </div>
                        )}

                        <button
                            type="submit"
                            disabled={loading}
                            className="w-full flex items-center justify-center gap-2 bg-[#019fcb] text-white font-bold py-3.5 rounded-xl hover:bg-[#017da3] transition-all shadow-lg shadow-blue-900/20 disabled:opacity-60 text-sm"
                        >
                            {loading
                                ? <><Loader2 className="w-4 h-4 animate-spin" /> Ingresando...</>
                                : <>Ingresar al Panel <ArrowRight className="w-4 h-4" /></>
                            }
                        </button>

                        <div className="text-center pt-2">
                            <p className="text-gray-400 text-xs">
                                ¿Aún no tienes cuenta?{' '}
                                <Link to="/registro" className="text-[#019fcb] font-bold hover:underline">
                                    Crear mi sitio gratis
                                </Link>
                            </p>
                        </div>
                    </form>
                </div>

                <p className="text-center text-gray-400 text-[10px] mt-6">
                    © {new Date().getFullYear()} ClubPlatform — Plataforma digital para Rotary · Por <a href="https://valkomen.com" target="_blank" rel="noopener noreferrer" className="font-bold hover:text-gray-600 transition-colors">Valkomen LLC</a>
                </p>
            </div>
        </div>
    );
}
