/**
 * Subir o reemplazar el comprobante de una inscripción completada — v4.1291.
 *
 * El MISMO recorrido para la ficha del panel (Equipo de Registro) y para «Mis
 * eventos» (el participante); cambian sólo las dos direcciones y la sesión:
 *
 *   1. pedir una URL prefirmada (el servidor decide si se puede y qué se acepta),
 *   2. subir el archivo DIRECTO a S3 (el cuerpo de una función se corta en ~4,5 MB),
 *   3. confirmar la clave; el servidor comprueba el objeto real y lo deja vigente.
 *
 * Ninguna respuesta se asume JSON (`leerJson`, regla de v4.946), y la
 * preparación se reintenta UNA vez ante un 5xx o una respuesta sin JSON: la
 * primera petición tras un despliegue paga el arranque en frío.
 */
import { leerJson, describirNoJson } from './leerJson';
import { checkReceiptFile } from './completedRegistrationSpec';

export interface SubirComprobanteOpts {
    file: File;
    /** POST que devuelve `{ key, uploadUrl, contentType }`. */
    prepararUrl: string;
    /** PUT que recibe `{ receipt: { key, name, contentType } }`. */
    confirmarUrl: string;
    /** Encabezados de la sesión (sin `Content-Type`; se agrega acá). */
    headers: Record<string, string>;
}

const espera = (ms: number) => new Promise(r => setTimeout(r, ms));

const errorDe = (data: any, fallback: string) => {
    const base = data?.error || fallback;
    return data?.detail ? `${base} — ${data.detail}` : base;
};

export const subirComprobante = async <T = any>({ file, prepararUrl, confirmarUrl, headers }: SubirComprobanteOpts): Promise<T> => {
    const problema = checkReceiptFile(file);
    if (problema) throw new Error(problema);

    const contentType = file.type || 'application/octet-stream';
    const jsonHeaders = { ...headers, 'Content-Type': 'application/json' };

    const preparar = () => fetch(prepararUrl, {
        method: 'POST', headers: jsonHeaders,
        body: JSON.stringify({ filename: file.name, contentType, size: file.size }),
    });
    let res = await preparar();
    let leida = await leerJson<any>(res);
    if (!leida.esJson || res.status >= 500) {
        await espera(1500);
        res = await preparar();
        leida = await leerJson<any>(res);
    }
    if (!leida.esJson) throw new Error(`${describirNoJson(res, leida.crudo)} Intenta de nuevo en unos segundos.`);
    if (!res.ok) throw new Error(errorDe(leida.data, 'No se pudo preparar la subida del comprobante.'));

    const { key, uploadUrl, contentType: firmado } = leida.data || {};
    const put = await fetch(uploadUrl, { method: 'PUT', headers: { 'Content-Type': firmado || contentType }, body: file });
    if (!put.ok) throw new Error(`La subida del archivo falló (HTTP ${put.status} del almacenamiento). Intenta de nuevo.`);

    const conf = await fetch(confirmarUrl, {
        method: 'PUT', headers: jsonHeaders,
        body: JSON.stringify({ receipt: { key, name: file.name, contentType } }),
    });
    const confLeida = await leerJson<any>(conf);
    if (!confLeida.esJson) throw new Error(`${describirNoJson(conf, confLeida.crudo)} Intenta de nuevo en unos segundos.`);
    if (!conf.ok) throw new Error(errorDe(confLeida.data, 'No se pudo guardar el comprobante.'));
    return confLeida.data as T;
};

export default subirComprobante;
