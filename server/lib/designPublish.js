// ════════════════════════════════════════════════════════════════════
// Plantillas IA — publicación y portal público
// v4.726.0
//
// PURO: sin base, sin red, sin IA, sin DOM. Define qué significa publicar una
// plantilla, qué formulario le sale al público y qué puede tocar.
//
// ── EL FORMULARIO NO SE ESCRIBE: SE DERIVA ──────────────────────────
//
// Es el requisito de fondo del pedido —«cada nueva plantilla deberá generar
// automáticamente su formulario público»— y la razón por la que este archivo
// existe. Los campos salen de las VARIABLES que el documento realmente usa
// (`srcText` y `srcVar` de cada nodo), no de una lista escrita a mano en
// paralelo. Una lista aparte se separa del diseño en cuanto alguien agrega un
// `{{presidente}}` a una plantilla: el campo no aparecería y el marcador
// quedaría sin resolver, impreso o vacío, sin que nadie se entere.
//
// ── LA SEGURIDAD ES ESTRUCTURAL, NO UNA PANTALLA QUE ESCONDE COSAS ──
//
// El pedido enumera lo que el público NO debe poder hacer: mover elementos,
// cambiar colores, quitar el logotipo, tocar tipografías. Nada de eso se
// resuelve ocultando controles —quien conoce el endpoint se los saltea—. Se
// resuelve porque el endpoint público **sólo acepta valores de variables
// declaradas**: `applyPublicValues` toma los nodos GUARDADOS y les sustituye
// texto e imágenes; jamás recibe un nodo del navegador. Un color, una posición
// o una capa nueva no se pueden ni expresar en esa petición.
//
// Y por eso `sanitizeValues` descarta las claves desconocidas en silencio pero
// las REPORTA: si algo intenta mandar `logo`, el operador tiene que poder verlo.
// ════════════════════════════════════════════════════════════════════

import { VARIABLES, variablesUsedIn, resolveVariables, LIMITS } from './designSpec.js';
import { FIELD_KINDS, declarationsOf, defaultKindFor, isImageKind } from './designFields.js';

// ─── Qué es cada variable en un formulario público ─────────────────────
//
// `institutional: true` significa que el valor lo fija la plantilla y el
// público NO lo ve ni lo cambia. No es una preferencia: el nombre del
// Gobernador, el distrito y el periodo son la FIRMA del Distrito, y una
// felicitación institucional que cualquiera pueda re-firmar no es publicable.
//
// El LOGOTIPO no es eso, y hasta v4.722.2 estaba mal clasificado acá. En la
// pieza de aniversario el logotipo es el **del club que cumple años** —el
// mismo dato que el Generador de Pendones le pide a cualquiera que entre—, y
// la firma del Distrito es la curva azul del pie con el nombre del Gobernador.
// Marcarlo institucional dejaba el portal público sin la mitad de su
// formulario: cada club veía el escudo de OTRO club, sin forma de cambiarlo.
export const FIELD_SPECS = {
    logo: { order: 5, type: 'image', label: 'Logotipo del club', help: 'El escudo de tu club. Si no lo subís, la pieza sale sin él.' },
    club: { order: 10, type: 'text', label: 'Nombre del club', placeholder: 'Rotary Club Bogotá Centro', maxChars: 90, required: true },
    // Obligatorio desde v4.775: el título de la lámina imprime el número
    // («¡Felices 52 años, …!»), y un marcador sin valor dejaría el saludo
    // mocho. No contradice la regla de «no afirmar un aniversario que no se
    // verificó»: el número lo AFIRMA quien genera la pieza — llega calculado
    // al elegir el club de la lista y queda editable.
    anios: { order: 20, type: 'number', label: 'Años que cumple', placeholder: '49', maxChars: 3, required: true, help: 'Se completa solo al elegir tu club de la lista. Corregilo si hace falta.' },
    fecha: { order: 30, type: 'text', label: 'Fecha', placeholder: '4 de agosto', maxChars: 40 },
    ciudad: { order: 40, type: 'text', label: 'Ciudad', placeholder: 'Bogotá', maxChars: 60 },
    presidente: { order: 50, type: 'text', label: 'Presidente del club', placeholder: 'Nombre y apellido', maxChars: 80 },
    titulo: { order: 60, type: 'text', label: 'Título', maxChars: LIMITS.title },
    mensaje: { order: 70, type: 'textarea', label: 'Mensaje', placeholder: 'El texto que va impreso en la pieza', maxChars: LIMITS.message, ai: true },
    // La frase dorada que remata la pieza. `ai: true`: la escribe el modelo en
    // cada generación —el pedido es que varíe entre piezas— y la persona puede
    // corregirla; el valor por defecto del nodo garantiza que nunca falte.
    cierre: { order: 75, type: 'text', label: 'Frase de cierre', maxChars: 70, ai: true },
    imagen: { order: 80, type: 'image', label: 'Fotografía del club', help: 'Se adapta sola al espacio de la plantilla.' },

    // Institucionales: los fija la plantilla publicada. Quien quiera congelar
    // además el logotipo —una pieza del propio Distrito, no de un club— lo
    // bloquea al publicar; eso es una decisión por publicación, no una regla.
    distrito: { order: 91, type: 'text', label: 'Distrito', institutional: true },
    gobernador: { order: 92, type: 'text', label: 'Gobernador', institutional: true },
    periodo: { order: 93, type: 'text', label: 'Periodo rotario', institutional: true },
};

export const isInstitutional = (key) => !!FIELD_SPECS[key]?.institutional;

// Las claves que el administrador puede asignar A MANO desde el editor, con la
// etiqueta y el tipo de nodo al que le sirven. Es lo que alimenta el selector
// «Campo vinculado» de Propiedades. No es la lista COMPLETA de lo que se puede
// declarar —desde v4.723 se admite una clave propia, escrita en la pantalla—,
// sino el atajo para los datos que la plataforma ya conoce.
//
// Hace falta porque hasta v4.722 los campos SÓLO existían si el diseño venía de
// una plantilla del catálogo: un texto agregado a mano nunca era editable, y
// —peor— corregir a mano el texto de una plantilla lo desvinculaba de su
// variable y lo sacaba del formulario sin avisar. Quien arma un diseño desde
// cero no tenía forma de publicarlo con campos.
export const ASSIGNABLE_FIELDS = Object.entries(FIELD_SPECS)
    .filter(([, s]) => !s.institutional)
    .map(([key, s]) => ({
        key, label: s.label, type: s.type,
        forNode: s.type === 'image' ? 'image' : 'text',
        kind: defaultKindFor(key, s.type === 'image' ? 'image' : 'text'),
    }))
    .sort((a, b) => (FIELD_SPECS[a.key].order || 999) - (FIELD_SPECS[b.key].order || 999));

// ─── Qué variables usa un documento ────────────────────────────────────
export const variablesOf = (document) => {
    const found = new Set();
    for (const node of document?.nodes || []) {
        if (node?.srcText) variablesUsedIn(node.srcText).forEach(v => found.add(v));
        if (node?.srcVar) found.add(node.srcVar);
        if (node?.requiresVar) found.add(node.requiresVar);
    }
    return [...found];
};

// ─── El formulario público ─────────────────────────────────────────────
//
// `locked` es la decisión del administrador: qué variables, de las que el
// documento usa, quedan congeladas con el valor con el que se publicó. Las
// institucionales están bloqueadas por omisión y hay que desbloquearlas a
// propósito (`unlock`), no al revés — un valor por defecto permisivo en un
// portal sin autenticación es la clase de error que no se descubre hasta que
// alguien lo usa mal.
//
// ── LO QUE DECLARA EL NODO MANDA SOBRE EL CATÁLOGO ──────────────────
//
// Hasta v4.722 el formulario salía ENTERO del catálogo: `FIELD_SPECS` decidía
// la etiqueta, la ayuda y si el campo era obligatorio, iguales para todas las
// plantillas. Eso alcanzaba con dos plantillas de aniversario y deja de
// alcanzar en cuanto la misma variable significa cosas distintas en dos piezas
// —«Fecha» es la del aniversario en una y la de la reunión en otra—.
//
// Ahora el catálogo es el VALOR POR DEFECTO y la declaración del nodo
// (`node.field`) lo pisa campo por campo. Y una clave DECLARADA que el catálogo
// no conoce entra igual: es lo que permite agregar un campo nuevo marcándolo en
// la pantalla, sin tocar código, que es el requisito de escalabilidad del
// pedido.
//
// `visible: false` NO produce campo: el dato existe en la pieza pero lo fija
// quien publica, con su valor por defecto. Es distinto de `locked`, que es la
// misma decisión tomada en el momento de publicar.
export const buildPublicFields = (document, { locked = [], unlock = [], labels = {} } = {}) => {
    const lockedSet = new Set(locked);
    const unlockSet = new Set(unlock);
    const declared = declarationsOf(document);

    return variablesOf(document)
        // Resoluble: o está en el catálogo, o algún nodo la declara. Una clave
        // que no cumple ninguna de las dos no la puede llenar nadie.
        .filter(key => FIELD_SPECS[key] || declared.has(key))
        .filter(key => !lockedSet.has(key))
        .filter(key => declared.get(key)?.visible !== false)
        // Lo institucional sigue bloqueado POR OMISIÓN. Declararlo en el nodo no
        // lo abre: en un portal sin autenticación, la firma del Distrito sólo se
        // suelta a propósito, al publicar.
        .filter(key => !isInstitutional(key) || unlockSet.has(key))
        .map(key => fieldFor(key, declared.get(key), labels[key]))
        .sort((a, b) => a.order - b.order);
};

// Un campo del formulario, resuelto: catálogo + declaración del nodo.
export const fieldFor = (key, decl, labelOverride) => {
    const spec = FIELD_SPECS[key] || {};
    const kind = decl?.kind || spec.kind || defaultKindFor(key, spec.type === 'image' ? 'image' : 'text');
    const kindSpec = FIELD_KINDS[kind] || FIELD_KINDS.texto;
    const type = spec.type || kindSpec.input;

    return {
        key,
        // `type` es qué control dibuja el formulario; `kind` es QUÉ CLASE de
        // dato es, y es lo que decide cómo se adapta una imagen. Un logotipo y
        // una fotografía comparten `type: 'image'` y no se tratan igual.
        type,
        kind,
        label: labelOverride || decl?.label || spec.label || VARIABLES[key]?.label || key,
        placeholder: decl?.placeholder || spec.placeholder || '',
        help: decl?.help || spec.help || kindSpec.help || '',
        maxChars: (type === 'image' ? null : (decl?.maxChars || spec.maxChars || kindSpec.maxChars || null)),
        required: decl ? !!decl.required : !!spec.required,
        ai: !!spec.ai,
        // Qué archivos ofrece el selector. No es una validación —el servidor
        // comprueba el tipo real de todos modos— sino no hacerle elegir un PDF
        // a quien va a subir un escudo.
        accept: type === 'image' ? (kindSpec.accept || 'image/*') : null,
        defaultValue: decl?.defaultValue || '',
        // Las reglas de adaptación viajan con el campo para que el portal pueda
        // decirlas ANTES de que alguien suba el archivo, en vez de que se
        // enteren por el resultado.
        image: type === 'image' ? { ...(FIELD_KINDS[kind]?.image || FIELD_KINDS.foto.image), ...(decl?.image || {}) } : null,
        order: spec.order || (isImageKind(kind) ? 5 : 500),
    };
};

// ─── Los valores que llegan del público ────────────────────────────────
//
// Se aceptan SÓLO las claves del formulario declarado. Lo demás se descarta y
// se reporta: un intento de mandar `logo` o `gobernador` no es un error del
// usuario, es algo que el operador quiere ver.
export const sanitizeValues = (raw, fields) => {
    const allowed = new Map(fields.map(f => [f.key, f]));
    const values = {};
    const rejected = [];
    const errors = [];

    for (const [key, value] of Object.entries(raw || {})) {
        const field = allowed.get(key);
        if (!field) { rejected.push(key); continue; }
        let v = typeof value === 'string' ? value : value == null ? '' : String(value);

        if (field.type === 'image') {
            // Una imagen llega como URL de nuestro almacenamiento o como data
            // URL de una subida. Nada más: un `src` arbitrario convertiría la
            // pieza en un hueco por donde meter cualquier cosa, y encima la
            // exportación lo pediría desde el navegador de quien la genere.
            if (v && !isAcceptableImage(v)) { errors.push(`La imagen de «${field.label}» no tiene un origen aceptado.`); continue; }
        } else {
            v = v.replace(/\s+\n/g, '\n').trim();
            // El tope sale del campo, no de un número escrito acá: un campo
            // declarado puede pedir más o menos que el del catálogo.
            if (field.type === 'number') v = v.replace(/\D/g, '');
            if (field.maxChars && v.length > field.maxChars) v = v.slice(0, field.maxChars);
        }
        values[key] = v;
    }

    for (const f of fields) {
        if (f.required && !values[f.key]) errors.push(`Falta ${f.label.toLowerCase()}.`);
    }
    return { values, rejected, errors, ok: errors.length === 0 };
};

const IMAGE_HOSTS = /(^|\.)(amazonaws\.com|clubplatform\.org|cloudfront\.net)$/i;
export const isAcceptableImage = (src) => {
    const s = String(src || '');
    if (s.startsWith('data:image/')) return true;
    try {
        const u = new URL(s);
        return u.protocol === 'https:' && IMAGE_HOSTS.test(u.host);
    } catch { return false; }
};

// ─── Hornear lo institucional antes de servir ──────────────────────────
//
// El documento que sale al público lleva el logotipo, el distrito, el
// gobernador y el periodo YA RESUELTOS, y sólo conserva como marcador las
// variables que el formulario ofrece. Dos cosas se siguen de eso:
//
//   · La vista previa del portal es LOCAL e instantánea: el navegador sustituye
//     los pocos marcadores que quedan con `applyVariables`, el mismo que usa el
//     editor. No hay una petición por pulsación.
//   · La firma de la pieza no viaja como un dato que el navegador pueda
//     cambiar: viaja ya impresa en el texto del nodo. Aunque alguien altere lo
//     que manda, el nombre del Gobernador ya está adentro.
//
// Sustituye SÓLO las claves congeladas. Un `{{club}}` sigue siendo `{{club}}`
// —lo va a llenar la persona—, mientras que `resolveVariables` lo borraría por
// no tener valor. Esa distinción es todo el motivo de que esta función exista.
export const bakeFrozen = (document, frozen = {}) => {
    const keys = Object.keys(frozen).filter(k => String(frozen[k] ?? '') !== '');
    const nodes = [];

    for (const node of document?.nodes || []) {
        // Un nodo decorativo que dependía de una variable congelada ya no
        // depende de nada: su condición está resuelta y no vuelve a evaluarse.
        if (node.requiresVar && keys.includes(node.requiresVar)) {
            nodes.push({ ...node, requiresVar: null });
            continue;
        }
        if (node.type === 'text' && node.srcText) {
            const src = keys.reduce(
                (t, k) => t.replace(new RegExp(`\\{\\{\\s*${k}\\s*\\}\\}`, 'g'), String(frozen[k])),
                node.srcText
            );
            const stillHasVars = variablesUsedIn(src).length > 0;
            nodes.push({
                ...node,
                srcText: stillHasVars ? src : null,
                // Sin marcadores pendientes, el texto queda fijo: el navegador
                // ya no tiene nada que resolver ahí.
                text: stillHasVars ? node.text : src.replace(/[ \t]{2,}/g, ' ').trim(),
            });
            continue;
        }
        if (node.type === 'image' && node.srcVar && keys.includes(node.srcVar)) {
            nodes.push({ ...node, src: String(frozen[node.srcVar]), srcVar: null });
            continue;
        }
        nodes.push(node);
    }
    return { ...document, nodes };
};

// ─── Aplicar los valores del público (servidor) ────────────────────────
//
// Sólo lo usa el camino que compone del lado del servidor —hoy, la comprobación
// de qué falta—. La vista previa del portal no pasa por acá: aplica los valores
// en el navegador sobre el documento ya horneado.
//
// Toma los nodos GUARDADOS y les sustituye texto e imágenes. No recibe nodos
// del navegador, así que no hay forma de mover, recolorear ni borrar nada: es
// la garantía estructural de la que habla la cabecera. Los congelados ganan
// siempre sobre lo que llegue de afuera, aunque `sanitizeValues` ya lo hubiera
// descartado — dos cierres sobre lo mismo, a propósito.
// `fillable` son las claves que el formulario OFRECE. Espejo de la misma regla
// en `src/lib/designSpec.ts`: **no se borra lo que nadie puede llenar**. Un
// marcador que ni se ofrece ni quedó congelado se resolvía contra un
// diccionario vacío y dejaba el nodo en blanco, en una pieza que nadie podía
// corregir después. Sin `fillable` se conserva el comportamiento de siempre.
export const applyPublicValues = (document, values = {}, frozen = {}, fillable = null) => {
    const all = { ...values, ...frozen };
    const missing = new Set();
    const puede = fillable ? new Set(fillable) : null;
    const resoluble = (key) => !puede || puede.has(key) || all[key] !== undefined;

    const nodes = [];
    for (const node of document?.nodes || []) {
        if (node.requiresVar && resoluble(node.requiresVar)) {
            const v = all[node.requiresVar];
            if (v === undefined || v === null || String(v).trim() === '') { missing.add(node.requiresVar); continue; }
        }
        if (node.type === 'text' && node.srcText) {
            if (!variablesUsedIn(node.srcText).every(resoluble)) { nodes.push(node); continue; }
            const r = resolveVariables(node.srcText, all);
            r.missing.forEach(m => missing.add(m));
            if (node.dropIfEmpty && (r.missing.length || !r.text)) continue;
            nodes.push({ ...node, text: r.text });
            continue;
        }
        if (node.type === 'image' && node.srcVar) {
            if (!resoluble(node.srcVar)) { nodes.push(node); continue; }
            const v = all[node.srcVar];
            if (!v) { missing.add(node.srcVar); if (node.dropIfEmpty) continue; nodes.push({ ...node, src: null }); continue; }
            nodes.push({ ...node, src: String(v) });
            continue;
        }
        nodes.push(node);
    }

    return { ...document, nodes, missing: [...missing] };
};

// ─── Lo que el público llena NO se publica con el valor del panel ──────
//
// En el editor, un nodo de imagen atado a `{{logo}}` tiene en `src` el escudo
// del club del administrador: `applyVariables` se lo puso al pintarlo. Si ese
// documento se guarda tal cual, el logotipo de ESE club queda dentro de la
// plantilla publicada y viaja a cualquiera que abra el enlace.
//
// Con el logotipo institucional el problema no existía —quedaba congelado a
// propósito—. Desde que es un campo público hay que vaciarlo: lo que se publica
// es el hueco, no el ejemplo con el que se diseñó. Sólo se vacían las claves que
// el formulario ofrece; una bloqueada la vuelve a llenar `bakeFrozen`.
export const stripPublicDefaults = (document, fields = []) => {
    const publicKeys = new Set(fields.map(f => f.key));
    if (!publicKeys.size) return document;

    const nodes = (document?.nodes || []).map(node =>
        node.type === 'image' && node.srcVar && publicKeys.has(node.srcVar) && node.src
            ? { ...node, src: null }
            : node
    );
    return { ...document, nodes };
};

// ─── La dirección pública ──────────────────────────────────────────────
//
// El slug es lo que se comparte por WhatsApp. Se normaliza duro —sin tildes,
// sin espacios, sin mayúsculas— porque tiene que sobrevivir a que alguien lo
// escriba a mano, y se reservan las palabras que ya son rutas del sitio.
const RESERVED = new Set(['admin', 'api', 'public', 'login', 'nuevo', 'new', 'plantillas', 'assets', 'static']);

export const slugify = (raw) => String(raw || '')
    .toLowerCase()
    .normalize('NFD').replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 60);

export const validateSlug = (raw) => {
    const slug = slugify(raw);
    if (!slug) return { ok: false, slug: '', error: 'La dirección no puede quedar vacía.' };
    if (slug.length < 3) return { ok: false, slug, error: 'La dirección necesita al menos 3 caracteres.' };
    if (RESERVED.has(slug)) return { ok: false, slug, error: `«${slug}» es una dirección reservada del sitio.` };
    return { ok: true, slug, error: null };
};

export const publicUrl = (slug, origin = '') => `${origin}/plantillas/${slug}`;

// ─── Qué se publica ────────────────────────────────────────────────────
//
// La publicación guarda el DOCUMENTO COMPILADO —los nodos tal como quedaron en
// el editor—, no una referencia a la plantilla del catálogo. Es a propósito:
// si apuntara al catálogo, tocar `designTemplates.js` en un despliegue cambiaría
// piezas que ya se estaban compartiendo por un enlace. Publicar es congelar.
export const buildPublication = ({ document, name, slug, category = 'aniversario', settings = {} }) => {
    const check = validateSlug(slug || name);
    if (!check.ok) throw new Error(check.error);

    const fields = buildPublicFields(document, settings);
    const declared = declarationsOf(document);
    // Lo que el público NO llena queda congelado con el valor con el que se
    // publicó. Se guarda explícito para que la pieza pública no dependa de
    // volver a consultar el club: un enlace compartido tiene que seguir
    // funcionando igual dentro de un año.
    //
    // Un campo declarado `visible: false` se congela con SU valor por defecto:
    // apagarlo significa «este dato lo fijo yo», y sin esta línea el nodo
    // quedaría con el marcador sin resolver, que es el hueco que el módulo
    // existe para no dejar.
    const frozen = {};
    for (const key of variablesOf(document)) {
        if (fields.some(f => f.key === key)) continue;
        const v = settings.frozen?.[key] ?? declared.get(key)?.defaultValue;
        if (v !== undefined && v !== null && String(v) !== '') frozen[key] = String(v);
    }

    return {
        slug: check.slug,
        name: String(name || 'Plantilla').slice(0, 120),
        category,
        format: document?.format || 'post_1_1',
        // El documento que se GUARDA, sin los valores de ejemplo del panel.
        document: stripPublicDefaults(document, fields),
        fields: withSamples(fields, document),
        frozen,
        intro: String(settings.intro || '').slice(0, 400),
    };
};

// ─── El EJEMPLO es del CAMPO, no del NODO ──────────────────────────────
//
// El administrador diseña con una imagen puesta —el escudo de algún club— y
// quien abre el enlace quiere ver cómo va a quedar la pieza antes de subir la
// suya. Las dos cosas son ciertas y parecen contradictorias, así que conviene
// separar bien qué es cada una:
//
//   · Dejar esa imagen en `src` del NODO es el defecto de v4.722.3: la pieza se
//     dibuja con ella, se EXPORTA con ella, y un club que descargue sin subir
//     nada se lleva el escudo de otro. `stripPublicDefaults` la sigue vaciando y
//     eso no cambia.
//   · Guardarla como `sample` del CAMPO es otra cosa: es una ilustración de
//     dónde y cómo va a caer el archivo. El portal la dibuja DENTRO del recuadro
//     de la guía —que no es un nodo y no se exporta—, atenuada y rotulada como
//     ejemplo. En el archivo descargado no está.
//
// Por eso el ejemplo viaja acá y no ahí. Si algún día se necesita en el
// documento, la respuesta sigue siendo no.
const withSamples = (fields, document) => {
    const porClave = new Map();
    for (const node of document?.nodes || []) {
        if (node?.type !== 'image' || !node.srcVar || porClave.has(node.srcVar)) continue;
        if (node.src && isAcceptableImage(node.src)) porClave.set(node.srcVar, String(node.src));
    }
    return fields.map(f => (f.type === 'image' && porClave.has(f.key)
        ? { ...f, sample: porClave.get(f.key) }
        : f));
};

// ─── Con qué ajustes se REHACE una publicación ya existente ────────────
//
// Guardar un diseño publicado rehace su publicación (v4.729), y para que salga
// igual hay que rehacerla con los MISMOS ajustes: qué campos quedaron
// bloqueados, qué se congeló, qué texto de introducción lleva. Desde v4.729 eso
// se guarda en `settings`.
//
// El problema es TODA publicación anterior a esa versión: la columna nació con
// `{}`, así que rehacerlas con `settings` a secas las publicaría con los
// ajustes por defecto —sin nada bloqueado y sin nada congelado—. Las
// consecuencias no son cosméticas:
//
//   · La firma del Distrito desaparecería de la pieza. `frozen` es donde vive
//     el nombre del Gobernador ya resuelto; sin él, el nodo se queda con el
//     marcador y el portal no lo ofrece ni lo llena nadie.
//   · Un campo que el administrador BLOQUEÓ al publicar volvería a salir en el
//     formulario público. Aflojar un cierre por lo bajo es peor que no tener la
//     función: quien lo bloqueó no se entera.
//
// Nada de eso hace falta adivinarlo, porque la fila guarda el RESULTADO de esos
// ajustes: `frozen` son los valores congelados y `fields` es el formulario que
// salió. De ahí se deducen los ajustes que lo produjeron.
//
// La deducción se hace contra el documento PUBLICADO (`row.document`), no
// contra el nuevo: `row.fields` se derivó de aquél. Contra el nuevo, una
// variable que el administrador acaba de marcar se leería como «no salía en el
// formulario, luego estaba bloqueada» y nunca llegaría a ofrecerse — que es
// justo lo contrario de lo que acaba de pedir.
export const settingsForRefresh = (row) => {
    const s = { ...(row?.settings || {}) };
    const fields = Array.isArray(row?.fields) ? row.fields : [];
    const previos = variablesOf(row?.document);
    const ofrecidos = new Set(fields.map(f => f?.key).filter(Boolean));

    if (!s.frozen || !Object.keys(s.frozen).length) {
        const previo = row?.frozen && typeof row.frozen === 'object' ? row.frozen : null;
        if (previo && Object.keys(previo).length) s.frozen = { ...previo };
    }
    if (!Array.isArray(s.locked)) {
        // Una variable que el documento publicado usaba, que no es
        // institucional —ésas se bloquean solas— y que aun así no salió como
        // campo: la bloqueó quien publicó.
        s.locked = previos.filter(k => !isInstitutional(k) && !ofrecidos.has(k));
    }
    if (!Array.isArray(s.unlock)) {
        // Y al revés: una institucional que SÍ salía como campo se soltó a
        // propósito. Sin recuperarlo, volvería a quedar bloqueada.
        s.unlock = previos.filter(k => isInstitutional(k) && ofrecidos.has(k));
    }
    if (s.intro === undefined && row?.intro) s.intro = row.intro;
    return s;
};

export default {
    FIELD_SPECS, ASSIGNABLE_FIELDS, isInstitutional, variablesOf, buildPublicFields, fieldFor,
    sanitizeValues, isAcceptableImage, bakeFrozen, applyPublicValues,
    stripPublicDefaults, slugify, validateSlug, publicUrl, buildPublication, settingsForRefresh,
};
