// ══════════════════════════════════════════════════════════════════════════
// Club Archetype Engine — "Club DNA Profile"
// Deterministic rules-based engine that classifies a club into an archetype
// from onboarding data. No external API dependency — instant results.
// ══════════════════════════════════════════════════════════════════════════

// ── Types ──────────────────────────────────────────────────────────────────

export interface OnboardingData {
  // Step 1: Info
  name: string;
  description: string;
  district: string;
  city: string;
  country: string;
  state: string;
  address: string;
  phone: string;
  email: string;
  foundedDate?: string;
  documents?: any[];

  // Step 2: Branding
  logo: string;
  colorPrimary: string;
  colorSecondary: string;

  // Step 3: Social
  social: Record<string, string>;
  customSocial?: { label: string; icon: string; url: string }[];

  // Step 4: Images (count of customized images)
  customizedImageCount: number;
  totalImageCount: number;

  // Step 5: Modules
  memberCount: number;
  hasProjects: boolean;
  hasEvents: boolean;
  hasRotaract: boolean;
  hasInteract: boolean;
  hasEcommerce: boolean;
  hasDian: boolean;
  hasYouthExchange: boolean;
  hasNGSE: boolean;
  hasRotex: boolean;

  // Step 6: Members
  members?: { name: string; isBoard: boolean; boardRole: string; image: string }[];
}

export interface ArchetypeDefinition {
  id: string;
  name: string;
  emoji: string;
  tagline: string;
  description: string;
  toneOfVoice: string;
  toneExamples: string[];
  gradient: string;      // Tailwind gradient classes
  accentColor: string;
}

export interface ScoreSet {
  digitalMaturity: number;   // 0–100
  socialReach: number;       // 0–100
  visualIdentity: number;    // 0–100
  memberBase: number;        // 0–100
}

export interface CommunicationPillar {
  name: string;
  emoji: string;
  description: string;
  priority: number; // 1 = highest
}

export interface SuggestedAction {
  id: string;
  title: string;
  description: string;
  emoji: string;
  category: 'content' | 'social' | 'branding' | 'growth' | 'engagement';
  route?: string; // Admin panel route
}

export interface MonthlyTheme {
  week: number;
  theme: string;
  emoji: string;
  pillar: string;
  suggestedPosts: number;
}

export interface ArchetypeResult {
  archetype: ArchetypeDefinition;
  scores: ScoreSet;
  overallScore: number;
  communicationPillars: CommunicationPillar[];
  suggestedActions: SuggestedAction[];
  contentCalendarSeed: MonthlyTheme[];
  seoKeywords: string[];
  generatedAt: string;
}

// ── Archetype Definitions ─────────────────────────────────────────────────

const ARCHETYPES: ArchetypeDefinition[] = [
  {
    id: 'community_builder',
    name: 'El Constructor Comunitario',
    emoji: '🏗️',
    tagline: 'Impacto social directo con raíces profundas',
    description: 'Tu club tiene una vocación clara de servicio comunitario directo. Tu fortaleza radica en la conexión con la comunidad local y la ejecución de proyectos que transforman vidas. Tu presencia digital es un terreno fértil para contar las historias de impacto que ya están sucediendo.',
    toneOfVoice: 'Cercano y comprometido — profesional pero humano',
    toneExamples: [
      '"Cada sábado, nuestros socios llegan temprano. No por obligación, sino porque cada hora cuenta para las familias que nos esperan."',
      '"Los números importan: 200 familias beneficiadas. Pero lo que nos mueve son las sonrisas."',
    ],
    gradient: 'from-emerald-500 to-teal-600',
    accentColor: '#10b981',
  },
  {
    id: 'global_ambassador',
    name: 'El Embajador Global',
    emoji: '🌍',
    tagline: 'Conectando generaciones y fronteras',
    description: 'Tu club tiene una vocación internacional extraordinaria. Con programas de intercambio, Rotaract o Interact activos, estás formando la próxima generación de líderes. Tu comunicación debe reflejar esa diversidad cultural y el impacto transcontinental de tu labor.',
    toneOfVoice: 'Inspirador y cosmopolita — visión de impacto global',
    toneExamples: [
      '"Un joven de Cali cena con una familia en Helsinki. Eso es Rotary: derribar fronteras, construir puentes."',
      '"Nuestros intercambistas no solo viajan — regresan transformados, listos para transformar."',
    ],
    gradient: 'from-blue-500 to-indigo-600',
    accentColor: '#3b82f6',
  },
  {
    id: 'natural_communicator',
    name: 'El Comunicador Nato',
    emoji: '📢',
    tagline: 'Una voz que amplifica el servicio',
    description: 'Tu club entiende que la comunicación es acción. Con presencia sólida en redes sociales y una base de socios activa, tienes los ingredientes para convertir cada proyecto en una historia que inspire. Tu desafío es pasar de publicar a crear narrativas de largo plazo.',
    toneOfVoice: 'Dinámico y narrativo — cuenta historias, no reporta',
    toneExamples: [
      '"No hacemos caridad. Hacemos inversión social. Y esta es la historia de cómo una comunidad se levantó."',
      '"¿Quieres saber qué hicimos este mes? Mejor te contamos qué cambió."',
    ],
    gradient: 'from-orange-500 to-amber-600',
    accentColor: '#f59e0b',
  },
  {
    id: 'strategic_ally',
    name: 'El Aliado Estratégico',
    emoji: '🤝',
    tagline: 'Transparencia, sostenibilidad y visión corporativa',
    description: 'Tu club opera con mente estratégica. E-commerce, transparencia fiscal, estados financieros — tienes las herramientas para posicionar a tu club como un aliado confiable para donantes, empresas y entidades gubernamentales. Tu comunicación debe proyectar profesionalismo y rendición de cuentas.',
    toneOfVoice: 'Profesional e institucional — inspira confianza',
    toneExamples: [
      '"Cada peso donado se registra, se invierte y se reporta. Así construimos confianza."',
      '"Nuestros estados financieros son públicos porque creemos que la transparencia no es opcional — es un principio."',
    ],
    gradient: 'from-slate-600 to-gray-800',
    accentColor: '#475569',
  },
  {
    id: 'legacy_club',
    name: 'El Club Legado',
    emoji: '⭐',
    tagline: 'Tradición que evoluciona con los tiempos',
    description: 'Tu club tiene historia, trayectoria y una base sólida de socios comprometidos. Esa experiencia es tu mayor activo. Tu reto es combinar la tradición Rotaria con una presencia digital moderna que atraiga a las nuevas generaciones sin perder la esencia.',
    toneOfVoice: 'Tradicional con toque moderno — honra el legado, abraza el futuro',
    toneExamples: [
      '"Desde 1985, servimos. Hoy lo hacemos con las mismas manos, pero con nuevas herramientas."',
      '"Nuestros fundadores soñaron con un club que trascendiera. 40 años después, seguimos aquí."',
    ],
    gradient: 'from-amber-600 to-yellow-700',
    accentColor: '#d97706',
  },
  {
    id: 'digital_innovator',
    name: 'El Innovador Digital',
    emoji: '🚀',
    tagline: 'Servicio 2.0 — tecnología al servicio de la comunidad',
    description: 'Tu club aprovecha al máximo las herramientas digitales. Con presencia en múltiples plataformas, identidad visual personalizada y todos los módulos activos, estás preparado para ser referente de comunicación digital en tu distrito. Tu siguiente paso: automatización y contenido de alto impacto.',
    toneOfVoice: 'Disruptivo y tech-forward — fresco, moderno, audaz',
    toneExamples: [
      '"Rotary no es lo que era. Es mejor. Y estamos aquí para demostrarlo."',
      '"Nuestro sitio web trabaja 24/7 para que cada donación, cada socio y cada historia cuente."',
    ],
    gradient: 'from-violet-500 to-purple-700',
    accentColor: '#8b5cf6',
  },
];

// ── Score Calculation ─────────────────────────────────────────────────────

function computeScores(data: OnboardingData): ScoreSet {
  // ── Digital Maturity ──
  // Based on: modules activated, social presence, custom images
  const moduleCount = [
    data.hasProjects, data.hasEvents, data.hasRotaract, data.hasInteract,
    data.hasEcommerce, data.hasDian, data.hasYouthExchange, data.hasNGSE, data.hasRotex,
  ].filter(Boolean).length;

  const socialCount = Object.values(data.social || {}).filter(v => v && v.trim().length > 5).length;
  const customSocialCount = (data.customSocial || []).filter(c => c.url && c.url.trim().length > 5).length;
  const totalSocial = socialCount + customSocialCount;

  const imageRatio = data.totalImageCount > 0 ? data.customizedImageCount / data.totalImageCount : 0;

  const digitalMaturity = Math.min(100, Math.round(
    (moduleCount / 9) * 35 +                // Up to 35 pts for modules
    Math.min(totalSocial / 5, 1) * 30 +      // Up to 30 pts for social networks
    imageRatio * 20 +                         // Up to 20 pts for custom images
    (data.documents && data.documents.length > 0 ? 15 : 0), // 15 pts for knowledge docs
  ));

  // ── Social Reach ──
  // Based on: number and variety of social platforms
  const platformWeights: Record<string, number> = {
    facebook: 20, instagram: 25, twitter: 10, youtube: 15, linkedin: 10, tiktok: 15,
  };
  let socialReach = 0;
  for (const [key, url] of Object.entries(data.social || {})) {
    if (url && url.trim().length > 5) {
      socialReach += platformWeights[key] || 8;
    }
  }
  socialReach += Math.min(customSocialCount * 8, 20); // Custom socials add up to 20
  socialReach = Math.min(100, socialReach);

  // ── Visual Identity ──
  const hasLogo = data.logo && data.logo.trim().length > 5 ? 30 : 0;
  const hasCustomColors = (data.colorPrimary !== '#013388' || data.colorSecondary !== '#E29C00') ? 15 : 10; // Default colors still count
  const visualIdentity = Math.min(100, Math.round(
    hasLogo +
    hasCustomColors +
    imageRatio * 35 +
    (data.description && data.description.length > 50 ? 20 : data.description?.length > 10 ? 10 : 0),
  ));

  // ── Member Base ──
  const memberCount = data.memberCount || 0;
  const boardMembers = (data.members || []).filter(m => m.isBoard).length;
  const membersWithPhotos = (data.members || []).filter(m => m.image && m.image.trim().length > 5).length;
  const totalMembers = data.members?.length || 0;

  const memberBase = Math.min(100, Math.round(
    Math.min(memberCount / 50, 1) * 40 +                                 // Up to 40 pts for size
    (boardMembers > 0 ? Math.min(boardMembers / 5, 1) * 25 : 0) +       // Up to 25 pts for board
    (totalMembers > 0 ? (membersWithPhotos / totalMembers) * 20 : 0) +   // Up to 20 pts for photos
    (data.foundedDate ? 15 : 0),                                          // 15 pts for founding date
  ));

  return { digitalMaturity, socialReach, visualIdentity, memberBase };
}

// ── Archetype Classification ─────────────────────────────────────────────

function classifyArchetype(data: OnboardingData, scores: ScoreSet): ArchetypeDefinition {
  // Calculate a weighted score for each archetype
  const archetypeScores: Record<string, number> = {};

  const hasInternational = data.hasRotaract || data.hasInteract || data.hasYouthExchange || data.hasNGSE || data.hasRotex;
  const totalSocial = Object.values(data.social || {}).filter(v => v && v.trim().length > 5).length +
    (data.customSocial || []).filter(c => c.url?.trim().length > 5).length;
  const moduleCount = [
    data.hasProjects, data.hasEvents, data.hasRotaract, data.hasInteract,
    data.hasEcommerce, data.hasDian, data.hasYouthExchange, data.hasNGSE, data.hasRotex,
  ].filter(Boolean).length;

  const yearsOld = data.foundedDate
    ? Math.max(0, (new Date().getFullYear() - new Date(data.foundedDate).getFullYear()))
    : 0;

  // Community Builder: projects focus, fewer digital channels
  archetypeScores['community_builder'] =
    (data.hasProjects ? 30 : 0) +
    (scores.digitalMaturity < 50 ? 20 : 0) +
    (totalSocial <= 2 ? 15 : 0) +
    (data.description && data.description.length > 50 ? 10 : 0) +
    (data.memberCount >= 10 && data.memberCount <= 30 ? 10 : 0);

  // Global Ambassador: international programs
  archetypeScores['global_ambassador'] =
    (hasInternational ? 50 : 0) +
    (data.hasRotaract ? 15 : 0) +
    (data.hasInteract ? 10 : 0) +
    (data.hasYouthExchange ? 15 : 0) +
    (data.hasNGSE ? 10 : 0) +
    (totalSocial >= 3 ? 10 : 0);

  // Natural Communicator: social-heavy, decent member base
  archetypeScores['natural_communicator'] =
    (totalSocial >= 3 ? 35 : totalSocial >= 2 ? 15 : 0) +
    (scores.socialReach >= 50 ? 25 : scores.socialReach >= 30 ? 10 : 0) +
    (data.memberCount >= 30 ? 15 : 0) +
    (data.customizedImageCount > 3 ? 10 : 0);

  // Strategic Ally: e-commerce, DIAN, financial focus
  archetypeScores['strategic_ally'] =
    (data.hasEcommerce ? 35 : 0) +
    (data.hasDian ? 30 : 0) +
    (data.hasProjects ? 10 : 0) +
    (data.hasEvents ? 5 : 0) +
    (data.memberCount >= 20 ? 10 : 0);

  // Legacy Club: old foundation, many members, multiple modules
  archetypeScores['legacy_club'] =
    (yearsOld >= 15 ? 40 : yearsOld >= 8 ? 20 : 0) +
    (data.memberCount >= 50 ? 25 : data.memberCount >= 30 ? 10 : 0) +
    (moduleCount >= 4 ? 15 : 0) +
    (data.foundedDate ? 10 : 0);

  // Digital Innovator: max digital presence
  archetypeScores['digital_innovator'] =
    (totalSocial >= 4 ? 25 : 0) +
    (data.customizedImageCount >= 5 ? 20 : 0) +
    (moduleCount >= 5 ? 20 : 0) +
    (scores.digitalMaturity >= 60 ? 20 : 0) +
    (scores.visualIdentity >= 70 ? 15 : 0);

  // Find the winner
  let maxScore = 0;
  let winnerId = 'community_builder';
  for (const [id, score] of Object.entries(archetypeScores)) {
    if (score > maxScore) {
      maxScore = score;
      winnerId = id;
    }
  }

  return ARCHETYPES.find(a => a.id === winnerId) || ARCHETYPES[0];
}

// ── Communication Pillars ─────────────────────────────────────────────────

function generatePillars(data: OnboardingData, _archetype: ArchetypeDefinition): CommunicationPillar[] {
  const pillars: CommunicationPillar[] = [];

  // Always present: institutional identity
  pillars.push({
    name: 'Identidad Institucional',
    emoji: '🏛️',
    description: 'Refuerza la imagen y valores de Rotary en cada comunicación',
    priority: 3,
  });

  // Based on modules and data
  if (data.hasProjects) {
    pillars.push({
      name: 'Impacto Comunitario',
      emoji: '💪',
      description: 'Documenta y comunica los resultados de tus proyectos de servicio',
      priority: 1,
    });
  }

  if (data.hasEvents) {
    pillars.push({
      name: 'Vida Clubística',
      emoji: '🎉',
      description: 'Muestra la actividad interna del club: reuniones, eventos, camaradería',
      priority: data.memberCount >= 20 ? 2 : 4,
    });
  }

  if (data.hasRotaract || data.hasInteract) {
    pillars.push({
      name: 'Juventud y Liderazgo',
      emoji: '🌱',
      description: 'Visibiliza el trabajo con las nuevas generaciones Rotarias',
      priority: 2,
    });
  }

  if (data.hasEcommerce) {
    pillars.push({
      name: 'Sostenibilidad y Recaudación',
      emoji: '💰',
      description: 'Comunica campañas de fundraising y demuestra transparencia en el uso de fondos',
      priority: 3,
    });
  }

  if (data.hasYouthExchange || data.hasNGSE || data.hasRotex) {
    pillars.push({
      name: 'Conexión Internacional',
      emoji: '🌐',
      description: 'Comparte historias de intercambio y cooperación entre países',
      priority: 2,
    });
  }

  if (data.hasDian) {
    pillars.push({
      name: 'Transparencia y Rendición de Cuentas',
      emoji: '📊',
      description: 'Publicación de estados financieros e informes de gestión',
      priority: 4,
    });
  }

  // Always present: cultura de membresía
  if (data.memberCount >= 10) {
    pillars.push({
      name: 'Cultura de Membresía',
      emoji: '👥',
      description: 'Atrae nuevos socios mostrando el valor de pertenecer al club',
      priority: data.memberCount < 25 ? 2 : 5,
    });
  }

  // Sort by priority, take top 4
  return pillars.sort((a, b) => a.priority - b.priority).slice(0, 4);
}

// ── Suggested Actions ─────────────────────────────────────────────────────

function generateActions(data: OnboardingData, scores: ScoreSet): SuggestedAction[] {
  const actions: SuggestedAction[] = [];

  // Always suggest first content
  if (scores.digitalMaturity < 70) {
    actions.push({
      id: 'first-post',
      title: 'Publica tu primera noticia',
      description: 'Cuenta la historia de tu club o anuncia un proyecto activo',
      emoji: '📰',
      category: 'content',
      route: '/admin/posts',
    });
  }

  if (data.hasProjects) {
    actions.push({
      id: 'first-project',
      title: 'Documenta un proyecto con métricas',
      description: 'Agrega beneficiarios, presupuesto y fotos de impacto',
      emoji: '📁',
      category: 'content',
      route: '/admin/projects',
    });
  }

  if (data.hasEvents) {
    actions.push({
      id: 'first-event',
      title: 'Crea tu primer evento en el calendario',
      description: 'Próxima reunión, conferencia o actividad de servicio',
      emoji: '📅',
      category: 'engagement',
      route: '/admin/calendar',
    });
  }

  if (scores.socialReach < 40) {
    actions.push({
      id: 'social-setup',
      title: 'Completa tus redes sociales',
      description: 'Instagram y Facebook son fundamentales para alcance comunitario',
      emoji: '📱',
      category: 'social',
      route: '/admin/club',
    });
  }

  if (scores.visualIdentity < 60) {
    actions.push({
      id: 'visual-upgrade',
      title: 'Personaliza las imágenes de tu sitio',
      description: 'Reemplaza las imágenes por defecto con fotos reales del club',
      emoji: '🖼️',
      category: 'branding',
      route: '/admin/site-setup',
    });
  }

  if (data.memberCount > 0 && (!data.members || data.members.filter(m => m.name).length < 3)) {
    actions.push({
      id: 'member-profiles',
      title: 'Completa los perfiles de socios',
      description: 'Agrega fotos y descripciones a tu directorio de miembros',
      emoji: '👥',
      category: 'growth',
      route: '/admin/members',
    });
  }

  // Calendar editorial
  actions.push({
    id: 'editorial-calendar',
    title: 'Genera tu parrilla editorial del mes',
    description: 'Planifica 4 semanas de contenido alineado con tus pilares',
    emoji: '📆',
    category: 'content',
    route: '/admin/publications',
  });

  // Cap at 5 most relevant
  return actions.slice(0, 5);
}

// ── Content Calendar Seed ─────────────────────────────────────────────────

function generateCalendarSeed(pillars: CommunicationPillar[]): MonthlyTheme[] {
  const rotaryMonthlyThemes: Record<number, { theme: string; emoji: string }> = {
    1: { theme: 'Concienciación sobre el medio ambiente', emoji: '🌱' },
    2: { theme: 'Paz y resolución de conflictos', emoji: '🕊️' },
    3: { theme: 'Agua, saneamiento e higiene', emoji: '💧' },
    4: { theme: 'Salud materno-infantil', emoji: '👶' },
    5: { theme: 'Servicio juvenil', emoji: '🧑‍🎓' },
    6: { theme: 'Becas de Rotary', emoji: '🎓' },
    7: { theme: 'Inicio de nuevo año Rotario', emoji: '🎯' },
    8: { theme: 'Membresía y extensión', emoji: '🤝' },
    9: { theme: 'Educación básica y alfabetización', emoji: '📚' },
    10: { theme: 'Desarrollo económico y comunitario', emoji: '🏘️' },
    11: { theme: 'La Fundación Rotaria', emoji: '💛' },
    12: { theme: 'Prevención y tratamiento de enfermedades', emoji: '🏥' },
  };

  const currentMonth = new Date().getMonth() + 1; // 1-12
  const nextMonth = currentMonth === 12 ? 1 : currentMonth + 1;
  const monthTheme = rotaryMonthlyThemes[nextMonth] || rotaryMonthlyThemes[1];

  // Ensure we have at least 2 pillars for variety
  const pillarNames = pillars.length >= 2
    ? pillars.map(p => p.name)
    : ['Identidad Institucional', 'Impacto Comunitario', 'Vida Clubística'];

  return [
    {
      week: 1,
      theme: `${monthTheme.theme} — Apertura`,
      emoji: monthTheme.emoji,
      pillar: pillarNames[0],
      suggestedPosts: 2,
    },
    {
      week: 2,
      theme: `Historias de impacto del club`,
      emoji: '💬',
      pillar: pillarNames[1] || pillarNames[0],
      suggestedPosts: 2,
    },
    {
      week: 3,
      theme: `Vida del club y camaradería`,
      emoji: '🫂',
      pillar: pillarNames[2] || pillarNames[0],
      suggestedPosts: 2,
    },
    {
      week: 4,
      theme: `Llamado a la acción — Únete y participa`,
      emoji: '🚀',
      pillar: pillarNames[Math.min(3, pillarNames.length - 1)],
      suggestedPosts: 1,
    },
  ];
}

// ── SEO Keywords (local) ─────────────────────────────────────────────────

function generateSEOKeywords(data: OnboardingData): string[] {
  const keywords: string[] = [
    `Rotary ${data.city || ''}`.trim(),
    `Club Rotario ${data.name || ''}`.trim(),
    'Rotary International',
    'servicio comunitario',
  ];

  if (data.district) keywords.push(`Distrito ${data.district}`);
  if (data.city) keywords.push(`voluntariado ${data.city}`);
  if (data.hasRotaract) keywords.push('Rotaract');
  if (data.hasInteract) keywords.push('Interact');
  if (data.hasYouthExchange) keywords.push('intercambio juvenil Rotary');
  if (data.hasEcommerce) keywords.push('donaciones Rotary');
  if (data.hasProjects) keywords.push('proyectos de servicio');
  if (data.state) keywords.push(`Rotary ${data.state}`);

  return [...new Set(keywords)].slice(0, 10);
}

// ══════════════════════════════════════════════════════════════════════════
// ── Main Engine Entry Point ──────────────────────────────────────────────
// ══════════════════════════════════════════════════════════════════════════

export function generateClubArchetype(data: OnboardingData): ArchetypeResult {
  const scores = computeScores(data);
  const archetype = classifyArchetype(data, scores);
  const pillars = generatePillars(data, archetype);
  const actions = generateActions(data, scores);
  const calendarSeed = generateCalendarSeed(pillars);
  const seoKeywords = generateSEOKeywords(data);

  const overallScore = Math.round(
    (scores.digitalMaturity * 0.3 +
      scores.socialReach * 0.25 +
      scores.visualIdentity * 0.25 +
      scores.memberBase * 0.2),
  );

  return {
    archetype,
    scores,
    overallScore,
    communicationPillars: pillars,
    suggestedActions: actions,
    contentCalendarSeed: calendarSeed,
    seoKeywords,
    generatedAt: new Date().toISOString(),
  };
}

// Helper: extract onboarding data from the OnboardingFlow state format
export function extractOnboardingData(
  info: any,
  branding: any,
  social: any,
  modules: any,
  members: any[],
  siteImages: any,
  documents: any[],
): OnboardingData {
  // Count customized images
  let customized = 0;
  let total = 0;
  const SITE_IMG_DEFAULTS_KEYS = ['hero', 'causes', 'foundation', 'join', 'aboutHero', 'aboutCarousel'];
  for (const key of SITE_IMG_DEFAULTS_KEYS) {
    const imgs = siteImages[key];
    if (Array.isArray(imgs)) {
      total += imgs.length;
      // Count non-unsplash images as customized
      customized += imgs.filter((img: any) => img?.url && !img.url.includes('unsplash.com')).length;
    }
  }

  return {
    name: info.name || '',
    description: info.description || '',
    district: info.district || '',
    city: info.city || '',
    country: info.country || '',
    state: info.state || '',
    address: info.address || '',
    phone: info.phone || '',
    email: info.email || '',
    foundedDate: info.foundedDate || undefined,
    documents: documents || [],
    logo: branding.logo || '',
    colorPrimary: branding.colorPrimary || '#013388',
    colorSecondary: branding.colorSecondary || '#E29C00',
    social: social.social || {},
    customSocial: social.customSocial || [],
    customizedImageCount: customized,
    totalImageCount: total || 20, // Prevent division by zero
    memberCount: modules.memberCount || 0,
    hasProjects: !!modules.hasProjects,
    hasEvents: !!modules.hasEvents,
    hasRotaract: !!modules.hasRotaract,
    hasInteract: !!modules.hasInteract,
    hasEcommerce: !!modules.hasEcommerce,
    hasDian: !!modules.hasDian,
    hasYouthExchange: !!modules.hasYouthExchange,
    hasNGSE: !!modules.hasNGSE,
    hasRotex: !!modules.hasRotex,
    members: members || [],
  };
}
