import React, { useState } from 'react';
import AdminLayout from '../../components/admin/AdminLayout';
import { 
    Video, 
    Layers, 
    Share2, 
    Clock, 
    Sparkles,
    Trophy,
    Image as ImageIcon,
    Flag,
    Clapperboard,
    Palette,
    Megaphone
} from 'lucide-react';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '../../components/ui/tabs';
import VideoCreator, { type ReelPrefill } from '../../components/admin/content-studio/VideoCreator';
import ProjectLibrary from '../../components/admin/content-studio/ProjectLibrary';
import PublicationLibrary from '../../components/admin/content-studio/PublicationLibrary';
import ReelLibrary from '../../components/admin/content-studio/ReelLibrary';
import AccountManager from '../../components/admin/content-studio/AccountManager';
import ContentQueue from '../../components/admin/content-studio/ContentQueue';
import PostGenerator from '../../components/admin/content-studio/PostGenerator';
import BannerTemplateManager from '../../components/admin/content-studio/BannerTemplateManager';
import OutroGenerator from '../../components/admin/content-studio/OutroGenerator';
import DesignStudio from '../../components/admin/design-studio/DesignStudio';
import DistributionPanel from '../../components/admin/content-studio/DistributionPanel';
import { useAuth } from '../../hooks/useAuth';
import { isPlatformSuperAdmin, isOnPlatformDomain } from '../../lib/platformAdmin';

const ContentStudio: React.FC = () => {
    // v4.798: las pestañas vuelven a ser CONTROLADAS, y esta vez el estado sí
    // se lee — «Duplicar» en la Biblioteca tiene que abrir el Creador de Video
    // ya relleno, y para eso hay que cambiar de pestaña desde acá. (v4.720 las
    // había dejado no controladas porque el estado de entonces no lo leía
    // nadie: quitar estado muerto estaba bien; éste no lo es.)
    const [tab, setTab] = useState('create');

    // La configuración que devuelve «Duplicar» un Reel. Hasta v4.797 se emitía
    // por `onDuplicate` y NADIE la escuchaba: el aviso «Ajustes copiados al
    // creador» era falso y el creador se abría vacío.
    const [reelPrefill, setReelPrefill] = useState<ReelPrefill | null>(null);

    // ── Plantillas IA es del SISTEMA CENTRAL (v4.894) ──────────────
    // Pedido expreso: el módulo de plantillas de los SITIOS va a ser uno
    // nuevo, enfocado en aniversarios, que se construye aparte y se activará
    // en todos; mientras tanto, esta pestaña se OCULTA en el panel de los
    // sitios y queda sólo en Club Platform. Es el MISMO criterio de contexto
    // de plataforma que el resto del panel (`isUIAdmin` en AdminLayout,
    // v4.863): rol de plataforma Y dominio de plataforma — un operador que
    // entra por el dominio de un club está mirando ESE club. La regla vive en
    // `platformAdmin.ts`, compartida: no se escribe una segunda.
    //
    // Esto decide QUÉ SE PINTA, no a qué se tiene acceso: los endpoints de
    // design-studio siguen con su alcance de siempre (`scopeClubId`) y los
    // enlaces públicos ya publicados (`/plantillas/:slug`) no se tocan — son
    // piezas del sistema central que ya circulan.
    const { user } = useAuth();
    const conPlantillas = isPlatformSuperAdmin(user) && isOnPlatformDomain();

    return (
        <AdminLayout>
            <div className="flex flex-col gap-8">
                {/* Header Section */}
                <div className="flex justify-between items-end">
                    <div>
                        <div className="flex items-center gap-3 mb-2">
                            <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-indigo-500 to-purple-600 flex items-center justify-center shadow-lg shadow-indigo-500/20">
                                <Video className="w-6 h-6 text-white" />
                            </div>
                            <h1 className="text-3xl font-black text-gray-900 tracking-tight">Content Studio <span className="text-indigo-600">AI</span></h1>
                        </div>
                        <p className="text-gray-500 font-medium">Genera videos virales desde tus fotos y automatiza tus redes sociales.</p>
                    </div>

                    <div className="flex gap-3">
                        <div className="flex items-center gap-2 px-4 py-2 bg-indigo-50 border border-indigo-100 rounded-xl">
                            <Trophy className="w-4 h-4 text-indigo-600" />
                            <span className="text-xs font-black text-blue-700 uppercase tracking-wider">OpenAI DALL-E 3 HD Enabled</span>
                        </div>
                    </div>
                </div>

                {/* Main Content Areas */}
                <Tabs value={tab} onValueChange={setTab} className="w-full">
                    <TabsList className="bg-gray-100/50 p-1 rounded-2xl mb-8 border border-gray-100 overflow-x-auto flex-nowrap scrollbar-hide">
                        <TabsTrigger value="create" className="rounded-xl px-6 py-2.5 data-[state=active]:bg-white data-[state=active]:shadow-sm data-[state=active]:text-indigo-600 font-bold transition-all flex items-center gap-2 whitespace-nowrap">
                            <Sparkles className="w-4 h-4" />
                            Creador de Video
                        </TabsTrigger>
                        <TabsTrigger value="post" className="rounded-xl px-6 py-2.5 data-[state=active]:bg-white data-[state=active]:shadow-sm data-[state=active]:text-indigo-600 font-bold transition-all flex items-center gap-2 whitespace-nowrap">
                            <ImageIcon className="w-4 h-4" />
                            Generador de Publicaciones
                        </TabsTrigger>
                        <TabsTrigger value="outros" className="rounded-xl px-6 py-2.5 data-[state=active]:bg-white data-[state=active]:shadow-sm data-[state=active]:text-indigo-600 font-bold transition-all flex items-center gap-2 whitespace-nowrap">
                            <Clapperboard className="w-4 h-4" />
                            Generador de Outros IA
                        </TabsTrigger>
                        {conPlantillas && (
                            <TabsTrigger value="plantillas" className="rounded-xl px-6 py-2.5 data-[state=active]:bg-white data-[state=active]:shadow-sm data-[state=active]:text-indigo-600 font-bold transition-all flex items-center gap-2 whitespace-nowrap">
                                <Palette className="w-4 h-4" />
                                Plantillas IA
                            </TabsTrigger>
                        )}
                        <TabsTrigger value="pendones" className="rounded-xl px-6 py-2.5 data-[state=active]:bg-white data-[state=active]:shadow-sm data-[state=active]:text-indigo-600 font-bold transition-all flex items-center gap-2 whitespace-nowrap">
                            <Flag className="w-4 h-4" />
                            Pendones
                        </TabsTrigger>
                        <TabsTrigger value="library" className="rounded-xl px-6 py-2.5 data-[state=active]:bg-white data-[state=active]:shadow-sm data-[state=active]:text-indigo-600 font-bold transition-all flex items-center gap-2 whitespace-nowrap">
                            <Layers className="w-4 h-4" />
                            Biblioteca
                        </TabsTrigger>
                        <TabsTrigger value="accounts" className="rounded-xl px-6 py-2.5 data-[state=active]:bg-white data-[state=active]:shadow-sm data-[state=active]:text-indigo-600 font-bold transition-all flex items-center gap-2 whitespace-nowrap">
                            <Share2 className="w-4 h-4" />
                            Cuentas Sociales
                        </TabsTrigger>
                        <TabsTrigger value="distribution" className="rounded-xl px-6 py-2.5 data-[state=active]:bg-white data-[state=active]:shadow-sm data-[state=active]:text-indigo-600 font-bold transition-all flex items-center gap-2 whitespace-nowrap">
                            <Megaphone className="w-4 h-4" />
                            Distribución
                        </TabsTrigger>
                        <TabsTrigger value="queue" className="rounded-xl px-6 py-2.5 data-[state=active]:bg-white data-[state=active]:shadow-sm data-[state=active]:text-indigo-600 font-bold transition-all flex items-center gap-2 whitespace-nowrap">
                            <Clock className="w-4 h-4" />
                            Cola de Envío
                        </TabsTrigger>
                    </TabsList>

                    <TabsContent value="create" className="mt-0 focus-visible:outline-none">
                        <VideoCreator prefill={reelPrefill} />
                    </TabsContent>

                    <TabsContent value="post" className="mt-0 focus-visible:outline-none">
                        <PostGenerator />
                    </TabsContent>

                    <TabsContent value="outros" className="mt-0 focus-visible:outline-none">
                        <OutroGenerator />
                    </TabsContent>

                    {/* v4.720 — Plantillas IA. Va antes de Pendones porque es el
                        generador de piezas del día a día; el pendón es una pieza
                        anual de gran formato. Desde v4.894, sólo en el Sistema
                        Central — el contenido se condiciona junto con su pestaña,
                        o quedaría alcanzable sin botón que lleve a él. */}
                    {conPlantillas && (
                        <TabsContent value="plantillas" className="mt-0 focus-visible:outline-none">
                            <DesignStudio />
                        </TabsContent>
                    )}

                    <TabsContent value="pendones" className="mt-0 focus-visible:outline-none">
                        <BannerTemplateManager />
                    </TabsContent>

                    <TabsContent value="library" className="mt-0 focus-visible:outline-none space-y-8">
                        {/* v4.669: los Reels van PRIMERO. Hasta ahora la pestaña sólo
                            pintaba las publicaciones sociales y, colapsada al fondo, la
                            videoteca del Creador de Video anterior (VideoProject), así que
                            ningún Reel aparecía en ninguna parte pese a estar guardado. */}
                        <ReelLibrary onDuplicate={p => {
                            // El objeto llega tal cual lo devolvió el servidor;
                            // el creador valida cada campo al aplicarlo.
                            setReelPrefill(p as ReelPrefill);
                            setTab('create');
                        }} />
                        {/* v4.346: Biblioteca de Publicaciones (drafts, programadas, publicadas).
                            La videoteca histórica queda accesible al final para no romper el
                            flujo de los videos AI. */}
                        <PublicationLibrary />
                        <details className="bg-white rounded-2xl border border-gray-100 shadow-sm">
                            <summary className="cursor-pointer p-5 font-black text-gray-700 text-sm hover:bg-gray-50 transition-colors flex items-center justify-between">
                                <span>Videos AI generados</span>
                                <span className="text-[10px] font-bold text-gray-400">Click para expandir</span>
                            </summary>
                            <div className="p-5 border-t border-gray-50">
                                <ProjectLibrary />
                            </div>
                        </details>
                    </TabsContent>

                    <TabsContent value="accounts" className="mt-0 focus-visible:outline-none">
                        <AccountManager />
                    </TabsContent>

                    {/* v4.864 — Distribución multi-destino. Va junto a Cuentas
                        Sociales porque de ahí salen los destinos, y antes de la
                        Cola de Envío porque ésta muestra el resultado. */}
                    <TabsContent value="distribution" className="mt-0 focus-visible:outline-none">
                        <DistributionPanel />
                    </TabsContent>

                    <TabsContent value="queue" className="mt-0 focus-visible:outline-none">
                        <ContentQueue />
                    </TabsContent>
                </Tabs>
            </div>
        </AdminLayout>
    );
};

export default ContentStudio;
