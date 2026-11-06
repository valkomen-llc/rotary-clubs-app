// ════════════════════════════════════════════════════════════════════
// Ajustes PUNTUALES de textos de un formulario «Completar inscripción» — v4.1292
//
// Para cuando el equipo pide un texto nuevo y no puede guardarlo desde el
// panel. NO es una segunda fuente del texto: lo que se escribe es la MISMA
// clave `settings.completedForm.<campo>` que edita «Formulario público», y
// después de aplicarse manda el panel, como siempre.
//
// ⚠️ CADA AJUSTE ES CONDICIONAL E IDEMPOTENTE: sólo reemplaza si el campo
// TODAVÍA empieza con el texto viejo (`ifStartsWith`). Si alguien ya lo cambió
// desde el panel, no toca nada; una vez aplicado, la condición deja de
// cumplirse y la sentencia no vuelve a escribir. Por eso es seguro que corra
// en cada arranque de la función.
//
// Corre UNA vez por instancia (la promesa se recuerda) y NUNCA lanza: un
// tropiezo acá no puede dejar el formulario público sin cargar.
// ════════════════════════════════════════════════════════════════════
import db from './db.js';

export const COMPLETED_FORM_TEXT_FIXES = [
    {
        // Pedido del Distrito 4281 (2026-11-06): nuevo texto introductorio de
        // la XIII Conferencia — Villavicencio 2027.
        id: 'v4.1292-intro-villavicencio-2027',
        slug: 'inscripcion-conferencia-distrital-villavicencio-2027',
        field: 'intro',
        ifStartsWith: 'IMPORTANTE: Antes de continuar, tenga a la mano su comprobante de pago',
        value: 'IMPORTANTE: Es necesario tener los datos completos del participante. Deberá diligenciar un formulario de inscripción por cada uno. Si realiza un pago por más de una inscripción utilice el comprobante cuando corresponda e indíquelo en “Comentarios”. Una vez enviado el formulario recibirá confirmación. Si se requiere información adicional, el “Comité de Inscripciones” se contactará con usted al correo electrónico o WhatsApp registrado.',
    },
];

/** Los campos de texto que un ajuste puede tocar. Lista CERRADA. */
const ALLOWED_FIELDS = ['intro', 'title', 'successMessage'];

let pending = null;

export const applyCompletedFormTextFixes = () => {
    if (!pending) {
        pending = (async () => {
            for (const fix of COMPLETED_FORM_TEXT_FIXES) {
                if (!ALLOWED_FIELDS.includes(fix.field)) continue;
                try {
                    const { rowCount } = await db.query(
                        `UPDATE "EventEdition"
                            SET settings = jsonb_set(settings, ARRAY['completedForm', $2::text], to_jsonb($3::text)),
                                "updatedAt" = NOW()
                          WHERE settings->'completedForm'->>'slug' = $1
                            AND left(ltrim(COALESCE(settings->'completedForm'->>$2, '')), length($4)) = $4`,
                        [fix.slug, fix.field, fix.value, fix.ifStartsWith]);
                    if (rowCount) console.log(`[completed-registrations] ajuste de texto «${fix.id}» aplicado (${rowCount} edición).`);
                } catch (error) {
                    console.warn(`[completed-registrations] ajuste de texto «${fix.id}»:`, error?.message);
                }
            }
        })();
    }
    return pending;
};

export default { COMPLETED_FORM_TEXT_FIXES, applyCompletedFormTextFixes };
