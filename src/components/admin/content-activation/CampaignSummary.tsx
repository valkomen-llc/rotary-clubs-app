// Resumen unificado de la campaña (v4.1171, FASE 2).
// Una sola fuente: `GET /content-activation/:id/summary`. Responde de un
// vistazo: estado, objetivo, período, próximo envío, enviadas, alcanzados,
// conversiones, tasa, mejor comunicación y recomendación principal.
import React, { useCallback, useEffect, useState } from 'react';
import { toast } from 'sonner';

const API = import.meta.env.VITE_API_URL || '/api';

const Card: React.FC<{ label: string; value: React.ReactNode; hint?: string }> = ({ label, value, hint }) => (
  <div className="bg-white border rounded-2xl p-4">
    <div className="text-[11px] text-gray-400 uppercase font-bold tracking-wider">{label}</div>
    <div className="text-xl font-black text-gray-800 mt-1">{value}</div>
    {hint && <div className="text-[11px] text-gray-400 mt-1">{hint}</div>}
  </div>
);

const CampaignSummary: React.FC<{ campaignId: string; headers: Record<string, string> }> = ({ campaignId, headers: H }) => {
  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const r = await fetch(`${API}/content-activation/${campaignId}/summary`, { headers: H });
      const d = await r.json();
      if (!r.ok) throw new Error(d.error || 'No se pudo cargar el resumen');
      setData(d);
    } catch (e: any) {
      toast.error(e.message);
    } finally {
      setLoading(false);
    }
  }, [campaignId]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => { load(); }, [load]);

  if (loading) return <div className="mt-4 text-xs text-gray-400">Armando el resumen…</div>;
  if (!data) return null;
  const c = data.campaign || {};
  const px = data.proximoEnvio;

  return (
    <div className="mt-4 space-y-3">
      <div className="border rounded-2xl p-4 text-sm bg-gray-50/50">
        <div className="font-bold text-base">{c.name}</div>
        {c.objetivo && <div className="text-xs text-gray-600 mt-1">Objetivo: {c.objetivo}</div>}
        <div className="text-xs text-gray-500 mt-1">
          Estado: <b>{c.status}</b> · Período: {c.startAt ? new Date(c.startAt).toLocaleDateString('es-CO') : '—'} → {c.endAt ? new Date(c.endAt).toLocaleDateString('es-CO') : 'sin fin'} · {c.timezone} · {c.frecuencia}
        </div>
      </div>
      <div className="grid grid-cols-2 md:grid-cols-4 gap-2 text-xs">
        <Card label="Próximo envío" value={px ? `${px.fecha} ${px.hora}` : '—'} hint={px ? `${px.stepName} · ${px.channel}` : 'sin futuras proyectadas'} />
        <Card label="Enviadas" value={data.comunicaciones?.enviadas ?? 0} hint={`de ${data.comunicaciones?.proyectadas ?? 0} proyectadas`} />
        <Card label="Destinatarios" value={data.destinatarios ?? 0} hint="únicos alcanzados" />
        <Card label="Conversiones" value={data.conversiones ?? 0} hint={`tasa ${data.tasaConversion ?? 0}% sobre destinatarios`} />
      </div>
      <div className="grid md:grid-cols-2 gap-2 text-xs">
        <div className="border rounded-2xl p-4">
          <div className="text-[11px] text-gray-400 uppercase font-bold tracking-wider mb-1">Mejor comunicación</div>
          {data.mejorComunicacion
            ? <div><b>{data.mejorComunicacion.paso}</b> · {data.mejorComunicacion.envios} envío(s) registrados</div>
            : <div className="text-gray-400">Aún sin envíos registrados.</div>}
        </div>
        <div className="border rounded-2xl p-4 bg-violet-50/50 border-violet-100">
          <div className="text-[11px] text-violet-400 uppercase font-bold tracking-wider mb-1">Recomendación principal</div>
          {data.recomendacion
            ? <div>{typeof data.recomendacion === 'string' ? data.recomendacion : data.recomendacion.detail || JSON.stringify(data.recomendacion)}</div>
            : <div className="text-gray-400">Todavía no hay suficientes datos para recomendar.</div>}
        </div>
      </div>
    </div>
  );
};

export default CampaignSummary;
