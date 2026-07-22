import React, { useCallback, useEffect, useState } from 'react';
import {
    BarChart, Bar, PieChart, Pie, Cell, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
} from 'recharts';
import {
    X, RefreshCw, Sparkles, Download, Activity, Clock, Smartphone, Link2,
    CheckCircle2, AlertTriangle, Lightbulb, TrendingUp,
} from 'lucide-react';
import { jsPDF } from 'jspdf';
import { toast } from 'sonner';

const API = import.meta.env.VITE_API_URL || '/api';
const authHeaders = () => ({ 'Authorization': `Bearer ${localStorage.getItem('rotary_token')}` });

interface Funnel { sent: number; delivered: number; uniqueOpens: number; uniqueClicks: number; openRate: number; clickRate: number; ctor: number; }
interface Analytics {
    campaign: { id: string; name: string; subject: string; sentAt?: string | null; status: string };
    funnel: Funnel;
    totals: { totalOpens: number; totalClicks: number; failed: number };
    hourly: { hour: number; opens: number; clicks: number }[];
    devices: { device: string; count: number }[];
    topLinks: { url: string; clicks: number }[];
}
interface AiSummary {
    summary: string;
    whatWorked?: string[];
    toImprove?: string[];
    recommendations?: string[];
}

const DEVICE_COLORS: Record<string, string> = { mobile: '#3b82f6', desktop: '#0c3c7c', tablet: '#E29C00', desconocido: '#94a3b8' };
const DEVICE_LABEL: Record<string, string> = { mobile: 'Móvil', desktop: 'Escritorio', tablet: 'Tablet', desconocido: 'Desconocido' };
const tooltipStyle = { borderRadius: '12px', border: '1px solid #e2e8f0', boxShadow: '0 10px 40px rgba(0,0,0,0.08)', padding: '8px 12px', fontSize: 12, fontWeight: 600 };
const fmt = (n?: number) => (n ?? 0).toLocaleString('es-CO');

const CampaignAnalytics: React.FC<{ campaignId: string; onClose: () => void }> = ({ campaignId, onClose }) => {
    const [data, setData] = useState<Analytics | null>(null);
    const [loading, setLoading] = useState(true);
    const [ai, setAi] = useState<AiSummary | null>(null);
    const [aiLoading, setAiLoading] = useState(false);

    const load = useCallback(async () => {
        setLoading(true);
        try {
            const res = await fetch(`${API}/email-marketing/${campaignId}/analytics`, { headers: authHeaders() });
            if (!res.ok) throw new Error();
            setData(await res.json());
        } catch {
            toast.error('No se pudo cargar la analítica');
        } finally {
            setLoading(false);
        }
    }, [campaignId]);

    useEffect(() => { load(); }, [load]);

    const genAi = async () => {
        setAiLoading(true);
        try {
            const res = await fetch(`${API}/email-marketing/${campaignId}/ai-summary`, { method: 'POST', headers: authHeaders() });
            const d = await res.json();
            if (!res.ok) throw new Error(d.error || 'No se pudo generar el resumen');
            setAi(d);
        } catch (err: any) {
            toast.error(err.message);
        } finally {
            setAiLoading(false);
        }
    };

    const downloadPdf = () => {
        if (!data) return;
        try {
            const doc = new jsPDF();
            const W = 210; const M = 20; let y = 24;
            const line = (txt: string, size = 11, color: [number, number, number] = [55, 65, 81], gap = 6) => {
                doc.setFontSize(size); doc.setTextColor(...color);
                const lines = doc.splitTextToSize(txt, W - M * 2);
                doc.text(lines, M, y); y += gap * lines.length;
            };
            // Portada
            doc.setFillColor(12, 60, 124); doc.rect(0, 0, W, 10, 'F');
            doc.setFont('helvetica', 'bold'); line('Informe de campaña de email', 22, [17, 24, 39], 9);
            doc.setFont('helvetica', 'normal'); line(data.campaign.name, 14, [12, 60, 124], 7);
            line(`Asunto: ${data.campaign.subject}`, 10, [107, 114, 128], 5);
            if (data.campaign.sentAt) line(`Enviada: ${new Date(data.campaign.sentAt).toLocaleString('es-CO')}`, 10, [107, 114, 128], 8);
            // KPIs
            doc.setFont('helvetica', 'bold'); line('Resultados', 14, [17, 24, 39], 7);
            doc.setFont('helvetica', 'normal');
            const f = data.funnel;
            line(`Enviados: ${fmt(f.sent)}   ·   Fallidos: ${fmt(data.totals.failed)}`, 11, [55, 65, 81], 6);
            line(`Aperturas únicas: ${fmt(f.uniqueOpens)} (${f.openRate}%)   ·   Total aperturas: ${fmt(data.totals.totalOpens)}`, 11, [55, 65, 81], 6);
            line(`Clics únicos: ${fmt(f.uniqueClicks)} (${f.clickRate}%)   ·   Click-to-open: ${f.ctor}%`, 11, [55, 65, 81], 8);
            // Enlaces
            if (data.topLinks.length) {
                doc.setFont('helvetica', 'bold'); line('Enlaces más pulsados', 14, [17, 24, 39], 7);
                doc.setFont('helvetica', 'normal');
                data.topLinks.slice(0, 8).forEach((l, i) => line(`${i + 1}. (${l.clicks}) ${l.url}`, 9, [75, 85, 99], 5));
                y += 3;
            }
            // Resumen IA
            if (ai) {
                if (y > 220) { doc.addPage(); y = 24; }
                doc.setFont('helvetica', 'bold'); line('Análisis con IA', 14, [124, 58, 173], 7);
                doc.setFont('helvetica', 'normal'); line(ai.summary, 11, [55, 65, 81], 6); y += 2;
                const bullets = (title: string, arr?: string[]) => {
                    if (!arr || !arr.length) return;
                    doc.setFont('helvetica', 'bold'); line(title, 11, [17, 24, 39], 6);
                    doc.setFont('helvetica', 'normal'); arr.forEach((x) => line(`•  ${x}`, 10, [75, 85, 99], 5)); y += 2;
                };
                bullets('Qué funcionó', ai.whatWorked);
                bullets('Qué mejorar', ai.toImprove);
                bullets('Recomendaciones', ai.recommendations);
            }
            doc.save(`informe-${data.campaign.name.replace(/[^a-z0-9]+/gi, '-').slice(0, 40)}.pdf`);
        } catch {
            toast.error('No se pudo generar el PDF');
        }
    };

    const devicePie = (data?.devices || []).map((d) => ({ name: DEVICE_LABEL[d.device] || d.device, value: d.count, key: d.device }));
    const peakHour = data?.hourly.reduce((best, h) => (h.opens + h.clicks > (best.opens + best.clicks) ? h : best), { hour: 0, opens: 0, clicks: 0 });

    return (
        <div className="fixed inset-0 z-[60] flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm">
            <div className="bg-white rounded-2xl shadow-xl w-full max-w-4xl overflow-hidden flex flex-col max-h-[92vh]">
                <div className="px-6 py-4 border-b border-gray-100 flex justify-between items-center bg-gray-50/50">
                    <div className="flex items-center gap-2 min-w-0">
                        <Activity className="w-5 h-5 text-rotary-blue shrink-0" />
                        <div className="min-w-0">
                            <h2 className="text-lg font-bold text-gray-800 truncate">Analítica avanzada</h2>
                            {data && <p className="text-xs text-gray-400 truncate">{data.campaign.name}</p>}
                        </div>
                    </div>
                    <div className="flex items-center gap-2 shrink-0">
                        <button onClick={downloadPdf} disabled={!data} className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold text-rotary-blue bg-sky-50 border border-blue-100 hover:bg-sky-100 disabled:opacity-40"><Download className="w-3.5 h-3.5" /> PDF</button>
                        <button onClick={onClose} className="text-gray-400 hover:text-gray-600"><X className="w-6 h-6" /></button>
                    </div>
                </div>

                <div className="p-6 overflow-y-auto flex-1 space-y-5">
                    {loading || !data ? (
                        <div className="py-16 text-center text-gray-400 flex flex-col items-center gap-3"><RefreshCw className="w-6 h-6 animate-spin" /> Cargando analítica…</div>
                    ) : (
                        <>
                            {/* Embudo */}
                            <div>
                                <h3 className="font-bold text-gray-800 text-sm mb-3 flex items-center gap-1.5"><TrendingUp className="w-4 h-4 text-rotary-blue" /> Embudo de conversión</h3>
                                <div className="space-y-2">
                                    {[
                                        { label: 'Enviados', value: data.funnel.sent, pct: 100, color: 'bg-sky-500' },
                                        { label: 'Entregados', value: data.funnel.delivered, pct: data.funnel.sent ? Math.round((data.funnel.delivered / data.funnel.sent) * 100) : 0, color: 'bg-emerald-500' },
                                        { label: 'Aperturas únicas', value: data.funnel.uniqueOpens, pct: data.funnel.sent ? Math.round((data.funnel.uniqueOpens / data.funnel.sent) * 100) : 0, color: 'bg-indigo-500' },
                                        { label: 'Clics únicos', value: data.funnel.uniqueClicks, pct: data.funnel.sent ? Math.round((data.funnel.uniqueClicks / data.funnel.sent) * 100) : 0, color: 'bg-amber-500' },
                                    ].map((s) => (
                                        <div key={s.label} className="flex items-center gap-3">
                                            <span className="w-32 text-xs font-bold text-gray-500 shrink-0">{s.label}</span>
                                            <div className="flex-1 bg-gray-100 rounded-full h-6 overflow-hidden">
                                                <div className={`h-full ${s.color} rounded-full flex items-center justify-end px-2`} style={{ width: `${Math.max(s.pct, 6)}%` }}>
                                                    <span className="text-[10px] font-black text-white">{fmt(s.value)}</span>
                                                </div>
                                            </div>
                                            <span className="w-10 text-xs font-bold text-gray-400 text-right">{s.pct}%</span>
                                        </div>
                                    ))}
                                </div>
                                <p className="text-[11px] text-gray-400 mt-2">Click-to-open (CTOR): <strong>{data.funnel.ctor}%</strong> · de quienes abrieron, cuántos hicieron clic.</p>
                            </div>

                            <div className="grid md:grid-cols-3 gap-4">
                                {/* Horarios */}
                                <div className="md:col-span-2 bg-gray-50/60 rounded-xl border border-gray-100 p-4">
                                    <h3 className="font-bold text-gray-800 text-sm mb-3 flex items-center gap-1.5"><Clock className="w-4 h-4 text-indigo-600" /> Interacción por hora</h3>
                                    <ResponsiveContainer width="100%" height={200}>
                                        <BarChart data={data.hourly} margin={{ top: 5, right: 5, left: -22, bottom: 0 }}>
                                            <CartesianGrid strokeDasharray="3 3" stroke="#eef2f7" vertical={false} />
                                            <XAxis dataKey="hour" tick={{ fontSize: 9, fill: '#94a3b8' }} axisLine={false} tickLine={false} interval={2} tickFormatter={(h) => `${h}h`} />
                                            <YAxis tick={{ fontSize: 9, fill: '#94a3b8' }} axisLine={false} tickLine={false} allowDecimals={false} />
                                            <Tooltip contentStyle={tooltipStyle} labelFormatter={(h) => `${h}:00`} />
                                            <Bar dataKey="opens" name="Aperturas" fill="#6366f1" radius={[3, 3, 0, 0]} />
                                            <Bar dataKey="clicks" name="Clics" fill="#f59e0b" radius={[3, 3, 0, 0]} />
                                        </BarChart>
                                    </ResponsiveContainer>
                                    {peakHour && (peakHour.opens + peakHour.clicks > 0) && (
                                        <p className="text-[11px] text-gray-400 mt-1">Mayor interacción alrededor de las <strong>{peakHour.hour}:00</strong>.</p>
                                    )}
                                </div>

                                {/* Dispositivos */}
                                <div className="bg-gray-50/60 rounded-xl border border-gray-100 p-4">
                                    <h3 className="font-bold text-gray-800 text-sm mb-2 flex items-center gap-1.5"><Smartphone className="w-4 h-4 text-emerald-600" /> Dispositivos</h3>
                                    {devicePie.length ? (
                                        <ResponsiveContainer width="100%" height={170}>
                                            <PieChart>
                                                <Pie data={devicePie} cx="50%" cy="50%" innerRadius={38} outerRadius={64} paddingAngle={3} dataKey="value" nameKey="name">
                                                    {devicePie.map((d) => <Cell key={d.key} fill={DEVICE_COLORS[d.key] || '#94a3b8'} />)}
                                                </Pie>
                                                <Tooltip contentStyle={tooltipStyle} />
                                            </PieChart>
                                        </ResponsiveContainer>
                                    ) : <p className="text-xs text-gray-300 py-10 text-center">Sin datos de apertura aún.</p>}
                                    <div className="space-y-1 mt-1">
                                        {devicePie.map((d) => (
                                            <div key={d.key} className="flex items-center gap-2 text-[11px]">
                                                <span className="w-2.5 h-2.5 rounded-full" style={{ background: DEVICE_COLORS[d.key] || '#94a3b8' }} />
                                                <span className="text-gray-600 flex-1">{d.name}</span>
                                                <span className="font-bold text-gray-700">{fmt(d.value)}</span>
                                            </div>
                                        ))}
                                    </div>
                                </div>
                            </div>

                            {/* Enlaces top */}
                            <div>
                                <h3 className="font-bold text-gray-800 text-sm mb-2 flex items-center gap-1.5"><Link2 className="w-4 h-4 text-amber-600" /> Enlaces más pulsados</h3>
                                {data.topLinks.length ? (
                                    <div className="space-y-1.5">
                                        {data.topLinks.map((l, i) => (
                                            <div key={i} className="flex items-center gap-3 p-2 rounded-lg bg-gray-50 border border-gray-100">
                                                <span className="text-xs font-black text-gray-400 w-5 shrink-0">{i + 1}</span>
                                                <a href={l.url} target="_blank" rel="noreferrer" className="text-xs text-rotary-blue truncate flex-1 hover:underline">{l.url}</a>
                                                <span className="text-xs font-bold text-gray-700 shrink-0">{fmt(l.clicks)} clic(s)</span>
                                            </div>
                                        ))}
                                    </div>
                                ) : <p className="text-xs text-gray-300">Aún no hay clics en enlaces.</p>}
                            </div>

                            {/* Resumen IA */}
                            <div className="border-t border-gray-100 pt-4">
                                <div className="flex items-center justify-between mb-3">
                                    <h3 className="font-bold text-gray-800 text-sm flex items-center gap-1.5"><Sparkles className="w-4 h-4 text-violet-500" /> Resumen inteligente</h3>
                                    <button onClick={genAi} disabled={aiLoading} className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold text-white bg-gradient-to-r from-violet-600 to-fuchsia-600 hover:from-violet-700 hover:to-fuchsia-700 disabled:opacity-50">
                                        {aiLoading ? <RefreshCw className="w-3.5 h-3.5 animate-spin" /> : <Sparkles className="w-3.5 h-3.5" />} {ai ? 'Regenerar' : 'Generar con IA'}
                                    </button>
                                </div>
                                {ai ? (
                                    <div className="space-y-3">
                                        <p className="text-sm text-gray-700 bg-violet-50/50 border border-violet-100 rounded-lg p-3">{ai.summary}</p>
                                        <div className="grid md:grid-cols-3 gap-3">
                                            <AiList title="Qué funcionó" items={ai.whatWorked} icon={<CheckCircle2 className="w-3.5 h-3.5 text-emerald-500" />} />
                                            <AiList title="Qué mejorar" items={ai.toImprove} icon={<AlertTriangle className="w-3.5 h-3.5 text-amber-500" />} />
                                            <AiList title="Recomendaciones" items={ai.recommendations} icon={<Lightbulb className="w-3.5 h-3.5 text-violet-500" />} />
                                        </div>
                                    </div>
                                ) : (
                                    <p className="text-xs text-gray-400">Genera un análisis con IA de qué funcionó, qué mejorar y recomendaciones para la próxima campaña.</p>
                                )}
                            </div>
                        </>
                    )}
                </div>
            </div>
        </div>
    );
};

const AiList: React.FC<{ title: string; items?: string[]; icon: React.ReactNode }> = ({ title, items, icon }) => (
    <div className="bg-gray-50/60 rounded-xl border border-gray-100 p-3">
        <p className="text-[11px] font-black text-gray-500 uppercase mb-2 flex items-center gap-1">{icon} {title}</p>
        {items && items.length ? (
            <ul className="space-y-1">{items.map((x, i) => <li key={i} className="text-[12px] text-gray-600 leading-snug">• {x}</li>)}</ul>
        ) : <p className="text-[11px] text-gray-300">—</p>}
    </div>
);

export default CampaignAnalytics;
