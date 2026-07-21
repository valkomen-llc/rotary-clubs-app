import React, { useState } from 'react';
import AdminLayout from '../../components/admin/AdminLayout';
import { CalendarClock, History } from 'lucide-react';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '../../components/ui/tabs';
import BookingWizard from '../../components/admin/training/BookingWizard';
import MyTrainings from '../../components/admin/training/MyTrainings';

// Área del usuario/sitio: "Reservar capacitación / Agenda de soporte".
const AgendaSoporte: React.FC = () => {
    const [reloadKey, setReloadKey] = useState(0);
    return (
        <AdminLayout>
            <div className="flex flex-col gap-6">
                <div className="flex items-center gap-3">
                    <div className="w-11 h-11 rounded-2xl bg-gradient-to-br from-indigo-500 to-blue-700 flex items-center justify-center shadow-lg shadow-indigo-500/20">
                        <CalendarClock className="w-6 h-6 text-white" />
                    </div>
                    <div>
                        <h1 className="text-2xl font-black text-gray-900 tracking-tight">Agenda de Soporte</h1>
                        <p className="text-gray-500 text-sm font-medium">Reserva capacitaciones, soporte y acompañamiento de Club Platform.</p>
                    </div>
                </div>

                <Tabs defaultValue="reservar" className="w-full">
                    <TabsList className="bg-gray-100/60 p-1 rounded-2xl mb-6 border border-gray-100">
                        <TabsTrigger value="reservar" className="rounded-xl px-5 py-2 data-[state=active]:bg-white data-[state=active]:shadow-sm data-[state=active]:text-indigo-600 font-bold flex items-center gap-2">
                            <CalendarClock className="w-4 h-4" />Reservar capacitación
                        </TabsTrigger>
                        <TabsTrigger value="historial" className="rounded-xl px-5 py-2 data-[state=active]:bg-white data-[state=active]:shadow-sm data-[state=active]:text-indigo-600 font-bold flex items-center gap-2">
                            <History className="w-4 h-4" />Mis capacitaciones
                        </TabsTrigger>
                    </TabsList>
                    <TabsContent value="reservar" className="focus-visible:outline-none">
                        <BookingWizard onBooked={() => setReloadKey(k => k + 1)} />
                    </TabsContent>
                    <TabsContent value="historial" className="focus-visible:outline-none">
                        <MyTrainings reloadKey={reloadKey} />
                    </TabsContent>
                </Tabs>
            </div>
        </AdminLayout>
    );
};

export default AgendaSoporte;
