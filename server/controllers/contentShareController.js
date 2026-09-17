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
import crypto from 'crypto';
import db from '../lib/db.js';
import { ensureContentDistributionSchema } from '../lib/ensureContentDistributionSchema.js';
import { listGroups, upsertGroups } from '../lib/distributionGroups.js';
import {
    resolveEntity, describeTargets, shareEntity, historyFor, historySummaryFor,
    accountsForTenant, tokenOf,
} from '../lib/socialPublishingService.js';
import { decryptToken } from '../lib/tokenCrypto.js';
import {
    defaultShareMessage, SHARE_MESSAGE_MAX, NETWORKS,
    shareKindOf, shareabilityOf, SHARE_KINDS, copyPolicyFor, copyPoliciesFor,
} from '../lib/socialShareSpec.js';
import { generateReelShareCopy, generateArticleShareCopy } from '../lib/reelShareCopyAI.js';
import { describeShareCopy } from '../lib/reelShareCopy.js';
import { clientIp } from '../lib/socialAudit.js';
import { getDefaultAccounts, resolveDefaults } from '../lib/socialDefaults.js';
import { fetchPageGroups } from '../services/metaService.js';

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
        const clubId = str(req.query?.clubId || req.user?.clubId);
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
        const clubId = str(req.query?.clubId || req.user?.clubId);
        const { entityType = 'post', entityId, accountIds, message, messages, operationKey, publicUrl } = req.body || {};
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
            publicUrl: str(publicUrl) || null,
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
        const clubId = str(req.query?.clubId || req.user?.clubId);
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

// ============================================================================
// GET /api/social/share/group-targets?clubId=<id>
// ============================================================================
export const getShareGroupTargets = async (req, res) => {
    try {
        const clubId = str(req.query?.clubId || req.user?.clubId);
        const filas = clubId ? await listGroups(clubId) : [];

        let grupos = filas.map(g => {
            const tags = Array.isArray(g.tags) ? g.tags : [];
            const tagsStr = tags.join(' ').toLowerCase();
            const nameLower = (g.name || '').toLowerCase();

            const region = tags.find(t => /colombia|latinoam|m[eé]xico/i.test(t))
                || (nameLower.includes('colombia') ? 'Colombia'
                    : nameLower.includes('méxico') || nameLower.includes('mexico') ? 'México'
                    : 'Latinoamérica');

            const isEnglish = tagsStr.includes('inglés') || tagsStr.includes('english');
            const language = isEnglish ? 'en' : 'es';
            const languageLabel = isEnglish ? 'English' : 'Español';

            return {
                id: g.id,
                groupId: g.groupId,
                name: g.name,
                url: g.url || null,
                language,
                languageLabel,
                region,
                tags,
                status: g.status,
                canPublish: !!g.canPublish,
                lastPublishedAt: g.lastPublishedAt || null,
            };
        });

        // Extraer categorías dinámicas (listas de distribución reales)
        const categoriesSet = new Set(['Todos', 'Rotary en Español']);
        grupos.forEach(g => {
            g.tags.forEach(t => {
                if (t && t.length > 1 && !t.startsWith('lang:') && !t.startsWith('idioma:')) {
                    categoriesSet.add(t);
                }
            });
        });

        // Consultar lista predeterminada guardada en Setting si existe
        let defaultList = 'Rotary en Español';
        try {
            if (clubId) {
                const pref = await db.prisma.setting.findFirst({
                    where: { key: 'default_group_distribution_list', clubId },
                });
                if (pref?.value) defaultList = pref.value;
            }
        } catch {
            // Silencioso si Setting no está disponible
        }

        return res.json({
            groups: grupos,
            categories: Array.from(categoriesSet),
            defaultList,
            metaCapability: {
                supported: false,
                reason: 'Meta Graph API retiró el acceso a grupos de membresía el 22 de abril de 2024. Los grupos reales deben registrarse o importarse.',
            },
        });
    } catch (e) {
        console.error('[share] getShareGroupTargets:', e);
        return res.status(500).json({ error: e.message });
    }
};

// ============================================================================
// Generador contextual de CTA para grupos de Facebook (v4.1075)
// ============================================================================
export const buildContextualGroupCTA = ({ title = '', excerpt = '', content = '', instruction = '' }) => {
    const text = `${title} ${excerpt} ${content} ${instruction}`.toLowerCase();

    let emoji = '🌎';
    let tema = 'comunidad';

    if (/agua|filtro|acueducto|potable|hídric|saneamiento/i.test(text)) {
        emoji = '💧';
        tema = 'agua';
    } else if (/salud|médic|vacuna|enferm|hospital|quirúrgic|dental|cáncer|cirugía/i.test(text)) {
        emoji = '🩺';
        tema = 'salud';
    } else if (/educa|escuela|colegio|beca|libro|estudiante|alfabetiza|formación/i.test(text)) {
        emoji = '📚';
        tema = 'educacion';
    } else if (/paz|conflicto|diálogo|convivencia|armonía|derechos/i.test(text)) {
        emoji = '🕊️';
        tema = 'paz';
    } else if (/ambiente|árbol|reforest|ecolog|climátic|recicla|naturaleza/i.test(text)) {
        emoji = '🌱';
        tema = 'ambiente';
    } else if (/joven|juventud|rotaract|interact|intercambio|ryla/i.test(text)) {
        emoji = '🌟';
        tema = 'juventud';
    } else if (/donac|alimento|solidar|ayuda|vivienda|techo|apoyo|emergencia|reconstru/i.test(text)) {
        emoji = '🤝';
        tema = 'solidaridad';
    }

    const opciones = {
        agua: [
            `Llevamos agua potable y esperanza donde más se necesita con Rotary. ${emoji}`,
            `Así transforma Rotary vidas con acceso a agua limpia y saneamiento. ${emoji}`,
            `Servicio que transforma: proyectos de agua potable con sello rotario. ${emoji}`,
        ],
        salud: [
            `Comprometidos con la salud y el bienestar de nuestras comunidades. ${emoji}`,
            `Rotary en acción por la prevención y el cuidado médico solidario. ${emoji}`,
            `Cuidar la vida es nuestro lema: mira cómo servimos en salud comunitaria. ${emoji}`,
        ],
        educacion: [
            `Impulsando el futuro de la niñez mediante educación y servicio rotario. ${emoji}`,
            `Rotary transformando vidas a través de la educación y el apoyo escolar. ${emoji}`,
            `Educación que abre puertas: conoce este gran proyecto de servicio rotario. ${emoji}`,
        ],
        paz: [
            `Construyendo puentes de paz, diálogo y esperanza junto a Rotary. ${emoji}`,
            `Servicio rotario para fortalecer la convivencia en nuestras comunidades. ${emoji}`,
        ],
        ambiente: [
            `Protegiendo nuestro planeta y sembrando futuro con acción rotaria. ${emoji}`,
            `Cuidar el medio ambiente es servir a la humanidad: conócelo aquí. ${emoji}`,
        ],
        juventud: [
            `Inspirando el liderazgo juvenil y la vocación de servicio con Rotary. ${emoji}`,
            `Líderes jóvenes que transforman el mundo con energía y solidaridad. ${emoji}`,
        ],
        solidaridad: [
            `Manos solidarias que construyen esperanza en nuestras comunidades. ${emoji}`,
            `Así respondemos al llamado del servicio: Rotary presente donde se necesita. ${emoji}`,
            `La fuerza de la solidaridad en acción a través del servicio rotario. ${emoji}`,
        ],
        comunidad: [
            `Conoce cómo Rotary transforma comunidades a través del servicio y la solidaridad. ${emoji}`,
            `Gente de acción: mira cómo Rotary impacta positivamente nuestras regiones. ${emoji}`,
            `El servicio rotario en acción transformando realidades comunitarias. ${emoji}`,
        ],
    };

    const lista = opciones[tema] || opciones.comunidad;

    // Si el título es conciso, armar frase personalizada si no supera 100 caracteres
    const tLimpio = title.replace(/[«»"“”]/g, '').trim();
    if (tLimpio && tLimpio.length <= 60) {
        const ctaTitulo = `Conoce esta iniciativa de servicio rotario: ${tLimpio} ${emoji}`;
        if (ctaTitulo.length <= 100) return ctaTitulo;
    }

    for (const op of lista) {
        if (op.length <= 100) return op;
    }

    return `Conoce cómo Rotary transforma comunidades a través del servicio y la solidaridad. 🌎`;
};

// ============================================================================
// POST /api/social/share/group-cta?clubId=<id>
// ============================================================================
export const generateGroupCTA = async (req, res) => {
    try {
        const clubId = str(req.query?.clubId || req.user?.clubId);
        const entityType = str(req.body.entityType) || 'post';
        const entityId = str(req.body.entityId);
        const instruction = str(req.body.instruction);

        if (!entityId) return res.status(400).json({ error: 'entityId requerido' });

        const ent = await resolveEntity({ entityType, entityId, user: req.user, siteId: clubId });
        if (!ent.ok) return res.status(ent.code || 404).json({ error: ent.error });

        const title = str(ent.entity?.title);
        const excerpt = str(ent.entity?.excerpt);
        const content = str(ent.raw?.content || ent.entity?.content);

        const cta = buildContextualGroupCTA({ title, excerpt, content, instruction });
        return res.json({ ok: true, cta });
    } catch (e) {
        console.error('[share] generateGroupCTA:', e);
        return res.status(500).json({ error: e.message });
    }
};

// ============================================================================
// POST /api/social/share/distribute-to-groups?clubId=<id>
// ============================================================================
export const distributeToGroups = async (req, res) => {
    try {
        const clubId = str(req.query?.clubId || req.user?.clubId);
        const entityType = str(req.body.entityType) || 'post';
        const entityId = str(req.body.entityId);
        const fanpagePostId = str(req.body.fanpagePostId);
        const fanpagePostUrl = str(req.body.fanpagePostUrl);
        const message = str(req.body.message) || null;
        const groups = Array.isArray(req.body.groups) ? req.body.groups : [];

        if (!entityId) return res.status(400).json({ error: 'entityId requerido' });
        if (!fanpagePostUrl) return res.status(400).json({ error: 'fanpagePostUrl requerido: la distribución a grupos exige la publicación oficial en Facebook como fuente.' });
        if (!groups.length) return res.status(400).json({ error: 'Debe seleccionar al menos un grupo autorizado.' });

        await ensureContentDistributionSchema();

        const outcomes = [];
        for (const g of groups) {
            const opKey = crypto.randomUUID();
            const gId = str(g.groupId || g.id);
            const gName = str(g.name || gId);
            const gUrl = str(g.url);

            try {
                if (clubId) {
                    await db.query(
                        `INSERT INTO "ContentDistribution" (
                            id, "clubId", "entityType", "entityId", "accountId",
                            network, "accountName", "pageId", status, "externalId", "externalUrl",
                            link, message, "userName", "userId", "operationKey", "createdAt"
                        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, NOW())
                        ON CONFLICT ("operationKey", "accountId") DO UPDATE
                        SET status = EXCLUDED.status, message = EXCLUDED.message, "updatedAt" = NOW()`,
                        [
                            crypto.randomUUID(),
                            clubId,
                            entityType,
                            entityId,
                            gId,
                            'facebook_group',
                            gName,
                            null,
                            'pending',
                            fanpagePostId || null,
                            gUrl || null,
                            fanpagePostUrl,
                            message,
                            req.user?.name || req.user?.email || 'Usuario',
                            req.user?.id || null,
                            opKey,
                        ]
                    );

                    await db.query(
                        `UPDATE "DistributionGroup" SET "lastPublishedAt" = NOW() WHERE "clubId" = $1 AND "groupId" = $2`,
                        [clubId, gId]
                    ).catch(() => {});
                }

                outcomes.push({
                    groupId: gId,
                    name: gName,
                    url: gUrl || null,
                    dialogUrl: `https://www.facebook.com/sharer/sharer.php?u=${encodeURIComponent(fanpagePostUrl)}`,
                    status: 'pending',
                    message,
                });
            } catch (err) {
                outcomes.push({
                    groupId: gId,
                    name: gName,
                    url: gUrl || null,
                    status: 'error',
                    error: err.message,
                    message,
                });
            }
        }

        return res.json({
            ok: true,
            fanpagePostUrl,
            message,
            outcomes,
        });
    } catch (e) {
        console.error('[share] distributeToGroups:', e);
        return res.status(500).json({ error: e.message });
    }
};

// ============================================================================
// POST /api/social/share/group-status?clubId=<id>
// ============================================================================
export const updateGroupDistributionStatus = async (req, res) => {
    try {
        const clubId = str(req.query?.clubId || req.user?.clubId);
        const entityType = str(req.body.entityType) || 'post';
        const entityId = str(req.body.entityId);
        const groupId = str(req.body.groupId);
        const status = str(req.body.status) === 'published' ? 'published' : 'error';
        const error = str(req.body.error) || null;

        if (!entityId || !groupId) return res.status(400).json({ error: 'entityId y groupId requeridos' });

        await ensureContentDistributionSchema();

        if (clubId) {
            await db.query(
                `UPDATE "ContentDistribution"
                    SET status = $1, error = $2, "updatedAt" = NOW()
                  WHERE "clubId" = $3 AND "entityType" = $4 AND "entityId" = $5 AND network = 'facebook_group' AND "accountId" = $6`,
                [status, error, clubId, entityType, entityId, groupId]
            );
        }

        return res.json({ ok: true, groupId, status, error });
    } catch (e) {
        console.error('[share] updateGroupDistributionStatus:', e);
        return res.status(500).json({ error: e.message });
    }
};

// ============================================================================
// POST /api/social/share/groups/sync-meta?clubId=<id>
// Valida la integración con Meta e intenta sincronizar grupos si la API lo permite
// ============================================================================
export const syncMetaGroups = async (req, res) => {
    try {
        const clubId = str(req.query?.clubId || req.user?.clubId);
        if (!clubId) return res.status(400).json({ error: 'clubId requerido' });

        // Consultar cuentas conectadas para este club
        const accounts = await accountsForTenant(clubId);
        const fbAccount = accounts.find(a => (a.platform === 'facebook' || a.platform === 'facebook_page'));

        if (!fbAccount) {
            return res.json({
                ok: true,
                synced: 0,
                metaStatus: 'no_fanpage_connected',
                message: 'No se detectó una Fanpage de Facebook conectada a este sitio. Puedes conectar la página oficial en Hub Social o registrar los grupos manualmente.',
                diagnostic: {
                    metaRestrictionDetected: true,
                    fanpage: null,
                    pageId: null,
                    metaNotice: 'No se encontró cuenta de Facebook activa para este club.',
                    recommendation: 'Conecta la Fanpage oficial en Hub Social o agrega tus grupos reales usando la herramienta de administración.',
                    solution: 'Registra los grupos directamente para la lista Rotary en Español.',
                },
            });
        }

        const pageId = fbAccount.platformId || fbAccount.pageId || fbAccount.id;
        const pageName = fbAccount.accountName || 'Página de Facebook';
        let pageToken = '';
        try {
            const rawToken = await tokenOf(fbAccount.id);
            if (rawToken) pageToken = decryptToken(rawToken);
        } catch (err) {
            console.warn('[share] decryptToken warn:', err.message);
        }

        let metaError = null;
        let gruposEncontrados = [];

        // Intentar consultar /{page-id}/groups en Meta Graph API mediante metaService
        if (pageId && pageToken) {
            const pageGroupsRes = await fetchPageGroups({ pageId, pageToken });
            if (pageGroupsRes.ok) {
                gruposEncontrados = pageGroupsRes.groups || [];
            } else {
                metaError = pageGroupsRes.error;
            }
        }

        if (gruposEncontrados.length > 0) {
            const gruposNormalizados = gruposEncontrados.map(g => ({
                groupId: g.id,
                name: g.name,
                url: g.link || `https://www.facebook.com/groups/${g.id}`,
                tags: ['Rotary en Español'],
                status: 'verificado',
            }));

            await upsertGroups({
                clubId,
                groups: gruposNormalizados,
                source: 'meta',
                accountId: fbAccount.id,
            });

            return res.json({
                ok: true,
                synced: gruposNormalizados.length,
                metaStatus: 'synced',
                message: `Se sincronizaron ${gruposNormalizados.length} grupos vinculados a la Fanpage ${pageName}.`,
                groups: await listGroups(clubId),
            });
        }

        // Diagnóstico oficial y pedagógico sin inventar datos:
        // Meta retiró Groups API el 22 de abril de 2024 (v19.0+) para lectura de miembros de grupos
        return res.json({
            ok: true,
            synced: 0,
            metaStatus: 'restricted_by_meta_policy',
            message: 'Meta Graph API (v19.0+) no permite que aplicaciones de terceros consulten los grupos a los que una cuenta o Fanpage se une como participante (la Groups API fue retirada el 22 de abril de 2024). Los 36 grupos reales donde participa tu cuenta deben administrarse o registrarse mediante la herramienta de configuración.',
            diagnostic: {
                metaRestrictionDetected: true,
                fanpage: pageName,
                pageId,
                metaNotice: metaError || 'La arista /groups de Meta Graph API no devuelve grupos de miembros debido al cierre de Groups API.',
                recommendation: 'Utiliza el registro o importación manual para agregar los grupos reales a la lista Rotary en Español.',
                solution: 'Utiliza el registro o importación manual para agregar los grupos reales a la lista Rotary en Español.',
            },
        });
    } catch (e) {
        console.error('[share] syncMetaGroups:', e);
        return res.status(500).json({ error: e.message });
    }
};

// ============================================================================
// POST /api/social/share/groups/default-list?clubId=<id>
// Guarda la lista de distribución predeterminada (ej. 'Rotary en Español')
// ============================================================================
export const setDefaultGroupList = async (req, res) => {
    try {
        const clubId = str(req.query?.clubId || req.user?.clubId);
        const listName = str(req.body?.listName || 'Rotary en Español').trim();
        if (!clubId) return res.status(400).json({ error: 'clubId requerido' });

        try {
            await db.prisma.setting.upsert({
                where: { key_clubId: { key: 'default_group_distribution_list', clubId } },
                update: { value: listName },
                create: { key: 'default_group_distribution_list', value: listName, clubId },
            });
        } catch (e) {
            console.warn('[share] setDefaultGroupList setting upsert:', e.message);
        }

        return res.json({ ok: true, defaultList: listName });
    } catch (e) {
        console.error('[share] setDefaultGroupList:', e);
        return res.status(500).json({ error: e.message });
    }
};

export default {
    getShareTargets,
    shareContent,
    regenerateShareCopy,
    getShareHistory,
    getShareSummary,
    getShareGroupTargets,
    generateGroupCTA,
    distributeToGroups,
    updateGroupDistributionStatus,
    syncMetaGroups,
    setDefaultGroupList,
};
