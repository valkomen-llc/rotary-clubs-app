// Contextos sustituidos para poder montar el ExpirationBanner REAL en un
// navegador sin levantar la aplicación entera. El sitio y el usuario se
// inyectan desde la prueba con `window.__sitio` / `window.__usuario`.
//
// Se sustituyen SÓLO los contextos: el componente que se prueba es el de
// producción, sin tocar. Reproducir su condición acá no probaría nada — es
// justamente la condición que estaba mal.
import React from 'react';

export const useClub = () => ({
    club: (window as any).__sitio ?? null,
    bannerVisible: (window as any).__bannerVisible ?? true,
    setBannerVisible: (v: boolean) => { (window as any).__ocultado = !v; },
});

export const useAuth = () => ({ user: (window as any).__usuario ?? null });

export const ClubContext = React.createContext(null);
export default useClub;
