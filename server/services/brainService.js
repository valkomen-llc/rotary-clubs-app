// ─────────────────────────────────────────────────────────────────────────────
// 🧠 BRAIN SERVICE v4.351 — Cerebros IA distribuidos para Club Platform
//
// Cada Brain es una unidad de inteligencia: un MASTER global (singleton) +
// uno por sitio (Club / District). Las BrainMemory son fragmentos indexados
// con embedding de Gemini text-embedding-004 (768d). BrainRelation es el
// grafo entre cerebros (PARENT_OF, MEMBER_OF, COLLABORATES_WITH, etc.).
// La búsqueda semántica usa cosine en JS — suficiente hasta ~50k memorias
// por brain. Cuando crezca, migramos a pgvector.
// ─────────────────────────────────────────────────────────────────────────────
import prisma from '../lib/prisma.js';

console.log('🧠 BRAIN SERVICE v4.375 — cerebros + grafo 3D + obsidian + docs + reindex paginado + chat agente operativo 🤖');

// Las tablas Brain/BrainMemory/BrainRelation se crean vía `prisma db push`.
// Hasta que ese push se corra en producción, todas las operaciones aquí
// fallarían con P2021 (relation does not exist). Para no romper los flujos
// existentes (crear post / project / event), chequeamos una vez por proceso
// y si no existen, marcamos el servicio como dormant — todas las funciones
// devuelven null/empty silenciosamente hasta que el deploy migre el schema.
let _tablesReady = null;
async function ensureTables() {
    if (_tablesReady !== null) return _tablesReady;
    try {
        await prisma.brain.findFirst({ select: { id: true } });
        _tablesReady = true;
        return true;
    } catch (err) {
        if (err?.code === 'P2021' || /does not exist|relation .* does not exist/i.test(err.message || '')) {
            console.warn('[brainService] tablas Brain/* aún no existen — corré `npm run db:push` para activarlas. Servicio en dormant mode.');
        } else {
            console.warn('[brainService] table check error:', err.message);
        }
        _tablesReady = false;
        return false;
    }
}

const EMBED_MODEL = 'text-embedding-004';
const EMBED_DIMS  = 768;
const EMBED_ENDPOINT = `https://generativelanguage.googleapis.com/v1beta/models/${EMBED_MODEL}:embedContent`;

// Map Club.category → Brain.kind. Default a CLUB para el resto.
const CATEGORY_TO_KIND = {
    club: 'CLUB',
    association: 'ASSOCIATION',
    exchange_program: 'PROGRAM',
    event: 'EVENT',
    conference: 'CONFERENCE',
    project_fair: 'PROJECT_FAIR',
    foundation: 'FOUNDATION',
};

const truncate = (str, max = 8000) => {
    if (!str) return '';
    const s = String(str);
    return s.length > max ? s.slice(0, max) : s;
};

// ─── Embeddings ──────────────────────────────────────────────────────────────

export async function embedText(text) {
    const key = process.env.GEMINI_API_KEY;
    if (!key) {
        // Sin API key devolvemos un vector vacío; la ingesta continúa y la
        // memory queda persistida sin embedding. Search la ignorará.
        return [];
    }
    const cleaned = truncate(text, 8000);
    if (!cleaned.trim()) return [];

    const url = `${EMBED_ENDPOINT}?key=${encodeURIComponent(key)}`;
    const body = {
        model: `models/${EMBED_MODEL}`,
        content: { parts: [{ text: cleaned }] },
    };

    try {
        const r = await fetch(url, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(body),
        });
        if (!r.ok) {
            const errText = await r.text().catch(() => '');
            console.warn(`[brainService] embed ${r.status}:`, errText.slice(0, 200));
            return [];
        }
        const data = await r.json();
        const values = data?.embedding?.values;
        if (!Array.isArray(values) || values.length !== EMBED_DIMS) return [];
        return values;
    } catch (err) {
        console.warn('[brainService] embed error:', err.message);
        return [];
    }
}

// Cosine similarity entre dos vectores del mismo tamaño. Asume L2 > 0.
function cosine(a, b) {
    if (!a || !b || a.length === 0 || a.length !== b.length) return 0;
    let dot = 0, na = 0, nb = 0;
    for (let i = 0; i < a.length; i++) {
        dot += a[i] * b[i];
        na  += a[i] * a[i];
        nb  += b[i] * b[i];
    }
    const denom = Math.sqrt(na) * Math.sqrt(nb);
    return denom === 0 ? 0 : dot / denom;
}

// ─── Brain getters / creators ────────────────────────────────────────────────

export async function getOrCreateMasterBrain() {
    if (!(await ensureTables())) return null;
    let master = await prisma.brain.findFirst({ where: { isMaster: true } });
    if (master) return master;
    master = await prisma.brain.create({
        data: {
            kind: 'MASTER',
            name: 'Club Platform AI Core',
            isMaster: true,
            identityPrompt:
                'Eres el Cerebro Maestro de Club Platform. Conoces todos los clubes, ' +
                'distritos, asociaciones y programas conectados al ecosistema rotario. ' +
                'Tu rol es coordinar, relacionar y construir memoria institucional global.',
        },
    });
    return master;
}

// Construye un identityPrompt rico a partir de los datos del Club (poblados
// por el onboarding). Si todavía no hay data, devuelve uno genérico.
export function buildIdentityPromptFromClub(club) {
    if (!club) return null;

    const kindLabel = {
        CLUB: 'Club Rotary',
        ASSOCIATION: 'Asociación Rotaria',
        PROGRAM: 'Programa de Intercambio',
        EVENT: 'Evento Rotario',
        CONFERENCE: 'Conferencia Rotaria',
        PROJECT_FAIR: 'Feria de Proyectos',
        FOUNDATION: 'Fundación',
    }[CATEGORY_TO_KIND[club.category] || 'CLUB'] || 'Sitio Rotario';

    const location = [club.city, club.country].filter(Boolean).join(', ');
    const lines = [
        `Eres el cerebro institucional de "${club.name}" — ${kindLabel}${location ? ` en ${location}` : ''}.`,
    ];

    if (club.description) {
        lines.push(`\nDescripción del sitio: ${club.description.slice(0, 800)}`);
    }
    if (club.email)   lines.push(`\nContacto: ${club.email}${club.phone ? ` · ${club.phone}` : ''}`);

    lines.push(
        '\nTu rol es:',
        '· Aprender de cada noticia, proyecto, evento y documento que el sitio publica.',
        '· Construir memoria institucional coherente con la voz y los valores del sitio.',
        '· Generar respuestas, recomendaciones y contenido alineados con esa identidad.',
        '· Mantener el contexto histórico y reglamentario disponible para razonar.',
        '\nNo inventes información que no esté en tu memoria. Si te falta contexto, decilo.'
    );

    return lines.join('\n');
}

export async function getOrCreateBrainForClub(clubId) {
    if (!clubId) return null;
    if (!(await ensureTables())) return null;
    const existing = await prisma.brain.findUnique({ where: { clubId } });
    if (existing) return existing;

    const club = await prisma.club.findUnique({ where: { id: clubId } });
    if (!club) return null;

    const kind = CATEGORY_TO_KIND[club.category] || 'CLUB';
    return prisma.brain.create({
        data: {
            kind,
            name: club.name,
            clubId: club.id,
            identityPrompt: buildIdentityPromptFromClub(club),
            metadata: {
                city: club.city,
                country: club.country,
                subdomain: club.subdomain,
                category: club.category,
                type: club.type,
                config: {
                    learnFromPosts: true,
                    learnFromProjects: true,
                    learnFromEvents: true,
                    learnFromDocuments: true,
                    learnFromMembers: true,
                    shareWithMaster: true,
                },
            },
        },
    });
}

export async function getOrCreateBrainForDistrict(districtId) {
    if (!districtId) return null;
    if (!(await ensureTables())) return null;
    const existing = await prisma.brain.findUnique({ where: { districtId } });
    if (existing) return existing;

    const district = await prisma.district.findUnique({ where: { id: districtId } });
    if (!district) return null;

    return prisma.brain.create({
        data: {
            kind: 'DISTRICT',
            name: district.name,
            districtId: district.id,
            identityPrompt:
                `Eres el cerebro del Distrito ${district.number || ''} — ${district.name}. ` +
                `Coordina los clubes afiliados y construye una visión distrital.`,
            metadata: {
                number: district.number,
                governor: district.governor,
                subdomain: district.subdomain,
            },
        },
    });
}

// Resuelve el brain correcto para un clubId. Si tiene districtId, también lo
// devuelve para que ingestMemory pueda replicar.
export async function resolveBrainsForClub(clubId) {
    if (!clubId) return { site: null, district: null };
    const club = await prisma.club.findUnique({
        where: { id: clubId },
        select: { id: true, districtId: true },
    });
    if (!club) return { site: null, district: null };

    const [site, district] = await Promise.all([
        getOrCreateBrainForClub(clubId),
        club.districtId ? getOrCreateBrainForDistrict(club.districtId) : Promise.resolve(null),
    ]);
    return { site, district };
}

// ─── Sync con onboarding ─────────────────────────────────────────────────────
// Toma datos del Club + Settings + ContentSections (poblados durante el wizard
// de setup) y los persiste en el brain como (a) identityPrompt enriquecido y
// (b) memorias NOTE estructuradas — identidad, misión, contacto, redes, etc.
// Idempotente: las memorias usan sourceType='Onboarding' con sourceId fijo, así
// llamar varias veces solo refresca el contenido.
export async function syncBrainWithOnboarding(clubId) {
    if (!clubId) return { ok: false, error: 'clubId required' };
    if (!(await ensureTables())) return { ok: false, error: 'brain tables not ready' };

    const club = await prisma.club.findUnique({ where: { id: clubId } });
    if (!club) return { ok: false, error: 'club not found' };

    const brain = await getOrCreateBrainForClub(clubId);
    if (!brain) return { ok: false, error: 'could not create brain' };

    // Actualizar identityPrompt con la info más fresca (sin pisar customizaciones
    // manuales: si el admin editó manualmente, marca metadata.identityPromptOverridden).
    const md = brain.metadata || {};
    if (!md.identityPromptOverridden) {
        await prisma.brain.update({
            where: { id: brain.id },
            data: { identityPrompt: buildIdentityPromptFromClub(club) },
        });
    }

    // Extraer Settings y ContentSections relevantes
    const [settings, sections] = await Promise.all([
        prisma.setting.findMany({
            where: {
                clubId,
                key: { in: [
                    'mission', 'vision', 'values', 'brand_voice', 'brand_tone',
                    'hero_title', 'hero_subtitle', 'about_text', 'cta_text',
                    'primary_color', 'secondary_color', 'social_links',
                    'onboarding_step', 'onboarding_completed',
                ] },
            },
        }),
        prisma.contentSection.findMany({
            where: { clubId, page: { in: ['home', 'about', 'identity'] } },
        }),
    ]);

    const sMap = Object.fromEntries(settings.map(s => [s.key, s.value]));
    const sectMap = Object.fromEntries(sections.map(s => [`${s.page}:${s.section}`, s.content]));

    // Construir memorias NOTE clasificadas
    const memories = [];

    if (club.description) {
        memories.push({
            title: `Descripción institucional — ${club.name}`,
            content: club.description,
            sourceId: `onboarding:description:${clubId}`,
        });
    }

    const mission = sMap.mission || sectMap['about:mission'];
    if (mission) {
        memories.push({
            title: `Misión — ${club.name}`,
            content: mission,
            sourceId: `onboarding:mission:${clubId}`,
        });
    }

    const vision = sMap.vision || sectMap['about:vision'];
    if (vision) {
        memories.push({
            title: `Visión — ${club.name}`,
            content: vision,
            sourceId: `onboarding:vision:${clubId}`,
        });
    }

    const values = sMap.values || sectMap['about:values'];
    if (values) {
        memories.push({
            title: `Valores institucionales — ${club.name}`,
            content: values,
            sourceId: `onboarding:values:${clubId}`,
        });
    }

    // Hero content (lo que el sitio le dice al mundo en la home)
    const heroParts = [sMap.hero_title, sMap.hero_subtitle, sMap.about_text, sMap.cta_text]
        .filter(Boolean);
    if (heroParts.length > 0) {
        memories.push({
            title: `Mensaje principal del sitio — ${club.name}`,
            content: heroParts.join('\n\n'),
            sourceId: `onboarding:hero:${clubId}`,
        });
    }

    // Brand voice/tone (si lo definieron)
    const voiceParts = [
        sMap.brand_voice ? `Voz: ${sMap.brand_voice}` : null,
        sMap.brand_tone  ? `Tono: ${sMap.brand_tone}`  : null,
    ].filter(Boolean);
    if (voiceParts.length > 0) {
        memories.push({
            title: `Identidad de marca — ${club.name}`,
            content: voiceParts.join('\n'),
            sourceId: `onboarding:brand:${clubId}`,
        });
    }

    // Contacto + ubicación
    const contactParts = [
        club.email   ? `Email: ${club.email}`     : null,
        club.phone   ? `Teléfono: ${club.phone}`  : null,
        club.address ? `Dirección: ${club.address}` : null,
        club.city || club.country ? `Ubicación: ${[club.city, club.country].filter(Boolean).join(', ')}` : null,
    ].filter(Boolean);
    if (contactParts.length > 0) {
        memories.push({
            title: `Información de contacto — ${club.name}`,
            content: contactParts.join('\n'),
            sourceId: `onboarding:contact:${clubId}`,
        });
    }

    // Redes sociales (vienen como JSON string en settings.social_links)
    if (sMap.social_links) {
        try {
            const links = JSON.parse(sMap.social_links);
            if (Array.isArray(links) && links.length > 0) {
                memories.push({
                    title: `Presencia digital — ${club.name}`,
                    content: links.map(l => `${l.platform}: ${l.url}`).join('\n'),
                    sourceId: `onboarding:social:${clubId}`,
                });
            }
        } catch { /* ignore */ }
    }

    // Ingestar todo
    let ingested = 0;
    for (const mem of memories) {
        try {
            await ingestMemory({
                clubId,
                kind: 'KNOWLEDGE',
                sourceType: 'Onboarding',
                sourceId: mem.sourceId,
                title: mem.title,
                content: mem.content,
                metadata: { from: 'onboarding', clubName: club.name },
            });
            ingested++;
        } catch (err) {
            console.warn('[brainService] sync onboarding:', err.message);
        }
    }

    return {
        ok: true,
        brainId: brain.id,
        ingested,
        total: memories.length,
        identityRefreshed: !md.identityPromptOverridden,
    };
}

// ─── Ingestión de memorias ───────────────────────────────────────────────────

// Crea memorias en: brain del sitio, brain del distrito (si aplica) y master.
// Todas comparten el mismo (sourceType, sourceId) para idempotencia.
// kind ∈ POST | PROJECT | EVENT | KNOWLEDGE | MEMBER | DOCUMENT | PUBLICATION | NOTE.
export async function ingestMemory({
    clubId,
    districtId,
    kind,
    sourceId,
    sourceType,
    title,
    content,
    metadata = {},
}) {
    if (!sourceId || !sourceType) {
        console.warn('[brainService] ingestMemory: sourceId & sourceType required');
        return null;
    }
    if (!(await ensureTables())) return null;
    const safeTitle = (title || '').toString().slice(0, 300) || '(sin título)';
    const safeContent = truncate(content || '', 12000);
    const embedInput = `${safeTitle}\n\n${safeContent}`.trim();

    // Resolver targets
    const master = await getOrCreateMasterBrain();
    let site = null;
    let district = null;
    if (clubId) {
        const resolved = await resolveBrainsForClub(clubId);
        site = resolved.site;
        district = resolved.district;
    } else if (districtId) {
        district = await getOrCreateBrainForDistrict(districtId);
    }

    // Una sola llamada a embed, todos los brains comparten el vector.
    const embedding = await embedText(embedInput);

    const targets = [master, site, district].filter(Boolean);
    const results = [];

    for (const brain of targets) {
        try {
            const row = await prisma.brainMemory.upsert({
                where: {
                    brainId_sourceType_sourceId: {
                        brainId: brain.id,
                        sourceType,
                        sourceId,
                    },
                },
                update: {
                    title: safeTitle,
                    content: safeContent,
                    embedding,
                    metadata,
                    clubId: clubId || null,
                    districtId: districtId || null,
                    kind,
                    updatedAt: new Date(),
                },
                create: {
                    brainId: brain.id,
                    kind,
                    sourceType,
                    sourceId,
                    title: safeTitle,
                    content: safeContent,
                    embedding,
                    metadata,
                    clubId: clubId || null,
                    districtId: districtId || null,
                },
            });
            results.push(row);
        } catch (err) {
            console.warn(`[brainService] ingest fail brain=${brain.id}:`, err.message);
        }
    }

    // Refrescar memoryCount de cada brain afectado (no crítico — en background).
    Promise.all(targets.map(b =>
        prisma.brainMemory.count({ where: { brainId: b.id } }).then(count =>
            prisma.brain.update({ where: { id: b.id }, data: { memoryCount: count } })
        ).catch(() => {})
    )).catch(() => {});

    // v4.375: Activity log (fire-and-forget, lazy import para evitar ciclo)
    if (results.length > 0) {
        import('./brainAgent.js').then(({ logActivity }) => {
            for (const brain of targets) {
                logActivity({
                    brainId: brain.id,
                    kind: 'memory_ingested',
                    title: `Memoria ${kind}: ${safeTitle.slice(0, 80)}`,
                    detail: `sourceType=${sourceType} · embeddings=${embedding.length}d`,
                    metadata: { sourceType, sourceId, kind },
                });
            }
        }).catch(() => {});
    }

    return { embeddingLength: embedding.length, written: results.length };
}

// Helper non-blocking — para enganchar desde controllers sin esperar.
// El caller invoca el original, devuelve la response al cliente y dispara
// ingestMemorySafe en paralelo. Si falla, solo logueamos.
export function ingestMemorySafe(payload) {
    return ingestMemory(payload).catch(err =>
        console.warn('[brainService] ingestMemorySafe error:', err.message)
    );
}

// ─── Búsqueda semántica ──────────────────────────────────────────────────────

// Busca top-k memorias dentro de un brain (o todos si brainId == null).
// Devuelve [{ memory, score }] ordenado por score desc.
export async function searchMemories({ brainId, query, k = 8, kind }) {
    if (!(await ensureTables())) return [];
    const qVec = await embedText(query);
    if (qVec.length === 0) {
        // Sin embedding viable, fallback a búsqueda por LIKE simple.
        const rows = await prisma.brainMemory.findMany({
            where: {
                ...(brainId ? { brainId } : {}),
                ...(kind ? { kind } : {}),
                OR: [
                    { title:   { contains: query, mode: 'insensitive' } },
                    { content: { contains: query, mode: 'insensitive' } },
                ],
            },
            take: k,
            orderBy: { createdAt: 'desc' },
        });
        return rows.map(m => ({ memory: m, score: 0 }));
    }

    // KNN en JS: traemos las memorias (filtradas por brainId si vino) y
    // ordenamos por cosine. Para volúmenes <50k esto es rápido.
    const memories = await prisma.brainMemory.findMany({
        where: {
            ...(brainId ? { brainId } : {}),
            ...(kind ? { kind } : {}),
        },
        // Si crece mucho, podemos paginar y batchear. Por ahora pull-all.
        take: 5000,
        orderBy: { updatedAt: 'desc' },
    });

    const scored = memories
        .map(m => ({ memory: m, score: cosine(qVec, m.embedding || []) }))
        .filter(r => r.score > 0)
        .sort((a, b) => b.score - a.score)
        .slice(0, k);

    return scored;
}

// ─── Relaciones entre brains ─────────────────────────────────────────────────

export async function relateBrains({ fromBrainId, toBrainId, kind, weight = 1.0, source = 'auto', metadata = {} }) {
    if (!fromBrainId || !toBrainId || fromBrainId === toBrainId) return null;
    try {
        return await prisma.brainRelation.upsert({
            where: {
                fromBrainId_toBrainId_kind: { fromBrainId, toBrainId, kind },
            },
            update: { weight, source, metadata },
            create: { fromBrainId, toBrainId, kind, weight, source, metadata },
        });
    } catch (err) {
        console.warn('[brainService] relateBrains error:', err.message);
        return null;
    }
}

// Construye las relaciones deterministas iniciales:
//   MASTER -[PARENT_OF]-> *
//   Club   -[MEMBER_OF]-> District
//   SponsoredClub.club -[PARTICIPATES_IN]-> SponsoredClub.parentClub
export async function bootstrapRelations() {
    const master = await getOrCreateMasterBrain();
    let edges = 0;

    // 1. MASTER → todos los brains
    const allBrains = await prisma.brain.findMany({ where: { isMaster: false } });
    for (const b of allBrains) {
        const r = await relateBrains({
            fromBrainId: master.id,
            toBrainId: b.id,
            kind: 'PARENT_OF',
            source: 'auto',
        });
        if (r) edges++;
    }

    // 2. Club → District (MEMBER_OF) cuando Club.districtId existe
    const clubsWithDistrict = await prisma.club.findMany({
        where: { districtId: { not: null } },
        select: { id: true, districtId: true },
    });
    for (const c of clubsWithDistrict) {
        const [clubBrain, districtBrain] = await Promise.all([
            getOrCreateBrainForClub(c.id),
            getOrCreateBrainForDistrict(c.districtId),
        ]);
        if (clubBrain && districtBrain) {
            const r = await relateBrains({
                fromBrainId: clubBrain.id,
                toBrainId: districtBrain.id,
                kind: 'MEMBER_OF',
                source: 'auto',
            });
            if (r) edges++;
        }
    }

    // SponsoredClub no es club-a-club: es un sub-grupo (rotaract/interact) que
    // vive dentro del club padrino. No genera relación entre cerebros.
    // SIMILAR_TO (clubes con proyectos parecidos) llega en v4.352 con vector
    // matching cross-brain.

    return { master: master.id, brains: allBrains.length, edges };
}

// ─── Backfill / reindex paginado (v4.354) ────────────────────────────────────
// reindexBatch procesa UN solo lote pequeño con cursor — diseñado para que el
// frontend llame en loop hasta done=true. Cada llamada es < 30s (default), muy
// por debajo del límite Vercel de 120s, así nunca hay timeout HTTP.
//
// Cursor: { phase: 'POST'|'PROJECT'|'EVENT'|'KNOWLEDGE'|'BOOTSTRAP'|'DONE', offset: number }

const PHASES = ['POST', 'PROJECT', 'EVENT', 'KNOWLEDGE', 'BOOTSTRAP', 'DONE'];

async function fetchSourcesForPhase(phase, offset, batchSize) {
    if (phase === 'POST') {
        return prisma.post.findMany({
            where: { clubId: { not: null } },
            select: { id: true, title: true, content: true, clubId: true, category: true, published: true, createdAt: true },
            orderBy: { createdAt: 'asc' },
            skip: offset,
            take: batchSize,
        });
    }
    if (phase === 'PROJECT') {
        return prisma.project.findMany({
            where: { deletedAt: null, clubId: { not: null } },
            select: { id: true, title: true, description: true, clubId: true, category: true, status: true, impacto: true, ubicacion: true, beneficiarios: true, createdAt: true },
            orderBy: { createdAt: 'asc' },
            skip: offset,
            take: batchSize,
        });
    }
    if (phase === 'EVENT') {
        return prisma.calendarEvent.findMany({
            select: { id: true, title: true, description: true, htmlContent: true, clubId: true, type: true, startDate: true, endDate: true, location: true },
            orderBy: { startDate: 'asc' },
            skip: offset,
            take: batchSize,
        });
    }
    if (phase === 'KNOWLEDGE') {
        return prisma.knowledgeSource.findMany({
            orderBy: { id: 'asc' },
            skip: offset,
            take: batchSize,
        });
    }
    return [];
}

async function totalForPhase(phase) {
    if (phase === 'POST')      return prisma.post.count({ where: { clubId: { not: null } } });
    if (phase === 'PROJECT')   return prisma.project.count({ where: { deletedAt: null, clubId: { not: null } } });
    if (phase === 'EVENT')     return prisma.calendarEvent.count();
    if (phase === 'KNOWLEDGE') return prisma.knowledgeSource.count();
    return 0;
}

function ingestArgsFor(phase, row) {
    if (phase === 'POST') return {
        clubId: row.clubId, kind: 'POST', sourceType: 'Post', sourceId: row.id,
        title: row.title || '(sin título)', content: row.content || '',
        metadata: { category: row.category, published: row.published, createdAt: row.createdAt },
    };
    if (phase === 'PROJECT') return {
        clubId: row.clubId, kind: 'PROJECT', sourceType: 'Project', sourceId: row.id,
        title: row.title || '(sin título)',
        content: [row.description, row.impacto].filter(Boolean).join('\n\n'),
        metadata: { category: row.category, status: row.status, ubicacion: row.ubicacion, beneficiarios: row.beneficiarios },
    };
    if (phase === 'EVENT') return {
        clubId: row.clubId, kind: 'EVENT', sourceType: 'CalendarEvent', sourceId: row.id,
        title: row.title || '(sin título)',
        content: [row.description, row.htmlContent].filter(Boolean).join('\n\n').replace(/<[^>]+>/g, ' '),
        metadata: { type: row.type, startDate: row.startDate, endDate: row.endDate, location: row.location },
    };
    if (phase === 'KNOWLEDGE') return {
        clubId: row.clubId, kind: 'KNOWLEDGE', sourceType: 'KnowledgeSource', sourceId: row.id,
        title: row.title || '(sin título)', content: row.content || '',
        metadata: { type: row.type, fileUrl: row.fileUrl, isGlobal: !row.clubId },
    };
    return null;
}

export async function reindexBatch({ cursor, batchSize = 15, timeBudgetMs = 25_000, skipExisting = true } = {}) {
    if (!(await ensureTables())) {
        return {
            error: 'BRAINS_NOT_MIGRATED',
            message: 'Las tablas Brain no existen. Correr `prisma db push` antes de re-indexar.',
        };
    }

    let phase = cursor?.phase || 'POST';
    let offset = cursor?.offset || 0;
    const deadline = Date.now() + timeBudgetMs;
    const batchStats = { processed: 0, skipped: 0, errors: 0, firstError: null, lastError: null };

    // Pre-cargar sourceIds ya existentes para esta fase (rápido).
    let existing = new Set();
    if (skipExisting && phase !== 'BOOTSTRAP' && phase !== 'DONE') {
        const sourceType = phase === 'POST' ? 'Post' : phase === 'PROJECT' ? 'Project' : phase === 'EVENT' ? 'CalendarEvent' : 'KnowledgeSource';
        const rows = await prisma.brainMemory.findMany({
            where: { sourceType },
            select: { sourceId: true },
        });
        existing = new Set(rows.map(r => r.sourceId));
    }

    const captureErr = (where, err) => {
        batchStats.errors++;
        const msg = `${where}: ${err?.message || String(err)}`.slice(0, 300);
        if (!batchStats.firstError) batchStats.firstError = msg;
        batchStats.lastError = msg;
    };

    // Procesar la fase actual
    while (phase !== 'DONE' && phase !== 'BOOTSTRAP') {
        if (Date.now() >= deadline) {
            return { cursor: { phase, offset }, stats: batchStats, done: false, phase };
        }

        const rows = await fetchSourcesForPhase(phase, offset, batchSize);
        if (rows.length === 0) {
            // Fase agotada → pasar a la siguiente
            const idx = PHASES.indexOf(phase);
            phase = PHASES[idx + 1];
            offset = 0;
            continue;
        }

        for (const row of rows) {
            if (Date.now() >= deadline) {
                return { cursor: { phase, offset }, stats: batchStats, done: false, phase };
            }
            offset++;
            if (existing.has(row.id)) {
                batchStats.skipped++;
                continue;
            }
            try {
                await ingestMemory(ingestArgsFor(phase, row));
                batchStats.processed++;
            } catch (err) {
                captureErr(`${phase} ${row.id}`, err);
            }
        }
    }

    // BOOTSTRAP: relaciones deterministas — rápido.
    if (phase === 'BOOTSTRAP') {
        try {
            const rel = await bootstrapRelations();
            return {
                cursor: { phase: 'DONE', offset: 0 },
                stats: batchStats,
                relations: rel,
                done: true,
                phase: 'DONE',
            };
        } catch (err) {
            captureErr('bootstrapRelations', err);
            return { cursor: { phase: 'DONE', offset: 0 }, stats: batchStats, done: true, phase: 'DONE' };
        }
    }

    return { cursor: { phase: 'DONE', offset: 0 }, stats: batchStats, done: true, phase: 'DONE' };
}

// Helper para que el frontend sepa cuánto falta y muestre progress.
export async function reindexProgress() {
    if (!(await ensureTables())) return null;

    const [posts, projects, events, knowledge, indexed] = await Promise.all([
        prisma.post.count({ where: { clubId: { not: null } } }),
        prisma.project.count({ where: { deletedAt: null, clubId: { not: null } } }),
        prisma.calendarEvent.count(),
        prisma.knowledgeSource.count(),
        prisma.brainMemory.groupBy({
            by: ['sourceType'],
            _count: { sourceType: true },
            where: { sourceType: { in: ['Post', 'Project', 'CalendarEvent', 'KnowledgeSource'] } },
        }),
    ]);

    const indexedMap = Object.fromEntries(indexed.map(r => [r.sourceType, r._count.sourceType]));
    return {
        totals: { posts, projects, events, knowledge },
        indexed: {
            posts: indexedMap.Post || 0,
            projects: indexedMap.Project || 0,
            events: indexedMap.CalendarEvent || 0,
            knowledge: indexedMap.KnowledgeSource || 0,
        },
        grandTotal: posts + projects + events + knowledge,
        grandIndexed: (indexedMap.Post || 0) + (indexedMap.Project || 0) + (indexedMap.CalendarEvent || 0) + (indexedMap.KnowledgeSource || 0),
    };
}

// ─── Backfill / reindex ──────────────────────────────────────────────────────

// Re-ingesta todo el contenido existente como memorias. Idempotente gracias al
// upsert sobre (brainId, sourceType, sourceId).
//
// Resiliencia (v4.353):
//   - Cada error individual se captura con detalle (primer error preservado
//     en `firstError` para mostrar al user el motivo concreto del fallo).
//   - Soporta `timeBudgetMs` (default 90s, < Vercel maxDuration de 120s) para
//     cortar el batch antes del timeout HTTP y devolver progreso parcial.
//   - Cuando se corta por tiempo, `truncated: true` y el caller puede llamar
//     /reindex de nuevo para continuar (los items ya procesados se saltean por
//     el upsert idempotente y la skip-list de sourceId existentes).
//   - Soporta `skipExisting: true` para saltear memorias ya indexadas — útil
//     cuando se llama repetidamente para continuar un reindex incompleto.
export async function reindexAll({ onlyKind, timeBudgetMs = 90_000, skipExisting = false } = {}) {
    const stats = {
        posts: 0, projects: 0, events: 0, knowledge: 0,
        skipped: 0, errors: 0,
        firstError: null, lastError: null,
    };
    const deadline = Date.now() + timeBudgetMs;
    const want = (k) => !onlyKind || onlyKind === k;

    const captureErr = (where, err) => {
        stats.errors++;
        const msg = `${where}: ${err?.message || String(err)}`.slice(0, 400);
        if (!stats.firstError) stats.firstError = msg;
        stats.lastError = msg;
    };

    // Pre-cargar sourceIds ya existentes por tipo para skip rápido
    let existing = null;
    if (skipExisting) {
        const rows = await prisma.brainMemory.findMany({
            where: { sourceType: { in: ['Post', 'Project', 'CalendarEvent', 'KnowledgeSource'] } },
            select: { sourceType: true, sourceId: true },
        });
        existing = new Set(rows.map(r => `${r.sourceType}:${r.sourceId}`));
    }
    const shouldSkip = (type, id) => existing && existing.has(`${type}:${id}`);

    if (want('POST') && Date.now() < deadline) {
        const posts = await prisma.post.findMany({
            where: { clubId: { not: null } },
            select: { id: true, title: true, content: true, clubId: true, category: true, published: true, createdAt: true },
        });
        for (const p of posts) {
            if (Date.now() >= deadline) return { stats, truncated: true };
            if (shouldSkip('Post', p.id)) { stats.skipped++; continue; }
            try {
                await ingestMemory({
                    clubId: p.clubId,
                    kind: 'POST',
                    sourceType: 'Post',
                    sourceId: p.id,
                    title: p.title || '(sin título)',
                    content: p.content || '',
                    metadata: { category: p.category, published: p.published, createdAt: p.createdAt },
                });
                stats.posts++;
            } catch (err) { captureErr(`Post ${p.id}`, err); }
        }
    }

    if (want('PROJECT') && Date.now() < deadline) {
        const projects = await prisma.project.findMany({
            where: { deletedAt: null, clubId: { not: null } },
            select: { id: true, title: true, description: true, clubId: true, category: true, status: true, impacto: true, ubicacion: true, beneficiarios: true, createdAt: true },
        });
        for (const p of projects) {
            if (Date.now() >= deadline) return { stats, truncated: true };
            if (shouldSkip('Project', p.id)) { stats.skipped++; continue; }
            try {
                await ingestMemory({
                    clubId: p.clubId,
                    kind: 'PROJECT',
                    sourceType: 'Project',
                    sourceId: p.id,
                    title: p.title || '(sin título)',
                    content: [p.description, p.impacto].filter(Boolean).join('\n\n'),
                    metadata: { category: p.category, status: p.status, ubicacion: p.ubicacion, beneficiarios: p.beneficiarios },
                });
                stats.projects++;
            } catch (err) { captureErr(`Project ${p.id}`, err); }
        }
    }

    if (want('EVENT') && Date.now() < deadline) {
        const events = await prisma.calendarEvent.findMany({
            select: { id: true, title: true, description: true, htmlContent: true, clubId: true, type: true, startDate: true, endDate: true, location: true },
        });
        for (const e of events) {
            if (Date.now() >= deadline) return { stats, truncated: true };
            if (shouldSkip('CalendarEvent', e.id)) { stats.skipped++; continue; }
            try {
                await ingestMemory({
                    clubId: e.clubId,
                    kind: 'EVENT',
                    sourceType: 'CalendarEvent',
                    sourceId: e.id,
                    title: e.title || '(sin título)',
                    content: [e.description, e.htmlContent].filter(Boolean).join('\n\n').replace(/<[^>]+>/g, ' '),
                    metadata: { type: e.type, startDate: e.startDate, endDate: e.endDate, location: e.location },
                });
                stats.events++;
            } catch (err) { captureErr(`Event ${e.id}`, err); }
        }
    }

    if (want('KNOWLEDGE') && Date.now() < deadline) {
        const sources = await prisma.knowledgeSource.findMany();
        for (const k of sources) {
            if (Date.now() >= deadline) return { stats, truncated: true };
            if (shouldSkip('KnowledgeSource', k.id)) { stats.skipped++; continue; }
            try {
                await ingestMemory({
                    clubId: k.clubId,
                    kind: 'KNOWLEDGE',
                    sourceType: 'KnowledgeSource',
                    sourceId: k.id,
                    title: k.title || '(sin título)',
                    content: k.content || '',
                    metadata: { type: k.type, fileUrl: k.fileUrl, isGlobal: !k.clubId },
                });
                stats.knowledge++;
            } catch (err) { captureErr(`KnowledgeSource ${k.id}`, err); }
        }
    }

    // Recalcular relaciones al final (solo si terminamos a tiempo).
    let rel = null;
    if (Date.now() < deadline) {
        try {
            rel = await bootstrapRelations();
        } catch (err) {
            captureErr('bootstrapRelations', err);
        }
    }

    return { stats, relations: rel, truncated: false };
}

// ─── Listado / detalle ───────────────────────────────────────────────────────

export async function listBrains() {
    if (!(await ensureTables())) return [];
    const brains = await prisma.brain.findMany({
        orderBy: [{ isMaster: 'desc' }, { memoryCount: 'desc' }, { name: 'asc' }],
        include: {
            club:     { select: { id: true, name: true, subdomain: true, city: true, country: true, category: true, type: true, logo: true } },
            district: { select: { id: true, name: true, number: true, subdomain: true } },
            _count:   { select: { memories: true, outgoingRelations: true, incomingRelations: true } },
        },
    });
    return brains;
}

export async function getBrainDetail(brainId) {
    if (!(await ensureTables())) return null;
    return prisma.brain.findUnique({
        where: { id: brainId },
        include: {
            club:     { select: { id: true, name: true, subdomain: true, city: true, country: true, category: true } },
            district: { select: { id: true, name: true, number: true, subdomain: true } },
            outgoingRelations: { include: { toBrain:   { select: { id: true, name: true, kind: true } } } },
            incomingRelations: { include: { fromBrain: { select: { id: true, name: true, kind: true } } } },
        },
    });
}

export async function listRecentMemories({ brainId, limit = 20, kind }) {
    if (!(await ensureTables())) return [];
    return prisma.brainMemory.findMany({
        where: { ...(brainId ? { brainId } : {}), ...(kind ? { kind } : {}) },
        orderBy: { updatedAt: 'desc' },
        take: limit,
        select: {
            id: true, brainId: true, kind: true, sourceId: true, sourceType: true,
            title: true, content: true, clubId: true, createdAt: true, updatedAt: true,
        },
    });
}
