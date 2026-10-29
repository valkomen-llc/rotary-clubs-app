import React from 'react';
import { Navigate, useLocation } from 'react-router-dom';

// v4.1261: la dirección canónica del formulario es /visitas-del-gobernador.
// La anterior (/rotary-en-accion/visitas-del-gobernador) redirige CONSERVANDO
// la consulta: un enlace de corrección ya enviado (?corregir=…) sigue sirviendo.
const VisitasGobernadorRedirect: React.FC = () => {
  const { search, hash } = useLocation();
  return <Navigate to={`/visitas-del-gobernador${search}${hash}`} replace />;
};
export default VisitasGobernadorRedirect;
