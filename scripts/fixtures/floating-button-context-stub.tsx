// Contexto sustituido para montar el `FloatingSiteButton` REAL en un navegador
// sin levantar la aplicación entera. El sitio se inyecta desde la prueba con
// `window.__sitio`.
//
// Se sustituye SÓLO el contexto: el componente que se prueba es el de
// producción, sin tocar. Reproducir su criterio acá no probaría nada — es
// justamente lo que hay que comprobar.
import React from 'react';

export const useClub = () => ({ club: (window as any).__sitio ?? null });
export const ClubContext = React.createContext(null);
export default useClub;
