// Audiencia de la campaña (v4.1171, FASE 2).
// Solo lectura con datos existentes: modo, ámbito, reglas/fuentes, foto fija,
// excluidos, manuales y estimación actual (POST /:id/preview).
import React, { useCallback, useEffect, useState } from 'react';
import { toast } from 'sonner';

const API = import.meta.env.VITE_API_URL || '/api';

const CampaignAudience: React.FC<{ campaign: any; headers: Record<string, string> }> = ({ campaign: c, headers: H }) => {
  const [estimada, setEstimada] = useState<number | null>(null);
  const [loading, setLoading] = useState(false);

  const load = useCallback(async () => {
    if (!c?.id || c.audienceMode === 'fixed') return;
    setLoading(true);
    try {
      const r = await fetch(`${API}/content-activation/${c.id}/preview`, {
        method: 'POST', headers: { ...H, 'Content-Type': 'application/json' }, body: JSON.stringify({}),
      });
      const d = await r.json();
      if (r.ok && typeof d?.preview?.estimada === 'number') setEstimada(d.preview.estimada);
    } catch {
      toast.error('No se pudo estimar la audiencia');
    } finally {
      setLoading(false);
    }
  }, [c?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => { load(); }, [load]);
  if (!c) return null;
  const rules = c.audienceDef?.rules || [];
  const sources = c.audienceDef?.sources || [];
  const snap = Array.isArray(c.audienceSnapshot) ? c.audienceSnapshot : [];

  return (
    <div className="mt-4 grid md:grid-cols-2 gap-2 text-xs">
      <div className="border rounded-2xl p-4 space-y-1">
        <div className="text-[11px] text-gray-400 uppercase font-bold tracking-wider">Modo y ámbito</div>
        <div>Modo: <b>{c.audienceMode === 'fixed' ? 'Fija (foto congelada)' : 'Dinámica (se recalcula por ejecución)'}</b></div>
        <div>Ámbito: <b>{c.scopeDef?.type || '—'}</b> {(c.scopeDef?.ids || []).length ? `· ${(c.scopeDef.ids || []).length} seleccionado(s)` : ''}</div>
        <div>Fuentes: {(sources.length ? sources : ['—']).join(', ')}</div>
      </div>
      <div className="border rounded-2xl p-4 space-y-1">
        <div className="text-[11px] text-gray-400 uppercase font-bold tracking-wider">Destinatarios</div>
        {c.audienceMode === 'fixed'
          ? <div>Foto fija: <b>{snap.length}</b> contacto(s)</div>
          : <div>Estimación actual: <b>{loading ? '…' : estimada ?? '—'}</b></div>}
        <div>Excluidos: <b>{(c.excludedContactIds || []).length}</b> · Manuales: <b>{(c.manualRecipients || []).length}</b></div>
        {rules.length > 0 && (
          <div>
            <div className="text-gray-400 mt-1">Reglas:</div>
            <ul className="list-disc ml-4">{rules.map((r: any, i: number) => <li key={i}>{r.field} {r.op} {String(r.value)}</li>)}</ul>
          </div>
        )}
      </div>
    </div>
  );
};

export default CampaignAudience;
