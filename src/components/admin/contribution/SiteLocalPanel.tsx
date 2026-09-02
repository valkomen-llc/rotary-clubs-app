import React, { useEffect, useRef, useState } from 'react';
import { toast } from 'sonner';
import { Save, Plus, Upload, X, Image as ImageIcon } from 'lucide-react';
import MediaPicker from '../content-studio/MediaPicker';
import { uploadMediaFiles, IMAGE_ACCEPT } from '../../../lib/mediaUpload';
import type { ContributionCenter } from '../../../lib/contributionSpec';

const API = import.meta.env.VITE_API_URL || '/api';

const field = 'mt-1.5 w-full px-4 py-3 bg-gray-50 border-2 border-transparent rounded-xl focus:border-rotary-blue/30 focus:bg-white outline-none transition-all font-medium text-sm';
const lbl = 'text-xs font-bold text-gray-400 uppercase tracking-wider';

const authHeaders = () => ({
    'Content-Type': 'application/json',
    Authorization: `Bearer ${localStorage.getItem('rotary_token')}`,
});

/** Lo que la campaña le deja tocar a un sitio: la OVERRIDE_WHITELIST del
 *  servidor. La pantalla sólo REFLEJA esa frontera — quien la impone es
 *  `sanitizeOverride`, porque esconder un control no protege un endpoint. */
export interface SiteOverride {
    contact?: { name?: string; phone?: string; email?: string };
    localNote?: string;
    qrImage?: string;
}

export interface SiteLocalData {
    override?: SiteOverride;
    centers?: Partial<ContributionCenter>[];
}

// ════════════════════════════════════════════════════════════════════
// Lo que ESTE sitio le agrega a una campaña — v4.987
//
// ⚠️ NO ES UNA PANTALLA: es una sección de «Campañas de Contribución», la
// misma para el operador y para un sitio. Vivió como pantalla propia hasta
// v4.986 (la vieja «Maneras de Contribuir» rebautizada) y ése fue el error:
// una segunda pantalla para el mismo módulo se queda atrás en cada mejora de
// la primera. Acá abajo no hay ninguna decisión de alcance — se le entrega la
// campaña y la información local que el servidor ya resolvió.
//
// Lo local se SUMA a la campaña, no la reemplaza: el contenido lo define quien
// es dueño de la campaña, y lo que cada sitio aporta es su contacto, su nota,
// su QR y sus centros de acopio.
// ════════════════════════════════════════════════════════════════════
const SiteLocalPanel: React.FC<{ campaignId: string; initial: SiteLocalData | null }> = ({ campaignId, initial }) => {
    const [override, setOverride] = useState<SiteOverride>({});
    const [overrideDirty, setOverrideDirty] = useState(false);
    const [savingOverride, setSavingOverride] = useState(false);

    const [centers, setCenters] = useState<Partial<ContributionCenter>[]>([]);
    const [centersDirty, setCentersDirty] = useState(false);
    const [savingCenters, setSavingCenters] = useState(false);

    const [pickerOpen, setPickerOpen] = useState(false);
    const [uploading, setUploading] = useState(false);
    const fileRef = useRef<HTMLInputElement>(null);

    // Cambiar de campaña descarta lo que hubiera en pantalla: la información
    // local es POR CAMPAÑA, y llevarse el borrador de una a otra lo guardaría
    // en la campaña equivocada — el error caro de esta sección.
    useEffect(() => {
        setOverride(initial?.override || {});
        setCenters(Array.isArray(initial?.centers) ? initial!.centers! : []);
        setOverrideDirty(false);
        setCentersDirty(false);
    }, [campaignId, initial]);

    const saveOverride = async () => {
        setSavingOverride(true);
        try {
            const r = await fetch(`${API}/contribution-campaigns/site/override`, {
                method: 'PUT', headers: authHeaders(),
                body: JSON.stringify({ campaignId, content: override }),
            });
            if (!r.ok) throw new Error();
            setOverrideDirty(false);
            toast.success('Información local guardada');
        } catch { toast.error('No se pudo guardar la información local'); }
        finally { setSavingOverride(false); }
    };

    const saveCenters = async () => {
        setSavingCenters(true);
        try {
            const r = await fetch(`${API}/contribution-campaigns/site/centers`, {
                method: 'PUT', headers: authHeaders(),
                body: JSON.stringify({ campaignId, centers }),
            });
            if (!r.ok) throw new Error();
            const d = await r.json();
            // Lo que no se pudo interpretar se DICE, con su motivo: un
            // descarte silencioso deja adivinando cuál centro no entró.
            if (Array.isArray(d?.skipped) && d.skipped.length > 0) {
                toast.warning(`${d.skipped.length} centro(s) quedaron fuera: ${d.skipped.map((s: any) => s.reason || 'dato incompleto').join(', ')}`);
            }
            setCenters(Array.isArray(d?.centers) ? d.centers : centers);
            setCentersDirty(false);
            toast.success('Centros del club guardados');
        } catch { toast.error('No se pudieron guardar los centros'); }
        finally { setSavingCenters(false); }
    };

    // Las DOS vías de toda casilla de imagen (regla v4.700): subir y elegir.
    const onFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
        const files = Array.from(e.target.files || []);
        e.target.value = '';
        if (files.length === 0) return;
        setUploading(true);
        try {
            const { uploaded, failed } = await uploadMediaFiles(files);
            failed.forEach(f => toast.error(`${f.name}: ${f.reason}`));
            if (uploaded[0]?.url) { setOverride(o => ({ ...o, qrImage: uploaded[0].url })); setOverrideDirty(true); }
        } finally { setUploading(false); }
    };

    const patchCenter = (i: number, patch: Partial<ContributionCenter>) => {
        setCenters(cs => cs.map((x, j) => (j === i ? { ...x, ...patch } : x)));
        setCentersDirty(true);
    };

    return (
        <div className="space-y-6">
            <input ref={fileRef} type="file" accept={IMAGE_ACCEPT} className="hidden" onChange={onFile} />
            <MediaPicker isOpen={pickerOpen} onClose={() => setPickerOpen(false)} maxSelection={1}
                onSelect={(items: any) => {
                    const url = Array.isArray(items) ? items[0]?.url : (items as any)?.url;
                    if (url) { setOverride(o => ({ ...o, qrImage: url })); setOverrideDirty(true); }
                    setPickerOpen(false);
                }} />

            <div className="grid sm:grid-cols-3 gap-3">
                <div>
                    <label className={lbl}>Contacto (nombre)</label>
                    <input className={field} value={override.contact?.name || ''}
                        onChange={e => { setOverride({ ...override, contact: { ...override.contact, name: e.target.value } }); setOverrideDirty(true); }} />
                </div>
                <div>
                    <label className={lbl}>Teléfono</label>
                    <input className={field} value={override.contact?.phone || ''}
                        onChange={e => { setOverride({ ...override, contact: { ...override.contact, phone: e.target.value } }); setOverrideDirty(true); }} />
                </div>
                <div>
                    <label className={lbl}>Correo</label>
                    <input className={field} type="email" value={override.contact?.email || ''}
                        onChange={e => { setOverride({ ...override, contact: { ...override.contact, email: e.target.value } }); setOverrideDirty(true); }} />
                </div>
            </div>

            <div>
                <label className={lbl}>Nota local (opcional)</label>
                <textarea rows={2} className={`${field} resize-none`} placeholder="Ej: El club recibe donaciones en su sede los sábados."
                    value={override.localNote || ''}
                    onChange={e => { setOverride({ ...override, localNote: e.target.value }); setOverrideDirty(true); }} />
            </div>

            <div>
                <label className={lbl}>Código QR local (opcional)</label>
                <div className="flex items-center gap-2 mt-1.5">
                    <input className={`${field} mt-0 flex-1 min-w-0`} placeholder="URL de la imagen del QR" value={override.qrImage || ''}
                        onChange={e => { setOverride({ ...override, qrImage: e.target.value }); setOverrideDirty(true); }} />
                    <button type="button" onClick={() => fileRef.current?.click()} disabled={uploading}
                        className="flex items-center gap-1.5 px-3 py-3 rounded-xl text-sm font-bold text-gray-600 bg-gray-50 hover:bg-gray-100 disabled:opacity-50">
                        <Upload className="w-4 h-4" /> Subir
                    </button>
                    <button type="button" onClick={() => setPickerOpen(true)}
                        className="flex items-center gap-1.5 px-3 py-3 rounded-xl text-sm font-bold text-gray-600 bg-gray-50 hover:bg-gray-100">
                        <ImageIcon className="w-4 h-4" /> Biblioteca
                    </button>
                </div>
                {override.qrImage && <img src={override.qrImage} alt="QR local" className="mt-3 w-24 h-24 object-contain border border-gray-100 rounded-xl p-1" />}
            </div>

            <button onClick={saveOverride} disabled={savingOverride || !overrideDirty}
                className={`flex items-center gap-2 px-5 py-2.5 rounded-xl font-bold text-sm transition-all ${overrideDirty ? 'bg-rotary-blue text-white hover:bg-sky-800 shadow-lg' : 'bg-gray-100 text-gray-400 cursor-not-allowed'}`}>
                <Save className="w-4 h-4" /> {savingOverride ? 'Guardando…' : 'Guardar información local'}
            </button>

            <div className="pt-6 border-t border-gray-100">
                <div className="flex items-center justify-between gap-3 mb-4">
                    <p className="text-sm font-bold text-gray-700">Centros de acopio de tu sitio</p>
                    <button onClick={saveCenters} disabled={savingCenters || !centersDirty}
                        className={`flex items-center gap-2 px-4 py-2 rounded-xl font-bold text-sm transition-all ${centersDirty ? 'bg-rotary-blue text-white hover:bg-sky-800 shadow-lg' : 'bg-gray-100 text-gray-400 cursor-not-allowed'}`}>
                        <Save className="w-4 h-4" /> {savingCenters ? 'Guardando…' : 'Guardar centros'}
                    </button>
                </div>
                <div className="space-y-3">
                    {centers.map((ct, i) => (
                        <div key={ct.id || i} className="border border-gray-100 rounded-2xl p-4 space-y-3">
                            <div className="flex items-center justify-between gap-2">
                                <label className="flex items-center gap-2 text-xs font-bold text-gray-500 cursor-pointer">
                                    <input type="checkbox" checked={ct.active !== false} className="w-4 h-4 accent-rotary-blue"
                                        onChange={e => patchCenter(i, { active: e.target.checked })} />
                                    Activo
                                </label>
                                <button type="button" aria-label={`Quitar centro ${ct.city || i + 1}`}
                                    onClick={() => { setCenters(centers.filter((_, j) => j !== i)); setCentersDirty(true); }}
                                    className="p-1.5 rounded-lg text-gray-400 hover:text-red-500 hover:bg-red-50"><X className="w-4 h-4" /></button>
                            </div>
                            <div className="grid sm:grid-cols-2 gap-3">
                                <input className={field} placeholder="Ciudad *" value={ct.city || ''} onChange={e => patchCenter(i, { city: e.target.value })} />
                                <input className={field} placeholder="Dirección *" value={ct.address || ''} onChange={e => patchCenter(i, { address: e.target.value })} />
                                <input className={field} placeholder="Horario (opcional)" value={ct.schedule || ''} onChange={e => patchCenter(i, { schedule: e.target.value })} />
                                <input className={field} placeholder="Teléfono (opcional)" value={ct.phone || ''} onChange={e => patchCenter(i, { phone: e.target.value })} />
                            </div>
                        </div>
                    ))}
                    <button type="button"
                        onClick={() => { setCenters([...centers, { id: `center-${Date.now()}`, city: '', address: '', schedule: '', phone: '', active: true }]); setCentersDirty(true); }}
                        className="flex items-center gap-2 px-4 py-2.5 rounded-xl text-sm font-bold text-rotary-blue bg-rotary-blue/5 hover:bg-rotary-blue/10 transition">
                        <Plus className="w-4 h-4" /> Agregar centro
                    </button>
                </div>
            </div>
        </div>
    );
};

export default SiteLocalPanel;
