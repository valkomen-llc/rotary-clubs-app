import React from 'react';
import { Link, useNavigate, useLocation } from 'react-router-dom';
import {
    LayoutDashboard,
    Users,
    Building2,
    FileText,
    FolderKanban,
    Newspaper,
    HeartHandshake,
    Image as ImageIcon,
    Settings,
    LogOut,
    ChevronLeft
} from 'lucide-react';
import { useAuth } from '../../hooks/useAuth';

const menuItems = [
    { icon: LayoutDashboard, label: 'Dashboard', path: '/admin/dashboard' },
    { icon: Users, label: 'Usuarios', path: '/admin/usuarios' },
    { icon: Building2, label: 'Clubes', path: '/admin/clubes' },
    { icon: FileText, label: 'Contenido', path: '/admin/contenido' },
    { icon: FolderKanban, label: 'Proyectos', path: '/admin/proyectos' },
    { icon: Newspaper, label: 'Noticias', path: '/admin/noticias' },
    { icon: HeartHandshake, label: 'Donaciones', path: '/admin/donaciones' },
    { icon: ImageIcon, label: 'Media Library', path: '/admin/media' },
    { icon: Settings, label: 'Configuración', path: '/admin/configuracion' },
];

const AdminLayout: React.FC<{ children: React.ReactNode }> = ({ children }) => {
    const { logout, user } = useAuth();
    const navigate = useNavigate();
    const location = useLocation();

    const handleLogout = () => {
        logout();
        navigate('/');
    };

    return (
        <div className="flex h-screen bg-gray-50 overflow-hidden">
            {/* Sidebar */}
            <aside className="w-64 bg-rotary-blue text-white flex flex-col flex-shrink-0 shadow-xl">
                <div className="p-6 flex items-center gap-3 border-b border-white/10">
                    <div className="w-8 h-8 rounded-full bg-white/20 flex items-center justify-center font-bold text-white">R</div>
                    <div>
                        <h1 className="font-bold text-sm">Rotary Admin</h1>
                        <p className="text-[10px] text-white/60 uppercase tracking-wider">{user?.role}</p>
                    </div>
                </div>

                <nav className="flex-1 overflow-y-auto py-6 px-4 space-y-1">
                    {menuItems.map((item) => (
                        <Link
                            key={item.path}
                            to={item.path}
                            className={`flex items-center gap-3 px-4 py-3 rounded-lg transition-all text-sm group ${location.pathname === item.path
                                    ? 'bg-white/10 text-white font-medium shadow-sm'
                                    : 'text-white/70 hover:bg-white/5 hover:text-white'
                                }`}
                        >
                            <item.icon className={`w-5 h-5 transition-colors ${location.pathname === item.path ? 'text-rotary-gold' : 'text-white/40 group-hover:text-white/70'
                                }`} />
                            {item.label}
                        </Link>
                    ))}
                </nav>

                <div className="p-4 border-t border-white/10 space-y-2">
                    <Link to="/" className="flex items-center gap-3 px-4 py-3 text-sm text-white/70 hover:text-white transition-colors">
                        <ChevronLeft className="w-4 h-4" /> Volver al sitio
                    </Link>
                    <button
                        onClick={handleLogout}
                        className="w-full flex items-center gap-3 px-4 py-3 rounded-lg text-sm text-white/70 hover:bg-red-500/10 hover:text-red-400 transition-all group"
                    >
                        <LogOut className="w-5 h-5 text-white/40 group-hover:text-red-400" />
                        Cerrar Sesión
                    </button>
                </div>
            </aside>

            {/* Main Content */}
            <main className="flex-1 flex flex-col overflow-hidden">
                <header className="h-16 bg-white border-b border-gray-100 flex items-center justify-between px-8 flex-shrink-0">
                    <h2 className="text-gray-500 text-sm font-medium">Panel de Administración</h2>
                    <div className="flex items-center gap-4">
                        <span className="text-sm text-gray-400">{user?.email}</span>
                        <div className="w-8 h-8 rounded-full bg-gray-100 border border-gray-200"></div>
                    </div>
                </header>

                <div className="flex-1 overflow-y-auto p-8">
                    <div className="max-w-6xl mx-auto">
                        {children}
                    </div>
                </div>
            </main>
        </div>
    );
};

export default AdminLayout;
