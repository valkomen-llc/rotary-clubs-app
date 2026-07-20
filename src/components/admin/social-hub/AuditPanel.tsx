import React, { useEffect, useState, useCallback } from 'react';
import { ShieldCheck, Loader2, Webhook, Activity, CheckCircle2, XCircle } from 'lucide-react';
import { toast } from 'sonner';

const API = import.meta.env.VITE_API_URL || '/api';
const authHeaders = () => ({ Authorization: `Bearer ${localStorage.getItem('rotary_token')}` });

interface AuditEntry {
    id: string; action: string; status: string; target: string | null;
    detail: any; createdAt: string; userId: string | null;
}
interface WebhookEvent {
    id: string; object: string | null; field: string | null; status: string;
    signatureOk: boolean; error: string | null; createdAt: string;
}

const actionTint = (action: string) => {
    if (action.includes('error') || action === 'hide') return 'bg-red-50 text-red-600';
    if (action === 'connect' || action === 'publish' || action === 'reply') return 'bg-emerald-50 text-emerald-600';
    if (action === 'disconnect') return 'bg-amber-50 text-amber-600';
    return 'bg-gray-100 text-gray-600';
};

const AuditPanel: React.FC = () => {
    const [tab, setTab] = useState<'audit' | 'webhooks'>('audit');
    const [audit, setAudit] = useState<AuditEntry[]>([]);
    const [events, setEvents] = useState<WebhookEvent[]>([]);
    const [loading, setLoading] = useState(true);

    const load = useCallback(async () => {
        setLoading(true);
        try {
            const [a, w] = await Promise.all([
                fetch(`${API}/social/audit`, { headers: authHeaders() }),
                fetch(`${API}/social/webhooks/events`, { headers: authHeaders() })
            ]);
            if (a.ok) setAudit(await a.json());
            if (w.ok) setEvents(await w.json());
        } catch { toast.error('Error al cargar auditoría'); }
        finally { setLoading(false); }
    }, []);
    useEffect(() => { load(); }, [load]);

    if (loading) return <div className="flex justify-center py-12"><Loader2 className="w-5 h-5 text-gray-300 animate-spin" /></div>;

    return (
        <div className="space-y-5">
            <div className="flex items-center gap-2">
                <button onClick={() => setTab('audit')}
                    className={`px-4 py-2 rounded-xl font-bold text-sm flex items-center gap-2 transition-all ${tab === 'audit' ? 'bg-gray-900 text-white shadow' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'}`}>
                    <Activity className="w-4 h-4" /> Auditoría
                </button>
                <button onClick={() => setTab('webhooks')}
                    className={`px-4 py-2 rounded-xl font-bold text-sm flex items-center gap-2 transition-all ${tab === 'webhooks' ? 'bg-gray-900 text-white shadow' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'}`}>
                    <Webhook className="w-4 h-4" /> Webhooks recibidos
                </button>
            </div>

            {tab === 'audit' ? (
                audit.length === 0 ? (
                    <div className="bg-gray-50 border border-gray-100 rounded-3xl p-10 text-center">
                        <ShieldCheck className="w-10 h-10 text-gray-300 mx-auto mb-3" />
                        <p className="font-bold text-gray-700">Sin registros de auditoría</p>
                        <p className="text-xs text-gray-500 mt-1">Las conexiones, publicaciones y renovaciones de token aparecerán acá.</p>
                    </div>
                ) : (
                    <div className="bg-white rounded-3xl border border-gray-100 divide-y divide-gray-50 overflow-hidden">
                        {audit.map(e => (
                            <div key={e.id} className="flex items-center gap-3 p-4">
                                <span className={`text-[10px] font-black uppercase px-2 py-1 rounded-md ${actionTint(e.action)}`}>{e.action}</span>
                                <div className="flex-1 min-w-0">
                                    <p className="text-xs text-gray-500 truncate">
                                        {e.detail ? JSON.stringify(e.detail) : (e.target || '—')}
                                    </p>
                                </div>
                                {e.status === 'ok'
                                    ? <CheckCircle2 className="w-4 h-4 text-emerald-500 shrink-0" />
                                    : <XCircle className="w-4 h-4 text-red-500 shrink-0" />}
                                <span className="text-[10px] font-bold text-gray-400 shrink-0">{new Date(e.createdAt).toLocaleString()}</span>
                            </div>
                        ))}
                    </div>
                )
            ) : (
                events.length === 0 ? (
                    <div className="bg-gray-50 border border-gray-100 rounded-3xl p-10 text-center">
                        <Webhook className="w-10 h-10 text-gray-300 mx-auto mb-3" />
                        <p className="font-bold text-gray-700">Sin eventos de webhook</p>
                        <p className="text-xs text-gray-500 mt-1 max-w-md mx-auto">
                            Configurá el webhook en Meta apuntando a <code className="px-1 bg-gray-100 rounded">/api/social/webhooks/meta</code> y suscribí los campos deseados.
                        </p>
                    </div>
                ) : (
                    <div className="bg-white rounded-3xl border border-gray-100 divide-y divide-gray-50 overflow-hidden">
                        {events.map(e => (
                            <div key={e.id} className="flex items-center gap-3 p-4">
                                <span className="text-[10px] font-black uppercase px-2 py-1 rounded-md bg-indigo-50 text-indigo-600">{e.object || '?'} · {e.field || '?'}</span>
                                <span className={`text-[10px] font-bold px-2 py-1 rounded ${e.status === 'processed' ? 'bg-emerald-50 text-emerald-600' : e.status === 'failed' ? 'bg-red-50 text-red-600' : 'bg-gray-100 text-gray-500'}`}>{e.status}</span>
                                <div className="flex-1 min-w-0 text-xs text-gray-500 truncate">{e.error || (e.signatureOk ? 'firma OK' : 'sin firma')}</div>
                                <span className="text-[10px] font-bold text-gray-400 shrink-0">{new Date(e.createdAt).toLocaleString()}</span>
                            </div>
                        ))}
                    </div>
                )
            )}
        </div>
    );
};

export default AuditPanel;
