// Historial de Visitas del Gobernador en la ficha administrativa de un club
// del Directorio (v4.1260). La relación es `GovernorVisit.clubProfileId` →
// `DistrictClubProfile.id`; la gestión vive en Rotary en Acción.
import React, { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { ArrowRight, CalendarCheck, CheckCircle2, RefreshCw } from 'lucide-react';
import { leerJson } from '../../../lib/leerJson';
import { visitDateLabel, visitStateChip } from '../../../lib/governorVisitSpec';

const API = import.meta.env.VITE_API_URL || '/api';

interface Visita {
  id: string; publicRef: string; status: string; statusLabel: string; visitDate: string; governorName: string;
  title: string; venue?: string; mediaCount: number; contributionSubmissionId?: string | null;
}

const ClubGovernorVisitsPanel: React.FC<{ profileId: string; token: string }> = ({ profileId, token }) => {
  const [visitas, setVisitas] = useState<Visita[] | null>(null);
  const [error, setError] = useState('');

  useEffect(() => {
    let vivo = true;
    setVisitas(null);
    setError('');
    (async () => {
      try {
        const r = await fetch(`${API}/rotary-en-accion/visitas-gobernador/admin/by-club/${encodeURIComponent(profileId)}`, {
          headers: { Authorization: `Bearer ${token}` },
        });
        const { data } = await leerJson<{ visits?: Visita[]; error?: string }>(r);
        if (!vivo) return;
        if (!r.ok) { setError(data?.error || `No se pudo cargar el historial (${r.status}).`); setVisitas([]); return; }
        setVisitas(data?.visits || []);
      } catch {
        if (vivo) { setError('Sin conexión con el servidor.'); setVisitas([]); }
      }
    })();
    return () => { vivo = false; };
  }, [profileId, token]);

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <span className="text-xs font-black uppercase text-gray-500">Historial de visitas del Gobernador</span>
        <Link to="/admin/rotary-en-accion?tab=visitas" className="text-xs font-bold text-rotary-blue hover:underline inline-flex items-center gap-1">
          Gestionar en Rotary en Acción <ArrowRight className="w-3.5 h-3.5" />
        </Link>
      </div>
      {visitas === null && (
        <div className="py-8 text-center text-gray-400 text-xs"><RefreshCw className="w-5 h-5 animate-spin mx-auto mb-2 text-rotary-blue" />Cargando visitas…</div>
      )}
      {error && <p className="text-xs text-red-600">{error}</p>}
      {visitas && visitas.length === 0 && !error && (
        <div className="text-center py-8 bg-gray-50 rounded-2xl border border-gray-100 text-gray-400 text-xs">
          <CalendarCheck className="w-8 h-8 text-gray-300 mx-auto mb-2" />
          Este club no tiene visitas del Gobernador reportadas.
        </div>
      )}
      {visitas && visitas.length > 0 && (
        <ol className="space-y-2">
          {visitas.map((v) => (
            <li key={v.id} className="p-4 bg-gray-50 rounded-2xl border border-gray-100 text-xs flex flex-col sm:flex-row sm:items-center justify-between gap-2">
              <div className="min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="font-mono font-bold text-rotary-blue">{v.publicRef}</span>
                  <span className={`px-2 py-0.5 rounded-full text-[10px] font-black uppercase border ${visitStateChip(v.status)}`}>{v.statusLabel}</span>
                  {v.contributionSubmissionId && <span className="text-[10px] font-bold text-blue-700 inline-flex items-center gap-1"><CheckCircle2 className="w-3 h-3" /> En Rotary en Acción</span>}
                </div>
                <p className="text-gray-800 font-bold mt-1 truncate">{v.title}</p>
                <p className="text-gray-500 mt-0.5">{visitDateLabel(v.visitDate)} · Gob. {v.governorName}{v.venue ? ` · ${v.venue}` : ''} · {v.mediaCount} archivo(s)</p>
              </div>
            </li>
          ))}
        </ol>
      )}
    </div>
  );
};

export default ClubGovernorVisitsPanel;
