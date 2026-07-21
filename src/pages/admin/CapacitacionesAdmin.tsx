import React from 'react';
import AdminLayout from '../../components/admin/AdminLayout';
import { GraduationCap, CalendarDays, Clock, ListChecks, BarChart3 } from 'lucide-react';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '../../components/ui/tabs';
import AdminBookingsCalendar from '../../components/admin/training/AdminBookingsCalendar';
import AvailabilityConfig from '../../components/admin/training/AvailabilityConfig';
import AppointmentTypesManager from '../../components/admin/training/AppointmentTypesManager';
import TrainingStats from '../../components/admin/training/TrainingStats';

// Panel del Superadministrador / soporte del módulo de capacitaciones.
const CapacitacionesAdmin: React.FC = () => {
    const tab = (v: string, Icon: any, label: string) => (
        <TabsTrigger value={v} className="rounded-xl px-5 py-2 data-[state=active]:bg-white data-[state=active]:shadow-sm data-[state=active]:text-indigo-600 font-bold flex items-center gap-2 whitespace-nowrap">
            <Icon className="w-4 h-4" />{label}
        </TabsTrigger>
    );
    return (
        <AdminLayout>
            <div className="flex flex-col gap-6">
                <div className="flex items-center gap-3">
                    <div className="w-11 h-11 rounded-2xl bg-gradient-to-br from-indigo-500 to-purple-600 flex items-center justify-center shadow-lg shadow-indigo-500/20">
                        <GraduationCap className="w-6 h-6 text-white" />
                    </div>
                    <div>
                        <h1 className="text-2xl font-black text-gray-900 tracking-tight">Capacitaciones y Soporte</h1>
                        <p className="text-gray-500 text-sm font-medium">Agenda, disponibilidad, servicios y estadísticas del acompañamiento a sitios.</p>
                    </div>
                </div>

                <Tabs defaultValue="calendario" className="w-full">
                    <TabsList className="bg-gray-100/60 p-1 rounded-2xl mb-6 border border-gray-100 overflow-x-auto flex-nowrap">
                        {tab('calendario', CalendarDays, 'Calendario')}
                        {tab('disponibilidad', Clock, 'Disponibilidad')}
                        {tab('tipos', ListChecks, 'Tipos de cita')}
                        {tab('estadisticas', BarChart3, 'Estadísticas')}
                    </TabsList>
                    <TabsContent value="calendario" className="focus-visible:outline-none"><AdminBookingsCalendar /></TabsContent>
                    <TabsContent value="disponibilidad" className="focus-visible:outline-none"><AvailabilityConfig /></TabsContent>
                    <TabsContent value="tipos" className="focus-visible:outline-none"><AppointmentTypesManager /></TabsContent>
                    <TabsContent value="estadisticas" className="focus-visible:outline-none"><TrainingStats /></TabsContent>
                </Tabs>
            </div>
        </AdminLayout>
    );
};

export default CapacitacionesAdmin;
