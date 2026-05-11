import React, { useState, useEffect } from 'react';
import { useAuth } from '../../../hooks/useAuth';
import { Settings, CheckCircle2, XCircle, Loader2, Eye, EyeOff, Shield } from 'lucide-react';
import { toast } from 'sonner';

const API = import.meta.env.VITE_API_URL || '/api';

interface Props {
    clubId?: string;
}

const WhatsAppConfig: React.FC<Props> = ({ clubId }) => {
    const { token } = useAuth();
    const [loading, setLoading] = useState(true);
    const [saving, setSaving] = useState(false);
    const [verifying, setVerifying] = useState(false);
    const [showToken, setShowToken] = useState(false);
    const [config, setConfig] = useState<any>(null);
    const [form, setForm] = useState({
        phoneNumberId: '', wabaId: '', accessToken: '', verifyToken: '', appId: '', enabled: true,
    });
    const [verifyResult, setVerifyResult] = useState<any>(null);

    useEffect(() => { fetchConfig(); }, [clubId]);

    const fetchConfig = async () => {
        setLoading(true);
        try {
            const headers: any = { Authorization: `Bearer ${token}` };
            if (clubId) headers['x-club-id'] = clubId;

            const res = await fetch(`${API}/whatsapp/config`, { headers });
            const data = await res.json();
            if (data.configured) {
                setConfig(data);
                setForm({
                    phoneNumberId: data.phoneNumberId || '',
                    wabaId: data.wabaId || '',
                    accessToken: data.accessTokenPreview || '',
                    verifyToken: '',
                    appId: data.appId || '',
                    enabled: data.enabled ?? true,
                });
            } else {
                setConfig(null);
                setForm({ phoneNumberId: '', wabaId: '', accessToken: '', verifyToken: '', appId: '', enabled: true });
            }
        } catch (err) { console.error(err); } finally { setLoading(false); }
    };

    const handleSave = async (e: React.FormEvent) => {
        e.preventDefault();
        setSaving(true);
        try {
            const headers: any = { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` };
            if (clubId) headers['x-club-id'] = clubId;

            const res = await fetch(`${API}/whatsapp/config`, {
                method: 'POST',
                headers,
                body: JSON.stringify({ ...form, clubId }),
            });
            const data = await res.json();
            if (data.success) { toast.success('Configuración guardada'); fetchConfig(); }
            else toast.error(data.error || 'Error al guardar');
        } catch { toast.error('Error de conexión'); } finally { setSaving(false); }
    };

    const handleVerify = async () => {
        setVerifying(true); setVerifyResult(null);
        try {
            const res = await fetch(`${API}/whatsapp/config/verify`, {
                method: 'POST', headers: { Authorization: `Bearer ${token}` },
            });
            const data = await res.json();
            setVerifyResult(data);
            if (data.success) toast.success(`Verificado: ${data.account?.verifiedName}`);
            else toast.error(data.error || 'Error de verificación');
        } catch { toast.error('Error de conexión'); } finally { setVerifying(false); }
    };

    if (loading) return <div className="flex justify-center py-20"><Loader2 className="w-8 h-8 animate-spin text-gray-400" /></div>;

    return (
        <div className="max-w-2xl">
            <div className="flex items-center gap-3 mb-6">
                <div className="w-10 h-10 rounded-xl bg-green-100 flex items-center justify-center">
                    <Settings className="w-5 h-5 text-green-600" />
                </div>
                <div>
                    <h2 className="text-lg font-bold text-gray-900">Configuración API de Meta</h2>
                    <p className="text-sm text-gray-500">Conecta tu cuenta de WhatsApp Business Cloud API</p>
                </div>
                {config && (
                    <span className={`ml-auto px-3 py-1 rounded-full text-xs font-bold ${config.enabled ? 'bg-emerald-50 text-emerald-700' : 'bg-gray-100 text-gray-500'}`}>
                        {config.enabled ? '● Activo' : '○ Inactivo'}
                    </span>
                )}
            </div>

            <form onSubmit={handleSave} className="bg-white rounded-2xl border border-gray-100 shadow-sm p-6 space-y-5">
                <div className="grid grid-cols-2 gap-4">
                    <div>
                        <label className="block text-xs font-bold text-gray-600 uppercase mb-1.5">Phone Number ID</label>
                        <input value={form.phoneNumberId} onChange={e => setForm({ ...form, phoneNumberId: e.target.value })}
                            required className="w-full px-3 py-2.5 rounded-lg border border-gray-200 text-sm focus:ring-2 focus:ring-green-500/20 focus:border-green-500 outline-none"
                            placeholder="123456789012345" />
                    </div>
                    <div>
                        <label className="block text-xs font-bold text-gray-600 uppercase mb-1.5">WABA ID</label>
                        <input value={form.wabaId} onChange={e => setForm({ ...form, wabaId: e.target.value })}
                            required className="w-full px-3 py-2.5 rounded-lg border border-gray-200 text-sm focus:ring-2 focus:ring-green-500/20 focus:border-green-500 outline-none"
                            placeholder="WhatsApp Business Account ID" />
                    </div>
                </div>

                <div>
                    <label className="block text-xs font-bold text-gray-600 uppercase mb-1.5">Access Token (System User)</label>
                    <div className="relative">
                        <input type={showToken ? 'text' : 'password'} value={form.accessToken}
                            onChange={e => setForm({ ...form, accessToken: e.target.value })} required
                            className="w-full px-3 py-2.5 pr-10 rounded-lg border border-gray-200 text-sm focus:ring-2 focus:ring-green-500/20 focus:border-green-500 outline-none font-mono"
                            placeholder="EAAxxxxxxx..." />
                        <button type="button" onClick={() => setShowToken(!showToken)} className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600">
                            {showToken ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                        </button>
                    </div>
                </div>

                <div className="grid grid-cols-2 gap-4">
                    <div>
                        <label className="block text-xs font-bold text-gray-600 uppercase mb-1.5">Verify Token (Webhook)</label>
                        <input value={form.verifyToken} onChange={e => setForm({ ...form, verifyToken: e.target.value })}
                            required={!config} className="w-full px-3 py-2.5 rounded-lg border border-gray-200 text-sm focus:ring-2 focus:ring-green-500/20 focus:border-green-500 outline-none"
                            placeholder="mi_token_secreto" />
                    </div>
                    <div>
                        <label className="block text-xs font-bold text-gray-600 uppercase mb-1.5">App ID (opcional)</label>
                        <input value={form.appId} onChange={e => setForm({ ...form, appId: e.target.value })}
                            className="w-full px-3 py-2.5 rounded-lg border border-gray-200 text-sm focus:ring-2 focus:ring-green-500/20 focus:border-green-500 outline-none"
                            placeholder="Meta App ID" />
                    </div>
                </div>

                <label className="flex items-center gap-3 p-3 rounded-lg bg-gray-50 cursor-pointer">
                    <input type="checkbox" checked={form.enabled} onChange={e => setForm({ ...form, enabled: e.target.checked })}
                        className="w-4 h-4 rounded border-gray-300 text-green-600 focus:ring-green-500" />
                    <span className="text-sm font-medium text-gray-700">Habilitar envío de mensajes WhatsApp</span>
                </label>

                <div className="flex items-center gap-3 pt-2">
                    <button type="submit" disabled={saving}
                        className="flex items-center gap-2 bg-green-600 text-white px-6 py-2.5 rounded-xl font-bold text-sm hover:bg-green-700 transition-all disabled:opacity-50 shadow-sm">
                        {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Shield className="w-4 h-4" />}
                        {saving ? 'Guardando...' : 'Guardar Configuración'}
                    </button>
                    {config && (
                        <button type="button" onClick={handleVerify} disabled={verifying}
                            className="flex items-center gap-2 bg-white border border-gray-200 text-gray-700 px-6 py-2.5 rounded-xl font-bold text-sm hover:bg-gray-50 transition-all disabled:opacity-50">
                            {verifying ? <Loader2 className="w-4 h-4 animate-spin" /> : <CheckCircle2 className="w-4 h-4" />}
                            Verificar Conexión
                        </button>
                    )}
                </div>

                {verifyResult && (
                    <div className={`p-4 rounded-xl border ${verifyResult.success ? 'bg-emerald-50 border-emerald-200' : 'bg-red-50 border-red-200'}`}>
                        {verifyResult.success ? (
                            <div className="flex items-center gap-2 text-emerald-700">
                                <CheckCircle2 className="w-5 h-5" />
                                <div>
                                    <p className="font-bold">{verifyResult.account?.verifiedName}</p>
                                    <p className="text-xs">{verifyResult.account?.phoneNumber} · Quality: {verifyResult.account?.qualityRating}</p>
                                </div>
                            </div>
                        ) : (
                            <div className="flex items-center gap-2 text-red-700">
                                <XCircle className="w-5 h-5" /> <span className="font-bold text-sm">{verifyResult.error}</span>
                            </div>
                        )}
                    </div>
                )}
            </form>
        </div>
    );
};

export default WhatsAppConfig;
