import React, { useState } from 'react';
import { Stethoscope, X, Loader2, CheckCircle2, XCircle, Copy } from 'lucide-react';
import { toast } from 'sonner';

interface DiagnosticData {
    timestamp: string;
    env: Record<string, boolean | string>;
    connectivity: {
        kie: any;
        meta: any;
    };
    db: {
        videoProjects: number;
        stuckInProcessing: number;
        socialAccounts: number;
        pendingPosts: number;
    };
    oauthCallbackUrls: { facebook: string; instagram: string };
    kieWebhookUrl: string;
}

const Diagnostic: React.FC = () => {
    const [open, setOpen] = useState(false);
    const [loading, setLoading] = useState(false);
    const [data, setData] = useState<DiagnosticData | null>(null);

    const run = async () => {
        setLoading(true);
        try {
            const token = localStorage.getItem('rotary_token');
            const res = await fetch(`${import.meta.env.VITE_API_URL || '/api'}/content-studio/diagnostic`, {
                headers: { Authorization: `Bearer ${token}` }
            });
            const json = await res.json();
            if (res.ok) {
                setData(json);
                setOpen(true);
            } else {
                toast.error(json.error || 'Error al obtener diagnóstico');
            }
        } catch {
            toast.error('Error de conexión');
        } finally {
            setLoading(false);
        }
    };

    const renderRow = (label: string, ok: boolean | string, hint?: string) => {
        const isBoolean = typeof ok === 'boolean';
        return (
            <div className="flex items-start justify-between py-2 border-b border-gray-100 last:border-0">
                <div className="min-w-0 flex-1">
                    <p className="text-xs font-bold text-gray-700">{label}</p>
                    {hint && <p className="text-[10px] text-gray-400 font-medium">{hint}</p>}
                </div>
                {isBoolean ? (
                    ok ? (
                        <span className="inline-flex items-center gap-1 text-emerald-600 text-[10px] font-black uppercase">
                            <CheckCircle2 className="w-3 h-3" /> OK
                        </span>
                    ) : (
                        <span className="inline-flex items-center gap-1 text-red-600 text-[10px] font-black uppercase">
                            <XCircle className="w-3 h-3" /> Falta
                        </span>
                    )
                ) : (
                    <span className="text-[11px] font-mono text-gray-600 truncate max-w-[200px]" title={String(ok)}>
                        {String(ok)}
                    </span>
                )}
            </div>
        );
    };

    const copy = (text: string) => {
        navigator.clipboard.writeText(text);
        toast.success('Copiado');
    };

    return (
        <>
            <button
                onClick={run}
                disabled={loading}
                className="flex items-center gap-2 px-4 py-2 bg-amber-50 text-amber-700 border border-amber-100 rounded-xl hover:bg-amber-100 transition-all text-xs font-black uppercase tracking-wider disabled:opacity-50"
            >
                {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Stethoscope className="w-4 h-4" />}
                Diagnóstico
            </button>

            {open && data && (
                <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-black/40 backdrop-blur-md">
                    <div className="bg-white w-full max-w-3xl max-h-[90vh] rounded-3xl shadow-2xl flex flex-col overflow-hidden">
                        <div className="p-6 border-b border-gray-100 flex justify-between items-center bg-gray-50/50">
                            <div>
                                <h3 className="text-xl font-black text-gray-900">Diagnóstico Content Studio</h3>
                                <p className="text-[11px] text-gray-500 font-bold">{new Date(data.timestamp).toLocaleString()}</p>
                            </div>
                            <button onClick={() => setOpen(false)} className="p-2 hover:bg-gray-200 rounded-full">
                                <X className="w-5 h-5 text-gray-400" />
                            </button>
                        </div>

                        <div className="flex-1 overflow-y-auto p-6 space-y-6">
                            {/* Env vars */}
                            <div>
                                <h4 className="text-[10px] font-black uppercase tracking-widest text-gray-400 mb-3">Variables de entorno</h4>
                                <div className="bg-gray-50 rounded-2xl p-4 border border-gray-100">
                                    {renderRow('KIE_API_KEY', data.env.KIE_API_KEY, 'Generación de video con KIE.ai')}
                                    {renderRow('META_APP_ID', data.env.META_APP_ID, 'OAuth Facebook/Instagram')}
                                    {renderRow('META_APP_SECRET', data.env.META_APP_SECRET, 'Intercambio de token Meta')}
                                    {renderRow('GEMINI_API_KEY', data.env.GEMINI_API_KEY, 'Captions con IA')}
                                    {renderRow('APP_URL', data.env.APP_URL, 'Base de URLs públicas')}
                                    {renderRow('CRON_SECRET', data.env.CRON_SECRET, 'Auth del cron de Vercel')}
                                    {renderRow('AWS_BUCKET_NAME', data.env.AWS_BUCKET_NAME)}
                                    {renderRow('KIE_MODEL', data.env.KIE_MODEL)}
                                </div>
                            </div>

                            {/* Connectivity */}
                            <div>
                                <h4 className="text-[10px] font-black uppercase tracking-widest text-gray-400 mb-3">Conectividad externa</h4>
                                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                                    <div className="bg-gray-50 rounded-2xl p-4 border border-gray-100">
                                        <p className="text-xs font-black text-gray-900 mb-2">KIE.ai</p>
                                        <pre className="text-[10px] font-mono text-gray-600 overflow-x-auto">{JSON.stringify(data.connectivity.kie, null, 2)}</pre>
                                    </div>
                                    <div className="bg-gray-50 rounded-2xl p-4 border border-gray-100">
                                        <p className="text-xs font-black text-gray-900 mb-2">Meta Graph API</p>
                                        <pre className="text-[10px] font-mono text-gray-600 overflow-x-auto">{JSON.stringify(data.connectivity.meta, null, 2)}</pre>
                                    </div>
                                </div>
                            </div>

                            {/* URLs */}
                            <div>
                                <h4 className="text-[10px] font-black uppercase tracking-widest text-gray-400 mb-3">URLs que tenés que autorizar en Meta App</h4>
                                <div className="bg-indigo-50/50 border border-indigo-100 rounded-2xl p-4 space-y-2">
                                    <div className="flex items-center justify-between gap-2">
                                        <code className="text-[11px] text-indigo-700 font-mono truncate flex-1">{data.oauthCallbackUrls.facebook}</code>
                                        <button onClick={() => copy(data.oauthCallbackUrls.facebook)} className="p-1 hover:bg-indigo-100 rounded">
                                            <Copy className="w-3 h-3 text-indigo-600" />
                                        </button>
                                    </div>
                                    <div className="flex items-center justify-between gap-2">
                                        <code className="text-[11px] text-indigo-700 font-mono truncate flex-1">{data.oauthCallbackUrls.instagram}</code>
                                        <button onClick={() => copy(data.oauthCallbackUrls.instagram)} className="p-1 hover:bg-indigo-100 rounded">
                                            <Copy className="w-3 h-3 text-indigo-600" />
                                        </button>
                                    </div>
                                </div>
                                <p className="text-[10px] text-gray-500 mt-2 font-medium">
                                    En Meta Developers → Tu App → Facebook Login → Settings → "Valid OAuth Redirect URIs"
                                </p>
                            </div>

                            <div>
                                <h4 className="text-[10px] font-black uppercase tracking-widest text-gray-400 mb-3">Webhook URL para KIE.ai</h4>
                                <div className="bg-indigo-50/50 border border-indigo-100 rounded-2xl p-4 flex items-center justify-between gap-2">
                                    <code className="text-[11px] text-indigo-700 font-mono truncate flex-1">{data.kieWebhookUrl}</code>
                                    <button onClick={() => copy(data.kieWebhookUrl)} className="p-1 hover:bg-indigo-100 rounded">
                                        <Copy className="w-3 h-3 text-indigo-600" />
                                    </button>
                                </div>
                            </div>

                            <div>
                                <h4 className="text-[10px] font-black uppercase tracking-widest text-gray-400 mb-3">Estado de la base de datos</h4>
                                <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                                    {Object.entries(data.db).map(([k, v]) => (
                                        <div key={k} className="bg-gray-50 rounded-2xl p-4 border border-gray-100 text-center">
                                            <p className="text-2xl font-black text-gray-900">{v}</p>
                                            <p className="text-[9px] font-black uppercase tracking-tight text-gray-400 mt-1">{k}</p>
                                        </div>
                                    ))}
                                </div>
                            </div>
                        </div>
                    </div>
                </div>
            )}
        </>
    );
};

export default Diagnostic;
