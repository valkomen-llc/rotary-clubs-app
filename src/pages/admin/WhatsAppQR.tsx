import React, { useState, useEffect } from 'react';
import { QrCode, Smartphone, Wifi, WifiOff, LogOut, Loader, RefreshCw, Send, Users } from 'lucide-react';
import AdminLayout from '../../components/admin/AdminLayout';
import { useAuth } from '../../hooks/useAuth';

const API = import.meta.env.VITE_API_URL || '/api';

const WhatsAppQR: React.FC = () => {
    const { token } = useAuth();
    const [status, setStatus] = useState<string>('LOADING'); // LOADING, DISCONNECTED, INITIALIZING, QR_READY, CONNECTED
    const [qrCode, setQrCode] = useState<string | null>(null);
    const [loadingAction, setLoadingAction] = useState(false);

    const checkStatus = async () => {
        try {
            const res = await fetch(`${API}/whatsapp-qr/status`, {
                headers: { 'Authorization': `Bearer ${token}` }
            });
            const data = await res.json();
            setStatus(data.status);
            setQrCode(data.qr);
        } catch (e) {
            console.error(e);
            setStatus('DISCONNECTED');
        }
    };

    const startSession = async () => {
        setLoadingAction(true);
        setStatus('INITIALIZING');
        try {
            await fetch(`${API}/whatsapp-qr/start`, {
                method: 'POST',
                headers: { 'Authorization': `Bearer ${token}` }
            });
            // We just trigger it, checking status will pull updates
        } catch (e) {
            console.error(e);
            setStatus('DISCONNECTED');
        }
        setLoadingAction(false);
    };

    const disconnectSession = async () => {
        if (!confirm('¿Estás seguro de desconectar el dispositivo local?')) return;
        setLoadingAction(true);
        try {
            await fetch(`${API}/whatsapp-qr/disconnect`, {
                method: 'POST',
                headers: { 'Authorization': `Bearer ${token}` }
            });
            setStatus('DISCONNECTED');
            setQrCode(null);
        } catch (e) {
            console.error(e);
        }
        setLoadingAction(false);
    };

    // Auto-poll status
    useEffect(() => {
        checkStatus();
        const interval = setInterval(checkStatus, 3000);
        return () => clearInterval(interval);
    }, []);

    return (
        <AdminLayout>
            <div className="max-w-4xl mx-auto space-y-6">
                
                {/* Header */}
                <div className="bg-white rounded-2xl border border-gray-200 p-6 shadow-sm overflow-hidden relative">
                    <div className="absolute top-0 right-0 w-64 h-64 bg-emerald-500/5 rounded-full blur-3xl -mr-20 -mt-20 pointer-events-none" />
                    
                    <div className="flex flex-col md:flex-row md:items-start justify-between gap-6 relative z-10">
                        <div className="flex items-start gap-4">
                            <div className="w-14 h-14 rounded-2xl bg-emerald-50 border border-emerald-100 flex items-center justify-center flex-shrink-0 text-emerald-600">
                                <QrCode className="w-7 h-7" />
                            </div>
                            <div>
                                <h1 className="text-2xl font-black text-gray-900 tracking-tight flex items-center gap-2">
                                    WhatsApp Web Gateway
                                </h1>
                                <p className="text-sm text-gray-500 mt-1 max-w-xl leading-relaxed">
                                    Sistema nativo reservado para el Super Administrador. Empareja el número de WhatsApp oficial del Distrito para comunicarse masivamente con Grupos y Comunidades de Rotary por fuera de la API Meta.
                                </p>
                            </div>
                        </div>

                        {/* Status Badge */}
                        <div className="flex-shrink-0">
                            {status === 'CONNECTED' && (
                                <div className="bg-emerald-50 text-emerald-700 px-4 py-2 rounded-xl flex items-center gap-2 border border-emerald-200 font-bold text-sm shadow-sm">
                                    <span className="w-2.5 h-2.5 rounded-full bg-emerald-500 animate-pulse" />
                                    Vínculo Activo
                                </div>
                            )}
                            {status === 'DISCONNECTED' && (
                                <div className="bg-red-50 text-red-700 px-4 py-2 rounded-xl flex items-center gap-2 border border-red-200 font-bold text-sm shadow-sm">
                                    <WifiOff className="w-4 h-4" />
                                    Sin Conexión
                                </div>
                            )}
                             {status === 'INITIALIZING' && (
                                <div className="bg-amber-50 text-amber-700 px-4 py-2 rounded-xl flex items-center gap-2 border border-amber-200 font-bold text-sm shadow-sm">
                                    <Loader className="w-4 h-4 animate-spin" />
                                    Iniciando Servidor...
                                </div>
                            )}
                        </div>
                    </div>
                </div>

                {/* Main Content Area */}
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                    
                    {/* Scanner Section */}
                    <div className="bg-white rounded-2xl border border-gray-200 shadow-sm p-8 flex flex-col items-center text-center">
                        <h2 className="text-lg font-bold text-gray-900 mb-6 w-full text-left">Emparejamiento de Dispositivo</h2>

                        <div className="flex-1 flex flex-col items-center justify-center w-full min-h-[300px]">
                            {status === 'LOADING' && (
                                <Loader className="w-10 h-10 text-emerald-500 animate-spin opacity-50" />
                            )}

                            {status === 'DISCONNECTED' && (
                                <div className="w-full flex flex-col items-center">
                                    <div className="w-24 h-24 bg-gray-50 rounded-2xl border-2 border-dashed border-gray-200 flex items-center justify-center mb-6">
                                        <Smartphone className="w-8 h-8 text-gray-300" />
                                    </div>
                                    <p className="text-sm font-medium text-gray-500 mb-6">El módulo nativo está inactivo. Enciende el servidor para generar un QR y conectar el número institucional asociado a los grupos distritales.</p>
                                    <button 
                                        onClick={startSession}
                                        disabled={loadingAction}
                                        className="bg-emerald-600 hover:bg-emerald-700 text-white px-6 py-3 rounded-xl font-bold flex items-center gap-2 transition-all disabled:opacity-50 w-full justify-center">
                                        {loadingAction ? <Loader className="w-5 h-5 animate-spin"/> : <RefreshCw className="w-5 h-5" />}
                                        Encender Servidor WA Web
                                    </button>
                                </div>
                            )}

                            {status === 'INITIALIZING' && (
                                <div className="flex flex-col items-center space-y-4">
                                    <div className="w-48 h-48 bg-gray-50 rounded-2xl border border-gray-100 flex flex-col items-center justify-center relative overflow-hidden">
                                        <div className="absolute inset-0 bg-gradient-to-t from-emerald-500/10 to-transparent animate-pulse" />
                                        <RefreshCw className="w-10 h-10 text-emerald-500 animate-spin opacity-80" />
                                    </div>
                                    <p className="text-sm font-bold text-gray-600">Simulando entorno de navegador Chrome...</p>
                                    <p className="text-xs text-gray-400">Este proceso puede tardar hasta 40 segundos.</p>
                                </div>
                            )}

                            {status === 'QR_READY' && qrCode && (
                                <div className="flex flex-col items-center animate-fade-in">
                                    <div className="bg-white p-3 rounded-2xl border-4 border-gray-100 shadow-xl mb-6 relative">
                                        {/* Scanner Line Animation */}
                                        <div className="absolute top-0 left-0 w-full h-[2px] bg-emerald-500 shadow-[0_0_8px_2px_rgba(16,185,129,0.5)] animate-scan" style={{ animation: 'scan 2.5s infinite linear' }} />
                                        <img src={qrCode} alt="WhatsApp QR Code" className="w-64 h-64 object-contain" />
                                    </div>
                                    <h3 className="font-black text-gray-900 mb-2">Escanea el código</h3>
                                    <p className="text-sm text-gray-500 max-w-[280px]">
                                        1. Abre WhatsApp en tu celular<br/>
                                        2. Toca Menú o Configuración<br/>
                                        3. Toca Dispositivos vinculados<br/>
                                        4. Apunta la cámara a esta pantalla
                                    </p>
                                </div>
                            )}

                            {status === 'CONNECTED' && (
                                <div className="flex flex-col items-center animate-fade-in w-full">
                                    <div className="w-24 h-24 bg-emerald-100 rounded-full flex items-center justify-center mb-6 border-4 border-white shadow-lg">
                                        <Wifi className="w-10 h-10 text-emerald-600" />
                                    </div>
                                    <h2 className="text-xl font-black text-gray-900 mb-2">¡Dispositivo Conectado!</h2>
                                    <p className="text-sm text-gray-500 mb-8 max-w-[300px]">
                                        La ruta de escape QR está abierta. Los Agentes ahora pueden instruir envíos nativos al WhatsApp conectado y a los grupos en los que participa.
                                    </p>
                                    
                                    <button 
                                        onClick={disconnectSession}
                                        disabled={loadingAction}
                                        className="bg-red-50 text-red-600 border border-red-200 hover:bg-red-100 px-6 py-3 rounded-xl font-bold flex items-center gap-2 w-full justify-center transition-colors">
                                        {loadingAction ? <Loader className="w-5 h-5 animate-spin"/> : <LogOut className="w-5 h-5" />}
                                        Cerrar Sesión Oficial
                                    </button>
                                </div>
                            )}
                        </div>
                    </div>

                    {/* Information Module */}
                    <div className="space-y-6 flex flex-col">
                        <div className="bg-gray-900 rounded-2xl border border-gray-800 p-6 flex-1 shadow-lg text-white">
                            <h3 className="text-lg font-bold mb-4 flex items-center gap-2">
                                <Users className="w-5 h-5 text-emerald-400" />
                                Gestión de Comunidades
                            </h3>
                            <p className="text-sm text-gray-400 leading-relaxed mb-6">
                                La principal ventaja de conectar este Gateway alterno (QR), es que a diferencia de Cloud API, tienes acceso a <strong>funcionalidades nativas de usuario</strong>. 
                                Puedes delegarle a la Agente <em>Camila</em> que anuncie los comunicados dentro de Grupos Rotarios en los cuales el teléfono esté agregado.
                            </p>

                            <div className="bg-black/50 border border-gray-800 rounded-xl p-5 mb-6">
                                <p className="text-xs font-bold text-gray-500 uppercase tracking-widest mb-3">Capacidades Desbloqueadas</p>
                                <ul className="space-y-3">
                                    <li className="flex items-start gap-3">
                                        <div className="w-5 h-5 rounded-full bg-emerald-500/20 flex items-center justify-center flex-shrink-0 mt-0.5">
                                            <Send className="w-3 h-3 text-emerald-400" />
                                        </div>
                                        <div>
                                            <p className="text-sm font-bold text-gray-200">Broadcast a Grupos Locales</p>
                                            <p className="text-xs text-gray-500">Sin plantillas. Habla como una persona en los chats del Distrito.</p>
                                        </div>
                                    </li>
                                    <li className="flex items-start gap-3">
                                        <div className="w-5 h-5 rounded-full bg-emerald-500/20 flex items-center justify-center flex-shrink-0 mt-0.5">
                                            <Send className="w-3 h-3 text-emerald-400" />
                                        </div>
                                        <div>
                                            <p className="text-sm font-bold text-gray-200">Evade Restricciones Comerciales</p>
                                            <p className="text-xs text-gray-500">Perfecto en caso de que Meta rechace una cuenta comercial.</p>
                                        </div>
                                    </li>
                                </ul>
                            </div>

                            <div className="bg-amber-900/30 border border-amber-900/50 rounded-xl p-4 flex gap-3">
                                <LogOut className="w-5 h-5 text-amber-500 flex-shrink-0" />
                                <p className="text-xs text-amber-200/80 leading-relaxed">
                                    <strong>Precaución de Hosting:</strong> Para que este sistema no pierda la conexión local, tu servidor Backend Node debe mantenerse prendido de forma continua (VPS/Container/Instancia 24/7). 
                                </p>
                            </div>
                        </div>
                    </div>

                </div>
            </div>

            <style dangerouslySetInnerHTML={{__html: `
                @keyframes scan {
                    0% { top: 0%; opacity: 0; }
                    10% { opacity: 1; }
                    90% { opacity: 1; }
                    100% { top: 100%; opacity: 0; }
                }
                .animate-scan {
                    animation: scan 2.5s cubic-bezier(0.53, 0.21, 0.29, 0.67) infinite;
                }
            `}} />
        </AdminLayout>
    );
};

export default WhatsAppQR;
