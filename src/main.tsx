// CACHE REBOOT: v4.18.0 | 2026-04-22
import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.tsx'
import { escucharFallosDePrecarga } from './lib/lazyWithRetry'
import { normalizarVueltaDeFacebook } from './lib/facebookRedirect'

// Se registra ACÁ, al arrancar, y no dentro de un componente: es un oyente del
// documento, no del ciclo de vida de nadie, y meterlo en un `useEffect` lo
// sujetaría a que ese componente esté montado —justo lo que no se puede
// garantizar cuando lo que falla es la carga de una pantalla—.
escucharFallosDePrecarga();

// Facebook deja su resto «_=_» al volver de un flujo de OAuth. Como fragmento
// es inofensivo; como segmento de ruta (`/_=_`) no casa con ninguna ruta y la
// pantalla queda en blanco. Se limpia ACÁ, antes de montar React: para cuando
// un componente se monta, el enrutador ya decidió que no hay nada que pintar.
normalizarVueltaDeFacebook();

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
