import type { CSSProperties } from 'react';
import { useClub } from '../contexts/ClubContext';
import { hasCustomTheme } from '../lib/entityTypes';

// Devuelve la clase + estilo para los botones CTA del inicio. En sitios con tema visual
// propio ('Evento o Convención') usa los colores configurables (fondo, hover y texto) vía
// la clase .cta-btn + variables CSS. El resto —incluidas las Ferias de Proyectos— conserva
// el estilo celeste estándar de club.
export const useCtaButton = (): { className: string; style?: CSSProperties } => {
    const { club } = useClub();
    const isEventSite = hasCustomTheme((club as any)?.type);
    if (!isEventSite) {
        return { className: 'bg-sky-100 hover:bg-sky-200 text-rotary-blue' };
    }
    const c = (club as any)?.colors || {};
    return {
        className: 'cta-btn',
        style: {
            ['--btn-bg' as string]: c.buttonBg || '#e0f2fe',
            ['--btn-hover' as string]: c.buttonHoverBg || '#bae6fd',
            ['--btn-text' as string]: c.buttonText || '#004080',
            ['--btn-text-hover' as string]: c.buttonTextHover || c.buttonText || '#004080',
        } as CSSProperties,
    };
};
