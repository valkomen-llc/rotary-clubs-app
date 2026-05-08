import React from 'react';
import { NavLink } from 'react-router-dom';
import { Terminal, Users, ListFilter, Calendar, Activity, Database, Cpu } from 'lucide-react';
import { useAuth } from '../../hooks/useAuth';

const MissionControlLayout: React.FC<{ children: React.ReactNode }> = ({ children }) => {
    const { logout } = useAuth();

    return (
        <div className="flex h-screen bg-gray-50 text-gray-800 font-sans overflow-hidden">
            
            {/* ── Left Sidebar (Light) ── */}
            <div className="w-64 border-r border-gray-200 bg-white flex flex-col relative z-20 shadow-sm">
                {/* Header Logo */}
                <div className="h-16 flex items-center px-6 border-b border-gray-100 flex-shrink-0">
                    <div className="flex items-center gap-2">
                        <Terminal className="w-5 h-5 text-blue-600" />
                        <span className="text-sm font-black tracking-tight text-gray-900">Mission Control</span>
                    </div>
                </div>

                {/* Navigation */}
                <div className="flex-1 overflow-y-auto py-6 px-4 space-y-6">
                    {/* Section 1 */}
                    <div>
                        <p className="px-3 text-[10px] font-bold text-gray-400 uppercase tracking-wider mb-3">Workspaces</p>
                        <nav className="space-y-1">
                            <NavLink to="/admin/dashboard" className="flex items-center gap-3 px-3 py-2 rounded-xl text-sm text-gray-500 hover:bg-gray-50 hover:text-gray-900 transition-colors group">
                                <Activity className="w-4 h-4 text-gray-400 group-hover:text-blue-500" />
                                Return to Overview
                            </NavLink>
                            <NavLink to="/admin/agentes" className={({isActive}) => `flex items-center gap-3 px-3 py-2 rounded-xl text-sm transition-colors ${isActive ? 'bg-blue-50 text-blue-700 font-bold' : 'text-gray-600 hover:bg-gray-50 hover:text-gray-900'}`}>
                                <Users className="w-4 h-4" />
                                Expert Agents
                            </NavLink>
                            <button className="w-full flex items-center gap-3 px-3 py-2 rounded-xl text-sm text-gray-400 hover:bg-gray-50 transition-colors cursor-not-allowed">
                                <ListFilter className="w-4 h-4" /> Task Queue
                            </button>
                            <button className="w-full flex items-center gap-3 px-3 py-2 rounded-xl text-sm text-gray-400 hover:bg-gray-50 transition-colors cursor-not-allowed">
                                <Calendar className="w-4 h-4" /> Schedule
                            </button>
                        </nav>
                    </div>

                    {/* Section 2 */}
                    <div>
                        <p className="px-3 text-[10px] font-bold text-gray-400 uppercase tracking-wider mb-3">System</p>
                        <nav className="space-y-1">
                            <button className="w-full flex items-center gap-3 px-3 py-2 rounded-xl text-sm text-gray-400 hover:bg-gray-50 transition-colors cursor-not-allowed">
                                <Cpu className="w-4 h-4" /> Activity Logs
                            </button>
                            <button className="w-full flex items-center gap-3 px-3 py-2 rounded-xl text-sm text-gray-400 hover:bg-gray-50 transition-colors cursor-not-allowed">
                                <Database className="w-4 h-4" /> Vector Memory
                            </button>
                        </nav>
                    </div>
                </div>

                {/* Footer User */}
                <div className="p-4 border-t border-gray-100 flex-shrink-0 bg-gray-50/50">
                    <button onClick={logout} className="flex items-center gap-3 px-3 py-2 w-full rounded-xl hover:bg-white border border-transparent hover:border-gray-200 hover:shadow-sm transition-all">
                        <div className="w-8 h-8 rounded-full bg-blue-100 flex items-center justify-center text-blue-700 text-xs font-bold">
                            OP
                        </div>
                        <div className="text-left flex-1">
                            <p className="text-xs font-bold text-gray-900">Admin User</p>
                            <div className="flex items-center gap-1.5 mt-0.5">
                                <div className="w-1.5 h-1.5 rounded-full bg-emerald-500" />
                                <span className="text-[10px] text-gray-500 font-medium">Online</span>
                            </div>
                        </div>
                    </button>
                </div>
            </div>

            {/* ── Main Content ── */}
            <div className="flex-1 flex flex-col relative z-10 w-full overflow-hidden bg-gray-50">
                {/* Page Content */}
                <div className="flex-1 overflow-x-hidden overflow-y-auto">
                    {children}
                </div>
            </div>
            
        </div>
    );
};

export default MissionControlLayout;
