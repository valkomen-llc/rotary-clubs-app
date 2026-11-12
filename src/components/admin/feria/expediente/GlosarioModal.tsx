// v4.1324 — Glosario terminológico de la traducción de expedientes. Las
// equivalencias de fábrica (Áreas de Enfoque oficiales, «Club Rotario →
// Rotary Club»…) se ven siempre; el comité agrega o reemplaza las suyas, que
// mandan. Administrarlo exige el permiso de configuración (lo decide el
// servidor).
import { useEffect, useState } from 'react';
import { BookOpen, Loader2, Plus, Trash2, X } from 'lucide-react';
import { toast } from 'sonner';
import { dossierRequest } from '../../../../lib/projectDossier';

interface Entry { id?: string | null; source: string; target: string; kind: string; builtIn: boolean; note?: string | null }

const KIND_LABEL: Record<string, string> = { term: 'Término', area: 'Área de enfoque', option: 'Opción de formulario' };

const GlosarioModal = ({ eventId, canManage, onClose }: { eventId: string; canManage: boolean; onClose: () => void }) => {
    const [entries, setEntries] = useState<Entry[] | null>(null);
    const [form, setForm] = useState({ source: '', target: '', kind: 'term', note: '' });
    const [busy, setBusy] = useState(false);
    const [filter, setFilter] = useState('');

    useEffect(() => {
        dossierRequest<{ entries: Entry[] }>('/expedientes/glosario', eventId)
            .then(d => setEntries(d.entries))
            .catch(e => { toast.error(e?.message || 'No se pudo cargar el glosario'); setEntries([]); });
    }, [eventId]);

    const add = async () => {
        if (!form.source.trim() || !form.target.trim()) return;
        setBusy(true);
        try {
            const d = await dossierRequest<{ entries: Entry[] }>('/expedientes/glosario', eventId, { method: 'POST', body: form });
            setEntries(d.entries); setForm({ source: '', target: '', kind: 'term', note: '' });
            toast.success('Equivalencia guardada: se usará en las próximas traducciones.');
        } catch (e: any) { toast.error(e?.message); } finally { setBusy(false); }
    };
    const remove = async (id: string) => {
        if (!window.confirm('¿Quitar esta equivalencia del glosario?')) return;
        try {
            const d = await dossierRequest<{ entries: Entry[] }>(`/expedientes/glosario/${id}`, eventId, { method: 'DELETE' });
            setEntries(d.entries);
        } catch (e: any) { toast.error(e?.message); }
    };

    const f = filter.trim().toLowerCase();
    const shown = (entries || []).filter(e => !f || e.source.toLowerCase().includes(f) || e.target.toLowerCase().includes(f));

    return (
        <div className="fixed inset-0 z-[70] flex items-end justify-center bg-slate-900/50 p-0 sm:items-center sm:p-4" onClick={onClose}>
            <div role="dialog" aria-label="Glosario de traducción" className="flex max-h-[92vh] w-full max-w-2xl flex-col overflow-hidden rounded-t-2xl bg-white shadow-2xl sm:rounded-2xl" onClick={e => e.stopPropagation()}>
                <header className="flex items-start justify-between gap-3 border-b border-slate-200 px-5 py-4">
                    <div>
                        <h3 className="inline-flex items-center gap-2 text-base font-bold text-slate-900"><BookOpen size={17} /> Glosario de traducción</h3>
                        <p className="mt-0.5 text-xs text-slate-500">Equivalencias que la IA debe usar siempre. Las áreas de enfoque y las opciones se traducen directamente con esta lista, sin IA.</p>
                    </div>
                    <button onClick={onClose} aria-label="Cerrar" className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-100"><X size={18} /></button>
                </header>
                {canManage && (
                    <div className="grid gap-2 border-b border-slate-100 bg-slate-50 px-5 py-3 sm:grid-cols-[1fr_1fr_auto]">
                        <input value={form.source} onChange={e => setForm(x => ({ ...x, source: e.target.value }))} placeholder="Español (ej. vereda)" aria-label="Término en español" className="rounded-lg border border-slate-300 px-3 py-2 text-sm" />
                        <input value={form.target} onChange={e => setForm(x => ({ ...x, target: e.target.value }))} placeholder="English (e.g. rural village)" aria-label="Equivalencia en inglés" className="rounded-lg border border-slate-300 px-3 py-2 text-sm" />
                        <button onClick={add} disabled={busy || !form.source.trim() || !form.target.trim()} className="inline-flex items-center justify-center gap-1.5 rounded-lg bg-[#17458F] px-3 py-2 text-xs font-bold text-white disabled:opacity-50">
                            {busy ? <Loader2 size={13} className="animate-spin" /> : <Plus size={13} />} Agregar
                        </button>
                        <select value={form.kind} onChange={e => setForm(x => ({ ...x, kind: e.target.value }))} aria-label="Tipo" className="rounded-lg border border-slate-300 px-2 py-2 text-xs sm:col-span-1">
                            {Object.entries(KIND_LABEL).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
                        </select>
                        <input value={form.note} onChange={e => setForm(x => ({ ...x, note: e.target.value }))} placeholder="Nota (opcional)" aria-label="Nota" className="rounded-lg border border-slate-300 px-3 py-2 text-xs sm:col-span-2" />
                    </div>
                )}
                <div className="px-5 pt-3">
                    <input value={filter} onChange={e => setFilter(e.target.value)} placeholder="Buscar en el glosario…" aria-label="Buscar en el glosario" className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm" />
                </div>
                <div className="flex-1 overflow-y-auto px-5 py-3">
                    {!entries ? <p className="py-6 text-center text-sm text-slate-500"><Loader2 size={16} className="mr-2 inline animate-spin" /> Cargando…</p> : (
                        <table className="w-full text-sm">
                            <thead><tr className="text-left text-[11px] uppercase tracking-wide text-slate-500"><th className="py-1.5">Español</th><th className="py-1.5">English</th><th className="py-1.5">Origen</th><th /></tr></thead>
                            <tbody>
                                {shown.map(e => (
                                    <tr key={`${e.source}-${e.id || 'b'}`} className="border-t border-slate-100">
                                        <td className="py-1.5 pr-2 text-slate-800">{e.source}</td>
                                        <td className="py-1.5 pr-2 font-medium text-slate-900">{e.target}</td>
                                        <td className="py-1.5 pr-2 text-[11px] text-slate-500">{e.builtIn ? 'De fábrica' : 'Del comité'} · {KIND_LABEL[e.kind] || e.kind}</td>
                                        <td className="py-1.5 text-right">{canManage && !e.builtIn && e.id && <button onClick={() => remove(e.id!)} aria-label={`Quitar ${e.source}`} className="rounded p-1 text-slate-400 hover:bg-red-50 hover:text-red-600"><Trash2 size={14} /></button>}</td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    )}
                </div>
            </div>
        </div>
    );
};

export default GlosarioModal;
