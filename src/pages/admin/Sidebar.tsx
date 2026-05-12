import React from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { 
    LayoutDashboard, 
    FileText, 
    Calendar, 
    Image as ImageIcon, 
    Settings, 
    Users, 
    LogOut,
    MessageSquare,
    Globe,
    Heart,
    Layers
} from 'lucide-react';
import { useClub } from '../../contexts/ClubContext';

const Sidebar = () => {
    const location = useLocation();
    const navigate = useNavigate();
    const { club } = useClub();

    const menuItems = [
        {
            title: 'Overview',
            icon: LayoutDashboard,
            path: '/admin/dashboard',
            show: true
        },
        {
            title: 'Proyectos',
            icon: Heart,
            path: '/admin/proyectos',
            show: true
        },
        {
            title: 'Noticias',
            icon: FileText,
            path: '/admin/noticias',
            show: true
        },
        {
            title: 'Eventos',
            icon: Calendar,
            path: '/admin/eventos',
            show: true
        },
        {
            title: 'Multimedia',
            icon: ImageIcon,
            path: '/admin/multimedia',
            show: true
        },
        {
            title: 'Socios',
            icon: Users,
            path: '/admin/socios',
            show: club?.type === 'club'
        },
        {
            title: 'Clubes',
            icon: Globe,
            path: '/admin/clubes',
            show: club?.type === 'district'
        },
        {
            title: 'Asociaciones',
            icon: Layers,
            path: '/admin/asociaciones',
            show: club?.type === 'association' || club?.type === 'colrotarios' || club?.type === 'Programa de Intercambio'
        },
        {
            title: 'Mensajes',
            icon: MessageSquare,
            path: '/admin/mensajes',
            show: true
        },
        {
            title: 'Configuración',
            icon: Settings,
            path: '/admin/configuracion',
            show: true
        }
    ];

    const handleLogout = () => {
        localStorage.removeItem('rotary_token');
        localStorage.removeItem('rotary_user');
        navigate('/admin/login');
    };

    return (
        <div className="w-64 bg-white border-r border-gray-200 flex flex-col h-screen sticky top-0">
            <div className="p-6 border-b border-gray-100 flex items-center gap-3">
                <img 
                    src="https://app.clubplatform.org/rotary-logo.png" 
                    alt="Rotary" 
                    className="h-8 w-auto"
                />
                <div className="flex flex-col">
                    <span className="font-bold text-rotary-blue leading-tight">Rotary</span>
                    <span className="text-[10px] text-gray-400 font-medium uppercase tracking-widest">Control Panel</span>
                </div>
            </div>

            <nav className="flex-1 overflow-y-auto p-4 space-y-1">
                {menuItems.filter(item => item.show).map((item) => {
                    const isActive = location.pathname === item.path;
                    return (
                        <Link
                            key={item.path}
                            to={item.path}
                            className={`flex items-center gap-3 px-4 py-3 rounded-xl transition-all duration-200 ${
                                isActive 
                                ? 'bg-rotary-blue/5 text-rotary-blue font-bold shadow-sm shadow-blue-500/5' 
                                : 'text-gray-500 hover:bg-gray-50 hover:text-gray-900'
                            }`}
                        >
                            <item.icon className={`w-5 h-5 ${isActive ? 'text-rotary-blue' : 'text-gray-400'}`} />
                            <span className="text-sm">{item.title}</span>
                        </Link>
                    );
                })}
            </nav>

            <div className="p-4 border-t border-gray-100">
                <button
                    onClick={handleLogout}
                    className="w-full flex items-center gap-3 px-4 py-3 text-gray-500 hover:text-red-600 hover:bg-red-50 rounded-xl transition-all duration-200"
                >
                    <LogOut className="w-5 h-5" />
                    <span className="text-sm font-medium">Cerrar Sesión</span>
                </button>
                
                <div className="mt-4 pt-4 border-t border-gray-50 px-4">
                    <div className="flex items-center gap-3">
                        <div className="w-8 h-8 rounded-full bg-rotary-blue flex items-center justify-center text-white text-[10px] font-bold">
                            {club?.name?.charAt(0) || 'R'}
                        </div>
                        <div className="flex flex-col min-w-0">
                            <span className="text-xs font-bold text-gray-900 truncate">{club?.name || 'Club Name'}</span>
                            <span className="text-[10px] text-gray-400 truncate uppercase tracking-tighter">
                                {club?.type === 'club' ? 'Club Rotario' : club?.type === 'district' ? 'Distrito' : (club?.type === 'Programa de Intercambio' || club?.name?.toLowerCase().includes('rye')) ? 'Programa de Intercambio' : 'Asociación'}
                            </span>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
};

export default Sidebar;
