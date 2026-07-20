import React, { useState } from 'react';
import AdminLayout from '../../components/admin/AdminLayout';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '../../components/ui/tabs';
import { Share2, LinkIcon, Sparkles, Library, BarChart3, Inbox, ShieldCheck } from 'lucide-react';

// Reutilizamos el motor maduro del Content Studio (mismos endpoints /api/social).
import AccountManager from '../../components/admin/content-studio/AccountManager';
import PostGenerator from '../../components/admin/content-studio/PostGenerator';
import PublicationLibrary from '../../components/admin/content-studio/PublicationLibrary';
// Componentes propios del Hub Social (fundación v4.554).
import MetricsDashboard from '../../components/admin/social-hub/MetricsDashboard';
import InboxCenter from '../../components/admin/social-hub/InboxCenter';
import AuditPanel from '../../components/admin/social-hub/AuditPanel';

const TAB_CLASS =
    'rounded-xl px-5 py-2.5 data-[state=active]:bg-white data-[state=active]:shadow-sm data-[state=active]:text-indigo-600 font-bold transition-all flex items-center gap-2 whitespace-nowrap text-sm';

const SocialHub: React.FC = () => {
    // Si venimos de un OAuth exitoso con ?tab=accounts, arrancamos en Cuentas.
    const initialTab = new URLSearchParams(window.location.search).get('tab') === 'accounts' ? 'accounts' : 'accounts';
    const [tab, setTab] = useState(initialTab);

    return (
        <AdminLayout>
            <div className="max-w-6xl mx-auto space-y-8 pb-20">
                {/* Header */}
                <div className="bg-gradient-to-br from-[#013388] via-indigo-700 to-pink-600 rounded-[2.5rem] p-10 text-white shadow-2xl relative overflow-hidden">
                    <div className="absolute top-0 right-0 w-64 h-64 bg-yellow-400/10 rounded-full -translate-y-1/2 translate-x-1/2 blur-3xl" />
                    <div className="relative z-10 flex flex-col md:flex-row justify-between items-start md:items-center gap-6">
                        <div className="space-y-3">
                            <h2 className="text-4xl font-black flex items-center gap-4 tracking-tight">
                                <span className="p-2 bg-yellow-400 rounded-2xl shadow-lg">
                                    <Share2 className="w-8 h-8 text-[#013388]" />
                                </span>
                                Hub Social
                            </h2>
                            <p className="text-blue-100 max-w-2xl text-lg font-medium leading-relaxed">
                                Centro unificado de gestión de Facebook e Instagram: conectá cuentas, publicá y programá
                                contenido con IA, medí resultados y respondé mensajes y comentarios desde un solo lugar.
                            </p>
                        </div>
                    </div>
                </div>

                <Tabs value={tab} onValueChange={setTab} className="w-full">
                    <TabsList className="bg-gray-100/60 p-1 rounded-2xl mb-8 border border-gray-100 overflow-x-auto flex-nowrap">
                        <TabsTrigger value="accounts" className={TAB_CLASS}><LinkIcon className="w-4 h-4" /> Cuentas</TabsTrigger>
                        <TabsTrigger value="publish" className={TAB_CLASS}><Sparkles className="w-4 h-4" /> Publicar</TabsTrigger>
                        <TabsTrigger value="calendar" className={TAB_CLASS}><Library className="w-4 h-4" /> Biblioteca & Calendario</TabsTrigger>
                        <TabsTrigger value="metrics" className={TAB_CLASS}><BarChart3 className="w-4 h-4" /> Métricas</TabsTrigger>
                        <TabsTrigger value="inbox" className={TAB_CLASS}><Inbox className="w-4 h-4" /> Bandeja</TabsTrigger>
                        <TabsTrigger value="audit" className={TAB_CLASS}><ShieldCheck className="w-4 h-4" /> Auditoría</TabsTrigger>
                    </TabsList>

                    <TabsContent value="accounts" className="mt-0 focus-visible:outline-none">
                        <AccountManager />
                    </TabsContent>
                    <TabsContent value="publish" className="mt-0 focus-visible:outline-none">
                        <PostGenerator />
                    </TabsContent>
                    <TabsContent value="calendar" className="mt-0 focus-visible:outline-none">
                        <PublicationLibrary />
                    </TabsContent>
                    <TabsContent value="metrics" className="mt-0 focus-visible:outline-none">
                        <MetricsDashboard />
                    </TabsContent>
                    <TabsContent value="inbox" className="mt-0 focus-visible:outline-none">
                        <InboxCenter />
                    </TabsContent>
                    <TabsContent value="audit" className="mt-0 focus-visible:outline-none">
                        <AuditPanel />
                    </TabsContent>
                </Tabs>
            </div>
        </AdminLayout>
    );
};

export default SocialHub;
