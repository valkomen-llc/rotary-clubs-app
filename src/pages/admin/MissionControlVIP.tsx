import React, { useState, useEffect } from 'react';
import {
    BrainCircuit,
    Zap,
    Database,
    Target,
    History,
    CheckCircle2,
    Clock,
    X
} from 'lucide-react';

interface Agent {
    id: string;
    name: string;
    role: string;
    color: string;
    status: 'online' | 'processing' | 'idle';
    lastTask: string;
}

interface Goal {
    id: string;
    title: string;
    progress: number;
    status: 'active' | 'paused' | 'completed';
    assignedAgents: string[];
}

interface Task {
    id: string;
    agentName: string;
    agentColor: string;
    content: string;
    time: string;
    type: 'peer_review' | 'heartbeat' | 'execution' | 'research';
    status: 'backlog' | 'in_progress' | 'done';
}

const VIP_AGENTS: Agent[] = [
    { id: 'mateo', name: 'Mateo', role: 'Account Manager', color: 'bg-purple-500', status: 'online', lastTask: 'Analizando ROI Distrito' },
    { id: 'sofia', name: 'Sofía', role: 'Concierge', color: 'bg-pink-500', status: 'processing', lastTask: 'Estructurando Brief' },
    { id: 'diego', name: 'Diego', role: 'Success', color: 'bg-sky-500', status: 'idle', lastTask: 'Waiting...' },
    { id: 'valeria', name: 'Valeria', role: 'Comms', color: 'bg-amber-500', status: 'processing', lastTask: 'Drafting Changelog' },
    { id: 'rafael', name: 'Rafael', role: 'Grant Scout', color: 'bg-emerald-500', status: 'online', lastTask: 'Scanning SECOP' },
];

const INITIAL_GOALS: Goal[] = [
    { id: 'g1', title: 'Grow Rotary Brand on Meta', progress: 85, status: 'active', assignedAgents: ['sofia', 'valeria'] },
    { id: 'g2', title: 'Identify Healthcare Subsidies', progress: 40, status: 'active', assignedAgents: ['rafael', 'mateo'] },
    { id: 'g3', title: 'Optimize Member Retention', progress: 10, status: 'paused', assignedAgents: ['diego'] },
];

const INITIAL_TASKS: Task[] = [
    { id: 't1', agentName: 'Rafael', agentColor: 'bg-emerald-500', content: 'Escaneando SECOP II: Detectada subvención USAID para salud rural.', time: '2m ago', type: 'research', status: 'in_progress' },
    { id: 't2', agentName: 'Sofía', agentColor: 'bg-pink-500', content: 'Brief generado para Campaña Polio Plus 2026.', time: '8m ago', type: 'execution', status: 'done' },
    { id: 't3', agentName: 'Valeria', agentColor: 'bg-amber-500', content: 'Revisión técnica de post para Instagram: Aprobado por Rafael.', time: '12m ago', type: 'peer_review', status: 'done' },
    { id: 't4', agentName: 'Mateo', agentColor: 'bg-purple-500', content: 'Calculando impacto proyectado de subvención educativa global.', time: '15m ago', type: 'research', status: 'backlog' },
];

const HQDashboard: React.FC = () => {
    const [tasks, setTasks] = useState<Task[]>(INITIAL_TASKS);
    const [goals] = useState<Goal[]>(INITIAL_GOALS);

    // Simulate logs like the Reddit screenshot
    useEffect(() => {
        const interval = setInterval(() => {
            const agent = VIP_AGENTS[Math.floor(Math.random() * VIP_AGENTS.length)];
            const newLog: Task = {
                id: Math.random().toString(),
                agentName: agent.name,
                agentColor: agent.color,
                content: `Heartbeat check: Monitoring systems for ${agent.role}...`,
                time: 'Just now',
                type: 'heartbeat',
                status: 'done'
            };
            setTasks(prev => [newLog, ...prev.slice(0, 15)]);
        }, 5000);
        return () => clearInterval(interval);
    }, []);

    return (
        <div className="fixed inset-0 bg-[#050505] text-gray-400 font-sans z-[9999] overflow-hidden flex flex-col">
            
            {/* TOP BAR: Agent Selectors & Global Stats */}
            <header className="h-16 bg-[#0A0A0A] border-b border-gray-800/50 flex items-center justify-between px-6 shrink-0 relative">
                <div className="flex items-center gap-4">
                    <div className="flex items-center gap-2">
                        <div className="w-8 h-8 bg-indigo-600 rounded-lg flex items-center justify-center">
                            <BrainCircuit className="w-5 h-5 text-white" />
                        </div>
                        <div>
                            <h1 className="text-white font-black text-sm uppercase tracking-tighter leading-none">Valkomen HQ</h1>
                            <span className="text-[10px] text-gray-500 font-mono tracking-widest">AGENT COMMAND</span>
                        </div>
                    </div>
                </div>

                <div className="flex items-center gap-2">
                    {VIP_AGENTS.map(agent => (
                        <div key={agent.id} className="group relative flex items-center gap-2 bg-gray-900/50 border border-gray-800 px-3 py-1.5 rounded-full hover:border-gray-600 transition-all cursor-pointer">
                            <div className={`w-2 h-2 rounded-full ${agent.status === 'processing' ? 'bg-amber-400 animate-pulse' : 'bg-emerald-400'}`} />
                            <span className="text-xs font-bold text-gray-300">{agent.name}</span>
                            <div className={`w-6 h-6 rounded-lg ${agent.color} flex items-center justify-center text-white text-[10px] font-black`}>
                                {agent.name.charAt(0)}
                            </div>
                        </div>
                    ))}
                </div>

                <div className="flex items-center gap-6">
                    <div className="flex items-center gap-2 text-indigo-400">
                        <Target className="w-4 h-4" />
                        <span className="text-xs font-bold uppercase tracking-wider">{goals.filter(g => g.status === 'active').length} Active Goals</span>
                    </div>
                    <button 
                        onClick={() => window.close()}
                        className="bg-red-500/10 hover:bg-red-500/20 text-red-500 p-2 rounded-lg transition-all"
                    >
                        <X className="w-4 h-4" />
                    </button>
                </div>
            </header>

            {/* MAIN WORKSPACE GRID */}
            <main className="flex-1 flex overflow-hidden p-6 gap-6">
                
                {/* COLUMN 1: GOALS & OBJECTIVES */}
                <section className="w-[300px] flex flex-col gap-6 overflow-y-auto">
                    <div className="flex items-center justify-between">
                        <h2 className="text-[10px] uppercase font-bold tracking-[0.2em] text-gray-500 flex items-center gap-2">
                            <Target className="w-3 h-3" /> Metas Globales
                        </h2>
                        <button className="w-6 h-6 bg-gray-900 border border-gray-800 rounded flex items-center justify-center hover:bg-gray-800">
                            <span className="text-lg">+</span>
                        </button>
                    </div>

                    <div className="space-y-4">
                        {goals.map(goal => (
                            <div key={goal.id} className="bg-[#0A0A0A] border border-gray-800/80 rounded-2xl p-4 hover:border-gray-600 transition-all cursor-pointer group">
                                <div className="flex items-center justify-between mb-3">
                                    <h3 className="text-sm font-bold text-gray-200 group-hover:text-white transition-colors">{goal.title}</h3>
                                    <div className={`px-2 py-0.5 rounded text-[10px] font-bold uppercase tracking-widest ${goal.status === 'active' ? 'bg-emerald-500/10 text-emerald-400' : 'bg-amber-500/10 text-amber-400'}`}>
                                        {goal.status}
                                    </div>
                                </div>
                                <div className="space-y-2">
                                    <div className="flex justify-between items-center text-[10px] font-mono">
                                        <span className="text-gray-500">PROGRESS</span>
                                        <span className="text-indigo-400">{goal.progress}%</span>
                                    </div>
                                    <div className="h-1.5 w-full bg-gray-900 rounded-full overflow-hidden">
                                        <div 
                                            className="h-full bg-gradient-to-r from-indigo-500 to-purple-600 transition-all duration-1000" 
                                            style={{ width: `${goal.progress}%` }} 
                                        />
                                    </div>
                                </div>
                                <div className="flex items-center gap-1.5 mt-4">
                                    {goal.assignedAgents.map(aid => {
                                        const ag = VIP_AGENTS.find(a => a.id === aid);
                                        return (
                                            <div key={aid} className={`w-6 h-6 rounded-md ${ag?.color} flex items-center justify-center text-white text-[10px] font-black border border-black/50 shadow-lg`}>
                                                {ag?.name.charAt(0)}
                                            </div>
                                        );
                                    })}
                                </div>
                            </div>
                        ))}
                    </div>

                    <div className="mt-auto bg-indigo-600/5 border border-indigo-500/20 rounded-2xl p-4">
                        <h4 className="text-[10px] uppercase font-bold text-indigo-400 mb-2">Operation Status</h4>
                        <p className="text-xs text-indigo-200/60 leading-relaxed mb-4">Systems nominal. 5 Agents monitoring District feeds.</p>
                        <div className="flex gap-4">
                            <div className="flex-1">
                                <p className="text-[10px] text-gray-500 uppercase">Latency</p>
                                <p className="text-sm text-white font-bold">12ms</p>
                            </div>
                            <div className="flex-1 text-right">
                                <p className="text-[10px] text-gray-500 uppercase">Uptime</p>
                                <p className="text-sm text-emerald-400 font-bold">99.9%</p>
                            </div>
                        </div>
                    </div>
                </section>

                {/* COLUMN 2: LIVE ACTIVITY FEED (Detailed Analysis) */}
                <section className="w-[400px] flex flex-col bg-[#0A0A0A] rounded-3xl border border-gray-800/80 overflow-hidden shadow-2xl">
                    <div className="p-5 border-b border-gray-800/50 flex items-center justify-between bg-gradient-to-r from-gray-900/50 to-transparent">
                        <h2 className="text-xs uppercase font-bold tracking-[0.2em] text-gray-300 flex items-center gap-2">
                            <History className="w-4 h-4 text-indigo-400" /> Activity Stream
                        </h2>
                        <span className="text-[10px] font-mono text-gray-600">60 ACTIVE EVENTS</span>
                    </div>
                    
                    <div className="flex-1 overflow-y-auto p-4 space-y-4 font-mono">
                        {tasks.map(task => (
                            <div key={task.id} className="group border-b border-gray-800/30 pb-4 last:border-0 hover:bg-white/[0.02] p-2 rounded-xl transition-all">
                                <div className="flex items-start gap-4">
                                    <div className={`w-8 h-8 rounded-lg ${task.agentColor} flex items-center justify-center text-white text-[10px] font-black shrink-0 shadow-lg`}>
                                        {task.agentName.charAt(0)}
                                    </div>
                                    <div className="min-w-0">
                                        <div className="flex items-center gap-2 mb-1">
                                            <span className="text-xs font-bold text-gray-200">{task.agentName}</span>
                                            <span className="text-[10px] text-gray-500 underline decoration-gray-700 cursor-pointer">{task.type.replace('_', ' ')}</span>
                                            <span className="text-[9px] text-gray-700">{task.time}</span>
                                        </div>
                                        <p className="text-[10px] text-gray-400 leading-relaxed">
                                            {task.content}
                                        </p>
                                        {task.type === 'peer_review' && (
                                            <div className="mt-2 flex items-center gap-2 bg-emerald-500/5 border border-emerald-500/20 p-2 rounded-lg">
                                                <CheckCircle2 className="w-3 h-3 text-emerald-500" />
                                                <span className="text-[10px] text-emerald-300">Analysis validated by System Brain</span>
                                            </div>
                                        )}
                                    </div>
                                </div>
                            </div>
                        ))}
                    </div>
                </section>

                {/* COLUMN 3: KANBAN BOARD (Task Backlog) */}
                <section className="flex-1 flex gap-6 overflow-x-auto pb-4">
                    
                    {/* BACKLOG COLUMN */}
                    <div className="w-[350px] shrink-0 flex flex-col gap-4">
                        <div className="flex items-center justify-between px-2">
                            <span className="text-[10px] uppercase font-bold tracking-widest text-gray-500 flex items-center gap-2">
                                <div className="w-2 h-2 rounded-full bg-gray-600" /> Backlog
                            </span>
                            <span className="text-[10px] font-mono text-gray-700">14</span>
                        </div>
                        
                        <div className="flex-1 space-y-4">
                            <div className="bg-[#0A0A0A] border border-gray-800/80 rounded-2xl p-4 cursor-grab active:cursor-grabbing hover:border-gray-600 transition-all">
                                <h4 className="text-xs font-bold text-gray-300 mb-2">Audit Live Reddit Engagement</h4>
                                <p className="text-[10px] text-gray-500 mb-4 tracking-tight">Monitor and optimize interactions in community spaces.</p>
                                <div className="flex items-center justify-between">
                                    <div className="flex items-center gap-2">
                                        <Zap className="w-3 h-3 text-indigo-500" />
                                        <span className="text-[10px] text-gray-600 uppercase font-bold">Priority High</span>
                                    </div>
                                    <Clock className="w-3 h-3 text-gray-700" />
                                </div>
                            </div>
                            <div className="bg-[#0A0A0A] border border-gray-800/80 rounded-2xl p-4 border-dashed border-gray-700/50 flex items-center justify-center h-24">
                                <p className="text-[10px] text-gray-600">Drag to start assignment</p>
                            </div>
                        </div>
                    </div>

                    {/* TO DO / PROCESSING COLUMN */}
                    <div className="w-[350px] shrink-0 flex flex-col gap-4">
                        <div className="flex items-center justify-between px-2">
                            <span className="text-[10px] uppercase font-bold tracking-widest text-indigo-400 flex items-center gap-2">
                                <div className="w-2 h-2 rounded-full bg-indigo-500" /> Processing
                            </span>
                            <span className="text-[10px] font-mono text-gray-700">3</span>
                        </div>

                        <div className="space-y-4">
                            {tasks.filter(t => t.status === 'in_progress').map(t => (
                                <div key={t.id} className="bg-[#0A0A0A] border border-indigo-900/30 rounded-2xl p-4 relative overflow-hidden group">
                                    <div className="absolute top-0 left-0 w-1 h-full bg-indigo-600" />
                                    <div className="flex items-center gap-2 mb-3">
                                        <div className={`w-5 h-5 rounded ${t.agentColor} flex items-center justify-center text-white text-[8px] font-black`}>
                                            {t.agentName.charAt(0)}
                                        </div>
                                        <span className="text-[10px] font-bold text-gray-300 uppercase tracking-tighter">{t.agentName}</span>
                                    </div>
                                    <h4 className="text-xs font-bold text-gray-100 mb-2">Analyzing SECOP Data Stream</h4>
                                    <p className="text-[10px] text-gray-400 leading-relaxed mb-4 italic">"Integrating USAID documents with local health strategy..."</p>
                                    <div className="flex items-center justify-between">
                                        <div className="flex -space-x-1">
                                            <div className="w-5 h-5 bg-gray-800 border border-gray-700 rounded-full flex items-center justify-center text-[8px]">R</div>
                                            <div className="w-5 h-5 bg-gray-800 border border-gray-700 rounded-full flex items-center justify-center text-[8px]">M</div>
                                        </div>
                                        <div className="flex items-center gap-1">
                                            <span className="w-1.5 h-1.5 rounded-full bg-indigo-500 animate-pulse" />
                                            <span className="text-[9px] text-indigo-400 font-bold uppercase tracking-widest">Active reasoning</span>
                                        </div>
                                    </div>
                                </div>
                            ))}
                        </div>
                    </div>

                    {/* DONE COLUMN */}
                    <div className="w-[350px] shrink-0 flex flex-col gap-4">
                        <div className="flex items-center justify-between px-2">
                            <span className="text-[10px] uppercase font-bold tracking-widest text-emerald-400 flex items-center gap-2">
                                <div className="w-2 h-2 rounded-full bg-emerald-500" /> Completed
                            </span>
                            <span className="text-[10px] font-mono text-gray-700">128</span>
                        </div>

                        <div className="space-y-4">
                            {tasks.filter(t => t.status === 'done' && t.type !== 'heartbeat').map(t => (
                                <div key={t.id} className="bg-[#0A0A0A]/40 border border-gray-800/40 rounded-2xl p-4 opacity-70 hover:opacity-100 transition-opacity">
                                    <div className="flex items-center justify-between mb-2">
                                        <div className="flex items-center gap-2">
                                            <CheckCircle2 className="w-3 h-3 text-emerald-500" />
                                            <h4 className="text-xs font-bold text-emerald-200/80">{t.agentName} Report</h4>
                                        </div>
                                        <span className="text-[9px] text-gray-600">8h ago</span>
                                    </div>
                                    <p className="text-[10px] text-gray-500">{t.content.substring(0, 50)}...</p>
                                </div>
                            ))}
                        </div>
                    </div>
                </section>
            </main>

            {/* STATUS BAR FOOTER */}
            <footer className="h-10 bg-[#0A0A0A] border-t border-gray-800/50 flex items-center justify-between px-6 shrink-0 font-mono text-[9px] tracking-widest uppercase text-gray-600">
                <div className="flex gap-6">
                    <div className="flex items-center gap-2">
                        <div className="w-2 h-2 rounded-full bg-emerald-500" />
                        <span>Core systems online</span>
                    </div>
                    <div className="flex items-center gap-2">
                        <Database className="w-3 h-3" />
                        <span>DB Sync: 42ms</span>
                    </div>
                </div>
                <div className="flex gap-4">
                    <span>Build v2.4.1</span>
                    <span className="text-indigo-500/50">Valkomen Premium Node</span>
                </div>
            </footer>
        </div>
    );
};

export default HQDashboard;
