// Vercel Edge Middleware - Hardened for Priority Redirection
export default function middleware(req) {
  const url = new URL(req.url);
  const host = (req.headers.get('host') || '').toLowerCase();

  // Robust check for the main domain (clubplatform.org)
  // Targets the root domain hit to /
  const isMainDomain = host.includes('clubplatform.org') && !host.startsWith('app.') && !host.startsWith('api.');
  const isVercelRoot = host.includes('club-platform.vercel.app');
  
  if ((isMainDomain || isVercelRoot) && url.pathname === '/') {
    // Using 302 to prevent browser caching while testing the infrastructure
    return Response.redirect('https://app.clubplatform.org/', 302);
  }
}
