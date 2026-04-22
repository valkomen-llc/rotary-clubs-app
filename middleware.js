// Vercel Edge Middleware (Standard Web API compatible)
export default async function middleware(req) {
  const url = new URL(req.url);
  const host = req.headers.get('host') || '';

  // Only target the root domain
  const isRootDomain = host === 'clubplatform.org' || host === 'www.clubplatform.org' || host === 'club-platform.vercel.app';
  
  if (isRootDomain && url.pathname === '/') {
    try {
      // Dynamic check via the public API
      const configRes = await fetch(`${url.origin}/api/platform-config/logo`);
      if (configRes.ok) {
        const config = await configRes.json();
        if (config.saasRedirect) {
          return Response.redirect('https://app.clubplatform.org/', 301);
        }
  }
  
  // Return nothing to continue to standard Vercel routing (static files, rewrites, etc.)
}
