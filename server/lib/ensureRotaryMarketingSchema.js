// Esquema de persistencia para Marketing Inteligente de Rotary en Acción.
// Gestiona campañas piloto, automatizaciones de captación, experimentos A/B,
// propuestas de optimización de IA y políticas de frecuencia y gobernanza.
// Runtime idempotente sobre Postgres, sin Prisma.
import db from './db.js';
import {
  createRotaryMasterDesign,
  createDirectorioMasterDesign,
  createFeriaMasterDesign,
  renderDesignToHtml,
  normalizeInstitutionalDesign
} from './emailBlocks.js';

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
    initiative: 'rotary_en_accion',
    whatsappTemplate: '🤝 *Tu club transforma comunidades. ¡Hagámoslo visible!*\n\nEstimado líder rotario, en *Rotary en Acción* queremos dar a conocer las valiosas iniciativas de tu club. Registrar una obra, proyecto o evento toma menos de 3 minutos y nos permite difundir tu impacto en artículos web y redes sociales.\n\n👉 *Registra tu actividad aquí:* https://rotary4281.org/rotary-en-accion?utm_source=whatsapp&utm_medium=crm&utm_campaign=sem01_captacion\n\n_Rotary en Acción · Uniendo clubes y multiplicando impacto_'
  },
  {
    code: 'sem-02',
    week: 2,
    name: 'Cada proyecto cuenta una historia de servicio.',
    type: 'activacion',
    horizon: 'mensual',
    targetSegment: 'nuevos_e_inactivos',
    channels: ['email', 'whatsapp'],
    subject: '¿Qué está haciendo tu club por su comunidad? Compártelo hoy mismo',
    preheader: 'Guía práctica para registrar proyectos, obras, jornadas y eventos de servicio.',
    messageCentral: 'Cada acción cuenta: no importa si se trata de una jornada médica de gran envergadura o de un taller local de lectura, todo servicio rotario merece visibilidad en la plataforma oficial.',
    utmCampaign: 'sem02_activacion',
    status: 'draft',
    initiative: 'rotary_en_accion',
    whatsappTemplate: '🌟 *¿Qué está haciendo tu club por su comunidad?*\n\nRegistrar los proyectos y jornadas de tu club es muy sencillo. Ya contamos con decenas de clubes activos compartiendo sus historias.\n\n📸 Solo necesitas adjuntar fotografías representativas y contarnos brevemente los beneficiarios.\n\n👉 *Enlace directo al formulario:* https://rotary4281.org/rotary-en-accion?utm_source=whatsapp&utm_medium=crm&utm_campaign=sem02_activacion'
  },
  {
    code: 'sem-03',
    week: 3,
    name: 'Comparte las actividades y logros de tu club.',
    type: 'inspiracion',
    horizon: 'mensual',
    targetSegment: 'activos_y_frecuentes',
    channels: ['email', 'whatsapp'],
    subject: 'Las historias de servicio merecen ser contadas: Caso real de impacto rotario',
    preheader: 'Descubre cómo una actividad reportada en Rotary en Acción inspiró a más clubes y multiplicó su alcance.',
    messageCentral: 'Cuando un club comparte lo que hace, no solo documenta su trabajo: inspira a decenas de otros clubes a replicar iniciativas exitosas y fortalece la imagen pública de Rotary ante la sociedad.',
    utmCampaign: 'sem03_inspiracion',
    status: 'draft',
    initiative: 'rotary_en_accion',
    whatsappTemplate: '📖 *Las historias de servicio merecen ser contadas*\n\nConoce cómo los clubes que ya reportan en *Rotary en Acción* están logrando visibilidad en medios distritales y redes sociales.\n\n✨ Tu club también tiene historias que inspiran. ¡Permítenos difundirlas!\n\n👉 *Reporta tu actividad aquí:* https://rotary4281.org/rotary-en-accion?utm_source=whatsapp&utm_medium=crm&utm_campaign=sem03_inspiracion'
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
    preheader: 'Clubes participantes, actividades recibidas y miles de beneficiarios. ¡Suma tu club al próximo balance!',
    messageCentral: 'Presentamos el balance de participación y actividades reportadas durante el último ciclo en la plataforma, visibilizando el trabajo conjunto de nuestros clubes rotarios con total transparencia.',
    utmCampaign: 'sem04_resultados',
    status: 'draft',
    initiative: 'rotary_en_accion',
    whatsappTemplate: '📊 *Así crece el impacto de Rotary en Acción*\n\nConoce el balance mensual de proyectos y actividades reportadas por nuestros clubes rotarios en toda la red distrital.\n\n👉 *Suma tu actividad al balance:* https://rotary4281.org/rotary-en-accion?utm_source=whatsapp&utm_medium=crm&utm_campaign=sem04_resultados'
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

const DIRECTORIO_CAMPAIGNS = [
  {
    code: 'dir-sem-01',
    week: 1,
    name: 'Tu club merece estar presente. ¡Actualiza su perfil institucional!',
    type: 'activacion_directorio',
    horizon: 'mensual',
    targetSegment: 'sin_iniciar',
    channels: ['email', 'whatsapp'],
    subject: 'Tu club merece estar presente. ¡Actualiza su perfil institucional en el Directorio del Distrito 4281!',
    preheader: 'Cada club Rotary, Rotaract e Interact tiene una historia, una identidad y un impacto que merece ser visible.',
    messageCentral: 'El Directorio de Clubes del Distrito 4281 es el espacio oficial para mostrar quiénes somos, dónde estamos y cómo contribuimos a nuestras comunidades.',
    utmCampaign: 'dir_sem01_activacion',
    status: 'draft',
    initiative: 'directorio_clubes',
    whatsappTemplate: '🏛️ *¡Tu club merece estar presente en el Directorio del Distrito 4281!*\n\nEstimado(a) {{contact.first_name|Líder Rotario(a)}}:\n\nCada club Rotary, Rotaract e Interact tiene una historia, una identidad y un impacto que merece ser visible. Te invitamos a actualizar la ficha oficial de *{{club.name|tu club}}* en menos de 5 minutos.\n\n📌 *Actualiza tu perfil aquí:* {{club.update_form_url|https://app.clubplatform.org/clubes/registro}}\n\n_Rotary Distrito 4281 · Unidos para servir y visibilizar nuestro impacto_'
  },
  {
    code: 'dir-sem-02',
    week: 2,
    name: 'Una identidad digital que conecta y fortalece tu club.',
    type: 'identidad_directorio',
    horizon: 'mensual',
    targetSegment: 'en_proceso',
    channels: ['email', 'whatsapp'],
    subject: 'Haz que tu club sea reconocido en todo el Distrito 4281: Completa tu información institucional',
    preheader: 'Logotipo, fotos representativas, datos de contacto y descripción: consolida la identidad de tu club.',
    messageCentral: 'Motivar la actualización de la información institucional y los recursos multimedia del club para multiplicar el alcance y credibilidad en el distrito.',
    utmCampaign: 'dir_sem02_identidad',
    status: 'draft',
    initiative: 'directorio_clubes',
    whatsappTemplate: '🌟 *Haz que tu club sea reconocido en todo el Distrito 4281*\n\nHola {{contact.first_name|amigos rotarios}} de *{{club.name|tu club}}*.\n\nPara que la comunidad y líderes conozcan su labor, es fundamental contar con información completa: logotipo oficial, fotos representativas, datos de contacto, junta directiva y descripción institucional.\n\n📸 *Completa tus datos multimedia aquí:* {{club.update_form_url|https://app.clubplatform.org/clubes/registro}}\n\n_Comité Distrital de Imagen Pública y Directorio Institucional · D4281_'
  },
  {
    code: 'dir-sem-03',
    week: 3,
    name: 'Haz visible el liderazgo, los proyectos y la historia de tu club.',
    type: 'seguimiento_directorio',
    horizon: 'mensual',
    targetSegment: 'en_proceso',
    channels: ['email', 'whatsapp'],
    subject: 'Tu club ya tiene un espacio en el Directorio. Ayúdanos a completarlo',
    preheader: 'Sabemos el compromiso de su equipo. Acompañamos a su club a culminar su ficha institucional.',
    messageCentral: 'Acompañar a los clubes que comenzaron su actualización pero todavía no finalizaron para que alcancen el 100% verificado.',
    utmCampaign: 'dir_sem03_seguimiento',
    status: 'draft',
    initiative: 'directorio_clubes',
    whatsappTemplate: '🤝 *Tu club ya tiene un espacio en el Directorio. Ayúdanos a completarlo*\n\nEstimado(a) {{contact.first_name|Líder}}:\n\nNotamos que iniciaron la actualización de *{{club.name|su club}}* (avance actual: {{club.completion_percentage|35%}}). Queremos acompañarlos a culminar los pasos pendientes para que su perfil quede 100% verificado y publicado.\n\n👉 *Continúa tu actualización aquí:* {{club.update_form_url|https://app.clubplatform.org/clubes/registro}}\n\n_Si requieres asistencia técnica, responde directamente a este mensaje._'
  },
  {
    code: 'dir-sem-04',
    week: 4,
    name: 'Un directorio más completo, un distrito más conectado',
    type: 'cierre_directorio',
    horizon: 'mensual',
    targetSegment: 'cierre_y_reconocimiento',
    channels: ['email', 'whatsapp'],
    subject: 'Un directorio más completo, un distrito más conectado: Cierre de ciclo y reconocimiento',
    preheader: 'Cada perfil actualizado fortalece la identidad colectiva del Distrito 4281 y su visibilidad.',
    messageCentral: 'Impulsar la finalización del proceso y reconocer públicamente a los clubes que completaron y validaron su ficha institucional.',
    utmCampaign: 'dir_sem04_cierre',
    status: 'draft',
    initiative: 'directorio_clubes',
    whatsappTemplate: '🏆 *Un directorio más completo, un distrito más conectado*\n\nEstimados líderes de *{{club.name|su club}}*:\n\nCada perfil institucional verificado fortalece la gobernanza y presencia colectiva del Distrito 4281. Gracias por su compromiso con la excelencia rotaria.\n\n🔍 *Revisa el perfil institucional de tu club aquí:* {{club.profile_url|https://app.clubplatform.org/clubes/directorio}}\n\n_Distrito 4281 de Rotary International · Unidos hacemos el bien en el mundo_'
  },
  {
    code: 'dir-ciclo-mantenimiento',
    week: 5,
    name: 'Ciclo Permanente: Mantén vigente la información y gobernanza de tu club',
    type: 'mantenimiento_directorio',
    horizon: 'permanente',
    targetSegment: 'todos',
    channels: ['email', 'whatsapp'],
    subject: 'Mantenimiento institucional: Verifica los datos y junta directiva de tu club en el Distrito 4281',
    preheader: 'Garantiza que el cambio de junta directiva y nuevos datos de contacto queden registrados oficialmente.',
    messageCentral: 'Ciclo permanente para que el Directorio no dependa de campañas aisladas sino que preserve vigencia institucional durante todo el año rotario.',
    utmCampaign: 'dir_ciclo_mantenimiento',
    status: 'draft',
    initiative: 'directorio_clubes',
    whatsappTemplate: '🔄 *Ciclo Permanente de Mantenimiento Institucional · Distrito 4281*\n\nEstimado(a) {{contact.first_name|Presidente o Secretario}} de *{{club.name|tu club}}*:\n\nCon el inicio de un nuevo año rotario o cambios en la Junta Directiva, los invitamos a verificar que los datos de contacto, sede y dignatarios de su club se encuentren actualizados en el Directorio Oficial.\n\n⚙️ *Verifica y actualiza tu junta directiva:* {{club.update_form_url|https://app.clubplatform.org/clubes/registro}}\n\n_Gobernación del Distrito 4281 · Gobernanza y Transparencia_'
  }
];

const FERIA_CAMPAIGNS = [
  {
    code: 'feria-sem-01',
    week: 1,
    name: 'Tu proyecto merece trascender fronteras.',
    type: 'convocatoria_feria',
    horizon: 'mensual',
    targetSegment: 'nuevos',
    channels: ['email', 'whatsapp'],
    subject: 'Convocatoria Oficial: ¡Inscribe el proyecto de tu club en la Feria de Proyectos Rotary Colombia!',
    preheader: 'Presenta tus iniciativas y proyectos comunitarios ante la red rotaria nacional e internacional.',
    messageCentral: 'La Feria de Proyectos Rotary Colombia es la vitrina oficial para conectar proyectos de alto impacto con clubes hermanos, distritos aliados y oportunidades de cooperación global.',
    utmCampaign: 'feria_sem01_convocatoria',
    status: 'draft',
    initiative: 'feria_proyectos',
    whatsappTemplate: '🌟 *Convocatoria Oficial · Feria de Proyectos Rotary Colombia*\n\nEstimado líder rotario, los invitamos a postular los proyectos comunitarios de su club en la Feria de Proyectos.\n\n👉 *Inscribe tu proyecto aquí:* https://rotaryprojectfaircolombia.org/rotary-en-accion?canal=feria&utm_source=whatsapp&utm_medium=crm&utm_campaign=feria_sem01_convocatoria\n\n_Feria de Proyectos Rotary Colombia · Multiplicando alianzas y servicio_'
  },
  {
    code: 'feria-sem-02',
    week: 2,
    name: 'Comparte la evolución y los resultados de tu proyecto.',
    type: 'evolucion_feria',
    horizon: 'mensual',
    targetSegment: 'avances',
    channels: ['email', 'whatsapp'],
    subject: 'Evolución de Proyectos: Actualiza avances y nuevas etapas en la Feria de Proyectos',
    preheader: 'Si tu club postuló iniciativas previamente, reporta su continuidad, avances y metas alcanzadas.',
    messageCentral: 'Dar seguimiento a proyectos en desarrollo refuerza la confianza de los comités de subvenciones y permite a los clubes aliados conocer el impacto real en el tiempo.',
    utmCampaign: 'feria_sem02_evolucion',
    status: 'draft',
    initiative: 'feria_proyectos',
    whatsappTemplate: '📈 *Evolución y Continuidad de Proyectos · Feria de Proyectos*\n\n¿Tu club ya tiene proyectos postulados en ediciones anteriores? Actualiza sus avances y nuevas fases de ejecución en minutos.\n\n👉 *Actualizar proyecto:* https://rotaryprojectfaircolombia.org/rotary-en-accion?canal=feria&utm_source=whatsapp&utm_medium=crm&utm_campaign=feria_sem02_evolucion'
  },
  {
    code: 'feria-sem-03',
    week: 3,
    name: 'Conecta tu iniciativa con oportunidades de cooperación internacional.',
    type: 'resultados_feria',
    horizon: 'mensual',
    targetSegment: 'resultados',
    channels: ['email', 'whatsapp'],
    subject: 'Impacto y Resultados Verificados: Comparte los frutos de tu servicio rotario',
    preheader: 'Beneficiarios directos, cifras de inversión y evidencias de transformación en tu comunidad.',
    messageCentral: 'Compartir los resultados cuantitativos y cualitativos demuestra la transparencia, sostenibilidad y alcance transformador de la labor rotaria.',
    utmCampaign: 'feria_sem03_resultados',
    status: 'draft',
    initiative: 'feria_proyectos',
    whatsappTemplate: '📊 *Impacto y Resultados Verificados · Feria de Proyectos*\n\nDocumenta el impacto de tu servicio: beneficiarios, comunidades atendidas y evidencia fotográfica.\n\n👉 *Reportar resultados:* https://rotaryprojectfaircolombia.org/rotary-en-accion?canal=feria&utm_source=whatsapp&utm_medium=crm&utm_campaign=feria_sem03_resultados'
  },
  {
    code: 'feria-sem-04',
    week: 4,
    name: 'Haz visible el impacto sostenible de tu proyecto rotario.',
    type: 'historias_feria',
    horizon: 'mensual',
    targetSegment: 'historias',
    channels: ['email', 'whatsapp'],
    subject: 'Historias de Éxito: Inspira a la comunidad rotaria con testimonios reales',
    preheader: 'Las voces de los beneficiarios y el testimonio de los voluntarios que hacen la diferencia.',
    messageCentral: 'Cada obra comunitaria tiene rostros e historias conmovedoras: difundir estos testimonios moviliza nuevas voluntades y alianzas estratégicas.',
    utmCampaign: 'feria_sem04_historias',
    status: 'draft',
    initiative: 'feria_proyectos',
    whatsappTemplate: '✨ *Historias de Éxito y Testimonios · Feria de Proyectos*\n\nComparte los testimonios y vivencias de quienes se benefician con las obras de tu club.\n\n👉 *Compartir historia:* https://rotaryprojectfaircolombia.org/rotary-en-accion?canal=feria&utm_source=whatsapp&utm_medium=crm&utm_campaign=feria_sem04_historias'
  },
  {
    code: 'feria-sem-05',
    week: 5,
    name: 'Búsqueda de Fondos y Necesidades de Financiación',
    type: 'financiacion_feria',
    horizon: 'mensual',
    targetSegment: 'financiacion',
    channels: ['email', 'whatsapp'],
    subject: 'Financiación y Subvenciones: Conecta tu proyecto con patrocinadores y clubes aliados',
    preheader: 'Especifica requerimientos de financiación, aportes locales y metas de Subvenciones Globales.',
    messageCentral: 'Facilitamos el puente entre clubes formuladores y clubes internacionales que buscan proyectos maduros y viables para cofinanciar.',
    utmCampaign: 'feria_sem05_financiacion',
    status: 'draft',
    initiative: 'feria_proyectos',
    whatsappTemplate: '🤝 *Oportunidades de Financiación · Feria de Proyectos*\n\n¿Tu proyecto requiere apoyo económico o aliados para Subvención Global? Registra los requerimientos financieros de tu obra.\n\n👉 *Postular necesidad de financiación:* https://rotaryprojectfaircolombia.org/rotary-en-accion?canal=feria&utm_source=whatsapp&utm_medium=crm&utm_campaign=feria_sem05_financiacion'
  },
  {
    code: 'feria-sem-06',
    week: 6,
    name: 'Alianzas y Cooperación Internacional',
    type: 'alianzas_feria',
    horizon: 'mensual',
    targetSegment: 'listos',
    channels: ['email', 'whatsapp'],
    subject: 'Alianzas Internacionales: Expande el alcance global de tu club en la Feria',
    preheader: 'Participación de clubes de múltiples países, hermanamiento y cooperación técnica rotaria.',
    messageCentral: 'La Feria de Proyectos abre una ventana privilegiada hacia la internacionalización de tu club, afianzando lazos de paz y fraternidad rotaria mundial.',
    utmCampaign: 'feria_sem06_alianzas',
    status: 'draft',
    initiative: 'feria_proyectos',
    whatsappTemplate: '🌎 *Alianzas y Cooperación Internacional · Feria de Proyectos*\n\nConecta tu club con distritos y clubes de otros países. Abre las puertas al hermanamiento y al servicio global.\n\n👉 *Explorar alianzas:* https://rotaryprojectfaircolombia.org/rotary-en-accion?canal=feria&utm_source=whatsapp&utm_medium=crm&utm_campaign=feria_sem06_alianzas'
  }
];

// Pre-renderizado estándar para garantizar que tanto `design` como `contentHtml`
// estén 100% estructurados e idempotentes antes de la inserción en base de datos.
for (const c of PILOT_CAMPAIGNS) {
  if (!c.design) {
    c.design = createRotaryMasterDesign(c);
  }
  c.design = normalizeInstitutionalDesign(c.design);
  c.contentHtml = renderDesignToHtml(c.design);
}

for (const c of DIRECTORIO_CAMPAIGNS) {
  if (!c.design) {
    c.design = createDirectorioMasterDesign(c);
  }
  c.design = normalizeInstitutionalDesign(c.design);
  c.contentHtml = renderDesignToHtml(c.design);
}

for (const c of FERIA_CAMPAIGNS) {
  if (!c.design) {
    c.design = createFeriaMasterDesign(c);
  }
  c.design = normalizeInstitutionalDesign(c.design);
  c.contentHtml = renderDesignToHtml(c.design);
}

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

  // Asegurar columnas de scheduledAt, design y remitente institucional si no existieran
  await db.query(`ALTER TABLE "RotaryMarketingCampaign" ADD COLUMN IF NOT EXISTS "scheduledAt" TIMESTAMPTZ`).catch(() => {});
  await db.query(`ALTER TABLE "RotaryMarketingCampaign" ADD COLUMN IF NOT EXISTS "design" JSONB`).catch(() => {});
  await db.query(`ALTER TABLE "RotaryMarketingCampaign" ADD COLUMN IF NOT EXISTS "senderIdentityId" TEXT`).catch(() => {});
  await db.query(`ALTER TABLE "RotaryMarketingCampaign" ADD COLUMN IF NOT EXISTS "senderName" TEXT`).catch(() => {});
  await db.query(`ALTER TABLE "RotaryMarketingCampaign" ADD COLUMN IF NOT EXISTS "fromEmail" TEXT`).catch(() => {});
  await db.query(`ALTER TABLE "RotaryMarketingCampaign" ADD COLUMN IF NOT EXISTS "replyToEmail" TEXT`).catch(() => {});
  await db.query(`ALTER TABLE "RotaryMarketingCampaign" ADD COLUMN IF NOT EXISTS "targetListIds" TEXT[] DEFAULT '{}'::TEXT[]`).catch(() => {});
  await db.query(`ALTER TABLE "RotaryMarketingCampaign" ADD COLUMN IF NOT EXISTS "lastSentAt" TIMESTAMPTZ`).catch(() => {});
  await db.query(`ALTER TABLE "RotaryMarketingCampaign" ADD COLUMN IF NOT EXISTS "lastSendResult" JSONB`).catch(() => {});
  await db.query(`ALTER TABLE "RotaryMarketingCampaign" ADD COLUMN IF NOT EXISTS "initiative" TEXT NOT NULL DEFAULT 'rotary_en_accion'`).catch(() => {});
  // Cuándo una persona personalizó la campaña desde el Editor Visual (v4.1235).
  // Mientras sea NULL, las semillas pueden refrescar el borrador con el copy del
  // código; en cuanto tiene fecha, NINGUNA semilla vuelve a tocar su diseño,
  // asunto, preheader ni textos. Antes, cada arranque en frío del servidor
  // re-sembraba los borradores y borraba lo guardado en el editor.
  await db.query(`ALTER TABLE "RotaryMarketingCampaign" ADD COLUMN IF NOT EXISTS "customizedAt" TIMESTAMPTZ`).catch(() => {});
  // Rescate de lo ya editado: una campaña tocada por una persona tiene "updatedAt"
  // posterior a su creación (las semillas nunca lo cambian). Se marca como
  // personalizada para que la primera re-siembra tras el despliegue no la pise.
  await db.query(`UPDATE "RotaryMarketingCampaign"
    SET "customizedAt" = "updatedAt"
    WHERE "customizedAt" IS NULL
      AND "updatedAt" IS NOT NULL AND "createdAt" IS NOT NULL
      AND "updatedAt" > "createdAt" + INTERVAL '1 minute'`).catch(() => {});
  await db.query(`ALTER TABLE "RotaryCampaignExecution" ADD COLUMN IF NOT EXISTS "initiative" TEXT NOT NULL DEFAULT 'rotary_en_accion'`).catch(() => {});
  await db.query(`UPDATE "RotaryMarketingCampaign" SET "initiative" = 'rotary_en_accion' WHERE "initiative" IS NULL`).catch(() => {});

  // Asegurar columnas en EmailCampaign para sincronización con Email Marketing
  await db.query(`ALTER TABLE "EmailCampaign" ADD COLUMN IF NOT EXISTS "fromEmail" TEXT`).catch(() => {});
  await db.query(`ALTER TABLE "EmailCampaign" ADD COLUMN IF NOT EXISTS "replyTo" TEXT`).catch(() => {});
  await db.query(`ALTER TABLE "EmailCampaign" ADD COLUMN IF NOT EXISTS "senderIdentityId" TEXT`).catch(() => {});

  // 1.1 Tabla de identidades de remitente institucional para campañas
  await db.query(`CREATE TABLE IF NOT EXISTS "RotarySenderIdentity" (
    id TEXT PRIMARY KEY,
    "clubId" TEXT NOT NULL,
    name TEXT NOT NULL,
    "fromName" TEXT NOT NULL,
    "fromEmail" TEXT NOT NULL,
    "replyToEmail" TEXT NOT NULL,
    "isDefault" BOOLEAN DEFAULT FALSE,
    status TEXT NOT NULL DEFAULT 'active',
    "createdAt" TIMESTAMPTZ DEFAULT NOW(),
    "updatedAt" TIMESTAMPTZ DEFAULT NOW()
  )`);
  await db.query(`CREATE INDEX IF NOT EXISTS "idx_rotary_sender_identity_club" ON "RotarySenderIdentity" ("clubId")`).catch(() => {});

  // 1.2 Tabla de ejecuciones históricas e individuales de envíos (Centro de Envíos)
  await db.query(`CREATE TABLE IF NOT EXISTS "RotaryCampaignExecution" (
    id TEXT PRIMARY KEY,
    "campaignId" TEXT NOT NULL,
    "campaignCode" TEXT,
    "campaignName" TEXT NOT NULL,
    "week" INTEGER DEFAULT 1,
    "stage" TEXT,
    "subject" TEXT NOT NULL,
    "preheader" TEXT,
    "emailCampaignId" TEXT,
    "clubId" TEXT,
    "mode" TEXT DEFAULT 'manual',
    "status" TEXT DEFAULT 'sent',
    "targetListIds" TEXT[],
    "totalRecipients" INTEGER DEFAULT 0,
    "sentCount" INTEGER DEFAULT 0,
    "failedCount" INTEGER DEFAULT 0,
    "openCount" INTEGER DEFAULT 0,
    "clickCount" INTEGER DEFAULT 0,
    "senderName" TEXT,
    "fromEmail" TEXT,
    "replyToEmail" TEXT,
    "sentAt" TIMESTAMPTZ,
    "scheduledAt" TIMESTAMPTZ,
    "executedAt" TIMESTAMPTZ DEFAULT NOW(),
    "metadata" JSONB,
    "createdAt" TIMESTAMPTZ DEFAULT NOW(),
    "updatedAt" TIMESTAMPTZ DEFAULT NOW()
  )`);
  await db.query(`CREATE INDEX IF NOT EXISTS "idx_rotary_exec_camp" ON "RotaryCampaignExecution" ("campaignId")`).catch(() => {});
  await db.query(`CREATE INDEX IF NOT EXISTS "idx_rotary_exec_club" ON "RotaryCampaignExecution" ("clubId")`).catch(() => {});
  await db.query(`CREATE INDEX IF NOT EXISTS "idx_rotary_exec_email_camp" ON "RotaryCampaignExecution" ("emailCampaignId")`).catch(() => {});
  await db.query(`CREATE INDEX IF NOT EXISTS "idx_rotary_exec_date" ON "RotaryCampaignExecution" ("executedAt" DESC)`).catch(() => {});

  // Semilla de ejecuciones históricas reales verificadas
  await db.query(`
    INSERT INTO "RotaryCampaignExecution" (
      id, "campaignId", "campaignCode", "campaignName", week, stage,
      subject, preheader, "emailCampaignId", "clubId", mode, status,
      "totalRecipients", "sentCount", "failedCount", "openCount", "clickCount",
      "senderName", "fromEmail", "replyToEmail", "sentAt", "executedAt", "createdAt", "initiative"
    ) VALUES 
    (
      'exec_sem01_piloto_20261014',
      'rmk-sem-01',
      'sem-01',
      'Tu club transforma comunidades. ¡Hagámoslo visible! (Envío Piloto)',
      1,
      'Semana 1 · Captación',
      '🚀 Tu club transforma comunidades. ¡Hagámoslo visible en Rotary en Acción!',
      'Espacio oficial para visibilizar las obras de los 133 clubes de nuestros distritos.',
      '65c122a1-c180-4cb2-892c-821c06c36657',
      '8aa470c5-0a5a-4a8d-b872-38645b8b9f3a',
      'manual',
      'sent',
      2, 2, 0, 0, 0,
      'Comunicaciones | Distrito 4281',
      'comunicaciones@rotary4281.org',
      'comunicaciones@rotary4281.org',
      '2026-10-14T20:41:28.708Z',
      '2026-10-14T20:41:28.708Z',
      '2026-10-14T20:41:28.708Z',
      'rotary_en_accion'
    ),
    (
      'exec_sem01_general_20261014',
      'rmk-sem-01',
      'sem-01',
      'Tu club transforma comunidades. ¡Hagámoslo visible! (Despacho General)',
      1,
      'Semana 1 · Captación',
      '🚀 Tu club transforma comunidades. ¡Hagámoslo visible en Rotary en Acción!',
      'Espacio oficial para visibilizar las iniciativas que están transformando nuestras comunidades.',
      'f70620af-3a75-4d3f-ab48-8ed273c54932',
      '8aa470c5-0a5a-4a8d-b872-38645b8b9f3a',
      'manual',
      'sent',
      354, 354, 0, 154, 7,
      'Comunicaciones | Distrito 4281',
      'comunicaciones@rotary4281.org',
      'comunicaciones@rotary4281.org',
      '2026-10-14T20:46:07.518Z',
      '2026-10-14T20:46:07.518Z',
      '2026-10-14T20:46:07.518Z',
      'rotary_en_accion'
    )
    ON CONFLICT (id) DO UPDATE SET
      "totalRecipients" = EXCLUDED."totalRecipients",
      "sentCount" = EXCLUDED."sentCount",
      "failedCount" = EXCLUDED."failedCount",
      "openCount" = EXCLUDED."openCount",
      "clickCount" = EXCLUDED."clickCount",
      "status" = EXCLUDED."status",
      "initiative" = EXCLUDED."initiative"
  `).catch(() => {});

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

  // Semillas de campañas piloto (Rotary en Acción)
  for (const c of PILOT_CAMPAIGNS) {
    await db.query(`INSERT INTO "RotaryMarketingCampaign"
      (id, code, week, name, type, horizon, "targetSegment", channels, subject, preheader, "messageCentral", "utmCampaign", status, "contentHtml", "whatsappTemplate", "initiative", "design")
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17)
      ON CONFLICT (code) DO UPDATE SET
        name = CASE WHEN "RotaryMarketingCampaign".status = 'draft' AND "RotaryMarketingCampaign"."customizedAt" IS NULL THEN EXCLUDED.name ELSE "RotaryMarketingCampaign".name END,
        "initiative" = COALESCE("RotaryMarketingCampaign"."initiative", 'rotary_en_accion'),
        "design" = CASE WHEN "RotaryMarketingCampaign"."design" IS NULL OR ("RotaryMarketingCampaign".status = 'draft' AND "RotaryMarketingCampaign"."customizedAt" IS NULL) THEN EXCLUDED."design" ELSE "RotaryMarketingCampaign"."design" END,
        "contentHtml" = CASE WHEN "RotaryMarketingCampaign"."design" IS NULL OR ("RotaryMarketingCampaign".status = 'draft' AND "RotaryMarketingCampaign"."customizedAt" IS NULL) THEN EXCLUDED."contentHtml" ELSE "RotaryMarketingCampaign"."contentHtml" END`,
      [
        `rmk-${c.code}`, c.code, c.week, c.name, c.type, c.horizon,
        c.targetSegment, c.channels, c.subject, c.preheader, c.messageCentral,
        c.utmCampaign, c.status, c.contentHtml, c.whatsappTemplate, 'rotary_en_accion',
        JSON.stringify(c.design)
      ]
    ).catch(() => {});
  }

  // Semillas de campañas para Directorio de Clubes (Distrito 4281)
  for (const c of DIRECTORIO_CAMPAIGNS) {
    await db.query(`INSERT INTO "RotaryMarketingCampaign"
      (id, code, week, name, type, horizon, "targetSegment", channels, subject, preheader, "messageCentral", "utmCampaign", status, "contentHtml", "whatsappTemplate", "initiative", "design")
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17)
      ON CONFLICT (code) DO UPDATE SET
        name = CASE WHEN "RotaryMarketingCampaign"."customizedAt" IS NULL THEN EXCLUDED.name ELSE "RotaryMarketingCampaign".name END,
        week = EXCLUDED.week,
        type = EXCLUDED.type,
        horizon = EXCLUDED.horizon,
        "targetSegment" = EXCLUDED."targetSegment",
        channels = EXCLUDED.channels,
        subject = CASE WHEN "RotaryMarketingCampaign"."customizedAt" IS NULL THEN EXCLUDED.subject ELSE "RotaryMarketingCampaign".subject END,
        preheader = CASE WHEN "RotaryMarketingCampaign"."customizedAt" IS NULL THEN EXCLUDED.preheader ELSE "RotaryMarketingCampaign".preheader END,
        "messageCentral" = CASE WHEN "RotaryMarketingCampaign"."customizedAt" IS NULL THEN EXCLUDED."messageCentral" ELSE "RotaryMarketingCampaign"."messageCentral" END,
        "utmCampaign" = EXCLUDED."utmCampaign",
        "whatsappTemplate" = EXCLUDED."whatsappTemplate",
        "initiative" = EXCLUDED."initiative",
        "design" = CASE WHEN "RotaryMarketingCampaign"."design" IS NULL OR ("RotaryMarketingCampaign".status = 'draft' AND "RotaryMarketingCampaign"."customizedAt" IS NULL) THEN EXCLUDED."design" ELSE "RotaryMarketingCampaign"."design" END,
        "contentHtml" = CASE WHEN "RotaryMarketingCampaign"."design" IS NULL OR ("RotaryMarketingCampaign".status = 'draft' AND "RotaryMarketingCampaign"."customizedAt" IS NULL) THEN EXCLUDED."contentHtml" ELSE "RotaryMarketingCampaign"."contentHtml" END`,
      [
        `rmk-${c.code}`, c.code, c.week, c.name, c.type, c.horizon,
        c.targetSegment, c.channels, c.subject, c.preheader, c.messageCentral,
        c.utmCampaign, c.status, c.contentHtml, c.whatsappTemplate, c.initiative || 'directorio_clubes',
        JSON.stringify(c.design)
      ]
    ).catch(() => {});
  }

  // Semillas de campañas para Feria de Proyectos Colombia
  for (const c of FERIA_CAMPAIGNS) {
    await db.query(`INSERT INTO "RotaryMarketingCampaign"
      (id, code, week, name, type, horizon, "targetSegment", channels, subject, preheader, "messageCentral", "utmCampaign", status, "contentHtml", "whatsappTemplate", "initiative", "design")
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17)
      ON CONFLICT (code) DO UPDATE SET
        name = CASE WHEN "RotaryMarketingCampaign"."customizedAt" IS NULL THEN EXCLUDED.name ELSE "RotaryMarketingCampaign".name END,
        week = EXCLUDED.week,
        type = EXCLUDED.type,
        horizon = EXCLUDED.horizon,
        "targetSegment" = EXCLUDED."targetSegment",
        channels = EXCLUDED.channels,
        subject = CASE WHEN "RotaryMarketingCampaign"."customizedAt" IS NULL THEN EXCLUDED.subject ELSE "RotaryMarketingCampaign".subject END,
        preheader = CASE WHEN "RotaryMarketingCampaign"."customizedAt" IS NULL THEN EXCLUDED.preheader ELSE "RotaryMarketingCampaign".preheader END,
        "messageCentral" = CASE WHEN "RotaryMarketingCampaign"."customizedAt" IS NULL THEN EXCLUDED."messageCentral" ELSE "RotaryMarketingCampaign"."messageCentral" END,
        "utmCampaign" = EXCLUDED."utmCampaign",
        "whatsappTemplate" = EXCLUDED."whatsappTemplate",
        "initiative" = EXCLUDED."initiative",
        "design" = CASE WHEN "RotaryMarketingCampaign"."design" IS NULL OR ("RotaryMarketingCampaign".status = 'draft' AND "RotaryMarketingCampaign"."customizedAt" IS NULL) THEN EXCLUDED."design" ELSE "RotaryMarketingCampaign"."design" END,
        "contentHtml" = CASE WHEN "RotaryMarketingCampaign"."design" IS NULL OR ("RotaryMarketingCampaign".status = 'draft' AND "RotaryMarketingCampaign"."customizedAt" IS NULL) THEN EXCLUDED."contentHtml" ELSE "RotaryMarketingCampaign"."contentHtml" END`,
      [
        `rmk-${c.code}`, c.code, c.week, c.name, c.type, c.horizon,
        c.targetSegment, c.channels, c.subject, c.preheader, c.messageCentral,
        c.utmCampaign, c.status, c.contentHtml, c.whatsappTemplate, c.initiative || 'feria_proyectos',
        JSON.stringify(c.design)
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
      name: '¿Qué puede compartir tu club en Rotary en Acción?',
      category: 'Contenido',
      description: 'Categorías oficiales dinámicas sincronizadas con el formulario público de Rotary en Acción.',
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
      key: 'club_platform_cta',
      name: 'CTA Promocional Club Platform',
      category: 'Promoción',
      description: 'Bloque global inspirado en Shopify para activar nuevos clubes en Club Platform (configurable y opcional).',
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

  // Asegurar Plantillas Maestras Institucionales en ContentActivationTemplate si la tabla existe
  try {
    const masterDesign = createRotaryMasterDesign();
    const masterHtml = renderDesignToHtml(masterDesign);
    await db.query(`INSERT INTO "ContentActivationTemplate"
      (id, scope, name, channel, design, html, subject, preheader, "isDefault", status, version, "createdBy")
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)
      ON CONFLICT (id) DO UPDATE SET
        design = EXCLUDED.design,
        html = EXCLUDED.html,
        name = EXCLUDED.name
      WHERE COALESCE("ContentActivationTemplate".version, 1) <= 1`,
      [
        'tpl-rotary-en-accion-master',
        'global',
        'Plantilla Maestra Institucional · Rotary en Acción',
        'email',
        JSON.stringify(masterDesign),
        masterHtml,
        'Tu club transforma comunidades. ¡Hagámoslo visible en Rotary en Acción!',
        'Comparte tus proyectos y actividades comunitarias en Rotary en Acción.',
        true,
        'activa',
        1,
        'sistema'
      ]
    ).catch(() => {});

    // Plantilla Maestra Institucional · Directorio de Clubes Distrito 4281
    const dirMasterDesign = createDirectorioMasterDesign();
    const dirMasterHtml = renderDesignToHtml(dirMasterDesign);
    await db.query(`INSERT INTO "ContentActivationTemplate"
      (id, scope, name, channel, design, html, subject, preheader, "isDefault", status, version, "createdBy")
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)
      ON CONFLICT (id) DO UPDATE SET
        design = EXCLUDED.design,
        html = EXCLUDED.html,
        name = EXCLUDED.name
      WHERE COALESCE("ContentActivationTemplate".version, 1) <= 1`,
      [
        'tpl-directorio-clubes-master',
        'global',
        'Plantilla Maestra Institucional · Directorio de Clubes',
        'email',
        JSON.stringify(dirMasterDesign),
        dirMasterHtml,
        'Tu club merece estar presente. ¡Actualiza su perfil institucional en el Directorio del Distrito 4281!',
        'Cada club Rotary, Rotaract e Interact tiene una historia y un impacto que merece ser visible.',
        false,
        'activa',
        1,
        'sistema'
      ]
    ).catch(() => {});

    // Plantilla Maestra Institucional · Feria de Proyectos Rotary Colombia
    const feriaMasterDesign = createFeriaMasterDesign();
    const feriaMasterHtml = renderDesignToHtml(feriaMasterDesign);
    await db.query(`INSERT INTO "ContentActivationTemplate"
      (id, scope, name, channel, design, html, subject, preheader, "isDefault", status, version, "createdBy")
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)
      ON CONFLICT (id) DO UPDATE SET
        design = EXCLUDED.design,
        html = EXCLUDED.html,
        name = EXCLUDED.name
      WHERE COALESCE("ContentActivationTemplate".version, 1) <= 1`,
      [
        'tpl-feria-proyectos-master',
        'global',
        'Plantilla Maestra Institucional · Feria de Proyectos Rotary Colombia',
        'email',
        JSON.stringify(feriaMasterDesign),
        feriaMasterHtml,
        'Convocatoria Oficial: ¡Inscribe el proyecto de tu club en la Feria de Proyectos Rotary Colombia!',
        'Presenta tus iniciativas y proyectos comunitarios ante la red rotaria nacional e internacional.',
        false,
        'activa',
        1,
        'sistema'
      ]
    ).catch(() => {});
  } catch {}

  _ready = true;
}
