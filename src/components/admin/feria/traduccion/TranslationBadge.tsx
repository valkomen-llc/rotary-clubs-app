// ════════════════════════════════════════════════════════════════════════════
// Insignia «EN ✓» junto al nombre del proyecto (v4.1356.0)
//
// Sólo aparece cuando la traducción inglesa está VERIFICADA y VIGENTE. Dice
// eso y nada más: no es una aprobación técnica, financiera ni administrativa
// del proyecto. Es un botón (teclado y lector de pantalla): al pasar el
// cursor, enfocarla o pulsarla muestra quién verificó, cuándo, cuántos campos,
// la versión y la vigencia, con un acceso a la pestaña «Traducción». La
// tarjeta se dibuja en una capa fija para que el desplazamiento horizontal de
// la tabla no la recorte.
// ════════════════════════════════════════════════════════════════════════════
import { useEffect, useId, useRef, useState } from 'react';
import { BadgeCheck, Languages } from 'lucide-react';
import { fmtWhen, roleLabel, type TranslationTracking } from '../../../../lib/translationTracking';

interface Props {
    t: TranslationTracking | null | undefined;
    project: string;
    onOpen?: () => void;
}

const TranslationBadge = ({ t, project, onOpen }: Props) => {
    const [open, setOpen] = useState(false);
    const [pos, setPos] = useState<{ top: number; left: number } | null>(null);
    const btn = useRef<HTMLButtonElement | null>(null);
    const closeTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
    const id = useId();

    const place = () => {
        const r = btn.current?.getBoundingClientRect();
        if (r) setPos({ top: Math.min(r.bottom + 6, window.innerHeight - 230), left: Math.max(8, Math.min(r.left, window.innerWidth - 296)) });
    };
    const show = () => { if (closeTimer.current) clearTimeout(closeTimer.current); place(); setOpen(true); };
    const hideSoon = () => { if (closeTimer.current) clearTimeout(closeTimer.current); closeTimer.current = setTimeout(() => setOpen(false), 160); };

    useEffect(() => {
        if (!open) return undefined;
        const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') { setOpen(false); btn.current?.focus(); } };
        window.addEventListener('keydown', onKey);
        window.addEventListener('scroll', place, true);
        return () => { window.removeEventListener('keydown', onKey); window.removeEventListener('scroll', place, true); };
    }, [open]);
    useEffect(() => () => { if (closeTimer.current) clearTimeout(closeTimer.current); }, []);

    if (!t || t.state !== 'verified' || !t.verification?.vigente) return null;
    const v = t.verification;
    return (
        <>
            <button ref={btn} type="button"
                onMouseEnter={show} onMouseLeave={hideSoon} onFocus={show} onBlur={hideSoon}
                onClick={() => (open ? setOpen(false) : show())}
                aria-describedby={open ? id : undefined}
                aria-label={`Traducción inglesa verificada de ${project}`}
                className="ml-1.5 inline-flex shrink-0 items-center gap-0.5 rounded-full bg-emerald-50 px-1.5 py-0.5 align-middle text-[10px] font-extrabold leading-none text-emerald-700 ring-1 ring-emerald-300 hover:bg-emerald-100 focus:outline-none focus-visible:ring-2 focus-visible:ring-emerald-600">
                EN <BadgeCheck size={12} aria-hidden="true" />
            </button>
            {open && pos && (
                <div id={id} role="tooltip" onMouseEnter={show} onMouseLeave={hideSoon}
                    className="fixed z-[80] w-72 rounded-xl border border-slate-200 bg-white p-3 text-left text-xs text-slate-700 shadow-xl"
                    style={{ top: pos.top, left: pos.left }}>
                    <p className="flex items-center gap-1.5 text-sm font-bold text-emerald-700"><BadgeCheck size={15} aria-hidden="true" /> Traducción inglesa verificada</p>
                    <dl className="mt-2 space-y-1">
                        <div className="flex gap-2"><dt className="w-24 shrink-0 text-slate-500">Verificó</dt><dd className="min-w-0 break-words font-semibold">{v.by || '—'}{v.role ? ` · ${roleLabel(v.role)}` : ''}</dd></div>
                        <div className="flex gap-2"><dt className="w-24 shrink-0 text-slate-500">Fecha</dt><dd>{fmtWhen(v.at)}</dd></div>
                        <div className="flex gap-2"><dt className="w-24 shrink-0 text-slate-500">Campos</dt><dd>{v.fieldCount ?? t.reviewed} revisados de {t.total}</dd></div>
                        <div className="flex gap-2"><dt className="w-24 shrink-0 text-slate-500">Versión</dt><dd>{v.versionNumber ?? '—'}</dd></div>
                        <div className="flex gap-2"><dt className="w-24 shrink-0 text-slate-500">Vigencia</dt><dd className="font-semibold text-emerald-700">Vigente: coincide con el original actual</dd></div>
                    </dl>
                    <p className="mt-2 text-[11px] text-slate-400">Certifica sólo la traducción. No es una aprobación técnica, financiera ni administrativa del proyecto.</p>
                    {onOpen && (
                        <button type="button" onClick={() => { setOpen(false); onOpen(); }}
                            className="mt-2 inline-flex items-center gap-1 rounded-lg border border-slate-300 px-2.5 py-1.5 font-semibold text-slate-700 hover:bg-slate-50">
                            <Languages size={12} aria-hidden="true" /> Abrir la traducción
                        </button>
                    )}
                </div>
            )}
        </>
    );
};

export default TranslationBadge;
