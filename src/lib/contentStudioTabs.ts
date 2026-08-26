// ════════════════════════════════════════════════════════════════════
// Estudio de Contenido — qué pestañas se PINTAN según el sitio (v4.931)
//
// PURO. La identificación es el TIPO del sitio (ClubContext → entityTypes),
// nunca el dominio: es la identidad de tenant que la plataforma ya tiene, y
// un condicional por dominio se rompería en la vista previa de plataforma.
//
// EN EL SITIO DE UN DISTRITO (pedido expreso del Distrito 4281):
//   · se AGREGA «Aniversarios IA» — la MISMA herramienta del formulario
//     público, ejecutada con la sesión del administrador ya presente;
//   · se OCULTAN «Generador de Outros IA», «Cuentas Sociales» y
//     «Distribución» — la Secretaría no las usa y estorban.
//
// ESTO DECIDE QUÉ SE PINTA, NO A QUÉ SE TIENE ACCESO (la regla de v4.894 con
// Plantillas IA): los módulos ocultados siguen enteros para los demás sitios
// y sus endpoints conservan su alcance de siempre. Ante un tipo desconocido,
// no se oculta nada — la duda no puede dejar a un sitio sin sus herramientas.
// ════════════════════════════════════════════════════════════════════
import { isDistrictSite } from './entityTypes';

/** Las pestañas que el panel de un DISTRITO no pinta. */
export const DISTRICT_HIDDEN_TABS = ['outros', 'accounts', 'distribution'] as const;

/** ¿Se pinta esta pestaña para este sitio? Un solo punto de decisión: el
 *  disparador y su contenido preguntan acá — condicionados JUNTOS, o el
 *  contenido quedaría alcanzable sin botón que lleve a él (v4.894). */
export const studioTabVisible = (tabId: string, clubType?: string): boolean => {
    const distrito = isDistrictSite(clubType);
    if (tabId === 'anniversaries') return distrito;
    if (distrito && (DISTRICT_HIDDEN_TABS as readonly string[]).includes(tabId)) return false;
    return true;
};

export default { DISTRICT_HIDDEN_TABS, studioTabVisible };
