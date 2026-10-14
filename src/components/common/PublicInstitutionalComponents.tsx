// ════════════════════════════════════════════════════════════════════════════
// Componentes Visuales Reutilizables de Páginas Públicas y Formularios
// Club Platform & Rotary en Acción — Arquitectura Compartida Multisitio (v4.1196.0)
//
// Unifica cabeceras institucionales, fondos texturizados (bg-rotary-concrete),
// contenedores balanceados (max-w-4xl), indicadores de progreso y tarjetas.
// Se adaptan dinámicamente a la identidad y tema del sitio activo.
// ════════════════════════════════════════════════════════════════════════════

import React from 'react';
import Navbar from '../../sections/Navbar';
import Footer from '../../sections/Footer';
import { PAGE_HEADER_BACKGROUND } from '../../lib/pageHeader';

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
  style,
  children,
}) => {
  return (
    <section
      className={`relative overflow-hidden ${className}`}
      style={{
        ...PAGE_HEADER_BACKGROUND,
        ...style,
      }}
    >
      <div className="relative max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-16 md:py-24">
        <div className="text-center max-w-3xl mx-auto">
          {badge && (
            <span className="inline-block text-[11px] font-black tracking-[0.18em] uppercase px-3 py-1 rounded-full bg-white/15 text-white/90 mb-4 border border-white/20">
              {badge}
            </span>
          )}
          <h1 className="text-3xl md:text-5xl text-white mb-6 font-bold tracking-tight leading-tight">
            {title}
          </h1>
          {subtitle && (
            <p className="text-white/80 text-lg md:text-xl font-normal leading-relaxed">
              {subtitle}
            </p>
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
  const stepLabels = steps.map((s) => (typeof s === 'string' ? s : s.label));

  return (
    <nav aria-label="Progreso del formulario" className={`bg-white rounded-2xl border border-gray-100 px-4 sm:px-6 py-3.5 shadow-sm ${className}`}>
      <div className="flex items-center justify-between gap-2 overflow-x-auto">
        {stepLabels.map((label, i) => {
          const isActive = i === currentStep;
          const isCompleted = i < currentStep;
          const isClickable = Boolean(onStepClick && isCompleted);

          return (
            <button
              key={label}
              type="button"
              onClick={() => isClickable && onStepClick?.(i)}
              disabled={!isClickable && !isActive}
              aria-current={isActive ? 'step' : undefined}
              className={`flex items-center gap-2 text-xs font-bold whitespace-nowrap px-3 py-1.5 rounded-full transition-all ${
                isActive
                  ? 'bg-rotary-blue text-white shadow-sm'
                  : isCompleted
                  ? 'text-rotary-blue hover:bg-blue-50 cursor-pointer'
                  : 'text-gray-400 disabled:opacity-60 cursor-default'
              }`}
            >
              <span
                className={`w-5 h-5 rounded-full flex items-center justify-center text-[10px] font-black ${
                  isActive
                    ? 'bg-white/25 text-white'
                    : isCompleted
                    ? 'bg-rotary-blue text-white'
                    : 'bg-gray-100 text-gray-500'
                }`}
              >
                {i + 1}
              </span>
              <span className="hidden sm:inline">{label}</span>
            </button>
          );
        })}
      </div>
      <p className="sm:hidden text-[11px] font-bold text-gray-400 mt-2">
        Paso {currentStep + 1} de {stepLabels.length}: {stepLabels[currentStep]}
      </p>
    </nav>
  );
};
