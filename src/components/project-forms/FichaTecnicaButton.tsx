// ════════════════════════════════════════════════════════════════════
// «Descargar ficha técnica» — Mi Proyecto (v4.1345)
//
// El gestor descarga en PDF lo que su club diligenció: registro inicial,
// Formulación del proyecto y Solicitud de Aportes del FDD. Es la MISMA ficha
// que el comité descarga del expediente (`/portal/ficha` usa el mismo
// `forDocument`), con la cabecera de la Feria y Open Sans. El servidor decide
// qué va (sin documento de identidad ni pagos); aquí sólo se dibuja.
// ════════════════════════════════════════════════════════════════════
import { useState } from 'react';
import { Download, FileText, Loader2 } from 'lucide-react';
import { BLUE } from './FormFields';
import { leerJson } from '../../lib/leerJson';
import type { DocumentPayload } from '../../lib/projectDossier';

const API = (import.meta as any).env?.VITE_API_URL || '/api';

const FichaTecnicaButton = ({ token }: { token: string }) => {
    const [busy, setBusy] = useState(false);
    const [error, setError] = useState<string | null>(null);

    const descargar = async () => {
        if (busy) return;
        setBusy(true); setError(null);
        try {
            const ctrl = new AbortController();
            const timer = setTimeout(() => ctrl.abort(), 45_000);
            const res = await fetch(`${API}/project-fair/portal/ficha`, { headers: { Authorization: `Bearer ${token}` }, signal: ctrl.signal })
                .finally(() => clearTimeout(timer));
            const { data } = await leerJson<DocumentPayload & { error?: string }>(res);
            if (!res.ok || !data?.es) throw new Error(data?.error || 'No pudimos preparar la ficha de tu proyecto.');
            const { buildClubFichaPdf, clubFichaFileName, downloadBlob } = await import('../../lib/projectDossierPdf');
            const doc = await buildClubFichaPdf(data);
            downloadBlob(doc.output('blob'), clubFichaFileName(data));
        } catch (e) {
            setError(e instanceof Error && e.name !== 'AbortError' ? e.message : 'No pudimos preparar la ficha. Inténtalo de nuevo en un momento.');
        } finally { setBusy(false); }
    };

    return (
        <div className="mt-4 flex flex-col gap-3 rounded-xl border border-blue-100 bg-blue-50/50 px-4 py-3 sm:flex-row sm:items-center sm:justify-between" data-ficha-tecnica>
            <div className="flex min-w-0 items-start gap-2.5">
                <FileText size={18} className="mt-0.5 shrink-0" style={{ color: BLUE }} aria-hidden />
                <p className="min-w-0 text-[13px] leading-relaxed text-slate-600">
                    <strong className="block text-[14px] text-slate-800">Ficha técnica del proyecto</strong>
                    Descarga en PDF lo que tu club diligenció en la Formulación del proyecto y en la Solicitud de Aportes del FDD, para consultarlo, guardarlo o compartirlo.
                </p>
            </div>
            <div className="shrink-0">
                <button type="button" onClick={descargar} disabled={busy}
                    className="inline-flex w-full items-center justify-center gap-2 rounded-xl px-5 py-2.5 text-sm font-bold text-white transition disabled:opacity-60 sm:w-auto"
                    style={{ backgroundColor: BLUE }}>
                    {busy ? <><Loader2 size={15} className="animate-spin" /> Preparando tu ficha…</> : <><Download size={15} /> Descargar ficha técnica (PDF)</>}
                </button>
                {error && <p role="alert" className="mt-1.5 text-xs text-red-700">{error}</p>}
            </div>
        </div>
    );
};

export default FichaTecnicaButton;
