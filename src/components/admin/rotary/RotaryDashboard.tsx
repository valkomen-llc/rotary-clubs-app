// Tablero de Rotary en Acción (v4.1124): KPIs, serie temporal, participación,
// ranking, sin reportar, impacto y macro. Todo sale del endpoint /dashboard;
// acá solo se pinta. Sin librerías de gráficas: SVG propio, sin dependencias.
import React from 'react';

export const TIPO_META: Record<string, { icon: string; label: string }> = {
  proyecto: { icon: '🏗️', label: 'Proyecto u obra' },
  actividad: { icon: '🤝', label: 'Actividad o jornada' },
  evento: { icon: '📅', label: 'Evento' },
  'historia-servicio': { icon: '💙', label: 'Historia de servicio' },
  emergencia: { icon: '🚨', label: 'Emergencia' },
  campana: { icon: '📣', label: 'Campaña' },
  reconocimiento: { icon: '🏆', label: 'Reconocimiento' },
  alianza: { icon: '🤜🤛', label: 'Alianza' },
  juventud: { icon: '🌱', label: 'Actividad juvenil' },
  capacitacion: { icon: '🎓', label: 'Capacitación' },
  recaudacion: { icon: '💰', label: 'Recaudación' },
  testimonio: { icon: '💬', label: 'Testimonio' },
  convocatoria: { icon: '📢', label: 'Convocatoria' },
  'proyecto-internacional': { icon: '🌍', label: 'Proyecto internacional' },
  otra: { icon: '✨', label: 'Otra acción' },
  sin_clasificar: { icon: '❔', label: 'Sin clasificar' },
};
export const tipoLabel = (k: string) => TIPO_META[k]?.label || k;
export const tipoIcon = (k: string) => TIPO_META[k]?.icon || '❔';

export const IMPACTO_META: Record<string, string> = {
  beneficiarios: 'Beneficiarios reportados', voluntarios: 'Voluntarios',
  horas: 'Horas de servicio', fondosRecaudados: 'Fondos recaudados',
  fondosInvertidos: 'Fondos invertidos', capacitados: 'Personas capacitadas',
  recursos: 'Recursos movilizados', aliados: 'Aliados', organizaciones: 'Organizaciones',
  clubes: 'Clubes participantes', ubicaciones: 'Ubicaciones', actividades: 'Actividades',
  resultados: 'Resultados',
};

const fmtN = (n: any) => Number(n || 0).toLocaleString('es-CO');
const fmtF = (v?: string | null) => v ? new Date(v).toLocaleDateString('es-CO', { day: 'numeric', month: 'short', year: 'numeric' }) : '—';

const TARJ = 'bg-white rounded-2xl border border-gray-100 shadow-sm p-4';
const TIT = 'text-xs font-black text-gray-800 uppercase tracking-wider mb-3';

export const Kpis: React.FC<{ dash: any; on: (a: string) => void }> = ({ dash, on }) => {
  const k = dash?.kpis || {};
  const cards = [
    { id: 'solicitudes', t: 'Solicitudes recibidas', v: fmtN(k.solicitudes), tip: 'Aportes en el período con los filtros aplicados.' },
    { id: 'clubes', t: 'Clubes participantes', v: `${fmtN(k.clubes)} de ${fmtN(k.universo)}`, tip: 'Clubes distintos con al menos un aporte, contra el universo del distrito.' },
    { id: 'pct', t: 'Participación de clubes', v: `${k.pct ?? 0} %`, tip: 'Porcentaje del universo con aportes. Sin reportar = sin envíos en el período, no un juicio sobre el club.' },
    { id: 'sin', t: 'Clubes sin reportar', v: fmtN(k.sinReportar), tip: 'Clubes del universo sin envíos en el período seleccionado.' },
    { id: 'pub', t: 'Publicadas', v: fmtN(k.publicadas), tip: 'Solicitudes en estado publicado en el período.' },
  ];
  return (
    <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-5 gap-3">
      {cards.map((c) => (
        <button key={c.id} title={c.tip} onClick={() => on(c.id)} className={`${TARJ} text-left hover:border-rotary-blue/40 transition-colors`}>
          <div className="text-[10px] font-black text-gray-400 uppercase tracking-wider" title={c.tip}>{c.t}</div>
          <div className="text-2xl font-black text-gray-900 mt-1">{c.v}</div>
        </button>
      ))}
    </div>
  );
};

export const Serie: React.FC<{ dash: any }> = ({ dash }) => {
  const s: Array<{ k: string; n: number }> = dash?.serie || [];
  if (!s.length) return <div className={TARJ}><div className={TIT}>Actividad reportada</div><p className="text-xs text-gray-400">Sin datos en el período.</p></div>;
  const max = Math.max(...s.map((x) => x.n), 1);
  const W = 560, H = 140, P = 24;
  const bw = (W - P * 2) / s.length;
  return (
    <div className={TARJ}>
      <div className={TIT}>Actividad reportada · {dash?.periodo?.gran || ''}</div>
      <svg viewBox={`0 0 ${W} ${H}`} className="w-full h-36" role="img" aria-label="Aportes por período">
        {[0.25, 0.5, 0.75, 1].map((f) => (
          <line key={f} x1={P} x2={W - 8} y1={H - 20 - (H - 44) * f} y2={H - 20 - (H - 44) * f} stroke="#f1f5f9" strokeWidth="1" />
        ))}
        {s.map((b, i) => {
          const h = Math.max(3, ((H - 44) * b.n) / max);
          return (
            <g key={b.k}>
              <title>{`${b.k}: ${b.n} aportes`}</title>
              <rect x={P + i * bw + 2} y={H - 20 - h} width={Math.max(2, bw - 4)} height={h} rx="3" fill="#0c3c7c" opacity={0.85} />
              {s.length <= 12 && <text x={P + i * bw + bw / 2} y={H - 6} fontSize="9" fill="#94a3b8" textAnchor="middle">{b.k.slice(2)}</text>}
            </g>
          );
        })}
      </svg>
    </div>
  );
};

export const TipoBars: React.FC<{ dash: any; onTipo: (k: string) => void; activo?: string }> = ({ dash, onTipo, activo }) => {
  const t: Array<{ k: string; n: number; pct: number }> = dash?.porTipo || [];
  if (!t.length) return <div className={TARJ}><div className={TIT}>Distribución por tipo</div><p className="text-xs text-gray-400">Sin datos.</p></div>;
  const max = Math.max(...t.map((x) => x.n), 1);
  return (
    <div className={TARJ}>
      <div className={TIT}>Distribución por tipo · clic para filtrar</div>
      <div className="space-y-2">
        {t.slice(0, 10).map((x) => (
          <button key={x.k} onClick={() => onTipo(x.k)} title={`${x.n} aportes (${x.pct} %). Clic para filtrar la bandeja.`}
            className={`w-full text-left group ${activo === x.k ? 'outline outline-2 outline-rotary-blue rounded-lg' : ''}`}>
            <div className="flex items-center gap-2 text-xs">
              <span aria-hidden>{tipoIcon(x.k)}</span>
              <span className="font-bold text-gray-700 truncate flex-1">{tipoLabel(x.k)}</span>
              <span className="text-gray-400">{x.n} · {x.pct}%</span>
            </div>
            <div className="h-2 bg-gray-100 rounded-full mt-1 overflow-hidden">
              <div className="h-full bg-rotary-blue/80 rounded-full group-hover:bg-rotary-blue transition-all" style={{ width: `${Math.max(2, (100 * x.n) / max)}%` }} />
            </div>
          </button>
        ))}
      </div>
    </div>
  );
};

export const Ranking: React.FC<{ dash: any; onClub: (c: any) => void }> = ({ dash, onClub }) => {
  const r: any[] = dash?.ranking || [];
  if (!r.length) return <div className={TARJ}><div className={TIT}>Clubes con mayor actividad reportada</div><p className="text-xs text-gray-400">Sin datos.</p></div>;
  return (
    <div className={TARJ}>
      <div className={TIT}>Clubes con mayor actividad reportada</div>
      <p className="text-[11px] text-gray-400 -mt-2 mb-2">Solo volumen registrado. Más aportes no significa mayor impacto.</p>
      <div className="overflow-x-auto">
        <table className="w-full text-xs">
          <thead><tr className="text-left text-[10px] font-black text-gray-400 uppercase">
            <th className="py-1.5 pr-2">Club</th><th className="py-1.5 pr-2 text-right">Aportes</th>
            <th className="py-1.5 pr-2 text-right">Publicados</th><th className="py-1.5 pr-2 text-right">En revisión</th>
            <th className="py-1.5 text-right">Último aporte</th>
          </tr></thead>
          <tbody>
            {r.slice(0, 12).map((c) => (
              <tr key={c.key} className="border-t border-gray-50 hover:bg-sky-50/40">
                <td className="py-1.5 pr-2"><button onClick={() => onClub(c)} className="font-bold text-gray-800 hover:text-rotary-blue text-left" title="Ver resumen del club">{c.name}</button></td>
                <td className="py-1.5 pr-2 text-right font-black">{c.aportes}</td>
                <td className="py-1.5 pr-2 text-right">{c.publicados}</td>
                <td className="py-1.5 pr-2 text-right">{c.enRevision}</td>
                <td className="py-1.5 text-right text-gray-500">{fmtF(c.ultimo)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
};

export const SinReportar: React.FC<{ dash: any; onClub: (c: any) => void }> = ({ dash, onClub }) => {
  const r: any[] = dash?.sinReportar || [];
  return (
    <div className={TARJ}>
      <div className={TIT}>Clubes sin actividad reportada · {r.length}</div>
      <p className="text-[11px] text-gray-400 -mt-2 mb-2">Sin envíos en el período. No equivale a inactividad rotaria.</p>
      {r.length === 0 ? <p className="text-xs text-emerald-600 font-bold">Todos los clubes reportaron en el período. 🎉</p> : (
        <div className="overflow-auto max-h-72">
          <table className="w-full text-xs">
            <thead className="sticky top-0 bg-white"><tr className="text-left text-[10px] font-black text-gray-400 uppercase">
              <th className="py-1.5 pr-2">Club</th><th className="py-1.5 pr-2">Ciudad</th>
              <th className="py-1.5 pr-2 text-right">Último aporte</th><th className="py-1.5 text-right">Estado</th>
            </tr></thead>
            <tbody>
              {r.map((c) => (
                <tr key={`${c.district}-${c.name}`} className="border-t border-gray-50">
                  <td className="py-1.5 pr-2"><button onClick={() => onClub({ name: c.name, district: c.district, aportes: 0, publicados: 0, enRevision: 0, ultimo: c.ultimo })} className="font-bold text-gray-700 hover:text-rotary-blue text-left">{c.name}</button></td>
                  <td className="py-1.5 pr-2 text-gray-500">—</td>
                  <td className="py-1.5 pr-2 text-right text-gray-500">{c.ultimo ? fmtF(c.ultimo) : 'Sin registros'}{c.dias != null ? ` · ${c.dias}d` : ''}</td>
                  <td className="py-1.5 text-right">{c.estado === 'nunca'
                    ? <span className="text-[10px] font-black uppercase text-gray-400">Sin participación</span>
                    : <span className="text-[10px] font-black uppercase text-amber-600">Inactivo en el período</span>}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
};

export const Impacto: React.FC<{ dash: any }> = ({ dash }) => {
  const m: Array<{ k: string; total: number; reportes: number }> = dash?.impacto || [];
  if (!m.length) return <div className={TARJ}><div className={TIT}>Impacto reportado por los clubes</div><p className="text-xs text-gray-400">Aún no hay métricas reportadas en el período.</p></div>;
  return (
    <div className={TARJ}>
      <div className={TIT}>Impacto reportado por los clubes</div>
      <p className="text-[11px] text-gray-400 -mt-2 mb-3">Solo datos reportados. Vacío ≠ 0.</p>
      <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
        {m.slice(0, 8).map((x) => (
          <div key={x.k} className="border border-gray-100 rounded-xl p-3" title={`Reportado por ${x.reportes} aporte(s)`}>
            <div className="text-[10px] font-black text-gray-400 uppercase">{IMPACTO_META[x.k] || x.k}</div>
            <div className="text-xl font-black text-gray-900">{fmtN(x.total)}</div>
            <div className="text-[10px] text-gray-400">reportado por {x.reportes}</div>
          </div>
        ))}
      </div>
    </div>
  );
};

export const Macro: React.FC<{ dash: any }> = ({ dash }) => {
  const m: any[] = dash?.macro || [];
  if (!m.length) return null;
  return (
    <div className={TARJ}>
      <div className={TIT}>Comparativa entre distritos</div>
      <div className="overflow-x-auto">
        <table className="w-full text-xs">
          <thead><tr className="text-left text-[10px] font-black text-gray-400 uppercase">
            <th className="py-1.5 pr-2">Distrito</th><th className="py-1.5 pr-2 text-right">Clubes</th>
            <th className="py-1.5 pr-2 text-right">Participantes</th><th className="py-1.5 pr-2 text-right">% part.</th>
            <th className="py-1.5 pr-2 text-right">Aportes</th><th className="py-1.5 text-right">Aportes/club</th>
          </tr></thead>
          <tbody>
            {m.map((d) => (
              <tr key={d.district} className="border-t border-gray-50">
                <td className="py-1.5 pr-2 font-bold">Distrito {d.district}</td>
                <td className="py-1.5 pr-2 text-right">{d.universo}</td>
                <td className="py-1.5 pr-2 text-right">{d.participantes}</td>
                <td className="py-1.5 pr-2 text-right font-black">{d.pct} %</td>
                <td className="py-1.5 pr-2 text-right">{d.aportes}</td>
                <td className="py-1.5 text-right">{d.porClub}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
};

export const ClubDrawer: React.FC<{ club: any; onClose: () => void; onVerAportes: (name: string) => void }> = ({ club, onClose, onVerAportes }) => {
  if (!club) return null;
  return (
    <div className="fixed inset-0 z-50 bg-black/40 flex items-center justify-center p-4" onClick={onClose}>
      <div className="bg-white rounded-2xl max-w-md w-full p-5" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-start justify-between gap-2">
          <div>
            <h3 className="font-black text-gray-900">{club.name}</h3>
            <p className="text-xs text-gray-400">Distrito {club.district} · Rotary en Acción</p>
          </div>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 text-xl leading-none" aria-label="Cerrar">×</button>
        </div>
        <div className="grid grid-cols-3 gap-2 mt-4 text-center">
          {[{ l: 'Aportes', v: club.aportes ?? 0 }, { l: 'Publicados', v: club.publicados ?? 0 }, { l: 'En revisión', v: club.enRevision ?? 0 }].map((x) => (
            <div key={x.l} className="border border-gray-100 rounded-xl p-2">
              <div className="text-lg font-black">{x.v}</div>
              <div className="text-[10px] text-gray-400 uppercase font-black">{x.l}</div>
            </div>
          ))}
        </div>
        <p className="text-xs text-gray-500 mt-3">Último aporte: <b>{fmtF(club.ultimo)}</b>{club.ciudad ? ` · ${club.ciudad}` : ''}</p>
        <button onClick={() => onVerAportes(club.name)} className="mt-4 w-full px-4 py-2.5 rounded-xl bg-rotary-blue text-white text-xs font-black">
          VER APORTES EN LA BANDEJA
        </button>
      </div>
    </div>
  );
};
