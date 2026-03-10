import React, { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { ArrowRight, Globe, Lock, User, Building, MapPin, ChevronLeft } from 'lucide-react';
import { toast } from 'sonner';

const RegisterClub = () => {
    const navigate = useNavigate();
    const [step, setStep] = useState(1);
    const [loading, setLoading] = useState(false);
    const [formData, setFormData] = useState({
        // Club Data
        clubName: '',
        country: '',
        district: '',
        // Admin Data
        adminName: '',
        adminEmail: '',
        adminPassword: '',
        // Technical
        subdomain: '',
    });

    const handleNext = () => setStep(step + 1);
    const handlePrev = () => setStep(step - 1);

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        setLoading(true);

        try {
            // Using production URL explicitly for the decoupled landing scenario.
            // Default to production API if env variable is not set
            const API_BASE = import.meta.env.VITE_API_URL || 'https://api.clubplatform.org/api';
            const response = await fetch(`${API_BASE}/public/register-club`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(formData)
            });

            if (response.ok) {
                // const data = await response.json(); // 'data' is not used after assignment
                toast.success('¡Club creado exitosamente!');
                // Auto login or redirect to generic login
                navigate('/login');
            }
            if (!response.ok) {
                const errorData = await response.json();
                throw new Error(errorData.error || 'Error al registrar el club');
            }
        } catch (error: any) { // Explicitly type error as 'any' or 'Error'
            toast.error(error.message || 'Error de conexión con el servidor');
        } finally {
            setLoading(false);
        }
    };

    const isStep1Valid = formData.clubName && formData.country && formData.district;
    const isStep2Valid = formData.adminName && formData.adminEmail && formData.adminPassword.length >= 6;
    const isStep3Valid = formData.subdomain.length >= 3;

    return (
        <div className="min-h-screen bg-gray-50 flex items-center justify-center p-6">
            <Link to="/" className="absolute top-6 left-6 flex items-center gap-2 text-sm font-bold text-gray-500 hover:text-rotary-blue transition-colors">
                <ChevronLeft className="w-4 h-4" /> Volver al Inicio
            </Link>

            <div className="w-full max-w-xl bg-white rounded-3xl shadow-xl overflow-hidden border border-gray-100">
                {/* Header */}
                <div className="bg-rotary-blue p-8 text-white text-center relative overflow-hidden">
                    <div className="absolute top-0 right-0 w-32 h-32 bg-white/10 rounded-full blur-2xl -translate-y-1/2 translate-x-1/2"></div>
                    <div className="relative z-10 flex justify-center mb-4">
                        <Globe className="w-10 h-10 text-rotary-gold" />
                    </div>
                    <h2 className="text-2xl font-bold mb-2">
                        {step === 1 ? 'Datos de tu Club' : step === 2 ? 'Cuenta Administrador' : 'Configuración Web'}
                    </h2>
                    <p className="text-blue-100 text-sm">Paso {step} de 3</p>
                </div>

                {/* Body */}
                <div className="p-8">
                    <form onSubmit={step === 3 ? handleSubmit : (e) => { e.preventDefault(); handleNext(); }}>

                        {/* STEP 1: Club Info */}
                        {step === 1 && (
                            <div className="space-y-6 animate-in slide-in-from-right-4 duration-300">
                                <div>
                                    <label className="block text-sm font-bold text-gray-700 mb-2">Nombre del Club Rotario</label>
                                    <div className="relative">
                                        <Building className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400" />
                                        <input
                                            type="text" required autoFocus
                                            className="w-full pl-10 pr-4 py-3 border border-gray-200 rounded-xl focus:ring-2 focus:ring-rotary-blue/20 outline-none"
                                            placeholder="Ej: Rotary Club Valle del Cauca"
                                            value={formData.clubName}
                                            onChange={e => setFormData({ ...formData, clubName: e.target.value })}
                                        />
                                    </div>
                                </div>
                                <div className="grid grid-cols-2 gap-4">
                                    <div>
                                        <label className="block text-sm font-bold text-gray-700 mb-2">País</label>
                                        <div className="relative">
                                            <MapPin className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400" />
                                            <input
                                                type="text" required
                                                className="w-full pl-10 pr-4 py-3 border border-gray-200 rounded-xl focus:ring-2 focus:ring-rotary-blue/20 outline-none"
                                                placeholder="Ej: Colombia"
                                                value={formData.country}
                                                onChange={e => setFormData({ ...formData, country: e.target.value })}
                                            />
                                        </div>
                                    </div>
                                    <div>
                                        <label className="block text-sm font-bold text-gray-700 mb-2">Distrito Rotario</label>
                                        <input
                                            type="text" required
                                            className="w-full px-4 py-3 border border-gray-200 rounded-xl focus:ring-2 focus:ring-rotary-blue/20 outline-none"
                                            placeholder="Ej: 4281"
                                            value={formData.district}
                                            onChange={e => setFormData({ ...formData, district: e.target.value })}
                                        />
                                    </div>
                                </div>
                            </div>
                        )}

                        {/* STEP 2: Admin Info */}
                        {step === 2 && (
                            <div className="space-y-6 animate-in slide-in-from-right-4 duration-300">
                                <div>
                                    <label className="block text-sm font-bold text-gray-700 mb-2">Tu Nombre Completo</label>
                                    <div className="relative">
                                        <User className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400" />
                                        <input
                                            type="text" required autoFocus
                                            className="w-full pl-10 pr-4 py-3 border border-gray-200 rounded-xl focus:ring-2 focus:ring-rotary-blue/20 outline-none"
                                            placeholder="Juan Pérez"
                                            value={formData.adminName}
                                            onChange={e => setFormData({ ...formData, adminName: e.target.value })}
                                        />
                                    </div>
                                </div>
                                <div>
                                    <label className="block text-sm font-bold text-gray-700 mb-2">Correo Electrónico (Login)</label>
                                    <input
                                        type="email" required
                                        className="w-full px-4 py-3 border border-gray-200 rounded-xl focus:ring-2 focus:ring-rotary-blue/20 outline-none"
                                        placeholder="admin@club.com"
                                        value={formData.adminEmail}
                                        onChange={e => setFormData({ ...formData, adminEmail: e.target.value })}
                                    />
                                </div>
                                <div>
                                    <label className="block text-sm font-bold text-gray-700 mb-2">Contraseña Segura</label>
                                    <div className="relative">
                                        <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400" />
                                        <input
                                            type="password" required minLength={6}
                                            className="w-full pl-10 pr-4 py-3 border border-gray-200 rounded-xl focus:ring-2 focus:ring-rotary-blue/20 outline-none"
                                            placeholder="Mínimo 6 caracteres"
                                            value={formData.adminPassword}
                                            onChange={e => setFormData({ ...formData, adminPassword: e.target.value })}
                                        />
                                    </div>
                                </div>
                            </div>
                        )}

                        {/* STEP 3: Technical Domain */}
                        {step === 3 && (
                            <div className="space-y-6 animate-in slide-in-from-right-4 duration-300">
                                <div className="p-4 bg-orange-50 border border-orange-100 rounded-xl mb-6 text-sm text-orange-800 font-medium">
                                    Crea la dirección temporal de tu club. En el futuro, podrás añadir tu propio dominio `.org` o `.com` desde el Panel Administrativo.
                                </div>

                                <div>
                                    <label className="block text-sm font-bold text-gray-700 mb-2">Subdominio Único</label>
                                    <div className="flex rounded-xl overflow-hidden border border-gray-200 focus-within:ring-2 focus-within:ring-rotary-blue/20 transition-shadow">
                                        <input
                                            type="text" required autoFocus
                                            className="w-full px-4 py-3 outline-none lowercase flex-1"
                                            placeholder="moclub-rotario"
                                            value={formData.subdomain}
                                            onChange={e => setFormData({ ...formData, subdomain: e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, '') })}
                                        />
                                        <div className="bg-gray-50 px-4 py-3 border-l border-gray-200 text-gray-500 font-bold text-sm flex items-center select-none">
                                            .clubplatform.org
                                        </div>
                                    </div>
                                    <p className="text-xs text-gray-400 mt-2">Solo usa minúsculas y guiones (ej. rotary-bogota).</p>
                                </div>
                            </div>
                        )}

                        {/* Footer Controls */}
                        <div className="mt-10 flex justify-between items-center pt-6 border-t border-gray-100">
                            {step > 1 ? (
                                <button type="button" onClick={handlePrev} className="text-sm font-bold text-gray-500 hover:text-gray-800">
                                    Atrás
                                </button>
                            ) : <div></div>}

                            <button
                                type="submit"
                                disabled={
                                    (step === 1 && !isStep1Valid) ||
                                    (step === 2 && !isStep2Valid) ||
                                    (step === 3 && !isStep3Valid) ||
                                    loading
                                }
                                className="bg-rotary-blue text-white px-8 py-3 rounded-xl font-bold flex items-center gap-2 hover:bg-sky-800 transition-colors disabled:opacity-50 disabled:cursor-not-allowed shadow-lg shadow-rotary-blue/20"
                            >
                                {step === 3 ? (loading ? 'Creando Club...' : 'Finalizar y Crear') : 'Continuar'}
                                {step < 3 && <ArrowRight className="w-4 h-4" />}
                            </button>
                        </div>
                    </form>
                </div>
            </div>
        </div>
    );
};

export default RegisterClub;
