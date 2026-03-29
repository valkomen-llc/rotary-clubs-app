import React, { useState, useEffect, useRef } from 'react';
import {
  Sparkles, TrendingUp, Users, Palette, Globe2, Target,
  ChevronRight, RefreshCw, Copy, CheckCircle2,
  BarChart3, Calendar, Megaphone, ArrowRight, Zap,
} from 'lucide-react';
import type { ArchetypeResult, CommunicationPillar, SuggestedAction, MonthlyTheme } from '../../lib/clubArchetypeEngine';

// ══════════════════════════════════════════════════════════════════════════
// ── Club Archetype Card — Premium Visual Component ────────────────────
// ══════════════════════════════════════════════════════════════════════════

interface ClubArchetypeCardProps {
  result: ArchetypeResult;
  clubName: string;
  clubColors: { primary: string; secondary: string };
  onFinish?: () => void;
  onRegenerate?: () => void;
  saving?: boolean;
  hideCTAs?: boolean;
}

// ── Animated Score Bar ────────────────────────────────────────────────────
const ScoreBar: React.FC<{
  label: string;
  icon: React.ReactNode;
  value: number;
  color: string;
  delay: number;
}> = ({ label, icon, value, color, delay }) => {
  const [width, setWidth] = useState(0);
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    const t1 = setTimeout(() => setVisible(true), delay);
    const t2 = setTimeout(() => setWidth(value), delay + 200);
    return () => { clearTimeout(t1); clearTimeout(t2); };
  }, [value, delay]);

  return (
    <div
      className={`transition-all duration-500 ${visible ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-3'}`}
      style={{ transitionDelay: `${delay}ms` }}
    >
      <div className="flex items-center justify-between mb-1.5">
        <div className="flex items-center gap-2">
          <span className="text-gray-400">{icon}</span>
          <span className="text-xs font-bold text-gray-600 uppercase tracking-wider">{label}</span>
        </div>
        <span className="text-sm font-black" style={{ color }}>{width}%</span>
      </div>
      <div className="w-full h-2.5 bg-gray-100 rounded-full overflow-hidden">
        <div
          className="h-full rounded-full transition-all duration-1000 ease-out"
          style={{ width: `${width}%`, backgroundColor: color }}
        />
      </div>
    </div>
  );
};

// ── Pillar Card ──────────────────────────────────────────────────────────
const PillarCard: React.FC<{ pillar: CommunicationPillar; index: number }> = ({ pillar, index }) => {
  const [visible, setVisible] = useState(false);
  useEffect(() => { const t = setTimeout(() => setVisible(true), 800 + index * 150); return () => clearTimeout(t); }, [index]);

  return (
    <div
      className={`bg-white/80 backdrop-blur-sm border border-gray-100 rounded-2xl p-4 transition-all duration-500 hover:shadow-lg hover:-translate-y-0.5 ${visible ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-4'}`}
    >
      <div className="flex items-start gap-3">
        <span className="text-2xl flex-shrink-0">{pillar.emoji}</span>
        <div>
          <h4 className="text-sm font-black text-gray-900">{pillar.name}</h4>
          <p className="text-[11px] text-gray-500 mt-0.5 leading-relaxed">{pillar.description}</p>
        </div>
      </div>
    </div>
  );
};

// ── Action Item ──────────────────────────────────────────────────────────
const ActionItem: React.FC<{ action: SuggestedAction; index: number }> = ({ action, index }) => {
  const [visible, setVisible] = useState(false);
  const [checked, setChecked] = useState(false);
  useEffect(() => { const t = setTimeout(() => setVisible(true), 1200 + index * 100); return () => clearTimeout(t); }, [index]);

  return (
    <div
      className={`flex items-start gap-3 p-3 rounded-xl transition-all duration-500 hover:bg-gray-50 ${visible ? 'opacity-100 translate-x-0' : 'opacity-0 -translate-x-4'} ${checked ? 'opacity-50' : ''}`}
    >
      <button
        onClick={() => setChecked(c => !c)}
        className={`w-5 h-5 rounded-lg border-2 flex items-center justify-center flex-shrink-0 mt-0.5 transition-all ${checked ? 'bg-emerald-500 border-emerald-500' : 'border-gray-300 hover:border-emerald-400'}`}
      >
        {checked && <CheckCircle2 className="w-3 h-3 text-white" />}
      </button>
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2">
          <span className="text-sm">{action.emoji}</span>
          <h4 className={`text-sm font-bold transition-all ${checked ? 'text-gray-400 line-through' : 'text-gray-800'}`}>
            {action.title}
          </h4>
        </div>
        <p className="text-[11px] text-gray-500 mt-0.5">{action.description}</p>
      </div>
    </div>
  );
};

// ── Calendar Week Row ─────────────────────────────────────────────────────
const CalendarWeekRow: React.FC<{ week: MonthlyTheme; index: number }> = ({ week, index }) => {
  const [visible, setVisible] = useState(false);
  useEffect(() => { const t = setTimeout(() => setVisible(true), 1600 + index * 120); return () => clearTimeout(t); }, [index]);

  return (
    <div
      className={`flex items-center gap-3 p-3 rounded-xl bg-white/60 border border-gray-50 transition-all duration-500 ${visible ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-3'}`}
    >
      <div className="w-10 h-10 rounded-xl bg-gray-100 flex items-center justify-center flex-shrink-0">
        <span className="text-xs font-black text-gray-500">S{week.week}</span>
      </div>
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2">
          <span className="text-sm">{week.emoji}</span>
          <h4 className="text-xs font-bold text-gray-800 truncate">{week.theme}</h4>
        </div>
        <p className="text-[10px] text-gray-400 mt-0.5">
          {week.pillar} · {week.suggestedPosts} publicaciones
        </p>
      </div>
    </div>
  );
};

// ══════════════════════════════════════════════════════════════════════════
// ── Main Component ────────────────────────────────────────────────────────
// ══════════════════════════════════════════════════════════════════════════

const ClubArchetypeCard: React.FC<ClubArchetypeCardProps> = ({
  result,
  clubName,
  clubColors,
  onFinish,
  onRegenerate,
  saving,
  hideCTAs = false,
}) => {
  const { archetype, scores, overallScore, communicationPillars, suggestedActions, contentCalendarSeed, seoKeywords } = result;
  const [headerVisible, setHeaderVisible] = useState(false);
  const [copiedTone, setCopiedTone] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const t = setTimeout(() => setHeaderVisible(true), 100);
    return () => clearTimeout(t);
  }, []);

  const copyTone = () => {
    navigator.clipboard.writeText(archetype.toneOfVoice);
    setCopiedTone(true);
    setTimeout(() => setCopiedTone(false), 2000);
  };

  // ── Score colors ──
  const scoreColor = (val: number) => {
    if (val >= 70) return '#10b981';
    if (val >= 40) return '#f59e0b';
    return '#f87171';
  };

  return (
    <div ref={containerRef} className="max-w-3xl mx-auto pb-8">

      {/* ── Hero Header ────────────────────────────────────────────── */}
      <div
        className={`relative rounded-3xl overflow-hidden mb-8 transition-all duration-700 ${headerVisible ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-6'}`}
      >
        {/* Gradient Background */}
        <div
          className={`bg-gradient-to-br ${archetype.gradient} p-8 pb-10`}
          style={{ 
            background: `linear-gradient(135deg, ${clubColors.primary}dd, ${archetype.accentColor}cc)`,
          }}
        >
          {/* Decorative circles */}
          <div className="absolute top-0 right-0 w-64 h-64 bg-white/5 rounded-full -translate-y-1/2 translate-x-1/2" />
          <div className="absolute bottom-0 left-0 w-48 h-48 bg-white/5 rounded-full translate-y-1/2 -translate-x-1/4" />
          
          <div className="relative z-10">
            {/* Badge */}
            <div className="inline-flex items-center gap-2 bg-white/15 backdrop-blur-sm rounded-full px-4 py-1.5 mb-5">
              <Sparkles className="w-3.5 h-3.5 text-white/80" />
              <span className="text-[11px] font-bold text-white/90 uppercase tracking-wider">Club DNA Profile</span>
            </div>

            {/* Archetype Name */}
            <div className="flex items-center gap-4 mb-4">
              <span className="text-5xl">{archetype.emoji}</span>
              <div>
                <h1 className="text-3xl font-black text-white tracking-tight">{archetype.name}</h1>
                <p className="text-white/70 text-sm font-medium mt-1">{archetype.tagline}</p>
              </div>
            </div>

            {/* Club Name */}
            <p className="text-white/60 text-xs font-bold uppercase tracking-widest mb-4">{clubName}</p>

            {/* Description */}
            <p className="text-white/85 text-sm leading-relaxed max-w-xl">
              {archetype.description}
            </p>

            {/* Overall Score */}
            <div className="flex items-center gap-4 mt-6">
              <div className="flex items-center gap-2 bg-white/15 backdrop-blur-sm rounded-2xl px-5 py-3">
                <Zap className="w-5 h-5 text-yellow-300" />
                <div>
                  <p className="text-[10px] text-white/60 font-bold uppercase">Score General</p>
                  <p className="text-2xl font-black text-white">{overallScore}<span className="text-sm text-white/50">/100</span></p>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* ── Maturity Scores ────────────────────────────────────────── */}
      <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-6 mb-6">
        <div className="flex items-center gap-2 mb-5">
          <BarChart3 className="w-4 h-4 text-gray-400" />
          <h3 className="text-sm font-black text-gray-800 uppercase tracking-wider">Indicadores de Madurez</h3>
        </div>
        <div className="space-y-5">
          <ScoreBar
            label="Madurez Digital"
            icon={<TrendingUp className="w-3.5 h-3.5" />}
            value={scores.digitalMaturity}
            color={scoreColor(scores.digitalMaturity)}
            delay={300}
          />
          <ScoreBar
            label="Alcance Social"
            icon={<Globe2 className="w-3.5 h-3.5" />}
            value={scores.socialReach}
            color={scoreColor(scores.socialReach)}
            delay={500}
          />
          <ScoreBar
            label="Identidad Visual"
            icon={<Palette className="w-3.5 h-3.5" />}
            value={scores.visualIdentity}
            color={scoreColor(scores.visualIdentity)}
            delay={700}
          />
          <ScoreBar
            label="Base de Socios"
            icon={<Users className="w-3.5 h-3.5" />}
            value={scores.memberBase}
            color={scoreColor(scores.memberBase)}
            delay={900}
          />
        </div>
      </div>

      {/* ── Tone of Voice ──────────────────────────────────────────── */}
      <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-6 mb-6">
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-2">
            <Megaphone className="w-4 h-4 text-gray-400" />
            <h3 className="text-sm font-black text-gray-800 uppercase tracking-wider">Tono de Voz</h3>
          </div>
          <button
            onClick={copyTone}
            className="text-[10px] font-bold text-gray-400 hover:text-gray-600 flex items-center gap-1 transition-colors"
          >
            {copiedTone ? <><CheckCircle2 className="w-3 h-3 text-emerald-500" /> Copiado</> : <><Copy className="w-3 h-3" /> Copiar</>}
          </button>
        </div>
        <div className="bg-gradient-to-br from-gray-50 to-gray-100/50 rounded-xl p-4 mb-4">
          <p className="text-base font-black text-gray-800 italic">"{archetype.toneOfVoice}"</p>
        </div>
        <div className="space-y-3">
          <p className="text-[10px] font-bold text-gray-400 uppercase tracking-widest">Ejemplos de copy</p>
          {archetype.toneExamples.map((ex, i) => (
            <div key={i} className="bg-gray-50 rounded-xl p-3 border-l-3 border-l-gray-300">
              <p className="text-xs text-gray-600 italic leading-relaxed">{ex}</p>
            </div>
          ))}
        </div>
      </div>

      {/* ── Communication Pillars ──────────────────────────────────── */}
      <div className="mb-6">
        <div className="flex items-center gap-2 mb-4 px-1">
          <Target className="w-4 h-4 text-gray-400" />
          <h3 className="text-sm font-black text-gray-800 uppercase tracking-wider">Pilares de Comunicación</h3>
        </div>
        <div className="grid grid-cols-2 gap-3">
          {communicationPillars.map((pillar, i) => (
            <PillarCard key={pillar.name} pillar={pillar} index={i} />
          ))}
        </div>
      </div>

      {/* ── Suggested Actions ──────────────────────────────────────── */}
      <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-6 mb-6">
        <div className="flex items-center gap-2 mb-4">
          <ChevronRight className="w-4 h-4 text-gray-400" />
          <h3 className="text-sm font-black text-gray-800 uppercase tracking-wider">Próximos Pasos Sugeridos</h3>
        </div>
        <div className="space-y-1">
          {suggestedActions.map((action, i) => (
            <ActionItem key={action.id} action={action} index={i} />
          ))}
        </div>
      </div>

      {/* ── Content Calendar Seed ──────────────────────────────────── */}
      <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-6 mb-6">
        <div className="flex items-center gap-2 mb-4">
          <Calendar className="w-4 h-4 text-gray-400" />
          <h3 className="text-sm font-black text-gray-800 uppercase tracking-wider">Semilla Editorial del Mes</h3>
        </div>
        <div className="space-y-2">
          {contentCalendarSeed.map((week, i) => (
            <CalendarWeekRow key={week.week} week={week} index={i} />
          ))}
        </div>
      </div>

      {/* ── SEO Keywords ───────────────────────────────────────────── */}
      <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-6 mb-8">
        <div className="flex items-center gap-2 mb-4">
          <Globe2 className="w-4 h-4 text-gray-400" />
          <h3 className="text-sm font-black text-gray-800 uppercase tracking-wider">Keywords SEO Recomendadas</h3>
        </div>
        <div className="flex flex-wrap gap-2">
          {seoKeywords.map((kw, i) => (
            <span key={i} className="px-3 py-1.5 bg-gray-50 border border-gray-100 rounded-full text-xs font-bold text-gray-600">
              {kw}
            </span>
          ))}
        </div>
      </div>

      {/* ── CTAs ───────────────────────────────────────────────────── */}
      {!hideCTAs && (
        <div className="flex items-center justify-between">
            {onRegenerate && (
            <button
                onClick={onRegenerate}
                className="flex items-center gap-2 text-sm font-bold text-gray-400 hover:text-gray-600 px-4 py-3 rounded-xl hover:bg-gray-50 transition-all"
            >
                <RefreshCw className="w-4 h-4" /> Regenerar Arquetipo
            </button>
            )}
            <button
            onClick={onFinish}
            disabled={saving}
            className="flex items-center gap-3 bg-gradient-to-r from-emerald-500 to-emerald-600 text-white px-8 py-4 rounded-2xl font-bold text-lg hover:from-emerald-600 hover:to-emerald-700 transition-all shadow-xl shadow-emerald-500/20 disabled:opacity-50 ml-auto"
            >
            {saving ? (
                <span className="flex items-center gap-2">
                <span className="w-5 h-5 border-2 border-white border-t-transparent rounded-full animate-spin" />
                Activando tu club...
                </span>
            ) : (
                <>
                Ir al Panel de Administración
                <ArrowRight className="w-5 h-5" />
                </>
            )}
            </button>
        </div>
      )}
    </div>
  );
};

export default ClubArchetypeCard;
