import React from 'react';
import AdminLayout from '../../components/admin/AdminLayout';
import { Users, FileText, FolderKanban, ArrowRight } from 'lucide-react';

const stats = [
    { label: 'Usuarios', count: '12', icon: Users, color: 'bg-blue-500' },
    { label: 'Proyectos', count: '8', icon: FolderKanban, color: 'bg-green-500' },
    { label: 'Noticias', count: '24', icon: FileText, color: 'bg-purple-500' },
];

const Dashboard: React.FC = () => {
    return (
        <AdminLayout>
            <div className="mb-8">
                <h1 className="text-2xl font-bold text-gray-800">Bienvenido al Panel de Control</h1>
                <p className="text-gray-500">Gestiona el contenido y los usuarios de tu plataforma Rotary.</p>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-8">
                {stats.map((stat, index) => (
                    <div key={index} className="bg-white p-6 rounded-xl shadow-sm border border-gray-100 flex items-center gap-4">
                        <div className={`${stat.color} p-3 rounded-lg text-white`}>
                            <stat.icon className="w-6 h-6" />
                        </div>
                        <div>
                            <p className="text-sm text-gray-400 font-medium">{stat.label}</p>
                            <p className="text-2xl font-bold text-gray-800">{stat.count}</p>
                        </div>
                    </div>
                ))}
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
                <div className="bg-white p-6 rounded-xl shadow-sm border border-gray-100">
                    <h3 className="font-bold text-gray-800 mb-4 flex items-center gap-2">
                        <FileText className="w-5 h-5 text-rotary-blue" /> Acciones Rápidas
                    </h3>
                    <div className="grid grid-cols-1 gap-3">
                        <button className="flex items-center justify-between p-4 rounded-lg bg-gray-50 hover:bg-sky-50 transition-colors group">
                            <span className="text-gray-700 font-medium">Editar Página de Inicio</span>
                            <ArrowRight className="w-4 h-4 text-gray-400 group-hover:text-rotary-blue transition-all group-hover:translate-x-1" />
                        </button>
                        <button className="flex items-center justify-between p-4 rounded-lg bg-gray-50 hover:bg-sky-50 transition-colors group">
                            <span className="text-gray-700 font-medium">Crear Nueva Noticia</span>
                            <ArrowRight className="w-4 h-4 text-gray-400 group-hover:text-rotary-blue transition-all group-hover:translate-x-1" />
                        </button>
                        <button className="flex items-center justify-between p-4 rounded-lg bg-gray-50 hover:bg-sky-50 transition-colors group">
                            <span className="text-gray-700 font-medium">Subir Imágenes a la Galería</span>
                            <ArrowRight className="w-4 h-4 text-gray-400 group-hover:text-rotary-blue transition-all group-hover:translate-x-1" />
                        </button>
                    </div>
                </div>

                <div className="bg-sky-900 rounded-xl shadow-xl p-8 text-white relative overflow-hidden">
                    <div className="relative z-10">
                        <h3 className="text-xl font-bold mb-4 text-rotary-gold">Soporte y Recursos</h3>
                        <p className="text-sky-100 mb-6 text-sm leading-relaxed">
                            ¿Necesitas ayuda para gestionar tu club o configurar el CMS? Consulta nuestra documentación o contacta al administrador global.
                        </p>
                        <button className="bg-white text-sky-900 font-bold px-6 py-2 rounded-lg hover:bg-rotary-gold hover:text-white transition-all text-sm">
                            Ver Guía de Usuario
                        </button>
                    </div>
                    {/* Background decoration */}
                    <div className="absolute top-0 right-0 w-32 h-32 bg-white/10 rounded-full -mr-16 -mt-16 blur-3xl"></div>
                    <div className="absolute bottom-0 left-0 w-24 h-24 bg-rotary-gold/20 rounded-full -ml-12 -mb-12 blur-2xl"></div>
                </div>
            </div>
        </AdminLayout>
    );
};

export default Dashboard;
