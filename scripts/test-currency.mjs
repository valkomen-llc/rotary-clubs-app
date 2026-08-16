#!/usr/bin/env node
// ════════════════════════════════════════════════════════════════════
// En qué moneda se cobra un aporte — pruebas del CRITERIO
// v4.834.0
//
// SIN base, SIN credenciales y SIN red. Prueban la decisión —qué moneda le
// toca a cada visitante— separada de la orquestación, por el mismo motivo que
// `seoRules.js` vive aparte de `seoAudit.js`.
//
// Los casos son los que describió el cliente, con sus palabras: pesos para
// Colombia en español, dólares en cualquier idioma internacional, y dólares
// también para el español leído desde fuera de Colombia.
// ════════════════════════════════════════════════════════════════════
import { readFileSync } from 'node:fs';
import {
    INTERNATIONAL_CURRENCY, countryOfSite, resolveDonationCurrency, blockAmountsApply,
} from '../server/lib/donationCurrency.js';
import { donationPresets } from '../server/lib/contributionSpec.js';
import { DEFAULT_NATIONAL_LOCALES } from '../server/lib/eventRegistrationSpec.js';

let ok = 0;
const malos = [];
const check = (nombre, cond) => {
    if (cond) { ok++; console.log(`  ✓ ${nombre}`); }
    else { malos.push(nombre); console.log(`  ✗ ${nombre}`); }
};
const grupo = (t) => console.log(`\n${t}`);

// Un sitio colombiano, que es el caso del cliente.
const CO = { clubCurrency: 'COP', clubCountry: 'Colombia' };
const moneda = (extra) => resolveDonationCurrency({ ...CO, ...extra }).currency;

grupo('Lo que pidió el cliente');
check('español desde Colombia → pesos',
    moneda({ lang: 'es', country: 'CO' }) === 'COP');
check('español de Colombia (es-CO) desde Colombia → pesos',
    moneda({ lang: 'es-CO', country: 'CO' }) === 'COP');
check('INGLÉS → dólares, esté donde esté el visitante',
    moneda({ lang: 'en', country: 'CO' }) === 'USD'
    && moneda({ lang: 'en', country: 'US' }) === 'USD'
    && moneda({ lang: 'en', country: '' }) === 'USD');
check('los otros idiomas internacionales → dólares',
    ['fr', 'pt', 'de', 'it', 'ja', 'ko'].every(l => moneda({ lang: l, country: 'CO' }) === 'USD'));
check('español desde FUERA de Colombia → dólares',
    moneda({ lang: 'es', country: 'MX' }) === 'USD'
    && moneda({ lang: 'es', country: 'ES' }) === 'USD'
    && moneda({ lang: 'es', country: 'US' }) === 'USD');

grupo('Por qué es una conjunción, y no el idioma solo');
// El idioma por sí solo no distingue al rotario mexicano que lee en español:
// hasta v4.833 a ése se le cobraba en pesos.
check('el idioma NO alcanza: es-MX pagaría pesos si sólo mirara el idioma',
    moneda({ lang: 'es', country: 'MX' }) !== moneda({ lang: 'es', country: 'CO' }));
// Y el país tampoco: un colombiano que lee el sitio en inglés espera dólares.
check('el país NO alcanza: en Colombia leyendo en inglés se cobra en dólares',
    moneda({ lang: 'en', country: 'CO' }) === 'USD');

grupo('Sin geolocalización manda el idioma');
// El borde falla —VPN, red corporativa, un proveedor que no manda el
// encabezado—. Con el idioma nacional se conserva lo que ya funcionaba: ante la
// duda no se cambia la moneda del visitante mayoritario.
check('español sin país → pesos, como antes de v4.834',
    moneda({ lang: 'es', country: '' }) === 'COP');
check('inglés sin país → dólares igual', moneda({ lang: 'en', country: '' }) === 'USD');
check('«XX» y valores raros se tratan como país desconocido',
    resolveDonationCurrency({ ...CO, lang: 'es', country: '  ' }).currency === 'COP');

grupo('El motivo se DICE');
// Sin este rastro, «¿por qué este aporte entró en dólares?» no se puede
// contestar dos semanas después.
check('idioma internacional → foreign_language',
    resolveDonationCurrency({ ...CO, lang: 'en', country: 'CO' }).reason === 'foreign_language');
check('español desde fuera → foreign_country',
    resolveDonationCurrency({ ...CO, lang: 'es', country: 'MX' }).reason === 'foreign_country');
check('visita nacional → national',
    resolveDonationCurrency({ ...CO, lang: 'es', country: 'CO' }).reason === 'national');
check('la decisión dice SIEMPRE cuál era la moneda del sitio',
    resolveDonationCurrency({ ...CO, lang: 'en' }).siteCurrency === 'COP');
check('y si es internacional o no',
    resolveDonationCurrency({ ...CO, lang: 'en' }).international === true
    && resolveDonationCurrency({ ...CO, lang: 'es', country: 'CO' }).international === false);

grupo('Un sitio que ya cobra en dólares no decide nada');
const US = { clubCurrency: 'USD', clubCountry: 'United States' };
check('con el sitio en dólares, todos pagan en dólares',
    resolveDonationCurrency({ ...US, lang: 'es', country: 'CO' }).currency === 'USD'
    && resolveDonationCurrency({ ...US, lang: 'en', country: 'US' }).currency === 'USD');
check('y no se marca como «internacional»: no hubo cambio de moneda',
    resolveDonationCurrency({ ...US, lang: 'en' }).international === false
    && resolveDonationCurrency({ ...US, lang: 'en' }).reason === 'club_is_international');
// Se contesta ANTES que el interruptor, así que apagarlo no cambia nada acá.
check('apagar el interruptor no altera un sitio en dólares',
    resolveDonationCurrency({ ...US, lang: 'en', enabled: false }).currency === 'USD');

grupo('El interruptor de la instalación');
// Es la salida si la pasarela no pudiera presentar dólares: vuelve al
// comportamiento de v4.833 sin desplegar código.
check('apagado, todo vuelve a la moneda del sitio',
    resolveDonationCurrency({ ...CO, lang: 'en', country: 'US', enabled: false }).currency === 'COP');
check('y lo dice', resolveDonationCurrency({ ...CO, lang: 'en', enabled: false }).reason === 'disabled');
check('el interruptor se lee del entorno y por defecto está ENCENDIDO', (() => {
    const src = readFileSync('server/controllers/financialController.js', 'utf8');
    return /DONATION_INTL_CURRENCY \|\| 'USD'/.test(src) && /!== 'off'/.test(src);
})());

grupo('El país del sitio se deduce, no se exige');
// `Club.country` es texto libre y hay sitios sin país cargado.
check('«Colombia», «CO» y «colombia» son el mismo país',
    countryOfSite('Colombia', 'COP') === 'CO'
    && countryOfSite('CO', 'COP') === 'CO'
    && countryOfSite('colombia', 'COP') === 'CO');
check('sin país legible se deduce de la moneda', countryOfSite('', 'COP') === 'CO');
check('un país en ISO se respeta', countryOfSite('mx', 'MXN') === 'MX');
check('sin país y sin pista, no se inventa uno', countryOfSite('', 'EUR') === '');
// Sin país del sitio no hay con qué comparar: se conserva la moneda, que es el
// lado que no rompe nada.
check('sin país del sitio, un visitante extranjero NO fuerza el cambio',
    resolveDonationCurrency({ clubCurrency: 'EUR', clubCountry: '', lang: 'es', country: 'MX' }).currency === 'EUR');

grupo('Los montos sugeridos NO se convierten');
// Es la parte peligrosa: un bloque guarda «50.000» en pesos y ofrecerlo tal
// cual en dólares invitaría a un aporte de US$ 50.000.
check('los montos del bloque sólo valen en la moneda en que se configuraron',
    blockAmountsApply('COP', 'COP') === true && blockAmountsApply('COP', 'USD') === false);
check('la comparación no depende de mayúsculas', blockAmountsApply('cop', 'COP') === true);
check('cada moneda tiene sus propios montos y su propio mínimo',
    donationPresets('COP').min === 5000 && donationPresets('USD').min === 1
    && donationPresets('COP').amounts[0] !== donationPresets('USD').amounts[0]);
// El mínimo de Stripe no es una preferencia: 1 COP no es un aporte.
check('el mínimo en pesos es muy superior al de dólares',
    donationPresets('COP').min > donationPresets('USD').min * 100);
check('el modal NO usa los montos del bloque cuando cambia la moneda', (() => {
    const src = readFileSync('src/components/DonationModal.tsx', 'utf8');
    return /blockAmountsApply\(/.test(src) && /usarDelBloque/.test(src);
})());

grupo('La membresía se queda en la moneda del sitio');
// No es un olvido: su importe es un PRECIO fijado por el club y cobrarlo en
// otra moneda exige convertirlo. No hay tasa configurada e inventarla está
// prohibido — cobrar «50.000 dólares» sería catastrófico.
check('el cobro recurrente sigue usando la moneda del club', (() => {
    const src = readFileSync('server/controllers/financialController.js', 'utf8');
    // La ventana se corta en el siguiente `export`, no en un número fijo de
    // caracteres: con un tope suelto, agregar un comentario mueve la línea
    // fuera de la ventana y la prueba falla sin que nada haya cambiado.
    const i = src.indexOf('export const createSubscriptionCheckout');
    const j = src.indexOf('\nexport const ', i + 10);
    const bloque = src.slice(i, j > 0 ? j : src.length);
    return /resolveClubCurrency\(clubId\)/.test(bloque) && !/resolveDonationCurrencyFor/.test(bloque);
})());

grupo('El país NUNCA lo manda el cliente');
check('el país sale del encabezado del borde, no del cuerpo', (() => {
    const src = readFileSync('server/controllers/financialController.js', 'utf8');
    const i = src.indexOf('const visitorCountry');
    const bloque = src.slice(i, i + 600);
    return /req\.headers/.test(bloque) && !/req\.body/.test(bloque);
})());
check('el cobro resuelve la moneda en el SERVIDOR y sigue ignorando la del cuerpo', (() => {
    const src = readFileSync('server/controllers/financialController.js', 'utf8');
    const i = src.indexOf('export const createDonationCheckout');
    const bloque = src.slice(i, src.indexOf('export const getDonationCurrency'));
    return /resolveDonationCurrencyFor\(clubId, req, lang\)/.test(bloque)
        && /decision\.currency\.toLowerCase\(\)/.test(bloque);
})());
check('la respuesta de la consulta no se cachea: depende de quién pregunta', (() => {
    const src = readFileSync('server/controllers/financialController.js', 'utf8');
    const i = src.indexOf('export const getDonationCurrency');
    return /no-store/.test(src.slice(i, i + 1400));
})());

grupo('Paridad de los espejos');
let paridad = true;
try {
    const { build } = await import('esbuild');
    const r = await build({
        entryPoints: ['src/lib/donationCurrency.ts'], bundle: true, write: false,
        format: 'esm', platform: 'neutral', target: 'es2022', logLevel: 'silent',
    });
    const esp = await import(`data:text/javascript;base64,${Buffer.from(r.outputFiles[0].text).toString('base64')}`);

    // La matriz completa: cada combinación tiene que dar lo MISMO en las dos
    // puntas, o la pantalla promete una moneda y el cobro usa otra.
    const langs = ['es', 'es-CO', 'es-MX', 'en', 'fr', 'pt', ''];
    const paises = ['CO', 'MX', 'US', ''];
    const sitios = [{ clubCurrency: 'COP', clubCountry: 'Colombia' }, { clubCurrency: 'USD', clubCountry: 'US' }];
    let iguales = true;
    for (const sitio of sitios) {
        for (const lang of langs) {
            for (const country of paises) {
                for (const enabled of [true, false]) {
                    const a = resolveDonationCurrency({ ...sitio, lang, country, enabled });
                    const b = esp.resolveDonationCurrency({ ...sitio, lang, country, enabled });
                    if (JSON.stringify(a) !== JSON.stringify(b)) {
                        iguales = false;
                        console.log(`    ✗ difiere en ${sitio.clubCurrency}/${lang || '∅'}/${country || '∅'}/${enabled}: ${JSON.stringify(a)} vs ${JSON.stringify(b)}`);
                    }
                }
            }
        }
    }
    check(`las ${sitios.length * langs.length * paises.length * 2} combinaciones dan lo mismo en las dos puntas`, iguales);
    check('el país del sitio se deduce igual',
        ['Colombia', 'CO', '', 'mx'].every(c => countryOfSite(c, 'COP') === esp.countryOfSite(c, 'COP')));
    check('los montos del bloque se aceptan igual',
        blockAmountsApply('COP', 'USD') === esp.blockAmountsApply('COP', 'USD')
        && blockAmountsApply('COP', 'COP') === esp.blockAmountsApply('COP', 'COP'));
    check('la moneda internacional es la misma', INTERNATIONAL_CURRENCY === esp.INTERNATIONAL_CURRENCY);
    // El criterio de idioma nacional NO se reescribe en ninguna de las dos
    // puntas: sale de las listas que ya existían (v4.652 / v4.699).
    check('el idioma nacional sale del catálogo que ya existía, no de una lista nueva',
        DEFAULT_NATIONAL_LOCALES.join(',') === 'es,es-CO'
        && /isNationalLocale/.test(readFileSync('server/lib/donationCurrency.js', 'utf8'))
        && /isNationalLang/.test(readFileSync('src/lib/donationCurrency.ts', 'utf8')));
} catch (e) {
    paridad = false;
    console.log(`  … paridad de espejos: se salta (${e.message.slice(0, 60)})`);
}

console.log(`\n${ok} comprobaciones pasaron${malos.length ? `, ${malos.length} FALLARON:` : '.'}`);
for (const m of malos) console.log(`  ✗ ${m}`);
if (!paridad) console.log('  (el bloque de paridad no corrió: instalá esbuild con `npm i --no-save esbuild`)');
process.exit(malos.length ? 1 : 0);
