import React, { useState } from 'react';
import {
    Sparkles, X, RefreshCw, Wand2, Mail, FileText, ShieldCheck, Languages,
    Copy, CheckCircle2, Plus, Repeat, AlertTriangle,
} from 'lucide-react';
import { toast } from 'sonner';

const API = import.meta.env.VITE_API_URL || '/api';
const authHeaders = () => ({ 'Authorization': `Bearer ${localStorage.getItem('rotary_token')}` });

type Task = 'subjects' | 'body' | 'improve' | 'spamcheck' | 'translate';

interface Props {
    open: boolean;
    onClose: () => void;
    subject: string;
    content: string;
    objectiveDefault?: string;
    onApplySubject: (s: string) => void;
    onApplyPreheader: (p: string) => void;
    onApplyHtml: (html: string, mode: 'append' | 'replace') => void;
}

const TABS: { key: Task; label: string; icon: React.ElementType }[] = [
    { key: 'subjects', label: 'Asuntos', icon: Mail },
    { key: 'body', label: 'Cuerpo', icon: FileText },
    { key: 'improve', label: 'Mejorar', icon: Wand2 },
    { key: 'spamcheck', label: 'Anti-spam', icon: ShieldCheck },
    { key: 'translate', label: 'Traducir', icon: Languages },
];

const TONES = [
    { value: 'profesional', label: 'Profesional' },
    { value: 'comercial', label: 'Comercial' },
    { value: 'educativo', label: 'Educativo' },
    { value: 'cercano', label: 'Cercano' },
    { value: 'institucional', label: 'Institucional' },
];
const LENGTHS = [
    { value: 'corta', label: 'Corta' },
    { value: 'media', label: 'Media' },
    { value: 'larga', label: 'Larga' },
];
const LANGS = ['Inglés', 'Portugués', 'Francés', 'Italiano', 'Alemán', 'Japonés', 'Coreano'];

const inputCls = 'w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:ring-2 focus:ring-rotary-blue outline-none';
const labelCls = 'block text-[11px] font-bold text-gray-500 uppercase tracking-wide mb-1';

const EmailAiAssistant: React.FC<Props> = ({ open, onClose, subject, content, objectiveDefault, onApplySubject, onApplyPreheader, onApplyHtml }) => {
    const [tab, setTab] = useState<Task>('subjects');
    const [loading, setLoading] = useState(false);
    const [objective, setObjective] = useState(objectiveDefault || '');
    const [audience, setAudience] = useState('');
    const [tone, setTone] = useState('profesional');
    const [length, setLength] = useState('media');
    const [points, setPoints] = useState('');
    const [instruction, setInstruction] = useState('');
    const [targetLang, setTargetLang] = useState('Inglés');
    const [copied, setCopied] = useState<string | null>(null);

    const [subjects, setSubjects] = useState<string[]>([]);
    const [preheaders, setPreheaders] = useState<string[]>([]);
    const [html, setHtml] = useState<string>('');
    const [spam, setSpam] = useState<{ score: number; level: string; flagged: { word: string; reason: string }[]; suggestions: string[] } | null>(null);

    if (!open) return null;

    const run = async () => {
        setLoading(true);
        if (tab === 'body' || tab === 'improve' || tab === 'translate') setHtml('');
        if (tab === 'spamcheck') setSpam(null);
        if (tab === 'subjects') { setSubjects([]); setPreheaders([]); }
        try {
            const body: Record<string, unknown> = { task: tab };
            if (tab === 'subjects') Object.assign(body, { objective, tone, audience });
            if (tab === 'body') Object.assign(body, { objective, tone, length, audience, points });
            if (tab === 'improve') Object.assign(body, { content, tone, length, instruction });
            if (tab === 'spamcheck') Object.assign(body, { subject, content });
            if (tab === 'translate') Object.assign(body, { content, targetLang });

            const res = await fetch(`${API}/email-marketing/ai/assist`, {
                method: 'POST', headers: { 'Content-Type': 'application/json', ...authHeaders() }, body: JSON.stringify(body),
            });
            const d = await res.json();
            if (!res.ok) throw new Error(d.error || 'No se pudo generar');
            if (tab === 'subjects') { setSubjects(Array.isArray(d.subjects) ? d.subjects : []); setPreheaders(Array.isArray(d.preheaders) ? d.preheaders : []); }
            else if (tab === 'spamcheck') setSpam(d);
            else setHtml(typeof d.html === 'string' ? d.html : '');
        } catch (err: any) {
            toast.error(err.message);
        } finally {
            setLoading(false);
        }
    };

    const copy = (text: string) => {
        try { navigator.clipboard?.writeText(text); setCopied(text); setTimeout(() => setCopied(null), 1500); } catch { /* noop */ }
    };

    const spamColor = (score: number) => score >= 60 ? 'text-rose-600' : score >= 30 ? 'text-amber-600' : 'text-emerald-600';
    const spamBg = (score: number) => score >= 60 ? 'bg-rose-500' : score >= 30 ? 'bg-amber-500' : 'bg-emerald-500';

    return (
        <div className="fixed inset-0 z-[60] flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm">
            <div className="bg-white rounded-2xl shadow-xl w-full max-w-3xl overflow-hidden flex flex-col max-h-[90vh]">
                <div className="px-6 py-4 border-b border-gray-100 flex justify-between items-center bg-gradient-to-r from-violet-50 to-sky-50">
                    <h2 className="text-lg font-black text-gray-800 flex items-center gap-2"><Sparkles className="w-5 h-5 text-violet-500" /> Asistente de IA</h2>
                    <button onClick={onClose} className="text-gray-400 hover:text-gray-600"><X className="w-6 h-6" /></button>
                </div>

                <div className="flex gap-1 px-4 pt-3 border-b border-gray-100 overflow-x-auto">
                    {TABS.map((t) => (
                        <button key={t.key} onClick={() => setTab(t.key)}
                            className={`px-3 py-2 text-sm font-bold border-b-2 -mb-px flex items-center gap-1.5 whitespace-nowrap transition-colors ${tab === t.key ? 'border-violet-500 text-violet-600' : 'border-transparent text-gray-400 hover:text-gray-600'}`}>
                            <t.icon className="w-4 h-4" /> {t.label}
                        </button>
                    ))}
                </div>

                <div className="p-6 overflow-y-auto flex-1 space-y-4">
                    {/* Formularios por tarea */}
                    {(tab === 'subjects' || tab === 'body') && (
                        <>
                            <div><label className={labelCls}>Objetivo de la campaña</label>
                                <textarea rows={2} className={inputCls} value={objective} onChange={(e) => setObjective(e.target.value)} placeholder="Ej: Invitar a los socios a la convención anual y que confirmen asistencia" /></div>
                            <div className="grid grid-cols-2 gap-3">
                                <div><label className={labelCls}>Tono</label>
                                    <select className={inputCls} value={tone} onChange={(e) => setTone(e.target.value)}>{TONES.map((t) => <option key={t.value} value={t.value}>{t.label}</option>)}</select></div>
                                {tab === 'body' ? (
                                    <div><label className={labelCls}>Longitud</label>
                                        <select className={inputCls} value={length} onChange={(e) => setLength(e.target.value)}>{LENGTHS.map((l) => <option key={l.value} value={l.value}>{l.label}</option>)}</select></div>
                                ) : (
                                    <div><label className={labelCls}>Audiencia (opcional)</label>
                                        <input className={inputCls} value={audience} onChange={(e) => setAudience(e.target.value)} placeholder="Ej: socios activos" /></div>
                                )}
                            </div>
                            {tab === 'body' && (
                                <div><label className={labelCls}>Puntos a incluir (opcional)</label>
                                    <input className={inputCls} value={points} onChange={(e) => setPoints(e.target.value)} placeholder="Ej: fecha, lugar, enlace de registro" /></div>
                            )}
                        </>
                    )}
                    {tab === 'improve' && (
                        <div className="grid grid-cols-2 gap-3">
                            <div><label className={labelCls}>Tono</label>
                                <select className={inputCls} value={tone} onChange={(e) => setTone(e.target.value)}>{TONES.map((t) => <option key={t.value} value={t.value}>{t.label}</option>)}</select></div>
                            <div><label className={labelCls}>Longitud</label>
                                <select className={inputCls} value={length} onChange={(e) => setLength(e.target.value)}>{LENGTHS.map((l) => <option key={l.value} value={l.value}>{l.label}</option>)}</select></div>
                            <div className="col-span-2"><label className={labelCls}>Instrucción adicional (opcional)</label>
                                <input className={inputCls} value={instruction} onChange={(e) => setInstruction(e.target.value)} placeholder="Ej: hazlo más breve y agrega una llamada a la acción" /></div>
                        </div>
                    )}
                    {tab === 'translate' && (
                        <div><label className={labelCls}>Idioma de destino</label>
                            <select className={inputCls} value={targetLang} onChange={(e) => setTargetLang(e.target.value)}>{LANGS.map((l) => <option key={l} value={l}>{l}</option>)}</select></div>
                    )}
                    {(tab === 'improve' || tab === 'spamcheck' || tab === 'translate') && (
                        <p className="text-[11px] text-gray-400">Se usa el contenido actual del correo{tab === 'spamcheck' ? ' y el asunto' : ''}.</p>
                    )}

                    <button onClick={run} disabled={loading}
                        className="flex items-center gap-2 px-5 py-2.5 rounded-xl bg-violet-600 text-white font-bold hover:bg-violet-700 transition-all disabled:opacity-50">
                        {loading ? <RefreshCw className="w-4 h-4 animate-spin" /> : <Sparkles className="w-4 h-4" />}
                        {loading ? 'Generando…' : 'Generar con IA'}
                    </button>

                    {/* Resultados */}
                    {tab === 'subjects' && subjects.length > 0 && (
                        <div className="space-y-3">
                            <div>
                                <p className="text-xs font-black text-gray-500 uppercase mb-2">Asuntos sugeridos</p>
                                <div className="space-y-1.5">
                                    {subjects.map((s, i) => (
                                        <div key={i} className="flex items-center gap-2 p-2.5 rounded-lg border border-gray-100 hover:border-violet-200 bg-gray-50/50">
                                            <span className="flex-1 text-sm text-gray-700">{s}</span>
                                            <span className="text-[10px] text-gray-400">{s.length}</span>
                                            <button onClick={() => copy(s)} className="p-1 text-gray-400 hover:text-gray-700" title="Copiar">{copied === s ? <CheckCircle2 className="w-4 h-4 text-emerald-500" /> : <Copy className="w-4 h-4" />}</button>
                                            <button onClick={() => { onApplySubject(s); toast.success('Asunto aplicado'); }} className="px-2.5 py-1 text-xs font-bold text-violet-600 bg-violet-50 rounded-lg hover:bg-violet-100">Usar</button>
                                        </div>
                                    ))}
                                </div>
                            </div>
                            {preheaders.length > 0 && (
                                <div>
                                    <p className="text-xs font-black text-gray-500 uppercase mb-2">Preheaders</p>
                                    <div className="space-y-1.5">
                                        {preheaders.map((p, i) => (
                                            <div key={i} className="flex items-center gap-2 p-2.5 rounded-lg border border-gray-100 bg-gray-50/50">
                                                <span className="flex-1 text-sm text-gray-700">{p}</span>
                                                <button onClick={() => { onApplyPreheader(p); toast.success('Preheader aplicado'); }} className="px-2.5 py-1 text-xs font-bold text-violet-600 bg-violet-50 rounded-lg hover:bg-violet-100">Usar</button>
                                            </div>
                                        ))}
                                    </div>
                                </div>
                            )}
                        </div>
                    )}

                    {(tab === 'body' || tab === 'improve' || tab === 'translate') && html && (
                        <div className="space-y-2">
                            <p className="text-xs font-black text-gray-500 uppercase">Vista previa</p>
                            <div className="border border-gray-200 rounded-lg p-4 max-h-64 overflow-auto prose prose-sm max-w-none" dangerouslySetInnerHTML={{ __html: html }} />
                            <div className="flex flex-wrap gap-2">
                                <button onClick={() => { onApplyHtml(html, 'replace'); toast.success('Contenido reemplazado'); onClose(); }} className="flex items-center gap-1.5 px-4 py-2 rounded-lg bg-rotary-blue text-white text-sm font-bold hover:bg-sky-800"><Repeat className="w-4 h-4" /> Reemplazar contenido</button>
                                <button onClick={() => { onApplyHtml(html, 'append'); toast.success('Contenido insertado al final'); onClose(); }} className="flex items-center gap-1.5 px-4 py-2 rounded-lg bg-sky-50 text-rotary-blue border border-blue-100 text-sm font-bold hover:bg-sky-100"><Plus className="w-4 h-4" /> Insertar al final</button>
                                <button onClick={() => copy(html)} className="flex items-center gap-1.5 px-3 py-2 rounded-lg text-gray-500 border border-gray-200 text-sm font-bold hover:bg-gray-50"><Copy className="w-4 h-4" /> Copiar HTML</button>
                            </div>
                        </div>
                    )}

                    {tab === 'spamcheck' && spam && (
                        <div className="space-y-4">
                            <div className="flex items-center gap-4">
                                <div className={`text-4xl font-black ${spamColor(spam.score)}`}>{spam.score}<span className="text-lg text-gray-300">/100</span></div>
                                <div className="flex-1">
                                    <div className="flex items-center justify-between mb-1"><span className="text-xs font-bold text-gray-500 uppercase">Riesgo de spam</span><span className={`text-xs font-black uppercase ${spamColor(spam.score)}`}>{spam.level}</span></div>
                                    <div className="h-2 rounded-full bg-gray-100 overflow-hidden"><div className={`h-full ${spamBg(spam.score)}`} style={{ width: `${Math.min(100, Math.max(0, spam.score))}%` }} /></div>
                                </div>
                            </div>
                            {spam.flagged?.length > 0 && (
                                <div>
                                    <p className="text-xs font-black text-gray-500 uppercase mb-2 flex items-center gap-1"><AlertTriangle className="w-3.5 h-3.5 text-amber-500" /> Términos marcados</p>
                                    <div className="space-y-1.5">
                                        {spam.flagged.map((f, i) => (
                                            <div key={i} className="flex items-start gap-2 text-sm p-2 rounded-lg bg-amber-50/60 border border-amber-100">
                                                <span className="font-bold text-amber-700 shrink-0">{f.word}</span>
                                                <span className="text-gray-500 text-xs">{f.reason}</span>
                                            </div>
                                        ))}
                                    </div>
                                </div>
                            )}
                            {spam.suggestions?.length > 0 && (
                                <div>
                                    <p className="text-xs font-black text-gray-500 uppercase mb-2">Sugerencias</p>
                                    <ul className="list-disc list-inside space-y-1 text-sm text-gray-600">{spam.suggestions.map((s, i) => <li key={i}>{s}</li>)}</ul>
                                </div>
                            )}
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
};

export default EmailAiAssistant;
