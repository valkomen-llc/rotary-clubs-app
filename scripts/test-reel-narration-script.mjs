#!/usr/bin/env node
// ════════════════════════════════════════════════════════════════════
// Prueba del generador de texto de narración (v4.1087)
// Verifica:
// 1. Sanitización de menciones institucionales a "Distrito 4281".
// 2. Cálculo de presupuesto de palabras por duración.
// 3. Existencia de la ruta /reels/:id/narration/script y su cableado.
// 4. Inclusión de las reglas permanentes en SCRIPT_SYSTEM y buildScriptPrompt.
// ════════════════════════════════════════════════════════════════════

import { readFileSync } from 'node:fs';
import { sanitizeNarrationScript, buildScriptPrompt } from '../server/lib/reelNarration.js';

let total = 0, passed = 0;
const check = (desc, ok) => {
    total++;
    if (ok) {
        passed++;
        console.log(`  OK    ${desc}`);
    } else {
        console.error(`  FAIL  ${desc}`);
        process.exitCode = 1;
    }
};

console.log('\n▸ Reglas permanentes y sanitización de guion para voz en off');
{
    const original = 'En Rotary Distrito 4281 entregamos carpas y esperanza a las familias.';
    const sanitizado = sanitizeNarrationScript(original);
    check('remueve "Rotary Distrito 4281" del guion', !/Distrito\s*4281/i.test(sanitizado));
    check('conserva el mensaje humano y de servicio', sanitizado.includes('entregamos carpas y esperanza'));

    const original2 = 'La solidaridad del Distrito 4281 de Rotary International transforma comunidades.';
    const sanitizado2 = sanitizeNarrationScript(original2);
    check('remueve variante "Distrito 4281 de Rotary International"', !/Distrito\s*4281/i.test(sanitizado2));
    check('conserva el sentido de transformación y solidaridad', sanitizado2.includes('transforma comunidades'));
}

console.log('\n▸ Integración del prompt con contexto amplio y reglas permanentes');
{
    const prompt = buildScriptPrompt({
        scenes: [{ durationSec: 5, analysis: { summary: 'Voluntarios entregando carpas' } }],
        budget: { targetWords: 35, maxWords: 40, availableSec: 15 },
        language: 'es-CO',
        style: 'institucional',
        context: { typeLabel: 'Acción Comunitaria', tone: 'solidario', focus: 'ayuda', areaDescription: 'Desarrollo Comunitario' },
        clubName: 'Rotary Distrito 4281',
        clubCity: 'Quimbaya',
        durationSec: 15,
        sourceContext: {
            campaignName: 'Emergencia Terremoto Colombia',
            submissionTitle: 'Entrega de carpas Quimbaya',
            articleTitle: 'Rotary Quimbaya entrega carpas y lámparas',
            story: 'Familias campesinas recibieron refugio digno tras el sismo.'
        }
    });

    check('el prompt omite o filtra el nombre si es Rotary Distrito 4281', !/Entidad local promotora: "Rotary Distrito 4281"/.test(prompt));
    check('incluye la regla fundamental de no mencionar Distrito 4281', /NO menciones "Rotary Distrito 4281"/.test(prompt));
    check('incluye contexto de la campaña fuente', /Emergencia Terremoto Colombia/.test(prompt));
    check('incluye contexto del título de la solicitud', /Entrega de carpas Quimbaya/.test(prompt));
    check('incluye contexto del artículo de blog relacionado', /Rotary Quimbaya entrega carpas y lámparas/.test(prompt));
    check('incluye relato comunitario / historia de personas', /Familias campesinas recibieron refugio/.test(prompt));
    check('presupuesto exacto de palabras está presente', /PRESUPUESTO EXACTO: 35 palabras/.test(prompt));
}

console.log('\n▸ Cableado en rutas y controladores');
{
    const routes = readFileSync('server/routes/contentStudio.js', 'utf8');
    const controller = readFileSync('server/controllers/reelController.js', 'utf8');
    const panel = readFileSync('src/components/admin/content-studio/ReelNarrationPanel.tsx', 'utf8');

    check('ruta POST /reels/:id/narration/script existe en routes', /\/reels\/:id\/narration\/script/.test(routes));
    check('controlador generateNarrationScript está exportado', /export const generateNarrationScript\b/.test(controller));
    check('generateNarrationScript consulta resolveReelSourceContext', /resolveReelSourceContext/.test(controller));
    check('panel tiene el campo Texto de la voz en off', /Texto de la voz en off/.test(panel));
    check('panel incluye botón para generar o regenerar texto con IA', /Regenerar texto con IA/.test(panel));
    check('panel permite edición directa del texto antes de generar', /textarea/.test(panel) && /onChange=/.test(panel));
    check('panel llama a /reels/:id/narration/script', /\/narration\/script/.test(panel));
}

console.log(`\n✓ ${passed} comprobaciones, ${total - passed} fallos\n`);
