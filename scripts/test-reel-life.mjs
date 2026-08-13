#!/usr/bin/env node
/**
 * ¿La escena vive o sólo se mueve la cámara? — Creador de Reels (v4.787)
 * ======================================================================
 *
 * El defecto que motiva estas pruebas llegó con tres clips de muestra: «no
 * genera videos, solo les pone movimiento o desplazamiento a las imágenes». Los
 * tres eran fotografías con el encuadre paseando por encima, y ninguna de las
 * mediciones del módulo lo veía por sí sola:
 *
 *   · `measureSceneLife` decía CUÁNTO cambió el clip, y un paneo cambia mucho.
 *   · `internalMotion` sí distingue cámara de escena, pero sólo existe cuando
 *     el modelo de visión contesta.
 *
 * Lo que se prueba aquí es la señal determinista que cierra ese hueco:
 * compensar un desplazamiento entero del encuadre y mirar qué queda. Si al
 * desplazar el último fotograma sobre el primero la diferencia casi desaparece,
 * dentro del cuadro no pasó nada.
 *
 * Se prueba el CRITERIO con imágenes sintéticas: sin base, sin credenciales y
 * sin red. Usa sharp, que es dependencia de producción; si no está, el bloque
 * se salta con aviso en vez de fallar.
 *
 *   npm run test:reels:life
 */

import { measureSceneLife, CAMERA_EXPLAINED_MIN } from '../server/lib/reelQuality.js';
import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import path from 'path';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, '..');

let pass = 0, fail = 0;
const check = (name, cond, extra = '') => {
    if (cond) { pass++; console.log(`  OK    ${name}`); }
    else { fail++; console.log(`  FALLA ${name}${extra ? ` — ${extra}` : ''}`); }
};

console.log('\n▸ El umbral está declarado, no escondido en una comparación');
check('CAMERA_EXPLAINED_MIN se exporta y es una fracción sensata',
    typeof CAMERA_EXPLAINED_MIN === 'number' && CAMERA_EXPLAINED_MIN > 0.5 && CAMERA_EXPLAINED_MIN < 1,
    String(CAMERA_EXPLAINED_MIN));

console.log('\n▸ Paneo, vida y congelación (imágenes sintéticas)');

let sharpOk = true;
try { await import('sharp'); } catch { sharpOk = false; }

if (!sharpOk) {
    console.log('  SALTA — sharp no está instalado en este entorno.');
} else {
    const sharp = (await import('sharp')).default;

    // Una textura con detalle en todas partes: sin ella, un desplazamiento no
    // se puede reconocer —una pared lisa desplazada es la misma pared lisa— y
    // la prueba mediría el ruido del codificador en vez del criterio.
    const W = 700, H = 1000;
    const lienzo = Buffer.alloc(W * H * 3);
    let semilla = 20260813;
    for (let i = 0; i < W * H; i++) {
        semilla = (semilla * 1103515245 + 12345) & 0x7fffffff;
        const v = 40 + (semilla % 200);
        lienzo[i * 3] = v;
        lienzo[i * 3 + 1] = (v * 3) % 256;
        lienzo[i * 3 + 2] = (v * 7) % 256;
    }
    // Se suaviza a propósito: una fotografía tiene detalle CONTINUO, no ruido
    // por píxel. Con ruido puro, desplazar media unidad de la imagen reducida
    // cambia todos los valores y la prueba mediría el aliasing del reescalado
    // en vez del criterio — sobre los tres clips reales del reporte, el
    // desplazamiento explica 0,900, 0,919 y 0,965.
    const base = sharp(
        await sharp(lienzo, { raw: { width: W, height: H, channels: 3 } }).blur(3).png().toBuffer()
    );

    // Una «ventana» de encuadre sobre el lienzo. Desplazarla es exactamente lo
    // que hace `renderStillMotion`: los píxeles no se reinterpretan, se mira
    // otro trozo de la misma fotografía.
    const VW = 540, VH = 900;
    const ventana = (left, top) => base.clone()
        .extract({ left, top, width: VW, height: VH })
        .png().toBuffer();

    const quieto = await ventana(80, 50);
    const desplazado = await ventana(80 + 30, 50);
    const desplazadoPoco = await ventana(80, 50 + 12);

    const paneo = await measureSceneLife([quieto, desplazado]);
    check('un paneo horizontal se reconoce como cámara, no como vida',
        paneo.cameraOnly === true,
        `explicado=${paneo.explainedByCamera} desplazamiento=${JSON.stringify(paneo.cameraShift)}`);
    check('...y el desplazamiento medido apunta en la dirección real',
        paneo.cameraShift?.dx !== 0 && paneo.cameraShift?.dy === 0,
        JSON.stringify(paneo.cameraShift));
    check('un paneo vertical también',
        (await measureSceneLife([quieto, desplazadoPoco])).cameraOnly === true);

    // Vida: el encuadre no se mueve y una parte de la escena sí. Es la señal
    // que NO se puede confundir con cámara, porque ningún desplazamiento del
    // cuadro entero la explica.
    const conCambio = await sharp(quieto)
        .composite([{
            input: {
                create: { width: 220, height: 300, channels: 3, background: { r: 250, g: 250, b: 250 } }
            },
            left: 150, top: 300
        }])
        .png().toBuffer();

    const vida = await measureSceneLife([quieto, conCambio]);
    check('algo que se mueve DENTRO del cuadro no se toma por cámara',
        vida.cameraOnly === false,
        `explicado=${vida.explainedByCamera}`);
    check('...y el cambio se mide igual', vida.score > 0, String(vida.score));

    // El caso mixto: la cámara se desplaza Y además pasa algo. Cuenta como
    // vida, porque lo que se castiga es la ausencia de escena, no la presencia
    // de cámara.
    const paneoConVida = await sharp(desplazado)
        .composite([{
            input: {
                create: { width: 260, height: 340, channels: 3, background: { r: 250, g: 250, b: 250 } }
            },
            left: 140, top: 280
        }])
        .png().toBuffer();
    check('paneo CON algo moviéndose dentro sigue contando como vida',
        (await measureSceneLife([quieto, paneoConVida])).cameraOnly === false);

    // Dos fotogramas idénticos son una escena congelada, y de eso ya se ocupa
    // `score`. Afirmar «es cámara» sobre ellos sería inventar un movimiento que
    // no existe: sin desplazamiento no hay desplazamiento que explicar.
    const congelado = await measureSceneLife([quieto, quieto]);
    check('dos fotogramas iguales dan cero de cambio', congelado.score === 0);
    check('...y NO se declaran «cámara»: no hay movimiento que explicar',
        congelado.cameraOnly === false);

    check('con un solo fotograma no se afirma nada',
        (await measureSceneLife([quieto])).score === null);
}

console.log('\n▸ El cableado: la medición tiene que DECIDIR (leído sobre los archivos)');

{
    const quality = readFileSync(path.join(root, 'server/lib/reelQuality.js'), 'utf8');
    check('un clip que sólo pasea el encuadre vale CERO de vida, diga lo que diga el modelo',
        /lifeScore: \(life\.score === 0 \|\| life\.cameraOnly\) \? 0/.test(quality));
    check('y la fuente del juicio queda en `frames`: es determinista, no una opinión',
        /lifeSource: \(life\.score === 0 \|\| life\.cameraOnly\) \? 'frames'/.test(quality));
    check('la ficha recibe POR QUÉ: qué parte del cambio explica el desplazamiento',
        /cameraExplained: life\.explainedByCamera/.test(quality));

    const controller = readFileSync(path.join(root, 'server/controllers/reelController.js'), 'utf8');
    check('una escena que sólo panea se REGENERA (entra por el rescate de congeladas)',
        /lifeSource === 'vision' \|\| sc\.fidelity\?\.lifeSource === 'frames'/.test(controller)
        || /lifeSource === 'frames'/.test(controller));
    check('la escena resuelta sin motor declara vida CERO en vez de callarla',
        /lifeScore: 0,\s*\n\s*lifeSource: 'still-motion'/.test(controller));
    check('un Reel con escenas sustituidas NO queda «listo»',
        /foldSubstitutedScenes/.test(controller)
        && /verdict: 'needs_review',\s*\n\s*substitutedScenes/.test(controller));
    check('...y se aplica en los DOS caminos de montaje, local y alojado',
        (controller.match(/await foldSubstitutedScenes\(/g) || []).length === 2);

    const life = readFileSync(path.join(root, 'src/components/admin/content-studio/SceneLifeCheck.tsx'), 'utf8');
    check('la sustitución se pinta como lo que es: una escena SIN animar',
        /Escena sin animar — sustituida/.test(life));
    check('y ofrece la salida, no sólo el diagnóstico',
        /Regenerar esta escena/.test(life));

    // Es el mismo componente en las dos pantallas: duplicarlo las dejaría
    // separarse en silencio, que es cómo la Biblioteca acabó sin decir nada.
    for (const f of ['VideoCreator.tsx', 'ReelLibrary.tsx']) {
        const src = readFileSync(path.join(root, 'src/components/admin/content-studio', f), 'utf8');
        check(`${f} usa el componente compartido`, /<SceneLifeCheck/.test(src));
    }
}

console.log(`\n${fail === 0 ? '✓' : '✗'} ${pass} pruebas pasan, ${fail} fallan\n`);
process.exit(fail === 0 ? 0 : 1);
