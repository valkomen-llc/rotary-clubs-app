// ════════════════════════════════════════════════════════════════════
// Director Creativo IA — las piezas de referencia
// v4.838.0
//
// La pantalla que el pedido describe: subir las piezas que ya existen para que
// las nuevas sigan sus patrones. Se suben, se analizan y lo que sale —el Design
// DNA— queda A LA VISTA.
//
// ── POR QUÉ SE MUESTRA EL DNA, Y NO SÓLO «LISTO» ────────────────────
//
// Un estilo que se aplica sin decir QUÉ tomó de las referencias es una caja
// negra: cuando la pieza no se parece, no hay dónde mirar. Acá se ven la
// paleta, el carácter de la letra, el recorte de la fotografía y la forma del
// pie, que son exactamente las cinco cosas que el perfil puede modular. Si algo
// falta —porque no hubo modelo de visión, porque una referencia no se pudo
// leer— se dice con su motivo.
//
// ── LAS DOS VÍAS, SIEMPRE ───────────────────────────────────────────
//
// Subir un archivo y elegir de la Biblioteca (regla de v4.700). Y VARIAS de una
// vez: un estilo se hace con dos a cinco piezas, y elegirlas de a una es
// repetir el mismo gesto cinco veces.
// ════════════════════════════════════════════════════════════════════

import React, { useCallback, useEffect, useState } from 'react';
import { toast } from 'sonner';
import { X, Upload, Images, Trash2, Sparkles, Loader2, AlertTriangle, Info } from 'lucide-react';
import MediaPicker from './MediaPicker';
import { uploadMediaFiles } from '../../../lib/mediaUpload';

const API = (import.meta as any).env?.VITE_API_URL || '/api';
const auth = () => ({ Authorization: `Bearer ${localStorage.getItem('rotary_token')}` });

const lbl = 'text-[10px] font-black text-gray-400 uppercase tracking-[0.18em] mb-2 block';
const field = 'w-full px-3 py-2.5 rounded-xl border-2 border-gray-100 text-sm font-medium focus:border-blue-300 focus:outline-none';

export interface CreativeProfile {
    id: string; name: string; version: number; active: boolean;
    clubId: string | null; shared?: boolean;
    dna: any; notes: string[];
    analyzedAt?: string | null;
    references?: Array<{ id: string; url: string; label?: string | null; measured?: any; described?: any; notes?: string[] }>;
}

interface Ref { url: string; mediaId?: string | null; label?: string | null }

/** Cuántas hacen falta. Lo declara el servidor y llega en la respuesta del
 *  listado; esto es el respaldo para pintar antes de que llegue. */
const MIN_REFS = 2, MAX_REFS = 8;

// ─── El DNA, a la vista ────────────────────────────────────────────────

const CARACTERES: Record<string, string> = {
    'condensada-pesada': 'Condensada y pesada',
    'grotesca-normal': 'Grotesca normal',
    'serif-institucional': 'Serif institucional',
};
const PIES: Record<string, string> = { curvo: 'Curvo', recto: 'Recto', sin: 'Sin curva' };
const MASCARAS: Record<string, string> = {
    ninguna: 'Borde recto', sweep: 'Curva hacia la derecha', sweepLeft: 'Curva hacia la izquierda',
    dome: 'Arco', arc: 'Arco superior', wave: 'Onda', ribbon: 'Cinta', ellipse: 'Óvalo',
};

const DnaResumen: React.FC<{ dna: any }> = ({ dna }) => {
    const d = dna?.derived;
    const m = dna?.measured;
    if (!d) return null;
    const dato = (t: string, v: string) => (
        <div>
            <span className={lbl}>{t}</span>
            <p className="text-sm font-bold text-gray-700 -mt-1">{v}</p>
        </div>
    );
    return (
        <div className="rounded-xl bg-gray-50 border border-gray-100 p-4 space-y-4">
            <div>
                <span className={lbl}>Paleta</span>
                <div className="flex flex-wrap gap-2 -mt-1">
                    {(m?.paleta || []).map((c: any) => (
                        <div key={c.hex} className="flex items-center gap-1.5 bg-white rounded-lg border border-gray-200 pl-1.5 pr-2 py-1">
                            <span className="w-5 h-5 rounded" style={{ background: c.hex }} />
                            <span className="text-[10px] font-bold text-gray-500" data-no-translate>
                                {c.hex} · {Math.round(c.cobertura * 100)}%
                            </span>
                        </div>
                    ))}
                </div>
            </div>
            <div className="grid grid-cols-2 gap-4">
                {dato('Titulares', CARACTERES[d.fontTitular === 'condensed' ? 'condensada-pesada' : d.fontTitular === 'serif' ? 'serif-institucional' : 'grotesca-normal'])}
                {dato('Borde de la foto', MASCARAS[d.mascaraFoto] || d.mascaraFoto)}
                {dato('Pie', PIES[d.pie] || d.pie)}
                {dato('Tamaño del titular', `${Math.round((d.escalaTitular || 1) * 100)} % de lo normal`)}
            </div>
            {/* ── EL CONTEXTO Y EL PROMPT ──────────────────────────
                Lo que el pedido llama «una descripción como un contexto y a la
                vez un prompt». El contexto se lee; el prompt se copia a un
                generador de imágenes o al campo de dirección de arte del Motor
                de Composición. Los dos se guardan CON la versión del perfil, así
                que una pieza generada hace un mes se explica con el mismo texto
                que la generó. */}
            {d.contexto && (
                <div>
                    <span className={lbl}>Cómo se ven estas piezas</span>
                    <p className="text-xs leading-relaxed text-gray-600 -mt-1">{d.contexto}</p>
                </div>
            )}
            {d.stylePrompt && (
                <div>
                    <div className="flex items-center justify-between mb-1">
                        <span className={`${lbl} mb-0`}>Prompt para generar imágenes</span>
                        <button type="button"
                            onClick={() => { navigator.clipboard?.writeText(d.stylePrompt); toast.success('Prompt copiado.'); }}
                            className="text-[10px] font-black text-blue-600 hover:text-blue-800 uppercase tracking-wider">
                            Copiar
                        </button>
                    </div>
                    <p className="text-[11px] leading-relaxed text-gray-500 bg-white border border-gray-200 rounded-lg p-2.5 font-mono" data-no-translate>
                        {d.stylePrompt}
                    </p>
                    {/* Va en inglés a propósito y hay que decirlo: los motores de
                        imagen responden mejor, y quien lo copie tiene que saber
                        que no es un descuido. */}
                    <p className="text-[10px] text-gray-400 mt-1.5">
                        En inglés porque los generadores de imagen responden mejor. Ya lleva la instrucción de
                        no dibujar texto ni logotipos: esos se componen encima.
                    </p>
                </div>
            )}
            {d.negativePrompt && (
                <div>
                    <div className="flex items-center justify-between mb-1">
                        <span className={`${lbl} mb-0`}>Lo que no debe dibujar</span>
                        <button type="button"
                            onClick={() => { navigator.clipboard?.writeText(d.negativePrompt); toast.success('Copiado.'); }}
                            className="text-[10px] font-black text-blue-600 hover:text-blue-800 uppercase tracking-wider">
                            Copiar
                        </button>
                    </div>
                    <p className="text-[11px] leading-relaxed text-gray-500 bg-white border border-gray-200 rounded-lg p-2.5 font-mono" data-no-translate>
                        {d.negativePrompt}
                    </p>
                </div>
            )}
            {!d.brand?.accent && (
                // Un acento vacío NO es un fallo: la referencia no tiene un
                // color de acento y entonces manda el de la campaña. Decirlo
                // evita que alguien busque por qué «no tomó el color».
                <p className="text-[11px] text-gray-500 flex gap-1.5">
                    <Info className="w-3.5 h-3.5 shrink-0 mt-px" />
                    Las referencias no tienen un color de acento propio, así que se conserva el de la campaña.
                </p>
            )}
        </div>
    );
};

// ─── El diálogo ────────────────────────────────────────────────────────

const CreativeProfileDialog: React.FC<{
    open: boolean;
    profile: CreativeProfile | null;
    onClose: () => void;
    onSaved: (p: CreativeProfile) => void;
}> = ({ open, profile, onClose, onSaved }) => {
    const [name, setName] = useState('');
    const [refs, setRefs] = useState<Ref[]>([]);
    const [picker, setPicker] = useState(false);
    const [subiendo, setSubiendo] = useState(false);
    const [analizando, setAnalizando] = useState(false);
    const [notas, setNotas] = useState<string[]>([]);
    const [dna, setDna] = useState<any>(null);
    const [error, setError] = useState<string | null>(null);

    // Al abrir se carga la ficha COMPLETA: el listado no trae las referencias
    // —son varias filas con sus mediciones dentro— y sin ellas el diálogo se
    // abriría vacío sobre un perfil que sí las tiene.
    useEffect(() => {
        if (!open) return;
        setError(null);
        if (!profile) { setName(''); setRefs([]); setNotas([]); setDna(null); return; }
        setName(profile.name);
        setDna(profile.dna);
        setNotas(profile.notes || []);
        (async () => {
            try {
                const r = await fetch(`${API}/content-studio/creative-profiles/${profile.id}`, { headers: auth() });
                const j = await r.json();
                setRefs((j?.profile?.references || []).map((x: any) => ({ url: x.url, mediaId: x.mediaId, label: x.label })));
            } catch { setRefs([]); }
        })();
    }, [open, profile]);

    const agregar = useCallback((nuevas: Ref[]) => {
        setRefs(cur => {
            const juntas = [...cur];
            for (const n of nuevas) if (n.url && !juntas.some(x => x.url === n.url)) juntas.push(n);
            if (juntas.length > MAX_REFS) toast.warning(`Se toman las primeras ${MAX_REFS}: más allá de ahí el estilo ya no cambia.`);
            return juntas.slice(0, MAX_REFS);
        });
    }, []);

    const subir = useCallback(async (e: React.ChangeEvent<HTMLInputElement>) => {
        const files = Array.from(e.target.files || []);
        // El input se limpia SIEMPRE: sin esto, volver a elegir el mismo
        // archivo no dispara `change` y el botón parece roto (regla de v4.784).
        e.target.value = '';
        if (!files.length) return;
        setSubiendo(true);
        try {
            const { uploaded, failed } = await uploadMediaFiles(files.slice(0, MAX_REFS));
            if (failed.length) toast.error(`No se pudieron subir: ${failed.map(f => f.name).join(', ')}`);
            agregar(uploaded.map(u => ({ url: u.url, mediaId: u.id, label: u.filename })));
        } catch (err: any) {
            toast.error(err?.message || 'No se pudo subir la imagen.');
        } finally { setSubiendo(false); }
    }, [agregar]);

    const analizar = useCallback(async () => {
        setAnalizando(true); setError(null);
        try {
            const r = await fetch(`${API}/content-studio/creative-profiles`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json', ...auth() },
                body: JSON.stringify({ id: profile?.id, name, references: refs }),
            });
            const j = await r.json();
            if (!r.ok) {
                // El motivo del servidor se propaga TEXTUAL: «hacen falta dos»
                // sin decir por qué manda a adivinar.
                setError([j?.error, j?.reason].filter(Boolean).join(' '));
                setNotas(j?.notes || []);
                return;
            }
            setDna(j.profile.dna);
            setNotas(j.notes || []);
            toast.success(`Estilo analizado (versión ${j.profile.version}).`);
            onSaved(j.profile);
        } catch (err: any) {
            setError(err?.message || 'No se pudo analizar el estilo.');
        } finally { setAnalizando(false); }
    }, [name, refs, profile, onSaved]);

    if (!open) return null;
    const faltan = Math.max(0, MIN_REFS - refs.length);

    return (
        <div className="fixed inset-0 z-50 bg-black/40 flex items-start justify-center overflow-y-auto p-4 sm:p-8">
            <div className="bg-white rounded-2xl shadow-xl w-full max-w-3xl">
                <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100">
                    <div>
                        <h3 className="text-base font-black text-gray-800">Piezas de referencia</h3>
                        <p className="text-xs text-gray-500">
                            Subí las piezas que ya publicaron y las nuevas van a seguir sus patrones.
                        </p>
                    </div>
                    <button onClick={onClose} className="p-2 rounded-lg hover:bg-gray-100" aria-label="Cerrar">
                        <X className="w-4 h-4 text-gray-500" />
                    </button>
                </div>

                <div className="p-6 space-y-5">
                    <div>
                        <label className={lbl} htmlFor="estilo-nombre">Nombre del estilo</label>
                        <input id="estilo-nombre" className={field} value={name} maxLength={80}
                            onChange={e => setName(e.target.value)} placeholder="Papelería del Distrito 4281" />
                    </div>

                    <div>
                        <span className={lbl}>Piezas ({refs.length} de {MAX_REFS})</span>
                        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                            {refs.map(r => (
                                <div key={r.url} className="relative group rounded-xl overflow-hidden border-2 border-gray-100 aspect-[4/5] bg-gray-50">
                                    <img src={r.url} alt={r.label || 'Referencia'} className="w-full h-full object-cover" />
                                    <button
                                        onClick={() => setRefs(cur => cur.filter(x => x.url !== r.url))}
                                        className="absolute top-1.5 right-1.5 p-1.5 rounded-lg bg-white/90 opacity-0 group-hover:opacity-100 transition"
                                        aria-label={`Quitar ${r.label || 'referencia'}`}>
                                        <Trash2 className="w-3.5 h-3.5 text-red-600" />
                                    </button>
                                </div>
                            ))}
                            {/* Las DOS vías, siempre (v4.700). Y varias de una vez. */}
                            <label className="rounded-xl border-2 border-dashed border-gray-200 aspect-[4/5] flex flex-col items-center justify-center gap-1 cursor-pointer hover:border-blue-300 text-gray-400">
                                {subiendo ? <Loader2 className="w-5 h-5 animate-spin" /> : <Upload className="w-5 h-5" />}
                                <span className="text-[10px] font-black uppercase tracking-wider">Subir</span>
                                <input type="file" accept="image/*" multiple className="hidden" onChange={subir} />
                            </label>
                            <button onClick={() => setPicker(true)}
                                className="rounded-xl border-2 border-dashed border-gray-200 aspect-[4/5] flex flex-col items-center justify-center gap-1 hover:border-blue-300 text-gray-400">
                                <Images className="w-5 h-5" />
                                <span className="text-[10px] font-black uppercase tracking-wider">Biblioteca</span>
                            </button>
                        </div>
                        {faltan > 0 && (
                            <p className="mt-2 text-[11px] text-gray-500 flex gap-1.5">
                                <Info className="w-3.5 h-3.5 shrink-0 mt-px" />
                                Falta{faltan === 1 ? '' : 'n'} {faltan} pieza{faltan === 1 ? '' : 's'}. Con una sola no se puede
                                distinguir lo que es del estilo de lo que es de esa pieza en particular.
                            </p>
                        )}
                    </div>

                    {error && (
                        <div className="flex items-start gap-2 rounded-xl bg-red-50 border border-red-200 px-3 py-2 text-xs text-red-700">
                            <AlertTriangle className="w-4 h-4 shrink-0 mt-px" />
                            <span>{error}</span>
                        </div>
                    )}

                    {dna && <DnaResumen dna={dna} />}

                    {notas.length > 0 && (
                        <ul className="space-y-1">
                            {notas.map((n, i) => (
                                <li key={i} className="text-[11px] text-amber-700 flex gap-1.5">
                                    <AlertTriangle className="w-3.5 h-3.5 shrink-0 mt-px" />{n}
                                </li>
                            ))}
                        </ul>
                    )}
                </div>

                <div className="flex items-center justify-end gap-2 px-6 py-4 border-t border-gray-100">
                    <button onClick={onClose} className="px-4 py-2.5 rounded-xl text-sm font-bold text-gray-600 hover:bg-gray-100">
                        Cerrar
                    </button>
                    <button
                        onClick={analizar}
                        disabled={analizando || refs.length < MIN_REFS || !name.trim()}
                        className="px-5 py-2.5 rounded-xl text-sm font-black text-white bg-rotary-blue hover:bg-rotary-navy disabled:opacity-40 disabled:cursor-not-allowed flex items-center gap-2">
                        {analizando ? <Loader2 className="w-4 h-4 animate-spin" /> : <Sparkles className="w-4 h-4" />}
                        {profile ? 'Volver a analizar' : 'Analizar y guardar'}
                    </button>
                </div>

                {/* Volver a analizar crea una VERSIÓN nueva; no reescribe la
                    anterior. Se dice acá porque es lo que el usuario espera
                    saber justo antes de pulsar. */}
                {profile && (
                    <p className="px-6 pb-4 -mt-2 text-[11px] text-gray-500">
                        Volver a analizar guarda una versión nueva (sería la {(profile.version || 1) + 1}). Las piezas
                        que ya generaste no cambian.
                    </p>
                )}
            </div>

            <MediaPicker
                isOpen={picker}
                onClose={() => setPicker(false)}
                maxSelection={MAX_REFS}
                onSelect={items => {
                    agregar((items || []).map((i: any) => ({ url: i.url, mediaId: i.id, label: i.filename })));
                    setPicker(false);
                }}
            />
        </div>
    );
};

export default CreativeProfileDialog;
