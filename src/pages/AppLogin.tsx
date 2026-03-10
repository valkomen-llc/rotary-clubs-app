import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
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
        <div className="min-h-screen bg-gradient-to-br from-[#013388] via-blue-900 to-[#011f5b] flex items-center justify-center p-6">
            {/* Background pattern */}
            <div className="absolute inset-0 opacity-10"
                style={{ backgroundImage: 'radial-gradient(circle at 25px 25px, white 2px, transparent 0)', backgroundSize: '50px 50px' }} />

            <div className="w-full max-w-md relative">
                {/* Logo */}
                <div className="text-center mb-8">
                    <div className="inline-flex items-center justify-center w-16 h-16 rounded-2xl bg-white/10 backdrop-blur-sm border border-white/20 mb-4">
                        <Sparkles className="w-8 h-8 text-white" />
                    </div>
                    <h1 className="text-2xl font-black text-white">ClubPlatform</h1>
                    <p className="text-blue-200 text-sm mt-1">Panel de Administración</p>
                </div>

                {/* Card */}
                <div className="bg-white/10 backdrop-blur-md border border-white/20 rounded-3xl p-8 shadow-2xl">
                    <h2 className="text-xl font-black text-white mb-1">Iniciar Sesión</h2>
                    <p className="text-blue-200 text-sm mb-6">Accede al panel de tu club</p>

                    <form onSubmit={handleSubmit} className="space-y-4">
                        <div>
                            <label className="block text-xs font-bold text-blue-200 mb-1.5 uppercase tracking-wide">
                                Correo Electrónico
                            </label>
                            <input
                                type="email"
                                value={email}
                                onChange={e => setEmail(e.target.value)}
                                required
                                className="w-full px-4 py-3 bg-white/10 border border-white/20 rounded-xl text-white placeholder-blue-300 text-sm focus:outline-none focus:ring-2 focus:ring-white/30 focus:border-white/40 transition-all"
                                placeholder="admin@tuclub.org"
                            />
                        </div>
                        <div>
                            <label className="block text-xs font-bold text-blue-200 mb-1.5 uppercase tracking-wide">
                                Contraseña
                            </label>
                            <div className="relative">
                                <input
                                    type={showPassword ? 'text' : 'password'}
                                    value={password}
                                    onChange={e => setPassword(e.target.value)}
                                    required
                                    className="w-full px-4 py-3 bg-white/10 border border-white/20 rounded-xl text-white placeholder-blue-300 text-sm focus:outline-none focus:ring-2 focus:ring-white/30 focus:border-white/40 transition-all pr-12"
                                    placeholder="••••••••"
                                />
                                <button type="button" onClick={() => setShowPassword(v => !v)}
                                    className="absolute right-4 top-1/2 -translate-y-1/2 text-blue-300 hover:text-white transition-colors">
                                    {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                                </button>
                            </div>
                        </div>

                        {error && (
                            <div className="bg-red-500/20 border border-red-400/30 text-red-200 text-sm px-4 py-3 rounded-xl">
                                {error}
                            </div>
                        )}

                        <button
                            type="submit"
                            disabled={loading}
                            className="w-full flex items-center justify-center gap-2 bg-white text-[#013388] font-black py-3.5 rounded-xl hover:bg-blue-50 transition-all shadow-lg disabled:opacity-60 text-sm mt-2"
                        >
                            {loading
                                ? <><Loader2 className="w-4 h-4 animate-spin" /> Ingresando...</>
                                : <>Ingresar al Panel <ArrowRight className="w-4 h-4" /></>
                            }
                        </button>
                    </form>

                    <div className="mt-6 pt-6 border-t border-white/10 text-center">
                        <p className="text-blue-300 text-xs">
                            ¿Aún no tienes cuenta?{' '}
                            <a href="https://www.clubplatform.org/#/registro"
                                className="text-white font-bold hover:underline">
                                Crear mi sitio gratis
                            </a>
                        </p>
                    </div>
                </div>

                <p className="text-center text-blue-400 text-xs mt-6">
                    © 2025 ClubPlatform — Plataforma digital para Rotary
                </p>
            </div>
        </div>
    );
}
