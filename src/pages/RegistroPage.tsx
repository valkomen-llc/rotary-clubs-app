import { useState } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { Sparkles, Eye, EyeOff, Loader2, CheckCircle, ArrowLeft } from 'lucide-react';

const COUNTRIES = ['Colombia', 'México', 'Argentina', 'Venezuela', 'Ecuador', 'Perú', 'Chile', 'Bolivia', 'Paraguay', 'Uruguay', 'Brasil', 'Costa Rica', 'Panamá', 'Guatemala', 'Honduras', 'El Salvador', 'Nicaragua', 'República Dominicana', 'Cuba', 'Puerto Rico'];
const DISTRICTS_BY_COUNTRY: Record<string, string[]> = {
    Colombia: ['4270', '4271', '4272', 'Distrito Desconocido'],
    México: ['4170', '4175', '4180', '4185', '4190', '4195', '4200'],
    Argentina: ['4890', '4895', '4900', '4905', '4910', '4915', '4920', '4925', '4930', '4935'],
};

function slugify(text: string) {
    return text.toLowerCase()
        .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/^-+|-+$/g, '')
        .substring(0, 40);
}

export default function RegistroPage() {
    const navigate = useNavigate();
    const [showPassword, setShowPassword] = useState(false);
    const [loading, setLoading] = useState(false);
    const [success, setSuccess] = useState(false);
    const [error, setError] = useState('');
    const [subdomainEdited, setSubdomainEdited] = useState(false);

    const [form, setForm] = useState({
        clubName: '',
        country: 'Colombia',
        district: '',
        adminName: '',
        adminEmail: '',
        adminPassword: '',
        subdomain: '',
    });

    const updateField = (field: string, value: string) => {
        setForm(prev => {
            const updated = { ...prev, [field]: value };
            // Auto-fill subdomain from club name unless manually edited
            if (field === 'clubName' && !subdomainEdited) {
                updated.subdomain = slugify(value);
            }
            return updated;
        });
    };

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        setError('');
        if (!form.clubName || !form.country || !form.adminName || !form.adminEmail || !form.adminPassword || !form.subdomain) {
            setError('Por favor completa todos los campos obligatorios.');
            return;
        }
        if (form.adminPassword.length < 8) {
            setError('La contraseña debe tener al menos 8 caracteres.');
            return;
        }
        setLoading(true);
        try {
            const apiUrl = import.meta.env.VITE_API_URL || '/api';
            const resp = await fetch(`${apiUrl}/public/register-club`.replace(/\/+/g, '/').replace(':/', '://'), {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    clubName: form.clubName,
                    country: form.country,
                    district: form.district || '0000',
                    adminName: form.adminName,
                    adminEmail: form.adminEmail,
                    adminPassword: form.adminPassword,
                    subdomain: form.subdomain,
                })
            });
            const data = await resp.json();
            if (!resp.ok) {
                setError(data.error || 'Error al crear el club. Intenta de nuevo.');
                return;
            }

            // Auto-login with the new credentials
            const loginResp = await fetch(`${apiUrl}/auth/login`.replace(/\/+/g, '/').replace(':/', '://'), {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ email: form.adminEmail, password: form.adminPassword })
            });
            const loginData = await loginResp.json();
            if (loginResp.ok && loginData.token) {
                localStorage.setItem('rotary_token', loginData.token);
            }

            setSuccess(true);

            // Redirect to the club's subdomain after 2.5s
            setTimeout(() => {
                const subdomain = form.subdomain.toLowerCase();
                const isProd = window.location.hostname !== 'localhost';
                if (isProd) {
                    window.location.href = `https://${subdomain}.clubplatform.org/#/admin/dashboard`;
                } else {
                    navigate('/admin/dashboard');
                }
            }, 2500);
        } catch {
            setError('Error de conexión. Por favor intenta de nuevo.');
        } finally {
            setLoading(false);
        }
    };

    if (success) {
        return (
            <div className="min-h-screen bg-gradient-to-br from-blue-50 to-white flex items-center justify-center p-6">
                <div className="bg-white rounded-3xl shadow-xl border border-gray-100 p-10 max-w-md w-full text-center">
                    <div className="w-20 h-20 rounded-full bg-emerald-50 flex items-center justify-center mx-auto mb-6 animate-bounce">
                        <CheckCircle className="w-10 h-10 text-emerald-500" />
                    </div>
                    <h2 className="text-2xl font-black text-gray-900 mb-2">¡Club creado con éxito!</h2>
                    <p className="text-gray-500 mb-4">
                        Redirigiendo a <span className="font-bold text-[#013388]">{form.subdomain}.clubplatform.org</span>...
                    </p>
                    <p className="text-sm text-gray-400">Tu asistente IA está listo para guiarte en la configuración.</p>
                    <div className="mt-6 h-1.5 bg-gray-100 rounded-full overflow-hidden">
                        <div className="h-full bg-[#013388] rounded-full animate-[progress_2.5s_linear_forwards]" style={{ width: '100%', animationFillMode: 'forwards' }} />
                    </div>
                </div>
            </div>
        );
    }

    return (
        <div className="min-h-screen bg-gradient-to-br from-blue-50 to-white flex items-center justify-center p-6">
            <div className="w-full max-w-lg">
                {/* Header */}
                <div className="text-center mb-8">
                    <Link to="/" className="inline-flex items-center gap-2 text-gray-400 hover:text-gray-600 transition-colors text-sm mb-6">
                        <ArrowLeft className="w-4 h-4" /> Volver
                    </Link>
                    <div className="flex items-center justify-center gap-2.5 mb-4">
                        <div className="w-10 h-10 rounded-2xl bg-[#013388] flex items-center justify-center shadow-lg shadow-blue-200">
                            <Sparkles className="w-5 h-5 text-white" />
                        </div>
                        <span className="font-black text-gray-900 text-xl">ClubPlatform</span>
                    </div>
                    <h1 className="text-3xl font-black text-gray-900 mb-2">Crea el sitio de tu club</h1>
                    <p className="text-gray-500">Gratis para comenzar. Listo en 5 minutos.</p>
                </div>

                {/* Form */}
                <div className="bg-white rounded-3xl shadow-xl border border-gray-100 p-8">
                    <form onSubmit={handleSubmit} className="space-y-5">

                        {/* Club Name */}
                        <div>
                            <label className="block text-xs font-bold text-gray-500 mb-1.5 uppercase tracking-wide">Nombre del Club *</label>
                            <input
                                type="text"
                                value={form.clubName}
                                onChange={e => updateField('clubName', e.target.value)}
                                className="w-full px-4 py-3 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-[#013388]/20 focus:border-[#013388] transition-all"
                                placeholder="Ej: Rotary Club Bogotá Norte"
                                required
                            />
                        </div>

                        {/* Subdomain */}
                        <div>
                            <label className="block text-xs font-bold text-gray-500 mb-1.5 uppercase tracking-wide">Subdominio *</label>
                            <div className="flex items-center border border-gray-200 rounded-xl overflow-hidden focus-within:ring-2 focus-within:ring-[#013388]/20 focus-within:border-[#013388] transition-all">
                                <input
                                    type="text"
                                    value={form.subdomain}
                                    onChange={e => { setSubdomainEdited(true); updateField('subdomain', slugify(e.target.value)); }}
                                    className="flex-1 px-4 py-3 text-sm focus:outline-none"
                                    placeholder="miclub"
                                    required
                                />
                                <span className="px-4 py-3 bg-gray-50 text-xs font-mono text-gray-400 border-l border-gray-200 whitespace-nowrap">.clubplatform.org</span>
                            </div>
                            {form.subdomain && (
                                <p className="mt-1.5 text-xs text-[#013388] font-medium">
                                    ✓ Tu sitio: <strong>{form.subdomain}.clubplatform.org</strong>
                                </p>
                            )}
                        </div>

                        <div className="grid grid-cols-2 gap-4">
                            {/* Country */}
                            <div>
                                <label className="block text-xs font-bold text-gray-500 mb-1.5 uppercase tracking-wide">País *</label>
                                <select
                                    value={form.country}
                                    onChange={e => updateField('country', e.target.value)}
                                    className="w-full px-4 py-3 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-[#013388]/20 focus:border-[#013388] transition-all bg-white"
                                >
                                    {COUNTRIES.map(c => <option key={c} value={c}>{c}</option>)}
                                </select>
                            </div>
                            {/* District */}
                            <div>
                                <label className="block text-xs font-bold text-gray-500 mb-1.5 uppercase tracking-wide">Distrito Rotario</label>
                                {DISTRICTS_BY_COUNTRY[form.country] ? (
                                    <select
                                        value={form.district}
                                        onChange={e => updateField('district', e.target.value)}
                                        className="w-full px-4 py-3 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-[#013388]/20 focus:border-[#013388] transition-all bg-white"
                                    >
                                        <option value="">Selecciona</option>
                                        {DISTRICTS_BY_COUNTRY[form.country].map(d => <option key={d} value={d}>{d}</option>)}
                                    </select>
                                ) : (
                                    <input
                                        type="text"
                                        value={form.district}
                                        onChange={e => updateField('district', e.target.value)}
                                        className="w-full px-4 py-3 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-[#013388]/20 focus:border-[#013388] transition-all"
                                        placeholder="Ej: 4270"
                                    />
                                )}
                            </div>
                        </div>

                        <div className="border-t border-gray-100 pt-5">
                            <p className="text-xs font-bold text-gray-400 uppercase tracking-wide mb-4">Cuenta de Administrador</p>

                            <div className="space-y-4">
                                <div>
                                    <label className="block text-xs font-bold text-gray-500 mb-1.5 uppercase tracking-wide">Nombre Completo *</label>
                                    <input
                                        type="text"
                                        value={form.adminName}
                                        onChange={e => updateField('adminName', e.target.value)}
                                        className="w-full px-4 py-3 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-[#013388]/20 focus:border-[#013388] transition-all"
                                        placeholder="Tu nombre y apellido"
                                        required
                                    />
                                </div>
                                <div>
                                    <label className="block text-xs font-bold text-gray-500 mb-1.5 uppercase tracking-wide">Correo Electrónico *</label>
                                    <input
                                        type="email"
                                        value={form.adminEmail}
                                        onChange={e => updateField('adminEmail', e.target.value)}
                                        className="w-full px-4 py-3 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-[#013388]/20 focus:border-[#013388] transition-all"
                                        placeholder="admin@tuclub.org"
                                        required
                                    />
                                </div>
                                <div>
                                    <label className="block text-xs font-bold text-gray-500 mb-1.5 uppercase tracking-wide">Contraseña *</label>
                                    <div className="relative">
                                        <input
                                            type={showPassword ? 'text' : 'password'}
                                            value={form.adminPassword}
                                            onChange={e => updateField('adminPassword', e.target.value)}
                                            className="w-full px-4 py-3 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-[#013388]/20 focus:border-[#013388] transition-all pr-12"
                                            placeholder="Mínimo 8 caracteres"
                                            required
                                        />
                                        <button type="button" onClick={() => setShowPassword(v => !v)}
                                            className="absolute right-4 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600 transition-colors">
                                            {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                                        </button>
                                    </div>
                                </div>
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
                            className="w-full flex items-center justify-center gap-2 bg-[#013388] text-white font-black py-4 rounded-xl hover:bg-[#013388]/90 transition-all shadow-lg shadow-blue-200 disabled:opacity-60 text-sm"
                        >
                            {loading ? <><Loader2 className="w-4 h-4 animate-spin" /> Creando tu club...</> : '🚀 Crear mi sitio gratis'}
                        </button>

                        <p className="text-center text-xs text-gray-400">
                            Al registrarte aceptas los <span className="underline cursor-pointer">Términos de Servicio</span>.<br />
                            ¿Ya tienes cuenta? <Link to="/" className="text-[#013388] font-bold hover:underline">Inicia sesión desde tu subdominio</Link>
                        </p>
                    </form>
                </div>
            </div>
        </div>
    );
}
