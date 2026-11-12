#!/usr/bin/env node
// ════════════════════════════════════════════════════════════════════
// Empaqueta TODOS los agentes de The Agency (msitarzewski/agency-agents) en
// `server/lib/agencyAgentsBundle.js` (v4.1323.0).
//
//   node scripts/bundle-agency-agents.mjs /ruta/a/un/clon/de/agency-agents
//
// El clon tiene que estar EXACTAMENTE en el commit fijado en
// `AGENCY_SOURCE.ref` (agentRegistrySpec.js): lo que se carga hoy es lo mismo
// que se carga mañana. Las divisiones salen de `divisions.json` del propio
// repositorio (su fuente de verdad); un agente es un .md con frontmatter
// `name:` dentro de una división. Producción no descarga nada: lee el paquete.
// ════════════════════════════════════════════════════════════════════
import { readdirSync, readFileSync, writeFileSync, statSync, existsSync } from 'node:fs';
import { execFileSync } from 'node:child_process';

const REPO = new URL('..', import.meta.url).pathname.replace(/\/$/, '');
const OUT = `${REPO}/server/lib/agencyAgentsBundle.js`;
const { AGENCY_SOURCE, parseAgentMarkdown } = await import(`${REPO}/server/lib/agentRegistrySpec.js`);

const walk = (dir) => readdirSync(dir).sort().flatMap(f => {
    const p = `${dir}/${f}`;
    return statSync(p).isDirectory() ? walk(p) : (f.endsWith('.md') ? [p] : []);
});

export function collectAgency(src) {
    const head = execFileSync('git', ['-C', src, 'rev-parse', 'HEAD'], { encoding: 'utf8' }).trim();
    if (head !== AGENCY_SOURCE.ref) throw new Error(`El clon está en ${head}; el fijado es ${AGENCY_SOURCE.ref}. Haz checkout de ese commit (o actualiza AGENCY_SOURCE.ref a propósito).`);
    const { divisions } = JSON.parse(readFileSync(`${src}/divisions.json`, 'utf8'));
    const agents = [];
    for (const division of Object.keys(divisions).sort()) {
        if (!existsSync(`${src}/${division}`)) continue;
        for (const file of walk(`${src}/${division}`)) {
            const text = readFileSync(file, 'utf8');
            const { meta, body } = parseAgentMarkdown(text);
            if (!meta.name) continue; // sin frontmatter no es un agente
            agents.push({
                path: file.slice(src.length + 1),
                division,
                name: String(meta.name),
                description: String(meta.description || ''),
                color: meta.color ? String(meta.color) : null,
                emoji: meta.emoji ? String(meta.emoji) : null,
                vibe: meta.vibe ? String(meta.vibe) : null,
                body,
            });
        }
    }
    const divs = Object.fromEntries(Object.entries(divisions).map(([k, v]) => [k, { label: v.label, color: v.color || null }]));
    return { ref: head, divisions: divs, agents };
}

// Los prompts traen ejemplos de código («import { x } from './fixtures'»). Dentro
// de un string no importan nada, pero check-imports lee el texto y los toma por
// importaciones reales. «\u0069mport» es el MISMO texto para JavaScript.
export const safeJson = (v) => JSON.stringify(v).replace(/import/g, '\\u0069mport');

if (process.argv[1] && process.argv[1].endsWith('bundle-agency-agents.mjs')) {
    const src = process.argv[2];
    if (!src) { console.error('Uso: node scripts/bundle-agency-agents.mjs /ruta/al/clon/de/agency-agents'); process.exit(1); }
    const b = collectAgency(src.replace(/\/$/, ''));
    writeFileSync(OUT, `// GENERADO por scripts/bundle-agency-agents.mjs — no editar a mano.
// Los ${b.agents.length} agentes de ${AGENCY_SOURCE.owner}/${AGENCY_SOURCE.repo} @ ${b.ref} (licencia ${AGENCY_SOURCE.license}).
export const AGENCY_BUNDLE = ${safeJson(b)};
export default AGENCY_BUNDLE;
`);
    console.log(`[bundle-agency-agents] ${b.agents.length} agentes de ${Object.keys(b.divisions).length} divisiones → server/lib/agencyAgentsBundle.js`);
}
