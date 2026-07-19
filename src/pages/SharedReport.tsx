import React, { useEffect, useRef, useState } from 'react';
import { useParams } from 'react-router-dom';
import { Loader2, FileDown, AlertTriangle } from 'lucide-react';
import ExecutiveReportView from '../components/admin/insights/ExecutiveReportView';
import { exportReportPdf } from '../lib/reportPdf';
import type { ReportDataset } from '../lib/reportTypes';

const API = import.meta.env.VITE_API_URL || '/api';

const SharedReport: React.FC = () => {
    const { token } = useParams<{ token: string }>();
    const [datasets, setDatasets] = useState<ReportDataset[] | null>(null);
    const [idx, setIdx] = useState(0);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState(false);
    const [exporting, setExporting] = useState(false);
    const ref = useRef<HTMLDivElement>(null);

    useEffect(() => {
        (async () => {
            try {
                const r = await fetch(`${API}/reports/shared/${token}`);
                if (!r.ok) throw new Error();
                const d = await r.json();
                const arr = Array.isArray(d.report.dataset) ? d.report.dataset : [d.report.dataset];
                if (d.report.narrative && Array.isArray(d.report.narrative)) arr.forEach((ds: ReportDataset, i: number) => { if (!ds.narrative) ds.narrative = d.report.narrative[i]; });
                setDatasets(arr);
            } catch { setError(true); } finally { setLoading(false); }
        })();
    }, [token]);

    const download = async () => {
        if (!ref.current || !datasets) return;
        try { setExporting(true); await exportReportPdf(ref.current, `informe-${datasets[idx].meta.site.name}`); } finally { setExporting(false); }
    };

    if (loading) return <div className="min-h-screen flex items-center justify-center bg-slate-50"><Loader2 className="w-8 h-8 animate-spin text-slate-300" /></div>;
    if (error || !datasets) return (
        <div className="min-h-screen flex flex-col items-center justify-center bg-slate-50 text-slate-400 p-8 text-center">
            <AlertTriangle className="w-14 h-14 mb-4 opacity-30" />
            <p className="font-bold text-slate-600">Informe no disponible</p>
            <p className="text-sm mt-1">El enlace puede haber expirado o el informe ya no es público.</p>
        </div>
    );

    return (
        <div className="min-h-screen bg-slate-50 py-6">
            <div className="max-w-[900px] mx-auto px-4 mb-4 flex items-center justify-between gap-3">
                {datasets.length > 1 ? (
                    <div className="flex gap-2 overflow-x-auto">
                        {datasets.map((d, i) => (
                            <button key={i} onClick={() => setIdx(i)} className={`px-3 py-1.5 rounded-lg text-xs font-bold whitespace-nowrap ${idx === i ? 'bg-[#0c3c7c] text-white' : 'bg-white border border-slate-200 text-slate-600'}`}>{d.meta.site.name}</button>
                        ))}
                    </div>
                ) : <span />}
                <button onClick={download} disabled={exporting} className="flex items-center gap-2 px-4 py-2 rounded-xl bg-[#0c3c7c] text-white text-sm font-bold shadow hover:shadow-md disabled:opacity-60 shrink-0">
                    {exporting ? <Loader2 className="w-4 h-4 animate-spin" /> : <FileDown className="w-4 h-4" />} Descargar PDF
                </button>
            </div>
            <div className="max-w-[900px] mx-auto px-4">
                <div className="rounded-3xl overflow-hidden border border-slate-200 shadow-lg bg-white">
                    <ExecutiveReportView dataset={datasets[idx]} innerRef={ref} />
                </div>
            </div>
        </div>
    );
};

export default SharedReport;
