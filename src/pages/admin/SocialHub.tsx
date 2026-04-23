import React, { useState, useEffect } from 'react';
import AdminLayout from '../../components/admin/AdminLayout';
import { Share2, Facebook, Linkedin, Twitter, CheckCircle2, AlertCircle, ExternalLink, RefreshCw, Plus } from 'lucide-react';
import { toast } from 'sonner';

const SocialHub: React.FC = () => {
    const [connections, setConnections] = useState([
        { id: 'facebook', name: 'Facebook Pages', icon: Facebook, color: 'text-blue-600', bg: 'bg-blue-50', connected: false, account: null },
        { id: 'linkedin', name: 'LinkedIn Professional', icon: Linkedin, color: 'text-blue-700', bg: 'bg-blue-50', connected: false, account: null },
        { id: 'twitter', name: 'X (Twitter)', icon: Twitter, color: 'text-gray-900', bg: 'bg-gray-50', connected: false, account: null }
    ]);
    const [loadingPlatform, setLoadingPlatform] = useState<string | null>(null);

    const handleConnect = (platformId: string) => {
        setLoadingPlatform(platformId);
        
        // Simular inicio de OAuth
        setTimeout(() => {
            setLoadingPlatform(null);
            const platform = connections.find(c => c.id === platformId);
            toast.success(`Iniciando conexión con ${platform?.name}...`, {
                description: 'Serás redirigido a la página oficial para autorizar el acceso.'
            });
            
            // En entorno real: window.location.href = `/api/social/connect/${platformId}`;
            // Simulamos conexión para demo
            if (platformId === 'facebook') {
                setConnections(prev => prev.map(c => 
                    c.id === platformId ? { ...c, connected: true, account: 'Rotary Club Buenaventura' } : c
                ));
            }
        }, 1200);
    };

    const handleDisconnect = (platformId: string) => {
        setConnections(prev => prev.map(c => 
            c.id === platformId ? { ...c, connected: false, account: null } : c
        ));
        toast.info('Cuenta desconectada exitosamente.');
    };

    return (
        <AdminLayout title="Hub Social B2B">
            <div className="max-w-5xl mx-auto space-y-8">
                {/* Header Section */}
                <div className="bg-gradient-to-r from-rotary-blue to-blue-900 rounded-3xl p-8 text-white shadow-xl relative overflow-hidden">
                    <div className="relative z-10 flex flex-col md:flex-row justify-between items-center gap-6">
                        <div className="space-y-3 text-center md:text-left">
                            <h2 className="text-3xl font-black flex items-center gap-3 justify-center md:justify-start">
                                <Share2 className="w-8 h-8 text-yellow-400" /> Omnicanalidad Estratégica
                            </h2>
                            <p className="text-blue-100 max-w-xl text-lg">
                                Conecta tus cuentas oficiales para automatizar la publicación de noticias, proyectos y eventos institucionales en un solo clic.
                            </p>
                        </div>
                        <div className="flex gap-4">
                            <div className="bg-white/10 backdrop-blur-md p-4 rounded-2xl border border-white/20 text-center">
                                <div className="text-2xl font-bold">{connections.filter(c => c.connected).length}/3</div>
                                <div className="text-xs uppercase tracking-widest opacity-60">Activas</div>
                            </div>
                        </div>
                    </div>
                </div>

                {/* Connections Grid */}
                <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                    {connections.map((platform) => (
                        <div key={platform.id} className="bg-white rounded-2xl p-6 shadow-sm border border-gray-100 flex flex-col justify-between transition-all hover:shadow-md hover:border-blue-100">
                            <div className="space-y-4">
                                <div className="flex justify-between items-start">
                                    <div className={`p-3 rounded-xl ${platform.bg} ${platform.color}`}>
                                        <platform.icon className="w-6 h-6" />
                                    </div>
                                    {platform.connected ? (
                                        <span className="flex items-center gap-1.5 text-[10px] font-black uppercase tracking-tighter bg-green-100 text-green-700 px-2.5 py-1 rounded-full">
                                            <CheckCircle2 className="w-3 h-3" /> Online
                                        </span>
                                    ) : (
                                        <span className="flex items-center gap-1.5 text-[10px] font-black uppercase tracking-tighter bg-gray-100 text-gray-500 px-2.5 py-1 rounded-full">
                                            Desconectado
                                        </span>
                                    )}
                                </div>
                                
                                <div>
                                    <h3 className="font-bold text-gray-800 text-lg">{platform.name}</h3>
                                    <p className="text-xs text-gray-500 mt-1">
                                        {platform.connected 
                                            ? `Vinculado como: ${platform.account}` 
                                            : 'Autoriza el acceso para publicar contenido automáticamente.'}
                                    </p>
                                </div>
                            </div>

                            <div className="mt-8 pt-6 border-t border-gray-50">
                                {platform.connected ? (
                                    <div className="space-y-3">
                                        <button 
                                            onClick={() => handleDisconnect(platform.id)}
                                            className="w-full py-2.5 rounded-xl border border-red-100 text-red-500 text-sm font-bold hover:bg-red-50 transition-colors"
                                        >
                                            Desconectar Cuenta
                                        </button>
                                        <button className="w-full flex items-center justify-center gap-2 py-2 text-gray-400 text-xs hover:text-rotary-blue transition-colors">
                                            <RefreshCw className="w-3 h-3" /> Sincronizar Permisos
                                        </button>
                                    </div>
                                ) : (
                                    <button 
                                        disabled={loadingPlatform === platform.id}
                                        onClick={() => handleConnect(platform.id)}
                                        className="w-full py-3 bg-rotary-blue text-white rounded-xl text-sm font-bold hover:bg-blue-800 transition-all shadow-lg shadow-blue-900/10 flex items-center justify-center gap-2"
                                    >
                                        {loadingPlatform === platform.id ? (
                                            <RefreshCw className="w-4 h-4 animate-spin" />
                                        ) : (
                                            <Plus className="w-4 h-4" />
                                        )}
                                        {loadingPlatform === platform.id ? 'Iniciando...' : 'Conectar Ahora'}
                                    </button>
                                )}
                            </div>
                        </div>
                    ))}
                </div>

                {/* Automation Rules */}
                <div className="bg-white rounded-3xl p-8 border border-gray-100 shadow-sm">
                    <h3 className="text-xl font-bold text-gray-800 mb-6 flex items-center gap-2">
                         <SettingsIcon className="w-5 h-5 text-rotary-blue" /> Configuración de Publicación
                    </h3>
                    <div className="space-y-6">
                        <div className="flex items-center justify-between p-4 bg-gray-50 rounded-2xl">
                            <div className="space-y-1">
                                <div className="font-bold text-gray-700">Noticias Automáticas</div>
                                <div className="text-xs text-gray-500">Publicar en Facebook cada vez que guardes una nueva noticia.</div>
                            </div>
                            <div className="w-12 h-6 bg-rotary-blue rounded-full relative p-1 cursor-pointer">
                                <div className="w-4 h-4 bg-white rounded-full absolute right-1"></div>
                            </div>
                        </div>
                        <div className="flex items-center justify-between p-4 bg-gray-50 rounded-2xl opacity-60">
                            <div className="space-y-1">
                                <div className="font-bold text-gray-700">X (Twitter) Threads</div>
                                <div className="text-xs text-gray-500">Crear hilos automáticamente para noticias extensas.</div>
                            </div>
                            <div className="w-12 h-6 bg-gray-300 rounded-full relative p-1 cursor-not-allowed">
                                <div className="w-4 h-4 bg-white rounded-full absolute left-1"></div>
                            </div>
                        </div>
                    </div>
                </div>

                {/* Security Note */}
                <div className="flex items-center gap-4 p-6 bg-blue-50/50 rounded-2xl border border-blue-100/50">
                    <AlertCircle className="w-6 h-6 text-rotary-blue flex-shrink-0" />
                    <p className="text-sm text-blue-800 leading-relaxed">
                        <b>Privacidad y Seguridad:</b> Rotary Content Studio no almacena tus contraseñas. Utilizamos tokens de acceso seguro (OAuth 2.0) autorizados oficialmente por cada plataforma. Puedes revocar el acceso en cualquier momento.
                    </p>
                </div>
            </div>
        </AdminLayout>
    );
};

export default SocialHub;

// Mock settings icon to match the UI
const SettingsIcon = ({ className }: { className: string }) => (
    <svg className={className} fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
    </svg>
);
