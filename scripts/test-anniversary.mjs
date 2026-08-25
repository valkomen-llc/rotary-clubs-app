// ════════════════════════════════════════════════════════════════════
// Aniversarios IA — pruebas del CRITERIO — v4.895
//
// Sin base, sin credenciales y sin red. Prueban lo que DECIDE el módulo,
// separado de la orquestación, por el mismo motivo que `seoRules.js` vive
// aparte de `seoAudit.js`: un motor que sólo se ejercita contra una base real
// termina sin pruebas, y entonces nadie se entera de que una regla cambió de
// signo.
//
// Cuatro cosas que se comprueban acá y NO se ven mirando una pantalla:
//
//   1. Que el módulo sea INDEPENDIENTE de Plantillas IA. La independencia
//      declarada en prosa no protege nada: se lee cada archivo y se falla si
//      aparece un import del editor.
//   2. Que las ZONAS DE TEXTO de los dos espejos coincidan. Es el acuerdo
//      entre el prompt —que le pide al modelo que deje esa franja tranquila— y
//      el compositor —que escribe ahí—. Con dos tablas, el modelo despeja un
//      lado y el texto se imprime en el otro, y eso no da ningún error: da una
//      pieza con el título encima de una cara.
//   3. Que el prompt QUEPA en su presupuesto y que la dirección de arte del
//      administrador se recorte, nunca se elimine.
//   4. Que el compositor NO repita el club ni los años cuando el titular ya
//      los dijo.
//
//   npm run test:anniversary
// ════════════════════════════════════════════════════════════════════
import { readFileSync, existsSync } from 'node:fs';

const S = await import('../server/lib/anniversarySpec.js');

let ok = 0; const malos = [];
const check = (n, c, e = '') => {
    if (c) { ok++; console.log(`  ✓ ${n}`); }
    else { malos.push(n); console.log(`  ✗ ${n}${e ? ` — ${e}` : ''}`); }
};
const grupo = t => console.log(`\n${t}`);
const leer = f => readFileSync(f, 'utf8');

/**
 * El archivo SIN sus comentarios.
 *
 * ⚠️ HACE FALTA: estas comprobaciones buscan lo que el código HACE, y los
 * comentarios de este módulo explican en prosa justamente lo que no se puede
 * hacer —«nunca DROP», «NUNCA un <datalist>»—. Buscando sobre el archivo
 * entero, un comentario correcto hace fallar la prueba y la deja inservible.
 * Es la misma regla que ya está escrita para `check:routes` y para las clases
 * de los botones: se busca la LLAMADA, no la mención.
 */
const sinComentarios = (src) => String(src)
    .replace(/\/\*[\s\S]*?\*\//g, ' ')
    .replace(/^\s*\/\/.*$/gm, ' ')
    .replace(/\{\/\*[\s\S]*?\*\/\}/g, ' ');

// ════════════════════════════════════════════════════════════════════
grupo('1 — El módulo es INDEPENDIENTE de Plantillas IA');

// Los archivos del módulo. La lista es explícita: con un glob, un archivo
// nuevo entraría sin que nadie decidiera que forma parte del módulo.
const PROPIOS = [
    'server/lib/anniversarySpec.js',
    'server/lib/anniversaryStore.js',
    'server/lib/anniversaryEngine.js',
    'server/lib/ensureAnniversarySchema.js',
    'server/controllers/anniversaryController.js',
    'server/controllers/anniversaryPublicController.js',
    'server/routes/anniversaries.js',
    'src/lib/anniversarySpec.ts',
    'src/lib/anniversaryRender.ts',
    'src/pages/admin/AnniversaryStudio.tsx',
    'src/pages/AniversarioIA.tsx',
];
check('los once archivos del módulo existen', PROPIOS.every(existsSync),
    PROPIOS.filter(f => !existsSync(f)).join(', '));

// Lo que NO se puede importar: el editor. `designFonts` queda fuera de la
// lista a propósito —es el cargador de las tipografías empaquetadas, un
// servicio global con UN registro de caras en `document.fonts`; un segundo
// cargador registraría las mismas dos veces—.
const PROHIBIDOS = [
    'designSpec', 'designCompose', 'designTemplates', 'designRender',
    'designPublish', 'designFields', 'designElements', 'designAI', 'DesignCanvas',
];
for (const f of PROPIOS.filter(existsSync)) {
    const src = leer(f);
    // Se buscan los IMPORTS, no las menciones: los comentarios tienen que poder
    // explicar de qué módulo se viene sin hacer fallar la prueba.
    const imports = [...src.matchAll(/^\s*import[^;]*from\s*['"]([^'"]+)['"]/gm)].map(m => m[1]);
    const malo = imports.find(i => PROHIBIDOS.some(p => i.includes(p)));
    check(`${f} no importa el editor de Plantillas IA`, !malo, malo || '');
}
const render = leer('src/lib/anniversaryRender.ts');
check('el compositor SÍ reutiliza el cargador global de tipografías',
    /from\s*['"]\.\/designFonts['"]/.test(render));

// ════════════════════════════════════════════════════════════════════
grupo('2 — Las zonas de texto no pueden diferir entre los dos espejos');

const espejo = leer('src/lib/anniversarySpec.ts');
for (const [id, z] of Object.entries(S.TEXT_ZONES)) {
    // Se comprueban los NÚMEROS uno a uno sobre el texto del espejo: comparar
    // objetos exigiría compilar el .ts y esta prueba tiene que correr sin
    // dependencias de desarrollo.
    const fila = espejo.match(new RegExp(`${id}:\\s*\\{[^}]*\\}`));
    check(`la zona ${id} está declarada en el espejo`, !!fila);
    if (!fila) continue;
    const t = fila[0];
    check(`  ${id}: mismas coordenadas`,
        t.includes(`x: ${z.x.toFixed(3)}`) && t.includes(`y: ${z.y.toFixed(3)}`)
        && t.includes(`w: ${z.w.toFixed(3)}`) && t.includes(`h: ${z.h.toFixed(3)}`),
        t);
    check(`  ${id}: misma alineación`, t.includes(`align: '${z.align}'`));
}
check('la banda del pie coincide',
    espejo.includes(`y: ${S.FOOTER_BAND.y}`) && espejo.includes(`h: ${S.FOOTER_BAND.h}`));
check('las zonas de texto TERMINAN por encima del pie institucional',
    Object.values(S.TEXT_ZONES).every(z => z.y + z.h <= S.FOOTER_BAND.y + 0.0001),
    Object.values(S.TEXT_ZONES).map(z => `${z.id}:${(z.y + z.h).toFixed(3)}`).join(' '));

// ════════════════════════════════════════════════════════════════════
grupo('3 — Dónde cae el texto');

const A = (o) => S.readAnalysis(JSON.stringify(o));
check('personas a la DERECHA → el texto va a la izquierda',
    S.textZoneFor(A({ people: 5, subjectSide: 'derecha' })) === 'left');
check('personas a la IZQUIERDA → el texto va a la derecha',
    S.textZoneFor(A({ people: 5, subjectSide: 'izquierda' })) === 'right');
check('grupo centrado → el texto va abajo, nunca sobre las caras',
    S.textZoneFor(A({ people: 8, subjectSide: 'centro' })) === 'bottom');
check('el lado LIBRE declarado por el modelo manda sobre el del sujeto',
    S.textZoneFor(A({ people: 5, subjectSide: 'centro', freeSide: 'derecha' })) === 'right');
check('sin análisis legible cae al tercio inferior',
    S.textZoneFor(S.fallbackAnalysis()) === S.DEFAULT_TEXT_ZONE);
check('un análisis que no se pudo leer se DECLARA como no leído',
    S.readAnalysis('esto no es json').read === false);
check('un recuento absurdo se acota en vez de aceptarse',
    A({ people: 99999 }).people === 400);

// ════════════════════════════════════════════════════════════════════
grupo('4 — El prompt de la imagen');

const analisis = A({ people: 6, group: true, subjectSide: 'derecha', freeSide: 'izquierda' });
const p1 = S.buildImagePrompt({ config: {}, years: 40, analysis: analisis, hasReference: true });

check('cabe en el presupuesto', p1.prompt.length <= S.PROMPT_MAX_CHARS, `${p1.prompt.length} chars`);
check('con la instrucción por defecto NO se sacrifica nada', p1.dropped.length === 0, p1.dropped.join(','));
check('pide que la imagen no traiga texto', p1.prompt.includes(S.NO_TEXT_CLAUSE));
check('pide que conserve a las personas', p1.prompt.includes(S.PRESERVE_CLAUSE));
check('nombra la franja que hay que dejar libre', p1.prompt.includes('la mitad izquierda') || p1.prompt.includes('left half') || p1.prompt.includes(S.zoneById('left').words));
check('lleva el Prompt Maestro del administrador', p1.prompt.includes('Master art direction'));
check('reserva la banda del pie institucional', p1.prompt.includes(S.FOOTER_CLAUSE));
check('la zona del prompt es la MISMA que decide `textZoneFor`',
    p1.zoneId === S.textZoneFor(analisis));

// Las variables del Prompt Maestro se sustituyen ANTES de mandar nada.
const conVars = S.buildImagePrompt({
    config: { masterPrompt: 'Pieza para {NOMBRE_CLUB} que cumple {ANOS_CLUB} años alrededor de {FOTO_CLUB}.' },
    clubName: 'Club Rotario Cali', years: 40, analysis: analisis, hasReference: true,
});
check('{NOMBRE_CLUB} se sustituye por el nombre real', conVars.prompt.includes('Club Rotario Cali'));
check('{ANOS_CLUB} se sustituye por la cifra real', /cumple 40 años/.test(conVars.prompt));
check('ningún marcador viaja literal al modelo', !/\{(NOMBRE_CLUB|ANOS_CLUB|FOTO_CLUB)\}/.test(conVars.prompt));
check('sin años, la cifra no se inventa',
    S.applyMasterVariables('cumple {ANOS_CLUB} años', {}).includes('cumple sus años'));
check('una variable desconocida se deja tal cual (y validateConfig la avisa)',
    S.applyMasterVariables('con {OTRA_COSA} adentro', {}).includes('{OTRA_COSA}'));

// El peor caso: un Prompt Maestro larguísimo.
const p2 = S.buildImagePrompt({
    config: { masterPrompt: 'Quiero ' + 'palabra '.repeat(400) },
    clubName: 'Club Rotario Cali', years: 40, analysis: analisis, hasReference: true,
});
check('con un Prompt Maestro enorme sigue cabiendo', p2.prompt.length <= S.PROMPT_MAX_CHARS, `${p2.prompt.length}`);
check('el Prompt Maestro se RECORTA, nunca se elimina',
    p2.prompt.includes('Master art direction') && p2.dropped.includes('master(recortado)'), p2.dropped.join(','));
check('el núcleo sobrevive al peor caso',
    p2.prompt.includes(S.NO_TEXT_CLAUSE) && p2.prompt.includes(S.PRESERVE_CLAUSE) && p2.prompt.includes(S.FOOTER_CLAUSE));
check('lo que se deja fuera se ANOTA', p2.dropped.length > 0);

// El interruptor del ambiente.
const sinAmbiente = S.buildImagePrompt({
    config: { promptOptions: { ambient: false } },
    clubName: 'X', years: 40, analysis: A({ people: 5, group: true }),
});
check('con el ambiente apagado, la frase por foto no viaja',
    !sinAmbiente.prompt.includes('group portrait'));

// Una configuración vieja con `designInstruction` no se queda sin dirección.
check('una configuración anterior a v4.898 conserva su dirección de arte',
    S.normalizeConfig({ designInstruction: 'Mi dirección heredada.' }).masterPrompt === 'Mi dirección heredada.');

// Una foto vacía no puede recibir una instrucción escrita para «la foto
// típica»: es la lección del censo universal (v4.785).
const vacia = S.buildImagePrompt({ config: {}, years: 25, analysis: A({ people: 0 }) });
check('con una fotografía SIN personas, el prompt dice que no se agrega ninguna',
    /no people in it and none are added/.test(vacia.prompt));

grupo('5 — El prompt negativo');
const neg = S.buildNegativePrompt({ restrictions: 'No poner globos rojos.' });
check('lleva las restricciones del administrador', neg.includes('No poner globos rojos.'));
check('prohíbe el texto dibujado', neg.includes('text'));
check('prohíbe los logotipos dibujados', neg.includes('logo'));
check('prohíbe personas de más', neg.includes('extra people'));
check('las restricciones NO se pegan al prompt positivo',
    !S.buildImagePrompt({ config: { restrictions: 'No poner globos rojos.' } }).prompt.includes('No poner globos rojos.'));

// ════════════════════════════════════════════════════════════════════
grupo('6 — El texto: el modelo escribe, el código decide');

const bueno = { title: '40 años de servicio', message: 'Celebramos cuatro décadas de trabajo junto a nuestra comunidad. Que sigan muchos años más.' };
check('un texto correcto pasa', S.validateCopy(bueno, { clubName: 'Club Rotario Cali', years: 40 }).ok);

const largo = { ...bueno, title: 'x'.repeat(80) };
const vLargo = S.validateCopy(largo, { years: 40 });
check('un titular largo se rechaza CON su número',
    !vLargo.ok && vLargo.errors.some(e => e.includes('80') && e.includes(String(S.LIMITS.title.max))), vLargo.errors.join(' | '));

check('un mensaje de cuatro frases se rechaza',
    !S.validateCopy({ title: 'Aniversario', message: 'Una. Dos. Tres. Cuatro frases hacen un párrafo entero.' }, {}).ok);
check('los hashtags se rechazan',
    !S.validateCopy({ ...bueno, message: bueno.message + ' #rotary' }, {}).ok);
check('los emojis se rechazan',
    !S.validateCopy({ ...bueno, message: bueno.message + ' 🎉' }, {}).ok);
check('los enlaces se rechazan',
    !S.validateCopy({ ...bueno, message: 'Mirá https://ejemplo.org y celebrá con nosotros hoy mismo.' }, {}).ok);
check('un marcador sin resolver se rechaza',
    !S.validateCopy({ ...bueno, title: 'Feliz aniversario {{club}}' }, {}).ok);

// La contradicción más visible de todas: el texto dice unos años y la pieza
// imprime otros, en la misma imagen.
const otrosAnios = S.validateCopy({ title: 'Aniversario del club', message: 'Celebramos 25 años de servicio a la comunidad con enorme orgullo compartido.' }, { years: 40 });
check('un texto que menciona OTRA cantidad de años se rechaza',
    !otrosAnios.ok && otrosAnios.errors.some(e => e.includes('40')), otrosAnios.errors.join(' | '));
check('mencionar los años CORRECTOS no molesta',
    S.validateCopy({ title: 'Aniversario del club', message: 'Celebramos 40 años de servicio a la comunidad con enorme orgullo compartido.' }, { years: 40 }).ok);

grupo('7 — Reparar no inventa contenido');
const rep = S.repairCopy({ title: 'x'.repeat(90), message: bueno.message }, { clubName: 'Club Rotario Cali', years: 40 });
check('el titular largo se recorta', rep.copy.title.length <= S.LIMITS.title.max);
check('se recorta SIN partir palabras', !/\s$/.test(rep.copy.title) && !rep.copy.title.endsWith('-'));
check('lo reparado se DICE', rep.repaired.length > 0, JSON.stringify(rep.repaired));

const sinTitulo = S.repairCopy({ title: '', message: bueno.message }, { clubName: 'Club Rotario Cali', years: 40 });
check('un titular ausente se DERIVA de datos que ya tenemos', sinTitulo.copy.title.includes('40'), sinTitulo.copy.title);

const corto = S.repairCopy({ title: 'Aniversario del club', message: 'Muy corto.' }, { years: 40 });
check('un mensaje corto SIGUE siendo corto: reparar no alarga',
    corto.copy.message === 'Muy corto.' && !corto.ok, JSON.stringify(corto.copy));

check('`trimWords` no parte palabras',
    S.trimWords('celebramos cuarenta años de servicio', 20).split(' ').every(w => 'celebramos cuarenta años de servicio'.includes(w)));

// ════════════════════════════════════════════════════════════════════
grupo('8 — La validación de la pieza');

const buena = {
    width: 1080, height: 1080, format: 'square_1080',
    meanLuma: 232, whiteShare: 0.61, zoneLuma: 240, zoneStdDev: 18,
    preservation: { state: 'ok', use: true },
};
check('una pieza correcta pasa', S.judgePiece(buena).ok);
check('y DECLARA qué se midió', S.judgePiece(buena).measured.length === 4, JSON.stringify(S.judgePiece(buena).measured));

const oscura = S.judgePiece({ ...buena, meanLuma: 120, whiteShare: 0.05 });
check('un fondo oscuro es crítico', !oscura.ok && oscura.critical.some(c => c.id === 'fondo_no_blanco'));
check('y el motivo lleva su CONSECUENCIA', oscura.critical[0].consequence.length > 20);

const ocupada = S.judgePiece({ ...buena, zoneStdDev: 95 });
check('la franja del texto ocupada es crítica', !ocupada.ok && ocupada.critical.some(c => c.id === 'franja_ocupada'));

const alterada = S.judgePiece({ ...buena, preservation: { state: 'failed', use: false, reason: 'Hay una persona de más.' } });
check('una fotografía alterada es crítica', !alterada.ok && alterada.critical.some(c => c.id === 'fotografia_alterada'));

const sinComprobar = S.judgePiece({ ...buena, preservation: { state: 'unavailable', use: true } });
check('«no se pudo comprobar» NO es un tipo de «bien»: pasa pero se DICE',
    sinComprobar.ok && sinComprobar.notes.some(n => n.includes('No se pudo comprobar')));
check('y entonces la fotografía NO cuenta como comprobada',
    !sinComprobar.measured.includes('fotografía conservada'));

const otraProporcion = S.judgePiece({ ...buena, width: 1024, height: 768 });
check('una proporción distinta se AVISA, no se descarta ni se recorta',
    otraProporcion.ok && otraProporcion.notes.some(n => n.includes('1024')));

grupo('9 — El reintento le dice al modelo el problema CONCRETO');
const clausula = S.retryClauseFor([{ id: 'franja_ocupada' }, { id: 'fondo_no_blanco' }]);
check('nombra la franja del titular', /headline/i.test(clausula));
check('nombra el fondo blanco', /white/i.test(clausula));
check('sin nada roto no agrega nada', S.retryClauseFor([]) === '');

// ════════════════════════════════════════════════════════════════════
grupo('10 — La configuración');

// El Prompt Maestro vacío CAE AL PREDETERMINADO (una configuración no puede
// quedarse sin dirección), así que lo que se rechaza es uno escrito y corto.
const cfgVacia = S.validateConfig({ masterPrompt: 'corto', messageInstruction: '' });
check('un Prompt Maestro demasiado corto no se publica', !cfgVacia.ok);
check('sin instrucción del mensaje tampoco', cfgVacia.errors.length >= 2);
check('el Prompt Maestro vacío cae al predeterminado',
    S.normalizeConfig({ masterPrompt: '' }).masterPrompt === S.DEFAULT_MASTER_PROMPT);
check('una variable desconocida en el Prompt Maestro se AVISA',
    S.validateConfig({ masterPrompt: S.DEFAULT_MASTER_PROMPT + ' y {NOMBRE_CLUV}' }).warnings.some(w => w.includes('{NOMBRE_CLUV}')));
check('sin referencias se AVISA, no se bloquea',
    S.validateConfig({}).ok && S.validateConfig({}).warnings.some(w => w.includes('referencia')));
check('«sólo estos sitios» sin ninguno elegido es un ERROR',
    !S.validateConfig({ scope: { mode: 'clubs', clubIds: [] } }).ok);

const cfgRefs = S.normalizeConfig({ references: [{ url: 'https://a/1.png' }, { url: 'https://a/2.png', primary: true }, { url: 'https://a/3.png', primary: true }] });
check('hay UNA sola referencia principal', cfgRefs.references.filter(r => r.primary).length === 1);
check('sin ninguna marcada, manda la primera',
    S.normalizeConfig({ references: [{ url: 'https://a/1.png' }] }).references[0].primary === true);
check('una referencia con una URL inaceptable se descarta',
    S.normalizeConfig({ references: [{ url: 'javascript:alert(1)' }, { url: 'http://inseguro/x.png' }] }).references.length === 0);
check('un data URL de imagen sí se acepta', S.isDrawableImage('data:image/png;base64,iVBORw0KGgo='));
check('un formato no disponible cae al que sí lo está',
    S.normalizeConfig({ format: 'story_9_16' }).format === S.DEFAULT_FORMAT);

grupo('11 — El alcance lo decide el servidor');
check('`all` alcanza a cualquier sitio', S.scopeReaches({ scope: { mode: 'all' } }, 'club-x'));
check('`clubs` alcanza sólo a los enumerados',
    S.scopeReaches({ scope: { mode: 'clubs', clubIds: ['a'] } }, 'a')
    && !S.scopeReaches({ scope: { mode: 'clubs', clubIds: ['a'] } }, 'b'));
check('`clubs` sin sitio identificado NO alcanza',
    !S.scopeReaches({ scope: { mode: 'clubs', clubIds: ['a'] } }, null));

grupo('12 — La huella de versión');
check('la misma configuración da la misma huella',
    S.fingerprintOf({}) === S.fingerprintOf({}));
check('cambiar el nombre interno NO es una versión nueva',
    !S.isSignificantChange({ name: 'A' }, { name: 'B' }));
check('cambiar el interruptor de activo tampoco',
    !S.isSignificantChange({ enabled: false }, { enabled: true }));
check('cambiar la instrucción SÍ lo es',
    S.isSignificantChange({}, { designInstruction: 'Otra cosa completamente distinta y más larga que el mínimo.' }));
check('cambiar las referencias SÍ lo es',
    S.isSignificantChange({}, { references: [{ url: 'https://a/1.png' }] }));

grupo('13 — Años y nombre del club');
check('los años se acotan al rango declarado',
    S.normalizeYears(40) === 40 && S.normalizeYears(0) === null && S.normalizeYears(500) === null);
check('un texto que no es un número no pasa', S.normalizeYears('cuarenta') === null);
check('con nombre completo se imprime la forma larga',
    S.printableClubName('Cali', { useFullClubName: true, displayName: 'Club Rotario Cali' }) === 'Club Rotario Cali');
check('sin ella se imprime lo que escribió la persona',
    S.printableClubName('Cali', { useFullClubName: false, displayName: 'Club Rotario Cali' }) === 'Cali');

grupo('14 — Medidas del lienzo');
check('1:1 a 1080 da un cuadrado', JSON.stringify(S.canvasSize('square_1080', 1080)) === JSON.stringify({ width: 1080, height: 1080 }));
check('una resolución desconocida cae al valor por defecto',
    S.canvasSize('square_1080', 99).width === S.DEFAULT_RESOLUTION);

// ════════════════════════════════════════════════════════════════════
grupo('15 — El compositor no repite lo que el titular ya dijo');

let planTextBlocks = null;
try {
    const { build } = await import('esbuild');
    const out = await build({
        entryPoints: ['src/lib/anniversaryRender.ts'],
        bundle: true, write: false, format: 'esm', platform: 'neutral',
        // El compositor importa el cargador de tipografías, que toca el DOM.
        // Acá sólo se prueba la parte PURA, así que se sustituye por un módulo
        // vacío en vez de arrastrar un entorno de navegador.
        external: ['./designFonts'],
        plugins: [{
            name: 'sin-fuentes',
            setup(b) {
                b.onResolve({ filter: /designFonts$/ }, () => ({ path: 'designFonts', namespace: 'stub' }));
                b.onLoad({ filter: /.*/, namespace: 'stub' }, () => ({ contents: 'export const ensureDesignFonts = async () => "ready";', loader: 'js' }));
            },
        }],
    });
    ({ planTextBlocks } = await import(`data:text/javascript,${encodeURIComponent(out.outputFiles[0].text)}`));
} catch (e) {
    console.log(`  … se salta: hace falta esbuild (${e.message.split('\n')[0]})`);
}

if (planTextBlocks) {
    const kinds = (d) => planTextBlocks(d).map(b => b.kind);

    const conClub = kinds({ title: '¡Feliz aniversario, Club Rotario Cali!', message: 'Un mensaje.', clubName: 'Club Rotario Cali', years: 40 });
    check('si el titular nombra al club, el club NO se repite', !conClub.includes('club'), conClub.join(','));
    check('y los años, que el titular no dijo, SÍ salen', conClub.includes('years'), conClub.join(','));

    const conAnios = kinds({ title: '¡40 años generando impacto!', message: 'Un mensaje.', clubName: 'Club Rotario Cali', years: 40 });
    check('si el titular dice los años, los años NO se repiten', !conAnios.includes('years'), conAnios.join(','));
    check('y el club, que el titular no nombró, SÍ sale', conAnios.includes('club'), conAnios.join(','));

    const neutro = kinds({ title: 'Celebramos juntos', message: 'Un mensaje.', clubName: 'Club Rotario Cali', years: 40 });
    check('con un titular neutro salen los dos', neutro.includes('years') && neutro.includes('club'), neutro.join(','));

    const sinTit = kinds({ title: '', message: 'Un mensaje.', clubName: 'Club Rotario Cali', years: 40 });
    check('sin titular, el club y los años SIEMPRE salen',
        sinTit.includes('years') && sinTit.includes('club') && !sinTit.includes('headline'), sinTit.join(','));

    const sinMensaje = kinds({ title: 'Celebramos juntos', message: '', clubName: 'Club Rotario Cali', years: 40 });
    check('sin mensaje no queda un filete suelto', !sinMensaje.includes('rule') && !sinMensaje.includes('message'), sinMensaje.join(','));

    // «Cali» sin «Club Rotario» delante también nombra al club: comparar el
    // nombre completo daría un falso negativo y repetiría la identidad.
    const parcial = kinds({ title: '¡Feliz aniversario, Cali!', message: 'Un mensaje.', clubName: 'Club Rotario Cali', years: 40 });
    check('la parte distintiva del nombre cuenta como nombrar al club', !parcial.includes('club'), parcial.join(','));
}

// ════════════════════════════════════════════════════════════════════
grupo('16 — Reglas del módulo que se leen en los archivos');

const engine = leer('server/lib/anniversaryEngine.js');
check('el pipeline reutiliza el ÚNICO cliente de KIE de la plataforma',
    /from\s*['"]\.\.\/services\/kieService\.js['"]/.test(engine));
check('reutiliza el control de preservación que ya existe, no lo reimplementa',
    /checkPreservation.*from\s*['"]\.\/designGuard\.js['"]/s.test(engine));
check('reutiliza la cadena de proveedores de texto y visión',
    /generateCopy.*from\s*['"]\.\.\/services\/copywritingService\.js['"]/s.test(engine));

const ctrl = leer('server/controllers/anniversaryController.js');
check('el panel de pruebas y el formulario público comparten las CUATRO etapas',
    ['runAnalyze', 'runCopy', 'runCompose', 'runSync'].every(f => ctrl.includes(`export const ${f}`)));
const pub = leer('server/controllers/anniversaryPublicController.js');
check('y el controlador público las IMPORTA en vez de tener las suyas',
    /import\s*\{[^}]*runAnalyze[^}]*runCopy[^}]*runCompose[^}]*runSync[^}]*\}\s*from\s*['"]\.\/anniversaryController\.js['"]/s.test(pub));
check('el endpoint público NO acepta la configuración en el cuerpo',
    !/req\.body\?*\.(config|designInstruction|prompt|restrictions)/.test(pub));

const store = leer('server/lib/anniversaryStore.js');
check('el reclamo de despacho va sobre `attempts`, no sobre `updatedAt`',
    /AND attempts = \$2/.test(store) && !/AND "updatedAt" = /.test(store));
check('la escritura parcial de una pieza tiene una lista CERRADA de campos',
    /PIECE_FIELDS\s*=\s*new Set/.test(store));
check('la lectura pública DEGRADA en vez de lanzar',
    /readPublishedConfig[\s\S]{0,900}catch[\s\S]{0,120}return null/.test(store));

const ensure = leer('server/lib/ensureAnniversarySchema.js');
check('el esquema no borra nada', !/DROP\s+TABLE|TRUNCATE/i.test(sinComentarios(ensure)));
check('amplía con ADD COLUMN IF NOT EXISTS fuera del CREATE',
    /ALTER TABLE "AnniversaryPiece" ADD COLUMN IF NOT EXISTS/.test(ensure));
// Una comilla invertida dentro del SQL cierra el template literal a mitad y
// deja el módulo entero sin parsear. Pasó en `ensureDesignSchema.js` (v4.721.1).
const bloques = [...ensure.matchAll(/db\.query\(`([\s\S]*?)`\)/g)].map(m => m[1]);
check('ningún SQL lleva una comilla invertida dentro', bloques.every(b => !b.includes('`')));

const rutas = leer('server/routes/anniversaries.js');
const orden = (a, b) => rutas.indexOf(a) < rutas.indexOf(b);
check('las rutas literales van ANTES que las paramétricas',
    orden("'/test/photo'", "'/test/piece/:id'") && orden("'/versions'", "'/versions/:id/restore'"));
check('las rutas del panel llevan autenticación y rol de operador',
    (rutas.match(/authMiddleware, operador/g) || []).length >= 12);
check('las rutas públicas NO llevan autenticación',
    !/router\.(get|post)\('\/public\/[^']*',\s*authMiddleware/.test(rutas));

check('el compositor NO tiene una vista previa en DOM aparte del canvas',
    !/document\.createElement\('div'\)/.test(render) && /canvas\.toBlob/.test(render));
check('la descarga exporta EL MISMO canvas que se compuso',
    /downloadCanvas\s*=\s*async\s*\(canvas: HTMLCanvasElement/.test(render));
check('el compositor usa el proxy de imágenes o el canvas quedaría «tainted»',
    /banner-image\?url=/.test(render));
check('las reglas visuales son del SISTEMA, no de la configuración',
    /export const ROTARY_BLUE/.test(render) && !/config\.(color|overlay|font)/.test(render));

const estudio = leer('src/pages/admin/AnniversaryStudio.tsx');
check('el panel ofrece las DOS vías para toda imagen (subir y Biblioteca)',
    (estudio.match(/Biblioteca<\/button>/g) || []).length >= 2 && estudio.includes('uploadMediaFiles'));
check('el panel dice que guardar NO cambia lo que genera la gente',
    /no publicar|sin publicar|Todavía no cambia/i.test(estudio));

const publica = leer('src/pages/AniversarioIA.tsx');
for (const prohibido of ['fontSize', 'colorPicker', 'zIndex', 'DesignCanvas', 'coordenada']) {
    check(`el formulario público no expone «${prohibido}»`, !sinComentarios(publica).includes(prohibido));
}
check('el formulario público NO usa `<datalist>`', !sinComentarios(publica).includes('<datalist'));
check('el panel de pruebas tampoco', !sinComentarios(estudio).includes('<datalist') && !/\blist=/.test(sinComentarios(estudio)));

// ════════════════════════════════════════════════════════════════════
console.log(`\n${'─'.repeat(60)}`);
if (malos.length) {
    console.log(`❌ ${malos.length} de ${ok + malos.length} comprobaciones fallaron:`);
    for (const m of malos) console.log(`   · ${m}`);
    process.exit(1);
}
console.log(`✅ ${ok} comprobaciones. Aniversarios IA: criterio en orden.`);
