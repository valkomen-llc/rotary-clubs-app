import React from 'react';
import { RadialBarChart, RadialBar, PolarAngleAxis, ResponsiveContainer } from 'recharts';
import type { Maturity } from '../../../lib/reportTypes';

const LEVEL_COLORS = ['#ef4444', '#f59e0b', '#3b82f6', '#0c3c7c', '#7c3aed'];

const MaturityGauge: React.FC<{ maturity: Maturity; size?: number }> = ({ maturity, size = 220 }) => {
    const color = LEVEL_COLORS[maturity.levelIndex] || '#0c3c7c';
    const data = [{ name: 'score', value: maturity.score, fill: color }];

    return (
        <div className="flex flex-col items-center">
            <div style={{ width: size, height: size * 0.62, position: 'relative' }}>
                <ResponsiveContainer width="100%" height={size}>
                    <RadialBarChart
                        cx="50%" cy="72%" innerRadius="130%" outerRadius="170%"
                        startAngle={180} endAngle={0} barSize={18} data={data}
                    >
                        <PolarAngleAxis type="number" domain={[0, 100]} angleAxisId={0} tick={false} />
                        <RadialBar background={{ fill: '#eef2f7' }} dataKey="value" cornerRadius={12} angleAxisId={0} />
                    </RadialBarChart>
                </ResponsiveContainer>
                <div style={{ position: 'absolute', bottom: 6, left: 0, right: 0, textAlign: 'center' }}>
                    <div style={{ fontSize: 44, fontWeight: 900, color, lineHeight: 1 }}>{maturity.score}</div>
                    <div style={{ fontSize: 11, fontWeight: 700, color: '#94a3b8', letterSpacing: 1 }}>/ 100</div>
                </div>
            </div>
            <div className="mt-2 px-5 py-2 rounded-full text-white font-bold text-sm shadow-sm" style={{ backgroundColor: color }}>
                {maturity.level}
            </div>
            <div className="flex items-center gap-1.5 mt-4">
                {['Emergente', 'En Crecimiento', 'Consolidado', 'Avanzado', 'Transformación'].map((lvl, i) => (
                    <div key={lvl} className="flex flex-col items-center" style={{ opacity: i === maturity.levelIndex ? 1 : 0.35 }}>
                        <div className="w-8 h-1.5 rounded-full" style={{ backgroundColor: LEVEL_COLORS[i] }} />
                        <span className="text-[8px] font-bold text-slate-500 mt-1 uppercase tracking-tight">{lvl}</span>
                    </div>
                ))}
            </div>
        </div>
    );
};

export default MaturityGauge;
