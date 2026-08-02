#!/usr/bin/env node
// ════════════════════════════════════════════════════════════════════
// Barrera 3 — ningún hook fuera de sitio llega a producción
// v4.690.0
//
// Corre como `prebuild`, junto a la barrera que protege la base de datos.
//
// POR QUÉ EXISTE. En dos versiones seguidas se publicó una pantalla EN
// BLANCO, y las dos veces las comprobaciones que teníamos dijeron que todo
// estaba bien:
//
//   v4.688 — un identificador borrado que seguía usándose. Lo detecta
//            `npm run typecheck`; se había corrido el comando equivocado.
//   v4.690 — un `useMemo` escrito DESPUÉS de un `return` temprano. Este no lo
//            detecta ni el typecheck ni `vite build`: es código válido y
//            tipado correctamente. React cuenta los hooks entre renders y, al
//            encontrar uno de más, aborta el árbol entero. La pantalla se
//            queda en blanco justo al terminar de cargar, que es cuando el
//            `return` temprano deja de dispararse.
//
// La regla `react-hooks/rules-of-hooks` sí lo ve, y el proyecto ya tenía el
// complemento instalado — sólo que `npm run lint` reporta cientos de avisos
// heredados (imports sin usar, `any`) y nadie iba a leer el que importaba
// entre todos ellos. Este script mira ESA regla y ninguna otra: cero avisos
// de fondo, así que lo que salga aquí es un fallo real.
//
// NO es un `lint` general. Si alguna vez el proyecto queda limpio de avisos
// heredados, `npm run lint` puede entrar al prebuild y esto sobra.
//
// DEGRADA, NO BLOQUEA, si ESLint no se puede ejecutar: un despliegue no debe
// caerse porque falte una dependencia de desarrollo. Sólo se detiene ante una
// violación de verdad.
// ════════════════════════════════════════════════════════════════════
import { spawnSync } from 'node:child_process';

const RULE = 'react-hooks/rules-of-hooks';

const run = spawnSync(
    process.platform === 'win32' ? 'npx.cmd' : 'npx',
    ['eslint', 'src', '--format', 'json'],
    { encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 },
);

let report;
try {
    report = JSON.parse(run.stdout || '');
} catch {
    console.warn(`[check-hooks] ESLint no se pudo ejecutar; la comprobación se omite.`);
    if (run.stderr) console.warn(run.stderr.split('\n').slice(-5).join('\n'));
    process.exit(0);
}

const offenders = report.flatMap(file =>
    file.messages
        .filter(m => m.ruleId === RULE)
        .map(m => `  ${file.filePath.replace(process.cwd() + '/', '')}:${m.line}\n      ${m.message}`),
);

if (offenders.length) {
    console.error(`
╔════════════════════════════════════════════════════════════════════╗
║  DESPLIEGUE DETENIDO — una pantalla se quedaría en blanco          ║
╚════════════════════════════════════════════════════════════════════╝

${offenders.length} hook fuera de sitio:

${offenders.join('\n')}

React identifica cada hook por su ORDEN de llamada, no por su nombre. Si un
render llama a más hooks que el anterior —porque el de arriba salió por un
\`return\` temprano, o porque el hook vive dentro de un \`if\` o de un
callback—, React aborta el árbol completo y el usuario ve una PÁGINA EN
BLANCO. No es un aviso de estilo.

Cómo se corrige: todos los hooks van juntos, arriba del componente, antes de
cualquier \`return\`. Lo que era condicional se resuelve DENTRO del hook
(\`useEffect(() => { if (x) return; ... })\`) o moviendo el \`return\` debajo.

Para verlo en detalle:  npm run check:hooks
`);
    process.exit(1);
}

console.log('[check-hooks] Todos los hooks están en su sitio. OK.');
