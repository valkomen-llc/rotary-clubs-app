import React, { useState, useEffect } from 'react';
import AdminLayout from '../../components/admin/AdminLayout';
import { useAuth } from '../../hooks/useAuth';
import { Server, MessageCircle, Save } from 'lucide-react';
import { toast } from 'sonner';

const NotificationSettings: React.FC = () => {
    const { token } = useAuth();
    const [loading, setLoading] = useState(false);

    // SMTP State
    const [smtpEnabled, setSmtpEnabled] = useState(false);
    const [smtpConfig, setSmtpConfig] = useState({
        host: '',
        port: '',
        user: '',
        password: '',
        fromName: '',
        fromEmail: ''
    });

    // WhatsApp State
    const [waEnabled, setWaEnabled] = useState(false);
    const [waConfig, setWaConfig] = useState({
        apiKey: '',
        phoneNumber: ''
    });

    useEffect(() => {
        fetchConfigs();
    }, []);

    const fetchConfigs = async () => {
        try {
            const baseUrl = import.meta.env.VITE_API_URL || '/api';
            const res = await fetch(`${baseUrl}/communications/config`, {
                headers: { 'Authorization': `Bearer ${token}` }
            });

            if (res.ok) {
                const data = await res.json();

                const smtp = data.find((c: any) => c.type === 'smtp');
                if (smtp) {
                    setSmtpEnabled(smtp.enabled);
                    setSmtpConfig({
                        host: smtp.host || '',
                        port: smtp.port?.toString() || '',
                        user: smtp.user || '',
                        password: '', // Don't fetch password
                        fromName: smtp.fromName || '',
                        fromEmail: smtp.fromEmail || ''
                    });
                }

                const wa = data.find((c: any) => c.type === 'whatsapp');
                if (wa) {
                    setWaEnabled(wa.enabled);
                    setWaConfig({
                        apiKey: wa.apiKey || '',
                        phoneNumber: wa.phoneNumber || ''
                    });
                }
            }
        } catch (error) {
            console.error('Error fetching configurations', error);
        }
    };

    const handleSave = async (type: 'smtp' | 'whatsapp') => {
        setLoading(true);
        try {
            const baseUrl = import.meta.env.VITE_API_URL || '/api';
            const payload = type === 'smtp'
                ? { type: 'smtp', enabled: smtpEnabled, ...smtpConfig, port: parseInt(smtpConfig.port) || 0 }
                : { type: 'whatsapp', enabled: waEnabled, ...waConfig };

            const res = await fetch(`${baseUrl}/communications/config`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${token}`
                },
                body: JSON.stringify(payload)
            });

            if (res.ok) {
                toast.success(`Configuración de ${type === 'smtp' ? 'correo' : 'WhatsApp'} guardada exitosamente`);
            } else {
                toast.error('Error al guardar configuración');
            }
        } catch (error) {
            toast.error('Error de conexión');
        } finally {
            setLoading(false);
        }
    };

    return (
        <AdminLayout>
            <div className="mb-8">
                <h1 className="text-3xl font-black text-gray-900 tracking-tight">Canales de Comunicación</h1>
                <p className="text-gray-500 mt-2">Configura los servidores de envío para el CRM y Notificaciones Automáticas.</p>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
                {/* SMTP / Email Config */}
                <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
                    <div className="p-6 border-b border-gray-100 flex justify-between items-center bg-gray-50/50">
                        <div className="flex items-center gap-3">
                            <div className="w-10 h-10 rounded-xl bg-blue-100 flex items-center justify-center text-blue-600">
                                <Server className="w-5 h-5" />
                            </div>
                            <div>
                                <h2 className="text-lg font-bold text-gray-900">Servidor SMTP (Correos)</h2>
                                <p className="text-[11px] font-bold text-gray-500 uppercase tracking-widest">Envíos Transaccionales</p>
                            </div>
                        </div>
                        <label className="relative inline-flex items-center cursor-pointer">
                            <input type="checkbox" className="sr-only peer" checked={smtpEnabled} onChange={(e) => setSmtpEnabled(e.target.checked)} />
                            <div className="w-11 h-6 bg-gray-200 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-blue-600"></div>
                        </label>
                    </div>

                    <div className="p-6 space-y-4">
                        <div className="grid grid-cols-2 gap-4">
                            <div>
                                <label className="block text-xs font-bold text-gray-700 uppercase mb-2">Servidor (Host)</label>
                                <input
                                    type="text"
                                    value={smtpConfig.host}
                                    onChange={(e) => setSmtpConfig({ ...smtpConfig, host: e.target.value })}
                                    className="w-full px-4 py-2 rounded-lg border border-gray-200 focus:ring-2 focus:ring-blue-500 outline-none"
                                    placeholder="smtp.ejemplo.com"
                                    disabled={!smtpEnabled}
                                />
                            </div>
                            <div>
                                <label className="block text-xs font-bold text-gray-700 uppercase mb-2">Puerto</label>
                                <input
                                    type="number"
                                    value={smtpConfig.port}
                                    onChange={(e) => setSmtpConfig({ ...smtpConfig, port: e.target.value })}
                                    className="w-full px-4 py-2 rounded-lg border border-gray-200 focus:ring-2 focus:ring-blue-500 outline-none"
                                    placeholder="465 / 587"
                                    disabled={!smtpEnabled}
                                />
                            </div>
                        </div>

                        <div>
                            <label className="block text-xs font-bold text-gray-700 uppercase mb-2">Usuario SMTP</label>
                            <input
                                type="text"
                                value={smtpConfig.user}
                                onChange={(e) => setSmtpConfig({ ...smtpConfig, user: e.target.value })}
                                className="w-full px-4 py-2 rounded-lg border border-gray-200 focus:ring-2 focus:ring-blue-500 outline-none"
                                placeholder="usuario@ejemplo.com"
                                disabled={!smtpEnabled}
                            />
                        </div>

                        <div>
                            <label className="block text-xs font-bold text-gray-700 uppercase mb-2">Contraseña SMTP</label>
                            <input
                                type="password"
                                value={smtpConfig.password}
                                onChange={(e) => setSmtpConfig({ ...smtpConfig, password: e.target.value })}
                                className="w-full px-4 py-2 rounded-lg border border-gray-200 focus:ring-2 focus:ring-blue-500 outline-none"
                                placeholder="••••••••"
                                disabled={!smtpEnabled}
                            />
                        </div>

                        <div className="grid grid-cols-2 gap-4 pt-4 border-t border-gray-100">
                            <div>
                                <label className="block text-xs font-bold text-gray-700 uppercase mb-2">Nombre de Remitente</label>
                                <input
                                    type="text"
                                    value={smtpConfig.fromName}
                                    onChange={(e) => setSmtpConfig({ ...smtpConfig, fromName: e.target.value })}
                                    className="w-full px-4 py-2 rounded-lg border border-gray-200 focus:ring-2 focus:ring-blue-500 outline-none"
                                    placeholder="Rotary Club"
                                    disabled={!smtpEnabled}
                                />
                            </div>
                            <div>
                                <label className="block text-xs font-bold text-gray-700 uppercase mb-2">Email Remitente</label>
                                <input
                                    type="email"
                                    value={smtpConfig.fromEmail}
                                    onChange={(e) => setSmtpConfig({ ...smtpConfig, fromEmail: e.target.value })}
                                    className="w-full px-4 py-2 rounded-lg border border-gray-200 focus:ring-2 focus:ring-blue-500 outline-none"
                                    placeholder="no-reply@rotary.org"
                                    disabled={!smtpEnabled}
                                />
                            </div>
                        </div>

                        <div className="pt-4 flex justify-end">
                            <button
                                onClick={() => handleSave('smtp')}
                                disabled={loading}
                                className="flex items-center gap-2 bg-blue-600 text-white px-6 py-2 rounded-xl font-bold hover:bg-blue-700 transition-all shadow-sm"
                            >
                                <Save className="w-4 h-4" /> Guardar SMTP
                            </button>
                        </div>
                    </div>
                </div>

                {/* WhatsApp Config */}
                <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
                    <div className="p-6 border-b border-gray-100 flex justify-between items-center bg-gray-50/50">
                        <div className="flex items-center gap-3">
                            <div className="w-10 h-10 rounded-xl bg-green-100 flex items-center justify-center text-green-600">
                                <MessageCircle className="w-5 h-5" />
                            </div>
                            <div>
                                <h2 className="text-lg font-bold text-gray-900">WhatsApp API</h2>
                                <p className="text-[11px] font-bold text-gray-500 uppercase tracking-widest">Notificaciones Push</p>
                            </div>
                        </div>
                        <label className="relative inline-flex items-center cursor-pointer">
                            <input type="checkbox" className="sr-only peer" checked={waEnabled} onChange={(e) => setWaEnabled(e.target.checked)} />
                            <div className="w-11 h-6 bg-gray-200 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-green-600"></div>
                        </label>
                    </div>

                    <div className="p-6 space-y-4">
                        <div>
                            <label className="block text-xs font-bold text-gray-700 uppercase mb-2">WhatsApp API Key / Token</label>
                            <input
                                type="password"
                                value={waConfig.apiKey}
                                onChange={(e) => setWaConfig({ ...waConfig, apiKey: e.target.value })}
                                className="w-full px-4 py-2 rounded-lg border border-gray-200 focus:ring-2 focus:ring-green-500 outline-none"
                                placeholder="EAAI... (Token de Meta API)"
                                disabled={!waEnabled}
                            />
                        </div>

                        <div>
                            <label className="block text-xs font-bold text-gray-700 uppercase mb-2">Número de Teléfono del Remitente</label>
                            <input
                                type="text"
                                value={waConfig.phoneNumber}
                                onChange={(e) => setWaConfig({ ...waConfig, phoneNumber: e.target.value })}
                                className="w-full px-4 py-2 rounded-lg border border-gray-200 focus:ring-2 focus:ring-green-500 outline-none"
                                placeholder="Ej: +1234567890"
                                disabled={!waEnabled}
                            />
                        </div>

                        <div className="bg-amber-50 border border-amber-200 p-4 rounded-xl mt-6">
                            <p className="text-sm font-bold text-amber-800 mb-1">Emparejamiento por QR</p>
                            <p className="text-xs text-amber-700 leading-relaxed">
                                Si no dispones de Meta API, el sistema web-baileys intentará lanzar una sesión QR. El código QR aparecerá en el Dashboard una vez habilitado el servicio general.
                            </p>
                        </div>

                        <div className="pt-4 flex justify-end">
                            <button
                                onClick={() => handleSave('whatsapp')}
                                disabled={loading}
                                className="flex items-center gap-2 bg-green-600 text-white px-6 py-2 rounded-xl font-bold hover:bg-green-700 transition-all shadow-sm"
                            >
                                <Save className="w-4 h-4" /> Guardar WhatsApp
                            </button>
                        </div>
                    </div>
                </div>
            </div>
        </AdminLayout>
    );
};

export default NotificationSettings;
