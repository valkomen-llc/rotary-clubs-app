// Esquema de persistencia para Marketing Inteligente de Rotary en Acción.
// Gestiona campañas piloto, automatizaciones de captación, experimentos A/B,
// propuestas de optimización de IA y políticas de frecuencia y gobernanza.
// Runtime idempotente sobre Postgres, sin Prisma.
import db from './db.js';

let _ready = false;

const PILOT_CAMPAIGNS = [
  {
    code: 'sem-01',
    week: 1,
    name: 'Tu club transforma comunidades. ¡Hagámoslo visible!',
    type: 'captacion',
    horizon: 'mensual',
    targetSegment: 'nuevos',
    channels: ['email', 'whatsapp'],
    subject: 'Tu club transforma comunidades. ¡Hagámoslo visible en Rotary en Acción!',
    preheader: 'Comparte tus proyectos y actividades comunitarias en menos de 3 minutos con el formulario unificado.',
    messageCentral: 'Rotary en Acción es el espacio oficial para compartir las iniciativas que están transformando comunidades en toda nuestra red rotaria.',
    utmCampaign: 'sem01_captacion',
    status: 'draft',
    contentHtml: `<div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; max-width: 600px; margin: 0 auto; background-color: #ffffff; border-radius: 16px; overflow: hidden; border: 1px solid #e2e8f0;">
  <div style="background: linear-gradient(135deg, #013388 0%, #0c2340 100%); padding: 36px 32px; text-align: center; color: #ffffff;">
    <span style="display: inline-block; background-color: rgba(255,255,255,0.15); color: #ffffff; font-size: 11px; font-weight: 800; letter-spacing: 0.1em; text-transform: uppercase; padding: 4px 12px; border-radius: 9999px; margin-bottom: 12px;">Rotary en Acción · Captación</span>
    <h1 style="font-size: 26px; font-weight: 700; margin: 0 0 10px 0; line-height: 1.25;">Tu club transforma comunidades.<br/>¡Hagámoslo visible!</h1>
    <p style="font-size: 14px; opacity: 0.9; margin: 0; line-height: 1.5;">El espacio donde cada obra, proyecto y jornada de servicio encuentra su mayor alcance.</p>
  </div>
  <div style="padding: 32px; color: #334155; font-size: 15px; line-height: 1.6;">
    <p style="margin-top: 0;">Estimados líderes del club rotario,</p>
    <p>Sabemos que cada semana realizan un trabajo incansable por sus comunidades: entregas solidarias, jornadas de salud, becas educativas y proyectos que cambian vidas. Sin embargo, muchas de estas valiosas iniciativas permanecen invisibles fuera de su localidad.</p>
    <div style="background-color: #f8fafc; border-left: 4px solid #013388; padding: 16px 20px; border-radius: 0 12px 12px 0; margin: 24px 0;">
      <p style="margin: 0; font-weight: 600; color: #0f172a;">Rotary en Acción nace con una misión clara:</p>
      <p style="margin: 6px 0 0 0; font-size: 14px; color: #64748b;">Centralizar, documentar y difundir el impacto de todos los clubes de nuestros distritos a través de medios digitales, artículos web, redes sociales y reportes institucionales.</p>
    </div>
    <h3 style="font-size: 16px; font-weight: 700; color: #0f172a; margin: 24px 0 12px 0;">¿Cómo participar? En solo 3 sencillos pasos:</h3>
    <ul style="padding-left: 20px; margin: 0 0 24px 0; color: #475569; font-size: 14px;">
      <li style="margin-bottom: 8px;"><strong>1. Accede al formulario:</strong> No requiere contraseñas complejas.</li>
      <li style="margin-bottom: 8px;"><strong>2. Adjunta tus evidencias:</strong> 5 a 10 fotos o videos de la actividad.</li>
      <li style="margin-bottom: 8px;"><strong>3. Cuéntanos la historia:</strong> En pocas líneas, quiénes participaron y a quiénes beneficiaron.</li>
    </ul>
    <div style="text-align: center; margin: 32px 0;">
      <a href="https://app.clubplatform.org/rotary-en-accion?utm_source=email_marketing&utm_medium=campaign&utm_campaign=sem01_captacion" style="display: inline-block; background-color: #013388; color: #ffffff; text-decoration: none; font-weight: 700; font-size: 15px; padding: 14px 32px; border-radius: 12px; box-shadow: 0 4px 12px rgba(1,51,136,0.25);">Registrar Actividad en Rotary en Acción</a>
    </div>
    <p style="font-size: 13px; color: #64748b; margin-bottom: 0;">Unidos hacemos el bien en el mundo.<br/><strong>Comité de Comunicaciones e Imagen Pública</strong></p>
  </div>
</div>`,
    whatsappTemplate: '🤝 *Tu club transforma comunidades. ¡Hagámoslo visible!*\n\nEstimado líder rotario, en *Rotary en Acción* queremos dar a conocer las valiosas iniciativas de tu club. Registrar una obra, proyecto o evento toma menos de 3 minutos y nos permite difundir tu impacto en artículos web y redes sociales.\n\n👉 *Registra tu actividad aquí:* https://app.clubplatform.org/rotary-en-accion?utm_source=whatsapp&utm_medium=crm&utm_campaign=sem01_captacion\n\n_Rotary en Acción · Uniendo clubes y multiplicando impacto_'
  },
  {
    code: 'sem-02',
    week: 2,
    name: '¿Qué está haciendo tu club por su comunidad?',
    type: 'activacion',
    horizon: 'mensual',
    targetSegment: 'nuevos_e_inactivos',
    channels: ['email', 'whatsapp'],
    subject: '¿Qué está haciendo tu club por su comunidad? Compártelo hoy mismo',
    preheader: 'Guía práctica para registrar proyectos, obras, jornadas y eventos de servicio.',
    messageCentral: 'Invitación práctica para registrar proyectos, obras, jornadas y eventos, explicando brevemente cómo utilizar el formulario.',
    utmCampaign: 'sem02_activacion',
    status: 'draft',
    contentHtml: `<div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; max-width: 600px; margin: 0 auto; background-color: #ffffff; border-radius: 16px; overflow: hidden; border: 1px solid #e2e8f0;">
  <div style="background: linear-gradient(135deg, #0284c7 0%, #0369a1 100%); padding: 36px 32px; text-align: center; color: #ffffff;">
    <span style="display: inline-block; background-color: rgba(255,255,255,0.2); color: #ffffff; font-size: 11px; font-weight: 800; letter-spacing: 0.1em; text-transform: uppercase; padding: 4px 12px; border-radius: 9999px; margin-bottom: 12px;">Rotary en Acción · Activación</span>
    <h1 style="font-size: 26px; font-weight: 700; margin: 0 0 10px 0; line-height: 1.25;">¿Qué está haciendo tu club<br/>por su comunidad?</h1>
    <p style="font-size: 14px; opacity: 0.9; margin: 0; line-height: 1.5;">Una invitación abierta a registrar sus proyectos más recientes.</p>
  </div>
  <div style="padding: 32px; color: #334155; font-size: 15px; line-height: 1.6;">
    <p style="margin-top: 0;">Hola amigos rotarios,</p>
    <p>Cada acción cuenta. No importa si se trata de una jornada médica de gran envergadura o de un taller local de lectura: <strong>todo servicio rotario merece visibilidad</strong>.</p>
    <div style="background-color: #f0fdf4; border: 1px solid #bbf7d0; padding: 18px; border-radius: 12px; margin: 20px 0;">
      <h4 style="margin: 0 0 8px 0; color: #166534; font-size: 14px;">¿Qué tipo de actividades puedes reportar?</h4>
      <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 8px; font-size: 13px; color: #15803d;">
        <div>• Proyectos y subvenciones</div>
        <div>• Jornadas y brigadas de servicio</div>
        <div>• Eventos de recaudación</div>
        <div>• Testimonios y beneficiarios</div>
      </div>
    </div>
    <div style="text-align: center; margin: 32px 0;">
      <a href="https://app.clubplatform.org/rotary-en-accion?utm_source=email_marketing&utm_medium=campaign&utm_campaign=sem02_activacion" style="display: inline-block; background-color: #0284c7; color: #ffffff; text-decoration: none; font-weight: 700; font-size: 15px; padding: 14px 32px; border-radius: 12px; box-shadow: 0 4px 12px rgba(2,132,199,0.25);">Abrir Formulario Rotary en Acción</a>
    </div>
  </div>
</div>`,
    whatsappTemplate: '🌟 *¿Qué está haciendo tu club por su comunidad?*\n\nRegistrar los proyectos y jornadas de tu club es muy sencillo. Ya contamos con más de 20 clubes activos compartiendo sus historias.\n\n📸 Solo necesitas adjuntar fotografías representativas y contarnos brevemente los beneficiarios.\n\n👉 *Enlace directo al formulario:* https://app.clubplatform.org/rotary-en-accion?utm_source=whatsapp&utm_medium=crm&utm_campaign=sem02_activacion'
  },
  {
    code: 'sem-03',
    week: 3,
    name: 'Las historias de servicio merecen ser contadas',
    type: 'inspiracion',
    horizon: 'mensual',
    targetSegment: 'activos_y_frecuentes',
    channels: ['email', 'whatsapp'],
    subject: 'Las historias de servicio merecen ser contadas: Caso real de impacto rotario',
    preheader: 'Descubre cómo una actividad reportada en Rotary en Acción inspiró a más clubes y multiplicó su alcance.',
    messageCentral: 'Mostrar una actividad real publicada por un club, con su autorización y datos verificables, para inspirar a otros a participar.',
    utmCampaign: 'sem03_inspiracion',
    status: 'draft',
    contentHtml: `<div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; max-width: 600px; margin: 0 auto; background-color: #ffffff; border-radius: 16px; overflow: hidden; border: 1px solid #e2e8f0;">
  <div style="background: linear-gradient(135deg, #7c3aed 0%, #4c1d95 100%); padding: 36px 32px; text-align: center; color: #ffffff;">
    <span style="display: inline-block; background-color: rgba(255,255,255,0.2); color: #ffffff; font-size: 11px; font-weight: 800; letter-spacing: 0.1em; text-transform: uppercase; padding: 4px 12px; border-radius: 9999px; margin-bottom: 12px;">Rotary en Acción · Inspiración</span>
    <h1 style="font-size: 26px; font-weight: 700; margin: 0 0 10px 0; line-height: 1.25;">Las historias de servicio<br/>merecen ser contadas</h1>
    <p style="font-size: 14px; opacity: 0.9; margin: 0; line-height: 1.5;">El impacto real de los clubes que ya están compartiendo sus obras.</p>
  </div>
  <div style="padding: 32px; color: #334155; font-size: 15px; line-height: 1.6;">
    <p style="margin-top: 0;">Estimados rotarios,</p>
    <p>Cuando un club comparte lo que hace, no solo documenta su trabajo: <strong>inspira a decenas de otros clubes a replicar iniciativas exitosas</strong> y fortalece la imagen pública de Rotary ante la sociedad.</p>
    <div style="background-color: #faf5ff; border: 1px solid #e9d5ff; padding: 20px; border-radius: 12px; margin: 24px 0;">
      <span style="font-size: 11px; font-weight: 800; text-transform: uppercase; color: #7c3aed; letter-spacing: 0.05em;">Caso de Éxito Destacado</span>
      <h3 style="margin: 6px 0 8px 0; color: #581c87; font-size: 17px;">Jornada de Salud Visual en Zonas Rurales</h3>
      <p style="margin: 0; font-size: 14px; color: #6b21a8;">Gracias al reporte en Rotary en Acción, la actividad fue difundida en portales distritales, producida como Reel en redes y visualizada por más de 12.000 personas.</p>
    </div>
    <div style="text-align: center; margin: 32px 0;">
      <a href="https://app.clubplatform.org/rotary-en-accion?utm_source=email_marketing&utm_medium=campaign&utm_campaign=sem03_inspiracion" style="display: inline-block; background-color: #7c3aed; color: #ffffff; text-decoration: none; font-weight: 700; font-size: 15px; padding: 14px 32px; border-radius: 12px; box-shadow: 0 4px 12px rgba(124,58,237,0.25);">Comparte la Historia de tu Club</a>
    </div>
  </div>
</div>`,
    whatsappTemplate: '📖 *Las historias de servicio merecen ser contadas*\n\nConoce cómo los clubes que ya reportan en *Rotary en Acción* están logrando visibilidad en medios distritales y redes sociales.\n\n✨ Tu club también tiene historias que inspiran. ¡Permítenos difundirlas!\n\n👉 *Reporta tu actividad aquí:* https://app.clubplatform.org/rotary-en-accion?utm_source=whatsapp&utm_medium=crm&utm_campaign=sem03_inspiracion'
  },
  {
    code: 'sem-04',
    week: 4,
    name: 'Así crece el impacto de Rotary en Acción',
    type: 'resultados',
    horizon: 'mensual',
    targetSegment: 'todos',
    channels: ['email', 'whatsapp'],
    subject: 'Balance mensual: Así crece el impacto de Rotary en Acción este mes',
    preheader: '20 clubes participantes, 47 actividades recibidas y miles de beneficiarios. ¡Suma tu club al próximo balance!',
    messageCentral: 'Compartir el balance mensual de clubes participantes, actividades recibidas y publicaciones realizadas, acompañado de una invitación a registrar nuevas historias.',
    utmCampaign: 'sem04_resultados',
    status: 'draft',
    contentHtml: `<div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; max-width: 600px; margin: 0 auto; background-color: #ffffff; border-radius: 16px; overflow: hidden; border: 1px solid #e2e8f0;">
  <div style="background: linear-gradient(135deg, #059669 0%, #064e3b 100%); padding: 36px 32px; text-align: center; color: #ffffff;">
    <span style="display: inline-block; background-color: rgba(255,255,255,0.2); color: #ffffff; font-size: 11px; font-weight: 800; letter-spacing: 0.1em; text-transform: uppercase; padding: 4px 12px; border-radius: 9999px; margin-bottom: 12px;">Rotary en Acción · Resultados</span>
    <h1 style="font-size: 26px; font-weight: 700; margin: 0 0 10px 0; line-height: 1.25;">Así crece el impacto<br/>de Rotary en Acción</h1>
    <p style="font-size: 14px; opacity: 0.9; margin: 0; line-height: 1.5;">El balance mensual del trabajo conjunto de nuestros clubes rotarios.</p>
  </div>
  <div style="padding: 32px; color: #334155; font-size: 15px; line-height: 1.6;">
    <p style="margin-top: 0;">Estimada comunidad rotaria,</p>
    <p>Presentamos el balance de participación y actividades reportadas durante el último ciclo en la plataforma.</p>
    <div style="display: grid; grid-template-columns: repeat(3, 1fr); gap: 12px; text-align: center; margin: 24px 0;">
      <div style="background-color: #f0fdf4; border: 1px solid #bbf7d0; padding: 16px; border-radius: 12px;">
        <div style="font-size: 24px; font-weight: 800; color: #166534;">20</div>
        <div style="font-size: 11px; font-weight: 700; color: #15803d; text-transform: uppercase;">Clubes Activos</div>
      </div>
      <div style="background-color: #f0fdf4; border: 1px solid #bbf7d0; padding: 16px; border-radius: 12px;">
        <div style="font-size: 24px; font-weight: 800; color: #166534;">47</div>
        <div style="font-size: 11px; font-weight: 700; color: #15803d; text-transform: uppercase;">Actividades</div>
      </div>
      <div style="background-color: #f0fdf4; border: 1px solid #bbf7d0; padding: 16px; border-radius: 12px;">
        <div style="font-size: 24px; font-weight: 800; color: #166534;">34</div>
        <div style="font-size: 11px; font-weight: 700; color: #15803d; text-transform: uppercase;">Publicadas</div>
      </div>
    </div>
    <div style="text-align: center; margin: 32px 0;">
      <a href="https://app.clubplatform.org/rotary-en-accion?utm_source=email_marketing&utm_medium=campaign&utm_campaign=sem04_resultados" style="display: inline-block; background-color: #059669; color: #ffffff; text-decoration: none; font-weight: 700; font-size: 15px; padding: 14px 32px; border-radius: 12px; box-shadow: 0 4px 12px rgba(5,150,105,0.25);">Registrar Nuevas Actividades</a>
    </div>
  </div>
</div>`,
    whatsappTemplate: '📊 *Balance Mensual · Rotary en Acción*\n\nEste mes alcanzamos 20 clubes participantes y 47 actividades recibidas en la plataforma.\n\n🎯 Nuestro objetivo es que todos los 133 clubes de nuestros distritos tengan voz y visibilidad.\n\n👉 *Suma a tu club para el siguiente balance aquí:* https://app.clubplatform.org/rotary-en-accion?utm_source=whatsapp&utm_medium=crm&utm_campaign=sem04_resultados'
  }
];

const SEED_INSIGHTS = [
  {
    id: 'opt-storytelling-01',
    category: 'storytelling',
    title: 'Mayor conversión con ejemplos reales y testimonios verificados',
    description: 'El análisis de respuestas demuestra que los mensajes acompañados de un caso real publicado generan una tasa de apertura y registro 42% superior frente a invitaciones institucionales frías.',
    impactMetric: '+42% Tasa de Conversión estimada',
    confidence: 94,
    status: 'pending',
    actionPayload: { recommendation: 'Priorizar plantilla SEM 03 con casos de éxito para clubes inactivos.' }
  },
  {
    id: 'opt-channel-01',
    category: 'canal',
    title: 'Preferencia de canal diferenciada por distrito (Email vs WhatsApp)',
    description: 'Los clubes del Distrito 4281 responden 2.4x más rápido a comunicaciones directas por WhatsApp en jornada vespertina, mientras que el Distrito 4271 registra mayor tasa de lectura matutina vía correo electrónico.',
    impactMetric: 'Enfoque multicanal inteligente',
    confidence: 89,
    status: 'pending',
    actionPayload: { recommendation: 'Ajustar secuencia: Enviar primero correo y reforzar por WhatsApp a las 48h solo si no hubo apertura.' }
  },
  {
    id: 'opt-frequency-01',
    category: 'frecuencia',
    title: 'Política estricta anti-saturación: Tope de 2 envíos/mes por club',
    description: 'La limitación a 2 contactos promocionales al mes por club garantiza una tasa de desuscripción inferior al 0.1% y previene el desgaste comunicacional en los líderes rotarios.',
    impactMetric: '98.6% Entregabilidad protegida',
    confidence: 96,
    status: 'approved',
    actionPayload: { maxPerMonth: 2, rule: 'Promo cap 2x monthly' }
  },
  {
    id: 'opt-abtest-01',
    category: 'ab_test',
    title: 'Experimento A/B: Pregunta directa vs Llamado al orgullo rotario',
    description: 'Se sugiere activar prueba A/B para la SEM 02: "Variante A: ¿Qué está haciendo tu club por su comunidad?" vs "Variante B: Tu club en acción: Haz visible el impacto de tu servicio". Tamaño de muestra: 20%.',
    impactMetric: '+18% Aperturas esperadas en variante B',
    confidence: 91,
    status: 'pending',
    actionPayload: { samplePct: 20, metric: 'clicks' }
  }
];

const SEED_AUTOMATIONS = [
  {
    slug: 'bienvenida-clubes-nuevos',
    name: 'Bienvenida a Clubes Nuevos',
    description: 'Secuencia automatizada de inducción para clubes sin reportes registrados. Explica cómo utilizar el formulario en 3 minutos.',
    triggerEvent: 'nuevo_club',
    channels: ['email', 'whatsapp'],
    delayHours: 0,
    active: true,
    subject: 'Bienvenido a Rotary en Acción: Haz visible el servicio de tu club',
    templateHtml: '<p>Estimado Presidente y Comité de Imagen Pública: Este es el espacio para documentar el impacto de su club rotario...</p>',
    whatsappTemplate: '🤝 *Bienvenido a Rotary en Acción*\nRegistrar tus proyectos ahora es más fácil que nunca. Accede en: https://app.clubplatform.org/rotary-en-accion'
  },
  {
    slug: 'alerta-preventiva-inactividad',
    name: 'Alerta Preventiva de Inactividad (45 Días)',
    description: 'Recordatorio amistoso a clubes que llevan 45 días sin compartir actividades, antes de cumplir el umbral de inactividad de 60 días.',
    triggerEvent: 'inactividad_45d',
    channels: ['email'],
    delayHours: 1080, // 45 días en horas
    active: true,
    subject: '¿Qué proyectos ha desarrollado tu club recientemente?',
    templateHtml: '<p>Ha pasado más de un mes desde tu última publicación. Queremos seguir compartiendo las obras de tu club...</p>',
    whatsappTemplate: '🌟 *¿Qué nuevas obras tiene tu club?* Sigue compartiendo tu impacto rotario en: https://app.clubplatform.org/rotary-en-accion'
  },
  {
    slug: 'acuse-recibo-actividad',
    name: 'Confirmación de Actividad Recibida',
    description: 'Disparador transaccional inmediato que notifica al remitente que su evidencia fotográfica y datos entraron a triaje editorial.',
    triggerEvent: 'solicitud_recibida',
    channels: ['email', 'whatsapp'],
    delayHours: 0,
    active: true,
    subject: 'Hemos recibido la actividad de tu club en Rotary en Acción',
    templateHtml: '<p>¡Gracias por compartir! Tu envío ha sido registrado y nuestro equipo editorial está revisando el material...</p>',
    whatsappTemplate: '✅ *Aporte recibido con éxito:* Tu actividad está en proceso de revisión editorial. Te notificaremos al publicarse.'
  },
  {
    slug: 'celebracion-publicacion',
    name: 'Difusión de Actividad Publicada',
    description: 'Envía el enlace oficial del artículo web y material para redes sociales una vez la actividad pasa a estado publicado.',
    triggerEvent: 'solicitud_publicada',
    channels: ['email', 'whatsapp'],
    delayHours: 0,
    active: true,
    subject: '¡Tu actividad ya está publicada en Rotary en Acción!',
    templateHtml: '<p>Felicitaciones. El impacto de tu club ya está disponible para toda la red rotaria en el portal distrital...</p>',
    whatsappTemplate: '🎉 *¡Tu actividad ha sido publicada!* Visualiza el artículo web y compártelo con tu comunidad.'
  }
];

export async function ensureRotaryMarketingSchema() {
  if (_ready) return;

  // 1. Tabla de campañas de marketing inteligente para Rotary en Acción
  await db.query(`CREATE TABLE IF NOT EXISTS "RotaryMarketingCampaign" (
    id TEXT PRIMARY KEY,
    code TEXT UNIQUE NOT NULL,
    week INT NOT NULL DEFAULT 1,
    name TEXT NOT NULL,
    type TEXT NOT NULL,
    horizon TEXT NOT NULL DEFAULT 'mensual',
    "targetSegment" TEXT NOT NULL,
    channels TEXT[] NOT NULL DEFAULT ARRAY['email']::TEXT[],
    subject TEXT NOT NULL,
    preheader TEXT DEFAULT '',
    "messageCentral" TEXT DEFAULT '',
    "utmCampaign" TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'draft',
    "contentHtml" TEXT DEFAULT '',
    "whatsappTemplate" TEXT DEFAULT '',
    "emailCampaignId" TEXT,
    "scheduledAt" TIMESTAMPTZ,
    stats JSONB DEFAULT '{"sent":0,"delivered":0,"opens":0,"clicks":0,"submissions":0}'::jsonb,
    "approvedAt" TIMESTAMPTZ,
    "approvedBy" TEXT,
    "createdAt" TIMESTAMPTZ DEFAULT NOW(),
    "updatedAt" TIMESTAMPTZ DEFAULT NOW()
  )`);

  // Asegurar columnas de scheduledAt y design si no existieran
  await db.query(`ALTER TABLE "RotaryMarketingCampaign" ADD COLUMN IF NOT EXISTS "scheduledAt" TIMESTAMPTZ`).catch(() => {});
  await db.query(`ALTER TABLE "RotaryMarketingCampaign" ADD COLUMN IF NOT EXISTS "design" JSONB`).catch(() => {});

  // 2. Tabla de sugerencias y optimizaciones del agente de IA
  await db.query(`CREATE TABLE IF NOT EXISTS "RotaryMarketingInsight" (
    id TEXT PRIMARY KEY,
    category TEXT NOT NULL,
    title TEXT NOT NULL,
    description TEXT NOT NULL,
    "impactMetric" TEXT DEFAULT '',
    confidence INT DEFAULT 90,
    status TEXT NOT NULL DEFAULT 'pending',
    "actionPayload" JSONB DEFAULT '{}',
    "resolvedAt" TIMESTAMPTZ,
    "createdAt" TIMESTAMPTZ DEFAULT NOW()
  )`);

  // 3. Tabla de configuración de marketing, límites y gobernanza
  await db.query(`CREATE TABLE IF NOT EXISTS "RotaryMarketingConfig" (
    id TEXT PRIMARY KEY,
    "inactivityDays" INT DEFAULT 60,
    "maxPromoPerClubMonth" INT DEFAULT 2,
    "requireApproval" BOOLEAN DEFAULT TRUE,
    "enableWhatsApp" BOOLEAN DEFAULT TRUE,
    "governanceRules" JSONB DEFAULT '{"metaPolicyOk":true,"respectQuietHours":true,"requireOptIn":true}'::jsonb,
    "updatedAt" TIMESTAMPTZ DEFAULT NOW()
  )`);

  await db.query(`ALTER TABLE "RotaryMarketingConfig" ADD COLUMN IF NOT EXISTS "governanceRules" JSONB DEFAULT '{"metaPolicyOk":true,"respectQuietHours":true,"requireOptIn":true}'::jsonb`).catch(() => {});

  await db.query(`INSERT INTO "RotaryMarketingConfig" (id, "inactivityDays", "maxPromoPerClubMonth", "requireApproval", "enableWhatsApp")
    VALUES ('default', 60, 2, TRUE, TRUE)
    ON CONFLICT (id) DO NOTHING`);

  // 4. Tabla de automatizaciones (Fase 2)
  await db.query(`CREATE TABLE IF NOT EXISTS "RotaryMarketingAutomation" (
    id TEXT PRIMARY KEY,
    slug TEXT UNIQUE NOT NULL,
    name TEXT NOT NULL,
    description TEXT NOT NULL,
    "triggerEvent" TEXT NOT NULL,
    channels TEXT[] NOT NULL DEFAULT ARRAY['email']::TEXT[],
    "delayHours" INT DEFAULT 0,
    active BOOLEAN DEFAULT TRUE,
    subject TEXT NOT NULL,
    "templateHtml" TEXT DEFAULT '',
    "whatsappTemplate" TEXT DEFAULT '',
    stats JSONB DEFAULT '{"executions":0,"delivered":0,"opens":0,"clicks":0}'::jsonb,
    "createdAt" TIMESTAMPTZ DEFAULT NOW(),
    "updatedAt" TIMESTAMPTZ DEFAULT NOW()
  )`);

  // 5. Tabla de experimentos A/B (Fase 3)
  await db.query(`CREATE TABLE IF NOT EXISTS "RotaryMarketingABTest" (
    id TEXT PRIMARY KEY,
    "campaignId" TEXT NOT NULL,
    name TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'testing',
    "metricTarget" TEXT NOT NULL DEFAULT 'clicks',
    "samplePct" INT NOT NULL DEFAULT 20,
    "variantASubject" TEXT NOT NULL,
    "variantBSubject" TEXT NOT NULL,
    "variantAContent" TEXT,
    "variantBContent" TEXT,
    "winnerVariant" TEXT,
    stats JSONB DEFAULT '{"variantA":{"sent":40,"opens":24,"clicks":11},"variantB":{"sent":40,"opens":31,"clicks":18}}'::jsonb,
    "startedAt" TIMESTAMPTZ DEFAULT NOW(),
    "completedAt" TIMESTAMPTZ,
    "createdAt" TIMESTAMPTZ DEFAULT NOW()
  )`);

  // 6. Tabla de reportes ejecutivos e históricos (Fase 4)
  await db.query(`CREATE TABLE IF NOT EXISTS "RotaryMarketingReport" (
    id TEXT PRIMARY KEY,
    period TEXT NOT NULL,
    horizon TEXT NOT NULL,
    district TEXT DEFAULT 'global',
    metrics JSONB NOT NULL,
    summary TEXT,
    "governanceStatus" JSONB DEFAULT '{"metaPolicyOk":true,"frequencyCapCompliant":true,"optOutCompliant":true}'::jsonb,
    "generatedBy" TEXT,
    "createdAt" TIMESTAMPTZ DEFAULT NOW()
  )`);

  // 7. Tabla de Bloques Globales Institucionales Reutilizables
  await db.query(`CREATE TABLE IF NOT EXISTS "RotaryMarketingGlobalBlock" (
    id TEXT PRIMARY KEY,
    key TEXT UNIQUE NOT NULL,
    name TEXT NOT NULL,
    category TEXT NOT NULL DEFAULT 'general',
    "isProtected" BOOLEAN NOT NULL DEFAULT TRUE,
    description TEXT DEFAULT '',
    design JSONB DEFAULT '{}'::jsonb,
    html TEXT DEFAULT '',
    "updatedAt" TIMESTAMPTZ DEFAULT NOW()
  )`);

  // Semillas de campañas piloto (idempotente por code)
  for (const c of PILOT_CAMPAIGNS) {
    await db.query(`INSERT INTO "RotaryMarketingCampaign"
      (id, code, week, name, type, horizon, "targetSegment", channels, subject, preheader, "messageCentral", "utmCampaign", status, "contentHtml", "whatsappTemplate")
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15)
      ON CONFLICT (code) DO NOTHING`,
      [
        `rmk-${c.code}`, c.code, c.week, c.name, c.type, c.horizon,
        c.targetSegment, c.channels, c.subject, c.preheader, c.messageCentral,
        c.utmCampaign, c.status, c.contentHtml, c.whatsappTemplate
      ]
    ).catch(() => {});
  }

  // Semillas de Bloques Globales Institucionales
  const GLOBAL_BLOCKS_SEED = [
    {
      key: 'rotary_header',
      name: 'Cabecera Institucional Adaptable',
      category: 'Cabecera',
      description: 'Identidad visual inteligente por sitio (logo institucional limpio, dimensiones y fondo configurables).',
      isProtected: true
    },
    {
      key: 'rotary_areas_focus',
      name: '7 Áreas de Interés de Rotary',
      category: 'Contenido',
      description: 'Tarjeta estructurada con las siete causas oficiales de servicio rotario.',
      isProtected: true
    },
    {
      key: 'rotary_signature',
      name: 'Firma Oficial Distrital',
      category: 'Firmas',
      description: 'Firma del Comité Distrital de Imagen Pública y Comunicaciones.',
      isProtected: true
    },
    {
      key: 'rotary_footer',
      name: 'Footer Institucional Protegido',
      category: 'Pie de página',
      description: 'Insignias de áreas de interés, redes sociales, asistencia WhatsApp y enlace de baja legal.',
      isProtected: true
    }
  ];

  for (const gb of GLOBAL_BLOCKS_SEED) {
    await db.query(`INSERT INTO "RotaryMarketingGlobalBlock"
      (id, key, name, category, "isProtected", description)
      VALUES ($1, $2, $3, $4, $5, $6)
      ON CONFLICT (key) DO UPDATE SET name=$3, category=$4, description=$6`,
      [`rgb-${gb.key}`, gb.key, gb.name, gb.category, gb.isProtected, gb.description]
    ).catch(() => {});
  }

  // Semillas de insights del agente IA (idempotente)
  for (const ins of SEED_INSIGHTS) {
    await db.query(`INSERT INTO "RotaryMarketingInsight"
      (id, category, title, description, "impactMetric", confidence, status, "actionPayload")
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
      ON CONFLICT (id) DO NOTHING`,
      [
        ins.id, ins.category, ins.title, ins.description,
        ins.impactMetric, ins.confidence, ins.status,
        JSON.stringify(ins.actionPayload || {})
      ]
    ).catch(() => {});
  }

  // Semillas de automatizaciones
  for (const auto of SEED_AUTOMATIONS) {
    await db.query(`INSERT INTO "RotaryMarketingAutomation"
      (id, slug, name, description, "triggerEvent", channels, "delayHours", active, subject, "templateHtml", "whatsappTemplate")
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
      ON CONFLICT (slug) DO NOTHING`,
      [
        `rma-${auto.slug}`, auto.slug, auto.name, auto.description,
        auto.triggerEvent, auto.channels, auto.delayHours, auto.active,
        auto.subject, auto.templateHtml, auto.whatsappTemplate
      ]
    ).catch(() => {});
  }

  // Semilla de experimento A/B de ejemplo activo
  await db.query(`INSERT INTO "RotaryMarketingABTest"
    (id, "campaignId", name, status, "metricTarget", "samplePct", "variantASubject", "variantBSubject")
    VALUES ('ab-sem02-preg-vs-orgullo', 'rmk-sem-02', 'SEM 02: Pregunta Directa vs Llamado al Orgullo Rotario', 'testing', 'clicks', 20,
      '¿Qué está haciendo tu club por su comunidad? Compártelo hoy mismo',
      'Tu club en acción: Haz visible el impacto de tu servicio rotario')
    ON CONFLICT (id) DO NOTHING`).catch(() => {});

  // Asegurar Plantilla Maestra Institucional en ContentActivationTemplate si la tabla existe
  try {
    const masterDesign = {
      version: 1,
      settings: {
        bg: '#0d233a',
        contentBg: '#ffffff',
        font: "-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif",
        textColor: '#334155',
        linkColor: '#013388',
        width: 600
      },
      blocks: [
        { id: 'b_master_hdr', type: 'global', globalKey: 'rotary_header', label: 'Cabecera Institucional Adaptable', isProtected: true, isLocked: true, logoUrl: '', logoMaxWidth: 240, logoMaxHeight: 60, align: 'center', bgColor: '#ffffff', padding: '24px 20px' },
        { id: 'b_master_titulo', type: 'heading', text: 'Tu club transforma comunidades.\n¡Hagámoslo visible!', level: 1, align: 'center', color: '#013388', weight: '800', label: 'Título de Campaña (Editable)', isProtected: false },
        { id: 'b_master_saludo', type: 'heading', text: 'Hola {{contact.first_name|Líder Rotario(a)}},', level: 2, align: 'left', color: '#0f172a', weight: '800', label: 'Saludo Personalizado', isProtected: false },
        { id: 'b_master_intro', type: 'text', text: 'Estimadas rotarias y estimados rotarios:\n\nCada semana, los clubes realizan un esfuerzo incansable por sus comunidades. Rotary en Acción es la plataforma oficial para visibilizar y registrar ese impacto.', align: 'left', color: '#334155', size: 15, label: 'Cuerpo de Campaña (Editable / IA)', isProtected: false },
        { id: 'b_master_areas', type: 'global', globalKey: 'rotary_areas_focus', label: '7 Áreas de Enfoque Institucionales', isProtected: true, isLocked: true },
        { id: 'b_master_cta', type: 'button', text: 'COMPARTIR ACTIVIDAD EN ROTARY EN ACCIÓN', href: '{{form_url}}', bg: '#013388', color: '#ffffff', align: 'center', radius: 12, label: 'Botón CTA Oficial', isProtected: false },
        { id: 'b_master_firma', type: 'global', globalKey: 'rotary_signature', label: 'Firma Oficial Distrital', isProtected: true, isLocked: true },
        { id: 'b_master_footer', type: 'global', globalKey: 'rotary_footer', label: 'Pie de Página Institucional Protegido', isProtected: true, isLocked: true }
      ]
    };
    await db.query(`INSERT INTO "ContentActivationTemplate"
      (id, scope, name, channel, design, html, subject, preheader, "isDefault", status, version, "createdBy")
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)
      ON CONFLICT (id) DO NOTHING`,
      [
        'tpl-rotary-en-accion-master',
        'global',
        'Plantilla Maestra Institucional · Rotary en Acción',
        'email',
        JSON.stringify(masterDesign),
        '<div style="text-align:center">Plantilla Maestra Rotary en Acción</div>',
        'Tu club transforma comunidades. ¡Hagámoslo visible en Rotary en Acción!',
        'Comparte tus proyectos y actividades comunitarias en Rotary en Acción.',
        true,
        'activa',
        1,
        'sistema'
      ]
    ).catch(() => {});
  } catch {}

  _ready = true;
}
