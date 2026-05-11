import React, { useState, useEffect } from 'react';
import { Mail, MessageSquare, Save, RefreshCw, CheckCircle2, AlertCircle } from 'lucide-react';
import { toast } from 'sonner';

const API = import.meta.env.VITE_API_URL || '/api';

const SystemCommunicationsConfig: React.FC = () => {
    const [loading, setLoading] = useState(true);
    const [saving, setSaving] = useState(false);
    const [smtpConfig, setSmtpConfig] = useState<any>({
        enabled: false, host: '', port: 587, user: '', password: '', fromName: '', fromEmail: ''
    });

    useEffect(() => {
        fetchConfigs();
    }, []);

    const fetchConfigs = async () => {
        try {
            const token = localStorage.getItem('rotary_token');
            const res = await fetch(`${API}/communications/config`, {
                headers: { Authorization: `Bearer ${token}` }
            });
            if (res.ok) {
                const data = await res.json();
                const smtp = data.find((c: any) => c.type === 'smtp');
                if (smtp) setSmtpConfig(smtp);
            }
        } catch (error) {
            console.error('Error fetching configs', error);
        } finally {
            setLoading(false);
        }
    };

    const handleSaveSmtp = async (e: React.FormEvent) => {
        e.preventDefault();
        setSaving(true);
        try {
            const token = localStorage.getItem('rotary_token');
            const res = await fetch(`${API}/communications/config`, {
                method: 'POST',
                headers: { 
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${token}`
                },
                body: JSON.stringify({ type: 'smtp', ...smtpConfig })
            });
            if (res.ok) {
                toast.success('Configuración SMTP guardada');
            } else {
                toast.error('Error al guardar configuración');
            }
        } catch (error) {
            toast.error('Error de red');
        } finally {
            setSaving(false);
        }
    };

    if (loading) return <div className="p-12 text-center text-gray-500 italic">Cargando configuración...</div>;

    return (
        <div className="space-y-8 animate-in fade-in slide-in-from-bottom-4 duration-500">
            {/* SMTP Config */}
            <div className="bg-white rounded-3xl p-8 border border-gray-100 shadow-sm">
                <div className="flex items-center justify-between mb-8">
                    <div className="flex items-center gap-4">
                        <div className="w-12 h-12 rounded-2xl bg-sky-50 flex items-center justify-center text-rotary-blue shadow-sm">
                            <Mail className="w-6 h-6" />
                        </div>
                        <div>
                            <h3 className="text-xl font-black text-gray-900 tracking-tight">Servidor de Correo (SMTP)</h3>
                            <p className="text-xs text-gray-400 font-medium">Configura el envío de correos transaccionales y notificaciones.</p>
                        </div>
                    </div>
                    <button
                        type="button"
                        onClick={() => setSmtpConfig({ ...smtpConfig, enabled: !smtpConfig.enabled })}
                        className={`w-12 h-6 rounded-full transition-all relative ${smtpConfig.enabled ? 'bg-emerald-500' : 'bg-gray-300'}`}
                    >
                        <div className={`absolute top-1 w-4 h-4 bg-white rounded-full transition-all ${smtpConfig.enabled ? 'left-7' : 'left-1'}`} />
                    </button>
                </div>

                <form onSubmit={handleSaveSmtp} className="grid grid-cols-1 md:grid-cols-2 gap-6">
                    <div className="space-y-1">
                        <label className="text-[10px] font-black text-gray-400 uppercase tracking-widest ml-1">Host SMTP</label>
                        <input
                            type="text"
                            className="w-full px-5 py-3.5 bg-gray-50 border border-transparent rounded-2xl focus:bg-white focus:border-rotary-blue/20 outline-none transition-all font-bold text-sm"
                            value={smtpConfig.host}
                            onChange={e => setSmtpConfig({ ...smtpConfig, host: e.target.value })}
                            placeholder="smtp.resend.com"
                        />
                    </div>
                    <div className="space-y-1">
                        <label className="text-[10px] font-black text-gray-400 uppercase tracking-widest ml-1">Puerto</label>
                        <input
                            type="number"
                            className="w-full px-5 py-3.5 bg-gray-50 border border-transparent rounded-2xl focus:bg-white focus:border-rotary-blue/20 outline-none transition-all font-bold text-sm"
                            value={smtpConfig.port}
                            onChange={e => setSmtpConfig({ ...smtpConfig, port: parseInt(e.target.value) })}
                        />
                    </div>
                    <div className="space-y-1">
                        <label className="text-[10px] font-black text-gray-400 uppercase tracking-widest ml-1">Usuario</label>
                        <input
                            type="text"
                            className="w-full px-5 py-3.5 bg-gray-50 border border-transparent rounded-2xl focus:bg-white focus:border-rotary-blue/20 outline-none transition-all font-bold text-sm"
                            value={smtpConfig.user}
                            onChange={e => setSmtpConfig({ ...smtpConfig, user: e.target.value })}
                        />
                    </div>
                    <div className="space-y-1">
                        <label className="text-[10px] font-black text-gray-400 uppercase tracking-widest ml-1">Contraseña</label>
                        <input
                            type="password"
                            className="w-full px-5 py-3.5 bg-gray-50 border border-transparent rounded-2xl focus:bg-white focus:border-rotary-blue/20 outline-none transition-all font-bold text-sm"
                            value={smtpConfig.password}
                            onChange={e => setSmtpConfig({ ...smtpConfig, password: e.target.value })}
                        />
                    </div>
                    <div className="space-y-1">
                        <label className="text-[10px] font-black text-gray-400 uppercase tracking-widest ml-1">Nombre Remitente</label>
                        <input
                            type="text"
                            className="w-full px-5 py-3.5 bg-gray-50 border border-transparent rounded-2xl focus:bg-white focus:border-rotary-blue/20 outline-none transition-all font-bold text-sm"
                            value={smtpConfig.fromName}
                            onChange={e => setSmtpConfig({ ...smtpConfig, fromName: e.target.value })}
                            placeholder="Rotary Club Platform"
                        />
                    </div>
                    <div className="space-y-1">
                        <label className="text-[10px] font-black text-gray-400 uppercase tracking-widest ml-1">Email Remitente</label>
                        <input
                            type="email"
                            className="w-full px-5 py-3.5 bg-gray-50 border border-transparent rounded-2xl focus:bg-white focus:border-rotary-blue/20 outline-none transition-all font-bold text-sm"
                            value={smtpConfig.fromEmail}
                            onChange={e => setSmtpConfig({ ...smtpConfig, fromEmail: e.target.value })}
                            placeholder="notifications@clubplatform.org"
                        />
                    </div>
                    <div className="md:col-span-2 flex justify-end pt-4">
                        <button
                            type="submit"
                            disabled={saving}
                            className="bg-gray-900 text-white px-8 py-3 rounded-2xl font-black text-xs flex items-center gap-3 hover:bg-rotary-blue transition-all disabled:opacity-50"
                        >
                            {saving ? <RefreshCw className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
                            Guardar Configuración SMTP
                        </button>
                    </div>
                </form>
            </div>

            {/* Info Box */}
            <div className="bg-amber-50 border border-amber-100 rounded-2xl p-6 flex items-start gap-4">
                <AlertCircle className="w-6 h-6 text-amber-500 flex-shrink-0 mt-0.5" />
                <div>
                    <h4 className="text-sm font-black text-amber-900 mb-1">Importante</h4>
                    <p className="text-xs text-amber-700 leading-relaxed font-medium">
                        Esta configuración es global para la plataforma. Asegúrate de usar credenciales válidas para evitar que los correos de los clubes (bienvenidas, facturas, recuperaciones) lleguen a SPAM. Recomendamos usar servicios como Resend, SendGrid o Amazon SES.
                    </p>
                </div>
            </div>
        </div>
    );
};

export default SystemCommunicationsConfig;
