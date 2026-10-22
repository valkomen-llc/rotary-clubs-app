// ════════════════════════════════════════════════════════════════════════════
// Componentes Visuales Reutilizables de Páginas Públicas y Formularios
// Club Platform & Rotary en Acción — Arquitectura Compartida Multisitio (v4.1196.0)
//
// Unifica cabeceras institucionales, fondos texturizados (bg-rotary-concrete),
// contenedores balanceados (max-w-4xl), indicadores de progreso y tarjetas.
// Se adaptan dinámicamente a la identidad y tema del sitio activo.
// ════════════════════════════════════════════════════════════════════════════

import React from 'react';
import { Check } from 'lucide-react';
import Navbar from '../../sections/Navbar';
import Footer from '../../sections/Footer';
import { PAGE_HEADER_BACKGROUND } from '../../lib/pageHeader';

import { cn } from '../../lib/utils';

// ── 1. CABECERA INSTITUCIONAL DE PÁGINAS PÚBLICAS ────────────────────────────
export interface PublicPageHeaderProps {
  /** Título principal de la página (H1) */
  title: string;
  /** Subtítulo o descripción breve */
  subtitle?: React.ReactNode;
  /** Insignia o categoría opcional en la parte superior */
  badge?: string;
  /** Clases CSS adicionales para la sección */
  className?: string;
  /** Clases CSS para el contenedor interno del contenido (por defecto max-w-4xl lg:max-w-5xl xl:max-w-6xl) */
  contentClassName?: string;
  /** Clases CSS adicionales o personalizadas para el título H1 */
  titleClassName?: string;
  /** Clases CSS adicionales para el subtítulo */
  subtitleClassName?: string;
  /** Estilos en línea para sobreescritura dinámica de color o tema */
  style?: React.CSSProperties;
  /** Elementos opcionales dentro de la cabecera (debajo del subtítulo) */
  children?: React.ReactNode;
}

export const PublicPageHeader: React.FC<PublicPageHeaderProps> = ({
  title,
  subtitle,
  badge,
  className = '',
  contentClassName = '',
  titleClassName = '',
  subtitleClassName = '',
  style,
  children,
}) => {
  return (
    <section
      className={cn('relative overflow-hidden', className)}
      style={{
        ...PAGE_HEADER_BACKGROUND,
        ...style,
      }}
    >
      <div className="relative max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-14 sm:py-16 md:py-20 lg:py-24">
        <div className={cn('text-center mx-auto max-w-4xl lg:max-w-5xl xl:max-w-6xl', contentClassName)}>
          {badge && (
            <span className="inline-block text-[11px] font-black tracking-[0.18em] uppercase px-3 py-1 rounded-full bg-white/15 text-white/90 mb-4 border border-white/20">
              {badge}
            </span>
          )}
          <h1
            className={cn(
              "text-3xl sm:text-4xl md:text-5xl text-white mb-5 sm:mb-6 font-normal tracking-tight leading-tight font-['Open_Sans',sans-serif]",
              titleClassName
            )}
            style={{ fontWeight: 400 }}
          >
            {title}
          </h1>
          {subtitle && (
            <div className={cn('max-w-3xl mx-auto', subtitleClassName)}>
              <p className="text-white/80 text-base sm:text-lg md:text-xl font-normal leading-relaxed">
                {subtitle}
              </p>
            </div>
          )}
          {children}
        </div>
      </div>
    </section>
  );
};

// ── 2. MARCO / CONTENEDOR DE PÁGINA PÚBLICA CON FONDO INSTITUCIONAL ─────────
export interface PublicFormPageLayoutProps {
  children: React.ReactNode;
  className?: string;
}

export const PublicFormPageLayout: React.FC<PublicFormPageLayoutProps> = ({
  children,
  className = '',
}) => {
  return (
    <div className={`min-h-screen bg-rotary-concrete flex flex-col font-sans text-gray-800 ${className}`}>
      <Navbar />
      <main className="flex-1">{children}</main>
      <Footer />
    </div>
  );
};

// ── 3. CONTENEDOR PRINCIPAL DE FORMULARIOS PÚBLICOS (ANCHO UNIFICADO max-w-4xl) ──
export interface PublicFormContainerProps {
  children: React.ReactNode;
  className?: string;
}

export const PublicFormContainer: React.FC<PublicFormContainerProps> = ({
  children,
  className = '',
}) => {
  return (
    <div className={`max-w-4xl mx-auto px-4 sm:px-6 py-10 md:py-12 pb-20 space-y-4 relative z-10 ${className}`}>
      {children}
    </div>
  );
};

// ── 4. TARJETA BLANCA INSTITUCIONAL DE FORMULARIO ───────────────────────────
export interface PublicFormCardProps {
  children: React.ReactNode;
  className?: string;
}

export const PublicFormCard: React.FC<PublicFormCardProps> = ({
  children,
  className = '',
}) => {
  return (
    <div className={`bg-white rounded-3xl p-6 sm:p-8 md:p-10 shadow-sm border border-gray-100 ${className}`}>
      {children}
    </div>
  );
};

// ── 5. INDICADOR Y NAVEGADOR DE PASOS REUTILIZABLE ──────────────────────────
export interface PublicStepItem {
  id?: string | number;
  label: string;
  shortLabel?: string;
}

export interface PublicStepNavProps {
  steps: Array<string | PublicStepItem>;
  currentStep: number;
  onStepClick?: (stepIndex: number) => void;
  className?: string;
}

export const PublicStepNav: React.FC<PublicStepNavProps> = ({
  steps,
  currentStep,
  onStepClick,
  className = '',
}) => {
  const normalizedSteps = steps.map((s) =>
    typeof s === 'string' ? { label: s, shortLabel: s } : { label: s.label, shortLabel: s.shortLabel || s.label }
  );

  const totalSteps = normalizedSteps.length;
  const currentItem = normalizedSteps[currentStep] || normalizedSteps[0];
  const progressPercent = Math.min(100, Math.round(((currentStep + 1) / totalSteps) * 100));

  return (
    <nav aria-label="Progreso del formulario" className={`bg-white rounded-2xl border border-gray-100 p-3 sm:p-3.5 shadow-sm ${className}`}>
      {/* ── Vista Escritorio / Tablet (≥ sm) — Pasos distribuidos en una sola fila sin scroll horizontal ── */}
      <div
        className="hidden sm:grid gap-1.5 md:gap-2 items-center"
        style={{ gridTemplateColumns: `repeat(${totalSteps}, minmax(0, 1fr))` }}
      >
        {normalizedSteps.map((item, i) => {
          const isActive = i === currentStep;
          const isCompleted = i < currentStep;
          const isClickable = Boolean(onStepClick && isCompleted);

          return (
            <button
              key={item.label}
              type="button"
              onClick={() => isClickable && onStepClick?.(i)}
              disabled={!isClickable && !isActive}
              aria-current={isActive ? 'step' : undefined}
              title={item.label}
              className={`w-full flex items-center justify-center gap-1.5 md:gap-2 px-2 py-2 rounded-xl text-xs font-bold transition-all min-w-0 ${
                isActive
                  ? 'bg-rotary-blue text-white shadow-sm ring-2 ring-rotary-blue/20'
                  : isCompleted
                  ? 'bg-blue-50/70 text-rotary-blue hover:bg-blue-100/70 cursor-pointer border border-blue-100/60'
                  : 'bg-gray-50/70 text-gray-400 border border-gray-100 cursor-default opacity-85'
              }`}
            >
              <span
                className={`w-5 h-5 shrink-0 rounded-full flex items-center justify-center text-[10px] font-black transition-colors ${
                  isActive
                    ? 'bg-white/20 text-white'
                    : isCompleted
                    ? 'bg-rotary-blue text-white'
                    : 'bg-gray-200/80 text-gray-500'
                }`}
              >
                {isCompleted ? <Check className="w-3 h-3 stroke-[3]" /> : i + 1}
              </span>
              <span className="truncate text-[11px] lg:text-xs">
                <span className="hidden xl:inline">{item.label}</span>
                <span className="inline xl:hidden">{item.shortLabel}</span>
              </span>
            </button>
          );
        })}
      </div>

      {/* ── Vista Móvil (< sm) — Compacta, intuitiva, sin desplazamientos horizontales ── */}
      <div className="sm:hidden space-y-2.5">
        <div className="flex items-center justify-between gap-2">
          <span className="text-[11px] font-black text-rotary-blue uppercase tracking-wider">
            Paso {currentStep + 1} de {totalSteps}
          </span>
          <span className="text-xs font-bold text-gray-800 truncate text-right">
            {currentItem.label}
          </span>
        </div>

        {/* Barra de progreso fluida */}
        <div className="h-1.5 w-full bg-gray-100 rounded-full overflow-hidden">
          <div
            className="h-full bg-rotary-blue rounded-full transition-all duration-300 ease-out"
            style={{ width: `${progressPercent}%` }}
          />
        </div>

        {/* Stepper de indicadores táctiles */}
        <div
          className="grid gap-1.5 pt-0.5"
          style={{ gridTemplateColumns: `repeat(${totalSteps}, minmax(0, 1fr))` }}
        >
          {normalizedSteps.map((item, i) => {
            const isActive = i === currentStep;
            const isCompleted = i < currentStep;
            const isClickable = Boolean(onStepClick && isCompleted);

            return (
              <button
                key={item.label}
                type="button"
                onClick={() => isClickable && onStepClick?.(i)}
                disabled={!isClickable && !isActive}
                aria-current={isActive ? 'step' : undefined}
                className={`h-7 rounded-lg flex items-center justify-center text-[11px] font-black transition-all ${
                  isActive
                    ? 'bg-rotary-blue text-white shadow-xs ring-2 ring-rotary-blue/25'
                    : isCompleted
                    ? 'bg-blue-50 text-rotary-blue border border-blue-200/60 cursor-pointer'
                    : 'bg-gray-100 text-gray-400 cursor-default opacity-80'
                }`}
              >
                {isCompleted ? <Check className="w-3.5 h-3.5 stroke-[3]" /> : i + 1}
              </button>
            );
          })}
        </div>
      </div>
    </nav>
  );
};
