import React, { useState } from 'react';
import { Link, useNavigate, useLocation } from 'react-router-dom';
import {
    LayoutDashboard,
    Users,
    Building2,
    FolderKanban,
    Newspaper,
    HeartHandshake,
    Image as ImageIcon,
    Settings,
    LogOut,
    ChevronDown,
    Search,
    Bell,
    HelpCircle,
    Calendar,
    BookOpen,
    PieChart,
    Layers,
    UserPlus,
    Store,
    Receipt,
    Wallet,
    ExternalLink
} from 'lucide-react';
import { useAuth } from '../../hooks/useAuth';
import { useClub } from '../../contexts/ClubContext';
import OnboardingWizard from './OnboardingWizard';

const AdminLayout: React.FC<{ children: React.ReactNode }> = ({ children }) => {
    const { logout, user } = useAuth();
    const { club } = useClub();
    const navigate = useNavigate();
    const location = useLocation();
    const [searchQuery, setSearchQuery] = useState('');
    // Local control for wizard visibility — dismissable without context refresh
    const [showWizard, setShowWizard] = useState<boolean>(
        () => club?.onboardingCompleted === false
    );

    // Define menu items based on role
    const getMenuItems = () => {
        const items = [
            { icon: LayoutDashboard, label: 'Overview', path: '/admin/dashboard', category: 'General' },
            { icon: PieChart, label: 'Analytics', path: '/admin/analytics', category: 'General' },
        ];

        if (user?.role === 'administrator') {
            items.push(
                { icon: Building2, label: 'Clubes', path: '/admin/clubes', category: 'Management' },
                { icon: Users, label: 'Super Users', path: '/admin/usuarios', category: 'Management' },
                { icon: HeartHandshake, label: 'Donaciones Globales', path: '/admin/donaciones', category: 'Management' },
                { icon: Bell, label: 'CRM y Envíos Centrales', path: '/admin/crm', category: 'Management' }
            );
        } else {
            items.push(
                { icon: Building2, label: 'Mi Club', path: '/admin/mi-club', category: 'Club' },
                { icon: Users, label: 'Socios', path: '/admin/usuarios', category: 'Club' },
                { icon: UserPlus, label: 'Beneficiarios', path: '/admin/usuarios?type=beneficiary', category: 'Club' }
            );
        }

        items.push(
            { icon: Newspaper, label: 'Noticias', path: '/admin/noticias', category: 'Content' },
            { icon: FolderKanban, label: 'Proyectos', path: '/admin/proyectos', category: 'Content' },
            { icon: Calendar, label: 'Eventos', path: '/admin/calendario', category: 'Content' },
            { icon: ImageIcon, label: 'Multimedia', path: '/admin/media', category: 'Content' },
            { icon: BookOpen, label: 'Base IA', path: '/admin/conocimiento', category: 'Content' }
        );

        items.push(
            { icon: Store, label: 'Tienda', path: '/admin/tienda', category: 'E-commerce' },
            { icon: Receipt, label: 'Órdenes y Pagos', path: '/admin/ordenes', category: 'E-commerce' },
            { icon: Wallet, label: 'Bóveda de Fondos', path: '/admin/boveda', category: 'E-commerce' }
        );

        items.push(
            { icon: Layers, label: 'Integraciones', path: '/admin/integraciones', category: 'System' },
            { icon: Bell, label: 'Notificaciones', path: '/admin/notificaciones', category: 'System' },
            { icon: Settings, label: 'Settings', path: '/admin/configuracion', category: 'System' }
        );

        return items;
    };

    const handleLogout = () => {
        logout();
        navigate('/');
    };

    const menuItems = getMenuItems();
    const categories = Array.from(new Set(menuItems.map(item => item.category)));

    return (
        <div className="flex h-screen bg-gray-50 overflow-hidden font-sans">
            {/* Onboarding Wizard — shown only to new club admins */}
            {user?.role !== 'administrator' && club && showWizard && (
                <OnboardingWizard onDismiss={() => setShowWizard(false)} />
            )}
            {/* Sidebar */}
            <aside className="w-72 bg-white border-r border-gray-200 flex flex-col flex-shrink-0 z-20">
                {/* Brand Header */}
                <div className="p-6 pb-4">
                    <div className="flex items-center justify-between mb-6">
                        <div className="flex items-center gap-3">
                            {club?.logo ? (
                                <div className="flex flex-col">
                                    <img src={club.logo} alt={club.name} className="h-10 w-auto max-w-[200px] object-contain" />
                                    <p className="text-[10px] text-gray-400 font-bold uppercase tracking-wider mt-1">Control Panel</p>
                                </div>
                            ) : (
                                <>
                                    <div className="w-10 h-10 rounded-xl bg-rotary-blue flex items-center justify-center shadow-lg shadow-rotary-blue/20">
                                        <div className="w-5 h-5 border-2 border-white rounded-md flex items-center justify-center font-black text-white text-[8px]">R</div>
                                    </div>
                                    <div>
                                        <h1 className="font-bold text-gray-900 tracking-tight truncate max-w-[140px] leading-tight">
                                            {club?.name || 'Rotary Central'}
                                        </h1>
                                        <p className="text-[10px] text-gray-400 font-bold uppercase tracking-wider">Control Panel</p>
                                    </div>
                                </>
                            )}
                        </div>
                        <Link to="/" className="text-gray-400 hover:text-rotary-blue transition-colors">
                            <ExternalLink className="w-4 h-4" />
                        </Link>
                    </div>

                    {/* Sidebar Search */}
                    <div className="relative group">
                        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400 group-focus-within:text-rotary-blue transition-colors" />
                        <input
                            type="text"
                            placeholder="Search..."
                            value={searchQuery}
                            onChange={(e) => setSearchQuery(e.target.value)}
                            className="w-full bg-gray-50 border border-gray-200 rounded-xl py-2 pl-10 pr-4 text-sm focus:bg-white focus:outline-none focus:ring-2 focus:ring-rotary-blue/10 focus:border-rotary-blue transition-all"
                        />
                    </div>
                </div>

                {/* Navigation Scroll Area */}
                <nav className="flex-1 overflow-y-auto px-4 py-4 space-y-6 scrollbar-hide">
                    {categories.map((cat) => (
                        <div key={cat} className="space-y-1">
                            <p className="px-4 text-[10px] font-black text-gray-400 uppercase tracking-[0.2em] mb-2">{cat}</p>
                            {menuItems
                                .filter(item => item.category === cat)
                                .map((item: any) => (
                                    <Link
                                        key={item.path}
                                        to={item.path}
                                        className={`flex items-center gap-3 px-4 py-2.5 rounded-xl transition-all text-sm group ${location.pathname === item.path
                                            ? 'bg-gray-50 text-gray-900 font-bold'
                                            : 'text-gray-500 hover:bg-gray-50/50 hover:text-gray-900'
                                            }`}
                                    >
                                        <item.icon className={`w-5 h-5 transition-colors ${location.pathname === item.path ? 'text-rotary-blue' : 'text-gray-400 group-hover:text-gray-600'
                                            }`} />
                                        <span className="flex-1">{item.label}</span>
                                        {item.expandable && <ChevronDown className="w-3.5 h-3.5 text-gray-300" />}
                                    </Link>
                                ))}
                        </div>
                    ))}
                </nav>

                {/* Sidebar Footer / User Profile */}
                <div className="p-4 border-t border-gray-100 bg-white sticky bottom-0">
                    <div className="flex flex-col gap-1 mb-4">
                        <Link to="/admin/configuracion" className="flex items-center gap-3 px-4 py-2.5 text-sm text-gray-500 hover:text-gray-900 rounded-xl hover:bg-gray-50 transition-all group">
                            <Settings className="w-5 h-5 text-gray-400 group-hover:text-gray-600" />
                            Settings
                        </Link>
                        <button onClick={handleLogout} className="flex items-center gap-3 px-4 py-2.5 text-sm text-gray-500 hover:text-red-600 rounded-xl hover:bg-red-50 transition-all group">
                            <LogOut className="w-5 h-5 text-gray-400 group-hover:text-red-500" />
                            Logout
                        </button>
                    </div>

                    <div className="p-4 rounded-2xl bg-gray-50 border border-gray-100 flex items-center gap-3">
                        <div className="w-10 h-10 rounded-full bg-rotary-blue flex items-center justify-center text-white font-black text-xs shadow-md border-2 border-white">
                            {user?.email?.charAt(0).toUpperCase()}
                        </div>
                        <div className="flex-1 min-w-0">
                            <p className="text-xs font-black text-gray-900 truncate">Admin User</p>
                            <p className="text-[10px] text-gray-400 truncate font-medium">{user?.email}</p>
                        </div>
                        <HelpCircle className="w-4 h-4 text-gray-300 cursor-pointer hover:text-gray-400" />
                    </div>
                </div>
            </aside>

            {/* Main Content Area */}
            <main className="flex-1 flex flex-col min-w-0 bg-white overflow-hidden relative">
                {/* Global Topbar */}
                <header className="h-16 flex items-center justify-between px-10 border-b border-gray-100 flex-shrink-0 z-10">
                    <div className="flex items-center gap-4">
                        <h2 className="text-sm font-bold text-gray-900">Dashboard</h2>
                        <div className="h-4 w-[1px] bg-gray-200" />
                        <p className="text-xs text-gray-400 font-medium">{user?.role === 'administrator' ? 'Sistema Central' : 'Gestión de Club'}</p>
                    </div>

                    <div className="flex items-center gap-4">
                        <button className="p-2 text-gray-400 hover:text-gray-600 hover:bg-gray-50 rounded-lg transition-all relative">
                            <Bell className="w-5 h-5" />
                            <span className="absolute top-2 right-2 w-2 h-2 bg-red-500 rounded-full border-2 border-white" />
                        </button>
                        <div className="h-8 w-[1px] bg-gray-100 mx-2" />
                        <div className="flex items-center gap-3 pl-2">
                            <div className="text-right hidden sm:block">
                                <p className="text-[10px] font-black text-gray-900 leading-none">Status</p>
                                <p className="text-[9px] text-emerald-500 font-bold uppercase tracking-widest mt-1">Live Online</p>
                            </div>
                        </div>
                    </div>
                </header>

                <div className="flex-1 overflow-y-auto px-10 py-10 scrollbar-hide">
                    <div className="max-w-7xl mx-auto">
                        {children}
                    </div>
                </div>
            </main>
        </div>
    );
};

export default AdminLayout;
