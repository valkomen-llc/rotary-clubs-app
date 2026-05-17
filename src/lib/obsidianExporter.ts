import JSZip from 'jszip';

// ─────────────────────────────────────────────────────────────────────────────
// obsidianExporter — Convierte el payload del Cerebro en un Vault Obsidian
// listo para abrir. Estructura:
//   /README.md                          ← índice maestro + leyenda
//   /Brains/<nombre>.md                 ← una nota por brain (frontmatter + links)
//   /Memories/<brainSlug>/<id>.md       ← una nota por memoria
//   /Graph/relations.md                 ← listado de relaciones para Graph View
// ─────────────────────────────────────────────────────────────────────────────

export interface ExportBrain {
    id: string;
    name: string;
    kind: string;
    isMaster: boolean;
    identityPrompt: string | null;
    memoryCount: number;
    clubId: string | null;
    districtId: string | null;
    club?: { name?: string; subdomain?: string | null; city?: string | null; country?: string | null; category?: string; description?: string | null } | null;
    district?: { name?: string; number?: number | null; subdomain?: string | null } | null;
    createdAt: string;
}

export interface ExportMemory {
    id: string;
    brainId: string;
    kind: string;
    sourceType: string | null;
    sourceId: string | null;
    title: string;
    content: string;
    metadata: Record<string, unknown> | null;
    clubId: string | null;
    createdAt: string;
    updatedAt: string;
}

export interface ExportRelation {
    fromBrainId: string;
    toBrainId: string;
    kind: string;
    weight: number;
    source: string;
}

export interface ExportPayload {
    generatedAt: string;
    version: string;
    scope: string;
    brains: ExportBrain[];
    memories: ExportMemory[];
    relations: ExportRelation[];
}

const slugify = (s: string) =>
    s
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        .replace(/[^a-zA-Z0-9\-_ ]/g, '')
        .replace(/\s+/g, '-')
        .replace(/-+/g, '-')
        .replace(/^-|-$/g, '')
        .toLowerCase()
        .slice(0, 80) || 'sin-nombre';

const escapeYaml = (v: unknown): string => {
    if (v === null || v === undefined) return '""';
    if (typeof v === 'number' || typeof v === 'boolean') return String(v);
    const s = String(v).replace(/"/g, '\\"').replace(/\n/g, ' ');
    return `"${s}"`;
};

const yamlBlock = (kv: Record<string, unknown>): string => {
    const lines = Object.entries(kv).map(([k, v]) => {
        if (Array.isArray(v)) {
            const items = v.map(it => `  - ${escapeYaml(it)}`).join('\n');
            return `${k}:\n${items}`;
        }
        return `${k}: ${escapeYaml(v)}`;
    });
    return `---\n${lines.join('\n')}\n---\n`;
};

const wikilink = (target: string, alias?: string) =>
    alias ? `[[${target}|${alias}]]` : `[[${target}]]`;

const KIND_LABEL: Record<string, string> = {
    MASTER: 'Cerebro Maestro',
    CLUB: 'Club',
    DISTRICT: 'Distrito',
    ASSOCIATION: 'Asociación',
    PROGRAM: 'Programa',
    CONFERENCE: 'Conferencia',
    EVENT: 'Evento',
    PROJECT_FAIR: 'Feria de Proyectos',
    FOUNDATION: 'Fundación',
};

export async function buildObsidianVault(payload: ExportPayload): Promise<Blob> {
    const zip = new JSZip();
    const brainsById = new Map<string, ExportBrain>();
    payload.brains.forEach(b => brainsById.set(b.id, b));

    // Pre-compute slug for each brain
    const brainSlug = new Map<string, string>();
    payload.brains.forEach(b => brainSlug.set(b.id, slugify(b.name)));

    // ── /README.md ──────────────────────────────────────────────────────────
    const masterBrain = payload.brains.find(b => b.isMaster);
    const siteBrains = payload.brains.filter(b => !b.isMaster);

    const readme = `${yamlBlock({
        title: 'Club Platform · Knowledge Vault',
        generated: payload.generatedAt,
        version: payload.version,
        scope: payload.scope,
        brains: payload.brains.length,
        memories: payload.memories.length,
        relations: payload.relations.length,
        tags: ['club-platform', 'rotary', 'knowledge-vault'],
    })}
# 🧠 Club Platform · Knowledge Vault

Snapshot exportado del **Centro de Inteligencia** de Club Platform.
Generado: ${new Date(payload.generatedAt).toLocaleString()}

## Cómo usar este vault en Obsidian

1. Descomprimí el ZIP en una carpeta.
2. En Obsidian, **Open folder as vault** → elegí esta carpeta.
3. Abrí **Graph View** (icono de grafo) para ver las conexiones entre cerebros.
4. Cada cerebro tiene su propia nota en \`Brains/\`. Cada memoria está en \`Memories/\`.
5. Las **wikilinks** \`[[...]]\` te llevan entre notas. El graph view de Obsidian las muestra como aristas.

## Cerebro Maestro

${masterBrain ? `- ${wikilink(`Brains/${brainSlug.get(masterBrain.id)}`, masterBrain.name)}` : '_(sin master en este export)_'}

## Cerebros independientes (${siteBrains.length})

${siteBrains
    .sort((a, b) => (b.memoryCount || 0) - (a.memoryCount || 0))
    .map(b => `- ${wikilink(`Brains/${brainSlug.get(b.id)}`, b.name)} · _${KIND_LABEL[b.kind] || b.kind}_ · ${b.memoryCount} memorias`)
    .join('\n')}

## Estadísticas

| Métrica | Valor |
|---|---|
| Cerebros | ${payload.brains.length} |
| Memorias | ${payload.memories.length} |
| Relaciones | ${payload.relations.length} |
| Scope | ${payload.scope} |
| Generado | ${payload.generatedAt} |
| Versión | ${payload.version} |

## Leyenda de relaciones

- \`PARENT_OF\` — el cerebro maestro es padre de todos los demás.
- \`MEMBER_OF\` — un club pertenece a un distrito.
- \`COLLABORATES_WITH\` — colaboración explícita entre dos cerebros.
- \`SIMILAR_TO\` — afinidad semántica detectada (v4.353+).
- \`PARTICIPATES_IN\` — un sitio participa de un programa / conferencia / feria.

#index
`;
    zip.file('README.md', readme);

    // ── /Brains/<nombre>.md ─────────────────────────────────────────────────
    const brainsFolder = zip.folder('Brains')!;
    const memoriesByBrain = new Map<string, ExportMemory[]>();
    payload.memories.forEach(m => {
        if (!memoriesByBrain.has(m.brainId)) memoriesByBrain.set(m.brainId, []);
        memoriesByBrain.get(m.brainId)!.push(m);
    });

    for (const brain of payload.brains) {
        const slug = brainSlug.get(brain.id)!;
        const myMemories = memoriesByBrain.get(brain.id) || [];

        const outgoing = payload.relations.filter(r => r.fromBrainId === brain.id);
        const incoming = payload.relations.filter(r => r.toBrainId === brain.id);

        const fm = yamlBlock({
            id: brain.id,
            kind: brain.kind,
            kindLabel: KIND_LABEL[brain.kind] || brain.kind,
            isMaster: brain.isMaster,
            memoryCount: brain.memoryCount,
            createdAt: brain.createdAt,
            club: brain.club?.name || '',
            district: brain.district?.name || '',
            location: brain.club?.city && brain.club?.country ? `${brain.club.city}, ${brain.club.country}` : '',
            subdomain: brain.club?.subdomain || brain.district?.subdomain || '',
            tags: ['brain', `kind-${brain.kind.toLowerCase()}`, brain.isMaster ? 'master' : 'site'],
        });

        const md = `${fm}
# 🧠 ${brain.name}

**Tipo:** ${KIND_LABEL[brain.kind] || brain.kind}${brain.isMaster ? ' (Maestro)' : ''}
${brain.club?.city && brain.club?.country ? `**Ubicación:** ${brain.club.city}, ${brain.club.country}` : ''}
${brain.district?.number ? `**Distrito:** ${brain.district.number}` : ''}

## Identidad

${brain.identityPrompt || '_(sin identityPrompt definido)_'}

${brain.club?.description ? `## Descripción del sitio\n\n${brain.club.description}\n` : ''}

## Memorias indexadas (${myMemories.length})

${myMemories.slice(0, 50).map(m => {
    const link = wikilink(`Memories/${slug}/${memorySlug(m)}`, m.title);
    return `- _${m.kind}_ · ${link}`;
}).join('\n')}

${myMemories.length > 50 ? `\n_… y ${myMemories.length - 50} más. Ver carpeta \`Memories/${slug}/\`._` : ''}

## Relaciones

### Salientes
${outgoing.length === 0 ? '_(ninguna)_' : outgoing.map(r => {
    const other = brainsById.get(r.toBrainId);
    if (!other) return `- → ${r.kind} → \`${r.toBrainId}\``;
    return `- → **${r.kind}** → ${wikilink(`Brains/${brainSlug.get(other.id)}`, other.name)}`;
}).join('\n')}

### Entrantes
${incoming.length === 0 ? '_(ninguna)_' : incoming.map(r => {
    const other = brainsById.get(r.fromBrainId);
    if (!other) return `- ← ${r.kind} ← \`${r.fromBrainId}\``;
    return `- ← **${r.kind}** ← ${wikilink(`Brains/${brainSlug.get(other.id)}`, other.name)}`;
}).join('\n')}

---

[[README|← Volver al índice]]
`;
        brainsFolder.file(`${slug}.md`, md);
    }

    // ── /Memories/<brainSlug>/<id>.md ───────────────────────────────────────
    const memoriesFolder = zip.folder('Memories')!;
    for (const memory of payload.memories) {
        const brain = brainsById.get(memory.brainId);
        if (!brain) continue;
        const bSlug = brainSlug.get(brain.id)!;
        const folder = memoriesFolder.folder(bSlug) || memoriesFolder.folder(bSlug)!;

        const fm = yamlBlock({
            id: memory.id,
            brainId: memory.brainId,
            brainName: brain.name,
            kind: memory.kind,
            sourceType: memory.sourceType || '',
            sourceId: memory.sourceId || '',
            createdAt: memory.createdAt,
            updatedAt: memory.updatedAt,
            tags: ['memory', `kind-${memory.kind.toLowerCase()}`, memory.sourceType ? `source-${memory.sourceType.toLowerCase()}` : 'source-unknown'],
        });

        const md = `${fm}
# ${memory.title}

> _Memoria tipo **${memory.kind}** del cerebro ${wikilink(`Brains/${bSlug}`, brain.name)}_

${memory.content || '_(sin contenido)_'}

${memory.metadata && Object.keys(memory.metadata).length > 0 ? `\n## Metadata\n\n\`\`\`json\n${JSON.stringify(memory.metadata, null, 2)}\n\`\`\`\n` : ''}

---

**Fuente:** ${memory.sourceType || '?'} · **ID:** \`${memory.sourceId || '—'}\`
**Actualizada:** ${new Date(memory.updatedAt).toLocaleString()}

[[../../Brains/${bSlug}|← Cerebro de ${brain.name}]]
`;
        folder!.file(`${memorySlug(memory)}.md`, md);
    }

    // ── /Graph/relations.md ─────────────────────────────────────────────────
    const graphFolder = zip.folder('Graph')!;
    const relationsTable = payload.relations.map(r => {
        const from = brainsById.get(r.fromBrainId)?.name || r.fromBrainId;
        const to = brainsById.get(r.toBrainId)?.name || r.toBrainId;
        return `| ${from} | ${r.kind} | ${to} | ${r.weight.toFixed(2)} | ${r.source} |`;
    }).join('\n');

    graphFolder.file('relations.md', `${yamlBlock({
        title: 'Grafo de relaciones',
        relations: payload.relations.length,
        tags: ['graph', 'relations'],
    })}
# 🕸️ Grafo de Relaciones

| Origen | Tipo | Destino | Peso | Fuente |
|---|---|---|---:|---|
${relationsTable || '| _(sin relaciones todavía)_ |'}

[[../README|← Volver al índice]]
`);

    // Generate ZIP blob
    return zip.generateAsync({ type: 'blob', compression: 'DEFLATE', compressionOptions: { level: 6 } });
}

function memorySlug(m: ExportMemory): string {
    const base = slugify(m.title);
    // Append short id slice para evitar colisiones cuando varios títulos coinciden
    return `${base}-${m.id.slice(0, 6)}`;
}

export function triggerDownload(blob: Blob, filename: string) {
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    setTimeout(() => URL.revokeObjectURL(url), 1000);
}
