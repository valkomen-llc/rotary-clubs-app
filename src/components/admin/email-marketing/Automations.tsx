import React, { useEffect, useState, useCallback } from 'react';
import {
    Plus, X, Trash2, Edit2, Play, Pause, Workflow, Clock, Mail, Users, Tag,
    ChevronUp, ChevronDown, GitBranch, Zap, Timer, Bell, Webhook, Flag,
} from 'lucide-react';
import { toast } from 'sonner';

type ActionType = 'email' | 'wait' | 'apply_tag' | 'remove_tag' | 'condition' | 'end_condition' | 'notify' | 'webhook';

interface Step {
    id?: string;
    actionType: ActionType;
    delayDays: number;
    actionValue?: string | null;
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

const NODE_META: Record<ActionType, { label: string; icon: React.ElementType; color: string; ring: string }> = {
    email: { label: 'Enviar correo', icon: Mail, color: 'text-sky-600 bg-sky-50', ring: 'border-sky-200' },
    wait: { label: 'Esperar', icon: Timer, color: 'text-violet-600 bg-violet-50', ring: 'border-violet-200' },
    apply_tag: { label: 'Aplicar etiqueta', icon: Tag, color: 'text-emerald-600 bg-emerald-50', ring: 'border-emerald-200' },
    remove_tag: { label: 'Quitar etiqueta', icon: Tag, color: 'text-rose-600 bg-rose-50', ring: 'border-rose-200' },
    condition: { label: 'Condición (si…)', icon: GitBranch, color: 'text-amber-600 bg-amber-50', ring: 'border-amber-200' },
    end_condition: { label: 'Fin de condición', icon: Flag, color: 'text-amber-700 bg-amber-50', ring: 'border-amber-200' },
    notify: { label: 'Notificar al equipo', icon: Bell, color: 'text-indigo-600 bg-indigo-50', ring: 'border-indigo-200' },
    webhook: { label: 'Webhook', icon: Webhook, color: 'text-gray-600 bg-gray-100', ring: 'border-gray-200' },
};
const NODE_ORDER: ActionType[] = ['email', 'wait', 'apply_tag', 'remove_tag', 'condition', 'end_condition', 'notify', 'webhook'];

const makeStep = (type: ActionType): Step => ({
    actionType: type,
    delayDays: type === 'wait' ? 1 : 0,
    actionValue: type === 'condition' ? 'has_tag:' : (type === 'webhook' ? 'https://' : ''),
    subject: '',
    content: type === 'email' ? '<p>Escribe el contenido de este correo…</p>' : '',
});

const Automations: React.FC = () => {
    const [automations, setAutomations] = useState<Automation[]>([]);
    const [tags, setTags] = useState<string[]>([]);
    const [loading, setLoading] = useState(true);
    const [isModalOpen, setIsModalOpen] = useState(false);
    const [editing, setEditing] = useState<Automation | null>(null);
    const [name, setName] = useState('');
    const [triggerTag, setTriggerTag] = useState('');
    const [steps, setSteps] = useState<Step[]>([makeStep('email')]);
    const [isSubmitting, setIsSubmitting] = useState(false);
    const [addMenuAt, setAddMenuAt] = useState<number | null>(null);

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
        setAddMenuAt(null);
        if (a) {
            try {
                const res = await fetch(`${API}/email-automations/${a.id}`, { headers: authHeaders() });
                const full = res.ok ? await res.json() : a;
                setEditing(full);
                setName(full.name);
                setTriggerTag(full.triggerTag);
                setSteps(full.steps?.length ? full.steps.map((s: Step) => ({ ...s, actionType: s.actionType || 'email' })) : [makeStep('email')]);
            } catch {
                setEditing(a);
                setName(a.name);
                setTriggerTag(a.triggerTag);
                setSteps([makeStep('email')]);
            }
        } else {
            setEditing(null);
            setName('');
            setTriggerTag('');
            setSteps([makeStep('email')]);
        }
        setIsModalOpen(true);
    };

    const updateStep = (i: number, patch: Partial<Step>) => setSteps((prev) => prev.map((s, idx) => (idx === i ? { ...s, ...patch } : s)));
    const removeStep = (i: number) => setSteps((prev) => (prev.length > 1 ? prev.filter((_, idx) => idx !== i) : prev));
    const moveStep = (from: number, to: number) => {
        if (to < 0 || to >= steps.length) return;
        setSteps((prev) => { const n = [...prev]; const [it] = n.splice(from, 1); n.splice(to, 0, it); return n; });
    };
    const insertStep = (at: number, type: ActionType) => {
        setSteps((prev) => { const n = [...prev]; n.splice(at, 0, makeStep(type)); return n; });
        setAddMenuAt(null);
    };

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!name.trim() || !triggerTag) { toast.error('Indica un nombre y una etiqueta disparadora'); return; }
        for (const s of steps) {
            if (s.actionType === 'email' && (!s.subject.trim() || !s.content.trim())) { toast.error('Cada nodo "Enviar correo" necesita asunto y contenido'); return; }
            if ((s.actionType === 'apply_tag' || s.actionType === 'remove_tag') && !(s.actionValue || '').trim()) { toast.error('Indica la etiqueta en los nodos de etiqueta'); return; }
            if (s.actionType === 'condition' && !(s.actionValue || '').split(':')[1]?.trim()) { toast.error('Indica la etiqueta de la condición'); return; }
            if (s.actionType === 'webhook' && !/^https?:\/\//i.test((s.actionValue || '').trim())) { toast.error('El nodo Webhook necesita una URL http(s)'); return; }
        }
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

    // Menú para insertar un nodo en una posición dada.
    const AddNodeMenu: React.FC<{ at: number }> = ({ at }) => (
        <div className="flex flex-col items-center">
            <div className="w-px h-4 bg-gray-200" />
            {addMenuAt === at ? (
                <div className="bg-white border border-gray-200 rounded-xl shadow-lg p-1.5 flex flex-wrap gap-1 justify-center max-w-md">
                    {NODE_ORDER.map((t) => {
                        const m = NODE_META[t];
                        return (
                            <button key={t} type="button" onClick={() => insertStep(at, t)}
                                className={`flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-xs font-bold ${m.color} hover:opacity-80`}>
                                <m.icon className="w-3.5 h-3.5" /> {m.label}
                            </button>
                        );
                    })}
                    <button type="button" onClick={() => setAddMenuAt(null)} className="p-1.5 text-gray-400 hover:text-gray-600"><X className="w-4 h-4" /></button>
                </div>
            ) : (
                <button type="button" onClick={() => setAddMenuAt(at)} className="w-7 h-7 rounded-full bg-white border-2 border-dashed border-gray-300 text-gray-400 hover:border-rotary-blue hover:text-rotary-blue flex items-center justify-center" title="Agregar nodo">
                    <Plus className="w-4 h-4" />
                </button>
            )}
            <div className="w-px h-4 bg-gray-200" />
        </div>
    );

    return (
        <div>
            <div className="flex justify-between items-center mb-4">
                <p className="text-sm text-gray-500">Flujos que se ejecutan solos cuando un contacto recibe una etiqueta: envía correos, espera, aplica/quita etiquetas y evalúa condiciones.</p>
                <button onClick={() => openModal()} className="flex items-center gap-2 bg-rotary-blue text-white px-4 py-2 rounded-lg hover:bg-sky-800 transition-all font-bold text-sm shrink-0">
                    <Plus className="w-4 h-4" /> Nueva Automatización
                </button>
            </div>

            <div className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden">
                <table className="w-full text-left">
                    <thead className="bg-gray-50 border-b border-gray-100">
                        <tr>
                            <th className="px-6 py-4 text-xs font-semibold text-gray-400 uppercase tracking-wider">Automatización</th>
                            <th className="px-6 py-4 text-xs font-semibold text-gray-400 uppercase tracking-wider">Disparador</th>
                            <th className="px-6 py-4 text-xs font-semibold text-gray-400 uppercase tracking-wider">Nodos</th>
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
                                <td className="px-6 py-4 text-sm text-gray-600"><span className="inline-flex items-center gap-1"><Workflow className="w-3 h-3" /> {a._count?.steps ?? a.steps?.length ?? 0}</span></td>
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
                    <div className="bg-white rounded-2xl shadow-xl w-full max-w-2xl overflow-hidden flex flex-col max-h-[92vh]">
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
                                    <datalist id="em-tags">{tags.map((t) => <option key={t} value={t} />)}</datalist>
                                </div>
                            </div>

                            {/* Constructor visual de nodos */}
                            <div>
                                <label className="block text-sm font-bold text-gray-700 mb-3">Flujo</label>
                                <div className="flex flex-col items-center">
                                    {/* Disparador */}
                                    <div className="w-full max-w-md border-2 border-rose-200 bg-rose-50 rounded-xl px-4 py-3 flex items-center gap-2">
                                        <div className="w-8 h-8 rounded-lg bg-rose-100 text-rose-600 flex items-center justify-center shrink-0"><Zap className="w-4 h-4" /></div>
                                        <div className="min-w-0">
                                            <p className="text-xs font-black text-rose-700 uppercase tracking-wider">Disparador</p>
                                            <p className="text-sm text-gray-600 truncate">Contacto con la etiqueta <strong>{triggerTag || '—'}</strong></p>
                                        </div>
                                    </div>

                                    {steps.map((s, i) => {
                                        const m = NODE_META[s.actionType];
                                        const condOp = (s.actionValue || 'has_tag:').split(':')[0];
                                        const condTag = (s.actionValue || '').split(':').slice(1).join(':');
                                        return (
                                            <React.Fragment key={i}>
                                                <AddNodeMenu at={i} />
                                                <div className={`w-full max-w-md border-2 ${m.ring} bg-white rounded-xl p-3.5`}>
                                                    <div className="flex items-center justify-between mb-2">
                                                        <span className={`flex items-center gap-1.5 text-xs font-black uppercase tracking-wider px-2 py-0.5 rounded-md ${m.color}`}><m.icon className="w-3.5 h-3.5" /> {m.label}</span>
                                                        <div className="flex items-center gap-0.5">
                                                            <button type="button" onClick={() => moveStep(i, i - 1)} className="p-1 text-gray-300 hover:text-gray-600"><ChevronUp className="w-3.5 h-3.5" /></button>
                                                            <button type="button" onClick={() => moveStep(i, i + 1)} className="p-1 text-gray-300 hover:text-gray-600"><ChevronDown className="w-3.5 h-3.5" /></button>
                                                            {steps.length > 1 && <button type="button" onClick={() => removeStep(i)} className="p-1 text-gray-300 hover:text-rose-500"><Trash2 className="w-3.5 h-3.5" /></button>}
                                                        </div>
                                                    </div>

                                                    {/* Espera previa (excepto 'wait' que ES la espera, y el marcador 'end_condition') */}
                                                    {s.actionType !== 'wait' && s.actionType !== 'end_condition' && (
                                                        <div className="flex items-center gap-2 mb-2 text-xs text-gray-500">
                                                            <Clock className="w-3.5 h-3.5 text-violet-400" /> Esperar
                                                            <input type="number" min={0} className="w-16 px-2 py-1 border border-gray-200 rounded-lg outline-none focus:ring-2 focus:ring-rotary-blue" value={s.delayDays} onChange={(e) => updateStep(i, { delayDays: Math.max(0, parseInt(e.target.value, 10) || 0) })} />
                                                            día(s) {i === 0 ? 'desde la inscripción' : 'desde el nodo anterior'}
                                                        </div>
                                                    )}

                                                    {s.actionType === 'email' && (
                                                        <>
                                                            <input type="text" className="w-full px-3 py-2 border border-gray-200 rounded-lg outline-none focus:ring-2 focus:ring-rotary-blue mb-2 text-sm" value={s.subject} onChange={(e) => updateStep(i, { subject: e.target.value })} placeholder="Asunto del correo" />
                                                            <textarea rows={3} className="w-full px-3 py-2 border border-gray-200 rounded-lg outline-none focus:ring-2 focus:ring-rotary-blue font-mono text-xs" value={s.content} onChange={(e) => updateStep(i, { content: e.target.value })} placeholder="Contenido HTML del correo" />
                                                        </>
                                                    )}
                                                    {s.actionType === 'wait' && (
                                                        <div className="flex items-center gap-2 text-sm text-gray-600">
                                                            <Timer className="w-4 h-4 text-violet-500" /> Esperar
                                                            <input type="number" min={0} className="w-16 px-2 py-1 border border-gray-200 rounded-lg outline-none focus:ring-2 focus:ring-rotary-blue" value={s.delayDays} onChange={(e) => updateStep(i, { delayDays: Math.max(0, parseInt(e.target.value, 10) || 0) })} />
                                                            día(s) antes de continuar
                                                        </div>
                                                    )}
                                                    {(s.actionType === 'apply_tag' || s.actionType === 'remove_tag') && (
                                                        <input list="em-tags" className="w-full px-3 py-2 border border-gray-200 rounded-lg outline-none focus:ring-2 focus:ring-rotary-blue text-sm" value={s.actionValue || ''} onChange={(e) => updateStep(i, { actionValue: e.target.value })} placeholder="Etiqueta" />
                                                    )}
                                                    {s.actionType === 'condition' && (
                                                        <div className="space-y-2">
                                                            <div className="flex gap-2">
                                                                <select className="px-2 py-2 border border-gray-200 rounded-lg text-sm bg-white" value={condOp} onChange={(e) => updateStep(i, { actionValue: `${e.target.value}:${condTag}` })}>
                                                                    <option value="has_tag">Tiene la etiqueta</option>
                                                                    <option value="not_tag">No tiene la etiqueta</option>
                                                                </select>
                                                                <input list="em-tags" className="flex-1 px-3 py-2 border border-gray-200 rounded-lg outline-none focus:ring-2 focus:ring-rotary-blue text-sm" value={condTag} onChange={(e) => updateStep(i, { actionValue: `${condOp}:${e.target.value}` })} placeholder="Etiqueta" />
                                                            </div>
                                                            <p className="text-[11px] text-amber-600">Si se cumple, ejecuta los nodos hasta "Fin de condición"; si no, los salta. (Sin un nodo "Fin de condición" después, el contacto sale del flujo cuando no se cumple.)</p>
                                                        </div>
                                                    )}
                                                    {s.actionType === 'end_condition' && (
                                                        <p className="text-xs text-gray-500 flex items-center gap-1.5"><Flag className="w-3.5 h-3.5 text-amber-600" /> Marca el fin del bloque de la condición anterior.</p>
                                                    )}
                                                    {s.actionType === 'notify' && (
                                                        <input type="email" className="w-full px-3 py-2 border border-gray-200 rounded-lg outline-none focus:ring-2 focus:ring-rotary-blue text-sm" value={s.actionValue || ''} onChange={(e) => updateStep(i, { actionValue: e.target.value })} placeholder="Correo a notificar (vacío = administradores del sitio)" />
                                                    )}
                                                    {s.actionType === 'webhook' && (
                                                        <input type="url" className="w-full px-3 py-2 border border-gray-200 rounded-lg outline-none focus:ring-2 focus:ring-rotary-blue text-sm font-mono" value={s.actionValue || ''} onChange={(e) => updateStep(i, { actionValue: e.target.value })} placeholder="https://tu-endpoint.com/webhook" />
                                                    )}
                                                </div>
                                            </React.Fragment>
                                        );
                                    })}
                                    <AddNodeMenu at={steps.length} />
                                    <div className="text-[11px] text-gray-400 mt-1">Fin del flujo</div>
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
