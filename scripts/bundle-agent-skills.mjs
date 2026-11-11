#!/usr/bin/env node
// ════════════════════════════════════════════════════════════════════
// Empaqueta `.agent/skills/*/SKILL.md` en `server/lib/agentSkillsBundle.js`
// (v4.1315.0). La función serverless de Vercel no lleva la carpeta `.agent`,
// así que el catálogo de habilidades del AI Agent Command Center viaja como
// módulo. `npm run bundle:agent-skills` lo regenera; `test:agents:registry`
// falla si el paquete y la carpeta no coinciden.
// ════════════════════════════════════════════════════════════════════
import { readdirSync, readFileSync, writeFileSync, statSync, existsSync } from 'node:fs';

const REPO = new URL('..', import.meta.url).pathname.replace(/\/$/, '');
const DIR = `${REPO}/.agent/skills`;
const OUT = `${REPO}/server/lib/agentSkillsBundle.js`;

export function collectSkills() {
    return readdirSync(DIR)
        .filter(f => statSync(`${DIR}/${f}`).isDirectory() && existsSync(`${DIR}/${f}/SKILL.md`))
        .sort()
        .map(folder => ({ key: folder, markdown: readFileSync(`${DIR}/${folder}/SKILL.md`, 'utf8') }));
}

if (process.argv[1] && process.argv[1].endsWith('bundle-agent-skills.mjs')) {
    const skills = collectSkills();
    const body = `// GENERADO por scripts/bundle-agent-skills.mjs — no editar a mano.
// Las habilidades de .agent/skills, para el catálogo del AI Agent Command Center.
export const AGENT_SKILLS_BUNDLE = ${JSON.stringify(skills, null, 1)};
export default AGENT_SKILLS_BUNDLE;
`;
    writeFileSync(OUT, body);
    console.log(`[bundle-agent-skills] ${skills.length} habilidades → server/lib/agentSkillsBundle.js`);
}
