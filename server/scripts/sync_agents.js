import fs from 'fs';
import path from 'path';
import url from 'url';
import dotenv from 'dotenv';
import db from '../lib/db.js';

dotenv.config({ path: path.join(process.cwd(), '.env') });

const __filename = url.fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const skillsDir = path.join(__dirname, '../../.agent/skills');

function getColor(str) {
    let hash = 0;
    for (let i = 0; i < str.length; i++) hash = str.charCodeAt(i) + ((hash << 5) - hash);
    const color = Math.floor(Math.abs(hash) * 16777215 % 16777215).toString(16);
    return '#' + color.padStart(6, '0');
}

async function syncSkills() {
    console.log('--- Starting Agent Sync ---');
    
    if (!fs.existsSync(skillsDir)) {
        console.error('Directory .agent/skills not found at:', skillsDir);
        process.exit(1);
    }
    
    const folders = fs.readdirSync(skillsDir).filter(f => fs.statSync(path.join(skillsDir, f)).isDirectory());
    
    let successCount = 0;
    
    for (const folder of folders) {
        const skillPath = path.join(skillsDir, folder, 'SKILL.md');
        if (!fs.existsSync(skillPath)) continue;
        
        const content = fs.readFileSync(skillPath, 'utf8');
        
        let name = folder;
        let description = 'Especialista IA';
        let capabilities = [];
        let systemPrompt = content;
        
        const frontmatterMatch = content.match(/^---\n([\s\S]*?)\n---/);
        if (frontmatterMatch) {
            const yaml = frontmatterMatch[1];
            const nameMatch = yaml.match(/name:\s*"?([^"\n]+)"?/);
            if (nameMatch) name = nameMatch[1];
            
            const descMatch = yaml.match(/description:\s*"?([^"\n]+)"?/);
            if (descMatch) description = descMatch[1];
            
            const capsMatch = yaml.match(/capabilities:\s*\[(.*?)\]/);
            if (capsMatch && capsMatch[1]) {
                const rawCaps = capsMatch[1].replace(/['"]/g, '');
                if (rawCaps.trim()) {
                    capabilities = rawCaps.split(',').map(c => c.trim()).filter(Boolean);
                }
            }
            
            systemPrompt = content.substring(frontmatterMatch[0].length).trim();
        }
        
        const finalName = name;
        const avatarSeed = folder;
        const avatarColor = getColor(folder);
        const isMarketing = /seo|ad|automation|content|email|marketing|social|copywriting/i.test(folder);
        const category = isMarketing ? 'difusión' : 'tecnología';
        const role = 'AI Specialist';
        const greeting = '¡Hola! Soy el agente experto en ' + name + '. ¿En qué te puedo apoyar hoy dentro del proyecto Rotary?';
        
        try {
            const existing = await db.query(
                `SELECT id FROM "Agent" WHERE name = $1 AND "clubId" IS NULL LIMIT 1`,
                [finalName]
            );

            if (existing.rows.length > 0) {
                await db.query(
                    `UPDATE "Agent"
                     SET role = $1, description = $2, "systemPrompt" = $3,
                         greeting = $4, "updatedAt" = NOW(), active = true,
                         "avatarColor" = $5, "avatarSeed" = $6, category = $7,
                         capabilities = $8, "aiModel" = 'gemini-2.5-flash'
                     WHERE name = $9 AND "clubId" IS NULL`,
                    [role, description, systemPrompt, greeting, avatarColor, avatarSeed, category, capabilities, finalName]
                );
            } else {
                await db.query(
                    `INSERT INTO "Agent" (name, role, category, description, "systemPrompt", "aiModel", "avatarSeed", "avatarColor", active, greeting, capabilities, "clubId")
                     VALUES ($1, $2, $3, $4, $5, 'gemini-2.5-flash', $6, $7, true, $8, $9, NULL)`,
                    [finalName, role, category, description, systemPrompt, avatarSeed, avatarColor, greeting, capabilities]
                );
            }
            successCount++;
        } catch (err) {
            console.error('Error saving ' + finalName + ':', err.message);
        }
    }
    
    console.log('Successfully synced ' + successCount + ' skills into Postgres as Global Agents.');
    process.exit(0);
}

syncSkills();
