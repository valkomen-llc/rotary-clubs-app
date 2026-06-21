import type { CSSProperties } from 'react';
import { useClub } from '../contexts/ClubContext';

// Devuelve la clase + estilo para los botones CTA del inicio. En sitios de tipo
// "Evento o Convención" usa los colores configurables (fondo, hover y texto) vía
// la clase .cta-btn + variables CSS. El resto conserva el estilo celeste original.
export const useCtaButton = (): { className: string; style?: CSSProperties } => {
    const { club } = useClub();
    const isEventSite = (club as any)?.type === 'Evento o Convención';
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
