#!/usr/bin/env node
/**
 * site-health.mjs — diagnóstico de disponibilidad de un dominio de Club Platform (v4.1180).
 *
 * Uso:
 *   node scripts/site-health.mjs rotary4281.org [otro.org …] [--runs 8] [--json]
 *   SITE_HEALTH_DOMAINS="a.org,b.org" node scripts/site-health.mjs
 *
 * Qué mide, por CAPA (el criterio vive en server/lib/siteHealthSpec.js):
 *   dns      A / AAAA del dominio y CNAME de www, por DNS sobre HTTPS (dos
 *            resolutores, para ver diferencias entre redes).
 *   redirect http:// → https:// y dominio pelado → www (o al revés).
 *   document N cargas de la portada: primer byte, #root, programa principal,
 *            y de dónde salió el documento (X-Doc-Source: computed/fresh/
 *            stale/base).
 *   asset    que el programa que nombra el documento exista y sea JavaScript.
 *   function /api/health/live (sin base).
 *   db       /api/health/deps (base con tope).
 *   api      /api/clubs/by-domain (la configuración que pinta la SPA).
 *
 * Sale con código 2 si hay hallazgos críticos, 1 con advertencias y 0 si todo
 * está bien: sirve igual para mirarlo a mano que para un monitor externo.
 * No escribe nada en ningún lado: es de SÓLO LECTURA.
 */
import { summarize, judgeDns, HEALTH_TARGETS } from '../server/lib/siteHealthSpec.js';

const args = process.argv.slice(2);
const flag = (name, def) => {
  const i = args.indexOf(`--${name}`);
  return i >= 0 ? args[i + 1] : def;
};
const asJson = args.includes('--json');
const runs = Math.max(1, Math.min(30, Number(flag('runs', 6)) || 6));
const ATTEMPT_TIMEOUT_MS = Number(flag('timeout', 15000)) || 15000;
const domains = [
  ...args.filter((a, i) => !a.startsWith('--') && !(['--runs', '--timeout'].includes(args[i - 1]))),
  ...String(process.env.SITE_HEALTH_DOMAINS || '').split(',').map(s => s.trim()).filter(Boolean),
];
if (!domains.length) {
  console.error('Uso: node scripts/site-health.mjs <dominio> [--runs N] [--json]');
  process.exit(64);
}

async function timed(url, init = {}, ms = ATTEMPT_TIMEOUT_MS) {
  const t0 = performance.now();
  try {
    const res = await fetch(url, { ...init, signal: AbortSignal.timeout(ms), headers: { 'user-agent': 'ClubPlatform-SiteHealth/1.0', 'cache-control': 'no-cache', ...(init.headers || {}) } });
    const ttfbMs = Math.round(performance.now() - t0);
    const body = init.method === 'HEAD' ? '' : await res.text();
    return { ok: true, res, body, ttfbMs, totalMs: Math.round(performance.now() - t0) };
  } catch (e) {
    return { ok: false, error: e?.message || String(e), errorCode: e?.cause?.code || e?.code || e?.name || '', ttfbMs: Math.round(performance.now() - t0) };
  }
}

async function doh(resolver, name, type) {
  const url = resolver === 'google'
    ? `https://dns.google/resolve?name=${encodeURIComponent(name)}&type=${type}`
    : `https://cloudflare-dns.com/dns-query?name=${encodeURIComponent(name)}&type=${type}`;
  const r = await timed(url, { headers: { accept: 'application/dns-json' } }, 8000);
  if (!r.ok) return { error: r.error };
  try {
    const j = JSON.parse(r.body);
    const want = { A: 1, AAAA: 28, CNAME: 5 }[type];
    return { values: (j.Answer || []).filter(a => a.type === want).map(a => String(a.data).replace(/\.$/, '')), ttl: (j.Answer || [])[0]?.TTL };
  } catch (e) { return { error: e.message }; }
}

async function probeDns(domain) {
  const apex = domain.replace(/^www\./, '');
  const out = {};
  for (const resolver of ['google', 'cloudflare']) {
    out[resolver] = {
      apexA: await doh(resolver, apex, 'A'),
      apexAAAA: await doh(resolver, apex, 'AAAA'),
      wwwCname: await doh(resolver, `www.${apex}`, 'CNAME'),
      wwwA: await doh(resolver, `www.${apex}`, 'A'),
    };
  }
  const g = out.google;
  const findings = judgeDns({
    apexA: g.apexA.values || [], apexAAAA: g.apexAAAA.values || [],
    wwwCname: g.wwwCname.values || [], wwwA: g.wwwA.values || [],
  });
  const a1 = JSON.stringify((out.google.apexA.values || []).sort());
  const a2 = JSON.stringify((out.cloudflare.apexA.values || []).sort());
  if (out.google.apexA.values && out.cloudflare.apexA.values && a1 !== a2) {
    findings.push({ level: 'warning', layer: 'dns', code: 'resolver_mismatch', message: `Los resolutores no coinciden (Google ${a1}, Cloudflare ${a2}): propagación incompleta o zona inconsistente.` });
  }
  return { raw: out, findings };
}

async function probeRedirects(domain) {
  const apex = domain.replace(/^www\./, '');
  const chain = [];
  let url = `http://${apex}/`;
  for (let i = 0; i < 5; i++) {
    const r = await timed(url, { redirect: 'manual', method: 'GET' }, 10000);
    if (!r.ok) { chain.push({ url, error: r.error, code: r.errorCode }); break; }
    const loc = r.res.headers.get('location');
    chain.push({ url, status: r.res.status, ms: r.ttfbMs, location: loc });
    if (!loc || r.res.status < 300 || r.res.status >= 400) break;
    url = new URL(loc, url).toString();
  }
  return chain;
}

async function probeDocument(origin) {
  const r = await timed(`${origin}/?_health=${Date.now()}`);
  if (!r.ok) return { error: r.error, errorCode: r.errorCode, ttfbMs: r.ttfbMs };
  const html = r.body;
  const scriptSrc = (html.match(/<script[^>]+type="module"[^>]+src="([^"]+)"/) || html.match(/<script[^>]+src="([^"]+)"[^>]+type="module"/) || [])[1] || null;
  let assetStatus = null; let assetType = null;
  if (scriptSrc) {
    const a = await timed(new URL(scriptSrc, origin).toString(), { method: 'GET' });
    assetStatus = a.ok ? a.res.status : 0;
    assetType = a.ok ? a.res.headers.get('content-type') : a.error;
  }
  return {
    status: r.res.status,
    ttfbMs: r.ttfbMs,
    hasRoot: /<div id="root">/.test(html),
    scriptSrc, assetStatus, assetType,
    docSource: r.res.headers.get('x-doc-source'),
    serverTiming: r.res.headers.get('server-timing'),
    vercelId: r.res.headers.get('x-vercel-id'),
    cache: r.res.headers.get('cache-control'),
    bytes: html.length,
  };
}

async function probeJson(url) {
  const r = await timed(url);
  if (!r.ok) return { ok: false, ms: r.ttfbMs, error: r.error };
  let json = null; try { json = JSON.parse(r.body); } catch { /* no es JSON */ }
  return { ok: r.res.ok && !!json, status: r.res.status, ms: r.ttfbMs, source: r.res.headers.get('x-site-config'), json };
}

async function diagnose(domain) {
  const dns = await probeDns(domain);
  const redirects = await probeRedirects(domain);
  const last = redirects[redirects.length - 1];
  const finalUrl = last?.url && !last.error ? last.url : `https://${domain}/`;
  const origin = new URL(finalUrl).origin;

  const attempts = []; const live = []; const siteConfig = [];
  for (let i = 0; i < runs; i++) {
    attempts.push(await probeDocument(origin));
    const l = await probeJson(`${origin}/api/health/live`);
    live.push({ ok: l.ok, ms: l.ms, status: l.status });
    const s = await probeJson(`${origin}/api/clubs/by-domain?domain=${encodeURIComponent(new URL(origin).hostname)}`);
    siteConfig.push({ ok: s.ok, ms: s.ms, status: s.status, source: s.source, name: s.json?.name, resolvedBy: s.json?.resolvedBy });
  }
  const depsR = await probeJson(`${origin}/api/health/deps`);
  const deps = depsR.json || (depsR.ok ? null : { status: 'unreachable', checks: {} });

  const verdict = summarize({ attempts, live, siteConfig, deps, dns: dns.findings });
  return { domain, origin, at: new Date().toISOString(), targets: HEALTH_TARGETS, redirects, dns: dns.raw, attempts, live, siteConfig, deps, ...verdict };
}

const results = [];
for (const d of domains) results.push(await diagnose(d.trim().toLowerCase()));

if (asJson) {
  console.log(JSON.stringify(results, null, 2));
} else {
  for (const r of results) {
    const icon = { ok: '✅', warning: '⚠️ ', critical: '❌' }[r.status];
    console.log(`\n${icon} ${r.domain}  →  ${r.origin}`);
    console.log(`   cargas OK ${r.metrics.okCount}/${r.metrics.attempts} · documento p95 ${r.metrics.docP95Ms} ms (máx ${r.metrics.docMaxMs}) · by-domain p95 ${r.metrics.siteConfigP95Ms} ms`);
    console.log(`   redirecciones: ${r.redirects.map(x => x.error ? `ERROR ${x.code}` : `${x.status}`).join(' → ')}`);
    console.log(`   fuente del documento: ${r.attempts.map(a => a.docSource || (a.error ? 'ERR' : '?')).join(', ')}`);
    for (const f of r.findings) console.log(`   [${f.level}] ${f.layer}: ${f.message}`);
  }
}
const worst = results.some(r => r.status === 'critical') ? 2 : results.some(r => r.status === 'warning') ? 1 : 0;
process.exit(worst);
