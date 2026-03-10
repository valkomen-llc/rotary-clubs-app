import React, { useState, useEffect } from 'react';
import AdminLayout from '../../components/admin/AdminLayout';
import { useAuth } from '../../hooks/useAuth';
import { Mail, MessageCircle, Send, ClipboardList, CheckCircle2, XCircle, Search, Clock } from 'lucide-react';
import { toast } from 'sonner';

/**
 * CRM Interfaz
 * Permite ver el historial de comunicaciones, administrar plantillas (templates) y lanzar un envío rápido.
 */
const CRMManagement: React.FC = () => {
    const { token } = useAuth();
    const [loading, setLoading] = useState(false);
    const [activeTab, setActiveTab] = useState<'send' | 'templates' | 'logs'>('send');

    // Mocks / States for basic UI iteration
    const [logs, setLogs] = useState<any[]>([]);
    const [templates, setTemplates] = useState<any[]>([]);

    useEffect(() => {
        if (activeTab === 'logs') fetchLogs();
        if (activeTab === 'templates') fetchTemplates();
    }, [activeTab]);

    const fetchLogs = async () => {
        try {
            const baseUrl = import.meta.env.VITE_API_URL || '/api';
            const res = await fetch(`${baseUrl}/communications/logs`, {
                headers: { 'Authorization': `Bearer ${token}` }
            });
            if (res.ok) setLogs(await res.json());
        } catch (error) {
            console.error('Error fetching logs', error);
        }
    };

    const fetchTemplates = async () => {
        try {
            const baseUrl = import.meta.env.VITE_API_URL || '/api';
            const res = await fetch(`${baseUrl}/communications/templates`, {
                headers: { 'Authorization': `Bearer ${token}` }
            });
            if (res.ok) setTemplates(await res.json());
        } catch (error) {
            console.error('Error fetching templates', error);
        }
    };

    // --- Send Form State ---
    const [sendForm, setSendForm] = useState({
        type: 'email',
        recipient: '',
        subject: '',
        content: ''
    });

    const handleSendTest = async (e: React.FormEvent) => {
        e.preventDefault();
        setLoading(true);
        try {
            // Este endpoint lo agregaremos en el Server Backend.
            // Permite realizar envios dinámicos invocando el EmailService | WhatsAppService directamente
            const baseUrl = import.meta.env.VITE_API_URL || '/api';
            const res = await fetch(`${baseUrl}/communications/send`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${token}`
                },
                body: JSON.stringify(sendForm)
            });

            if (res.ok) {
                toast.success('Mensaje despachado al servidor exitosamente');
                setSendForm({ type: 'email', recipient: '', subject: '', content: '' });
            } else {
                const data = await res.json();
                toast.error(data.error || 'Error al despachar el mensaje');
            }
        } catch (error) {
            toast.error('Error de conexión');
        } finally {
            setLoading(false);
        }
    };

    return (
        <AdminLayout>
            <div className="flex justify-between items-center mb-8">
                <div>
                    <h1 className="text-3xl font-black text-gray-900 tracking-tight">Comunicaciones y CRM</h1>
                    <p className="text-gray-500 mt-2">Envía notificaciones, administra plantillas y vigila el historial de actividad.</p>
                </div>
            </div>

            {/* Tabs */}
            <div className="flex gap-2 mb-8 border-b border-gray-200 pb-px">
                <button
                    onClick={() => setActiveTab('send')}
                    className={`px-6 py-3 text-sm font-bold border-b-2 transition-colors flex items-center gap-2 ${activeTab === 'send' ? 'border-rotary-blue text-rotary-blue' : 'border-transparent text-gray-500 hover:text-gray-700'}`}
                >
                    <Send className="w-4 h-4" /> Envío Rápido
                </button>
                <button
                    onClick={() => setActiveTab('templates')}
                    className={`px-6 py-3 text-sm font-bold border-b-2 transition-colors flex items-center gap-2 ${activeTab === 'templates' ? 'border-rotary-blue text-rotary-blue' : 'border-transparent text-gray-500 hover:text-gray-700'}`}
                >
                    <ClipboardList className="w-4 h-4" /> Plantillas Automáticas
                </button>
                <button
                    onClick={() => setActiveTab('logs')}
                    className={`px-6 py-3 text-sm font-bold border-b-2 transition-colors flex items-center gap-2 ${activeTab === 'logs' ? 'border-rotary-blue text-rotary-blue' : 'border-transparent text-gray-500 hover:text-gray-700'}`}
                >
                    <Clock className="w-4 h-4" /> Historial de Envíos
                </button>
            </div>

            {/* Tab: Send (Envío Manual/Masivo Setup) */}
            {activeTab === 'send' && (
                <div className="max-w-3xl">
                    <form onSubmit={handleSendTest} className="bg-white rounded-2xl border border-gray-100 shadow-sm p-8 space-y-6">
                        <div className="grid grid-cols-2 gap-4">
                            <label className={`cursor-pointer border-2 rounded-xl p-4 flex flex-col items-center gap-3 transition-colors ${sendForm.type === 'email' ? 'border-blue-500 bg-blue-50/50' : 'border-gray-100 hover:bg-gray-50'}`}>
                                <input type="radio" value="email" checked={sendForm.type === 'email'} onChange={() => setSendForm({ ...sendForm, type: 'email' })} className="sr-only" />
                                <div className={`w-12 h-12 rounded-full flex items-center justify-center ${sendForm.type === 'email' ? 'bg-blue-600 text-white shadow-md shadow-blue-500/30' : 'bg-gray-100 text-gray-400'}`}>
                                    <Mail className="w-6 h-6" />
                                </div>
                                <span className={`font-bold ${sendForm.type === 'email' ? 'text-blue-900' : 'text-gray-500'}`}>Por Correo</span>
                            </label>

                            <label className={`cursor-pointer border-2 rounded-xl p-4 flex flex-col items-center gap-3 transition-colors ${sendForm.type === 'whatsapp' ? 'border-green-500 bg-green-50/50' : 'border-gray-100 hover:bg-gray-50'}`}>
                                <input type="radio" value="whatsapp" checked={sendForm.type === 'whatsapp'} onChange={() => setSendForm({ ...sendForm, type: 'whatsapp' })} className="sr-only" />
                                <div className={`w-12 h-12 rounded-full flex items-center justify-center ${sendForm.type === 'whatsapp' ? 'bg-green-600 text-white shadow-md shadow-green-500/30' : 'bg-gray-100 text-gray-400'}`}>
                                    <MessageCircle className="w-6 h-6" />
                                </div>
                                <span className={`font-bold ${sendForm.type === 'whatsapp' ? 'text-green-900' : 'text-gray-500'}`}>Por WhatsApp</span>
                            </label>
                        </div>

                        <div>
                            <label className="block text-xs font-bold text-gray-700 uppercase mb-2">
                                Destinatario ({sendForm.type === 'email' ? 'Correo' : 'Número de Teléfono'})
                            </label>
                            <input
                                type={sendForm.type === 'email' ? "email" : "text"}
                                value={sendForm.recipient}
                                onChange={(e) => setSendForm({ ...sendForm, recipient: e.target.value })}
                                required
                                className="w-full px-4 py-3 rounded-lg border border-gray-200 focus:ring-2 focus:ring-rotary-blue outline-none"
                                placeholder={sendForm.type === 'email' ? 'ejemplo@rotary.org' : '+1234567890'}
                            />
                        </div>

                        {sendForm.type === 'email' && (
                            <div>
                                <label className="block text-xs font-bold text-gray-700 uppercase mb-2">Asunto (Subject)</label>
                                <input
                                    type="text"
                                    value={sendForm.subject}
                                    onChange={(e) => setSendForm({ ...sendForm, subject: e.target.value })}
                                    required={sendForm.type === 'email'}
                                    className="w-full px-4 py-3 rounded-lg border border-gray-200 focus:ring-2 focus:ring-rotary-blue outline-none"
                                    placeholder="Comunicado Importante"
                                />
                            </div>
                        )}

                        <div>
                            <label className="block text-xs font-bold text-gray-700 uppercase mb-2">Mensaje</label>
                            <textarea
                                value={sendForm.content}
                                onChange={(e) => setSendForm({ ...sendForm, content: e.target.value })}
                                required
                                rows={6}
                                className="w-full px-4 py-3 rounded-lg border border-gray-200 focus:ring-2 focus:ring-rotary-blue outline-none resize-none"
                                placeholder="Escribe el mensaje aquí..."
                            />
                        </div>

                        <div className="flex justify-end pt-4 border-t border-gray-100">
                            <button
                                type="submit"
                                disabled={loading}
                                className="flex items-center gap-2 bg-rotary-blue text-white px-8 py-3 rounded-xl font-bold hover:bg-sky-800 transition-all shadow-lg active:scale-95 disabled:opacity-50"
                            >
                                <Send className="w-5 h-5" />
                                {loading ? 'Enviando...' : `Disparar ${sendForm.type === 'email' ? 'Correo' : 'Mensaje'}`}
                            </button>
                        </div>
                    </form>
                </div>
            )}

            {/* Tab: Logs */}
            {activeTab === 'logs' && (
                <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
                    <div className="p-4 border-b border-gray-100 bg-gray-50 flex flex-wrap gap-4 items-center justify-between">
                        <div className="relative">
                            <Search className="w-4 h-4 text-gray-400 absolute left-3 top-1/2 -translate-y-1/2" />
                            <input type="text" placeholder="Buscar destinatario..." className="pl-9 pr-4 py-2 rounded-lg border border-gray-200 text-sm focus:outline-none focus:ring-2 focus:ring-rotary-blue w-64" />
                        </div>
                    </div>
                    <div className="overflow-x-auto">
                        <table className="w-full text-left border-collapse">
                            <thead>
                                <tr className="border-b border-gray-100 text-xs font-bold text-gray-400 uppercase tracking-wider">
                                    <th className="p-4">Tipo</th>
                                    <th className="p-4">Destino</th>
                                    <th className="p-4">Asunto / Previsualización</th>
                                    <th className="p-4">Estado</th>
                                    <th className="p-4">Fecha</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-gray-50 text-sm">
                                {logs.length === 0 ? (
                                    <tr><td colSpan={5} className="p-8 text-center text-gray-500">No hay registros de envío todavía.</td></tr>
                                ) : logs.map((log) => (
                                    <tr key={log.id} className="hover:bg-gray-50/50 transition-colors">
                                        <td className="p-4">
                                            {log.type === 'email' ? (
                                                <div className="w-8 h-8 rounded-lg bg-blue-50 flex items-center justify-center text-blue-600"><Mail className="w-4 h-4" /></div>
                                            ) : (
                                                <div className="w-8 h-8 rounded-lg bg-green-50 flex items-center justify-center text-green-600"><MessageCircle className="w-4 h-4" /></div>
                                            )}
                                        </td>
                                        <td className="p-4 font-medium text-gray-900">{log.recipient}</td>
                                        <td className="p-4 text-gray-500 truncate max-w-[200px]">
                                            {log.subject || log.content.substring(0, 40) + '...'}
                                        </td>
                                        <td className="p-4">
                                            {log.status === 'sent' ? (
                                                <span className="flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-emerald-50 text-emerald-700 font-bold text-xs w-max">
                                                    <CheckCircle2 className="w-3.5 h-3.5" /> Exitoso
                                                </span>
                                            ) : (
                                                <span className="flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-rose-50 text-rose-700 font-bold text-xs w-max" title={log.errorMsg}>
                                                    <XCircle className="w-3.5 h-3.5" /> Fallido
                                                </span>
                                            )}
                                        </td>
                                        <td className="p-4 text-gray-500 whitespace-nowrap">
                                            {new Date(log.createdAt).toLocaleString()}
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                </div>
            )}

            {/* Tab: Templates */}
            {activeTab === 'templates' && (
                <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-8 text-center">
                    <div className="w-16 h-16 bg-blue-50 text-blue-600 rounded-2xl flex items-center justify-center mx-auto mb-4">
                        <ClipboardList className="w-8 h-8" />
                    </div>
                    <h2 className="text-xl font-bold text-gray-900 mb-2">Plantillas y Workflows</h2>
                    <p className="text-gray-500 max-w-md mx-auto mb-6">Administra los correos de bienvenida de nuevos miembros, los recibos automáticos y recordatorios.</p>
                    <button className="bg-gray-900 text-white px-6 py-2.5 rounded-xl text-sm font-bold shadow-sm shadow-gray-900/20 active:scale-95 transition-all">
                        Crear nueva plantilla
                    </button>

                    <div className="mt-8 text-left grid grid-cols-1 md:grid-cols-2 gap-4">
                        {templates.map(tpl => (
                            <div key={tpl.id} className="border border-gray-100 p-4 rounded-xl flex justify-between items-center group hover:border-blue-200 transition-colors cursor-pointer">
                                <div>
                                    <div className="flex items-center gap-2 mb-1">
                                        {tpl.type === 'email' ? <Mail className="w-4 h-4 text-gray-400" /> : <MessageCircle className="w-4 h-4 text-gray-400" />}
                                        <p className="font-bold text-gray-900">{tpl.name}</p>
                                    </div>
                                    <p className="text-xs text-gray-500 truncate">{tpl.subject || tpl.content.substring(0, 30)}</p>
                                </div>
                            </div>
                        ))}
                    </div>
                </div>
            )}

        </AdminLayout>
    );
};

export default CRMManagement;
