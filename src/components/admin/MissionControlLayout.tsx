import React from 'react';
import { NavLink } from 'react-router-dom';
import { Terminal, Users, ListFilter, Calendar, Activity, Database, Cpu, HardDrive, Shield } from 'lucide-react';
import { useAuth } from '../../hooks/useAuth';

const MissionControlLayout: React.FC<{ children: React.ReactNode }> = ({ children }) => {
    const { logout } = useAuth();

    return (
        <div className="flex h-screen bg-[#030712] text-gray-300 font-sans overflow-hidden">
            
            {/* ── Left Sidebar ── */}
            <div className="w-64 border-r border-white/5 bg-[#0A0F1C] flex flex-col relative z-20">
                {/* Header Logo */}
                <div className="h-16 flex items-center px-6 border-b border-white/5 flex-shrink-0">
                    <div className="flex items-center gap-2">
                        <Terminal className="w-5 h-5 text-[#00A2E0]" />
                        <span className="text-sm font-bold tracking-[0.2em] text-white uppercase">Mission Control</span>
                    </div>
                </div>

                {/* Navigation */}
                <div className="flex-1 overflow-y-auto py-6 px-4 space-y-6">
                    {/* Section 1 */}
                    <div>
                        <p className="px-3 text-[9px] font-black text-white/30 tracking-widest uppercase mb-3">Gateway</p>
                        <nav className="space-y-1">
                            <NavLink to="/admin/dashboard" className="flex items-center gap-3 px-3 py-2 rounded-lg text-sm text-white/50 hover:bg-white/5 hover:text-white transition-colors group">
                                <Activity className="w-4 h-4 text-white/40 group-hover:text-white" />
                                Overview (Exit)
                            </NavLink>
                            <NavLink to="/admin/agentes" className={({isActive}) => `flex items-center gap-3 px-3 py-2 rounded-lg text-sm transition-colors ${isActive ? 'bg-[#00A2E0]/10 text-[#00A2E0] font-bold' : 'text-white/50 hover:bg-white/5 hover:text-white'}`}>
                                <Users className="w-4 h-4" />
                                Agents
                            </NavLink>
                            <button className="w-full flex items-center gap-3 px-3 py-2 rounded-lg text-sm text-white/50 hover:bg-white/5 hover:text-white transition-colors opacity-50 cursor-not-allowed">
                                <ListFilter className="w-4 h-4" /> Tasks
                            </button>
                            <button className="w-full flex items-center gap-3 px-3 py-2 rounded-lg text-sm text-white/50 hover:bg-white/5 hover:text-white transition-colors opacity-50 cursor-not-allowed">
                                <Calendar className="w-4 h-4" /> Schedule
                            </button>
                        </nav>
                    </div>

                    {/* Section 2 */}
                    <div>
                        <p className="px-3 text-[9px] font-black text-white/30 tracking-widest uppercase mb-3">Observe</p>
                        <nav className="space-y-1">
                            <button className="w-full flex items-center gap-3 px-3 py-2 rounded-lg text-sm text-white/50 hover:bg-white/5 hover:text-white transition-colors opacity-50 cursor-not-allowed">
                                <Cpu className="w-4 h-4" /> Activity
                            </button>
                            <button className="w-full flex items-center gap-3 px-3 py-2 rounded-lg text-sm text-white/50 hover:bg-white/5 hover:text-white transition-colors opacity-50 cursor-not-allowed">
                                <Database className="w-4 h-4" /> Memory
                            </button>
                        </nav>
                    </div>
                </div>

                {/* Footer User */}
                <div className="p-4 border-t border-white/5 flex-shrink-0">
                    <button onClick={logout} className="flex items-center gap-3 px-3 py-2 w-full rounded-lg hover:bg-white/5 transition-colors">
                        <div className="w-8 h-8 rounded-full bg-gradient-to-tr from-purple-500 to-[#00A2E0] flex items-center justify-center text-white text-xs font-bold">
                            OP
                        </div>
                        <div className="text-left flex-1">
                            <p className="text-xs font-bold text-white">Operator</p>
                            <div className="flex items-center gap-1.5 mt-0.5">
                                <div className="w-1.5 h-1.5 rounded-full bg-emerald-400" />
                                <span className="text-[9px] text-white/40 uppercase tracking-wider">Connected</span>
                            </div>
                        </div>
                    </button>
                </div>
            </div>

            {/* ── Main Content ── */}
            <div className="flex-1 flex flex-col relative z-10 w-full overflow-hidden">
                {/* Topbar */}
                <div className="h-16 border-b border-white/5 flex items-center justify-between px-8 bg-[#030712] flex-shrink-0">
                    <div className="flex items-center gap-6">
                        <div className="flex items-center gap-2 px-3 py-1 bg-emerald-500/10 rounded border border-emerald-500/20 text-emerald-400">
                            <div className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
                            <span className="text-[10px] font-black uppercase tracking-widest">GW Connected</span>
                        </div>
                        <div className="text-[11px] text-white/30 font-mono hidden md:block">
                            Jump to page, task, agent... [⌘K]
                        </div>
                    </div>
                    <div className="flex items-center gap-6 text-[11px] font-mono text-white/40">
                        <div className="flex items-center gap-2">
                            <span>Gateway</span>
                            <span className="text-emerald-400 font-bold">2ms</span>
                        </div>
                        <div className="flex items-center gap-2">
                            <span>Events</span>
                            <span className="text-[#00A2E0] font-bold">● Live</span>
                        </div>
                    </div>
                </div>

                {/* Page Content */}
                <div className="flex-1 overflow-x-hidden overflow-y-auto">
                    {children}
                </div>
            </div>
            
        </div>
    );
};

export default MissionControlLayout;
