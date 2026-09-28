import React from 'react';
import { Navigate, useParams, useSearchParams } from 'react-router-dom';

// Compatibilidad legacy (v4.1121): /aportar-contenido/:ref redirige al slug
// universal conservando el contexto (?campaign=) y el resto de parámetros
// (ca_token, utm_*, draft). Ningún enlace viejo en WhatsApp o correo se rompe.
const LegacyAportarRedirect: React.FC = () => {
  const { ref } = useParams<{ ref: string }>();
  const [search] = useSearchParams();
  const qs = new URLSearchParams(search);
  if (ref && !qs.get('campaign')) qs.set('campaign', ref);
  const s = qs.toString();
  return <Navigate to={`/rotary-en-accion${s ? `?${s}` : ''}`} replace />;
};
export default LegacyAportarRedirect;
