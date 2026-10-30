// ════════════════════════════════════════════════════════════════════
// Tarjetas de recursos del panel «Mi proyecto» — v4.1264.0
//
// Dos tarjetas que van en la MISMA cuadrícula que los formularios del
// proyecto (dos columnas en escritorio, una en el móvil):
//
//   · `PresentationTemplateCard` — la plantilla oficial de presentación. Lo
//     que muestra (disponible, próximamente, actualizada, ya descargada) llega
//     RESUELTO del servidor (`/portal/resources`); el botón no lleva una URL
//     escrita en el código: pide la descarga con la sesión del club y el
//     servidor decide, registra y devuelve un enlace firmado que caduca.
//   · `NextStepCard` — «Subvenciones de Rotary 31A». Antes era una banda de
//     ancho completo debajo de los formularios; ahora es una tarjeta más, con
//     el mismo contenido y el mismo enlace.
//
// Las dos en el ámbito del MÓDULO: declaradas dentro de la página serían un
// tipo nuevo en cada render (v4.971).
// ════════════════════════════════════════════════════════════════════
import { useCallback, useEffect, useState } from 'react';
import { AlertCircle, CheckCircle2, Download, ExternalLink, FileDown, Loader2, RefreshCw } from 'lucide-react';
import { BLUE } from './FormFields';
import { fmtDateTime } from '../../lib/projectForms';
import { leerJson } from '../../lib/leerJson';

const API = (import.meta as any).env?.VITE_API_URL || '/api';
const FAIL_MESSAGE = 'No fue posible descargar la plantilla. Inténtalo nuevamente.';
// Ningún `fetch` sin tope de tiempo.
const TIMEOUT_MS = 20_000;
// `AbortSignal.timeout` no existe en Safari anterior a 16: sin él, la petición
// sale sin tope en vez de fallar antes de salir.
const timeoutSignal = () => (typeof AbortSignal !== 'undefined' && 'timeout' in AbortSignal ? AbortSignal.timeout(TIMEOUT_MS) : undefined);

export interface ResourceCardState {
    key: string;
    title: string;
    description: string;
    available: boolean;
    message: string | null;
    version: { number: number; format: string; formatLabel: string; sizeBytes: number; sizeLabel: string; publishedAt: string | null } | null;
    updated: boolean;
    downloaded: boolean;
    lastDownloadedAt: string | null;
    newerSinceDownload: boolean;
}

const fmtDay = (iso?: string | null) =>
    (iso ? new Date(iso).toLocaleDateString('es-CO', { day: 'numeric', month: 'long', year: 'numeric' }) : '');

/** El marco común de las tarjetas: mismo borde, radio, sombra y relleno que las de los formularios. */
const CARD = 'flex h-full min-w-0 flex-col rounded-2xl border border-slate-200 bg-white p-5 text-left shadow-sm';

const IconBox = ({ children }: { children: React.ReactNode }) => (
    <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl" style={{ background: `${BLUE}12`, color: BLUE }}>
        {children}
    </span>
);

export const PresentationTemplateCard = ({ token, onSessionExpired }: { token: string; onSessionExpired: () => void }) => {
    const [state, setState] = useState<ResourceCardState | null>(null);
    const [loadError, setLoadError] = useState(false);
    const [busy, setBusy] = useState(false);
    const [result, setResult] = useState<{ kind: 'ok' | 'error'; text: string; ref?: string | null } | null>(null);

    const load = useCallback(async () => {
        setLoadError(false);
        try {
            const res = await fetch(`${API}/project-fair/portal/resources`, {
                headers: { Authorization: `Bearer ${token}` },
                signal: timeoutSignal(),
            });
            if (res.status === 401) { onSessionExpired(); return; }
            const { data } = await leerJson<{ resources?: ResourceCardState[] }>(res);
            if (!res.ok || !data?.resources) throw new Error('load');
            setState(data.resources.find(r => r.key === 'presentation_template') || null);
        } catch {
            setLoadError(true);
        }
    }, [token, onSessionExpired]);

    useEffect(() => { load(); }, [load]);

    const download = useCallback(async () => {
        if (busy || !state?.available) return;
        setBusy(true);
        setResult(null);
        try {
            const res = await fetch(`${API}/project-fair/portal/resources/presentation_template/download`, {
                method: 'POST',
                headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
                body: '{}',
                signal: timeoutSignal(),
            });
            if (res.status === 401) { onSessionExpired(); return; }
            const { data } = await leerJson<{ url?: string; error?: string; ref?: string | null; code?: string }>(res);
            if (!res.ok || !data?.url) {
                // «Próximamente» no es un fallo: se repinta la tarjeta con el estado real.
                if (data?.code === 'not_available' || data?.code === 'not_configured') { await load(); return; }
                setResult({ kind: 'error', text: data?.error || FAIL_MESSAGE, ref: data?.ref || null });
                return;
            }
            // El enlace firmado fuerza la descarga (Content-Disposition:
            // attachment): el navegador baja el archivo y la página no se mueve.
            window.location.assign(data.url);
            setResult({ kind: 'ok', text: 'Tu descarga comenzó. Si no ves el archivo, revisa la carpeta de descargas de tu dispositivo.' });
            load();
        } catch {
            setResult({ kind: 'error', text: FAIL_MESSAGE });
        } finally {
            setBusy(false);
        }
    }, [busy, state?.available, token, onSessionExpired, load]);

    const disponible = Boolean(state?.available);
    const badge = !state ? null
        : !disponible ? { text: 'Próximamente', cls: 'bg-slate-100 text-slate-600', dot: 'bg-slate-400' }
        : state.downloaded ? { text: 'Descargada', cls: 'bg-emerald-50 text-emerald-700', dot: 'bg-emerald-500' }
        : { text: 'Disponible', cls: 'bg-blue-50 text-blue-800', dot: 'bg-blue-600' };

    return (
        <div className={CARD}>
            <div className="flex items-start justify-between gap-3">
                <IconBox><FileDown size={19} /></IconBox>
                {badge && (
                    <span className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[11px] font-bold ${badge.cls}`}>
                        <span className={`h-1.5 w-1.5 rounded-full ${badge.dot}`} /> {badge.text}
                    </span>
                )}
            </div>

            <h3 className="mt-3 break-words text-[17px] font-bold leading-snug text-slate-900">
                {state?.title || 'Plantilla de presentación del proyecto'}
            </h3>
            {state?.version && (
                <p className="text-[12px] font-semibold uppercase tracking-wide text-slate-400">
                    {state.version.formatLabel} · {state.version.sizeLabel} · Versión {state.version.number}
                </p>
            )}
            <p className="mt-1.5 break-words text-[13px] leading-relaxed text-slate-500">
                {state?.description || 'Descarga la plantilla oficial y prepara la presentación de tu proyecto siguiendo el formato establecido por el comité organizador.'}
            </p>

            {/* Estado: cargando, error de carga, próximamente o la fecha. */}
            {!state && !loadError && (
                <p className="mt-3 flex items-center gap-1.5 text-[12px] text-slate-400"><Loader2 size={13} className="animate-spin" /> Consultando la plantilla…</p>
            )}
            {loadError && (
                <p className="mt-3 flex flex-wrap items-center gap-2 text-[12px] text-red-700">
                    <AlertCircle size={13} /> No pudimos consultar la plantilla.
                    <button type="button" onClick={load} className="inline-flex items-center gap-1 font-bold underline"><RefreshCw size={12} /> Reintentar</button>
                </p>
            )}
            {state && !disponible && (
                <p className="mt-3 rounded-lg bg-slate-50 px-3 py-2 text-[12px] text-slate-600">{state.message || 'La plantilla oficial estará disponible próximamente.'}</p>
            )}
            {state && disponible && state.version?.publishedAt && (
                <p className="mt-2 text-[12px] text-slate-400">
                    {state.updated ? 'Plantilla actualizada' : 'Publicada'} el {fmtDay(state.version.publishedAt)}
                </p>
            )}
            {state?.downloaded && (
                <p className="mt-1 flex items-start gap-1.5 text-[12px] text-emerald-700">
                    <CheckCircle2 size={13} className="mt-0.5 shrink-0" />
                    <span>Ya descargaste esta plantilla{state.lastDownloadedAt ? ` (${fmtDateTime(state.lastDownloadedAt)})` : ''}.</span>
                </p>
            )}
            {state?.newerSinceDownload && disponible && (
                <p className="mt-1 text-[12px] font-semibold text-amber-700">Hay una versión más reciente que la que descargaste.</p>
            )}

            {result && (
                <p role="status" className={`mt-3 flex items-start gap-1.5 rounded-lg px-3 py-2 text-[12px] ${result.kind === 'ok' ? 'bg-emerald-50 text-emerald-800' : 'bg-red-50 text-red-800'}`}>
                    {result.kind === 'ok' ? <CheckCircle2 size={13} className="mt-0.5 shrink-0" /> : <AlertCircle size={13} className="mt-0.5 shrink-0" />}
                    <span>{result.text}{result.ref ? <span className="block opacity-70">Referencia: {result.ref}</span> : null}</span>
                </p>
            )}

            <div className="mt-auto pt-4">
                <button
                    type="button"
                    onClick={download}
                    disabled={!disponible || busy}
                    aria-disabled={!disponible || busy}
                    className={`inline-flex items-center gap-1.5 text-sm font-bold ${disponible && !busy ? 'hover:underline' : 'cursor-not-allowed text-slate-400'}`}
                    style={disponible && !busy ? { color: BLUE } : undefined}>
                    {busy ? <Loader2 size={15} className="animate-spin" /> : <Download size={15} />}
                    {busy ? 'Preparando descarga…' : 'Descargar plantilla'}
                </button>
            </div>
        </div>
    );
};

export const NextStepCard = ({ nextStep }: { nextStep: { url: string; name: string; label: string } }) => (
    <div className={CARD}>
        <div className="flex items-start justify-between gap-3">
            <IconBox><ExternalLink size={19} /></IconBox>
        </div>
        <h3 className="mt-3 break-words text-[17px] font-bold leading-snug text-slate-900">{nextStep.name || 'Rotary Grants 31A'}</h3>
        <p className="mt-1.5 break-words text-[13px] leading-relaxed text-slate-500">
            Cuando tengas tu proyecto formulado, continúa el proceso internacional en <strong className="text-slate-700">{nextStep.name || 'Rotary Grants 31A'}</strong>.
        </p>
        <div className="mt-auto pt-4">
            {/* En línea, no flex: si el rótulo parte en dos renglones, el ícono
                sigue al final del texto y no queda suelto a la derecha. */}
            <a href={nextStep.url} target="_blank" rel="noreferrer"
                className="break-words text-sm font-bold hover:underline"
                style={{ color: BLUE }}>
                {nextStep.label || 'Continuar hacia Rotary Grants 31A'}
                <ExternalLink size={15} className="ml-1.5 inline-block align-[-2px]" />
            </a>
        </div>
    </div>
);

export default PresentationTemplateCard;
