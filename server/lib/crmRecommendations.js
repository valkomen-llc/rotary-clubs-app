// Recomendaciones del WhatsApp CRM.
//
// DOS CAPAS, y la primera es la que importa:
//
//   1. REGLAS sobre datos medidos (`deriveFindings`). Deterministas, explicables
//      y sin costo. Cada hallazgo trae el número que lo justifica.
//   2. REDACCIÓN con el modelo (opcional). Toma los hallazgos YA CALCULADOS y los
//      ordena y explica en prosa.
//
// EL MODELO NO MIRA LOS DATOS Y NO INVENTA HALLAZGOS. Si se le diera la base
// entera y se le pidiera «decime qué mejorar», produciría afirmaciones
// plausibles y no verificables —«tu tasa de respuesta bajó un 12 %»— que nadie
// puede auditar y que en un módulo que decide a quién escribirle son
// directamente peligrosas. Acá el número lo calcula SQL y el modelo sólo lo
// cuenta mejor. Sin credencial de modelo, las recomendaciones se muestran igual
// con su texto de regla.
//
// NINGUNA SE APLICA SOLA. Son sugerencias con un enlace a la pantalla donde se
// resuelven; cambiar un recorrido o pausar una plantilla es una decisión del
// operador.
import { routeToModel } from './ai-router.js';
import {
  messagingMetrics, templatePerformance, performanceByLifecycle,
  conversionsByJourney, inboxMetrics,
} from './crmAnalytics.js';

// Cuánta muestra hace falta antes de opinar. Debajo de esto no se dice nada:
// una recomendación basada en ocho envíos hace perder más tiempo del que ahorra.
const MIN_SAMPLE = 20;

/**
 * Hallazgos deterministas. Cada uno declara su evidencia.
 * `severity`: info | warning | critical.
 */
export async function deriveFindings(clubId, { days = 30 } = {}) {
  const [msg, templates, segments, journeys, inbox] = await Promise.all([
    messagingMetrics(clubId, { days }),
    templatePerformance(clubId, { days: days * 3 }),
    performanceByLifecycle(clubId, { days: days * 3 }),
    conversionsByJourney(clubId, { days: days * 3 }),
    inboxMetrics(clubId, { days }),
  ]);

  const findings = [];

  // ── Entrega ──────────────────────────────────────────────────────────────
  if (msg.sent >= MIN_SAMPLE && msg.failureRate !== null && msg.failureRate >= 10) {
    findings.push({
      key: 'failure_rate', severity: msg.failureRate >= 25 ? 'critical' : 'warning',
      title: `${msg.failureRate} % de los envíos está fallando`,
      evidence: `${msg.failed} de ${msg.sent} en ${days} días.`,
      suggestion: 'Revisá el estado del token, los números inválidos del directorio y si alguna plantilla quedó rechazada.',
      link: 'wa-config',
    });
  }

  if (msg.delivered >= MIN_SAMPLE && msg.readRate !== null && msg.readRate < 40) {
    findings.push({
      key: 'low_read', severity: 'warning',
      title: `Sólo el ${msg.readRate} % de lo entregado se lee`,
      evidence: `${msg.read} lecturas sobre ${msg.delivered} entregados.`,
      suggestion: 'Suele ser volumen o momento: probá bajar el tope de frecuencia o correr la ventana de envío.',
      link: 'wa-lifecycle',
    });
  }

  // ── Plantillas ───────────────────────────────────────────────────────────
  const measurable = templates.filter(t => t.enoughSample);
  if (measurable.length >= 2) {
    const sorted = [...measurable].sort((a, b) => (b.readRate || 0) - (a.readRate || 0));
    const best = sorted[0], worst = sorted[sorted.length - 1];
    if ((best.readRate || 0) - (worst.readRate || 0) >= 25) {
      findings.push({
        key: 'template_gap', severity: 'info',
        title: `"${worst.templateName}" se lee mucho menos que "${best.templateName}"`,
        evidence: `${worst.readRate} % frente a ${best.readRate} %, con ${worst.sent} y ${best.sent} envíos.`,
        suggestion: `Vale la pena una prueba A/B: reescribí "${worst.templateName}" tomando el tono de la que funciona.`,
        link: 'wa-journeys',
      });
    }
  }
  for (const t of measurable) {
    if (t.failureRate !== null && t.failureRate >= 20) {
      findings.push({
        key: `template_failing:${t.templateName}`, severity: 'warning',
        title: `La plantilla "${t.templateName}" falla el ${t.failureRate} % de las veces`,
        evidence: `${t.failed} de ${t.sent} envíos.`,
        suggestion: 'Comprobá que siga aprobada en Meta y que sus variables se resuelvan siempre.',
        link: 'wa-templates',
      });
    }
  }

  // ── Recorridos ───────────────────────────────────────────────────────────
  for (const j of journeys) {
    if (j.sites < 10) continue; // muestra insuficiente para hablar de conversión
    if (!j.conversions.length) {
      findings.push({
        key: `journey_no_conv:${j.journeyId}`, severity: 'warning',
        title: `"${j.name}" no tiene ninguna conversión atribuida`,
        evidence: `Alcanzó ${j.sites} sitios y ninguno hizo después lo que el recorrido busca.`,
        suggestion: 'Revisá si el disparador llega en el momento correcto y si los mensajes piden una acción concreta.',
        link: 'wa-journeys',
      });
    }
  }

  // ── Segmentos ────────────────────────────────────────────────────────────
  const weak = segments
    .filter(s => s.sent >= MIN_SAMPLE && s.readRate !== null)
    .sort((a, b) => a.readRate - b.readRate)[0];
  if (weak && weak.readRate < 30) {
    findings.push({
      key: `segment_weak:${weak.state}`, severity: 'info',
      title: `El segmento "${weak.label}" casi no lee los mensajes`,
      evidence: `${weak.readRate} % de lectura sobre ${weak.sent} envíos a ${weak.sites} sitios.`,
      suggestion: 'Es el grupo donde más se gana cambiando el mensaje, o dejando de escribirle tan seguido.',
      link: 'wa-lifecycle',
    });
  }

  // ── Bandeja ──────────────────────────────────────────────────────────────
  if (inbox.medianAssignMin !== null && inbox.medianAssignMin > 240) {
    findings.push({
      key: 'slow_assign', severity: 'warning',
      title: `Una conversación tarda ${Math.round(inbox.medianAssignMin / 60)} h en encontrar dueño`,
      evidence: 'Mediana del tiempo entre que entra y que alguien la toma.',
      suggestion: 'Agregá reglas de enrutamiento o marcá más agentes como disponibles.',
      link: 'wa-inbox',
    });
  }
  const unclassified = inbox.byIntent.find(i => i.intent === 'sin_clasificar');
  const totalConv = inbox.byIntent.reduce((a, i) => a + i.n, 0);
  if (unclassified && totalConv >= MIN_SAMPLE && unclassified.n / totalConv > 0.4) {
    findings.push({
      key: 'unclassified', severity: 'info',
      title: `El ${Math.round((unclassified.n / totalConv) * 100)} % de las conversaciones no se clasifica`,
      evidence: `${unclassified.n} de ${totalConv}.`,
      suggestion: 'Agregá palabras clave a las intenciones que más aparecen, o encendé el menú del chatbot.',
      link: 'wa-inbox',
    });
  }

  const order = { critical: 0, warning: 1, info: 2 };
  findings.sort((a, b) => order[a.severity] - order[b.severity]);
  return { findings, metrics: { msg, inbox }, sampleFloor: MIN_SAMPLE };
}

/**
 * Redacta un resumen a partir de los hallazgos YA calculados.
 *
 * Si el modelo falla o no hay credencial, se devuelve null y la UI muestra los
 * hallazgos con su texto de regla. Que no haya resumen no puede impedir ver las
 * recomendaciones.
 */
export async function narrateFindings(findings, { modelSlug = 'gemini-2.5-flash', timeoutMs = 15000 } = {}) {
  if (!findings?.length) return null;

  const systemPrompt = `Sos el analista del equipo de Customer Success de una plataforma para clubes Rotarios.
Te paso hallazgos YA MEDIDOS sobre las comunicaciones por WhatsApp. Escribí un resumen breve en español rioplatense neutro.

Reglas:
- Usá SÓLO los números que te doy. No inventes ni estimes ninguno.
- Máximo tres párrafos cortos.
- Empezá por lo más urgente y decí qué hacer primero.
- Nada de listas con viñetas ni encabezados. Prosa.`;

  const userPrompt = findings.map(f =>
    `[${f.severity}] ${f.title}. Evidencia: ${f.evidence} Sugerencia: ${f.suggestion}`
  ).join('\n');

  try {
    const raw = await Promise.race([
      routeToModel(modelSlug, systemPrompt, userPrompt),
      new Promise((_, rej) => setTimeout(() => rej(new Error('timeout')), timeoutMs)),
    ]);
    const text = String(raw || '').trim();
    return text || null;
  } catch {
    return null;
  }
}

export async function recommendations(clubId, { days = 30, narrate = true } = {}) {
  const { findings, metrics, sampleFloor } = await deriveFindings(clubId, { days });
  const summary = narrate ? await narrateFindings(findings) : null;
  return {
    findings,
    summary,
    // Se declara de dónde salió cada cosa: el número es SQL, la prosa es modelo.
    summarySource: summary ? 'modelo' : null,
    sampleFloor,
    metrics,
    note: 'Los hallazgos se calculan sobre datos medidos. El resumen sólo los redacta; no agrega números.',
  };
}

export default { deriveFindings, narrateFindings, recommendations };
