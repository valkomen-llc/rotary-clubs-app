import React, { useState, useEffect } from 'react';
import {
    Terminal,
    Activity,
    BrainCircuit,
    Zap,
    ShieldCheck,
    Database,
    Users,
    ChevronRight
} from 'lucide-react';
import AdminLayout from '../../components/admin/AdminLayout';

const VIP_AGENTS = [
    {
        name: 'Mateo',
        role: 'Account Manager VIP',
        status: 'online',
        color: 'from-purple-500 to-indigo-600',
        ping: '12ms',
        activity: 'Procesando ROI District 4281'
    },
    {
        name: 'Sofía',
        role: 'Campaign Concierge',
        status: 'processing',
        color: 'from-pink-500 to-rose-600',
        ping: '8ms',
        activity: 'Estructurando Brief (Club Bogotá)'
    },
    {
        name: 'Diego',
        role: 'Customer Success',
        status: 'online',
        color: 'from-sky-400 to-blue-600',
        ping: '15ms',
        activity: 'Waiting for queries...'
    },
    {
        name: 'Valeria',
        role: 'Comms B2B',
        status: 'processing',
        color: 'from-amber-400 to-orange-500',
        ping: '22ms',
        activity: 'Borrador Changelog v2.4'
    }
];

const SIMULATED_LOGS = [
    "[SYSTEM] Autenticación biométrica de Gobernador aprobada.",
    "[SOFÍA] Recibiendo nota de voz de 45seg (Distrito 4271)...",
    "[WHISPER] Transcripción completada: 'Por favor lanzar campaña de polio para mañana'.",
    "[SOFÍA] Brief generado y derivado a Trafficker Digital.",
    "[MATEO] Analizando tráfico cruzado entre 14 clubes suscritos.",
    "[MATEO] +120 leads nuevos detectados en la red global Rotary.",
    "[DIEGO] Ticket #4029 recibido: Error acceso a tienda.",
    "[DIEGO] Instrucciones enviadas por WhatsApp (Tasa de respuesta 2s).",
    "[VALERIA] Enviando newsletter a 240 Presidentes de Club.",
    "[SYSTEM] Sincronización con PostgreSQL (Neon) = OK."
];

const MissionControlVIP: React.FC = () => {
    const [logs, setLogs] = useState<string[]>([]);
    const [stats, setStats] = useState({ requests: 1420, uptime: '99.98%', latency: '14ms' });

    // Simulate real-time terminal output
    useEffect(() => {
        let index = 0;
        const interval = setInterval(() => {
            setLogs(prev => {
                const newLogs = [...prev, SIMULATED_LOGS[index]];
                // Keep only last 8 logs to prevent overflow
                if (newLogs.length > 8) newLogs.shift();
                return newLogs;
            });
            index = (index + 1) % SIMULATED_LOGS.length;
            
            // Randomly update requests
            setStats(s => ({ ...s, requests: s.requests + Math.floor(Math.random() * 3) }));
        }, 2500);

        return () => clearInterval(interval);
    }, []);

    return (
        <AdminLayout>
            <div className="bg-[#0A0A0A] min-h-[calc(100vh-8rem)] rounded-3xl overflow-hidden font-mono text-gray-300 relative border border-gray-800 shadow-2xl p-8">
                
                {/* Background Ambient Glow */}
                <div className="absolute top-[-20%] left-[-10%] w-[50%] h-[50%] bg-purple-900/20 blur-[120px] rounded-full pointer-events-none" />
                <div className="absolute bottom-[-20%] right-[-10%] w-[40%] h-[40%] bg-blue-900/20 blur-[100px] rounded-full pointer-events-none" />

                {/* Header */}
                <div className="relative z-10 flex flex-col md:flex-row justify-between items-start md:items-center border-b border-gray-800 pb-6 mb-8">
                    <div>
                        <div className="flex items-center gap-3">
                            <BrainCircuit className="w-8 h-8 text-indigo-400 animate-pulse" />
                            <h1 className="text-3xl font-black text-white tracking-widest uppercase">
                                Välkommen AI Gateway
                            </h1>
                        </div>
                        <p className="text-sm text-gray-500 mt-2 tracking-wide">
                            B2B Sub-system Monitor • Escuadrón Premium VIP
                        </p>
                    </div>
                    
                    <div className="flex gap-6 mt-6 md:mt-0">
                        <div className="text-right">
                            <p className="text-[10px] text-gray-500 uppercase tracking-widest">Network Uptime</p>
                            <p className="text-xl text-emerald-400 font-bold flex items-center justify-end gap-2">
                                <span className="w-2 h-2 rounded-full bg-emerald-400 animate-ping" />
                                {stats.uptime}
                            </p>
                        </div>
                        <div className="text-right">
                            <p className="text-[10px] text-gray-500 uppercase tracking-widest">Global Ops</p>
                            <p className="text-xl text-sky-400 font-bold">{stats.requests.toLocaleString()}</p>
                        </div>
                    </div>
                </div>

                <div className="grid grid-cols-1 lg:grid-cols-3 gap-8 relative z-10">
                    
                    {/* Left Column: Agents Grid */}
                    <div className="lg:col-span-2 space-y-6">
                        <h2 className="text-xs uppercase tracking-[0.3em] text-gray-500 flex items-center gap-2">
                            <Users className="w-4 h-4" /> Nodos de Procesamiento Activos
                        </h2>
                        
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                            {VIP_AGENTS.map((agent) => (
                                <div key={agent.name} className="bg-[#111111] border border-gray-800 rounded-2xl p-5 hover:border-gray-600 transition-all group">
                                    <div className="flex justify-between items-start mb-4">
                                        <div className="flex items-center gap-3">
                                            <div className={`w-10 h-10 rounded-xl bg-gradient-to-br ${agent.color} flex items-center justify-center text-white font-black shadow-lg shadow-black/50`}>
                                                {agent.name.charAt(0)}
                                            </div>
                                            <div>
                                                <h3 className="text-white font-bold">{agent.name}</h3>
                                                <p className="text-[10px] text-gray-500 uppercase mt-0.5">{agent.role}</p>
                                            </div>
                                        </div>
                                        <div className="text-[10px] bg-[#1A1A1A] border border-gray-800 px-2 py-1 rounded text-gray-400 flex items-center gap-1">
                                            <Zap className="w-3 h-3 text-amber-400" /> {agent.ping}
                                        </div>
                                    </div>
                                    
                                    <div className="bg-black/50 rounded-lg p-3 border border-gray-800/50">
                                        <div className="flex items-center gap-2 mb-1">
                                            <span className={`w-2 h-2 rounded-full ${agent.status === 'processing' ? 'bg-amber-400 animate-pulse' : 'bg-emerald-400'}`} />
                                            <span className="text-[10px] uppercase tracking-widest text-gray-500">
                                                {agent.status === 'processing' ? 'Processing Task...' : 'Idle / Ready'}
                                            </span>
                                        </div>
                                        <p className="text-xs text-gray-300 truncate">❯ {agent.activity}</p>
                                    </div>
                                </div>
                            ))}
                        </div>

                        {/* Hardware Stats */}
                        <div className="grid grid-cols-3 gap-4 pt-4">
                            <div className="bg-[#111111] border border-gray-800 rounded-xl p-4">
                                <Activity className="w-5 h-5 text-indigo-400 mb-2" />
                                <p className="text-[10px] text-gray-500 uppercase">Load Avg</p>
                                <p className="text-lg text-white font-bold">14%</p>
                            </div>
                            <div className="bg-[#111111] border border-gray-800 rounded-xl p-4">
                                <Database className="w-5 h-5 text-emerald-400 mb-2" />
                                <p className="text-[10px] text-gray-500 uppercase">Neon DB Latency</p>
                                <p className="text-lg text-white font-bold">42ms</p>
                            </div>
                            <div className="bg-[#111111] border border-gray-800 rounded-xl p-4">
                                <ShieldCheck className="w-5 h-5 text-sky-400 mb-2" />
                                <p className="text-[10px] text-gray-500 uppercase">WhatsApp Auth</p>
                                <p className="text-lg text-white font-bold">Secured</p>
                            </div>
                        </div>
                    </div>

                    {/* Right Column: Active Terminal */}
                    <div className="bg-[#050505] border border-gray-800 rounded-2xl flex flex-col h-[500px] overflow-hidden shadow-2xl relative">
                        {/* Terminal Header */}
                        <div className="bg-[#111111] border-b border-gray-800 p-3 flex items-center justify-between">
                            <div className="flex items-center gap-2">
                                <Terminal className="w-4 h-4 text-gray-400" />
                                <span className="text-xs font-bold text-gray-400 uppercase tracking-widest">Live Activity Node</span>
                            </div>
                            <div className="flex gap-1.5">
                                <div className="w-2.5 h-2.5 rounded-full bg-red-500/50" />
                                <div className="w-2.5 h-2.5 rounded-full bg-amber-500/50" />
                                <div className="w-2.5 h-2.5 rounded-full bg-emerald-500/50" />
                            </div>
                        </div>
                        
                        {/* Terminal Window */}
                        <div className="flex-1 p-5 overflow-y-auto space-y-3">
                            <div className="mb-4">
                                <p className="text-[10px] text-emerald-500">Välkommen B2B Engine v1.0.0 init...</p>
                                <p className="text-[10px] text-emerald-500">Connecting to graph.facebook.com... [OK]</p>
                                <p className="text-[10px] text-emerald-500">Loading Agent Cognitive Models... [OK]</p>
                            </div>
                            
                            {logs.map((log, i) => (
                                <div key={i} className="animate-fade-in-up">
                                    <div className="flex items-start gap-2">
                                        <ChevronRight className="w-4 h-4 text-indigo-500 flex-shrink-0 mt-0.5" />
                                        <p className="text-xs text-gray-300 leading-relaxed">
                                            <span className="text-gray-600 mr-2">[{new Date().toLocaleTimeString()}]</span>
                                            {log}
                                        </p>
                                    </div>
                                </div>
                            ))}
                            <div className="flex items-center gap-2 text-emerald-500 mt-4">
                                <ChevronRight className="w-4 h-4" />
                                <span className="w-2 h-4 bg-emerald-500 animate-pulse" />
                            </div>
                        </div>
                    </div>
                </div>
            </div>
        </AdminLayout>
    );
};

export default MissionControlVIP;
