#!/usr/bin/env node
// ════════════════════════════════════════════════════════════════════
// Recuperación de las fotos HEIC/HEIF ya enviadas — v4.1305.0
//
// Genera la vista previa JPEG y la miniatura de las fotos HEIC del
// almacenamiento de aportes que todavía no la tienen (Visitas del Gobernador y
// solicitudes de Rotary en Acción). Es lo MISMO que hace el botón «Generar
// vistas previas» del panel, para correrlo desde una terminal con las
// variables del despliegue (DATABASE_URL y las credenciales de S3).
//
//   npm run heic:recover -- --visit=VG-2026-SG53HR      (empezar por Manizales)
//   npm run heic:recover -- --dry-run                    (sólo el inventario)
//   npm run heic:recover                                 (todas las pendientes)
//   npm run heic:recover -- --retry-errors               (+ reintentar fallidas)
//
// Idempotente y reanudable: lo que ya tiene vista previa no se vuelve a
// convertir; si se corta, se vuelve a correr y sigue. NUNCA modifica ni borra
// un original: escribe sólo en `…/_preview/`.
// ════════════════════════════════════════════════════════════════════
const args = Object.fromEntries(process.argv.slice(2).map(a => {
    const [k, v] = a.replace(/^--/, '').split('=');
    return [k, v === undefined ? true : v];
}));
if (!process.env.DATABASE_URL) {
    console.error('Falta DATABASE_URL (y las credenciales de S3). Ver docs/claude/vistas-previas-heic-de-los-aportes.md');
    process.exit(2);
}
const P = await import('../server/lib/submissionImagePreviews.js');
const visitRef = typeof args.visit === 'string' ? args.visit : null;

const pintar = (items) => {
    const r = P.summarizeInventory(items);
    console.log(`\nFotos HEIC${visitRef ? ` de ${visitRef}` : ''}: ${r.counts.total} · listas ${r.counts.ready} · pendientes ${r.counts.pending + (r.counts.processing || 0)} · con error ${r.counts.error}`);
    for (const e of r.errors) console.log(`  ✗ ${e.source === 'governor_visit' ? e.ownerRef : `solicitud ${e.ownerRef}`} · ${e.filename} [${e.errorCode}] ${e.error}`);
    return r;
};

pintar(await P.heicInventory({ visitRef }));
if (args['dry-run']) process.exit(0);

let vuelta = 0;
for (;;) {
    vuelta++;
    const out = await P.processPreviewBatch({ visitRef, limit: 6, budgetMs: 10 * 60 * 1000, retryErrors: Boolean(args['retry-errors']) && vuelta === 1 });
    for (const p of out.processed) console.log(`  ${p.preview.status === 'ready' ? '✓' : '✗'} ${p.ownerRef} · ${p.filename} → ${p.preview.status}${p.preview.error ? ` (${p.preview.error})` : ''}`);
    if (!out.remaining || !out.processed.length) break;
}
const final = pintar(await P.heicInventory({ visitRef }));
process.exit(final.counts.error ? 1 : 0);
