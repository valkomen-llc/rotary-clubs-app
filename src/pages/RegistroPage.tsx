import { useState } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { Sparkles, Eye, EyeOff, Loader2, CheckCircle, ArrowLeft, ArrowRight, Building2, User, ChevronDown } from 'lucide-react';

/* ═══════════════════════════════════════════════════════════
   Country & District data
   ═══════════════════════════════════════════════════════════ */
const COUNTRIES = [
    { name: 'Colombia', code: 'CO', flag: '🇨🇴', dial: '+57' },
    { name: 'México', code: 'MX', flag: '🇲🇽', dial: '+52' },
    { name: 'Argentina', code: 'AR', flag: '🇦🇷', dial: '+54' },
    { name: 'Venezuela', code: 'VE', flag: '🇻🇪', dial: '+58' },
    { name: 'Ecuador', code: 'EC', flag: '🇪🇨', dial: '+593' },
    { name: 'Perú', code: 'PE', flag: '🇵🇪', dial: '+51' },
    { name: 'Chile', code: 'CL', flag: '🇨🇱', dial: '+56' },
    { name: 'Bolivia', code: 'BO', flag: '🇧🇴', dial: '+591' },
    { name: 'Paraguay', code: 'PY', flag: '🇵🇾', dial: '+595' },
    { name: 'Uruguay', code: 'UY', flag: '🇺🇾', dial: '+598' },
    { name: 'Brasil', code: 'BR', flag: '🇧🇷', dial: '+55' },
    { name: 'Costa Rica', code: 'CR', flag: '🇨🇷', dial: '+506' },
    { name: 'Panamá', code: 'PA', flag: '🇵🇦', dial: '+507' },
    { name: 'Guatemala', code: 'GT', flag: '🇬🇹', dial: '+502' },
    { name: 'Honduras', code: 'HN', flag: '🇭🇳', dial: '+504' },
    { name: 'El Salvador', code: 'SV', flag: '🇸🇻', dial: '+503' },
    { name: 'Nicaragua', code: 'NI', flag: '🇳🇮', dial: '+505' },
    { name: 'República Dominicana', code: 'DO', flag: '🇩🇴', dial: '+1' },
    { name: 'Cuba', code: 'CU', flag: '🇨🇺', dial: '+53' },
    { name: 'Puerto Rico', code: 'PR', flag: '🇵🇷', dial: '+1' },
    { name: 'Estados Unidos', code: 'US', flag: '🇺🇸', dial: '+1' },
    { name: 'España', code: 'ES', flag: '🇪🇸', dial: '+34' },
];


function slugify(text: string) {
    return text.toLowerCase()
        .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/^-+|-+$/g, '')
        .substring(0, 40);
}

/* ═══════════════════════════════════════════════════════════
   Main Component
   ═══════════════════════════════════════════════════════════ */
export default function RegistroPage() {
    const navigate = useNavigate();
    const [showPassword, setShowPassword] = useState(false);
    const [loading, setLoading] = useState(false);
    const [success, setSuccess] = useState(false);
    const [error, setError] = useState('');
    const [currentStep, setCurrentStep] = useState(1);
    const totalSteps = 2;

    const [form, setForm] = useState({
        clubName: '',
        country: 'Colombia',
        district: '',
        adminName: '',
        adminEmail: '',
        adminPassword: '',
        subdomain: '',
        phone: '',
        phoneCountry: 'CO',
        role: '',
    });

    // Find country data by code
    const getCountryByCode = (code: string) => COUNTRIES.find(c => c.code === code) || COUNTRIES[0];
    const selectedPhoneCountry = getCountryByCode(form.phoneCountry);

    const updateField = (field: string, value: string) => {
        setForm(prev => {
            const updated = { ...prev, [field]: value };
            if (field === 'clubName') {
                updated.subdomain = slugify(value);
            }
            // Auto-sync phone country when country changes
            if (field === 'country') {
                const match = COUNTRIES.find(c => c.name === value);
                if (match) updated.phoneCountry = match.code;
            }
            return updated;
        });
    };

    const validateStep = (step: number) => {
        if (step === 1) {
            if (!form.clubName) { setError('Ingresa el nombre del club.'); return false; }
            if (!form.country) { setError('Selecciona un país.'); return false; }
        }
        if (step === 2) {
            if (!form.adminName) { setError('Ingresa tu nombre completo.'); return false; }
            if (!form.adminEmail) { setError('Ingresa tu correo electrónico.'); return false; }
            if (!form.adminPassword || form.adminPassword.length < 6) { setError('La contraseña debe tener al menos 6 caracteres.'); return false; }
        }
        setError('');
        return true;
    };

    const handleNext = () => {
        if (validateStep(currentStep)) {
            setCurrentStep(s => Math.min(s + 1, totalSteps));
        }
    };

    const handleBack = () => {
        setError('');
        setCurrentStep(s => Math.max(s - 1, 1));
    };

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!validateStep(currentStep)) return;
        setLoading(true);
        setError('');

        try {
            const fullPhone = form.phone ? `${selectedPhoneCountry.dial} ${form.phone}` : '';
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
                    phone: fullPhone,
                    phoneCountry: form.phoneCountry,
                    role: form.role,
                })
            });
            const data = await resp.json();
            if (!resp.ok) {
                setError(data.error || 'Error al crear el club. Intenta de nuevo.');
                setLoading(false);
                return;
            }

            // Redirect to email verification
            if (data.requiresVerification) {
                navigate(`/verify-email?email=${encodeURIComponent(form.adminEmail)}`);
            } else {
                // Fallback: auto-login if verification not required
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
                setTimeout(() => navigate('/admin/onboarding'), 2500);
            }
        } catch {
            setError('Error de conexión. Por favor intenta de nuevo.');
        } finally {
            setLoading(false);
        }
    };

    /* ═══════════════════════════════════════════════════════════
       Success Screen
       ═══════════════════════════════════════════════════════════ */
    if (success) {
        return (
            <div className="min-h-screen bg-rotary-concrete bg-gradient-to-br from-blue-50 to-white flex items-center justify-center p-6">
                <div className="bg-white rounded-3xl shadow-xl border border-gray-100 p-10 max-w-md w-full text-center">
                    <div className="w-20 h-20 rounded-full bg-emerald-50 flex items-center justify-center mx-auto mb-6 animate-bounce">
                        <CheckCircle className="w-10 h-10 text-emerald-500" />
                    </div>
                    <h2 className="text-2xl font-black text-gray-900 mb-2">¡Club creado con éxito!</h2>
                    <p className="text-gray-500 mb-4">
                        Redirigiendo al asistente de configuración...
                    </p>
                    <p className="text-sm text-gray-400">Tu vista previa: <strong className="text-[#019fcb]">app.clubplatform.org/#/preview/{form.subdomain}</strong></p>
                    <div className="mt-6 h-1.5 bg-gray-100 rounded-full overflow-hidden">
                        <div className="h-full bg-[#019fcb] rounded-full" style={{ width: '100%', animation: 'progress 2.5s linear forwards' }} />
                    </div>
                </div>
                <style>{`@keyframes progress { from { width: 0%; } to { width: 100%; } }`}</style>
            </div>
        );
    }

    /* ═══════════════════════════════════════════════════════════
       Step indicators
       ═══════════════════════════════════════════════════════════ */
    const stepLabels = ['Datos del Club', 'Cuenta Admin'];

    return (
        <div className="min-h-screen bg-rotary-concrete bg-gradient-to-br from-blue-50 to-white flex items-center justify-center p-6">
            <div className="w-full max-w-lg">
                {/* Header */}
                <div className="text-center mb-8">
                    <Link to="/" className="inline-flex items-center gap-2 text-gray-400 hover:text-gray-600 transition-colors text-sm mb-6">
                        <ArrowLeft className="w-4 h-4" /> Volver al Inicio
                    </Link>
                    <div className="flex items-center justify-center gap-2.5 mb-4">
                        <div className="w-10 h-10 rounded-2xl bg-[#019fcb] flex items-center justify-center shadow-lg shadow-blue-200">
                            <Sparkles className="w-5 h-5 text-white" />
                        </div>
                        <span className="font-black text-gray-900 text-xl">ClubPlatform</span>
                    </div>
                    <h1 className="text-3xl font-black text-gray-900 mb-2">Crea el sitio web de tu club rotario</h1>
                    <p className="text-gray-500 text-sm leading-relaxed max-w-md">Presencia en línea 24/7, alcance nacional e internacional, posicionamiento de marca y herramientas de crowdfunding y fundraising para tu club.</p>
                </div>

                {/* Card */}
                <div className="bg-white rounded-3xl shadow-xl border border-gray-100 overflow-hidden">
                    {/* Step progress header */}
                    <div className="bg-gradient-to-r from-gray-50 to-gray-50/50 px-8 py-5 border-b border-gray-100">
                        <div className="flex items-center justify-between mb-3">
                            <span className="text-xs font-bold text-[#0c3c7c]">Paso {currentStep} de {totalSteps}</span>
                            <span className="text-xs text-gray-400 font-medium">{stepLabels[currentStep - 1]}</span>
                        </div>
                        <div className="flex gap-2">
                            {Array.from({ length: totalSteps }).map((_, i) => (
                                <div
                                    key={i}
                                    className={`h-1.5 rounded-full flex-1 transition-all duration-500 ${
                                        i < currentStep ? 'bg-[#0c3c7c]' : 'bg-gray-200'
                                    }`}
                                />
                            ))}
                        </div>
                    </div>

                    {/* Form content */}
                    <form onSubmit={handleSubmit} className="p-8">
                        {/* ── STEP 1: Club Data ── */}
                        {currentStep === 1 && (
                            <div className="space-y-5 animate-[fadeIn_.3s_ease]">
                                <div className="flex items-center gap-3 mb-6">
                                    <div className="w-10 h-10 rounded-xl bg-blue-50 flex items-center justify-center">
                                        <Building2 className="w-5 h-5 text-[#019fcb]" />
                                    </div>
                                    <div>
                                        <h3 className="font-black text-gray-900">Datos del Club</h3>
                                        <p className="text-xs text-gray-400">Información básica del club rotario</p>
                                    </div>
                                </div>

                                {/* Club Name */}
                                <div>
                                    <label className="block text-sm font-bold text-gray-700 mb-2">Nombre del Club Rotario</label>
                                    <input
                                        type="text"
                                        value={form.clubName}
                                        onChange={e => updateField('clubName', e.target.value)}
                                        className="w-full px-4 py-3.5 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-[#019fcb]/20 focus:border-[#019fcb] transition-all"
                                        placeholder="Ej: Rotary Club Valle del Cauca"
                                    />
                                </div>

                                {/* Country & District */}
                                <div className="grid grid-cols-2 gap-4">
                                    <div>
                                        <label className="block text-sm font-bold text-gray-700 mb-2">País</label>
                                        <div className="relative">
                                            <select
                                                value={form.country}
                                                onChange={e => updateField('country', e.target.value)}
                                                className="w-full px-4 py-3.5 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-[#019fcb]/20 focus:border-[#019fcb] transition-all bg-white appearance-none pr-10"
                                            >
                                                {COUNTRIES.map(c => (
                                                    <option key={c.code} value={c.name}>{c.flag} {c.name}</option>
                                                ))}
                                            </select>
                                            <ChevronDown className="w-4 h-4 text-gray-400 absolute right-3 top-1/2 -translate-y-1/2 pointer-events-none" />
                                        </div>
                                    </div>
                                    <div>
                                        <label className="block text-sm font-bold text-gray-700 mb-2">Distrito Rotario</label>
                                        <input
                                            type="text"
                                            value={form.district}
                                            onChange={e => updateField('district', e.target.value)}
                                            className="w-full px-4 py-3.5 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-[#019fcb]/20 focus:border-[#019fcb] transition-all"
                                            placeholder="Ej: 4281"
                                        />
                                    </div>
                                </div>
                            </div>
                        )}

                        {/* ── STEP 2: Admin Account ── */}
                        {currentStep === 2 && (
                            <div className="space-y-5 animate-[fadeIn_.3s_ease]">
                                <div className="flex items-center gap-3 mb-6">
                                    <div className="w-10 h-10 rounded-xl bg-emerald-50 flex items-center justify-center">
                                        <User className="w-5 h-5 text-emerald-600" />
                                    </div>
                                    <div>
                                        <h3 className="font-black text-gray-900">Cuenta de Administrador</h3>
                                        <p className="text-xs text-gray-400">Datos de quien administrará el sitio</p>
                                    </div>
                                </div>

                                {/* Full Name */}
                                <div>
                                    <label className="block text-sm font-bold text-gray-700 mb-2">Tu Nombre Completo</label>
                                    <input
                                        type="text"
                                        value={form.adminName}
                                        onChange={e => updateField('adminName', e.target.value)}
                                        className="w-full px-4 py-3.5 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-[#019fcb]/20 focus:border-[#019fcb] transition-all"
                                        placeholder="Juan Pérez"
                                    />
                                </div>

                                {/* Role */}
                                <div>
                                    <label className="block text-sm font-bold text-gray-700 mb-2">Rol que asume en el Club</label>
                                    <div className="relative">
                                        <select
                                            value={form.role}
                                            onChange={e => updateField('role', e.target.value)}
                                            className="w-full px-4 py-3.5 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-[#019fcb]/20 focus:border-[#019fcb] transition-all bg-white appearance-none pr-10"
                                        >
                                            <option value="">Selecciona tu rol</option>
                                            <option value="Presidente">Presidente</option>
                                            <option value="Vicepresidente">Vicepresidente</option>
                                            <option value="Secretario">Secretario</option>
                                            <option value="Tesorero">Tesorero</option>
                                            <option value="Director de Imagen Pública">Director de Imagen Pública</option>
                                            <option value="Director de Proyectos">Director de Proyectos</option>
                                            <option value="Junta Directiva">Junta Directiva</option>
                                            <option value="Equipo Distrital">Equipo Distrital</option>
                                            <option value="Socio Activo">Socio Activo</option>
                                            <option value="Otro">Otro</option>
                                        </select>
                                        <ChevronDown className="w-4 h-4 text-gray-400 absolute right-3 top-1/2 -translate-y-1/2 pointer-events-none" />
                                    </div>
                                </div>

                                {/* Email */}
                                <div>
                                    <label className="block text-sm font-bold text-gray-700 mb-2">Correo Electrónico (Login)</label>
                                    <input
                                        type="email"
                                        value={form.adminEmail}
                                        onChange={e => updateField('adminEmail', e.target.value)}
                                        className="w-full px-4 py-3.5 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-[#019fcb]/20 focus:border-[#019fcb] transition-all"
                                        placeholder="admin@club.com"
                                    />
                                </div>

                                {/* Phone with country flag */}
                                <div>
                                    <label className="block text-sm font-bold text-gray-700 mb-2">WhatsApp / Teléfono de Contacto</label>
                                    <div className="flex border border-gray-200 rounded-xl overflow-hidden focus-within:ring-2 focus-within:ring-[#019fcb]/20 focus-within:border-[#019fcb] transition-all">
                                        {/* Country dial selector */}
                                        <div className="relative flex-shrink-0">
                                            <select
                                                value={form.phoneCountry}
                                                onChange={e => updateField('phoneCountry', e.target.value)}
                                                className="h-full pl-3 pr-8 bg-gray-50 border-r border-gray-200 text-sm focus:outline-none appearance-none cursor-pointer font-medium"
                                            >
                                                {COUNTRIES.map(c => (
                                                    <option key={c.code} value={c.code}>
                                                        {c.flag} {c.dial}
                                                    </option>
                                                ))}
                                            </select>
                                            <ChevronDown className="w-3 h-3 text-gray-400 absolute right-2 top-1/2 -translate-y-1/2 pointer-events-none" />
                                        </div>
                                        {/* Phone number input */}
                                        <input
                                            type="tel"
                                            value={form.phone}
                                            onChange={e => updateField('phone', e.target.value.replace(/[^0-9\s]/g, ''))}
                                            className="flex-1 px-4 py-3.5 text-sm focus:outline-none"
                                            placeholder="300 123 4567"
                                        />
                                    </div>
                                    <p className="text-[10px] text-gray-400 mt-1.5 flex items-center gap-1">
                                        📱 Número para contacto y soporte del club
                                    </p>
                                </div>

                                {/* Password */}
                                <div>
                                    <label className="block text-sm font-bold text-gray-700 mb-2">Contraseña Segura</label>
                                    <div className="relative">
                                        <input
                                            type={showPassword ? 'text' : 'password'}
                                            value={form.adminPassword}
                                            onChange={e => updateField('adminPassword', e.target.value)}
                                            className="w-full px-4 py-3.5 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-[#019fcb]/20 focus:border-[#019fcb] transition-all pr-12"
                                            placeholder="Mínimo 6 caracteres"
                                        />
                                        <button type="button" onClick={() => setShowPassword(v => !v)}
                                            className="absolute right-4 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600 transition-colors">
                                            {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                                        </button>
                                    </div>
                                </div>

                            </div>
                        )}

                        {/* Error */}
                        {error && (
                            <div className="mt-5 bg-red-50 border border-red-100 text-red-600 text-sm px-4 py-3 rounded-xl">
                                {error}
                            </div>
                        )}

                        {/* Navigation Buttons */}
                        <div className="flex items-center justify-between mt-8">
                            {currentStep > 1 ? (
                                <button type="button" onClick={handleBack}
                                    className="flex items-center gap-2 text-sm font-bold text-gray-500 hover:text-gray-700 transition-colors">
                                    <ArrowLeft className="w-4 h-4" /> Atrás
                                </button>
                            ) : (
                                <div />
                            )}

                            {currentStep < totalSteps ? (
                                <button type="button" onClick={handleNext}
                                    className="flex items-center gap-2 bg-[#019fcb] text-white font-bold px-6 py-3 rounded-xl hover:bg-[#017da3] transition-all shadow-lg shadow-blue-900/20 text-sm">
                                    Siguiente <ArrowRight className="w-4 h-4" />
                                </button>
                            ) : (
                                <button type="submit" disabled={loading}
                                    className="flex items-center gap-2 bg-[#019fcb] text-white font-bold px-6 py-3 rounded-xl hover:bg-[#017da3] transition-all shadow-lg shadow-blue-900/20 text-sm disabled:opacity-60">
                                    {loading ? <><Loader2 className="w-4 h-4 animate-spin" /> Creando...</> : '🚀 Crear website para mi club'}
                                </button>
                            )}
                        </div>

                        {currentStep === totalSteps && (
                            <p className="text-center text-xs text-gray-400 mt-6">
                                Al registrarte aceptas los <span className="underline cursor-pointer">Términos de Servicio</span>.<br />
                                ¿Ya tienes cuenta? <Link to="/" className="text-[#019fcb] font-bold hover:underline">Inicia sesión</Link>
                            </p>
                        )}
                    </form>
                </div>
            </div>

            {/* Animations */}
            <style>{`
                @keyframes fadeIn {
                    from { opacity: 0; transform: translateY(8px); }
                    to { opacity: 1; transform: translateY(0); }
                }
            `}</style>
        </div>
    );
}
