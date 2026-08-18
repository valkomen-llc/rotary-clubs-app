// LOS MÉTODOS DE PAGO DE LA PLATAFORMA. Puro: sin base, sin red, sin DOM.
//
// v4.868 — El catálogo y su estado.
//
// ═════════════════════════════════════════════════════════════════════
// DOS COSAS DISTINTAS: CONFIGURADO Y ACTIVADO
// ═════════════════════════════════════════════════════════════════════
//
// CONFIGURADO lo dice el ENTORNO: si están las credenciales del proveedor. No
// se puede cambiar desde el panel y no debe poder cambiarse — el secreto vive
// en las variables de Vercel y no en la base, así que un volcado de la base no
// se lleva la llave de cobro y los entornos de preview y producción pueden
// tener cuentas distintas.
//
// ACTIVADO lo decide el OPERADOR desde el panel, y es lo que faltaba: «primero
// debemos habilitarlas, con el objetivo de que la persona tenga diferentes
// herramientas para hacer sus aportes».
//
// Un método se OFRECE cuando las dos cosas son ciertas. Separarlas es lo que
// permite tener las credenciales cargadas y el método todavía apagado mientras
// se prueba — que es exactamente el caso de PayPal en sandbox.
//
// ⚠️ EL DINERO SIGUE ENTRANDO A LA CUENTA DE LA PLATAFORMA en todos los
// métodos. Esto activa y desactiva DÓNDE se ofrece cada uno, no a qué cuenta
// entra: `PaymentProviderConfig` modela cuentas por club y sigue sin usarse,
// porque con el dinero yendo directo al club la retención no se podría aplicar
// y el saldo de la Bóveda dejaría de ser real.

/**
 * El catálogo. CERRADO: un método que no esté acá no se puede activar ni
 * ofrecer, así que no puede aparecer una vía de cobro que nadie declaró.
 *
 * `env` enumera las variables SIN LAS CUALES el método no funciona. Es lo que
 * hace que el panel pueda decir qué falta en vez de un «no configurado» a secas.
 */
export const PAYMENT_METHODS = [
    {
        id: 'card',
        label: 'Tarjeta de débito o crédito',
        provider: 'stripe',
        help: 'La vía de siempre. Procesa Stripe.',
        env: ['STRIPE_SECRET_KEY'],
        optionalEnv: ['STRIPE_WEBHOOK_SECRET'],
        // ⚠️ Viene ACTIVADO. Es la única vía de cobro que existía hasta v4.866:
        // si naciera apagada, desplegar esto dejaría a toda la plataforma sin
        // poder recibir aportes.
        defaultEnabled: true,
    },
    {
        id: 'paypal',
        label: 'PayPal',
        provider: 'paypal',
        help: 'El donante paga con su cuenta de PayPal. El dinero entra a la cuenta de la plataforma.',
        env: ['PAYPAL_CLIENT_ID', 'PAYPAL_CLIENT_SECRET'],
        optionalEnv: ['PAYPAL_WEBHOOK_ID', 'PAYPAL_CURRENCY'],
        // Apagado hasta que alguien lo encienda a propósito, aunque las
        // credenciales estén cargadas. Es el paso que se pidió.
        defaultEnabled: false,
    },
];

export const METHOD_IDS = PAYMENT_METHODS.map(m => m.id);

export const methodById = (id) => PAYMENT_METHODS.find(m => m.id === id) || null;

/** La llave de `PlatformConfig` donde vive lo activado. */
export const PAYMENT_METHODS_KEY = 'payment_methods';

/**
 * El estado de un método, leyendo el entorno.
 *
 * ⚠️ NUNCA devuelve el secreto, ni recortado. Un panel que muestra los últimos
 * cuatro caracteres de una llave de cobro no ayuda a nadie a diagnosticar y sí
 * filtra: lo único que hace falta saber es si está o no está.
 */
export const methodStatus = (metodo, env = {}) => {
    const faltan = (metodo.env || []).filter(k => !String(env[k] || '').trim());
    const faltanOpcionales = (metodo.optionalEnv || []).filter(k => !String(env[k] || '').trim());
    return {
        configured: faltan.length === 0,
        missing: faltan,
        missingOptional: faltanOpcionales,
    };
};

/**
 * Qué métodos hay, con su estado y si están activados.
 *
 * `config` es lo guardado: `{ [id]: { enabled: boolean } }`. Lo que no esté
 * declarado conserva su valor por defecto — misma regla aditiva que
 * `mergeRules` con las tarifas: un guardado parcial no puede apagar la única
 * vía de cobro.
 */
export const resolveMethods = (config, env = {}) => PAYMENT_METHODS.map(m => {
    const estado = methodStatus(m, env);
    const guardado = config?.[m.id];
    const enabled = typeof guardado?.enabled === 'boolean' ? guardado.enabled : m.defaultEnabled;
    return {
        id: m.id,
        label: m.label,
        provider: m.provider,
        help: m.help,
        ...estado,
        enabled,
        // Se OFRECE sólo si las dos cosas son ciertas. Activar sin credenciales
        // no hace aparecer el botón — y el panel lo dice en vez de dejar a
        // alguien esperando que aparezca.
        offered: enabled && estado.configured,
        // El motivo por el que NO se ofrece. Un método que no aparece sin
        // explicación es indistinguible de uno roto.
        reason: !estado.configured ? 'sin_credenciales' : (!enabled ? 'desactivado' : null),
    };
});

export const MOTIVOS = {
    sin_credenciales: 'Faltan las credenciales del proveedor en las variables de entorno.',
    desactivado: 'Está configurado pero todavía no se activó desde el panel.',
};

/** ¿Se ofrece este método? Lo consulta el camino público. */
export const isMethodOffered = (id, config, env = {}) =>
    !!resolveMethods(config, env).find(m => m.id === id)?.offered;

/**
 * Valida lo que llega del panel. El operador escribe, el CÓDIGO decide.
 *
 * Sólo se acepta `enabled` y sólo de los métodos del catálogo: nada más se
 * puede ni expresar en la petición. Es el patrón `stripProtected` — esconder
 * campos en la pantalla no protege de quien conoce el endpoint.
 */
export const validateMethods = (input, env = {}) => {
    const out = {};
    const errors = [];
    const warnings = [];

    for (const [id, val] of Object.entries(input || {})) {
        const m = methodById(id);
        if (!m) { errors.push(`«${id}» no es un método de pago conocido.`); continue; }
        if (typeof val?.enabled !== 'boolean') { errors.push(`${m.label}: «activado» tiene que ser verdadero o falso.`); continue; }
        out[id] = { enabled: val.enabled };

        // Activar sin credenciales no es un error —se puede dejar listo y
        // cargar las variables después— pero se DICE, o alguien lo enciende y
        // se queda esperando un botón que no va a aparecer.
        if (val.enabled) {
            const { configured, missing } = methodStatus(m, env);
            if (!configured) warnings.push(`${m.label} quedó activado pero no se ofrecerá: falta ${missing.join(' y ')}.`);
        }
    }

    // ⚠️ Que no queden CERO métodos ofrecidos. Sin ninguno, la plataforma deja
    // de poder recibir aportes y el modal se queda sin botones — eso no se
    // descubre hasta que alguien intenta donar.
    const resultado = resolveMethods({ ...defaultConfig(), ...out }, env);
    if (!resultado.some(m => m.offered)) {
        warnings.push('Ningún método quedaría disponible: nadie podría aportar hasta que actives al menos uno con sus credenciales cargadas.');
    }

    return { methods: out, errors, warnings };
};

/** Lo activado por defecto, para que un guardado parcial no apague nada. */
export const defaultConfig = () =>
    Object.fromEntries(PAYMENT_METHODS.map(m => [m.id, { enabled: m.defaultEnabled }]));

/** Mezcla lo guardado sobre los valores por defecto. Aditivo, como `mergeRules`. */
export const mergeMethods = (saved) => {
    const out = defaultConfig();
    for (const [id, val] of Object.entries(saved || {})) {
        if (!methodById(id)) continue;
        if (typeof val?.enabled === 'boolean') out[id] = { enabled: val.enabled };
    }
    return out;
};

/**
 * Lee lo guardado, que llega como texto desde `PlatformConfig`.
 *
 * NUNCA lanza: esto corre en el camino del cobro. Una configuración ilegible
 * degrada a los valores por defecto —la tarjeta activada— en vez de dejar la
 * plataforma sin poder recibir aportes.
 */
export const parseMethods = (raw) => {
    if (!raw) return defaultConfig();
    try {
        return mergeMethods(typeof raw === 'string' ? JSON.parse(raw) : raw);
    } catch (e) {
        console.warn(`[PAYMENT-METHODS] Configuración ilegible, se usan los valores por defecto: ${e?.message}`);
        return defaultConfig();
    }
};

export default {
    PAYMENT_METHODS, METHOD_IDS, PAYMENT_METHODS_KEY, MOTIVOS,
    methodById, methodStatus, resolveMethods, isMethodOffered,
    validateMethods, defaultConfig, mergeMethods, parseMethods,
};
