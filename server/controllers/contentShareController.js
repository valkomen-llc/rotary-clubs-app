// ════════════════════════════════════════════════════════════════════════════
// Compartir contenido en redes — la API (v4.1013)
//
// Cuatro endpoints, todos autenticados y todos acotados por el tenant del
// TOKEN. Ninguno devuelve un access token, ni recortado (regla de v4.992): lo
// que sale es si la página SIRVE y, cuando no, POR QUÉ y DÓNDE se corrige.
//
// El trabajo real lo hace `socialPublishingService.js`. Acá sólo se traduce
// HTTP: quién pregunta, qué código sale y con qué palabras.
// ════════════════════════════════════════════════════════════════════════════
import {
    resolveEntity, describeTargets, shareEntity, historyFor, historySummaryFor,
} from '../lib/socialPublishingService.js';
import {
    defaultShareMessage, SHARE_MESSAGE_MAX, NETWORKS,
    shareKindOf, shareabilityOf, SHARE_KINDS, copyPolicyFor, copyPoliciesFor,
} from '../lib/socialShareSpec.js';
import { generateReelShareCopy, generateArticleShareCopy } from '../lib/reelShareCopyAI.js';
import { describeShareCopy } from '../lib/reelShareCopy.js';
import { clientIp } from '../lib/socialAudit.js';
import { getDefaultAccounts, resolveDefaults } from '../lib/socialDefaults.js';

const str = (v) => (typeof v === 'string' ? v.trim() : '');

/**
 * El estado de la integración de Meta, dicho con palabras (v4.1042).
 *
 * ⚠️ NO SE DESCUBRE NADA NUEVO NI SE PIDE OTRA CONEXIÓN: se LEE lo que la
 * conexión existente ya dejó escrito —una fila `facebook` por Página y una
 * `instagram` por cuenta profesional vinculada, con `pageId` apuntando a su
 * Página (`handleMetaCallback`)—. Lo que agrega es distinguir los tres casos
 * que desde la pantalla se ven idénticos: no hay Página conectada, hay Página
 * y no hay Instagram, o hay las dos y una no sirve.
 *
 * Sin esta distinción «no me aparece Instagram» manda a diagnosticar la
 * conexión cuando lo que falta puede ser convertir la cuenta a profesional.
 */
const describeIntegration = (targets = []) => {
    const paginas = targets.filter(t => t.network === 'facebook');
    const instagram = targets.filter(t => t.network === 'instagram');
    const listas = (xs) => xs.filter(x => x.ready);

    const notas = [];
    if (!paginas.length) {
        notas.push({
            tone: 'bad',
            text: 'Este sitio no tiene ninguna Página de Facebook conectada.',
            fix: 'Conectala desde Configuración → Redes Sociales (Hub Social).',
        });
    } else if (!listas(paginas).length) {
        notas.push({
            tone: 'warn',
            text: `Hay ${paginas.length === 1 ? 'una Página conectada' : `${paginas.length} Páginas conectadas`}, pero ninguna puede publicar ahora.`,
            fix: 'El motivo de cada una está debajo, junto a su nombre.',
        });
    }
    if (paginas.length && !instagram.length) {
        notas.push({
            tone: 'warn',
            text: 'Ninguna de las Páginas conectadas tiene una cuenta de Instagram vinculada.',
            // El motivo REAL y sus dos salidas. Meta sólo devuelve la cuenta de
            // Instagram de una Página cuando es Profesional y está vinculada:
            // si falta cualquiera de las dos cosas, acá no aparece nada.
            fix: 'Para que aparezca, la cuenta tiene que ser Profesional (empresa o creador) y estar vinculada a la Página en Meta Business. Después, reconectá Meta desde Configuración → Redes Sociales.',
        });
    }
    const fechas = targets.map(t => t.lastSyncAt).filter(Boolean).sort();
    return {
        lastSyncAt: fechas.length ? fechas[fechas.length - 1] : null,
        facebook: {
            connected: paginas.length > 0,
            ready: listas(paginas).length > 0,
            count: paginas.length,
            accounts: paginas.map(p => ({
                id: p.id, name: p.name, pageId: p.pageId,
                // El Page ID de Meta, a la vista: es con lo que se comprueba
                // que la Página conectada es la que se autorizó.
                platformId: p.platformId || p.pageId,
                lastSyncAt: p.lastSyncAt || null,
                ready: p.ready, reason: p.reason,
            })),
        },
        instagram: {
            connected: instagram.length > 0,
            ready: listas(instagram).length > 0,
            count: instagram.length,
            accounts: instagram.map(i => ({
                id: i.id, name: i.name, username: i.username, ready: i.ready, reason: i.reason,
                // El id de la cuenta profesional de Instagram.
                platformId: i.platformId || null,
                lastSyncAt: i.lastSyncAt || null,
                // De qué Página cuelga. Es lo que permite comprobar que el
                // Instagram que se ve es el de ESTA Página y no el de otra.
                linkedPageId: i.linkedPageId, linkedPageName: i.linkedPageName,
            })),
        },
        notes: notas,
    };
};

// ============================================================================
// GET /api/social/share/targets?entityType=post&entityId=<id>
//
// Todo lo que el modal necesita para pintarse, resuelto en el SERVIDOR: la
// entidad, su dirección pública, si se puede compartir, las páginas
// disponibles con su estado, el copy propuesto y lo que ya salió.
//
// ⚠️ EL VEREDICTO VIAJA RESUELTO. La pantalla no vuelve a decidir quién puede
// publicar dónde: con dos criterios, el modal ofrecería una página que el
// servidor rechaza, y eso se lee como que el módulo está roto (regla de
// v4.999 — el alcance NO se espeja en el navegador).
// ============================================================================
export const getShareTargets = async (req, res) => {
    try {
        const entityType = str(req.query.entityType) || 'post';
        const entityId = str(req.query.entityId);
        const clubId = str(req.query.clubId || req.body?.clubId || req.user?.clubId);
        if (!entityId) return res.status(400).json({ error: 'entityId requerido' });

        const ent = await resolveEntity({ entityType, entityId, user: req.user, siteId: clubId });
        if (!ent.ok) return res.status(ent.code || 404).json({ error: ent.error });

        // ⚠️ LA FORMA LA DECIDE LA ENTIDAD, NO LA PANTALLA (v4.1042). Con
        // `link`, Instagram no es un destino posible; con `video`, sí — y es
        // el destino principal de un Reel. Si el navegador pudiera elegirla,
        // el modal ofrecería una cuenta que el servidor va a rechazar.
        const kind = shareKindOf(entityType);
        const video = kind === 'video' ? ent.entity : null;
        const puede = shareabilityOf({
            kind,
            entity: kind === 'video' ? ent.entity : { published: ent.entity.published },
            publicUrl: ent.publicUrl,
            mediaUrl: ent.mediaUrl || ent.entity?.mediaUrl || '',
        });
        const targets = await describeTargets({ clubId: ent.clubId, kind, video });
        const hist = await historyFor({ entityType, entityId, user: req.user });
        // ⚠️ LOS PREDETERMINADOS SE RESUELVEN CONTRA LA LISTA QUE SE VA A
        // PINTAR. Un principal que apunta a una cuenta borrada —o que no
        // puede publicar— se suelta acá: marcarlo abriría el modal con una
        // cuenta que el servidor va a rechazar, y eso se lee como que el
        // módulo está roto.
        const defaults = resolveDefaults(await getDefaultAccounts(ent.clubId), targets);

        return res.json({
            entity: ent.entity,
            kind,
            kindLabel: SHARE_KINDS[kind]?.label || kind,
            mediaUrl: ent.mediaUrl || ent.entity?.mediaUrl || null,
            publicUrl: ent.publicUrl,
            publicUrlReason: ent.publicUrlReason || null,
            // Cuál es el sitio que resuelve la dirección — «¿por qué el enlace
            // apunta a este dominio?» tiene que poder contestarse.
            site: ent.raw ? { clubId: ent.clubId } : null,
            shareable: puede.ok,
            shareReason: puede.reason,
            shareFix: puede.fix,
            targets: targets.map(t => ({
                ...t,
                isDefault: defaults[t.network] === t.id,
            })),
            // Con qué abre marcado el modal. Viaja RESUELTO: si la pantalla
            // lo dedujera, marcaría una cuenta distinta de la que el sitio
            // declaró como principal.
            defaults,
            // El diagnóstico de la integración de Meta, RESUELTO: qué Página
            // hay, qué Instagram cuelga de ella y qué falta. Sin esto, «no
            // aparece mi Instagram» no se puede distinguir de «no está
            // conectado» ni de «no es cuenta profesional».
            integration: describeIntegration(targets),
            networks: NETWORKS.map(n => ({
                id: n.id, label: n.label, available: n.available,
                linkable: n.linkable, kinds: n.kinds || [], note: n.note,
            })),
            defaultMessage: ent.entity?.socialCopy || defaultShareMessage(ent.entity),
            // ⚠️ `null` PARA UN REEL (v4.1052): Facebook e Instagram reciben el
            // MISMO pie corto. Con un copy por red, la pantalla pinta una
            // pestaña por red y los dos textos se pueden separar — que es lo
            // contrario de lo que se pidió y rompería la única fuente de
            // verdad entre el editor, la vista previa y el payload.
            defaultMessages: ent.defaultMessages || null,
            // ⚠️ LA REGLA DEL COPY VIAJA RESUELTA. La pantalla la aplica para
            // pintar el contador y los avisos mientras se escribe —no puede
            // pagar un viaje de red por pulsación—, pero quién la declara es
            // el servidor: con la política escrita en el navegador, un cambio
            // acá dejaría a las dos puntas exigiendo cosas distintas.
            copyPolicy: ent.copyPolicy || copyPolicyFor(entityType),
            // ⚠️ UNA POLÍTICA POR RED PARA EL ARTÍCULO, y `null` para lo que
            // no la tiene. Es lo que hace que el contador de la pestaña de X
            // diga 280 y el de LinkedIn 3.000 sin pagar un viaje de red por
            // pulsación — y el servidor vuelve a decidir con la MISMA antes de
            // publicar, que es lo único que no se puede saltar.
            copyPolicies: ent.copyPolicies || copyPoliciesFor(entityType),
            // Qué hubo que hacerle al copy para que cumpliera. Es lo que
            // permite decir «se acortó, revisalo» en vez de entregar un texto
            // recortado como si fuera el que alguien escribió.
            copyNotes: ent.copyNotes || null,
            messageMax: SHARE_MESSAGE_MAX,
            history: hist.ok ? hist.entries : [],
            summary: hist.ok ? hist.summary : null,
        });
    } catch (e) {
        console.error('[share] getShareTargets:', e);
        return res.status(500).json({ error: e.message });
    }
};

// ============================================================================
// POST /api/social/share
//
// { entityType, entityId, accountIds[], message, operationKey }
//
// ⚠️ `operationKey` NO ES CEREMONIA: es lo que impide que un doble clic o un
// reintento del navegador publiquen dos veces en la página de una institución
// —algo que después hay que ir a borrar a mano en Facebook—. La genera la
// pantalla al abrir el modal; «Publicar nuevamente» es otra operación y otra
// clave, a propósito.
// ============================================================================
export const shareContent = async (req, res) => {
    try {
        const { entityType = 'post', entityId, accountIds, message, messages, operationKey, clubId: rawClubId } = req.body || {};
        const clubId = str(rawClubId || req.query?.clubId || req.user?.clubId);
        const r = await shareEntity({
            entityType: str(entityType), entityId: str(entityId),
            accountIds: Array.isArray(accountIds) ? accountIds : [],
            message: typeof message === 'string' ? message : '',
            // El texto por red. Es ADITIVO: un cliente que no lo mande —el
            // flujo de Noticias— se comporta exactamente como antes.
            messages: messages && typeof messages === 'object' && !Array.isArray(messages) ? messages : null,
            operationKey: str(operationKey),
            user: req.user, ip: clientIp(req),
            siteId: clubId,
        });
        if (r.ok === false && r.code) {
            return res.status(r.code).json({ error: r.error, fix: r.fix || null });
        }
        // 207: unas páginas salieron y otras no. Un 200 diría que salió todo y
        // un 500 que no salió nada; las dos serían falsas.
        return res.status(r.status === 'error' ? 502 : r.status === 'partial' ? 207 : 200).json(r);
    } catch (e) {
        console.error('[share] shareContent:', e);
        return res.status(500).json({ error: e.message });
    }
};

// ============================================================================
// POST /api/social/share/copy   { entityType, entityId, instruction? }
//
// «✨ Regenerar copy»: el pie con el que sale un Reel, escrito por la IA.
//
// ⚠️ ESTO NO TOCA EL REEL, Y ES LA MITAD DEL PEDIDO. No regenera escenas, ni
// audio, ni el montaje, ni vuelve a llamar al motor de video: lo único que
// devuelve es TEXTO. El archivo publicado sigue siendo el master que ya está
// en la Biblioteca. Una prueba lee `reelShareCopyAI.js` y falla si aparece el
// cliente de KIE o el compositor — el fallo sería MUDO: el copy sale igual y
// el gasto aparece en el medidor de créditos un mes después.
//
// ⚠️ Y SÓLO PARA LO QUE TIENE POLÍTICA DE COPY. Desde v4.1061 el artículo
// también la tiene, PERO UNA POR RED: sin `network` no se sabe contra qué tope
// escribir —los 280 de X y los 3.000 de LinkedIn no admiten el mismo texto— y
// se rechaza diciéndolo, en vez de elegir una por el llamador.
// ============================================================================
export const regenerateShareCopy = async (req, res) => {
    try {
        const entityType = str(req.body?.entityType) || 'reel';
        const entityId = str(req.body?.entityId);
        const instruction = str(req.body?.instruction).slice(0, 400);
        if (!entityId) return res.status(400).json({ error: 'entityId requerido' });

        const network = str(req.body?.network).toLowerCase();
        const policy = copyPolicyFor(entityType, network);
        if (!policy) {
            const porRed = copyPoliciesFor(entityType);
            if (porRed) {
                return res.status(400).json({
                    error: `Falta decir para qué red se escribe el copy de este artículo.`,
                    fix: `Cada red tiene su tope: ${Object.values(porRed).map(p => `${p.label} ${p.maxChars}`).join(', ')}.`,
                });
            }
            return res.status(400).json({
                error: `El contenido de tipo '${entityType}' no tiene un copy con reglas propias.`,
                fix: 'Hoy lo tienen el Reel y el artículo; para los demás se escribe a mano.',
            });
        }

        // El aislamiento es el de siempre y va en el RESOLUTOR: un Reel ajeno
        // no se devuelve, así que para quien pregunta no existe — 404, nunca
        // 403 (v4.999). Sin esto, la varita sería una vía para leer el título
        // y el guion de la pieza de otra organización.
        const clubId = str(req.query?.clubId || req.body?.clubId || req.user?.clubId);
        const ent = await resolveEntity({ entityType, entityId, user: req.user, siteId: clubId });
        if (!ent.ok) return res.status(ent.code || 404).json({ error: ent.error });

        // ⚠️ UNA SOLA VARITA CON DOS FAMILIAS, no dos endpoints: los dos
        // caminos entran por el mismo aislamiento, el mismo reintento con la
        // regla concreta y el mismo `source` que distingue `ia` de
        // `ia_reparado`. Con dos endpoints, el día que se corrija el manejo de
        // un rechazo del proveedor uno se queda atrás.
        const r = entityType === 'post'
            ? await generateArticleShareCopy({
                post: ent.raw,
                network,
                // ⚠️ LA DIRECCIÓN SALE DEL RESOLUTOR, NUNCA DEL CUERPO DE LA
                // PETICIÓN. Es la MISMA que va a viajar a Meta al publicar —la
                // del dominio propio del sitio— y aceptarla del navegador
                // dejaría que el copy anunciara una y el enlace llevara a otra.
                publicUrl: ent.publicUrl || '',
                instruction,
            })
            : await generateReelShareCopy({
                reel: ent.raw,
                entityType,
                existingCopy: ent.longCopy || ent.entity?.socialCopy || '',
                instruction,
            });

        return res.json({
            copy: r.copy,
            ok: r.ok,
            // De dónde salió el texto: `ia`, `ia_reparado` o `plantilla`.
            // Presentarlos igual haría creer que la IA escribió algo que no
            // escribió (la regla de v4.929 con el mensaje institucional).
            source: r.source,
            provider: r.provider,
            model: r.model,
            attempts: r.attempts,
            notes: r.notes || [],
            warnings: r.warnings || [],
            // El veredicto ya resuelto, con la misma forma que usa la pantalla
            // para pintar el contador.
            copyState: describeShareCopy(r.copy, policy),
            copyPolicy: policy,
            network: policy.network || null,
        });
    } catch (e) {
        console.error('[share] regenerateShareCopy:', e);
        // ⚠️ Un fallo del redactor NO puede dejar el modal sin copy: el que ya
        // estaba escrito sigue ahí y se dice qué pasó. Lo que no se hace es
        // devolver un texto vacío que se pinte encima del que había.
        return res.status(502).json({
            error: `No se pudo escribir el copy: ${e.message}`,
            fix: 'Volvé a intentarlo, o escribilo a mano: el texto que ya estaba no se perdió.',
        });
    }
};

// ============================================================================
// GET /api/social/share/history?entityType=post&entityId=<id>
// ============================================================================
export const getShareHistory = async (req, res) => {
    try {
        const entityType = str(req.query.entityType) || 'post';
        const entityId = str(req.query.entityId);
        if (!entityId) return res.status(400).json({ error: 'entityId requerido' });
        const r = await historyFor({ entityType, entityId, user: req.user });
        if (!r.ok) return res.status(r.code || 404).json({ error: r.error });
        return res.json({ entries: r.entries, summary: r.summary });
    } catch (e) {
        console.error('[share] getShareHistory:', e);
        return res.status(500).json({ error: e.message });
    }
};

// ============================================================================
// GET /api/social/share/summary?entityType=post&ids=a,b,c
//
// El resumen de VARIAS entidades en UNA consulta — es lo que permite pintar la
// insignia «Publicado en Facebook» en un listado de cien filas sin pagar una
// consulta por fila.
//
// ⚠️ DEGRADA SIEMPRE: esto adorna un listado que ya funciona. Un fallo acá no
// puede dejar sin Noticias a quien entró a trabajar.
// ============================================================================
export const getShareSummary = async (req, res) => {
    try {
        const entityType = str(req.query.entityType) || 'post';
        const ids = str(req.query.ids).split(',').map(s => s.trim()).filter(Boolean).slice(0, 200);
        const clubId = req.user?.role === 'administrator'
            ? (str(req.query.clubId) || str(req.user.clubId))
            : str(req.user?.clubId);
        if (!ids.length || !clubId) return res.json({});
        return res.json(await historySummaryFor({ entityType, entityIds: ids, clubId }));
    } catch (e) {
        console.warn('[share] getShareSummary:', e.message);
        return res.json({});
    }
};

export default { getShareTargets, shareContent, regenerateShareCopy, getShareHistory, getShareSummary };
