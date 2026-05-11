import React, { useEffect, useMemo, useState } from 'react';
import {
    X,
    Send,
    Clock,
    Loader2,
    Sparkles,
    Instagram,
    Facebook,
    CheckCircle2,
    AlertCircle
} from 'lucide-react';
import { toast } from 'sonner';

interface SocialAccount {
    id: string;
    platform: string;
    accountName: string | null;
    avatar?: string | null;
    status?: string;
}

interface VideoProject {
    id: string;
    title: string;
    videoUrl: string | null;
    status: string;
}

interface PublishModalProps {
    isOpen: boolean;
    project: VideoProject | null;
    onClose: () => void;
    onPublished?: () => void;
}

const PLATFORM_META: Record<string, { label: string; icon: React.ComponentType<any>; color: string; bg: string }> = {
    instagram: { label: 'Instagram', icon: Instagram, color: 'text-pink-600', bg: 'bg-pink-50' },
    facebook: { label: 'Facebook', icon: Facebook, color: 'text-blue-600', bg: 'bg-blue-50' },
    youtube: { label: 'YouTube', icon: Send, color: 'text-red-600', bg: 'bg-red-50' },
    tiktok: { label: 'TikTok', icon: Send, color: 'text-slate-900', bg: 'bg-slate-50' }
};

const PublishModal: React.FC<PublishModalProps> = ({ isOpen, project, onClose, onPublished }) => {
    const [accounts, setAccounts] = useState<SocialAccount[]>([]);
    const [loadingAccounts, setLoadingAccounts] = useState(false);
    const [selectedAccountIds, setSelectedAccountIds] = useState<string[]>([]);
    const [caption, setCaption] = useState('');
    const [scheduledFor, setScheduledFor] = useState<string>('');
    const [submitting, setSubmitting] = useState(false);
    const [generatingCaption, setGeneratingCaption] = useState(false);

    const API = import.meta.env.VITE_API_URL || '/api';

    useEffect(() => {
        if (!isOpen) return;
        setCaption('');
        setScheduledFor('');
        setSelectedAccountIds([]);
        fetchAccounts();
    }, [isOpen]);

    const fetchAccounts = async () => {
        setLoadingAccounts(true);
        try {
            const token = localStorage.getItem('rotary_token');
            const res = await fetch(`${API}/content-studio/accounts`, {
                headers: { Authorization: `Bearer ${token}` }
            });
            if (res.ok) {
                const data = await res.json();
                setAccounts(data.filter((a: SocialAccount) => a.status !== 'expired'));
            }
        } catch {
            toast.error('Error al cargar cuentas');
        } finally {
            setLoadingAccounts(false);
        }
    };

    const generateCaption = async () => {
        if (!project) return;
        setGeneratingCaption(true);
        try {
            const token = localStorage.getItem('rotary_token');
            const res = await fetch(`${API}/content-studio/captions/suggest`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    Authorization: `Bearer ${token}`
                },
                body: JSON.stringify({ projectId: project.id })
            });
            const data = await res.json();
            if (res.ok && data.caption) {
                setCaption(data.caption);
                toast.success('Caption generado con IA');
            } else {
                toast.error(data.error || 'No se pudo generar el caption');
            }
        } catch {
            toast.error('Error de conexión con IA');
        } finally {
            setGeneratingCaption(false);
        }
    };

    const toggleAccount = (id: string) => {
        setSelectedAccountIds((prev) =>
            prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]
        );
    };

    const handleSubmit = async () => {
        if (!project) return;
        if (selectedAccountIds.length === 0) {
            toast.error('Seleccioná al menos una cuenta');
            return;
        }
        if (project.status !== 'ready' || !project.videoUrl) {
            toast.error('El video todavía no está listo para publicar');
            return;
        }

        setSubmitting(true);
        const tId = toast.loading(scheduledFor ? 'Programando publicaciones...' : 'Publicando ahora...');
        const token = localStorage.getItem('rotary_token');

        try {
            const requests = selectedAccountIds.map((accountId) =>
                fetch(`${API}/content-studio/posts`, {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json',
                        Authorization: `Bearer ${token}`
                    },
                    body: JSON.stringify({
                        projectId: project.id,
                        socialAccountId: accountId,
                        caption,
                        scheduledFor: scheduledFor || null
                    })
                })
            );

            const results = await Promise.all(requests);
            const failed = results.filter((r) => !r.ok).length;

            if (failed === 0) {
                toast.success(
                    scheduledFor
                        ? `${selectedAccountIds.length} publicación(es) programada(s)`
                        : `${selectedAccountIds.length} publicación(es) en proceso`,
                    { id: tId }
                );
                onPublished?.();
                onClose();
            } else {
                toast.error(`${failed} publicación(es) fallaron`, { id: tId });
            }
        } catch {
            toast.error('Error al enviar las publicaciones', { id: tId });
        } finally {
            setSubmitting(false);
        }
    };

    const minDateTime = useMemo(() => {
        const d = new Date();
        d.setMinutes(d.getMinutes() + 5);
        return d.toISOString().slice(0, 16);
    }, []);

    if (!isOpen || !project) return null;

    return (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-black/40 backdrop-blur-md animate-in fade-in duration-200">
            <div className="bg-white w-full max-w-2xl max-h-[90vh] rounded-3xl shadow-2xl flex flex-col overflow-hidden animate-in zoom-in-95 duration-200">
                <div className="p-6 border-b border-gray-100 flex justify-between items-center bg-gray-50/50">
                    <div>
                        <h3 className="text-xl font-black text-gray-900">Publicar video</h3>
                        <p className="text-xs text-gray-500 font-bold uppercase tracking-widest mt-0.5 truncate max-w-md">
                            {project.title}
                        </p>
                    </div>
                    <button onClick={onClose} className="p-2 hover:bg-gray-200 rounded-full transition-all">
                        <X className="w-5 h-5 text-gray-400" />
                    </button>
                </div>

                <div className="flex-1 overflow-y-auto p-6 space-y-6">
                    {/* Accounts */}
                    <div>
                        <label className="text-[10px] font-extrabold text-gray-400 uppercase tracking-widest block mb-3">
                            Destinos
                        </label>
                        {loadingAccounts ? (
                            <div className="py-8 text-center">
                                <Loader2 className="w-6 h-6 animate-spin text-indigo-600 mx-auto" />
                            </div>
                        ) : accounts.length === 0 ? (
                            <div className="bg-amber-50 border border-amber-100 rounded-2xl p-4 flex gap-3 items-start">
                                <AlertCircle className="w-5 h-5 text-amber-600 shrink-0 mt-0.5" />
                                <div>
                                    <p className="text-sm font-bold text-amber-900">Sin cuentas conectadas</p>
                                    <p className="text-xs text-amber-700 font-medium mt-1">
                                        Conectá una cuenta en la pestaña "Cuentas Sociales" antes de publicar.
                                    </p>
                                </div>
                            </div>
                        ) : (
                            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                                {accounts.map((acc) => {
                                    const meta = PLATFORM_META[acc.platform] || PLATFORM_META.instagram;
                                    const Icon = meta.icon;
                                    const selected = selectedAccountIds.includes(acc.id);
                                    return (
                                        <button
                                            key={acc.id}
                                            type="button"
                                            onClick={() => toggleAccount(acc.id)}
                                            className={`p-4 rounded-2xl border-2 flex items-center gap-3 transition-all text-left ${
                                                selected
                                                    ? 'border-indigo-600 bg-indigo-50/50 ring-4 ring-indigo-600/10'
                                                    : 'border-gray-100 bg-white hover:border-indigo-200'
                                            }`}
                                        >
                                            <div className={`w-10 h-10 rounded-xl ${meta.bg} ${meta.color} flex items-center justify-center shrink-0`}>
                                                <Icon className="w-5 h-5" />
                                            </div>
                                            <div className="flex-1 min-w-0">
                                                <p className="text-xs font-black text-gray-900 capitalize">{meta.label}</p>
                                                <p className="text-[11px] font-bold text-gray-500 truncate">
                                                    @{acc.accountName || 'cuenta'}
                                                </p>
                                            </div>
                                            {selected && (
                                                <CheckCircle2 className="w-5 h-5 text-indigo-600 shrink-0" />
                                            )}
                                        </button>
                                    );
                                })}
                            </div>
                        )}
                    </div>

                    {/* Caption */}
                    <div>
                        <div className="flex justify-between items-center mb-2">
                            <label className="text-[10px] font-extrabold text-gray-400 uppercase tracking-widest">
                                Caption
                            </label>
                            <button
                                type="button"
                                onClick={generateCaption}
                                disabled={generatingCaption}
                                className="flex items-center gap-1.5 px-3 py-1 bg-indigo-50 text-indigo-600 rounded-lg text-[10px] font-black uppercase hover:bg-indigo-100 transition-all disabled:opacity-50"
                            >
                                {generatingCaption ? (
                                    <Loader2 className="w-3 h-3 animate-spin" />
                                ) : (
                                    <Sparkles className="w-3 h-3" />
                                )}
                                {generatingCaption ? 'Generando...' : 'Sugerir con IA'}
                            </button>
                        </div>
                        <textarea
                            className="w-full bg-gray-50 border border-gray-100 rounded-xl px-4 py-3 text-sm font-medium text-gray-700 outline-none focus:ring-2 focus:ring-indigo-600/10 focus:border-indigo-600 transition-all resize-none h-28 font-sans"
                            placeholder="Escribí un caption emocional, agregá hashtags al final..."
                            value={caption}
                            onChange={(e) => setCaption(e.target.value)}
                            maxLength={2200}
                        />
                        <p className="text-[10px] font-bold text-gray-400 text-right mt-1">{caption.length}/2200</p>
                    </div>

                    {/* Schedule */}
                    <div>
                        <label className="text-[10px] font-extrabold text-gray-400 uppercase tracking-widest block mb-2">
                            Programación (opcional)
                        </label>
                        <div className="flex gap-2 items-center">
                            <Clock className="w-4 h-4 text-gray-400" />
                            <input
                                type="datetime-local"
                                className="flex-1 bg-gray-50 border border-gray-100 rounded-xl px-4 py-3 text-sm font-bold text-gray-700 outline-none focus:ring-2 focus:ring-indigo-600/10 focus:border-indigo-600 transition-all font-sans"
                                value={scheduledFor}
                                min={minDateTime}
                                onChange={(e) => setScheduledFor(e.target.value)}
                            />
                            {scheduledFor && (
                                <button
                                    type="button"
                                    onClick={() => setScheduledFor('')}
                                    className="text-xs font-black text-gray-400 hover:text-gray-700 px-2"
                                >
                                    Limpiar
                                </button>
                            )}
                        </div>
                        <p className="text-[10px] font-medium text-gray-500 mt-2">
                            Si lo dejás vacío, se publicará en cuanto confirmes.
                        </p>
                    </div>
                </div>

                <div className="p-6 border-t border-gray-100 flex justify-between items-center bg-gray-50/50 gap-3">
                    <p className="text-[11px] font-medium text-gray-500 hidden sm:block">
                        Se enviará al motor de publicación de cada red.
                    </p>
                    <div className="flex gap-3 ml-auto">
                        <button
                            type="button"
                            onClick={onClose}
                            disabled={submitting}
                            className="px-6 py-2.5 rounded-xl text-sm font-bold text-gray-500 hover:bg-gray-200 transition-all"
                        >
                            Cancelar
                        </button>
                        <button
                            type="button"
                            onClick={handleSubmit}
                            disabled={submitting || selectedAccountIds.length === 0}
                            className="px-8 py-2.5 bg-indigo-600 text-white rounded-xl text-sm font-black disabled:opacity-50 shadow-xl shadow-indigo-600/20 hover:scale-105 transition-all flex items-center gap-2"
                        >
                            {submitting ? (
                                <Loader2 className="w-4 h-4 animate-spin" />
                            ) : (
                                <Send className="w-4 h-4" />
                            )}
                            {scheduledFor ? 'Programar' : 'Publicar ahora'}
                            {selectedAccountIds.length > 0 && ` (${selectedAccountIds.length})`}
                        </button>
                    </div>
                </div>
            </div>
        </div>
    );
};

export default PublishModal;
