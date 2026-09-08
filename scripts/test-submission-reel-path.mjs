// ════════════════════════════════════════════════════════════════════════════
// Solicitud → Reel — el CAMINO — v4.1006
//
//   npm run test:submissions:reel:path
//
// SIN Postgres, SIN credenciales y SIN red: la base, el modelo de lenguaje y el
// motor de Reels se sustituyen con un hook de resolución de módulos.
//
// ⚠️ POR QUÉ HACE FALTA, teniendo ya 134 pruebas de criterio. Porque el criterio
// puede estar entero y el defecto vivir en el camino: `pickDistrictSite` era
// correcto y el fallo estaba en la ruta (v4.744); el `WHERE` de las
// publicaciones fantasma nunca miró el criterio (v4.938); y un renombrado a
// medias entre dos capas no lo ve ninguna prueba pura (v4.889). Acá se ejercita
// lo que ninguna de esas ve: que el SQL lleve los parámetros que lleva, que una
// etapa deje lo que la siguiente espera, que el reclamo impida dos vueltas y
// que se le pida UN solo Reel al motor.
//
// Lo que este doble NO demuestra es que el SQL sea válido para Postgres: eso se
// comprueba al desplegar, y no se afirma de más.
// ════════════════════════════════════════════════════════════════════════════
import { register } from 'node:module';
import { pathToFileURL } from 'node:url';

const HERE = pathToFileURL(`${process.cwd()}/`).href;
const DB = new URL('./scripts/fixtures/db-submission-reel-stub.mjs', HERE).href;

// Los dobles del modelo y del motor de Reels viven en su propio archivo: un
// `data:` URL con el código escapado es ilegible y se rompe al primer cambio.
const STUBS = new URL('./scripts/fixtures/reel-path-stubs.mjs', HERE).href;

register(
    `data:text/javascript,export async function resolve(s,c,n){
        if (/(^|\\/)db\\.js$/.test(s)) return { url: ${JSON.stringify(DB)}, shortCircuit: true };
        if (/copywritingService\\.js$/.test(s)) return { url: ${JSON.stringify(STUBS)}, shortCircuit: true };
        if (/reelController\\.js$/.test(s)) return { url: ${JSON.stringify(STUBS)}, shortCircuit: true };
        return n(s, c);
    }`,
    HERE
);

const motor = await import('../server/lib/submissionReelEngine.js');
const stub = await import(DB);
const { llamadas, opciones } = await import(new URL('./scripts/fixtures/reel-path-stubs.mjs', HERE).href);

let pass = 0, fail = 0;
const ok = (n, cond, d = '') => { if (cond) { pass++; console.log(`  ✓ ${n}`); } else { fail++; console.log(`  ✗ ${n}${d ? ` — ${d}` : ''}`); } };
const grupo = (t) => console.log(`\n${t}`);

// ── El escenario: una solicitud con seis fotos, cinco ya en la Biblioteca ──
const sembrar = ({ enBiblioteca = 6, conAnalisis = true } = {}) => {
    stub.reset();
    llamadas.copy.length = 0; llamadas.reels.length = 0;
    stub.datos.submissions.push({
        id: 'sub-1', campaignId: 'camp-1', status: 'aprobado', originClubId: 'club-1',
        title: 'Entrega de mercados', description: 'El club entregó 120 mercados en Sevilla.',
        story: 'Fue una jornada larga.', club: 'Rotary Sevilla', location: 'Sevilla', city: 'Valle',
        activityDate: '2026-08-14', district: '4281', extra: '',
    });
    stub.datos.campaigns.push({ id: 'camp-1', name: 'Emergencia', content: '{}', ownerClubId: 'club-1', recipientClubId: null });
    stub.datos.clubs.push({ id: 'club-1', name: 'Distrito 4281', domain: 'rotary4281.org', type: 'district' });
    stub.datos.articles.push({ id: 'art-1', submissionId: 'sub-1', postId: 'post-1', generated: { title: 'Un titular', excerpt: 'Una entrada' } });
    stub.datos.posts.push({ id: 'post-1', title: 'Un titular', excerpt: 'Una entrada', published: true });
    for (let i = 0; i < 6; i++) {
        const id = `f${i}`;
        stub.datos.files.push({
            id, submissionId: 'sub-1', kind: 'image', filename: `foto${i}.jpg`,
            mediaId: i < enBiblioteca ? `m${i}` : null,
            mediaUrl: i < enBiblioteca ? `https://cdn/${id}.jpg` : null,
            s3Key: `private/${id}`, sortOrder: i,
        });
        if (conAnalisis) {
            stub.datos.articleMedia.push({
                articleId: 'art-1', fileId: id, kind: 'image', score: 90 - i, excluded: false,
                excludedReason: null, role: i === 0 ? 'portada' : 'apoyo', alt: `foto ${i}`,
                analysis: { measured: { hash: `h${i}`, duplicateOf: null }, vision: { caption: `se ve algo ${i}`, people: 3 } },
                sortOrder: i,
            });
        }
    }
};

/** Corre etapas hasta que el workflow deje de avanzar. */
const correr = async (max = 8) => {
    let r = null;
    for (let i = 0; i < max; i++) {
        const fila = await motor.reelOf('sub-1');
        if (!fila) break;
        r = await motor.advanceReel(fila);
        if (r.done || r.busy) break;
    }
    return r;
};

// ───────────────────────────────────────────────────────────────────────────
grupo('▸ Encolar es idempotente (el precio de equivocarse son créditos)');
{
    sembrar();
    const a = await motor.enqueueReel({ submissionId: 'sub-1', campaignId: 'camp-1', clubId: 'club-1' });
    const b = await motor.enqueueReel({ submissionId: 'sub-1', campaignId: 'camp-1', clubId: 'club-1' });
    ok('la primera crea la fila', a.created === true);
    ok('la segunda NO crea otra', b.created === false);
    ok('y devuelve la que ya estaba', b.reel?.id === a.reel?.id);
    ok('en la base hay UNA sola fila', stub.datos.reels.length === 1);
    ok('nace en «en cola» y en la versión 1',
        a.reel.status === 'recibida' && a.reel.versionNumber === 1);
    ok('nace SIN proyecto de Reel: las etapas baratas van primero', a.reel.reelProjectId === null);
}

// ───────────────────────────────────────────────────────────────────────────
grupo('▸ El camino completo, etapa por etapa');
{
    sembrar();
    await motor.enqueueReel({ submissionId: 'sub-1', campaignId: 'camp-1', clubId: 'club-1', articleId: 'art-1' });

    const r1 = await motor.advanceReel(await motor.reelOf('sub-1'));
    ok('la primera etapa es «material»', r1.stage === 'material');
    ok('y clasifica el contenido como Reel de imágenes',
        r1.reel.contentMode === 'image_reel' && r1.reel.classification.images === 6);
    ok('cuenta cuántas están en la Biblioteca', r1.reel.classification.inLibrary === 6);

    const r2 = await motor.advanceReel(await motor.reelOf('sub-1'));
    ok('la segunda es «seleccion»', r2.stage === 'seleccion');
    ok('elige cinco fotografías', r2.reel.selection.items?.length === 5);
    ok('cada una con su función narrativa',
        r2.reel.selection.items.every(i => i.slot && i.slotLabel));
    ok('la que no entró se reporta con su motivo',
        r2.reel.selection.discarded?.length === 1 && r2.reel.selection.discarded[0].reason);
    ok('y NO viene degradada: había análisis del artículo', r2.reel.selection.degraded === false);

    const r3 = await motor.advanceReel(await motor.reelOf('sub-1'));
    ok('la tercera es «storyboard»', r3.stage === 'storyboard');
    ok('con una línea por escena', r3.reel.storyboard.scenes?.length === 5);
    ok('y su hook y su llamado', r3.reel.storyboard.hook && r3.reel.storyboard.cta);
    ok('la guardia de datos queda guardada con la pieza',
        r3.reel.facts?.universe && r3.reel.facts?.clause);
    ok('se llamó UNA vez al modelo, no una por escena', llamadas.copy.length === 1);
    ok('el brief que se le mandó lleva el contexto real de la solicitud',
        llamadas.copy[0].userText.includes('Entrega de mercados')
        && llamadas.copy[0].userText.includes('Rotary Sevilla'));
    ok('y el artículo como contexto, con la advertencia de no copiarlo',
        llamadas.copy[0].userText.includes('NO lo copies'));

    const r4 = await motor.advanceReel(await motor.reelOf('sub-1'));
    ok('la cuarta es «proyecto»', r4.stage === 'proyecto');
    ok('se le pidió UN solo Reel al motor de siempre', llamadas.reels.length === 1);
    ok('con el preset de solicitud', llamadas.reels[0].input.preset === 'solicitud');
    ok('con las cinco fotos y sus URLs de la Biblioteca',
        llamadas.reels[0].input.images.length === 5
        && llamadas.reels[0].input.images.every(i => i.url?.startsWith('https://cdn/')));
    ok('con el orden FIJADO: la historia ya está escrita',
        llamadas.reels[0].input.autoOrder === false);
    ok('con la guardia de datos, para que el guion y el copy no inventen',
        llamadas.reels[0].input.facts?.universe);
    ok('con la voz encendida', llamadas.reels[0].input.narration?.enabled === true);
    ok('el proyecto queda vinculado a la solicitud', r4.reel.reelProjectId === 'proj-1');
    ok('y el costo estimado queda escrito', r4.reel.creditsEstimated === 100);
}

// ───────────────────────────────────────────────────────────────────────────
grupo('▸ Con las etapas hechas se SIGUE al proyecto, no se duplica su estado');
{
    stub.datos.projects.push({ id: 'proj-1', status: 'ready', statusDetail: null, creditsEstimated: 100 });
    const r = await motor.advanceReel(await motor.reelOf('sub-1'));
    ok('el Reel pasa a «borrador listo» cuando el proyecto está listo',
        r.reel.status === 'borrador_listo');
    ok('y NO se creó un segundo proyecto', llamadas.reels.length === 1);
    ok('queda sellada la fecha de generación', Boolean(r.reel.generatedAt));

    const otra = await motor.advanceReel(await motor.reelOf('sub-1'));
    ok('un sondeo posterior no vuelve a trabajar: ya no es un estado de trabajo',
        otra.done === true);

    // ⚠️ REINTENTAR LA ETAPA CARA NO LA VUELVE A PAGAR. Es el punto 25 del
    // pedido —«no volver a generar escenas que ya finalizaron correctamente»— y
    // la única forma de comprobarlo es forzando el reintento: en el camino
    // normal esa etapa corre una sola vez, así que quitar la guardia pasaba
    // desapercibido. Lo destapó la verificación a la inversa.
    const antes = llamadas.reels.length;
    const forzado = await motor.retryReelStage({ row: await motor.reelOf('sub-1'), stage: 'proyecto' });
    await motor.advanceReel(forzado.reel);
    ok('reintentar «proyecto» con un Reel ya creado NO pide otro',
        llamadas.reels.length === antes, `pidió ${llamadas.reels.length - antes} de más`);
    ok('y el vínculo con el proyecto se conserva',
        (await motor.reelOf('sub-1')).reelProjectId === 'proj-1');

    // El reintento devolvió el Reel a un estado de trabajo: se deja donde
    // estaba para el bloque siguiente, que comprueba las acciones humanas.
    await correr();
    ok('tras el reintento vuelve a «borrador listo» sin intervención',
        (await motor.reelOf('sub-1')).status === 'borrador_listo');
}

// ───────────────────────────────────────────────────────────────────────────
grupo('▸ La automatización NO publica');
{
    const fila = await motor.reelOf('sub-1');
    ok('el Reel quedó en BORRADOR, no publicado', fila.status === 'borrador_listo');
    ok('y sin fecha de publicación', fila.publishedAt === null);

    const directo = await motor.transitionReel({ row: fila, to: 'publicado' });
    ok('no se puede publicar sin aprobar antes', directo.ok === false);

    const aprobado = await motor.transitionReel({ row: fila, to: 'aprobado' });
    ok('aprobar sí se puede', aprobado.ok === true && aprobado.reel.status === 'aprobado');
    ok('aprobar NO publica', aprobado.reel.publishedAt === null);

    const publicado = await motor.transitionReel({ row: aprobado.reel, to: 'publicado' });
    ok('y desde aprobado sí', publicado.ok === true && Boolean(publicado.reel.publishedAt));

    const sinMotivo = await motor.transitionReel({ row: publicado.reel, to: 'descartado' });
    ok('desde publicado no se retrocede a mano', sinMotivo.ok === false);
}

// ───────────────────────────────────────────────────────────────────────────
grupo('▸ El modelo escribe y el CÓDIGO decide');
{
    // El modelo inventa una cifra en el primer intento y la corrige cuando se
    // le devuelve la regla concreta que rompió.
    opciones.inventarCifra = true;
    sembrar();
    await motor.enqueueReel({ submissionId: 'sub-1', campaignId: 'camp-1', clubId: 'club-1' });
    await motor.advanceReel(await motor.reelOf('sub-1'));   // material
    await motor.advanceReel(await motor.reelOf('sub-1'));   // seleccion
    const r = await motor.advanceReel(await motor.reelOf('sub-1'));   // storyboard
    opciones.inventarCifra = false;

    ok('una cifra que nadie suministró dispara el reintento', llamadas.copy.length === 2);
    ok('el reintento le devuelve LA REGLA CONCRETA, no «revisá el formato»',
        /rompió estas reglas/.test(llamadas.copy[1].userText) && /5000/.test(llamadas.copy[1].userText));
    ok('y el texto corregido es el que se guarda',
        !/5000/.test(r.reel.storyboard.hook || ''));
    ok('sin avisos pendientes tras la corrección',
        (r.reel.storyboard.factIssues || []).length === 0);
}

// ───────────────────────────────────────────────────────────────────────────
grupo('▸ El reclamo impide que dos vueltas hagan la misma etapa');
{
    sembrar();
    await motor.enqueueReel({ submissionId: 'sub-1', campaignId: 'camp-1', clubId: 'club-1' });
    const fila = await motor.reelOf('sub-1');
    // Dos vueltas leen la MISMA fila —el cron y el sondeo— y sólo una trabaja.
    const [a, b] = await Promise.all([motor.advanceReel({ ...fila }), motor.advanceReel({ ...fila })]);
    const trabajaron = [a, b].filter(r => r.stage).length;
    ok('sólo UNA de las dos ejecutó la etapa', trabajaron === 1, `trabajaron ${trabajaron}`);
    ok('la otra se va diciendo que está ocupada', [a, b].some(r => r.busy === true));
}

// ───────────────────────────────────────────────────────────────────────────
grupo('▸ Lo que falla, falla con su motivo y su salida');
{
    // Sólo dos fotos en la Biblioteca: no alcanza.
    sembrar({ enBiblioteca: 2 });
    await motor.enqueueReel({ submissionId: 'sub-1', campaignId: 'camp-1', clubId: 'club-1' });
    await correr();
    const fila = await motor.reelOf('sub-1');
    ok('el Reel no se genera y queda con el motivo escrito',
        fila.status === 'error' && /fotografías/.test(fila.lastError || ''));
    ok('el motivo NOMBRA el prefijo privado y dónde se resuelve',
        /Biblioteca/.test(fila.lastError || ''));
    ok('no se le pidió ningún Reel al motor: no se gastó un crédito',
        llamadas.reels.length === 0);

    const reintento = await motor.retryReelStage({ row: fila, stage: 'material' });
    ok('se puede reintentar esa etapa sin rehacer nada más', reintento.ok === true);
}

// ───────────────────────────────────────────────────────────────────────────
grupo('▸ Sin análisis del artículo se DEGRADA, no se bloquea');
{
    sembrar({ conAnalisis: false });
    stub.datos.articles.length = 0;
    await motor.enqueueReel({ submissionId: 'sub-1', campaignId: 'camp-1', clubId: 'club-1' });
    await motor.advanceReel(await motor.reelOf('sub-1'));
    const r = await motor.advanceReel(await motor.reelOf('sub-1'));
    ok('igual elige cinco fotografías', r.reel.selection.items?.length === 5);
    ok('pero lo DICE: no se pudo comparar nitidez ni descartar repetidas',
        r.reel.selection.degraded === true && /orden/.test(r.reel.stages.seleccion.note || ''));
}

// ───────────────────────────────────────────────────────────────────────────
grupo('▸ La selección manual manda y no se pisa');
{
    sembrar();
    await motor.enqueueReel({ submissionId: 'sub-1', campaignId: 'camp-1', clubId: 'club-1' });
    await motor.advanceReel(await motor.reelOf('sub-1'));   // material
    await motor.advanceReel(await motor.reelOf('sub-1'));   // seleccion (auto)

    const manual = await motor.updateReelSelection({ row: await motor.reelOf('sub-1'), fileIds: ['f5', 'f4', 'f3'] });
    ok('se guarda la selección de la persona', manual.ok === true);
    ok('en SU orden', manual.reel.selection.items.map(i => i.fileId).join(',') === 'f5,f4,f3');
    ok('marcada como manual', manual.reel.selection.source === 'manual');
    ok('y el storyboard se rehace con las fotos nuevas (todavía no se pagó nada)',
        manual.reel.stages.storyboard === undefined);

    // Volver a correr la etapa de selección NO puede deshacer lo que eligió
    // una persona: es la regla de `putAuto` con las traducciones.
    const forzado = await motor.retryReelStage({ row: await motor.reelOf('sub-1'), stage: 'seleccion' });
    await motor.advanceReel(forzado.reel);
    const tras = await motor.reelOf('sub-1');
    ok('reintentar la selección automática CONSERVA la manual',
        tras.selection.source === 'manual'
        && tras.selection.items.map(i => i.fileId).join(',') === 'f5,f4,f3');

    const ajeno = await motor.updateReelSelection({ row: tras, fileIds: ['f1', 'f2', 'ajeno'] });
    ok('un id que no es de esta solicitud no se puede colar',
        ajeno.ok === false || !ajeno.reel.selection.items.some(i => i.fileId === 'ajeno'));
}

// ───────────────────────────────────────────────────────────────────────────
grupo('▸ Versionar no duplica archivos ni pisa lo anterior');
{
    sembrar();
    await motor.enqueueReel({ submissionId: 'sub-1', campaignId: 'camp-1', clubId: 'club-1' });
    const v2 = await motor.newReelVersion({ submissionId: 'sub-1', campaignId: 'camp-1', clubId: 'club-1' });
    ok('la versión nueva es la 2', v2.created === true && v2.reel.versionNumber === 2);
    ok('y es la vigente', v2.reel.isCurrent === true);
    const versiones = await motor.reelVersionsOf('sub-1');
    ok('la anterior se conserva', versiones.length === 2);
    ok('y deja de ser la vigente', versiones.filter(v => v.isCurrent).length === 1);
    ok('`reelOf` devuelve la vigente', (await motor.reelOf('sub-1')).versionNumber === 2);
}

console.log(`\n${fail === 0 ? '✓' : '✗'} ${pass} comprobaciones pasan, ${fail} fallan\n`);
process.exit(fail === 0 ? 0 : 1);
