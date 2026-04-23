import React, { useState, useEffect } from 'react';
import AdminLayout from '../../components/admin/AdminLayout';
import { Share2, Facebook, Linkedin, Twitter, CheckCircle2, AlertCircle, ExternalLink, RefreshCw, Plus, Shield } from 'lucide-react';
import { toast } from 'sonner';

const SocialHub: React.FC = () => {
    const [connections, setConnections] = useState([
        { id: 'facebook', name: 'Facebook Pages', icon: Facebook, color: 'text-blue-600', bg: 'bg-blue-50', connected: false, account: null },
        { id: 'linkedin', name: 'LinkedIn Professional', icon: Linkedin, color: 'text-blue-700', bg: 'bg-blue-50', connected: false, account: null },
        { id: 'twitter', name: 'X (Twitter)', icon: Twitter, color: 'text-gray-900', bg: 'bg-gray-50', connected: false, account: null }
    ]);
    const [loadingPlatform, setLoadingPlatform] = useState<string | null>(null);
    const [isPageSelectorOpen, setIsPageSelectorOpen] = useState(false);
    useEffect(() => {
        fetchConnectedAccounts();
        
        // Verificar si volvemos de un OAuth exitoso
        const params = new URLSearchParams(window.location.search);
        if (params.get('status') === 'success') {
            toast.success('¡Conexión exitosa!', {
                description: `Se ha vinculado la cuenta de ${params.get('platform')}`
            });
            // Limpiar URL
            window.history.replaceState({}, document.title, window.location.pathname);
        }
    }, []);

    const fetchConnectedAccounts = async () => {
        try {
            const response = await fetch('/api/social/accounts');
            const data = await response.json();
            
            if (Array.isArray(data)) {
                setConnections(prev => prev.map(p => {
                    const matched = data.find(acc => acc.platform === p.id);
                    return matched ? { ...p, connected: true, account: matched.accountName } : p;
                }));
            }
        } catch (error) {
            console.error('Fallo al cargar cuentas sociales');
        }
    };

    const handleConnect = async (platformId: string) => {
        setLoadingPlatform(platformId);
        
        try {
            const response = await fetch(`/api/social/connect/${platformId}`);
            const data = await response.json();
            
            if (data.url) {
                toast.info(`Redirigiendo a ${platformId}...`, {
                    description: 'Autoriza el acceso para continuar.'
                });
                window.location.href = data.url;
            } else {
                throw new Error('No se obtuvo URL de autenticación');
            }
        } catch (error) {
            toast.error('Error al iniciar conexión');
            setLoadingPlatform(null);
        }
    };

    const handleDisconnect = (platformId: string) => {
        setConnections(prev => prev.map(c => 
            c.id === platformId ? { ...c, connected: false, account: null } : c
        ));
        toast.info('Cuenta desconectada exitosamente.');
    };

    return (
        <AdminLayout>
            <div className="max-w-5xl mx-auto space-y-8 pb-20">
                {/* Header Section */}
                <div className="bg-[#013388] rounded-[2.5rem] p-10 text-white shadow-2xl relative overflow-hidden border border-blue-400/20">
                    <div className="absolute top-0 right-0 w-64 h-64 bg-yellow-400/10 rounded-full -translate-y-1/2 translate-x-1/2 blur-3xl"></div>
                    <div className="relative z-10 flex flex-col md:flex-row justify-between items-center gap-8">
                        <div className="space-y-4 text-center md:text-left">
                            <h2 className="text-4xl font-black flex items-center gap-4 justify-center md:justify-start tracking-tight">
                                <span className="p-2 bg-yellow-400 rounded-2xl shadow-lg shadow-yellow-400/20">
                                    <Share2 className="w-8 h-8 text-[#013388]" />
                                </span>
                                <span className="drop-shadow-md">Omnicanalidad Estratégica</span>
                            </h2>
                            <p className="text-blue-100 max-w-xl text-lg font-medium leading-relaxed">
                                Conecta tus cuentas oficiales para automatizar la publicación de noticias, proyectos y eventos institucionales en un solo clic.
                            </p>
                        </div>
                        <div className="flex gap-4">
                            <div className="bg-white/10 backdrop-blur-xl p-6 rounded-[2rem] border border-white/20 text-center min-w-[120px] shadow-inner">
                                <div className="text-3xl font-black text-yellow-400">{connections.filter(c => c.connected).length}/3</div>
                                <div className="text-[10px] uppercase font-black tracking-[0.2em] opacity-70 mt-1">Nodos Activos</div>
                            </div>
                        </div>
                    </div>
                </div>

                {/* Status Alert if not connected */}
                {!connections.some(c => c.connected) && (
                    <div className="bg-amber-50 border border-amber-100 rounded-3xl p-6 flex items-center gap-4 animate-pulse">
                        <div className="p-3 bg-amber-100 rounded-2xl">
                            <AlertCircle className="w-6 h-6 text-amber-600" />
                        </div>
                        <div>
                            <p className="text-sm font-bold text-amber-900">Configuración Pendiente</p>
                            <p className="text-xs text-amber-700">Conecta al menos una red social para habilitar la pestaña "Social" en los editores de contenido.</p>
                        </div>
                    </div>
                )}

                {/* Connections Grid */}
                <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                    {connections.map((platform) => (
                        <div key={platform.id} className="bg-white rounded-[2rem] p-8 shadow-sm border border-gray-100 flex flex-col justify-between transition-all hover:shadow-xl hover:border-rotary-blue/20 group">
                            <div className="space-y-6">
                                <div className="flex justify-between items-start">
                                    <div className={`p-4 rounded-2xl ${platform.bg} ${platform.color} shadow-sm group-hover:scale-110 transition-transform`}>
                                        <platform.icon className="w-7 h-7" />
                                    </div>
                                    {platform.connected ? (
                                        <span className="flex items-center gap-1.5 text-[10px] font-black uppercase tracking-widest bg-emerald-50 text-emerald-600 px-3 py-1.5 rounded-full border border-emerald-100">
                                            <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-ping" /> Synchronized
                                        </span>
                                    ) : (
                                        <span className="flex items-center gap-1.5 text-[10px] font-black uppercase tracking-widest bg-gray-50 text-gray-400 px-3 py-1.5 rounded-full border border-gray-100">
                                            Offline
                                        </span>
                                    )}
                                </div>
                                
                                <div>
                                    <h3 className="font-black text-gray-800 text-xl tracking-tight">{platform.name}</h3>
                                    <p className="text-sm text-gray-500 mt-2 leading-relaxed">
                                        {platform.connected 
                                            ? <span className="font-bold text-rotary-blue">Cuenta: {platform.account}</span>
                                            : 'Autoriza el acceso oficial para automatizar posts presidenciales.'}
                                    </p>
                                </div>
                            </div>

                            <div className="mt-10 pt-6 border-t border-gray-50">
                                {platform.connected ? (
                                    <div className="space-y-3">
                                        <button 
                                            onClick={() => handleDisconnect(platform.id)}
                                            className="w-full py-3.5 rounded-2xl border border-red-50 text-red-500 text-sm font-bold hover:bg-red-50 transition-all flex items-center justify-center gap-2"
                                        >
                                            Desconectar Nodo
                                        </button>
                                        <button className="w-full py-2 text-gray-400 text-[10px] font-black uppercase tracking-widest hover:text-rotary-blue transition-colors flex items-center justify-center gap-2">
                                            <RefreshCw className="w-3 h-3" /> Revalidar Tokens
                                        </button>
                                    </div>
                                ) : (
                                    <button 
                                        disabled={loadingPlatform === platform.id}
                                        onClick={() => handleConnect(platform.id)}
                                        className="w-full py-4 bg-[#013388] text-white rounded-2xl text-sm font-black hover:bg-blue-900 transition-all shadow-lg shadow-blue-900/20 flex items-center justify-center gap-3 group-hover:translate-y-[-2px]"
                                    >
                                        {loadingPlatform === platform.id ? (
                                            <RefreshCw className="w-5 h-5 animate-spin" />
                                        ) : (
                                            <Plus className="w-5 h-5 text-yellow-400" />
                                        )}
                                        {loadingPlatform === platform.id ? 'AUTENTICANDO...' : 'VINCULAR AHORA'}
                                    </button>
                                )}
                            </div>
                        </div>
                    ))}
                </div>

                {/* Automation Rules */}
                <div className="bg-white rounded-[2.5rem] p-10 border border-gray-100 shadow-sm">
                    <div className="flex items-center justify-between mb-8">
                        <h3 className="text-2xl font-black text-gray-800 flex items-center gap-3">
                             <SettingsIcon className="w-6 h-6 text-rotary-blue" /> Políticas de Orquestación
                        </h3>
                        <span className="text-[10px] font-black text-rotary-blue bg-blue-50 px-3 py-1 rounded-full uppercase tracking-widest">IA Powered</span>
                    </div>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                        <div className="group flex items-center justify-between p-6 bg-gray-50 rounded-3xl border border-transparent hover:border-blue-100 hover:bg-white transition-all">
                            <div className="space-y-1">
                                <div className="font-bold text-gray-800">Sincronización Transversal</div>
                                <div className="text-xs text-gray-500">Publicar noticias en Facebook & LinkedIn simultáneamente.</div>
                            </div>
                            <div className="w-14 h-7 bg-rotary-blue rounded-full relative p-1 cursor-pointer shadow-inner shadow-blue-900/20">
                                <div className="w-5 h-5 bg-white rounded-full absolute right-1 shadow-md"></div>
                            </div>
                        </div>
                        <div className="group flex items-center justify-between p-6 bg-gray-50 rounded-3xl border border-transparent hover:border-blue-100 hover:bg-white transition-all opacity-50">
                            <div className="space-y-1">
                                <div className="font-bold text-gray-800">Optimización de Media</div>
                                <div className="text-xs text-gray-500">Ajustar dimensiones de fotos para cada red con IA.</div>
                            </div>
                            <div className="w-14 h-7 bg-gray-300 rounded-full relative p-1 cursor-not-allowed">
                                <div className="w-5 h-5 bg-white rounded-full absolute left-1"></div>
                            </div>
                        </div>
                    </div>
                </div>

                {/* Security Note */}
                <div className="flex items-center gap-6 p-8 bg-blue-50/30 rounded-[2.5rem] border border-blue-100/30">
                    <div className="p-4 bg-white rounded-[1.5rem] shadow-sm">
                        <Shield className="w-8 h-8 text-rotary-blue" />
                    </div>
                    <p className="text-sm text-blue-900/70 leading-relaxed font-medium">
                        <b className="text-rotary-blue block mb-1">Gobernanza de Datos & Privacidad:</b> 
                        Rotary Platform utiliza protocolos OAuth 2.0 de última generación. Los tokens están encriptados y el acceso puede revocarse desde el panel de seguridad de cada red social. No se almacenan credenciales directas.
                    </p>
                </div>
            </div>
        </AdminLayout>
    );
};

function SettingsIcon({ className }: { className: string }) {
    return (
        <svg className={className} fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
        </svg>
    );
}

export default SocialHub;
