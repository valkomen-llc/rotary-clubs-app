// v4.1324 — Cómo se LEE un valor del expediente: tablas, listas, enlaces y
// «No informado». En el ámbito del módulo (nunca dentro de otro componente).
import { ExternalLink } from 'lucide-react';
import type { DossierField } from '../../../../lib/projectDossier';
import { fmtMoney, isEmptyValue, matrixRows, NOT_PROVIDED, plainValue } from '../../../../lib/projectDossier';

export const EmptyValue = ({ lang = 'es' }: { lang?: 'es' | 'en' }) => (
    <span className="text-sm italic text-slate-400">{NOT_PROVIDED[lang]}</span>
);

const DossierValue = ({ field, value, lang = 'es' }: { field: DossierField; value: any; lang?: 'es' | 'en' }) => {
    if (field.type === 'matrix') {
        const rows = matrixRows(field);
        const v = value && typeof value === 'object' ? value : {};
        if (isEmptyValue(v)) return <EmptyValue lang={lang} />;
        return (
            <div className="overflow-x-auto">
                <table className="w-full min-w-[320px] text-sm">
                    <thead>
                        <tr className="border-b border-slate-200 text-left text-[11px] uppercase tracking-wide text-slate-500">
                            <th className="py-1.5 pr-3 font-semibold">{lang === 'en' ? 'Item' : 'Concepto'}</th>
                            {(field.columns || []).map((c, i) => <th key={c.key} className="py-1.5 pr-3 text-right font-semibold">{lang === 'en' ? field.columnsEn?.[i] || c.label : c.label}</th>)}
                        </tr>
                    </thead>
                    <tbody>
                        {rows.map(r => (
                            <tr key={r.key} className="border-b border-slate-100 last:border-0">
                                <td className={`py-1.5 pr-3 ${r.retired ? 'text-slate-500' : 'text-slate-700'}`}>{lang === 'en' ? r.labelEn || r.label : r.label}</td>
                                {(field.columns || []).map(c => {
                                    const cell = v?.[r.key]?.[c.key];
                                    return <td key={c.key} className="py-1.5 pr-3 text-right tabular-nums text-slate-800">{isEmptyValue(cell) ? '—' : Number(cell).toLocaleString(lang === 'en' ? 'en-US' : 'es-CO', { maximumFractionDigits: 2 })}</td>;
                                })}
                            </tr>
                        ))}
                    </tbody>
                </table>
            </div>
        );
    }
    if (field.type === 'repeater') {
        const rows: any[] = Array.isArray(value) ? value.filter(r => r && Object.values(r).some(x => String(x ?? '').trim() !== '')) : [];
        if (!rows.length) return <EmptyValue lang={lang} />;
        return (
            <div className="overflow-x-auto">
                <table className="w-full min-w-[320px] text-sm">
                    <thead>
                        <tr className="border-b border-slate-200 text-left text-[11px] uppercase tracking-wide text-slate-500">
                            <th className="w-8 py-1.5 pr-2 font-semibold">#</th>
                            {(field.columns || []).map((c, i) => <th key={c.key} className={`py-1.5 pr-3 font-semibold ${c.type === 'currency' ? 'text-right' : ''}`}>{lang === 'en' ? field.columnsEn?.[i] || c.label : c.label}</th>)}
                        </tr>
                    </thead>
                    <tbody>
                        {rows.map((r, i) => (
                            <tr key={i} className="border-b border-slate-100 align-top last:border-0">
                                <td className="py-1.5 pr-2 text-slate-400">{i + 1}</td>
                                {(field.columns || []).map(c => (
                                    <td key={c.key} className={`py-1.5 pr-3 text-slate-800 ${c.type === 'currency' ? 'text-right tabular-nums' : 'whitespace-pre-line'}`}>
                                        {isEmptyValue(r?.[c.key]) ? '—' : c.type === 'currency' ? fmtMoney(r[c.key], lang) : String(r[c.key])}
                                    </td>
                                ))}
                            </tr>
                        ))}
                    </tbody>
                </table>
            </div>
        );
    }
    if (isEmptyValue(value)) return <EmptyValue lang={lang} />;
    if (field.type === 'multiselect' && Array.isArray(value)) {
        return (
            <div className="flex flex-wrap gap-1.5">
                {value.map((v: string) => <span key={v} className="rounded-full bg-blue-50 px-2.5 py-0.5 text-xs font-semibold text-blue-800">{v}</span>)}
            </div>
        );
    }
    if ((field.type === 'url' || field.type === 'file') && /^https?:\/\//i.test(String(value))) {
        return <a href={String(value)} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 break-all text-sm text-blue-700 hover:underline">{String(value)} <ExternalLink size={12} /></a>;
    }
    return <p className="whitespace-pre-line break-words text-sm leading-relaxed text-slate-800">{plainValue(field, value, lang)}</p>;
};

export default DossierValue;
