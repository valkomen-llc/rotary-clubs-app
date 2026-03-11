import React, { useState, useEffect, useCallback } from 'react';
import { useAuth } from '../../hooks/useAuth';

const API_URL = import.meta.env.VITE_API_URL || '/api';
const avatarUrl = (seed: string) => `https://api.dicebear.com/9.x/adventurer/svg?seed=${seed}&backgroundColor=transparent`;

interface ProgressItem {
    agentName: string;
    area: string;
    pct: number;
    message: string;
    missing: string[];
}

const AGENT_STYLES: Record<string, { seed: string; color: string }> = {
    Diana: { seed: 'Diana', color: '#6366F1' },
    Martín: { seed: 'Martin', color: '#10B981' },
    Camila: { seed: 'Camila', color: '#F59E0B' },
    Rafael: { seed: 'Rafael', color: '#8B5CF6' },
    Valentina: { seed: 'Valentina', color: '#EC4899' },
    Santiago: { seed: 'Santiago', color: '#3B82F6' },
    Lucía: { seed: 'Lucia', color: '#14B8A6' },
    Andrés: { seed: 'Andres', color: '#F97316' },
    Isabel: { seed: 'Isabel', color: '#EF4444' },
};

const ROTATE_INTERVAL = 8000;

const AgentProgressBar: React.FC = () => {
    const { token } = useAuth();
    const [items, setItems] = useState<ProgressItem[]>([]);
    const [overall, setOverall] = useState(0);
    const [current, setCurrent] = useState(0);
    const [fade, setFade] = useState(true);

    const handleAgentClick = (agentName: string) => {
        // Dispatch event for MissionControl to open chat with this agent
        window.dispatchEvent(new CustomEvent('openAgentChat', { detail: { agentName } }));
        // Scroll down to Mission Control
        const mc = document.querySelector('[data-mission-control]');
        if (mc) mc.scrollIntoView({ behavior: 'smooth', block: 'start' });
    };

    const fetchProgress = useCallback(async () => {
        try {
            const res = await fetch(`${API_URL}/site-progress`, {
                headers: {
                    'Content-Type': 'application/json',
                    Authorization: `Bearer ${token || localStorage.getItem('rotary_token')}`,
                },
            });
            if (res.ok) {
                const data = await res.json();
                setItems(data.progress || []);
                setOverall(data.overall || 0);
            }
        } catch (e) {
            console.error('Failed to load site progress:', e);
        }
    }, [token]);

    useEffect(() => { fetchProgress(); }, [fetchProgress]);

    // Auto-rotate agents
    useEffect(() => {
        if (items.length <= 1) return;
        const interval = setInterval(() => {
            setFade(false);
            setTimeout(() => {
                setCurrent(prev => (prev + 1) % items.length);
                setFade(true);
            }, 400);
        }, ROTATE_INTERVAL);
        return () => clearInterval(interval);
    }, [items.length]);

    if (items.length === 0) {
        return (
            <div className="flex items-center gap-3">
                <div className="w-7 h-7 rounded-full bg-gray-100 animate-pulse" />
                <div className="h-4 w-48 bg-gray-100 rounded-full animate-pulse" />
            </div>
        );
    }

    const item = items[current];
    const style = AGENT_STYLES[item.agentName] || { seed: item.agentName, color: '#6366F1' };
    const progressColor = item.pct >= 80 ? '#10B981' : item.pct >= 40 ? '#F59E0B' : '#EF4444';

    return (
        <div className="flex items-center gap-4 min-w-0 flex-1">
            {/* Agent avatar + info (animated) — clickable */}
            <div
                className="flex items-center gap-3 min-w-0 flex-1 cursor-pointer group/bar"
                onClick={() => handleAgentClick(item.agentName)}
                style={{
                    opacity: fade ? 1 : 0,
                    transform: fade ? 'translateY(0)' : 'translateY(8px)',
                    transition: 'opacity 0.4s ease, transform 0.4s ease',
                }}
            >
                {/* Avatar */}
                <div
                    className="w-11 h-11 rounded-full overflow-hidden border-2 flex-shrink-0 shadow-md"
                    style={{ borderColor: style.color, background: style.color + '15' }}
                >
                    <img src={avatarUrl(style.seed)} alt={item.agentName} className="w-full h-full" loading="lazy" />
                </div>

                {/* Message + progress bar */}
                <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2 mb-0.5">
                        <span className="text-sm font-black text-gray-900">{item.agentName}</span>
                        <span className="text-[9px] font-bold uppercase tracking-wider px-1.5 py-0.5 rounded-full"
                            style={{ color: style.color, backgroundColor: style.color + '15' }}>
                            {item.area}
                        </span>
                    </div>
                    <p className="text-[11px] text-gray-500 font-medium leading-snug truncate">{item.message}</p>
                    <div className="flex items-center gap-2 mt-1.5">
                        <div className="flex-1 h-1.5 bg-gray-100 rounded-full overflow-hidden">
                            <div
                                className="h-full rounded-full transition-all duration-1000 ease-out"
                                style={{ width: `${item.pct}%`, backgroundColor: progressColor }}
                            />
                        </div>
                        <span className="text-[10px] font-black tabular-nums" style={{ color: progressColor }}>
                            {item.pct}%
                        </span>
                    </div>
                </div>
            </div>

            {/* Overall indicator */}
            <div className="flex-shrink-0 hidden md:flex flex-col items-center gap-0.5 pl-3 border-l border-gray-100">
                <div className="relative w-10 h-10">
                    <svg viewBox="0 0 36 36" className="w-10 h-10 -rotate-90">
                        <circle cx="18" cy="18" r="15.5" fill="none" stroke="#f3f4f6" strokeWidth="3" />
                        <circle
                            cx="18" cy="18" r="15.5" fill="none"
                            stroke={overall >= 80 ? '#10B981' : overall >= 40 ? '#F59E0B' : '#EF4444'}
                            strokeWidth="3" strokeLinecap="round"
                            strokeDasharray={`${overall * 0.975} 100`}
                            className="transition-all duration-1000"
                        />
                    </svg>
                    <span className="absolute inset-0 flex items-center justify-center text-[9px] font-black text-gray-700">
                        {overall}%
                    </span>
                </div>
                <span className="text-[8px] font-bold text-gray-400 uppercase tracking-wider">Total</span>
            </div>
        </div>
    );
};

export default AgentProgressBar;
