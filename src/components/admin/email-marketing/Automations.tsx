import React, { useEffect, useState, useCallback } from 'react';
import {
    Plus, X, Trash2, Edit2, Play, Pause, Workflow, Clock, Mail, Users, Tag, GripVertical
} from 'lucide-react';
import { toast } from 'sonner';

interface Step {
    id?: string;
    delayDays: number;
    subject: string;
    content: string;
}

interface Automation {
    id: string;
    name: string;
    triggerTag: string;
    status: 'active' | 'inactive';
    steps?: Step[];
    _count?: { steps: number; enrollments: number };
}

const API = import.meta.env.VITE_API_URL || '/api';
const authHeaders = () => ({ 'Authorization': `Bearer ${localStorage.getItem('rotary_token')}` });

const emptyStep = (): Step => ({ delayDays: 0, subject: '', content: '<p>Escribe el contenido de este paso…</p>' });

const Automations: React.FC = () => {
    const [automations, setAutomations] = useState<Automation[]>([]);
    const [tags, setTags] = useState<string[]>([]);
    const [loading, setLoading] = useState(true);
    const [isModalOpen, setIsModalOpen] = useState(false);
    const [editing, setEditing] = useState<Automation | null>(null);
    const [name, setName] = useState('');
    const [triggerTag, setTriggerTag] = useState('');
    const [steps, setSteps] = useState<Step[]>([emptyStep()]);
    const [isSubmitting, setIsSubmitting] = useState(false);

    const fetchAutomations = useCallback(async () => {
        try {
            const res = await fetch(`${API}/email-automations`, { headers: authHeaders() });
            if (res.ok) setAutomations(await res.json());
        } catch {
            toast.error('Error al cargar las automatizaciones');
        } finally {
            setLoading(false);
        }
    }, []);

    const fetchTags = useCallback(async () => {
        try {
            const res = await fetch(`${API}/email-marketing/tags`, { headers: authHeaders() });
            if (res.ok) setTags(await res.json());
        } catch { /* opcional */ }
    }, []);

    useEffect(() => { fetchAutomations(); fetchTags(); }, [fetchAutomations, fetchTags]);

    const openModal = async (a?: Automation) => {
        if (a) {
            // Cargar pasos completos
            try {
                const res = await fetch(`${API}/email-automations/${a.id}`, { headers: authHeaders() });
                const full = res.ok ? await res.json() : a;
                setEditing(full);
                setName(full.name);
                setTriggerTag(full.triggerTag);
                setSteps(full.steps?.length ? full.steps.map((s: Step) => ({ ...s })) : [emptyStep()]);
            } catch {
                setEditing(a);
                setName(a.name);
                setTriggerTag(a.triggerTag);
                setSteps([emptyStep()]);
            }
        } else {
            setEditing(null);
            setName('');
            setTriggerTag('');
            setSteps([emptyStep()]);
        }
        setIsModalOpen(true);
    };

    const updateStep = (i: number, patch: Partial<Step>) => {
        setSteps(prev => prev.map((s, idx) => idx === i ? { ...s, ...patch } : s));
    };
    const addStep = () => setSteps(prev => [...prev, emptyStep()]);
    const removeStep = (i: number) => setSteps(prev => prev.length > 1 ? prev.filter((_, idx) => idx !== i) : prev);

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!name.trim() || !triggerTag) { toast.error('Indica un nombre y una etiqueta disparadora'); return; }
        if (steps.some(s => !s.subject.trim() || !s.content.trim())) { toast.error('Cada paso necesita asunto y contenido'); return; }
        setIsSubmitting(true);
        try {
            const url = editing ? `${API}/email-automations/${editing.id}` : `${API}/email-automations`;
            const res = await fetch(url, {
                method: editing ? 'PUT' : 'POST',
                headers: { 'Content-Type': 'application/json', ...authHeaders() },
                body: JSON.stringify({ name, triggerTag, steps }),
            });
            if (!res.ok) { const d = await res.json(); throw new Error(d.error || 'No se pudo guardar'); }
            toast.success(editing ? 'Automatización actualizada' : 'Automatización creada');
            setIsModalOpen(false);
            fetchAutomations();
        } catch (err: any) {
            toast.error(err.message);
        } finally {
            setIsSubmitting(false);
        }
    };

    const toggleStatus = async (a: Automation) => {
        const action = a.status === 'active' ? 'deactivate' : 'activate';
        try {
            const res = await fetch(`${API}/email-automations/${a.id}/${action}`, { method: 'POST', headers: authHeaders() });
            const d = await res.json();
            if (!res.ok) throw new Error(d.error || 'No se pudo cambiar el estado');
            if (action === 'activate') toast.success(`Automatización activada${d.enrolled ? ` · ${d.enrolled} contacto(s) inscrito(s)` : ''}`);
            else toast.success('Automatización pausada');
            fetchAutomations();
        } catch (err: any) {
            toast.error(err.message);
        }
    };

    const handleDelete = async (a: Automation) => {
        if (!window.confirm(`¿Eliminar la automatización "${a.name}"? Se cancelan sus inscripciones.`)) return;
        try {
            const res = await fetch(`${API}/email-automations/${a.id}`, { method: 'DELETE', headers: authHeaders() });
            if (!res.ok) throw new Error('No se pudo eliminar');
            toast.success('Automatización eliminada');
            fetchAutomations();
        } catch (err: any) {
            toast.error(err.message);
        }
    };

    return (
        <div>
            <div className="flex justify-between items-center mb-4">
                <p className="text-sm text-gray-500">Secuencias de correos que se envían solas cuando un contacto tiene una etiqueta.</p>
                <button
                    onClick={() => openModal()}
                    className="flex items-center gap-2 bg-rotary-blue text-white px-4 py-2 rounded-lg hover:bg-sky-800 transition-all font-bold text-sm"
                >
                    <Plus className="w-4 h-4" /> Nueva Automatización
                </button>
            </div>

            <div className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden">
                <table className="w-full text-left">
                    <thead className="bg-gray-50 border-b border-gray-100">
                        <tr>
                            <th className="px-6 py-4 text-xs font-semibold text-gray-400 uppercase tracking-wider">Automatización</th>
                            <th className="px-6 py-4 text-xs font-semibold text-gray-400 uppercase tracking-wider">Disparador</th>
                            <th className="px-6 py-4 text-xs font-semibold text-gray-400 uppercase tracking-wider">Pasos</th>
                            <th className="px-6 py-4 text-xs font-semibold text-gray-400 uppercase tracking-wider">Inscritos</th>
                            <th className="px-6 py-4 text-xs font-semibold text-gray-400 uppercase tracking-wider">Estado</th>
                            <th className="px-6 py-4 text-xs font-semibold text-gray-400 uppercase tracking-wider text-right">Acciones</th>
                        </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-100">
                        {automations.map((a) => (
                            <tr key={a.id} className="hover:bg-gray-50 transition-colors">
                                <td className="px-6 py-4">
                                    <div className="flex items-center gap-3">
                                        <div className="w-8 h-8 rounded bg-violet-100 text-violet-600 flex items-center justify-center"><Workflow className="w-4 h-4" /></div>
                                        <span className="font-medium text-gray-800">{a.name}</span>
                                    </div>
                                </td>
                                <td className="px-6 py-4 text-sm text-gray-500">
                                    <span className="inline-flex items-center gap-1 bg-rose-50 text-rose-600 px-2 py-0.5 rounded-full text-[11px] font-bold"><Tag className="w-3 h-3" /> {a.triggerTag}</span>
                                </td>
                                <td className="px-6 py-4 text-sm text-gray-600"><span className="inline-flex items-center gap-1"><Mail className="w-3 h-3" /> {a._count?.steps ?? a.steps?.length ?? 0}</span></td>
                                <td className="px-6 py-4 text-sm text-gray-600"><span className="inline-flex items-center gap-1"><Users className="w-3 h-3" /> {a._count?.enrollments ?? 0}</span></td>
                                <td className="px-6 py-4">
                                    <span className={`px-2 py-1 rounded-full text-[10px] font-bold uppercase inline-flex items-center gap-1 ${a.status === 'active' ? 'bg-emerald-100 text-emerald-700' : 'bg-gray-100 text-gray-500'}`}>
                                        {a.status === 'active' ? <Play className="w-3 h-3" /> : <Pause className="w-3 h-3" />}
                                        {a.status === 'active' ? 'Activa' : 'Pausada'}
                                    </span>
                                </td>
                                <td className="px-6 py-4 text-right">
                                    <div className="flex justify-end gap-2">
                                        <button onClick={() => toggleStatus(a)} className={`p-2 transition-colors ${a.status === 'active' ? 'text-gray-400 hover:text-amber-600' : 'text-gray-400 hover:text-emerald-600'}`} title={a.status === 'active' ? 'Pausar' : 'Activar'}>
                                            {a.status === 'active' ? <Pause className="w-4 h-4" /> : <Play className="w-4 h-4" />}
                                        </button>
                                        <button onClick={() => openModal(a)} className="p-2 text-gray-400 hover:text-rotary-blue transition-colors" title="Editar"><Edit2 className="w-4 h-4" /></button>
                                        <button onClick={() => handleDelete(a)} className="p-2 text-gray-400 hover:text-red-500 transition-colors" title="Eliminar"><Trash2 className="w-4 h-4" /></button>
                                    </div>
                                </td>
                            </tr>
                        ))}
                    </tbody>
                </table>
                {automations.length === 0 && !loading && (
                    <div className="p-12 text-center text-gray-400">Aún no hay automatizaciones. Crea una secuencia de bienvenida o seguimiento.</div>
                )}
                {loading && <div className="p-12 text-center text-gray-400">Cargando…</div>}
            </div>

            {isModalOpen && (
                <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm">
                    <div className="bg-white rounded-2xl shadow-xl w-full max-w-2xl overflow-hidden flex flex-col max-h-[90vh]">
                        <div className="px-6 py-4 border-b border-gray-100 flex justify-between items-center bg-gray-50/50">
                            <h2 className="text-lg font-bold text-gray-800">{editing ? 'Editar Automatización' : 'Nueva Automatización'}</h2>
                            <button onClick={() => setIsModalOpen(false)} className="text-gray-400 hover:text-gray-600"><X className="w-6 h-6" /></button>
                        </div>
                        <form onSubmit={handleSubmit} className="p-6 overflow-y-auto flex-1 space-y-5">
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                <div>
                                    <label className="block text-sm font-bold text-gray-700 mb-1">Nombre</label>
                                    <input type="text" required className="w-full px-4 py-2 border border-gray-200 rounded-lg focus:ring-2 focus:ring-rotary-blue outline-none" value={name} onChange={(e) => setName(e.target.value)} placeholder="Ej: Bienvenida nuevos socios" />
                                </div>
                                <div>
                                    <label className="block text-sm font-bold text-gray-700 mb-1">Etiqueta disparadora</label>
                                    <input list="em-tags" className="w-full px-4 py-2 border border-gray-200 rounded-lg focus:ring-2 focus:ring-rotary-blue outline-none bg-white" value={triggerTag} onChange={(e) => setTriggerTag(e.target.value)} placeholder="Ej: nuevo-socio" />
                                    <datalist id="em-tags">
                                        {tags.map(t => <option key={t} value={t} />)}
                                    </datalist>
                                    <p className="text-[10px] text-gray-400 mt-1">Los contactos con esta etiqueta entran en la secuencia.</p>
                                </div>
                            </div>

                            <div>
                                <div className="flex items-center justify-between mb-2">
                                    <label className="block text-sm font-bold text-gray-700">Pasos de la secuencia</label>
                                    <button type="button" onClick={addStep} className="flex items-center gap-1 text-xs font-bold text-rotary-blue hover:text-sky-800"><Plus className="w-3.5 h-3.5" /> Agregar paso</button>
                                </div>
                                <div className="space-y-3">
                                    {steps.map((s, i) => (
                                        <div key={i} className="border border-gray-200 rounded-xl p-4 bg-gray-50/50">
                                            <div className="flex items-center justify-between mb-2">
                                                <span className="flex items-center gap-1.5 text-xs font-black text-gray-500 uppercase tracking-wider"><GripVertical className="w-3.5 h-3.5" /> Paso {i + 1}</span>
                                                {steps.length > 1 && (
                                                    <button type="button" onClick={() => removeStep(i)} className="text-gray-400 hover:text-red-500"><Trash2 className="w-4 h-4" /></button>
                                                )}
                                            </div>
                                            <div className="flex items-center gap-2 mb-2 text-sm">
                                                <Clock className="w-4 h-4 text-violet-500" />
                                                <span className="text-gray-600">Esperar</span>
                                                <input type="number" min={0} className="w-20 px-2 py-1 border border-gray-200 rounded-lg outline-none focus:ring-2 focus:ring-rotary-blue" value={s.delayDays} onChange={(e) => updateStep(i, { delayDays: Math.max(0, parseInt(e.target.value, 10) || 0) })} />
                                                <span className="text-gray-600">día(s) {i === 0 ? 'desde la inscripción' : 'desde el paso anterior'} y enviar:</span>
                                            </div>
                                            <input type="text" className="w-full px-3 py-2 border border-gray-200 rounded-lg outline-none focus:ring-2 focus:ring-rotary-blue mb-2 text-sm" value={s.subject} onChange={(e) => updateStep(i, { subject: e.target.value })} placeholder="Asunto del correo" />
                                            <textarea rows={4} className="w-full px-3 py-2 border border-gray-200 rounded-lg outline-none focus:ring-2 focus:ring-rotary-blue font-mono text-xs" value={s.content} onChange={(e) => updateStep(i, { content: e.target.value })} placeholder="Contenido HTML del correo" />
                                        </div>
                                    ))}
                                </div>
                            </div>

                            <div className="flex justify-end gap-3 border-t border-gray-100 pt-4">
                                <button type="button" onClick={() => setIsModalOpen(false)} className="px-6 py-2 text-gray-500 font-bold hover:text-gray-700">Cancelar</button>
                                <button type="submit" disabled={isSubmitting} className="bg-rotary-blue text-white px-8 py-2 rounded-full font-bold hover:bg-sky-800 transition-all disabled:opacity-50">
                                    {isSubmitting ? 'Guardando…' : (editing ? 'Guardar Cambios' : 'Crear Automatización')}
                                </button>
                            </div>
                        </form>
                    </div>
                </div>
            )}
        </div>
    );
};

export default Automations;
