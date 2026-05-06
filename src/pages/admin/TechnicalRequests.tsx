import React, { useState, useEffect } from 'react';
import { 
    ShieldCheck, 
    Plus, 
    Globe, 
    Clock, 
    CheckCircle2, 
    AlertCircle,
    ArrowRight,
    Lock,
    ExternalLink,
    CreditCard,
    ChevronRight,
    Info,
    User,
    Mail,
    Smartphone,
    Building2,
    MapPin
} from 'lucide-react';
import { useAuth } from '../../hooks/useAuth';
import { useClub } from '../../contexts/ClubContext';
import { toast } from 'sonner';

interface TechnicalRequest {
    id: string;
    type: string;
    status: string;
    subject: string;
    description: string;
    details: any;
    amount: number;
    paymentStatus: string;
    createdAt: string;
}

const TechnicalRequests: React.FC = () => {
    const { token } = useAuth();
    const { club } = useClub();
    const [requests, setRequests] = useState<TechnicalRequest[]>([]);
    const [isLoading, setIsLoading] = useState(true);
    const [isModalOpen, setIsModalOpen] = useState(false);
    
    // Form state
    const [domainName, setDomainName] = useState('');
    const [requesterName, setRequesterName] = useState('');
    const [requesterRole, setRequesterRole] = useState('');
    const [requesterWhatsApp, setRequesterWhatsApp] = useState('');
    const [requesterEmail, setRequesterEmail] = useState('');
    const [isSubmitting, setIsSubmitting] = useState(false);

    // Initial load and URL query params handling
    useEffect(() => {
        const query = new URLSearchParams(window.location.search);
        if (query.get('success')) {
            toast.success('¡Pago procesado correctamente! Tu solicitud está siendo atendida.');
            window.history.replaceState({}, '', window.location.pathname);
        }
        if (query.get('canceled')) {
            toast.error('El pago fue cancelado. Puedes intentarlo de nuevo cuando estés listo.');
            window.history.replaceState({}, '', window.location.pathname);
        }
    }, []);

    // Sync club data to form
    useEffect(() => {
        if (club) {
            setDomainName(club.domain || '');
        }
    }, [club]);

    // Fetch previous requests
    useEffect(() => {
        if (club?.id && token) {
            fetchRequests();
        }
    }, [club?.id, token]);

    const fetchRequests = async () => {
        try {
            const res = await fetch(`/api/technical-requests?clubId=${club.id}`, {
                headers: { 'Authorization': `Bearer ${token}` }
            });
            if (res.ok) {
                const data = await res.json();
                setRequests(data);
            }
        } catch (error) {
            console.error('Error fetching requests:', error);
        } finally {
            setIsLoading(false);
        }
    };

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        
        if (!domainName || !requesterName || !requesterWhatsApp || !requesterEmail) {
            return toast.error('Por favor completa todos los campos obligatorios');
        }

        setIsSubmitting(true);
        try {
            // 1. Create the request
            const res = await fetch('/api/technical-requests', {
                method: 'POST',
                headers: {
                    'Authorization': `Bearer ${token}`,
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({
                    clubId: club.id,
                    type: 'domain_transfer',
                    subject: `Liberación de Dominio: ${domainName}`,
                    description: `Solicitud de transferencia de salida para ${domainName} (Vía Valkomen).`,
                    details: {
                        domainName,
                        currentRegistrar: 'AWS Route 53 / Valkomen LLC',
                        requester: {
                            name: requesterName,
                            role: requesterRole,
                            whatsapp: requesterWhatsApp,
                            email: requesterEmail,
                            clubName: club?.name,
                            districtId: club?.districtId
                        }
                    },
                    amount: 29.00
                })
            });

            if (!res.ok) throw new Error('Error al registrar la solicitud');
            const requestData = await res.json();

            // 2. Create Stripe Session
            const stripeRes = await fetch('/api/technical-requests/checkout', {
                method: 'POST',
                headers: {
                    'Authorization': `Bearer ${token}`,
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({ requestId: requestData.id })
            });

            if (!stripeRes.ok) {
                const errData = await stripeRes.json();
                throw new Error(errData.error || 'Error al generar link de pago');
            }

            const { url } = await stripeRes.json();
            window.location.href = url;

        } catch (error: any) {
            toast.error(error.message || 'Error de conexión');
        } finally {
            setIsSubmitting(false);
        }
    };

    const getStatusStyle = (status: string) => {
        switch (status) {
            case 'pending': return 'bg-amber-50 text-amber-600 border-amber-100';
            case 'in_progress': return 'bg-blue-50 text-blue-600 border-blue-100';
            case 'completed': return 'bg-emerald-50 text-emerald-600 border-emerald-100';
            default: return 'bg-slate-50 text-slate-600 border-slate-100';
        }
    };

    const getStatusLabel = (status: string) => {
        switch (status) {
            case 'pending': return 'Pendiente';
            case 'in_progress': return 'En Proceso';
            case 'completed': return 'Completado';
            default: return status;
        }
    };

    return (
        <div className="p-4 md:p-8 max-w-7xl mx-auto space-y-8">
            {/* Header */}
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
                <div>
                    <h1 className="text-3xl font-black text-slate-900 tracking-tight flex items-center gap-3">
                        <ShieldCheck className="w-10 h-10 text-[#013388]" />
                        Solicitudes Técnicas
                    </h1>
                    <p className="text-slate-500 font-medium mt-1">Gestión administrativa de dominios y servicios técnicos.</p>
                </div>
                <button 
                    onClick={() => setIsModalOpen(true)}
                    className="flex items-center justify-center gap-2 px-6 py-3 bg-[#013388] text-white rounded-2xl font-black text-sm uppercase tracking-widest hover:bg-blue-900 transition-all shadow-xl shadow-[#013388]/20"
                >
                    <Plus className="w-5 h-5" /> Nueva Solicitud
                </button>
            </div>

            {/* List */}
            {isLoading ? (
                <div className="h-64 flex items-center justify-center">
                    <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-[#013388]"></div>
                </div>
            ) : requests.length === 0 ? (
                <div className="bg-white border-2 border-dashed border-slate-200 rounded-[32px] p-16 flex flex-col items-center text-center">
                    <div className="w-20 h-20 bg-slate-50 rounded-full flex items-center justify-center mb-6 text-slate-300">
                        <ShieldCheck className="w-10 h-10" />
                    </div>
                    <h3 className="text-xl font-black text-slate-800 mb-2">No hay solicitudes activas</h3>
                    <p className="text-slate-500 max-w-md font-medium mb-8">
                        ¿Necesitas transferir tu dominio o requieres algún ajuste técnico avanzado? Inicia una nueva solicitud aquí.
                    </p>
                    <button 
                        onClick={() => setIsModalOpen(true)}
                        className="px-8 py-4 bg-slate-100 text-slate-600 rounded-2xl font-black text-xs uppercase tracking-widest hover:bg-slate-200 transition-all"
                    >
                        Comenzar Primera Solicitud
                    </button>
                </div>
            ) : (
                <div className="grid grid-cols-1 gap-4">
                    {requests.map((req) => (
                        <div key={req.id} className="bg-white border border-slate-100 rounded-[24px] p-6 shadow-sm hover:shadow-md transition-all flex flex-col md:flex-row md:items-center justify-between gap-6">
                            <div className="flex items-center gap-4">
                                <div className={`w-14 h-14 rounded-2xl flex items-center justify-center shrink-0 border ${getStatusStyle(req.status)}`}>
                                    <Globe className="w-7 h-7" />
                                </div>
                                <div>
                                    <h4 className="font-black text-slate-900 flex items-center gap-2">
                                        {req.subject}
                                        <span className={`text-[9px] px-2 py-0.5 rounded-full border uppercase ${getStatusStyle(req.status)}`}>
                                            {getStatusLabel(req.status)}
                                        </span>
                                    </h4>
                                    <p className="text-xs text-slate-500 font-medium mt-1">{req.description}</p>
                                    <div className="flex items-center gap-4 mt-2">
                                        <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest flex items-center gap-1">
                                            <Clock className="w-3 h-3" /> {new Date(req.createdAt).toLocaleDateString()}
                                        </span>
                                        <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest flex items-center gap-1">
                                            <CreditCard className="w-3 h-3" /> {req.paymentStatus === 'paid' ? 'Pagado' : 'Pendiente'}
                                        </span>
                                    </div>
                                </div>
                            </div>
                            <div className="flex items-center gap-3">
                                <div className="text-right px-4 border-r border-slate-100 hidden md:block">
                                    <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Costo Total</p>
                                    <p className="text-lg font-black text-slate-900">${req.amount.toFixed(2)} USD</p>
                                </div>
                                <button className="p-3 bg-slate-50 text-slate-400 rounded-xl hover:bg-[#013388] hover:text-white transition-all">
                                    <ChevronRight className="w-5 h-5" />
                                </button>
                            </div>
                        </div>
                    ))}
                </div>
            )}

            {/* Modal */}
            {isModalOpen && (
                <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm z-[1000] flex items-center justify-center p-4">
                    <div className="bg-white w-full max-w-2xl rounded-[40px] shadow-2xl overflow-hidden animate-in zoom-in-95 duration-200 flex flex-col max-h-[90vh]">
                        <div className="p-8 border-b border-slate-50 flex items-center justify-between bg-slate-50/50">
                            <div className="flex items-center gap-4">
                                <div className="w-12 h-12 bg-[#013388] rounded-2xl flex items-center justify-center text-white">
                                    <Globe className="w-6 h-6" />
                                </div>
                                <div>
                                    <h3 className="text-lg font-black text-slate-900 uppercase tracking-tight">Solicitud de Transferencia</h3>
                                    <p className="text-[10px] text-slate-500 font-bold uppercase tracking-widest">Liberación Técnica de Dominio</p>
                                </div>
                            </div>
                            <button onClick={() => setIsModalOpen(false)} className="text-slate-400 hover:text-slate-600 transition-all p-2 bg-white rounded-full shadow-sm">
                                <XIcon className="w-6 h-6" />
                            </button>
                        </div>

                        <div className="flex-1 overflow-y-auto p-8 space-y-8">
                            <div className="bg-blue-50 border border-blue-100 rounded-3xl p-6 flex gap-4">
                                <Info className="w-6 h-6 text-[#013388] shrink-0 mt-0.5" />
                                <div className="space-y-2">
                                    <p className="text-sm text-[#013388] font-bold">Instrucciones de Transferencia</p>
                                    <p className="text-xs text-[#013388]/80 font-medium leading-relaxed">
                                        Este proceso liberará tu dominio para ser transferido a otro registrador. El cargo de **$29.00 USD** incluye la renovación final necesaria y la emisión del código **Auth/EPP**, el cual será enviado a tu correo tras el pago.
                                    </p>
                                </div>
                            </div>

                            <form onSubmit={handleSubmit} className="space-y-8">
                                {/* Seccion Dominio */}
                                <div className="space-y-4">
                                    <h4 className="text-[10px] font-black text-slate-400 uppercase tracking-widest flex items-center gap-2">
                                        <Globe className="w-3 h-3" /> Información del Dominio
                                    </h4>
                                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                        <div className="space-y-2">
                                            <label className="text-[10px] font-bold text-slate-500 uppercase ml-1">Nombre del Dominio</label>
                                            <div className="relative">
                                                <Globe className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                                                <input 
                                                    type="text" 
                                                    value={domainName}
                                                    onChange={(e) => setDomainName(e.target.value)}
                                                    placeholder="ejemplo.com"
                                                    className="w-full bg-slate-50 border border-slate-100 rounded-2xl py-4 pl-12 pr-4 text-sm font-bold text-slate-800 outline-none focus:ring-4 focus:ring-blue-500/5 focus:border-[#013388] transition-all"
                                                />
                                            </div>
                                        </div>
                                        <div className="space-y-2">
                                            <label className="text-[10px] font-bold text-slate-500 uppercase ml-1">Registrador Actual</label>
                                            <div className="w-full bg-slate-100 border border-slate-200 rounded-2xl py-4 px-4 text-sm font-black text-slate-400 flex items-center gap-2">
                                                <Lock className="w-4 h-4" /> AWS Route 53 / Valkomen LLC
                                            </div>
                                        </div>
                                    </div>
                                </div>

                                {/* Seccion Contacto */}
                                <div className="space-y-4">
                                    <h4 className="text-[10px] font-black text-slate-400 uppercase tracking-widest flex items-center gap-2">
                                        <User className="w-3 h-3" /> Datos del Solicitante
                                    </h4>
                                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                        <div className="space-y-2">
                                            <label className="text-[10px] font-bold text-slate-500 uppercase ml-1">Nombre y Apellido *</label>
                                            <div className="relative">
                                                <User className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                                                <input 
                                                    type="text" 
                                                    required
                                                    value={requesterName}
                                                    onChange={(e) => setRequesterName(e.target.value)}
                                                    placeholder="Ej: Juan Pérez"
                                                    className="w-full bg-slate-50 border border-slate-100 rounded-2xl py-4 pl-12 pr-4 text-sm font-bold text-slate-800 outline-none focus:ring-4 focus:ring-blue-500/5 focus:border-[#013388] transition-all"
                                                />
                                            </div>
                                        </div>
                                        <div className="space-y-2">
                                            <label className="text-[10px] font-bold text-slate-500 uppercase ml-1">Cargo / Rol</label>
                                            <input 
                                                type="text" 
                                                value={requesterRole}
                                                onChange={(e) => setRequesterRole(e.target.value)}
                                                placeholder="Ej: Presidente"
                                                className="w-full bg-slate-50 border border-slate-100 rounded-2xl py-4 px-4 text-sm font-bold text-slate-800 outline-none focus:ring-4 focus:ring-blue-500/5 focus:border-[#013388] transition-all"
                                            />
                                        </div>
                                        <div className="space-y-2">
                                            <label className="text-[10px] font-bold text-slate-500 uppercase ml-1">WhatsApp *</label>
                                            <div className="relative">
                                                <Smartphone className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                                                <input 
                                                    type="text" 
                                                    required
                                                    value={requesterWhatsApp}
                                                    onChange={(e) => setRequesterWhatsApp(e.target.value)}
                                                    placeholder="+57 300..."
                                                    className="w-full bg-slate-50 border border-slate-100 rounded-2xl py-4 pl-12 pr-4 text-sm font-bold text-slate-800 outline-none focus:ring-4 focus:ring-blue-500/5 focus:border-[#013388] transition-all"
                                                />
                                            </div>
                                        </div>
                                        <div className="space-y-2">
                                            <label className="text-[10px] font-bold text-slate-500 uppercase ml-1">Email Institucional *</label>
                                            <div className="relative">
                                                <Mail className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                                                <input 
                                                    type="email" 
                                                    required
                                                    value={requesterEmail}
                                                    onChange={(e) => setRequesterEmail(e.target.value)}
                                                    placeholder="admin@club.org"
                                                    className="w-full bg-slate-50 border border-slate-100 rounded-2xl py-4 pl-12 pr-4 text-sm font-bold text-slate-800 outline-none focus:ring-4 focus:ring-blue-500/5 focus:border-[#013388] transition-all"
                                                />
                                            </div>
                                        </div>
                                        <div className="space-y-2">
                                            <label className="text-[10px] font-bold text-slate-500 uppercase ml-1">Club</label>
                                            <div className="w-full bg-slate-100 border border-slate-200 rounded-2xl py-4 px-4 text-sm font-bold text-slate-400 flex items-center gap-2">
                                                <Building2 className="w-4 h-4" /> {club?.name}
                                            </div>
                                        </div>
                                        <div className="space-y-2">
                                            <label className="text-[10px] font-bold text-slate-500 uppercase ml-1">Distrito</label>
                                            <div className="w-full bg-slate-100 border border-slate-200 rounded-2xl py-4 px-4 text-sm font-bold text-slate-400 flex items-center gap-2">
                                                <MapPin className="w-4 h-4" /> {club?.districtId}
                                            </div>
                                        </div>
                                    </div>
                                </div>
                            </form>
                        </div>

                        {/* Footer / Payment */}
                        <div className="p-8 border-t border-slate-100 bg-slate-50/50">
                            <div className="flex items-center justify-between mb-6 p-6 bg-slate-900 rounded-[32px] text-white">
                                <div className="flex items-center gap-4">
                                    <div className="w-12 h-12 bg-white/10 rounded-2xl flex items-center justify-center">
                                        <CreditCard className="w-6 h-6 text-white" />
                                    </div>
                                    <div>
                                        <p className="text-[10px] font-black text-white/40 uppercase tracking-widest">Total del Servicio</p>
                                        <p className="text-2xl font-black">$29.00 USD</p>
                                    </div>
                                </div>
                                <div className="text-right hidden sm:block">
                                    <p className="text-[10px] font-black text-white/40 uppercase tracking-widest">Pago Seguro</p>
                                    <p className="text-xs font-bold text-white/60">Stripe Encryption</p>
                                </div>
                            </div>

                            <button 
                                onClick={handleSubmit}
                                disabled={isSubmitting}
                                className="w-full py-5 bg-[#013388] text-white rounded-[24px] font-black text-sm uppercase tracking-widest hover:bg-blue-900 transition-all shadow-xl shadow-[#013388]/20 flex items-center justify-center gap-3 disabled:opacity-50"
                            >
                                {isSubmitting ? (
                                    <>
                                        <div className="w-5 h-5 border-2 border-white/20 border-t-white rounded-full animate-spin" />
                                        Iniciando Pago Seguro...
                                    </>
                                ) : (
                                    <>Solicitar y Pagar Transferencia <ArrowRight className="w-5 h-5" /></>
                                )}
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
};

export default TechnicalRequests;

const XIcon: React.FC<{ className?: string }> = ({ className }) => (
    <svg className={className} fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M6 18L18 6M6 6l12 12" />
    </svg>
);
