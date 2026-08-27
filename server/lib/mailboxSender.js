// ════════════════════════════════════════════════════════════════════
// DESDE QUÉ DIRECCIÓN SALE UN CORREO DE LA BANDEJA — v4.942.0
//
// El CRITERIO. **Puro**: sin base, sin red, sin `req`.
//
// ⚠️ EL DEFECTO QUE ESTO CORRIGE. Al escribir desde `presidencia@dominio.org`,
// la plataforma intentaba enviar con esa dirección y —cuando el proveedor la
// rechazaba porque el dominio todavía no está verificado— reintentaba en
// silencio con:
//
//     "presidencia@dominio.org" <noreply@clubplatform.org>
//
// y contestaba «Mensaje enviado con éxito desde presidencia@dominio.org».
//
// Dos cosas mal, y las dos hacen daño:
//
//   1. **UN NOMBRE VISIBLE QUE ES OTRA DIRECCIÓN es el patrón que los filtros
//      leen como suplantación.** El sobre dice `noreply@clubplatform.org` y lo
//      que se ve dice otra cosa: Gmail y Outlook lo marcan o lo tiran. Por eso
//      «no llegan los correos» aunque el proveedor conteste que los aceptó.
//   2. **LA PANTALLA AFIRMABA LO QUE NO PASÓ.** El correo salió, pero NO desde
//      la cuenta institucional. Sin decirlo, no hay forma de enterarse ni de
//      saber qué corregir — y lo que hay que corregir es verificar el dominio.
//
// La regla, entonces: el nombre visible es un NOMBRE (el del sitio), la
// dirección es la que de verdad se usó, la institucional queda como
// `Reply-To` —que es lo que hace que al responder se conteste a la persona— y
// desde dónde salió SE DICE.
//
// ⚠️ ANTE LA DUDA SE INTENTA LA PROPIA. No se consulta la lista de dominios
// verificados para DECIDIR: esa lista puede venir vacía porque no se pudo
// preguntar —una key de sólo-envío no puede listar dominios—, y con ella
// decidiendo, un sitio que hoy envía perfectamente desde su dominio dejaría de
// hacerlo. Se intenta, y el respaldo es lo que cambia.
// ════════════════════════════════════════════════════════════════════

import { centralDomain, fallbackSender } from './notificationSpec.js';

const str = (v, max = 200) => String(v ?? '').replace(/\s+/g, ' ').trim().slice(0, max);
const lower = (v) => str(v, 320).toLowerCase();

/** El dominio de una dirección, sin `www.` — el proveedor verifica el apex. */
export const domainOf = (email) => {
    const d = lower(email).split('@')[1] || '';
    return d.replace(/^www\./, '');
};

/**
 * El nombre visible de un remitente.
 *
 * ⚠️ NUNCA UNA DIRECCIÓN. Si no hay nombre del sitio se usa la parte local de
 * la dirección en texto llano (`presidencia`), no la dirección entera: lo que
 * dispara los filtros es que el nombre visible PAREZCA otro correo.
 */
export const displayNameFor = ({ siteName = '', mailbox = '' } = {}) => {
    const nombre = str(siteName, 120).replace(/"/g, '');
    if (nombre) return nombre;
    const local = lower(mailbox).split('@')[0];
    return local ? local.replace(/[._-]+/g, ' ').replace(/"/g, '') : 'Club Platform';
};

/** `"Nombre" <direccion>`, con el nombre saneado: una comilla partiría la cabecera. */
export const formatFrom = (address, name) => {
    const dir = lower(address);
    const nombre = str(name, 120).replace(/"/g, '');
    return nombre ? `"${nombre}" <${dir}>` : dir;
};

export const SENDER_LEVELS = {
    1: 'la propia cuenta institucional',
    2: 'el dominio central de la plataforma',
    3: 'la dirección de respaldo',
};

/**
 * EL PLAN DE ENVÍO: primero la cuenta institucional, después el respaldo.
 *
 * Devuelve LOS DOS, en orden, para que quien envía intente el primero y —sólo
 * si el proveedor lo rechaza— use el segundo SABIENDO que lo hizo. No es una
 * cascada silenciosa: cada escalón trae su nivel y su motivo.
 */
export const mailboxSenderPlan = ({ mailbox = '', siteName = '', central = null, fallback = null } = {}) => {
    const propia = lower(mailbox);
    const nombre = displayNameFor({ siteName, mailbox: propia });
    const dominioCentral = lower(central) || centralDomain();
    const respaldo = lower(fallback) || fallbackSender();

    const pasos = [];

    if (propia && propia.includes('@')) {
        pasos.push({
            level: 1,
            address: propia,
            from: formatFrom(propia, nombre),
            // Aunque salga desde ella, se declara: al responder se contesta a
            // la persona y no al buzón genérico.
            replyTo: propia,
            usedOwnMailbox: true,
            domain: domainOf(propia),
            reason: 'sale desde tu cuenta institucional',
        });
    }

    // El respaldo conserva la parte local del dominio central que ya venía
    // usando la plataforma (`noreply@`), NUNCA la de la cuenta: inventar
    // `presidencia@clubplatform.org` sería una dirección que no existe.
    const dirRespaldo = domainOf(respaldo) === dominioCentral ? respaldo : `noreply@${dominioCentral}`;
    pasos.push({
        level: 2,
        address: dirRespaldo,
        from: formatFrom(dirRespaldo, nombre),
        replyTo: propia || null,
        usedOwnMailbox: false,
        domain: domainOf(dirRespaldo),
        reason: propia
            ? `el dominio ${domainOf(propia)} todavía no está verificado en el proveedor de correo`
            : 'no hay una cuenta institucional desde la cual enviar',
    });

    return pasos;
};

/**
 * ⚠️ EL ERROR DEL PROVEEDOR SE PROPAGA TEXTUAL Y SE TRADUCE DELANTE.
 *
 * «The X domain is not verified» es exacto y no le dice a nadie qué hacer; y
 * traducirlo a secas lo volvería irreconocible al buscarlo en el soporte del
 * proveedor. Va el diagnóstico primero, en español, y el original entre
 * paréntesis — la regla que el CRM aprendió con `metaCode` (v4.702) y el
 * asistente de redacción con `describeProviderFailure` (v4.892).
 */
export const explainSendFailure = (raw, { mailbox = '' } = {}) => {
    const texto = str(raw, 400);
    const dominio = domainOf(mailbox);
    if (!texto) return 'El proveedor de correo rechazó el envío y no dijo por qué.';

    if (/not verified|domain is not verified|verify your domain/i.test(texto)) {
        return `El dominio ${dominio || 'del sitio'} todavía no está verificado en el proveedor de correo, así que no se puede enviar con esa dirección como remitente. Verifícalo en Bandeja de Entrada → Cuentas → Diagnóstico, o pídeselo al administrador del sitio. (${texto})`;
    }
    if (/RESEND_API_KEY not configured/i.test(texto)) {
        return `La plataforma no tiene configurada la credencial del proveedor de correo, así que no puede enviar nada. (${texto})`;
    }
    if (/rate.?limit|too many/i.test(texto)) {
        return `El proveedor de correo está limitando los envíos por volumen; reintenta en unos minutos. (${texto})`;
    }
    if (/invalid.*(to|recipient|email)/i.test(texto)) {
        return `El proveedor rechazó la dirección de destino. Comprueba que esté bien escrita. (${texto})`;
    }
    return `El proveedor de correo rechazó el envío. (${texto})`;
};

/**
 * Lo que se le dice a quien acaba de pulsar «Enviar».
 *
 * ⚠️ «Mensaje enviado con éxito desde presidencia@…» cuando salió desde
 * `noreply@` es una afirmación falsa, y es la que impedía enterarse del
 * problema. Con el respaldo se dice DESDE DÓNDE salió, POR QUÉ y que las
 * respuestas siguen llegando a su bandeja.
 */
export const describeSend = (sender) => {
    if (!sender) return 'Mensaje enviado.';
    if (sender.usedOwnMailbox) return `Mensaje enviado desde ${sender.address}.`;
    return `Mensaje enviado desde ${sender.address} porque ${sender.reason}. `
        + `Las respuestas llegan igual a ${sender.replyTo || 'tu bandeja'}.`;
};

export default {
    domainOf, displayNameFor, formatFrom, SENDER_LEVELS,
    mailboxSenderPlan, explainSendFailure, describeSend,
};
