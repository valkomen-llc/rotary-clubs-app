// ════════════════════════════════════════════════════════════════════
// Fondo de las cabeceras de página
// v4.613.0
//
// Es el mismo fondo que usa la página de Contacto: azul oscuro con la
// textura geométrica de Rotary repetida. Se centraliza aquí para que las
// cabeceras del sitio no se vayan separando entre sí con el tiempo.
// ════════════════════════════════════════════════════════════════════

import type { CSSProperties } from 'react';

export const PAGE_HEADER_BACKGROUND: CSSProperties = {
    backgroundColor: '#0c3c7c',
    backgroundImage: "url('/geo-darkblue.png')",
    backgroundPosition: '50% 0',
    backgroundRepeat: 'repeat',
    backgroundSize: '71px 85px',
};
