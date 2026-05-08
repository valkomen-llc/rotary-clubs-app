export async function middleware(request) {
  const hostname = request.headers.get('host') || '';
  const url = new URL(request.url);
  const pathname = url.pathname;
  
  const isMainDomain = hostname === 'clubplatform.org' || 
                       hostname === 'www.clubplatform.org' || 
                       hostname === 'rotaryclubplatform.org' || 
                       hostname === 'www.rotaryclubplatform.org';

  const isSystemPath = pathname.startsWith('/admin') || 
                       pathname.startsWith('/api') || 
                       pathname.startsWith('/media') || 
                       pathname.startsWith('/assets');

  if (isMainDomain && !isSystemPath) {
    try {
      // Usamos el hostname para construir la URL de la API
      // En Vercel Edge, fetch funciona de forma nativa
      const apiUrl = `${url.protocol}//${hostname}/api/platform-config/logo`;
      const res = await fetch(apiUrl);
      if (res.ok) {
        const config = await res.json();
        if (config.saasRedirect === true) {
          console.log('[EdgeRedirect] Active. Redirecting to app.clubplatform.org/login');
          return Response.redirect('https://app.clubplatform.org/login', 302);
        }
      }
    } catch (e) {
      // Fallback silencioso si falla la API
    }
  }

  return; // Continuar normal
}

export const config = {
  matcher: ['/'], // Solo nos interesa el root para esta redirección principal
};
