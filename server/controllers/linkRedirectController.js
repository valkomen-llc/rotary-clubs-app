// La API del módulo «Redirecciones de Enlaces».
//
// EL SITIO SALE DEL TOKEN, NUNCA DEL CUERPO. Si `clubId` viajara en la
// petición, acotar las redirecciones a un sitio no serviría de nada: cualquiera
// con el endpoint crearía una dirección corta en el dominio de otra
// organización. Sólo el operador de la plataforma puede pedir otro sitio, y por
// query, que es lo que su rol ya le permite.
//
// Y el aislamiento va en el `WHERE` del store, no en esta capa: para quien
// pregunta por una redirección ajena, esa redirección NO EXISTE (404, nunca
// 403 — confirmar que existe es la mitad de lo que hace falta para ir a
// buscarla).
import {
    listRedirects, getRedirect, createRedirect, updateRedirect,
    setRedirectStatus, deleteRedirect, statsFor, listAudit,
} from '../lib/linkRedirectStore.js';

const OPERADOR = 'administrator';

/** Quién pregunta y por qué sitio. */
function alcance(req) {
    const rol = req.user?.role;
    const esOperador = rol === OPERADOR;
    const pedido = String(req.query?.clubId || '').trim();
    const clubId = esOperador && pedido ? pedido : (req.user?.clubId || '');
    return { clubId, esOperador };
}

/** El autor del cambio, para la traza administrativa. */
function actorDe(req) {
    return {
        id: req.user?.id || req.user?.userId || null,
        name: req.user?.name || req.user?.email || '',
    };
}

function sinSitio(res) {
    return res.status(400).json({
        error: 'Tu sesión no tiene un sitio asociado, así que no hay redirecciones que administrar.',
    });
}

export const list = async (req, res) => {
    try {
        const { clubId } = alcance(req);
        if (!clubId) return sinSitio(res);
        const data = await listRedirects(clubId, {
            page: req.query.page,
            perPage: req.query.perPage,
            q: req.query.q || '',
            status: req.query.status || '',
        });
        res.json(data);
    } catch (e) {
        console.error('[redirects] list:', e);
        res.status(500).json({ error: 'No se pudieron leer las redirecciones.', detail: e.message });
    }
};

export const create = async (req, res) => {
    try {
        const { clubId } = alcance(req);
        if (!clubId) return sinSitio(res);
        const r = await createRedirect({
            clubId,
            slug: req.body?.slug,
            target: req.body?.target,
            permanent: req.body?.permanent,
            forwardQuery: req.body?.forwardQuery,
            notes: req.body?.notes,
            actor: actorDe(req),
        });
        if (!r.ok) return res.status(r.status || 400).json({ error: r.error });
        res.status(201).json(r.link);
    } catch (e) {
        console.error('[redirects] create:', e);
        res.status(500).json({ error: 'No se pudo crear la redirección.', detail: e.message });
    }
};

export const update = async (req, res) => {
    try {
        const { clubId } = alcance(req);
        if (!clubId) return sinSitio(res);
        const r = await updateRedirect(req.params.id, clubId, req.body || {}, actorDe(req));
        if (!r.ok) return res.status(r.status || 400).json({ error: r.error });
        res.json(r.link);
    } catch (e) {
        console.error('[redirects] update:', e);
        res.status(500).json({ error: 'No se pudo guardar la redirección.', detail: e.message });
    }
};

export const setStatus = async (req, res) => {
    try {
        const { clubId } = alcance(req);
        if (!clubId) return sinSitio(res);
        const r = await setRedirectStatus(req.params.id, clubId, req.body?.status, actorDe(req));
        if (!r.ok) return res.status(r.status || 400).json({ error: r.error });
        res.json(r.link);
    } catch (e) {
        console.error('[redirects] status:', e);
        res.status(500).json({ error: 'No se pudo cambiar el estado.', detail: e.message });
    }
};

/**
 * Eliminar EXIGE confirmación explícita (428 si falta). No es ceremonia: una
 * dirección corta puede estar impresa en un pendón y repartida por WhatsApp, y
 * quitarla rompe cada uno de esos enlaces a la vez.
 */
export const remove = async (req, res) => {
    try {
        const { clubId } = alcance(req);
        if (!clubId) return sinSitio(res);
        if (req.body?.confirm !== true && req.query?.confirm !== 'true') {
            return res.status(428).json({
                error: 'Falta la confirmación. Eliminar una redirección rompe todos los enlaces ya repartidos con esa dirección.',
            });
        }
        const r = await deleteRedirect(req.params.id, clubId, actorDe(req));
        if (!r.ok) return res.status(r.status || 400).json({ error: r.error });
        res.json({ ok: true });
    } catch (e) {
        console.error('[redirects] delete:', e);
        res.status(500).json({ error: 'No se pudo eliminar la redirección.', detail: e.message });
    }
};

export const stats = async (req, res) => {
    try {
        const { clubId } = alcance(req);
        if (!clubId) return sinSitio(res);
        const r = await statsFor(req.params.id, clubId, { period: req.query.period || 'd30' });
        if (!r.ok) return res.status(r.status || 400).json({ error: r.error });
        res.json(r);
    } catch (e) {
        console.error('[redirects] stats:', e);
        res.status(500).json({ error: 'No se pudieron leer las estadísticas.', detail: e.message });
    }
};

export const audit = async (req, res) => {
    try {
        const { clubId } = alcance(req);
        if (!clubId) return sinSitio(res);
        const link = await getRedirect(req.params.id, clubId);
        if (!link) return res.status(404).json({ error: 'Esa redirección no existe.' });
        res.json({ items: await listAudit(req.params.id, clubId, req.query.limit) });
    } catch (e) {
        console.error('[redirects] audit:', e);
        res.status(500).json({ error: 'No se pudo leer el historial.', detail: e.message });
    }
};

export default { list, create, update, setStatus, remove, stats, audit };
