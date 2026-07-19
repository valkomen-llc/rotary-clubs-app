import React from 'react';
import {
    BarChart, Bar, LineChart, Line, AreaChart, Area, PieChart, Pie, Cell,
    XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
} from 'recharts';
import type { ChartBlock } from '../../../lib/reportTypes';

const PALETTE = ['#0c3c7c', '#3b82f6', '#E29C00', '#10b981', '#8b5cf6', '#ec4899', '#f59e0b', '#14b8a6'];

const fmt = (v: number, block: ChartBlock): string => {
    if (block.valueFormat === 'currency') return `${block.currency || ''} ${Math.round(v).toLocaleString('es')}`.trim();
    if (block.valueFormat === 'percent') return `${v}%`;
    return v.toLocaleString('es');
};

const tooltipStyle = {
    borderRadius: '14px', border: '1px solid #e2e8f0',
    boxShadow: '0 10px 40px rgba(0,0,0,0.08)', padding: '10px 14px', fontSize: 12, fontWeight: 600,
};

const axisTick = { fill: '#94a3b8', fontSize: 10, fontWeight: 700 } as const;

const ReportChart: React.FC<{ block: ChartBlock }> = ({ block }) => {
    const height = block.height || 240;
    const data = block.data || [];
    const accent = PALETTE[0];

    const body = (() => {
        switch (block.type) {
            case 'donut':
            case 'pie': {
                const inner = block.type === 'donut' ? 55 : 0;
                const filtered = data.filter((d: any) => Number(d.value) > 0);
                return (
                    <PieChart>
                        <Pie data={filtered.length ? filtered : [{ name: 'Sin datos', value: 1 }]} cx="50%" cy="50%" innerRadius={inner} outerRadius={82} paddingAngle={3} dataKey="value" nameKey="name">
                            {(filtered.length ? filtered : [{ name: 'Sin datos', value: 1 }]).map((_: any, i: number) => (
                                <Cell key={i} fill={filtered.length ? PALETTE[i % PALETTE.length] : '#e2e8f0'} />
                            ))}
                        </Pie>
                        <Tooltip contentStyle={tooltipStyle} formatter={(v: any) => fmt(Number(v), block)} />
                    </PieChart>
                );
            }
            case 'hbar':
                return (
                    <BarChart data={data} layout="vertical" margin={{ left: 8, right: 16 }}>
                        <CartesianGrid strokeDasharray="3 3" horizontal={false} stroke="#f1f5f9" />
                        <XAxis type="number" hide />
                        <YAxis type="category" dataKey="name" width={110} tick={axisTick} axisLine={false} tickLine={false} />
                        <Tooltip contentStyle={tooltipStyle} formatter={(v: any) => fmt(Number(v), block)} cursor={{ fill: '#f8fafc' }} />
                        <Bar dataKey="value" fill={accent} radius={[0, 6, 6, 0]} />
                    </BarChart>
                );
            case 'line':
                return (
                    <LineChart data={data} margin={{ left: 4, right: 12, top: 8 }}>
                        <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
                        <XAxis dataKey="name" tick={axisTick} axisLine={false} tickLine={false} dy={6} />
                        <YAxis hide />
                        <Tooltip contentStyle={tooltipStyle} formatter={(v: any) => fmt(Number(v), block)} />
                        <Line type="monotone" dataKey="value" stroke={accent} strokeWidth={3} dot={{ r: 3, fill: accent }} />
                    </LineChart>
                );
            case 'area':
                return (
                    <AreaChart data={data} margin={{ left: 4, right: 12, top: 8 }}>
                        <defs>
                            <linearGradient id={`grad-${block.title.replace(/\W/g, '')}`} x1="0" y1="0" x2="0" y2="1">
                                <stop offset="5%" stopColor={accent} stopOpacity={0.25} />
                                <stop offset="95%" stopColor={accent} stopOpacity={0} />
                            </linearGradient>
                        </defs>
                        <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
                        <XAxis dataKey="name" tick={axisTick} axisLine={false} tickLine={false} dy={6} />
                        <YAxis hide />
                        <Tooltip contentStyle={tooltipStyle} formatter={(v: any) => fmt(Number(v), block)} />
                        <Area type="monotone" dataKey="value" stroke={accent} strokeWidth={2.5} fill={`url(#grad-${block.title.replace(/\W/g, '')})`} />
                    </AreaChart>
                );
            case 'bar':
            default:
                return (
                    <BarChart data={data} margin={{ left: 4, right: 12, top: 8 }}>
                        <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
                        <XAxis dataKey="name" tick={axisTick} axisLine={false} tickLine={false} dy={6} />
                        <YAxis hide />
                        <Tooltip contentStyle={tooltipStyle} formatter={(v: any) => fmt(Number(v), block)} cursor={{ fill: '#f8fafc' }} />
                        <Bar dataKey="value" fill={accent} radius={[6, 6, 0, 0]} opacity={0.9} />
                    </BarChart>
                );
        }
    })();

    return (
        <div>
            <p className="text-xs font-bold text-slate-500 uppercase tracking-wider mb-3">{block.title}</p>
            <div style={{ height }}>
                <ResponsiveContainer width="100%" height="100%">{body}</ResponsiveContainer>
            </div>
        </div>
    );
};

export default ReportChart;
