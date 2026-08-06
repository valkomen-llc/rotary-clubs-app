// ════════════════════════════════════════════════════════════════════
// Plantillas IA — publicación y portal público
// v4.721.0
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

// ─── Qué es cada variable en un formulario público ─────────────────────
//
// `institutional: true` significa que el valor lo fija la plantilla y el
// público NO lo ve ni lo cambia. No es una preferencia: el nombre del
// Gobernador, el distrito y el logotipo son la firma de la pieza, y una
// felicitación institucional que cualquiera pueda re-firmar no es publicable.
export const FIELD_SPECS = {
    club: { order: 10, type: 'text', label: 'Nombre del club', placeholder: 'Rotary Club Bogotá Centro', maxChars: 90, required: true },
    anios: { order: 20, type: 'number', label: 'Años que cumple', placeholder: '49', maxChars: 3 },
    fecha: { order: 30, type: 'text', label: 'Fecha', placeholder: '4 de agosto', maxChars: 40 },
    ciudad: { order: 40, type: 'text', label: 'Ciudad', placeholder: 'Bogotá', maxChars: 60 },
    presidente: { order: 50, type: 'text', label: 'Presidente del club', placeholder: 'Nombre y apellido', maxChars: 80 },
    titulo: { order: 60, type: 'text', label: 'Título', maxChars: LIMITS.title },
    mensaje: { order: 70, type: 'textarea', label: 'Mensaje', placeholder: 'El texto que va impreso en la pieza', maxChars: LIMITS.message, ai: true },
    imagen: { order: 80, type: 'image', label: 'Fotografía del club', help: 'Se adapta sola al espacio de la plantilla.' },

    // Institucionales: los fija la plantilla publicada.
    logo: { order: 90, type: 'image', label: 'Logotipo', institutional: true },
    distrito: { order: 91, type: 'text', label: 'Distrito', institutional: true },
    gobernador: { order: 92, type: 'text', label: 'Gobernador', institutional: true },
    periodo: { order: 93, type: 'text', label: 'Periodo rotario', institutional: true },
};

export const isInstitutional = (key) => !!FIELD_SPECS[key]?.institutional;

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
export const buildPublicFields = (document, { locked = [], unlock = [], labels = {} } = {}) => {
    const lockedSet = new Set(locked);
    const unlockSet = new Set(unlock);

    return variablesOf(document)
        .filter(key => FIELD_SPECS[key])
        .filter(key => !lockedSet.has(key))
        .filter(key => !isInstitutional(key) || unlockSet.has(key))
        .map(key => {
            const spec = FIELD_SPECS[key];
            return {
                key,
                type: spec.type,
                label: labels[key] || spec.label || VARIABLES[key]?.label || key,
                placeholder: spec.placeholder || '',
                help: spec.help || '',
                maxChars: spec.maxChars || null,
                required: !!spec.required,
                ai: !!spec.ai,
            };
        })
        .sort((a, b) => (FIELD_SPECS[a.key].order || 999) - (FIELD_SPECS[b.key].order || 999));
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
            if (field.maxChars && v.length > field.maxChars) v = v.slice(0, field.maxChars);
            if (field.type === 'number') v = v.replace(/\D/g, '').slice(0, 3);
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
export const applyPublicValues = (document, values = {}, frozen = {}) => {
    const all = { ...values, ...frozen };
    const missing = new Set();

    const nodes = [];
    for (const node of document?.nodes || []) {
        if (node.requiresVar) {
            const v = all[node.requiresVar];
            if (v === undefined || v === null || String(v).trim() === '') { missing.add(node.requiresVar); continue; }
        }
        if (node.type === 'text' && node.srcText) {
            const r = resolveVariables(node.srcText, all);
            r.missing.forEach(m => missing.add(m));
            if (node.dropIfEmpty && (r.missing.length || !r.text)) continue;
            nodes.push({ ...node, text: r.text });
            continue;
        }
        if (node.type === 'image' && node.srcVar) {
            const v = all[node.srcVar];
            if (!v) { missing.add(node.srcVar); if (node.dropIfEmpty) continue; nodes.push({ ...node, src: null }); continue; }
            nodes.push({ ...node, src: String(v) });
            continue;
        }
        nodes.push(node);
    }

    return { ...document, nodes, missing: [...missing] };
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
    // Lo que el público NO llena queda congelado con el valor con el que se
    // publicó. Se guarda explícito para que la pieza pública no dependa de
    // volver a consultar el club: un enlace compartido tiene que seguir
    // funcionando igual dentro de un año.
    const frozen = {};
    for (const key of variablesOf(document)) {
        if (fields.some(f => f.key === key)) continue;
        const v = settings.frozen?.[key];
        if (v !== undefined && v !== null && String(v) !== '') frozen[key] = String(v);
    }

    return {
        slug: check.slug,
        name: String(name || 'Plantilla').slice(0, 120),
        category,
        format: document?.format || 'post_1_1',
        fields,
        frozen,
        intro: String(settings.intro || '').slice(0, 400),
    };
};

export default {
    FIELD_SPECS, isInstitutional, variablesOf, buildPublicFields,
    sanitizeValues, isAcceptableImage, bakeFrozen, applyPublicValues,
    slugify, validateSlug, publicUrl, buildPublication,
};
