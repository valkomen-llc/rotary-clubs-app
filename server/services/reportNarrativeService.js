/**
 * Report Narrative Service — genera el resumen ejecutivo y las recomendaciones
 * inteligentes de un informe a partir del dataset calculado.
 *
 * Usa `generateCopy` (adaptador multi-proveedor: OpenAI / Gemini / Claude) en
 * modo JSON. Si ningún proveedor está configurado o la llamada falla, cae a un
 * resumen determinístico construido con los propios números, de modo que el
 * informe SIEMPRE tiene narrativa (no depende de una API externa).
 */

import { generateCopy } from './copywritingService.js';

const AREAS = ['Comunicación', 'Comunidad', 'Contenidos', 'E-commerce', 'IA', 'SEO', 'Automatización', 'Seguridad'];

const compactDataset = (ds) => {
    const b = ds;
    return {
        sitio: ds.meta.site.name,
        categoria: ds.meta.site.categoryLabel,
        distrito: ds.meta.site.districtName,
        periodo: ds.meta.period.label,
        madurez: { puntuacion: ds.maturity.score, nivel: ds.maturity.level, dimensiones: ds.maturity.dimensions.map((d) => ({ [d.label]: d.score })) },
        digitalizacion: ds.ecosystem.digitalizationPct,
        modulos_activos: ds.ecosystem.activeCount,
        modulos_total: ds.ecosystem.totalCount,
        kpis: ds.headlineKpis.map((k) => ({ [k.label]: k.display })),
        modulos: ds.ecosystem.modules.map((m) => ({ [m.label]: m.statusLabel })),
        logros: ds.achievements.filter((a) => a.earned).map((a) => a.label),
    };
};

const buildPrompt = (ds) => {
    const data = compactDataset(ds);
    return `Analiza los siguientes datos de gestión digital de un sitio alojado en "Club Platform" y redacta un informe ejecutivo profesional en español, orientado a juntas directivas y responsables institucionales.

DATOS:
${JSON.stringify(data, null, 2)}

Devuelve EXCLUSIVAMENTE un objeto JSON con esta forma exacta:
{
  "executiveSummary": "2-3 párrafos claros y profesionales sobre el estado general del ecosistema digital, avances del período y aspectos más relevantes. Tono ejecutivo, sin tecnicismos innecesarios.",
  "highlights": ["4 a 6 logros o hechos destacados, frases cortas"],
  "conclusion": "1 párrafo de conclusión ejecutiva orientada a la toma de decisiones",
  "recommendations": [
    { "title": "acción concreta", "detail": "1-2 frases explicando el beneficio", "area": "una de: ${AREAS.join(', ')}", "priority": "alta|media|baja" }
  ]
}
Genera entre 4 y 6 recomendaciones accionables y priorizadas. No inventes cifras que no estén en los datos.`;
};

// Fallback determinístico (sin IA)
const deterministicNarrative = (ds) => {
    const s = ds.meta.site;
    const m = ds.maturity;
    const eco = ds.ecosystem;
    const kpi = Object.fromEntries(ds.headlineKpis.map((k) => [k.key, k.display]));

    const summary = `El sitio "${s.name}" (${s.categoryLabel}${s.districtName ? `, ${s.districtName}` : ''}) presenta un Índice de Madurez Digital de ${m.score}/100, ubicándose en el nivel "${m.level}". Durante el período analizado (${ds.meta.period.label}), el ecosistema alcanza un ${eco.digitalizationPct}% de digitalización con ${eco.activeCount} de ${eco.totalCount} módulos activos. La comunidad registra ${kpi.members} miembros y se han publicado ${kpi.content} contenidos. ` +
        `Las herramientas de inteligencia artificial ${Number(ds.headlineKpis.find((k) => k.key === 'ai')?.value) > 0 ? 'ya están en operación' : 'están disponibles para su activación'}, y la plataforma mantiene una base técnica sólida (SSL, respaldos gestionados y almacenamiento en la nube). En conjunto, el sitio muestra una gestión tecnológica ${m.score >= 60 ? 'consolidada' : 'en desarrollo'} con oportunidades claras de crecimiento.`;

    const highlights = ds.achievements.filter((a) => a.earned).slice(0, 6).map((a) => a.label);

    const recs = [];
    const modByKey = Object.fromEntries(eco.modules.map((mm) => [mm.key, mm.status]));
    if (modByKey.chatbot !== 'active') recs.push({ title: 'Activar el chatbot con IA', detail: 'Atender consultas 24/7 y capturar más leads automáticamente.', area: 'IA', priority: 'alta' });
    if (modByKey.email !== 'active') recs.push({ title: 'Lanzar campañas de correo', detail: 'Comunicar avances a la comunidad y fortalecer el vínculo institucional.', area: 'Comunicación', priority: 'alta' });
    if (modByKey.seo !== 'configured') recs.push({ title: 'Completar el SEO de los contenidos', detail: 'Mejorar el posicionamiento en buscadores y aumentar el tráfico orgánico.', area: 'SEO', priority: 'media' });
    if (modByKey.social !== 'active') recs.push({ title: 'Conectar redes sociales', detail: 'Publicar de forma programada y ampliar el alcance de las comunicaciones.', area: 'Comunicación', priority: 'media' });
    if (modByKey.automations !== 'active') recs.push({ title: 'Configurar automatizaciones', detail: 'Ahorrar horas de trabajo con flujos automáticos de correo y respuestas.', area: 'Automatización', priority: 'media' });
    if (modByKey.ecommerce !== 'active') recs.push({ title: 'Habilitar el e-commerce/donaciones', detail: 'Generar ingresos y facilitar aportes en línea de forma segura.', area: 'E-commerce', priority: 'baja' });
    while (recs.length < 4) recs.push({ title: 'Publicar contenidos con regularidad', detail: 'Mantener el sitio activo y relevante para la comunidad.', area: 'Contenidos', priority: 'media' });

    return {
        executiveSummary: summary,
        highlights: highlights.length ? highlights : ['Sitio activo en Club Platform', 'Base técnica segura y gestionada'],
        conclusion: `Se recomienda priorizar la activación de los módulos pendientes y sostener la actividad de comunicación y contenidos para avanzar hacia el nivel "${m.level === 'Transformación Digital' ? 'Transformación Digital' : ds.maturity.levelIndex < 4 ? 'siguiente' : 'máximo'}" de madurez digital.`,
        recommendations: recs.slice(0, 6),
        generatedBy: 'deterministic',
    };
};

export const generateNarrative = async (ds) => {
    try {
        const { content, provider } = await generateCopy({
            provider: 'openai',
            system: 'Eres un consultor senior de transformación digital. Redactas informes ejecutivos claros, profesionales y accionables en español. Devuelves siempre JSON válido.',
            userText: buildPrompt(ds),
            temperature: 0.5,
            maxTokens: 1800,
            jsonMode: true,
        });
        const parsed = JSON.parse(content);
        if (!parsed.executiveSummary) throw new Error('Respuesta IA sin executiveSummary');
        return {
            executiveSummary: String(parsed.executiveSummary),
            highlights: Array.isArray(parsed.highlights) ? parsed.highlights.map(String).slice(0, 6) : [],
            conclusion: String(parsed.conclusion || ''),
            recommendations: Array.isArray(parsed.recommendations)
                ? parsed.recommendations.slice(0, 6).map((r) => ({
                    title: String(r.title || ''), detail: String(r.detail || ''),
                    area: String(r.area || 'General'), priority: String(r.priority || 'media').toLowerCase(),
                }))
                : [],
            generatedBy: provider || 'ai',
        };
    } catch (e) {
        console.warn('[reportNarrative] IA no disponible, usando resumen determinístico:', e?.message);
        return deterministicNarrative(ds);
    }
};

export default { generateNarrative };
