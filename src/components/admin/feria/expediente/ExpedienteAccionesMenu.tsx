// v4.1324 — Menú «⋯» junto a «Ver» en la tabla de Proyectos postulados.
// Accesos rápidos al expediente: editar, traducir, PDF (español, inglés,
// bilingüe) e historial. Se muestran según el perfil; el servidor vuelve a
// comprobar cada acción. Se dibuja en una capa fija para que el desplazamiento
// horizontal de la tabla no lo recorte.
import { useEffect, useRef, useState } from 'react';
import { Eye, FileDown, History, Languages, Loader2, MoreHorizontal, Pencil } from 'lucide-react';
import { toast } from 'sonner';
import { makeDossierPdf } from './ExpedienteFichas';

export type ExpedientePane = 'datos' | 'formulario' | 'documentos' | 'traduccion' | 'fichas' | 'libreta' | 'pago' | 'historial';
export interface OpenRequest { pane: ExpedientePane; edit?: boolean; autoTranslate?: boolean }

interface Access { edit?: boolean; translate?: boolean; export?: boolean }

const ExpedienteAccionesMenu = ({ submissionId, label, eventId, access, onOpen }: {
    submissionId: string; label: string; eventId: string; access: Access; onOpen: (req: OpenRequest) => void;
}) => {
    const [open, setOpen] = useState(false);
    const [pos, setPos] = useState<{ top: number; left: number } | null>(null);
    const [busy, setBusy] = useState<string | null>(null);
    const btn = useRef<HTMLButtonElement | null>(null);

    const place = () => {
        const r = btn.current?.getBoundingClientRect();
        if (r) setPos({ top: Math.max(8, Math.min(r.bottom + 4, window.innerHeight - 330)), left: Math.max(8, Math.min(r.right - 232, window.innerWidth - 240)) });
    };
    // Al desplazar, el menú ACOMPAÑA al botón (cerrarlo hacía que el propio
    // desplazamiento que provoca un clic lo cerrara en el acto).
    useEffect(() => {
        if (!open) return undefined;
        const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setOpen(false); };
        window.addEventListener('scroll', place, true);
        window.addEventListener('resize', place);
        window.addEventListener('keydown', onKey);
        return () => { window.removeEventListener('scroll', place, true); window.removeEventListener('resize', place); window.removeEventListener('keydown', onKey); };
    }, [open]);

    const toggle = () => { place(); setOpen(o => !o); };
    const go = (req: OpenRequest) => { setOpen(false); onOpen(req); };
    const pdf = async (kind: 'es' | 'en' | 'bilingual') => {
        setBusy(kind);
        try {
            const { doc, fileName } = await makeDossierPdf(submissionId, eventId, kind);
            doc.save(fileName);
        } catch (e: any) { toast.error(e?.message || 'No se pudo generar la ficha'); } finally { setBusy(null); setOpen(false); }
    };

    const item = 'flex w-full items-center gap-2 px-3 py-2 text-left text-sm text-slate-700 hover:bg-slate-50 disabled:opacity-50';
    return (
        <>
            <button ref={btn} onClick={toggle} aria-label={`Más acciones de ${label}`} aria-haspopup="menu" aria-expanded={open}
                className="inline-flex items-center rounded-lg border border-slate-300 px-1.5 py-1.5 text-slate-600 hover:bg-slate-100">
                <MoreHorizontal size={14} />
            </button>
            {open && pos && (
                <>
                    <div className="fixed inset-0 z-[55]" onClick={() => setOpen(false)} />
                    <div role="menu" aria-label={`Acciones de ${label}`} className="fixed z-[56] w-[232px] overflow-hidden rounded-xl border border-slate-200 bg-white py-1 shadow-xl" style={{ top: pos.top, left: pos.left }}>
                        <button role="menuitem" className={item} onClick={() => go({ pane: 'datos' })}><Eye size={14} /> Ver expediente</button>
                        {access.edit && <button role="menuitem" className={item} onClick={() => go({ pane: 'formulario', edit: true })}><Pencil size={14} /> Editar información</button>}
                        {access.translate && <button role="menuitem" className={item} onClick={() => go({ pane: 'traduccion', autoTranslate: true })}><Languages size={14} /> Traducir al inglés</button>}
                        {access.export && (
                            <>
                                <div className="my-1 border-t border-slate-100" />
                                {([['es', 'Descargar PDF en español'], ['en', 'Descargar PDF en inglés'], ['bilingual', 'Descargar PDF bilingüe']] as const).map(([k, l]) => (
                                    <button key={k} role="menuitem" className={item} disabled={!!busy} onClick={() => pdf(k)}>
                                        {busy === k ? <Loader2 size={14} className="animate-spin" /> : <FileDown size={14} />} {l}
                                    </button>
                                ))}
                            </>
                        )}
                        <div className="my-1 border-t border-slate-100" />
                        <button role="menuitem" className={item} onClick={() => go({ pane: 'historial' })}><History size={14} /> Ver historial</button>
                    </div>
                </>
            )}
        </>
    );
};

export default ExpedienteAccionesMenu;
