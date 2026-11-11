import { useEffect, useState } from 'react';
import { acApi } from './agentCenterApi';
import type { Meta, Site } from './agentCenterApi';

/** Buscador de sitios (por nombre y tipo). Devuelve el id elegido. */
export default function SitePicker({ meta, value, onChange, idPrefix, fixedType }: { meta: Meta; value: string; onChange: (id: string, site: Site | null) => void; idPrefix: string; fixedType?: string }) {
    const [q, setQ] = useState('');
    const [type, setType] = useState(fixedType || '');
    const [sites, setSites] = useState<Site[]>([]);

    useEffect(() => {
        const t = setTimeout(() => {
            const p = new URLSearchParams(); if (q) p.set('q', q); if (type) p.set('type', type);
            acApi<{ sites: Site[] }>(`/sites?${p.toString()}`).then(d => setSites(d.sites)).catch(() => setSites([]));
        }, 250);
        return () => clearTimeout(t);
    }, [q, type]);

    return (
        <div className="space-y-2">
            <div className="flex gap-2">
                {!fixedType && (
                    <select id={`${idPrefix}-type`} className="px-3 py-2 rounded-xl border border-gray-200 text-sm bg-white" value={type} onChange={e => setType(e.target.value)}>
                        <option value="">Todos los tipos</option>
                        {meta.siteTypes.map(s => <option key={s.type} value={s.type}>{s.label}</option>)}
                    </select>
                )}
                <input id={`${idPrefix}-q`} className="flex-1 min-w-0 px-3 py-2 rounded-xl border border-gray-200 text-sm" placeholder="Buscar sitio" value={q} onChange={e => setQ(e.target.value)} />
            </div>
            <div className="max-h-44 overflow-y-auto border border-gray-100 rounded-xl divide-y divide-gray-50">
                {sites.map(s => (
                    <label key={s.id} className={`flex items-center gap-2 px-3 py-2 text-sm cursor-pointer ${value === s.id ? 'bg-blue-50' : 'hover:bg-gray-50'}`}>
                        <input type="radio" name={`${idPrefix}-site`} checked={value === s.id} onChange={() => onChange(s.id, s)} />
                        <span className="flex-1 truncate">{s.name}</span>
                        <span className="text-[11px] text-gray-400">{meta.siteTypes.find(t => t.type === s.type)?.label || s.type}</span>
                    </label>
                ))}
                {sites.length === 0 && <p className="px-3 py-3 text-xs text-gray-400">Sin resultados.</p>}
            </div>
        </div>
    );
}
