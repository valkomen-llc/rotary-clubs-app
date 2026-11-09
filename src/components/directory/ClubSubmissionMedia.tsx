// ════════════════════════════════════════════════════════════════════
// Archivos de una solicitud del Directorio — vista del PANEL — v4.1306.0
//
// En la ficha de la solicitud (Directorio de Clubes y Rotary en Acción →
// Directorio): logotipo, portada y galería con su miniatura, su estado y su
// tamaño; también lo que FALLÓ o el club quitó en el camino, para poder
// explicarle qué pasó. Abrir y descargar van por la dirección estable (firmada
// mientras la solicitud no se aprueba).
// ════════════════════════════════════════════════════════════════════
import React, { useEffect, useState } from 'react';
import { AlertTriangle, CheckCircle2, ExternalLink, Download, Image as ImageIcon, Loader2 } from 'lucide-react';
import { fetchSubmissionMedia, displayUrl, type ClubMedia } from '../../lib/clubMediaUpload';
import { formatBytes } from '../../lib/clubMediaSpec';

type Row = ClubMedia & { inSubmission: boolean; attempts?: number; createdAt?: string };

const ROLE_ORDER: Record<string, number> = { logo: 0, cover: 1, gallery: 2 };

const statusTone = (m: Row) => {
    if (m.status === 'publicado') return 'bg-emerald-50 text-emerald-700 border-emerald-200';
    if (m.status === 'guardado') return 'bg-blue-50 text-rotary-blue border-blue-200';
    if (m.status === 'error') return 'bg-red-50 text-red-700 border-red-200';
    return 'bg-gray-100 text-gray-600 border-gray-200';
};

export const ClubSubmissionMedia: React.FC<{ submissionId: string; legacyPayload?: any }> = ({ submissionId, legacyPayload }) => {
    const [rows, setRows] = useState<Row[] | null>(null);
    const [error, setError] = useState<string | null>(null);

    useEffect(() => {
        let alive = true;
        setRows(null);
        setError(null);
        fetchSubmissionMedia(submissionId)
            .then((list) => { if (alive) setRows(list as Row[]); })
            .catch((e) => { if (alive) setError(e?.message || 'No se pudieron cargar los archivos.'); });
        return () => { alive = false; };
    }, [submissionId]);

    // Imágenes que la solicitud trae pero que no son del módulo (perfiles
    // anteriores a v4.1306 o enlaces externos): se muestran igual.
    const legacy: Array<{ role: string; url: string }> = [];
    if (legacyPayload) {
        const isModule = (u: string) => /\/district-clubs\/media\/|\/directorio-clubes\//.test(u || '');
        if (legacyPayload.logoUrl && !isModule(legacyPayload.logoUrl)) legacy.push({ role: 'Logotipo', url: legacyPayload.logoUrl });
        if (legacyPayload.coverImageUrl && !isModule(legacyPayload.coverImageUrl)) legacy.push({ role: 'Portada', url: legacyPayload.coverImageUrl });
        for (const g of Array.isArray(legacyPayload.gallery) ? legacyPayload.gallery : []) if (g?.url && !isModule(g.url)) legacy.push({ role: 'Galería', url: g.url });
    }

    const sorted = (rows || []).slice().sort((a, b) => (Number(b.inSubmission) - Number(a.inSubmission)) || (ROLE_ORDER[a.role] - ROLE_ORDER[b.role]));
    const used = sorted.filter(r => r.inSubmission);
    const other = sorted.filter(r => !r.inSubmission);
    const failedCount = other.filter(r => r.status === 'error').length;

    const card = (m: Row) => (
        <div key={m.id} className="rounded-xl border border-gray-200 bg-white overflow-hidden">
            <div className="aspect-video bg-[repeating-conic-gradient(#f3f4f6_0%_25%,#fff_0%_50%)] bg-[length:12px_12px] flex items-center justify-center">
                {m.url ? (
                    <img src={displayUrl(m.url)} alt={m.name} className={`w-full h-full ${m.role === 'logo' ? 'object-contain p-2' : 'object-cover'}`} loading="lazy" />
                ) : m.status === 'error' ? (
                    <AlertTriangle className="w-6 h-6 text-red-500" />
                ) : (
                    <ImageIcon className="w-6 h-6 text-gray-400" />
                )}
            </div>
            <div className="p-2.5 space-y-1">
                <div className="flex items-center justify-between gap-1">
                    <span className="text-[10px] font-black uppercase tracking-wider text-gray-500">{m.roleLabel || m.role}</span>
                    <span className={`px-1.5 py-0.5 rounded-full border text-[10px] font-bold ${statusTone(m)}`}>{m.statusLabel}</span>
                </div>
                <p className="text-xs font-bold text-gray-900 truncate" title={m.name}>{m.name}</p>
                <p className="text-[10px] text-gray-500">
                    {[m.bytes ? formatBytes(m.bytes) : (m.originalBytes ? formatBytes(m.originalBytes) : null), m.width && m.height ? `${m.width}×${m.height}` : null, m.converted ? 'HEIC → JPG' : null].filter(Boolean).join(' · ')}
                </p>
                {m.status === 'error' && m.error && <p className="text-[10px] text-red-700">{m.error}</p>}
                {m.url && (
                    <div className="flex gap-3 pt-1">
                        <a href={displayUrl(m.viewUrl || m.url)} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 text-[10px] font-bold text-rotary-blue hover:underline">
                            <ExternalLink className="w-3 h-3" /> Abrir
                        </a>
                        <a href={`${displayUrl(m.viewUrl || m.url)}?download=1`} className="inline-flex items-center gap-1 text-[10px] font-bold text-gray-600 hover:underline">
                            <Download className="w-3 h-3" /> Descargar
                        </a>
                    </div>
                )}
            </div>
        </div>
    );

    return (
        <div className="space-y-3">
            <div className="flex items-center justify-between">
                <span className="text-xs font-black text-gray-700 uppercase tracking-wider">Archivos del registro</span>
                {rows && (
                    <span className="inline-flex items-center gap-1 text-[11px] font-bold text-gray-500">
                        <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600" /> {used.length} en la solicitud
                        {failedCount > 0 && <span className="text-red-600"> · {failedCount} con error</span>}
                    </span>
                )}
            </div>
            {!rows && !error && <div className="flex items-center gap-2 text-xs text-gray-500"><Loader2 className="w-4 h-4 animate-spin" /> Cargando archivos…</div>}
            {error && <p className="text-xs text-red-600">{error}</p>}
            {rows && used.length === 0 && legacy.length === 0 && <p className="text-xs text-gray-500">La solicitud no trae archivos.</p>}
            {used.length > 0 && <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">{used.map(card)}</div>}
            {legacy.length > 0 && (
                <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                    {legacy.map((l, i) => (
                        <a key={`${l.url}-${i}`} href={l.url} target="_blank" rel="noreferrer" className="rounded-xl border border-gray-200 bg-white overflow-hidden block">
                            <img src={l.url} alt={l.role} className="w-full aspect-video object-cover" loading="lazy" />
                            <p className="p-2 text-[10px] font-bold text-gray-600">{l.role} · imagen existente</p>
                        </a>
                    ))}
                </div>
            )}
            {other.length > 0 && (
                <details className="rounded-xl border border-gray-200 bg-gray-50 p-3">
                    <summary className="text-[11px] font-bold text-gray-600 cursor-pointer">
                        Otros archivos subidos durante el borrador ({other.length}: reemplazados, eliminados o fallidos)
                    </summary>
                    <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 mt-3">{other.map(card)}</div>
                </details>
            )}
        </div>
    );
};

export default ClubSubmissionMedia;
