// ════════════════════════════════════════════════════════════════════════════
// Módulo Administrativo Especializado: Feria de Proyectos Colombia
// Sección integrada dentro de Rotary en Acción — Club Platform v4.1218.0
//
// 1. Bandeja especializada de solicitudes y proyectos de la Feria.
// 2. Consulta y diferenciación de proyectos nuevos vs actualizaciones.
// 3. Documentación de evolución, beneficiarios y línea de tiempo histórica.
// 4. Vinculación con postulaciones previas de la Feria sin duplicar registros.
// 5. Panel de métricas y trazabilidad específica (clubes, distritos, países, financiación).
// ════════════════════════════════════════════════════════════════════════════

import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Award, Search, Filter, RefreshCw, ExternalLink, Globe, Layers,
  CheckCircle2, Clock, AlertTriangle, ArrowRight, Eye, ChevronRight,
  TrendingUp, Users, DollarSign, Send, MessageSquare, Mail, Building2,
  Calendar, MapPin, Sparkles, X, Plus, HeartHandshake, Film, Image as ImageIcon,
  FileText, ShieldCheck, Flag, ArrowUpRight
} from 'lucide-react';
import { toast } from 'sonner';
import {
  ROTARY_AREAS_INTEREST, PROJECT_GOAL_OPTIONS, FAIR_EDITIONS,
  goalLabel, goalBadgeClass, type ProjectEvolution
} from '../../../lib/rotaryFeriaSpec';
import { stateChip, stateLabel } from '../../../lib/contentSubmissionSpec';
import { flagEmoji } from '../../../lib/countryPhones';

const API = import.meta.env.VITE_API_URL || '/api';
const getToken = () => localStorage.getItem('rotary_token');

export type FeriaSubtab = 'all' | 'nuevos' | 'avances' | 'historias' | 'financiacion' | 'alianzas' | 'listos' | 'publicados';

interface SubmissionFile {
  id: string;
  kind: 'image' | 'video';
  s3Key: string;
  filename: string;
}

interface FeriaSubmission {
  id: string;
  campaignId: string;
  status: string;
  senderName: string;
  senderEmail: string;
  senderPhone?: string | null;
  senderPhoneDial?: string | null;
  senderPhoneNational?: string | null;
  senderPhoneCountry?: string | null;
  district?: string | null;
  club?: string | null;
  role?: string | null;
  title: string;
  description?: string | null;
  story?: string | null;
  city?: string | null;
  location?: string | null;
  activityDate?: string | null;
  contentType?: string | null;
  areaFocus?: string | null;
  secondaryAreas?: string[] | null;
  submissionType?: string | null;
  projectGoalType?: string | null;
  projectStage?: string | null;
  projectStartYear?: string | null;
  projectTargetCommunity?: string | null;
  projectFairEdition?: string | null;
  projectFairSubmissionId?: string | null;
  projectId?: string | null;
  country?: string | null;
  projectEvolution?: ProjectEvolution | null;
  createdAt: string;
  updatedAt: string;
  imageCount: number;
  videoCount: number;
  files?: SubmissionFile[] | null;
}

interface FeriaResumen {
  total: number;
  clubesParticipantes: number;
  distritos: number;
  paises: number;
  nuevos: number;
  actualizaciones: number;
  historiasExito: number;
  buscanFinanciacion: number;
  alianzasInternacionales: number;
  listasDifusion: number;
  publicadas: number;
}

export const RotaryFeriaProyectos: React.FC = () => {
  const [subtab, setSubtab] = useState<FeriaSubtab>('all');
  const [loading, setLoading] = useState(true);
  const [submissions, setSubmissions] = useState<FeriaSubmission[]>([]);
  const [resumen, setResumen] = useState<FeriaResumen>({
    total: 0,
    clubesParticipantes: 0,
    distritos: 0,
    paises: 0,
    nuevos: 0,
    actualizaciones: 0,
    historiasExito: 0,
    buscanFinanciacion: 0,
    alianzasInternacionales: 0,
    listasDifusion: 0,
    publicadas: 0,
  });
  const [facets, setFacets] = useState<{
    distritos: string[];
    clubes: string[];
    paises: string[];
    ediciones: string[];
  }>({
    distritos: [],
    clubes: [],
    paises: ['Colombia'],
    ediciones: FAIR_EDITIONS,
  });

  // Filtros
  const [search, setSearch] = useState('');
  const [filterArea, setFilterArea] = useState('');
  const [filterDistrict, setFilterDistrict] = useState('');
  const [filterClub, setFilterClub] = useState('');
  const [filterCountry, setFilterCountry] = useState('');
  const [filterEdition, setFilterEdition] = useState('');
  const [filterStatus, setFilterStatus] = useState('');
  const [verFiltros, setVerFiltros] = useState(false);

  // Ficha detallada seleccionada
  const [selectedSubmission, setSelectedSubmission] = useState<FeriaSubmission | null>(null);
  const [updatingStatus, setUpdatingStatus] = useState(false);

  // Carga de datos desde endpoint especializado
  const cargarDatos = useCallback(async () => {
    setLoading(true);
    try {
      const q = new URLSearchParams();
      if (subtab !== 'all') q.set('tab', subtab);
      if (search.trim()) q.set('q', search.trim());
      if (filterArea) q.set('area', filterArea);
      if (filterDistrict) q.set('district', filterDistrict);
      if (filterClub) q.set('club', filterClub);
      if (filterCountry) q.set('country', filterCountry);
      if (filterEdition) q.set('edition', filterEdition);
      if (filterStatus) q.set('status', filterStatus);

      const r = await fetch(`${API}/rotary-en-accion/fair/submissions?${q.toString()}`, {
        headers: { Authorization: `Bearer ${getToken()}` },
      });
      const data = await r.json();
      if (r.ok) {
        setSubmissions(data.submissions || []);
        if (data.resumen) setResumen(data.resumen);
        if (data.facets) setFacets(data.facets);
      } else {
        toast.error(data.error || 'No se pudieron cargar las solicitudes de la Feria.');
      }
    } catch {
      toast.error('Error al conectar con el servidor.');
    } finally {
      setLoading(false);
    }
  }, [subtab, search, filterArea, filterDistrict, filterClub, filterCountry, filterEdition, filterStatus]);

  useEffect(() => {
    cargarDatos();
  }, [cargarDatos]);

  const limpiarFiltros = () => {
    setSearch('');
    setFilterArea('');
    setFilterDistrict('');
    setFilterClub('');
    setFilterCountry('');
    setFilterEdition('');
    setFilterStatus('');
  };

  const cambiarEstado = async (id: string, nuevoEstado: string, campaignId: string) => {
    setUpdatingStatus(true);
    try {
      const r = await fetch(`${API}/contribution-campaigns/${campaignId}/submissions/${id}/transition`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${getToken()}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ toState: nuevoEstado }),
      });
      const data = await r.json();
      if (r.ok) {
        toast.success(`Estado actualizado a: ${stateLabel(nuevoEstado)}`);
        if (selectedSubmission && selectedSubmission.id === id) {
          setSelectedSubmission({ ...selectedSubmission, status: nuevoEstado });
        }
        cargarDatos();
      } else {
        toast.error(data.error || 'No se pudo cambiar el estado');
      }
    } catch {
      toast.error('Error de red al actualizar estado');
    } finally {
      setUpdatingStatus(false);
    }
  };

  const fmtFecha = (v?: string) =>
    v ? new Date(v).toLocaleDateString('es-CO', { day: '2-digit', month: 'short', year: 'numeric' }) : '—';

  return (
    <div className="space-y-6">
      {/* ── 1. ENCABEZADO EJECUTIVO DE LA FERIA DE PROYECTOS ──────────────── */}
      <div className="bg-gradient-to-r from-[#013388] via-[#00246c] to-[#0a1e3b] p-6 sm:p-8 rounded-3xl text-white shadow-md relative overflow-hidden">
        {/* Adorno sutil de fondo */}
        <div className="absolute top-0 right-0 -mt-10 -mr-10 w-80 h-80 bg-white/5 rounded-full blur-3xl pointer-events-none" />
        <div className="absolute bottom-0 left-1/3 -mb-10 w-60 h-60 bg-amber-400/10 rounded-full blur-2xl pointer-events-none" />

        <div className="relative z-10 flex flex-col md:flex-row md:items-center justify-between gap-6">
          <div className="space-y-2 max-w-3xl">
            <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-white/10 backdrop-blur-md border border-white/20 text-xs font-black tracking-wide text-amber-300">
              <Award className="w-4 h-4 text-amber-300" />
              <span>Canal Especializado · Feria de Proyectos Colombia</span>
            </div>
            <h2 className="text-2xl sm:text-3xl font-light tracking-tight text-white">
              Gestión, Evolución y Visibilidad de Proyectos
            </h2>
            <p className="text-xs sm:text-sm text-slate-200 leading-relaxed">
              Monitoreo unificado de iniciativas rotarias, avances documentados, resultados comprobados y necesidades
              de financiación para conectar con clubes y aliados de la comunidad rotaria nacional e internacional.
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2.5">
            <button
              onClick={cargarDatos}
              disabled={loading}
              className="px-4 py-2.5 rounded-xl bg-white/10 hover:bg-white/20 border border-white/20 text-white text-xs font-bold flex items-center gap-2 transition"
              title="Refrescar solicitudes"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
              <span>Actualizar</span>
            </button>
            <a
              href="/rotary-en-accion?canal=feria"
              target="_blank"
              rel="noopener noreferrer"
              className="px-4 py-2.5 rounded-xl bg-gradient-to-r from-amber-500 to-amber-600 hover:from-amber-600 hover:to-amber-700 text-slate-900 font-black text-xs flex items-center gap-2 transition shadow-md"
            >
              <ExternalLink className="w-3.5 h-3.5 text-slate-900" />
              <span>Abrir Formulario Feria</span>
            </a>
          </div>
        </div>
      </div>

      {/* ── 2. TARJETAS DE INDICADORES CLAVE (KPIS) ────────────────────────── */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
        <div className="bg-white p-4 rounded-2xl border border-gray-100 shadow-sm">
          <span className="text-[10px] font-black uppercase tracking-wider text-gray-400 block mb-1">
            Total Solicitudes
          </span>
          <div className="text-2xl font-black text-gray-900">{resumen.total}</div>
          <span className="text-[11px] text-gray-500 mt-1 block">Proyectos e iniciativas</span>
        </div>

        <div className="bg-white p-4 rounded-2xl border border-gray-100 shadow-sm">
          <span className="text-[10px] font-black uppercase tracking-wider text-gray-400 block mb-1">
            Clubes Participantes
          </span>
          <div className="text-2xl font-black text-rotary-blue">{resumen.clubesParticipantes}</div>
          <span className="text-[11px] text-gray-500 mt-1 block">{resumen.distritos} distritos</span>
        </div>

        <div className="bg-white p-4 rounded-2xl border border-gray-100 shadow-sm">
          <span className="text-[10px] font-black uppercase tracking-wider text-gray-400 block mb-1">
            Nuevos Proyectos
          </span>
          <div className="text-2xl font-black text-sky-600">{resumen.nuevos}</div>
          <span className="text-[11px] text-gray-500 mt-1 block">En formulación / inicio</span>
        </div>

        <div className="bg-white p-4 rounded-2xl border border-gray-100 shadow-sm">
          <span className="text-[10px] font-black uppercase tracking-wider text-gray-400 block mb-1">
            Actualizaciones
          </span>
          <div className="text-2xl font-black text-emerald-600">{resumen.actualizaciones}</div>
          <span className="text-[11px] text-gray-500 mt-1 block">Avances y nuevas etapas</span>
        </div>

        <div className="bg-white p-4 rounded-2xl border border-gray-100 shadow-sm">
          <span className="text-[10px] font-black uppercase tracking-wider text-gray-400 block mb-1">
            Buscan Financiación
          </span>
          <div className="text-2xl font-black text-amber-600">{resumen.buscanFinanciacion}</div>
          <span className="text-[11px] text-gray-500 mt-1 block">{resumen.alianzasInternacionales} con alianzas int.</span>
        </div>

        <div className="bg-white p-4 rounded-2xl border border-gray-100 shadow-sm">
          <span className="text-[10px] font-black uppercase tracking-wider text-gray-400 block mb-1">
            Listas / Publicadas
          </span>
          <div className="text-2xl font-black text-purple-600">
            {resumen.publicadas}
            <span className="text-xs font-normal text-gray-400 ml-1">({resumen.listasDifusion} listas)</span>
          </div>
          <span className="text-[11px] text-gray-500 mt-1 block">En canales digitales</span>
        </div>
      </div>

      {/* ── 3. PESTAÑAS RÁPIDAS (SUBTABS) ─────────────────────────────────── */}
      <div className="flex gap-1.5 p-1.5 bg-gray-100/80 rounded-2xl overflow-x-auto text-xs font-black">
        {[
          { id: 'all' as FeriaSubtab, label: 'Todas las solicitudes', count: resumen.total },
          { id: 'nuevos' as FeriaSubtab, label: 'Proyectos Nuevos', count: resumen.nuevos },
          { id: 'avances' as FeriaSubtab, label: 'Avances y Etapas', count: resumen.actualizaciones },
          { id: 'historias' as FeriaSubtab, label: 'Historias de Éxito', count: resumen.historiasExito },
          { id: 'financiacion' as FeriaSubtab, label: 'Buscan Financiación', count: resumen.buscanFinanciacion },
          { id: 'alianzas' as FeriaSubtab, label: 'Alianzas Internacionales', count: resumen.alianzasInternacionales },
          { id: 'listos' as FeriaSubtab, label: 'Listas para Difusión', count: resumen.listasDifusion },
          { id: 'publicados' as FeriaSubtab, label: 'Publicadas', count: resumen.publicadas },
        ].map((tab) => (
          <button
            key={tab.id}
            onClick={() => setSubtab(tab.id)}
            className={`flex items-center gap-1.5 px-3.5 py-2 rounded-xl transition-all whitespace-nowrap ${
              subtab === tab.id
                ? 'bg-white text-gray-900 shadow-sm border border-gray-200/60'
                : 'text-gray-600 hover:text-gray-900 hover:bg-white/50'
            }`}
          >
            <span>{tab.label}</span>
            <span className={`text-[10px] px-1.5 py-0.2 rounded-full font-bold ${
              subtab === tab.id ? 'bg-[#013388]/10 text-rotary-blue' : 'bg-gray-200/70 text-gray-600'
            }`}>
              {tab.count}
            </span>
          </button>
        ))}
      </div>

      {/* ── 4. BARRA DE BÚSQUEDA Y FILTROS AVANZADOS ───────────────────────── */}
      <div className="bg-white p-4 rounded-2xl border border-gray-100 shadow-sm space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="relative flex-1 min-w-[240px]">
            <Search className="w-4 h-4 text-gray-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Buscar por nombre de proyecto, club, distrito o ciudad..."
              className="w-full pl-10 pr-4 py-2 rounded-xl border border-gray-200 focus:border-rotary-blue outline-none text-xs bg-gray-50/50"
            />
            {search && (
              <button
                onClick={() => setSearch('')}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            )}
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={() => setVerFiltros((v) => !v)}
              className={`px-3 py-2 rounded-xl border text-xs font-bold flex items-center gap-1.5 transition ${
                verFiltros || filterArea || filterDistrict || filterClub || filterCountry || filterEdition || filterStatus
                  ? 'border-rotary-blue bg-blue-50 text-rotary-blue'
                  : 'border-gray-200 text-gray-600 hover:bg-gray-50'
              }`}
            >
              <Filter className="w-3.5 h-3.5" />
              <span>Filtros</span>
              {(filterArea || filterDistrict || filterClub || filterCountry || filterEdition || filterStatus) && (
                <span className="w-2 h-2 rounded-full bg-rotary-blue" />
              )}
            </button>

            {(search || filterArea || filterDistrict || filterClub || filterCountry || filterEdition || filterStatus) && (
              <button
                onClick={limpiarFiltros}
                className="px-3 py-2 rounded-xl text-xs font-bold text-gray-500 hover:text-gray-800"
              >
                Limpiar
              </button>
            )}
          </div>
        </div>

        {verFiltros && (
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-2.5 pt-3 border-t border-gray-100 text-xs">
            <div>
              <label className="text-[10px] font-black text-gray-400 uppercase tracking-wider block mb-1">
                Área de Interés
              </label>
              <select
                value={filterArea}
                onChange={(e) => setFilterArea(e.target.value)}
                className="w-full p-2 rounded-xl border border-gray-200 bg-white"
              >
                <option value="">Todas las áreas</option>
                {ROTARY_AREAS_INTEREST.map((a) => (
                  <option key={a.slug} value={a.slug}>
                    {a.name}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="text-[10px] font-black text-gray-400 uppercase tracking-wider block mb-1">
                Edición de la Feria
              </label>
              <select
                value={filterEdition}
                onChange={(e) => setFilterEdition(e.target.value)}
                className="w-full p-2 rounded-xl border border-gray-200 bg-white"
              >
                <option value="">Todas las ediciones</option>
                {FAIR_EDITIONS.map((ed) => (
                  <option key={ed} value={ed}>
                    {ed}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="text-[10px] font-black text-gray-400 uppercase tracking-wider block mb-1">
                Distrito
              </label>
              <input
                type="text"
                value={filterDistrict}
                onChange={(e) => setFilterDistrict(e.target.value)}
                placeholder="Ej. 4281, 4271..."
                className="w-full p-2 rounded-xl border border-gray-200 bg-white"
              />
            </div>

            <div>
              <label className="text-[10px] font-black text-gray-400 uppercase tracking-wider block mb-1">
                Club Rotario
              </label>
              <input
                type="text"
                value={filterClub}
                onChange={(e) => setFilterClub(e.target.value)}
                placeholder="Nombre del club..."
                className="w-full p-2 rounded-xl border border-gray-200 bg-white"
              />
            </div>

            <div>
              <label className="text-[10px] font-black text-gray-400 uppercase tracking-wider block mb-1">
                País
              </label>
              <input
                type="text"
                value={filterCountry}
                onChange={(e) => setFilterCountry(e.target.value)}
                placeholder="Colombia, México..."
                className="w-full p-2 rounded-xl border border-gray-200 bg-white"
              />
            </div>

            <div>
              <label className="text-[10px] font-black text-gray-400 uppercase tracking-wider block mb-1">
                Estado
              </label>
              <select
                value={filterStatus}
                onChange={(e) => setFilterStatus(e.target.value)}
                className="w-full p-2 rounded-xl border border-gray-200 bg-white"
              >
                <option value="">Todos los estados</option>
                <option value="recibido">Recibido</option>
                <option value="en_revision">En revisión</option>
                <option value="aprobado">Aprobado</option>
                <option value="listo_difusion">Listo para difusión</option>
                <option value="publicado">Publicado</option>
              </select>
            </div>
          </div>
        )}
      </div>

      {/* ── 5. LISTADO DE SOLICITUDES DE LA FERIA ──────────────────────────── */}
      {loading ? (
        <div className="bg-white rounded-3xl p-12 text-center border border-gray-100 shadow-sm space-y-3">
          <RefreshCw className="w-8 h-8 animate-spin text-rotary-blue mx-auto" />
          <p className="text-sm font-bold text-gray-600">Cargando solicitudes de la Feria de Proyectos...</p>
        </div>
      ) : submissions.length === 0 ? (
        <div className="bg-white rounded-3xl p-12 text-center border border-gray-100 shadow-sm space-y-3">
          <div className="w-12 h-12 rounded-2xl bg-sky-50 text-rotary-blue flex items-center justify-center mx-auto">
            <Award className="w-6 h-6" />
          </div>
          <h3 className="text-lg font-bold text-gray-800">No se encontraron solicitudes</h3>
          <p className="text-xs text-gray-500 max-w-md mx-auto">
            No hay registros que coincidan con los filtros seleccionados para este canal. Puedes compartir el enlace del
            formulario especializado para captar nuevos proyectos.
          </p>
          <a
            href="/rotary-en-accion?canal=feria"
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-rotary-blue text-white text-xs font-bold mt-2"
          >
            <ExternalLink className="w-3.5 h-3.5" />
            <span>Compartir enlace público</span>
          </a>
        </div>
      ) : (
        <div className="grid gap-3">
          {submissions.map((s) => {
            const areaObj = ROTARY_AREAS_INTEREST.find(
              (a) => a.slug === s.areaFocus || a.id === s.areaFocus
            );
            const goalObj = PROJECT_GOAL_OPTIONS.find((g) => g.id === s.projectGoalType);
            const evolution = s.projectEvolution || {};

            return (
              <div
                key={s.id}
                onClick={() => setSelectedSubmission(s)}
                className="bg-white rounded-2xl p-4 sm:p-5 border border-gray-100 hover:border-rotary-blue/40 shadow-xs hover:shadow-sm transition-all cursor-pointer flex flex-col md:flex-row md:items-center justify-between gap-4"
              >
                <div className="space-y-2 min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    {/* Insignia de Área de Interés */}
                    <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[10px] font-black tracking-wide bg-blue-50 text-rotary-blue border border-sky-100">
                      <span>{areaObj?.icon || '✨'}</span>
                      <span>{areaObj?.name || s.areaFocus || 'Área de Interés'}</span>
                    </span>

                    {/* Insignia de Objetivo */}
                    {s.projectGoalType && (
                      <span className={`inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[10px] font-black border ${goalBadgeClass(s.projectGoalType)}`}>
                        <span>{goalObj?.icon || '🎯'}</span>
                        <span>{goalObj?.label || s.projectGoalType}</span>
                      </span>
                    )}

                    {/* Edición de la Feria */}
                    {s.projectFairEdition && (
                      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold bg-amber-50 text-amber-900 border border-amber-200">
                        <Award className="w-3 h-3 text-amber-600" />
                        <span>{s.projectFairEdition}</span>
                      </span>
                    )}

                    {/* Proyecto Vinculado */}
                    {(s.projectFairSubmissionId || s.projectId) && (
                      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold bg-emerald-50 text-emerald-800 border border-emerald-200">
                        <CheckCircle2 className="w-3 h-3 text-emerald-600" />
                        <span>Historial Vinculado</span>
                      </span>
                    )}

                    {/* Estado */}
                    <span className={`px-2.5 py-0.5 rounded-full text-[10px] font-black ${stateChip(s.status)}`}>
                      {stateLabel(s.status)}
                    </span>
                  </div>

                  <h4 className="text-base font-bold text-gray-900 tracking-tight leading-snug">
                    {s.title}
                  </h4>

                  <div className="flex flex-wrap items-center gap-y-1 gap-x-3 text-xs text-gray-500">
                    <span className="flex items-center gap-1 font-bold text-gray-700">
                      <Building2 className="w-3.5 h-3.5 text-rotary-blue" />
                      <span>{s.club || 'Club no especificado'}</span>
                    </span>

                    {s.district && (
                      <span className="flex items-center gap-1">
                        <span className="text-gray-300">·</span>
                        <span>Distrito {s.district}</span>
                      </span>
                    )}

                    <span className="flex items-center gap-1">
                      <span className="text-gray-300">·</span>
                      <Flag className="w-3 h-3 text-gray-400" />
                      <span>{s.country || 'Colombia'}</span>
                    </span>

                    {s.city && (
                      <span className="flex items-center gap-1">
                        <span className="text-gray-300">·</span>
                        <MapPin className="w-3 h-3 text-gray-400" />
                        <span>{s.city}</span>
                      </span>
                    )}

                    <span className="flex items-center gap-1 text-gray-400">
                      <span className="text-gray-300">·</span>
                      <Calendar className="w-3 h-3" />
                      <span>{fmtFecha(s.createdAt)}</span>
                    </span>
                  </div>

                  {s.description && (
                    <p className="text-xs text-gray-600 line-clamp-2 max-w-3xl leading-relaxed">
                      {s.description}
                    </p>
                  )}
                </div>

                <div className="flex md:flex-col items-center md:items-end justify-between md:justify-center gap-2 pt-2 md:pt-0 border-t md:border-t-0 border-gray-100">
                  <div className="flex items-center gap-2 text-xs text-gray-500">
                    <span className="flex items-center gap-1" title="Fotografías">
                      <ImageIcon className="w-3.5 h-3.5 text-sky-600" />
                      <span className="font-bold">{s.imageCount || 0}</span>
                    </span>
                    {s.videoCount > 0 && (
                      <span className="flex items-center gap-1" title="Videos">
                        <Film className="w-3.5 h-3.5 text-purple-600" />
                        <span className="font-bold">{s.videoCount}</span>
                      </span>
                    )}
                  </div>

                  <div className="flex items-center gap-1 text-xs font-bold text-rotary-blue">
                    <span>Ver detalle</span>
                    <ChevronRight className="w-4 h-4" />
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* ── 6. DETALLE Y FICHA DE EVOLUCIÓN HISTÓRICA (DRAWER / MODAL) ───── */}
      {selectedSubmission && (
        <div className="fixed inset-0 z-50 flex items-center justify-end bg-black/50 backdrop-blur-xs p-0 sm:p-4">
          <div className="bg-white w-full sm:max-w-2xl h-full sm:h-[92vh] sm:rounded-3xl shadow-2xl flex flex-col overflow-hidden border border-gray-100">
            {/* Cabecera del Drawer */}
            <div className="p-5 border-b border-gray-100 flex items-center justify-between bg-gray-50/60">
              <div className="min-w-0 space-y-1">
                <span className="text-[10px] font-black uppercase tracking-wider text-rotary-blue block">
                  Expediente de Proyecto · Feria de Proyectos Colombia
                </span>
                <h3 className="text-lg font-bold text-gray-900 truncate">
                  {selectedSubmission.title}
                </h3>
              </div>

              <button
                onClick={() => setSelectedSubmission(null)}
                className="w-8 h-8 rounded-full bg-white border border-gray-200 flex items-center justify-center text-gray-500 hover:text-gray-800 hover:bg-gray-100 transition"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* Contenido desplazable */}
            <div className="flex-1 overflow-y-auto p-5 sm:p-6 space-y-6 text-xs text-gray-700">
              {/* Barra de estado y cambio rápido */}
              <div className="bg-slate-50 p-4 rounded-2xl border border-slate-200/60 flex flex-wrap items-center justify-between gap-3">
                <div>
                  <span className="text-[10px] font-black text-gray-400 uppercase tracking-wider block">
                    Estado Actual
                  </span>
                  <span className={`inline-block mt-1 px-3 py-1 rounded-full text-xs font-black ${stateChip(selectedSubmission.status)}`}>
                    {stateLabel(selectedSubmission.status)}
                  </span>
                </div>

                <div className="flex items-center gap-1.5">
                  {['recibido', 'en_revision', 'aprobado', 'listo_difusion', 'publicado'].map((st) => (
                    <button
                      key={st}
                      disabled={updatingStatus || selectedSubmission.status === st}
                      onClick={() => cambiarEstado(selectedSubmission.id, st, selectedSubmission.campaignId)}
                      className={`px-2.5 py-1.5 rounded-lg text-[10px] font-bold border transition ${
                        selectedSubmission.status === st
                          ? 'bg-slate-900 text-white border-slate-900 cursor-default'
                          : 'bg-white border-gray-200 text-gray-700 hover:bg-gray-100 disabled:opacity-50'
                      }`}
                    >
                      {stateLabel(st)}
                    </button>
                  ))}
                </div>
              </div>

              {/* Identificación y Club Responsable */}
              <div className="space-y-3">
                <h4 className="text-[11px] font-black uppercase tracking-wider text-gray-400">
                  Identificación Institucional
                </h4>
                <div className="grid sm:grid-cols-2 gap-3 bg-gray-50 p-4 rounded-2xl border border-gray-100">
                  <div>
                    <span className="text-gray-400 block text-[10px]">Club Rotario</span>
                    <span className="font-bold text-gray-900">{selectedSubmission.club || 'No especificado'}</span>
                  </div>
                  <div>
                    <span className="text-gray-400 block text-[10px]">Distrito & País</span>
                    <span className="font-bold text-gray-900">
                      Distrito {selectedSubmission.district || '—'} · {selectedSubmission.country || 'Colombia'}
                    </span>
                  </div>
                  <div>
                    <span className="text-gray-400 block text-[10px]">Ciudad / Región Beneficiaria</span>
                    <span className="font-bold text-gray-900">{selectedSubmission.city || selectedSubmission.location || '—'}</span>
                  </div>
                  <div>
                    <span className="text-gray-400 block text-[10px]">Año de Inicio & Etapa</span>
                    <span className="font-bold text-gray-900">
                      {selectedSubmission.projectStartYear || '—'} · {selectedSubmission.projectStage || 'Formulación'}
                    </span>
                  </div>
                  <div>
                    <span className="text-gray-400 block text-[10px]">Edición Feria de Proyectos</span>
                    <span className="font-bold text-rotary-blue">{selectedSubmission.projectFairEdition || '—'}</span>
                  </div>
                  <div>
                    <span className="text-gray-400 block text-[10px]">Objetivo de Comunicación</span>
                    <span className="font-bold text-purple-700">{goalLabel(selectedSubmission.projectGoalType)}</span>
                  </div>
                </div>
              </div>

              {/* Área de interés principal y secundarias */}
              <div className="space-y-2">
                <h4 className="text-[11px] font-black uppercase tracking-wider text-gray-400">
                  Taxonomía Rotaria (7 Áreas de Interés)
                </h4>
                <div className="flex flex-wrap items-center gap-2">
                  <span className="px-3 py-1.5 rounded-xl bg-blue-50 text-rotary-blue font-bold border border-sky-100 flex items-center gap-1.5">
                    <Sparkles className="w-3.5 h-3.5 text-rotary-blue" />
                    <span>Principal: {selectedSubmission.areaFocus || 'No asignada'}</span>
                  </span>
                  {selectedSubmission.secondaryAreas?.map((sec) => (
                    <span key={sec} className="px-3 py-1.5 rounded-xl bg-gray-100 text-gray-700 font-semibold">
                      Secundaria: {sec}
                    </span>
                  ))}
                </div>
              </div>

              {/* Descripción y Objetivos */}
              <div className="space-y-3">
                <h4 className="text-[11px] font-black uppercase tracking-wider text-gray-400">
                  Descripción y Objetivos
                </h4>
                <div className="bg-gray-50 p-4 rounded-2xl border border-gray-100 space-y-2.5">
                  <p className="text-gray-800 leading-relaxed whitespace-pre-line">
                    {selectedSubmission.story || selectedSubmission.description}
                  </p>
                  {selectedSubmission.projectTargetCommunity && (
                    <div className="pt-2 border-t border-gray-200/60">
                      <span className="text-gray-400 block text-[10px]">Comunidad beneficiaria:</span>
                      <span className="font-bold text-gray-800">{selectedSubmission.projectTargetCommunity}</span>
                    </div>
                  )}
                </div>
              </div>

              {/* Evolución e Impacto (Resultados verificados vs Estimaciones) */}
              {selectedSubmission.projectEvolution && (
                <div className="space-y-3">
                  <h4 className="text-[11px] font-black uppercase tracking-wider text-gray-400">
                    Evolución e Impacto Documentado
                  </h4>
                  <div className="grid sm:grid-cols-2 gap-3">
                    {selectedSubmission.projectEvolution.resultadosComprobados && (
                      <div className="bg-emerald-50/70 p-3.5 rounded-2xl border border-emerald-200/70 space-y-1">
                        <span className="text-[10px] font-black text-emerald-800 uppercase tracking-wider flex items-center gap-1">
                          <CheckCircle2 className="w-3 h-3 text-emerald-600" /> Resultados Comprobados
                        </span>
                        <p className="text-emerald-950 font-medium leading-relaxed">
                          {selectedSubmission.projectEvolution.resultadosComprobados}
                        </p>
                      </div>
                    )}

                    {selectedSubmission.projectEvolution.estimacionesActuales && (
                      <div className="bg-blue-50/70 p-3.5 rounded-2xl border border-blue-200/70 space-y-1">
                        <span className="text-[10px] font-black text-blue-800 uppercase tracking-wider flex items-center gap-1">
                          <TrendingUp className="w-3 h-3 text-blue-600" /> Estimaciones Actuales
                        </span>
                        <p className="text-blue-950 font-medium leading-relaxed">
                          {selectedSubmission.projectEvolution.estimacionesActuales}
                        </p>
                      </div>
                    )}

                    {selectedSubmission.projectEvolution.objetivosFuturos && (
                      <div className="bg-purple-50/70 p-3.5 rounded-2xl border border-purple-200/70 space-y-1 sm:col-span-2">
                        <span className="text-[10px] font-black text-purple-800 uppercase tracking-wider flex items-center gap-1">
                          <ArrowRight className="w-3 h-3 text-purple-600" /> Objetivos Futuros y Nuevas Metas
                        </span>
                        <p className="text-purple-950 font-medium leading-relaxed">
                          {selectedSubmission.projectEvolution.objetivosFuturos}
                        </p>
                      </div>
                    )}
                  </div>

                  {/* Cifras de beneficiarios y fondos */}
                  <div className="grid grid-cols-2 sm:grid-cols-3 gap-2.5 pt-1">
                    {selectedSubmission.projectEvolution.beneficiariosDirectos && (
                      <div className="bg-gray-50 p-3 rounded-xl border border-gray-100">
                        <span className="text-gray-400 block text-[10px]">Beneficiarios directos</span>
                        <span className="text-base font-black text-gray-900">
                          {selectedSubmission.projectEvolution.beneficiariosDirectos}
                        </span>
                      </div>
                    )}
                    {selectedSubmission.projectEvolution.beneficiariosIndirectos && (
                      <div className="bg-gray-50 p-3 rounded-xl border border-gray-100">
                        <span className="text-gray-400 block text-[10px]">Beneficiarios indirectos</span>
                        <span className="text-base font-black text-gray-900">
                          {selectedSubmission.projectEvolution.beneficiariosIndirectos}
                        </span>
                      </div>
                    )}
                    {selectedSubmission.projectEvolution.recursosGestionadosMonto && (
                      <div className="bg-gray-50 p-3 rounded-xl border border-gray-100">
                        <span className="text-gray-400 block text-[10px]">Recursos gestionados</span>
                        <span className="text-base font-black text-emerald-700">
                          {selectedSubmission.projectEvolution.recursosGestionadosMoneda || 'USD'} ${selectedSubmission.projectEvolution.recursosGestionadosMonto}
                        </span>
                      </div>
                    )}
                  </div>

                  {/* Alianzas y Cooperación Internacional */}
                  {(selectedSubmission.projectEvolution.participacionInternacionalPaises ||
                    selectedSubmission.projectEvolution.clubesAliadosNacionales ||
                    selectedSubmission.projectEvolution.organizacionesParticipantes) && (
                    <div className="bg-slate-50 p-3.5 rounded-2xl border border-slate-200/80 space-y-2">
                      <span className="text-[10px] font-black text-slate-500 uppercase tracking-wider block">
                        Alianzas y Cooperación Institucional
                      </span>
                      {selectedSubmission.projectEvolution.participacionInternacionalPaises && (
                        <div>
                          <span className="text-gray-500 text-[10px] block">Participación Internacional (Países / Distritos):</span>
                          <span className="font-bold text-gray-800">
                            {selectedSubmission.projectEvolution.participacionInternacionalPaises}
                          </span>
                        </div>
                      )}
                      {selectedSubmission.projectEvolution.clubesAliadosNacionales && (
                        <div>
                          <span className="text-gray-500 text-[10px] block">Clubes aliados participantes:</span>
                          <span className="font-bold text-gray-800">
                            {selectedSubmission.projectEvolution.clubesAliadosNacionales}
                          </span>
                        </div>
                      )}
                      {selectedSubmission.projectEvolution.organizacionesParticipantes && (
                        <div>
                          <span className="text-gray-500 text-[10px] block">Organizaciones aliadas / ONGs:</span>
                          <span className="font-bold text-gray-800">
                            {selectedSubmission.projectEvolution.organizacionesParticipantes}
                          </span>
                        </div>
                      )}
                    </div>
                  )}

                  {/* Necesidades Actuales */}
                  {selectedSubmission.projectEvolution.necesidadesActuales && (
                    <div className="bg-amber-50/80 p-3.5 rounded-2xl border border-amber-200 space-y-1">
                      <span className="text-[10px] font-black text-amber-900 uppercase tracking-wider block">
                        Necesidades Actuales de Financiación o Apoyo
                      </span>
                      <p className="text-amber-950 font-medium leading-relaxed">
                        {selectedSubmission.projectEvolution.necesidadesActuales}
                      </p>
                    </div>
                  )}
                </div>
              )}

              {/* Responsable del Proyecto */}
              <div className="space-y-3">
                <h4 className="text-[11px] font-black uppercase tracking-wider text-gray-400">
                  Responsable y Contacto
                </h4>
                <div className="bg-gray-50 p-4 rounded-2xl border border-gray-100 space-y-2">
                  <div className="flex items-center justify-between">
                    <div>
                      <span className="font-bold text-gray-900 text-sm block">{selectedSubmission.senderName}</span>
                      <span className="text-gray-500 text-xs">{selectedSubmission.role || 'Socio Rotario'} · {selectedSubmission.club}</span>
                    </div>

                    <div className="flex items-center gap-2">
                      {selectedSubmission.senderPhone && (
                        <a
                          href={`https://wa.me/${selectedSubmission.senderPhone.replace(/[^0-9]/g, '')}`}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="px-3 py-1.5 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white font-bold flex items-center gap-1.5 transition shadow-xs"
                        >
                          <MessageSquare className="w-3.5 h-3.5" />
                          <span>WhatsApp</span>
                        </a>
                      )}
                      {selectedSubmission.senderEmail && (
                        <a
                          href={`mailto:${selectedSubmission.senderEmail}`}
                          className="px-3 py-1.5 rounded-xl bg-rotary-blue hover:bg-sky-800 text-white font-bold flex items-center gap-1.5 transition shadow-xs"
                        >
                          <Mail className="w-3.5 h-3.5" />
                          <span>Correo</span>
                        </a>
                      )}
                    </div>
                  </div>
                </div>
              </div>
            </div>

            {/* Pie del Drawer */}
            <div className="p-4 border-t border-gray-100 flex items-center justify-between bg-gray-50/60">
              <span className="text-[11px] text-gray-400 font-mono">
                ID: {selectedSubmission.id.slice(0, 8)}
              </span>

              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => setSelectedSubmission(null)}
                  className="px-4 py-2 rounded-xl border border-gray-200 text-xs font-bold text-gray-600 hover:bg-gray-100"
                >
                  Cerrar
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default RotaryFeriaProyectos;
