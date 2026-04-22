import React, { useState } from 'react';
import AdminLayout from '../../components/admin/AdminLayout';
import { 
    Video, 
    Layers, 
    Share2, 
    Clock, 
    Sparkles, 
    Trophy
} from 'lucide-react';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '../../components/ui/tabs';
import VideoCreator from '../../components/admin/content-studio/VideoCreator';
import ProjectLibrary from '../../components/admin/content-studio/ProjectLibrary';
import AccountManager from '../../components/admin/content-studio/AccountManager';
import ContentQueue from '../../components/admin/content-studio/ContentQueue';

const ContentStudio: React.FC = () => {
    const [activeTab, setActiveTab] = useState('create');

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
                            <span className="text-xs font-black text-indigo-700 uppercase tracking-wider">KIE.ai Enabled</span>
                        </div>
                    </div>
                </div>

                {/* Main Content Areas */}
                <Tabs defaultValue="create" className="w-full" onValueChange={setActiveTab}>
                    <TabsList className="bg-gray-100/50 p-1 rounded-2xl mb-8 border border-gray-100">
                        <TabsTrigger value="create" className="rounded-xl px-6 py-2.5 data-[state=active]:bg-white data-[state=active]:shadow-sm data-[state=active]:text-indigo-600 font-bold transition-all flex items-center gap-2">
                            <Sparkles className="w-4 h-4" />
                            Creador de Video
                        </TabsTrigger>
                        <TabsTrigger value="library" className="rounded-xl px-6 py-2.5 data-[state=active]:bg-white data-[state=active]:shadow-sm data-[state=active]:text-indigo-600 font-bold transition-all flex items-center gap-2">
                            <Layers className="w-4 h-4" />
                            Biblioteca
                        </TabsTrigger>
                        <TabsTrigger value="accounts" className="rounded-xl px-6 py-2.5 data-[state=active]:bg-white data-[state=active]:shadow-sm data-[state=active]:text-indigo-600 font-bold transition-all flex items-center gap-2">
                            <Share2 className="w-4 h-4" />
                            Cuentas Sociales
                        </TabsTrigger>
                        <TabsTrigger value="queue" className="rounded-xl px-6 py-2.5 data-[state=active]:bg-white data-[state=active]:shadow-sm data-[state=active]:text-indigo-600 font-bold transition-all flex items-center gap-2">
                            <Clock className="w-4 h-4" />
                            Cola de Envío
                        </TabsTrigger>
                    </TabsList>

                    <TabsContent value="create" className="mt-0 focus-visible:outline-none">
                        <VideoCreator />
                    </TabsContent>

                    <TabsContent value="library" className="mt-0 focus-visible:outline-none">
                        <ProjectLibrary />
                    </TabsContent>

                    <TabsContent value="accounts" className="mt-0 focus-visible:outline-none">
                        <AccountManager />
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
