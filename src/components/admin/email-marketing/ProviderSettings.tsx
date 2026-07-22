import React, { useCallback, useEffect, useState } from 'react';
import {
    Server, CheckCircle2, AlertTriangle, RefreshCw, Send, Save, ShieldCheck,
    Globe, Info, Clock, Mail,
} from 'lucide-react';
import { toast } from 'sonner';

const API = import.meta.env.VITE_API_URL || '/api';
const authHeaders = () => ({ 'Authorization': `Bearer ${localStorage.getItem('rotary_token')}` });

const MASK = '••••••••';

interface EmailConfig {
    email_provider?: string;
    email_from?: string;
    smtp_host?: string;
    smtp_port?: string;
    smtp_user?: string;
    smtp_password?: string;
    smtp_from_name?: string;
    smtp_from_email?: string;
}
interface Diagnostics {
    resend: { configured: boolean; domains: { name: string; status: string; region?: string }[] | null; error: string | null };
    smtpFallback: { available: boolean; count: number };
    sender: string;
    platformConfig: { emailFrom: string | null; emailProvider: string | null };
}

// Presets de host/puerto para proveedores SMTP conocidos.
const SMTP_PRESETS: Record<string, { label: string; host: string; port: string; hint?: string }> = {
    resend: { label: 'Resend (SMTP)', host: 'smtp.resend.com', port: '465', hint: 'Usuario: "resend" · contraseña: tu API key' },
    ses: { label: 'Amazon SES', host: 'email-smtp.us-east-1.amazonaws.com', port: '587', hint: 'Usa credenciales SMTP de IAM (no la API key)' },
    sendgrid: { label: 'SendGrid', host: 'smtp.sendgrid.net', port: '587', hint: 'Usuario: "apikey" · contraseña: tu API key' },
    mailgun: { label: 'Mailgun', host: 'smtp.mailgun.org', port: '587' },
    postmark: { label: 'Postmark', host: 'smtp.postmarkapp.com', port: '587', hint: 'Usuario y contraseña: tu Server Token' },
    brevo: { label: 'Brevo (Sendinblue)', host: 'smtp-relay.brevo.com', port: '587' },
    custom: { label: 'Personalizado', host: '', port: '587' },
};

const inputCls = 'w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:ring-2 focus:ring-rotary-blue outline-none';
const labelCls = 'block text-[11px] font-bold text-gray-500 uppercase tracking-wide mb-1';

const DomainStatus: React.FC<{ status: string }> = ({ status }) => {
    const s = (status || '').toLowerCase();
    const meta = s === 'verified'
        ? { cls: 'bg-emerald-100 text-emerald-700', icon: <CheckCircle2 className="w-3 h-3" /> }
        : s === 'pending' || s === 'not_started'
            ? { cls: 'bg-amber-100 text-amber-700', icon: <Clock className="w-3 h-3" /> }
            : { cls: 'bg-rose-100 text-rose-700', icon: <AlertTriangle className="w-3 h-3" /> };
    return <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold uppercase ${meta.cls}`}>{meta.icon} {status}</span>;
};

const ProviderSettings: React.FC = () => {
    const [cfg, setCfg] = useState<EmailConfig>({});
    const [diag, setDiag] = useState<Diagnostics | null>(null);
    const [loading, setLoading] = useState(true);
    const [saving, setSaving] = useState(false);
    const [testing, setTesting] = useState(false);
    const [preset, setPreset] = useState('custom');

    const load = useCallback(async () => {
        setLoading(true);
        try {
            const [cRes, dRes] = await Promise.all([
                fetch(`${API}/platform-config/email`, { headers: authHeaders() }),
                fetch(`${API}/financial/email-status`, { headers: authHeaders() }),
            ]);
            if (cRes.ok) {
                const c: EmailConfig = await cRes.json();
                if (!c.email_provider) c.email_provider = 'resend';
                setCfg(c);
            }
            if (dRes.ok) setDiag(await dRes.json());
        } catch {
            toast.error('No se pudo cargar la configuración de correo');
        } finally {
            setLoading(false);
        }
    }, []);

    useEffect(() => { load(); }, [load]);

    const set = (patch: Partial<EmailConfig>) => setCfg((c) => ({ ...c, ...patch }));

    const applyPreset = (key: string) => {
        setPreset(key);
        const p = SMTP_PRESETS[key];
        if (p && key !== 'custom') set({ smtp_host: p.host, smtp_port: p.port });
    };

    const save = async () => {
        setSaving(true);
        try {
            const body: EmailConfig = {
                email_provider: cfg.email_provider || 'resend',
                email_from: cfg.email_from || '',
                smtp_host: cfg.smtp_host || '',
                smtp_port: cfg.smtp_port || '',
                smtp_user: cfg.smtp_user || '',
                smtp_from_name: cfg.smtp_from_name || '',
                smtp_from_email: cfg.smtp_from_email || '',
            };
            // Solo enviar la contraseña si el admin escribió una nueva (no la máscara).
            if (cfg.smtp_password && cfg.smtp_password !== MASK) body.smtp_password = cfg.smtp_password;
            const res = await fetch(`${API}/platform-config/email`, {
                method: 'POST', headers: { 'Content-Type': 'application/json', ...authHeaders() }, body: JSON.stringify(body),
            });
            if (!res.ok) throw new Error('No se pudo guardar');
            toast.success('Configuración de correo guardada');
            load();
        } catch (err: any) {
            toast.error(err.message);
        } finally {
            setSaving(false);
        }
    };

    const test = async () => {
        const to = window.prompt('Enviar correo de prueba a:', '');
        if (!to) return;
        setTesting(true);
        try {
            const res = await fetch(`${API}/platform-config/email/test`, {
                method: 'POST', headers: { 'Content-Type': 'application/json', ...authHeaders() }, body: JSON.stringify({ to }),
            });
            const d = await res.json();
            if (!res.ok) throw new Error(d.error || 'No se pudo enviar la prueba');
            toast.success(`Correo de prueba enviado a ${to}`);
        } catch (err: any) {
            toast.error(err.message);
        } finally {
            setTesting(false);
        }
    };

    if (loading) return <div className="p-16 text-center text-gray-400 flex flex-col items-center gap-3"><RefreshCw className="w-6 h-6 animate-spin" /> Cargando configuración…</div>;

    const provider = cfg.email_provider || 'resend';
    const isSmtp = provider === 'smtp';

    return (
        <div className="max-w-3xl space-y-6">
            {/* Estado de Resend */}
            <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5">
                <div className="flex items-center justify-between mb-3">
                    <h3 className="font-black text-gray-800 flex items-center gap-2"><ShieldCheck className="w-5 h-5 text-rotary-blue" /> Estado de entregabilidad</h3>
                    <button onClick={load} className="flex items-center gap-1.5 text-xs font-bold text-gray-500 hover:text-rotary-blue"><RefreshCw className="w-3.5 h-3.5" /> Actualizar</button>
                </div>
                <div className="grid sm:grid-cols-3 gap-3 mb-4">
                    <div className={`p-3 rounded-xl border ${diag?.resend.configured ? 'bg-emerald-50 border-emerald-100' : 'bg-rose-50 border-rose-100'}`}>
                        <p className="text-[10px] uppercase font-bold text-gray-400">Resend (API)</p>
                        <p className={`text-sm font-black flex items-center gap-1 ${diag?.resend.configured ? 'text-emerald-700' : 'text-rose-600'}`}>
                            {diag?.resend.configured ? <><CheckCircle2 className="w-4 h-4" /> Conectado</> : <><AlertTriangle className="w-4 h-4" /> Sin clave</>}
                        </p>
                    </div>
                    <div className="p-3 rounded-xl border bg-gray-50 border-gray-100">
                        <p className="text-[10px] uppercase font-bold text-gray-400">SMTP de respaldo</p>
                        <p className="text-sm font-black text-gray-700">{diag?.smtpFallback.count ?? 0} configurado(s)</p>
                    </div>
                    <div className="p-3 rounded-xl border bg-gray-50 border-gray-100">
                        <p className="text-[10px] uppercase font-bold text-gray-400">Proveedor activo</p>
                        <p className="text-sm font-black text-rotary-blue uppercase">{diag?.platformConfig.emailProvider || 'resend'}</p>
                    </div>
                </div>
                {diag?.resend.error && (
                    <div className="text-xs text-rose-600 bg-rose-50 border border-rose-100 rounded-lg px-3 py-2 mb-3">Resend: {diag.resend.error}</div>
                )}
                {diag?.resend.domains && diag.resend.domains.length > 0 && (
                    <div>
                        <p className={labelCls}><Globe className="w-3 h-3 inline mr-1" /> Dominios verificados (DKIM/SPF/DMARC)</p>
                        <div className="space-y-1.5">
                            {diag.resend.domains.map((d) => (
                                <div key={d.name} className="flex items-center justify-between p-2 rounded-lg bg-gray-50 border border-gray-100">
                                    <span className="text-sm font-medium text-gray-700">{d.name}</span>
                                    <DomainStatus status={d.status} />
                                </div>
                            ))}
                        </div>
                    </div>
                )}
                {diag?.resend.configured && (!diag.resend.domains || diag.resend.domains.length === 0) && !diag.resend.error && (
                    <p className="text-xs text-gray-400">No hay dominios registrados en Resend todavía. Los envíos usarán el remitente por defecto de la plataforma.</p>
                )}
            </div>

            {/* Selección de proveedor */}
            <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5 space-y-4">
                <h3 className="font-black text-gray-800 flex items-center gap-2"><Server className="w-5 h-5 text-rotary-blue" /> Proveedor de envío</h3>
                <div className="grid sm:grid-cols-2 gap-3">
                    <button type="button" onClick={() => set({ email_provider: 'resend' })}
                        className={`text-left p-4 rounded-xl border-2 transition-all ${!isSmtp ? 'border-rotary-blue bg-sky-50/50' : 'border-gray-200 hover:border-gray-300'}`}>
                        <div className="flex items-center justify-between">
                            <span className="font-bold text-gray-800">Resend</span>
                            <span className="text-[10px] font-black uppercase text-rotary-blue bg-sky-100 px-2 py-0.5 rounded-full">Por defecto</span>
                        </div>
                        <p className="text-xs text-gray-500 mt-1">Servicio recomendado. Usa la API de Resend con los dominios verificados de la plataforma.</p>
                    </button>
                    <button type="button" onClick={() => set({ email_provider: 'smtp' })}
                        className={`text-left p-4 rounded-xl border-2 transition-all ${isSmtp ? 'border-rotary-blue bg-sky-50/50' : 'border-gray-200 hover:border-gray-300'}`}>
                        <span className="font-bold text-gray-800">SMTP externo</span>
                        <p className="text-xs text-gray-500 mt-1">Amazon SES, SendGrid, Mailgun, Postmark, Brevo u otro servidor SMTP propio.</p>
                    </button>
                </div>

                <div>
                    <label className={labelCls}><Mail className="w-3 h-3 inline mr-1" /> Remitente por defecto</label>
                    <input className={inputCls} value={cfg.email_from || ''} onChange={(e) => set({ email_from: e.target.value })}
                        placeholder={'"Club Platform for Rotary" <noreply@clubplatform.org>'} />
                    <p className="text-[11px] text-gray-400 mt-1">Formato: <code>"Nombre" &lt;correo@dominio.org&gt;</code>. El dominio debe estar verificado en Resend.</p>
                </div>

                {isSmtp && (
                    <div className="space-y-3 border-t border-gray-100 pt-4">
                        <div>
                            <label className={labelCls}>Preset de proveedor SMTP</label>
                            <select className={inputCls} value={preset} onChange={(e) => applyPreset(e.target.value)}>
                                {Object.entries(SMTP_PRESETS).map(([k, p]) => <option key={k} value={k}>{p.label}</option>)}
                            </select>
                            {SMTP_PRESETS[preset]?.hint && <p className="text-[11px] text-gray-400 mt-1">{SMTP_PRESETS[preset].hint}</p>}
                        </div>
                        <div className="grid grid-cols-2 gap-3">
                            <div><label className={labelCls}>Host</label><input className={inputCls} value={cfg.smtp_host || ''} onChange={(e) => set({ smtp_host: e.target.value })} placeholder="smtp.tu-proveedor.com" /></div>
                            <div><label className={labelCls}>Puerto</label><input className={inputCls} value={cfg.smtp_port || ''} onChange={(e) => set({ smtp_port: e.target.value })} placeholder="587" /></div>
                            <div><label className={labelCls}>Usuario</label><input className={inputCls} value={cfg.smtp_user || ''} onChange={(e) => set({ smtp_user: e.target.value })} /></div>
                            <div><label className={labelCls}>Contraseña / API key</label><input type="password" className={inputCls} value={cfg.smtp_password || ''} onChange={(e) => set({ smtp_password: e.target.value })} placeholder="••••••••" /></div>
                            <div><label className={labelCls}>Nombre remitente</label><input className={inputCls} value={cfg.smtp_from_name || ''} onChange={(e) => set({ smtp_from_name: e.target.value })} placeholder="Club Platform" /></div>
                            <div><label className={labelCls}>Correo remitente</label><input className={inputCls} value={cfg.smtp_from_email || ''} onChange={(e) => set({ smtp_from_email: e.target.value })} placeholder="envios@dominio.org" /></div>
                        </div>
                    </div>
                )}

                <div className="flex flex-wrap gap-3 border-t border-gray-100 pt-4">
                    <button onClick={save} disabled={saving} className="flex items-center gap-2 px-6 py-2 rounded-full bg-rotary-blue text-white font-bold hover:bg-sky-800 disabled:opacity-50">
                        {saving ? <RefreshCw className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />} Guardar
                    </button>
                    <button onClick={test} disabled={testing} className="flex items-center gap-2 px-6 py-2 rounded-full bg-sky-50 text-rotary-blue border border-blue-100 font-bold hover:bg-sky-100 disabled:opacity-50">
                        {testing ? <RefreshCw className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />} Enviar prueba
                    </button>
                </div>
            </div>

            <div className="flex items-start gap-2 text-xs text-gray-500 bg-sky-50/50 border border-sky-100 rounded-xl px-4 py-3">
                <Info className="w-4 h-4 text-sky-500 shrink-0 mt-0.5" />
                <p>La verificación de <strong>DKIM, SPF y DMARC</strong> se hace por dominio en Resend (aparecen arriba como "verificados"). Los límites de envío por lote y el control de velocidad se aplican automáticamente en el pipeline de campañas (máx. 500 destinatarios por envío, con reintentos vía cron).</p>
            </div>
        </div>
    );
};

export default ProviderSettings;
