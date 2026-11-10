/**
 * La confirmación MANUAL de un pago de la Feria de Proyectos — v4.1308.
 *
 * Tres piezas para la ventana «Confirmar pago manualmente» del panel:
 *
 *  - `subirComprobanteManual`: prepara → PUT directo a S3 → devuelve la clave.
 *    El servidor la comprueba al confirmar (prefijo de ESTA postulación, peso
 *    y primeros bytes); lo que se declara acá no obliga a nada.
 *  - `propuestaConfirmacion`: qué proyectos de la inscripción cubre el pago y
 *    cuánto suma, para PRELLENAR la ventana. Es una propuesta: quien confirma
 *    la cambia y el servidor decide (`manualCoverageFor`).
 *  - `fechaLocalParaInput` / `fechaInputAIso`: el `<input type="datetime-local">`
 *    trabaja en hora LOCAL. Antes se prellenaba con la hora UTC (`toISOString`)
 *    y el servidor leía el texto sin zona: un pago de las 9:56 p. m. en
 *    Colombia quedaba a las 2:56 a. m.
 */
import { leerJson, describirNoJson } from './leerJson';
import { checkReceiptFile } from './completedRegistrationSpec';

export interface ComprobanteSubido {
    key: string;
    name: string;
    contentType: string;
    size: number;
}

const dos = (n: number) => String(n).padStart(2, '0');

/** `YYYY-MM-DDTHH:mm` en la hora local del navegador. */
export const fechaLocalParaInput = (d: Date = new Date()): string =>
    `${d.getFullYear()}-${dos(d.getMonth() + 1)}-${dos(d.getDate())}T${dos(d.getHours())}:${dos(d.getMinutes())}`;

/** El valor del input (hora local) como instante ISO con zona. */
export const fechaInputAIso = (valor: string): string | null => {
    if (!valor) return null;
    const d = new Date(valor);
    return Number.isNaN(d.getTime()) ? null : d.toISOString();
};

export const subirComprobanteManual = async ({ file, prepararUrl, headers }: {
    file: File;
    prepararUrl: string;
    headers: Record<string, string>;
}): Promise<ComprobanteSubido> => {
    const problema = checkReceiptFile(file);
    if (problema) throw new Error(problema);
    const contentType = file.type || 'application/octet-stream';

    const preparar = () => fetch(prepararUrl, {
        method: 'POST',
        headers: { ...headers, 'Content-Type': 'application/json' },
        body: JSON.stringify({ filename: file.name, contentType, size: file.size }),
    });
    let res = await preparar();
    let leida = await leerJson<any>(res);
    // La primera petición tras un despliegue paga el arranque en frío.
    if (!leida.esJson || res.status >= 500) {
        await new Promise(r => setTimeout(r, 1500));
        res = await preparar();
        leida = await leerJson<any>(res);
    }
    if (!leida.esJson) throw new Error(`${describirNoJson(res, leida.crudo)} Intenta de nuevo en unos segundos.`);
    if (!res.ok) throw new Error(leida.data?.error || 'No se pudo preparar la subida del comprobante.');

    const { key, uploadUrl, contentType: firmado } = leida.data || {};
    if (!key || !uploadUrl) throw new Error('El servidor no devolvió la dirección de subida.');
    const put = await fetch(uploadUrl, { method: 'PUT', headers: { 'Content-Type': firmado || contentType }, body: file });
    if (!put.ok) throw new Error(`La subida del archivo falló (HTTP ${put.status} del almacenamiento). Intenta de nuevo.`);
    return { key, name: file.name, contentType: firmado || contentType, size: file.size };
};

export interface LineaInscripcion {
    submissionId: string;
    projectIndex: number;
    projectName: string;
    label: string;
    amount: number;
    paid: boolean;
    owes: boolean;
}

/**
 * Lo que se propone al abrir la ventana: los OTROS proyectos de la inscripción
 * que deben (marcados, porque un pago por fuera suele ser el de la inscripción
 * completa) y el valor que suman con este.
 */
export const propuestaConfirmacion = (
    submissionId: string,
    lines: LineaInscripcion[] | null | undefined,
    lineaPropia: number | null | undefined,
): { cubribles: LineaInscripcion[]; coverProjectIds: string[]; monto: number } => {
    const todas = Array.isArray(lines) ? lines : [];
    const propia = todas.find(l => l.submissionId === submissionId);
    const cubribles = todas.filter(l => l.submissionId !== submissionId && l.owes && !l.paid);
    const base = Number(propia?.amount) || Number(lineaPropia) || 0;
    return {
        cubribles,
        coverProjectIds: cubribles.map(l => l.submissionId),
        monto: base + cubribles.reduce((a, l) => a + (Number(l.amount) || 0), 0),
    };
};

/** El valor esperado para una selección: la línea propia más las cubiertas. */
export const montoEsperado = (
    submissionId: string,
    lines: LineaInscripcion[] | null | undefined,
    lineaPropia: number | null | undefined,
    coverProjectIds: string[],
): number => {
    const todas = Array.isArray(lines) ? lines : [];
    const propia = Number(todas.find(l => l.submissionId === submissionId)?.amount) || Number(lineaPropia) || 0;
    return propia + todas
        .filter(l => coverProjectIds.includes(l.submissionId))
        .reduce((a, l) => a + (Number(l.amount) || 0), 0);
};
