#!/usr/bin/env node
// ════════════════════════════════════════════════════════════════════
// USAR UN OUTRO NO ES GENERARLO.  npm run test:outro:picker
// v4.1241.0
//
// Reporte: en la ficha de un Reel de rotary4281.org, «Elegir outro» decía
// «La herramienta 'outro' no está disponible para este sitio» y no dejaba
// poner el outro guardado desde el Generador de Outros. La lista de outros y
// el predeterminado exigían la herramienta «Outro IA» (el GENERADOR), apagada
// en ese sitio, aunque el Reel y su Biblioteca estaban habilitados.
//
// Prueba el criterio (`anyStudioToolEnabled`) y el cableado de las rutas: las
// dos lecturas aceptan cualquier herramienta de video; lo que crea, edita o
// borra sigue exigiendo «Outro IA». Sin base ni red.
// ════════════════════════════════════════════════════════════════════
import { readFileSync } from 'node:fs';
import { anyStudioToolEnabled, OUTRO_READ_TOOLS } from '../server/lib/contentStudioFeatures.js';

let total = 0, passed = 0;
const check = (d, ok) => { total++; if (ok) { passed++; console.log(`  OK    ${d}`); } else { console.error(`  FAIL  ${d}`); process.exitCode = 1; } };

console.log('\n▸ El criterio');
const sitioSinGenerador = { video: true, post: true, outro: false, library: true, ai_reels: true, video_library: true };
check('con el generador apagado y los Reels encendidos, el selector de outros entra', anyStudioToolEnabled(sitioSinGenerador, OUTRO_READ_TOOLS));
check('el generador sigue cerrado para ese sitio', !anyStudioToolEnabled(sitioSinGenerador, ['outro']));
check('sin ninguna herramienta de video, el selector tampoco entra', !anyStudioToolEnabled({ outro: false, video: false, ai_reels: false, library: false, video_library: false }, OUTRO_READ_TOOLS));
check('una herramienta sin configurar cuenta como habilitada (igual que antes)', anyStudioToolEnabled({}, ['outro']));

console.log('\n▸ Las rutas');
const routes = readFileSync(new URL('../server/routes/contentStudio.js', import.meta.url), 'utf8');
const guardOf = (method, path) => {
    const m = routes.match(new RegExp(`router\\.${method}\\('${path.replace(/[/:]/g, c => '\\' + c)}',\\s*authMiddleware,\\s*requireStudioTool\\(([^)]+)\\)`));
    return m ? m[1].trim() : null;
};
check('GET /outros (la lista del selector) acepta las herramientas de video', guardOf('get', '/outros') === 'OUTRO_READ_TOOLS');
check('GET /outros/default (el predeterminado) acepta las herramientas de video', guardOf('get', '/outros/default') === 'OUTRO_READ_TOOLS');
for (const [m, p] of [['post', '/outros'], ['patch', '/outros/:id'], ['delete', '/outros/:id'], ['post', '/outros/import'], ['put', '/outros/default'], ['delete', '/outros/default'], ['post', '/outros/:id/remix']]) {
    check(`${m.toUpperCase()} ${p} sigue exigiendo «Outro IA»`, guardOf(m, p) === "'outro'");
}
check('poner el outro en un Reel (PUT /reels/:id/outro) no depende del generador', /router\.put\('\/reels\/:id\/outro', authMiddleware, setReelOutro\)/.test(routes));

console.log(`\n${passed}/${total} comprobaciones${passed === total ? ' — todo en orden.' : ' — HAY FALLOS.'}\n`);
