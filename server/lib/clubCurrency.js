// En qué moneda factura un sitio.
//
// v4.843 — Estaba escrito DOS veces: `resolveClubCurrency` en
// `financialController.js` y `siteCurrency` en `payoutController.js`, con la
// misma lógica y distinto nombre. Al necesitarlo también la barra superior
// habrían sido tres, y tres copias de un criterio se separan en silencio —es
// la regla del sitio—. Vive acá y los tres lo importan.
//
// NO decide ningún cobro: para eso está `donationCurrency.js`, que además mira
// el idioma y el país del visitante. Ésta contesta una pregunta más simple —en
// qué moneda trabaja este sitio— y sirve para ORDENAR lo que se muestra y para
// elegir cuál va en los campos sueltos que las APIs conservan de antes.
import db from './db.js';
import { normalizeCurrency } from './money.js';

/**
 * La moneda configurada del sitio, o la que se deduce de su país.
 *
 * Nunca lanza: esto se llama desde pantallas y barras que no pueden caerse
 * porque falte un ajuste. Sin dato, dólares.
 */
export const siteCurrency = async (clubId) => {
    if (!clubId) return 'USD';
    try {
        const s = await db.query(
            'SELECT value FROM "Setting" WHERE key = $1 AND "clubId" = $2 LIMIT 1',
            ['club_currency', clubId]
        );
        if (s.rows[0]?.value) return normalizeCurrency(s.rows[0].value);

        const c = await db.query('SELECT country FROM "Club" WHERE id = $1 LIMIT 1', [clubId]);
        return /colombia|^co$/i.test(String(c.rows[0]?.country || '')) ? 'COP' : 'USD';
    } catch {
        return 'USD';
    }
};

export default siteCurrency;
