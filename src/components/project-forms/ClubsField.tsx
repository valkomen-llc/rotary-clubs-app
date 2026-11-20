// ════════════════════════════════════════════════════════════════════
// Campo «clubs» de los formularios del proyecto (v4.1346)
//
// Varios clubes del Catálogo Maestro: chips con los elegidos y el selector
// ÚNICO de clubes (`ClubSelector`) para agregar otro. Se guarda la lista de
// NOMBRES —la ficha, el expediente, el Word y el PDF los leen tal cual—. No se
// escribe un club a mano: si no aparece, el selector dice a quién pedirlo.
//
// Pedido de Paula Cruz (Pereira del Café): su proyecto lo formulan cuatro
// clubes y la ficha sólo nombraba al que postuló.
// ════════════════════════════════════════════════════════════════════
import { useState } from 'react';
import { Plus, X } from 'lucide-react';
import ClubSelector from '../clubs/ClubSelector';
import { MAX_CLUBS_PER_FIELD } from '../../lib/projectForms';

const FAIR_DISTRICTS = [4271, 4281];

const ClubsField = ({ value, onChange, disabled }: { value: unknown; onChange: (v: string[]) => void; disabled: boolean }) => {
    const list = Array.isArray(value) ? value.map(v => String(v ?? '').trim()).filter(Boolean) : [];
    const [adding, setAdding] = useState(false);
    const [aviso, setAviso] = useState<string | null>(null);

    const quitar = (name: string) => onChange(list.filter(n => n !== name));
    const agregar = (name: string) => {
        if (list.some(n => n.toLowerCase() === name.toLowerCase())) { setAviso(`«${name}» ya está en la lista.`); return; }
        onChange([...list, name]);
        setAviso(null);
        setAdding(false);
    };

    return (
        <div data-clubs-field>
            {list.length > 0 ? (
                <ul className="flex flex-wrap gap-2" aria-label="Clubes participantes">
                    {list.map(n => (
                        <li key={n} className="inline-flex items-center gap-1.5 rounded-full border border-blue-200 bg-blue-50 py-1.5 pl-3 pr-1.5 text-[13px] font-semibold text-blue-900">
                            {n}
                            {!disabled && (
                                <button type="button" onClick={() => quitar(n)} aria-label={`Quitar ${n}`}
                                    className="rounded-full p-0.5 text-blue-700 hover:bg-blue-100">
                                    <X size={14} />
                                </button>
                            )}
                        </li>
                    ))}
                </ul>
            ) : (
                <p className="text-[13px] text-slate-500">{disabled ? 'Sin clubes participantes registrados.' : 'Todavía no has agregado clubes participantes.'}</p>
            )}

            {!disabled && list.length < MAX_CLUBS_PER_FIELD && (
                adding ? (
                    <div className="mt-3 rounded-xl border border-slate-200 bg-slate-50/60 p-3">
                        <ClubSelector value={null} label="" districts={FAIR_DISTRICTS} allowedDistricts={FAIR_DISTRICTS}
                            listClassName="max-h-60" onChange={c => { if (c) agregar(c.name); }} />
                        <button type="button" onClick={() => { setAdding(false); setAviso(null); }}
                            className="mt-2 text-xs font-semibold text-slate-500 hover:text-slate-700">Cancelar</button>
                    </div>
                ) : (
                    <button type="button" onClick={() => setAdding(true)}
                        className="mt-3 inline-flex items-center gap-1.5 rounded-xl border border-dashed border-blue-300 px-4 py-2 text-sm font-semibold text-blue-800 hover:bg-blue-50">
                        <Plus size={15} /> Agregar club participante
                    </button>
                )
            )}
            {aviso && <p role="status" className="mt-2 text-xs text-amber-700">{aviso}</p>}
        </div>
    );
};

export default ClubsField;
