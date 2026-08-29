// ════════════════════════════════════════════════════════════════════
// Importar inscripciones — el asistente del motor de importación — v4.950.0
//
// Migra registros históricos (CSV o pegado desde Excel/Sheets) hacia
// «Inscripciones COLROTARIOS». Cuatro pasos: cargar → mapear → revisar →
// resultado, más el historial de lotes con su reversión.
//
// El PARSEO y la VALIDACIÓN viven en el servidor (criterio puro,
// `completedImportSpec.js`): esta pantalla manda el TEXTO y pinta lo que el
// servidor contesta — lo que se importa es exactamente lo que se previsualizó.
// Los destinos del mapeo llegan del esquema REAL del formulario público: un
// campo nuevo aparece solo, sin listas duplicadas.
// ════════════════════════════════════════════════════════════════════
import { useCallback, useEffect, useState } from 'react';
import {
    AlertCircle, AlertTriangle, CheckCircle2, ChevronRight, Download, FileSpreadsheet,
    History, Loader2, RotateCcw, Upload, UploadCloud,
} from 'lucide-react';

const API = (import.meta as any).env?.VITE_API_URL || '/api';
const authHeaders = () => ({
    'Content-Type': 'application/json',
    Authorization: `Bearer ${localStorage.getItem('rotary_token')}`,
});

const inputCls = 'w-full rounded-lg border border-gray-300 px-3 py-2 text-sm outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-100';

interface ImportField {
    key: string; label: string; required?: boolean;
    // v4.958 — los destinos vienen del esquema y algunos son catálogos
    // CERRADOS (vínculo, cargo, método de pago y ahora el tipo de invitado).
    // Sin esto, corregir una fila obligaría a teclear la clave interna.
    options?: { value: string; label: string }[] | null;
}
interface InspectResult {
    delimiter: string; headerDetected: boolean; emptyDropped: number;
    rowCount: number; columnCount: number; maxRows: number;
    columns: { index: number; name: string; sample: string }[];
    preview: string[][];
    fields: ImportField[];
    autoMapping: Record<string, string | null>;
    initialStatuses: { key: string; label: string; description: string }[];
    defaultStatus: string;
    paymentMethods: { value: string; label: string }[];
}
interface PreflightRow {
    n: number;
    answers: Record<string, string>;
    receiptUrl: string;
    notes: string[];
    errors: Record<string, string>;
    clubSuggestion: string | null;
    duplicate: { kind: 'nuevo' | 'posible' | 'confirmado'; matches: { code: string | null; name: string; reason: string; source: string | null }[] };
    defaultDecision: string;
}
interface PreflightResult {
    summary: { total: number; listas: number; conErrores: number; posiblesDuplicados: number; duplicadosConfirmados: number; revisionClub: number };
    rows: PreflightRow[];
}
interface Batch {
    id: string; fileName: string | null; initialStatus: string; status: string;
    totals: any; createdByName: string | null; createdAt: string; revertedAt: string | null;
}

const leerJson = async (res: Response) => {
    const crudo = await res.text();
    try { return JSON.parse(crudo); } catch { throw new Error(`El servidor contestó HTTP ${res.status} en vez de JSON.`); }
};

/** Un archivo con caracteres de reemplazo se relee como windows-1252. */
const readFileText = (file: File): Promise<string> => new Promise((resolve, reject) => {
    file.arrayBuffer().then(buffer => {
        const utf8 = new TextDecoder('utf-8').decode(buffer);
        if (utf8.includes('�')) {
            try { return resolve(new TextDecoder('windows-1252').decode(buffer)); } catch { /* se queda utf-8 */ }
        }
        resolve(utf8);
    }).catch(reject);
});

const DUP_BADGE: Record<string, string> = {
    nuevo: 'bg-emerald-50 text-emerald-700',
    posible: 'bg-amber-50 text-amber-700',
    confirmado: 'bg-red-50 text-red-700',
};
const DUP_LABEL: Record<string, string> = { nuevo: 'Nuevo', posible: 'Posible duplicado', confirmado: 'Duplicado confirmado' };

const EventImportWizard = ({ eventId }: { eventId: string; eventTitle?: string }) => {
    const [vista, setVista] = useState<'importar' | 'historial'>('importar');
    const [paso, setPaso] = useState<1 | 2 | 3 | 4>(1);
    const [busy, setBusy] = useState(false);
    const [error, setError] = useState('');

    // Paso 1
    const [texto, setTexto] = useState('');
    const [fileName, setFileName] = useState('');
    const [arrastrando, setArrastrando] = useState(false);
    // Paso 2-3
    const [inspect, setInspect] = useState<InspectResult | null>(null);
    const [mapping, setMapping] = useState<Record<number, string | null>>({});
    const [initialStatus, setInitialStatus] = useState('submitted');
    const [defaultPay, setDefaultPay] = useState('');
    const [pre, setPre] = useState<PreflightResult | null>(null);
    const [decisiones, setDecisiones] = useState<Record<number, string>>({});
    const [edits, setEdits] = useState<Record<number, Record<string, string>>>({});
    const [filaAbierta, setFilaAbierta] = useState<number | null>(null);
    const [filtro, setFiltro] = useState('todas');
    const [confirmando, setConfirmando] = useState(false);
    // Paso 4
    const [resultado, setResultado] = useState<any>(null);
    // Historial
    const [batches, setBatches] = useState<Batch[]>([]);
    const [batchAbierto, setBatchAbierto] = useState<any>(null);
    const [revertBusy, setRevertBusy] = useState(false);

    const post = useCallback(async (path: string, body: any) => {
        const res = await fetch(`${API}/event-registrations/admin/completed/import/${path}`, {
            method: 'POST', headers: authHeaders(), body: JSON.stringify({ eventRef: eventId, ...body }),
        });
        const d = await leerJson(res);
        if (!res.ok) throw new Error(d?.detail ? `${d.error} — ${d.detail}` : (d?.error || 'La petición falló.'));
        return d;
    }, [eventId]);

    const cargarHistorial = useCallback(async () => {
        try {
            const res = await fetch(`${API}/event-registrations/admin/completed/import/batches?eventRef=${encodeURIComponent(eventId)}`, { headers: authHeaders() });
            const d = await leerJson(res);
            if (res.ok) setBatches(d.batches || []);
        } catch { /* el historial no bloquea el asistente */ }
    }, [eventId]);

    useEffect(() => { if (vista === 'historial') cargarHistorial(); }, [vista, cargarHistorial]);

    const recibirArchivo = async (file: File) => {
        setError('');
        try {
            setTexto(await readFileText(file));
            setFileName(file.name);
        } catch { setError('No se pudo leer el archivo.'); }
    };

    const inspeccionar = async () => {
        setBusy(true); setError('');
        try {
            const d: InspectResult = await post('inspect', { text: texto });
            setInspect(d);
            const inicial: Record<number, string | null> = {};
            d.columns.forEach(c => { inicial[c.index] = d.autoMapping[c.index] ?? null; });
            setMapping(inicial);
            setInitialStatus(d.defaultStatus);
            setPaso(2);
        } catch (e: any) { setError(e?.message || 'No se pudo inspeccionar el archivo.'); }
        finally { setBusy(false); }
    };

    const bodyComun = () => ({
        text: texto, mapping,
        options: { defaultPaymentMethod: defaultPay || undefined },
        edits,
    });

    const validar = async (aPaso3 = true) => {
        setBusy(true); setError('');
        try {
            const d: PreflightResult = await post('preflight', bodyComun());
            setPre(d);
            const dec: Record<number, string> = {};
            d.rows.forEach(r => { dec[r.n] = decisiones[r.n] || r.defaultDecision; });
            setDecisiones(dec);
            if (aPaso3) setPaso(3);
        } catch (e: any) { setError(e?.message || 'No se pudo validar el archivo.'); }
        finally { setBusy(false); }
    };

    const importar = async () => {
        setBusy(true); setError('');
        try {
            const d = await post('commit', {
                ...bodyComun(), confirm: true, initialStatus, fileName, decisions: decisiones,
            });
            setResultado(d);
            setConfirmando(false);
            setPaso(4);
        } catch (e: any) { setError(e?.message || 'No se pudo importar el lote.'); setConfirmando(false); }
        finally { setBusy(false); }
    };

    const revertir = async (batchId: string) => {
        setRevertBusy(true);
        try {
            const res = await fetch(`${API}/event-registrations/admin/completed/import/batches/${batchId}/revert`, {
                method: 'POST', headers: authHeaders(), body: JSON.stringify({ eventRef: eventId, confirm: true }),
            });
            const d = await leerJson(res);
            if (!res.ok) throw new Error(d?.error || 'No se pudo revertir.');
            setBatchAbierto(null);
            await cargarHistorial();
        } catch (e: any) { setError(e?.message || 'No se pudo revertir el lote.'); }
        finally { setRevertBusy(false); }
    };

    const abrirBatch = async (batchId: string) => {
        try {
            const res = await fetch(`${API}/event-registrations/admin/completed/import/batches/${batchId}?eventRef=${encodeURIComponent(eventId)}`, { headers: authHeaders() });
            const d = await leerJson(res);
            if (res.ok) setBatchAbierto(d);
        } catch { /* se queda cerrado */ }
    };

    // El CSV de errores: fila; campo; valor; problema — BOM + punto y coma
    // (regla de la Bóveda, v4.850: sin BOM Excel rompe los acentos).
    const descargarErrores = () => {
        if (!pre) return;
        const lineas = ['Fila;Campo;Valor;Problema'];
        for (const r of pre.rows) {
            for (const [campo, problema] of Object.entries(r.errors)) {
                const valor = String(r.answers[campo] ?? '').replace(/"/g, '""');
                lineas.push(`${r.n};"${campo}";"${valor}";"${String(problema).replace(/"/g, '""')}"`);
            }
        }
        const blob = new Blob([`﻿${lineas.join('\n')}`], { type: 'text/csv;charset=utf-8' });
        const a = document.createElement('a');
        a.href = URL.createObjectURL(blob);
        a.download = 'errores-importacion.csv';
        a.click();
        URL.revokeObjectURL(a.href);
    };

    const reiniciar = () => {
        setPaso(1); setTexto(''); setFileName(''); setInspect(null); setMapping({});
        setPre(null); setDecisiones({}); setEdits({}); setResultado(null); setError('');
    };

    const filasFiltradas = (pre?.rows || []).filter(r => {
        const errores = Object.keys(r.errors).length > 0;
        if (filtro === 'errores') return errores;
        if (filtro === 'duplicados') return !errores && r.duplicate.kind !== 'nuevo';
        if (filtro === 'listas') return !errores && r.duplicate.kind === 'nuevo';
        if (filtro === 'club') return Boolean(r.clubSuggestion);
        return true;
    });

    const nombreDe = (r: PreflightRow) => `${r.answers.firstName || ''} ${r.answers.lastName || ''}`.trim() || '—';

    return (
        <div className="space-y-5">
            {/* Sub-navegación propia: el asistente y el historial de lotes. */}
            <div className="flex flex-wrap items-center justify-between gap-3">
                <div className="flex gap-1 rounded-lg bg-gray-100 p-1">
                    {([['importar', 'Importar'], ['historial', 'Historial de importaciones']] as const).map(([k, l]) => (
                        <button key={k} type="button" onClick={() => setVista(k)}
                            className={`rounded-md px-3 py-1.5 text-sm font-semibold transition ${vista === k ? 'bg-white text-blue-700 shadow-sm' : 'text-gray-500 hover:text-gray-800'}`}>
                            {k === 'historial' ? <History className="mr-1 inline h-3.5 w-3.5" /> : <UploadCloud className="mr-1 inline h-3.5 w-3.5" />}{l}
                        </button>
                    ))}
                </div>
                {vista === 'importar' && paso > 1 && (
                    <button type="button" onClick={reiniciar} className="text-xs font-semibold text-gray-500 hover:text-gray-800">
                        Empezar de nuevo
                    </button>
                )}
            </div>

            {error && (
                <div className="flex items-start gap-2 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">
                    <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" /> {error}
                </div>
            )}

            {/* ── Historial ─────────────────────────────────────────── */}
            {vista === 'historial' && (
                <div className="space-y-4">
                    {batches.length === 0 ? (
                        <p className="rounded-xl border border-gray-200 bg-white px-4 py-8 text-center text-sm text-gray-400">
                            Todavía no hay importaciones para este evento.
                        </p>
                    ) : (
                        <div className="overflow-x-auto rounded-xl border border-gray-200 bg-white">
                            <table className="w-full text-left text-sm">
                                <thead><tr className="border-b border-gray-100 text-xs uppercase tracking-wide text-gray-400">
                                    <th className="px-4 py-3">Fecha</th><th className="px-4 py-3">Archivo</th>
                                    <th className="px-4 py-3">Usuario</th><th className="px-4 py-3">Resultado</th>
                                    <th className="px-4 py-3">Estado</th>
                                </tr></thead>
                                <tbody>{batches.map(b => (
                                    <tr key={b.id} onClick={() => abrirBatch(b.id)}
                                        className="cursor-pointer border-b border-gray-50 last:border-0 hover:bg-blue-50/40">
                                        <td className="px-4 py-3 text-gray-600">{new Date(b.createdAt).toLocaleString('es-CO')}</td>
                                        <td className="px-4 py-3" data-no-translate>{b.fileName || 'Pegado desde Excel'}</td>
                                        <td className="px-4 py-3 text-gray-600">{b.createdByName || '—'}</td>
                                        <td className="px-4 py-3 text-gray-600">
                                            {b.totals?.detectadas ?? '—'} detectadas · {b.totals?.importadas ?? 0} importadas · {b.totals?.omitidas ?? 0} omitidas
                                            {Number(b.totals?.errores) > 0 ? ` · ${b.totals.errores} con errores` : ''}
                                        </td>
                                        <td className="px-4 py-3">
                                            <span className={`rounded-full px-2 py-0.5 text-xs font-bold ${b.status === 'reverted' ? 'bg-slate-100 text-slate-600' : 'bg-emerald-50 text-emerald-700'}`}>
                                                {b.status === 'reverted' ? 'Revertido' : b.status === 'processing' ? 'En proceso' : 'Completado'}
                                            </span>
                                        </td>
                                    </tr>
                                ))}</tbody>
                            </table>
                        </div>
                    )}

                    {batchAbierto && (
                        <div className="space-y-3 rounded-xl border border-gray-200 bg-white p-4">
                            <div className="flex flex-wrap items-center justify-between gap-3">
                                <div>
                                    <p className="text-sm font-bold text-gray-900" data-no-translate>{batchAbierto.batch.fileName || 'Pegado desde Excel'}</p>
                                    <p className="text-xs text-gray-500">
                                        {new Date(batchAbierto.batch.createdAt).toLocaleString('es-CO')} · {batchAbierto.batch.createdByName || '—'} ·
                                        estado inicial: {batchAbierto.batch.initialStatus}
                                    </p>
                                </div>
                                {batchAbierto.batch.status !== 'reverted' && (
                                    <button type="button" disabled={revertBusy}
                                        onClick={() => {
                                            // Confirmación fuerte: la reversión borra registros.
                                            if (window.confirm(`Revertir este lote elimina los registros que creó y que sigan SIN modificar, sin acreditar y sin comunicaciones. Los que hayan cambiado se conservan y se nombran.\n\n¿Revertir el lote?`)) revertir(batchAbierto.batch.id);
                                        }}
                                        className="inline-flex items-center gap-1.5 rounded-lg border border-red-200 bg-red-50 px-3 py-1.5 text-xs font-bold text-red-700 transition hover:bg-red-100 disabled:opacity-50">
                                        {revertBusy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <RotateCcw className="h-3.5 w-3.5" />}
                                        Revertir importación
                                    </button>
                                )}
                            </div>
                            <div className="max-h-72 overflow-y-auto rounded-lg border border-gray-100">
                                <table className="w-full text-left text-xs">
                                    <thead><tr className="border-b border-gray-100 uppercase tracking-wide text-gray-400">
                                        <th className="px-3 py-2">Código</th><th className="px-3 py-2">Nombre</th>
                                        <th className="px-3 py-2">Email</th><th className="px-3 py-2">Estado</th><th className="px-3 py-2">Fila</th>
                                    </tr></thead>
                                    <tbody>{(batchAbierto.rows || []).map((r: any) => (
                                        <tr key={r.id} className="border-b border-gray-50 last:border-0">
                                            <td className="px-3 py-2 font-mono font-bold" data-no-translate>{r.registrationCode || '—'}</td>
                                            <td className="px-3 py-2">{`${r.firstName || ''} ${r.lastName || ''}`.trim()}</td>
                                            <td className="px-3 py-2 text-gray-500" data-no-translate>{r.email}</td>
                                            <td className="px-3 py-2">{r.status}{r.checkedInAt ? ' · acreditado' : ''}</td>
                                            <td className="px-3 py-2 text-gray-400">{r.importMeta?.sourceRow ?? '—'}</td>
                                        </tr>
                                    ))}</tbody>
                                </table>
                            </div>
                        </div>
                    )}
                </div>
            )}

            {/* ── Paso 1: cargar ────────────────────────────────────── */}
            {vista === 'importar' && paso === 1 && (
                <div className="space-y-4">
                    <p className="text-sm text-gray-500">
                        Sube el CSV del sistema anterior o pega el listado directo desde Excel / Google Sheets.
                        Nada se importa en este paso: primero se mapean las columnas y se validan los registros.
                    </p>
                    <div
                        onDragOver={e => { e.preventDefault(); setArrastrando(true); }}
                        onDragLeave={() => setArrastrando(false)}
                        onDrop={e => {
                            e.preventDefault(); setArrastrando(false);
                            const file = e.dataTransfer.files?.[0];
                            if (file) recibirArchivo(file);
                        }}
                        className={`rounded-xl border-2 border-dashed px-6 py-8 text-center transition ${arrastrando ? 'border-blue-400 bg-blue-50/50' : 'border-gray-300 bg-white'}`}>
                        <FileSpreadsheet className="mx-auto h-8 w-8 text-gray-300" />
                        <p className="mt-2 text-sm font-semibold text-gray-700">Arrastra el archivo CSV aquí</p>
                        <p className="text-xs text-gray-400">o</p>
                        <label className="mt-1 inline-block cursor-pointer rounded-lg border border-gray-300 bg-white px-4 py-2 text-sm font-semibold text-gray-700 transition hover:bg-gray-50">
                            Seleccionar archivo
                            <input type="file" accept=".csv,.tsv,.txt" className="hidden"
                                onChange={e => {
                                    const file = e.target.files?.[0];
                                    if (file) recibirArchivo(file);
                                    e.target.value = '';
                                }} />
                        </label>
                        {fileName && <p className="mt-2 text-xs font-semibold text-emerald-700" data-no-translate>Archivo cargado: {fileName}</p>}
                    </div>
                    <div>
                        <label className="mb-1 block text-xs font-semibold text-gray-600">O pega el listado desde Excel / Google Sheets</label>
                        <textarea rows={7} className={`${inputCls} font-mono text-xs`} value={texto}
                            placeholder={'NOMBRE\tAPELLIDO\tEMAIL\tCLUB\nDaniel\tYazo\tdaniel@correo.com\tE-Club Origen'}
                            onChange={e => { setTexto(e.target.value); if (!e.target.value) setFileName(''); }} />
                        <p className="mt-1 text-xs text-gray-400">Al copiar celdas en Excel y pegarlas aquí, las columnas llegan separadas por tabulaciones y se detectan solas.</p>
                    </div>
                    <button type="button" onClick={inspeccionar} disabled={busy || !texto.trim()}
                        className="inline-flex items-center gap-1.5 rounded-lg bg-blue-600 px-5 py-2.5 text-sm font-bold text-white transition hover:bg-blue-700 disabled:opacity-50">
                        {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <ChevronRight className="h-4 w-4" />}
                        Analizar el archivo
                    </button>
                </div>
            )}

            {/* ── Paso 2: mapear columnas ───────────────────────────── */}
            {vista === 'importar' && paso === 2 && inspect && (
                <div className="space-y-4">
                    <div className="rounded-xl border border-blue-100 bg-blue-50/60 px-4 py-3 text-sm text-blue-900">
                        Se detectaron <strong>{inspect.rowCount} registros</strong> y <strong>{inspect.columnCount} columnas</strong>
                        {' '}(separador: {inspect.delimiter === 'tab' ? 'tabulación' : `«${inspect.delimiter}»`};
                        {inspect.headerDetected ? ' la primera fila son encabezados' : ' sin encabezados: se numeraron las columnas'}).
                        El mapeo automático es una sugerencia — corrígelo antes de continuar.
                    </div>
                    <div className="overflow-x-auto rounded-xl border border-gray-200 bg-white">
                        <table className="w-full text-left text-sm">
                            <thead><tr className="border-b border-gray-100 text-xs uppercase tracking-wide text-gray-400">
                                <th className="px-4 py-3">Columna origen</th>
                                <th className="px-4 py-3">Ejemplo del valor</th>
                                <th className="px-4 py-3">Mapear a</th>
                            </tr></thead>
                            <tbody>{inspect.columns.map(c => (
                                <tr key={c.index} className="border-b border-gray-50 last:border-0">
                                    <td className="px-4 py-2.5 font-semibold text-gray-800" data-no-translate>{c.name}</td>
                                    <td className="px-4 py-2.5 text-gray-500" data-no-translate>{c.sample || '—'}</td>
                                    <td className="px-4 py-2.5">
                                        <select className={inputCls} value={mapping[c.index] ?? ''}
                                            onChange={e => setMapping(prev => ({ ...prev, [c.index]: e.target.value || null }))}>
                                            <option value="">— Omitir columna —</option>
                                            {inspect.fields.map(f => (
                                                <option key={f.key} value={f.key}>{f.label}{f.required ? ' *' : ''}</option>
                                            ))}
                                            <option value="extra">Conservar como dato adicional (no entra al formulario)</option>
                                        </select>
                                    </td>
                                </tr>
                            ))}</tbody>
                        </table>
                    </div>

                    <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                        <div>
                            <label className="mb-1 block text-xs font-semibold text-gray-600">Estado inicial del lote</label>
                            <select className={inputCls} value={initialStatus} onChange={e => setInitialStatus(e.target.value)}>
                                {inspect.initialStatuses.map(s => <option key={s.key} value={s.key}>{s.label}</option>)}
                            </select>
                            <p className="mt-1 text-xs text-gray-400">No se asume que lo histórico está validado: el valor por defecto es «Pendiente de validación».</p>
                        </div>
                        <div>
                            <label className="mb-1 block text-xs font-semibold text-gray-600">Método de pago cuando el archivo no lo trae</label>
                            <select className={inputCls} value={defaultPay} onChange={e => setDefaultPay(e.target.value)}>
                                <option value="">No asignar (quedará como campo faltante)</option>
                                {inspect.paymentMethods.map(m => <option key={m.value} value={m.value}>{m.label}</option>)}
                            </select>
                        </div>
                    </div>

                    <button type="button" onClick={() => validar(true)} disabled={busy}
                        className="inline-flex items-center gap-1.5 rounded-lg bg-blue-600 px-5 py-2.5 text-sm font-bold text-white transition hover:bg-blue-700 disabled:opacity-50">
                        {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <ChevronRight className="h-4 w-4" />}
                        Validar los registros
                    </button>
                </div>
            )}

            {/* ── Paso 3: revisar (validación + duplicados + vista previa) ── */}
            {vista === 'importar' && paso === 3 && pre && (
                <div className="space-y-4">
                    <div className="grid grid-cols-2 gap-3 md:grid-cols-5">
                        {([
                            ['Filas detectadas', pre.summary.total, 'text-gray-900'],
                            ['Listas para importar', pre.summary.listas, 'text-emerald-700'],
                            ['Posibles duplicados', pre.summary.posiblesDuplicados, 'text-amber-700'],
                            ['Duplicados confirmados', pre.summary.duplicadosConfirmados, 'text-red-700'],
                            ['Con campos faltantes', pre.summary.conErrores, 'text-red-700'],
                        ] as const).map(([label, value, tone]) => (
                            <div key={label} className="rounded-xl border border-gray-200 bg-white px-4 py-3">
                                <p className={`text-2xl font-bold ${tone}`}>{value}</p>
                                <p className="text-xs text-gray-500">{label}</p>
                            </div>
                        ))}
                    </div>
                    {pre.summary.revisionClub > 0 && (
                        <p className="rounded-lg bg-amber-50 px-3 py-2 text-xs font-semibold text-amber-800">
                            {pre.summary.revisionClub} registro(s) con revisión sugerida del club: el nombre no coincide exacto con el catálogo del distrito.
                        </p>
                    )}

                    <div className="flex flex-wrap items-center gap-3">
                        <select className={`${inputCls} max-w-xs`} value={filtro} onChange={e => setFiltro(e.target.value)}>
                            <option value="todas">Todas las filas</option>
                            <option value="listas">Listas para importar</option>
                            <option value="duplicados">Duplicados</option>
                            <option value="errores">Con errores</option>
                            <option value="club">Revisión de club sugerida</option>
                        </select>
                        {pre.summary.conErrores > 0 && (
                            <button type="button" onClick={descargarErrores}
                                className="inline-flex items-center gap-1.5 rounded-lg border border-gray-300 bg-white px-3 py-2 text-xs font-bold text-gray-700 transition hover:bg-gray-50">
                                <Download className="h-3.5 w-3.5" /> CSV de errores
                            </button>
                        )}
                        <button type="button" onClick={() => validar(false)} disabled={busy}
                            className="inline-flex items-center gap-1.5 rounded-lg border border-gray-300 bg-white px-3 py-2 text-xs font-bold text-gray-700 transition hover:bg-gray-50 disabled:opacity-50">
                            {busy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <RotateCcw className="h-3.5 w-3.5" />}
                            Revalidar con las correcciones
                        </button>
                    </div>

                    <div className="overflow-x-auto rounded-xl border border-gray-200 bg-white">
                        <table className="w-full text-left text-sm">
                            <thead><tr className="border-b border-gray-100 text-xs uppercase tracking-wide text-gray-400">
                                <th className="px-3 py-3">Fila</th><th className="px-3 py-3">Participante</th>
                                <th className="px-3 py-3">Estado</th><th className="px-3 py-3">Detalle</th>
                                <th className="px-3 py-3">Decisión</th>
                            </tr></thead>
                            <tbody>{filasFiltradas.map(r => {
                                const tieneErrores = Object.keys(r.errors).length > 0;
                                const abierta = filaAbierta === r.n;
                                return [
                                    <tr key={r.n} onClick={() => setFilaAbierta(abierta ? null : r.n)}
                                        className="cursor-pointer border-b border-gray-50 last:border-0 hover:bg-blue-50/30">
                                        <td className="px-3 py-2.5 font-mono text-xs text-gray-500">{r.n}</td>
                                        <td className="px-3 py-2.5">
                                            <p className="font-semibold text-gray-900">{nombreDe(r)}</p>
                                            <p className="text-xs text-gray-400" data-no-translate>{r.answers.email || ''}</p>
                                        </td>
                                        <td className="px-3 py-2.5">
                                            {tieneErrores
                                                ? <span className="rounded-full bg-red-50 px-2 py-0.5 text-xs font-bold text-red-700">Campos faltantes</span>
                                                : <span className={`rounded-full px-2 py-0.5 text-xs font-bold ${DUP_BADGE[r.duplicate.kind]}`}>{DUP_LABEL[r.duplicate.kind]}</span>}
                                        </td>
                                        <td className="px-3 py-2.5 text-xs text-gray-500">
                                            {tieneErrores
                                                ? Object.values(r.errors)[0]
                                                : r.duplicate.matches[0]?.reason
                                                    ? `${r.duplicate.matches[0].reason}${r.duplicate.matches[0].code ? ` (${r.duplicate.matches[0].code})` : ''}`
                                                    : r.clubSuggestion ? `¿El club es «${r.clubSuggestion}»?` : (r.notes[0] || '—')}
                                        </td>
                                        <td className="px-3 py-2.5" onClick={e => e.stopPropagation()}>
                                            <select className={`${inputCls} py-1.5 text-xs`} value={decisiones[r.n] || r.defaultDecision}
                                                onChange={e => setDecisiones(prev => ({ ...prev, [r.n]: e.target.value }))}>
                                                {tieneErrores ? (
                                                    <option value="omitir">Omitir (corregir primero)</option>
                                                ) : r.duplicate.kind === 'nuevo' ? (<>
                                                    <option value="importar">Importar</option>
                                                    <option value="omitir">Omitir</option>
                                                </>) : (<>
                                                    <option value="omitir">Omitir</option>
                                                    {r.duplicate.kind === 'posible' && <option value="nuevo">Importar como nuevo</option>}
                                                    <option value="completar">Completar el registro existente (sólo campos vacíos)</option>
                                                </>)}
                                            </select>
                                        </td>
                                    </tr>,
                                    abierta && (
                                        <tr key={`${r.n}-detalle`} className="border-b border-gray-50 bg-gray-50/60">
                                            <td colSpan={5} className="px-4 py-3">
                                                <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
                                                    {(inspect?.fields || []).filter(f => f.key !== 'receiptUrl').map(f => (
                                                        <div key={f.key}>
                                                            <label className={`mb-0.5 block text-[11px] font-semibold ${r.errors[f.key] ? 'text-red-600' : 'text-gray-500'}`}>
                                                                {f.label}{r.errors[f.key] ? ` — ${r.errors[f.key]}` : ''}
                                                            </label>
                                                            {f.options && f.options.length ? (
                                                                <select className={`${inputCls} py-1.5 text-xs`}
                                                                    value={edits[r.n]?.[f.key] ?? r.answers[f.key] ?? ''}
                                                                    onChange={e => setEdits(prev => ({ ...prev, [r.n]: { ...prev[r.n], [f.key]: e.target.value } }))}>
                                                                    <option value="">— Sin valor —</option>
                                                                    {f.options.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
                                                                </select>
                                                            ) : (
                                                                <input className={`${inputCls} py-1.5 text-xs`}
                                                                    value={edits[r.n]?.[f.key] ?? r.answers[f.key] ?? ''}
                                                                    onChange={e => setEdits(prev => ({ ...prev, [r.n]: { ...prev[r.n], [f.key]: e.target.value } }))} />
                                                            )}
                                                        </div>
                                                    ))}
                                                </div>
                                                {r.clubSuggestion && (
                                                    <button type="button"
                                                        onClick={() => setEdits(prev => ({ ...prev, [r.n]: { ...prev[r.n], clubName: r.clubSuggestion! } }))}
                                                        className="mt-2 rounded-lg bg-amber-100 px-3 py-1.5 text-xs font-bold text-amber-800 transition hover:bg-amber-200">
                                                        Usar el club sugerido: {r.clubSuggestion}
                                                    </button>
                                                )}
                                                {r.notes.length > 0 && (
                                                    <p className="mt-2 text-[11px] text-gray-500">Normalizaciones aplicadas: {r.notes.join(' ')}</p>
                                                )}
                                                <p className="mt-1 text-[11px] text-gray-400">Tras corregir, pulsa «Revalidar con las correcciones».</p>
                                            </td>
                                        </tr>
                                    ),
                                ];
                            })}</tbody>
                        </table>
                    </div>

                    {!confirmando ? (
                        <button type="button" onClick={() => setConfirmando(true)} disabled={busy}
                            className="inline-flex items-center gap-1.5 rounded-lg bg-blue-600 px-5 py-2.5 text-sm font-bold text-white transition hover:bg-blue-700 disabled:opacity-50">
                            <Upload className="h-4 w-4" /> Importar el lote
                        </button>
                    ) : (
                        <div className="rounded-xl border border-blue-200 bg-blue-50 px-4 py-3">
                            {/* La confirmación DICE qué va a pasar (regla v4.885). */}
                            <p className="text-sm text-blue-900">
                                Se van a crear los registros marcados «Importar» con estado inicial{' '}
                                <strong>{inspect?.initialStatuses.find(s => s.key === initialStatus)?.label || initialStatus}</strong> y origen{' '}
                                <strong>Importación histórica</strong>. Los duplicados y las filas con errores se omiten salvo decisión expresa.
                                No se envía ningún correo de confirmación a los participantes importados.
                            </p>
                            <div className="mt-2 flex gap-2">
                                <button type="button" onClick={importar} disabled={busy}
                                    className="inline-flex items-center gap-1.5 rounded-lg bg-blue-600 px-4 py-2 text-sm font-bold text-white transition hover:bg-blue-700 disabled:opacity-50">
                                    {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <CheckCircle2 className="h-4 w-4" />}
                                    Confirmar la importación
                                </button>
                                <button type="button" onClick={() => setConfirmando(false)}
                                    className="rounded-lg border border-gray-300 bg-white px-4 py-2 text-sm font-semibold text-gray-700">
                                    Cancelar
                                </button>
                            </div>
                        </div>
                    )}
                </div>
            )}

            {/* ── Paso 4: resultado ─────────────────────────────────── */}
            {vista === 'importar' && paso === 4 && resultado && (
                <div className="space-y-4">
                    <div className="rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-900">
                        <p className="font-bold">Lote importado.</p>
                        <p>
                            {resultado.totals.importadas} registro(s) creados · {resultado.totals.completadas} existentes completados ·{' '}
                            {resultado.totals.omitidas} omitidos · {resultado.totals.errores} con errores.
                            Los registros creados ya aparecen en la pestaña <strong>Inscripciones COLROTARIOS</strong>, marcados «Importación histórica».
                        </p>
                    </div>
                    <div className="max-h-80 overflow-y-auto rounded-xl border border-gray-200 bg-white">
                        <table className="w-full text-left text-xs">
                            <thead><tr className="border-b border-gray-100 uppercase tracking-wide text-gray-400">
                                <th className="px-3 py-2">Fila</th><th className="px-3 py-2">Resultado</th><th className="px-3 py-2">Código / motivo</th>
                            </tr></thead>
                            <tbody>{(resultado.outcomes || []).map((o: any) => (
                                <tr key={o.n} className="border-b border-gray-50 last:border-0">
                                    <td className="px-3 py-2 font-mono text-gray-500">{o.n}</td>
                                    <td className="px-3 py-2">
                                        <span className={`rounded-full px-2 py-0.5 font-bold ${o.outcome === 'importada' ? 'bg-emerald-50 text-emerald-700' : o.outcome === 'completada' ? 'bg-blue-50 text-blue-700' : 'bg-gray-100 text-gray-600'}`}>
                                            {o.outcome === 'importada' ? 'Importada' : o.outcome === 'completada' ? 'Registro existente completado' : 'Omitida'}
                                        </span>
                                    </td>
                                    <td className="px-3 py-2 text-gray-500" data-no-translate>{o.code || o.motivo || '—'}</td>
                                </tr>
                            ))}</tbody>
                        </table>
                    </div>
                    <button type="button" onClick={reiniciar}
                        className="rounded-lg border border-gray-300 bg-white px-4 py-2 text-sm font-semibold text-gray-700 transition hover:bg-gray-50">
                        Importar otro archivo
                    </button>
                </div>
            )}

            {vista === 'importar' && paso === 3 && pre && pre.rows.some(r => r.duplicate.kind !== 'nuevo') && (
                <p className="flex items-start gap-1.5 text-xs text-gray-400">
                    <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                    Ningún duplicado se crea ni se sobrescribe en silencio: «Completar el registro existente» sólo rellena campos vacíos.
                </p>
            )}
        </div>
    );
};

export default EventImportWizard;
