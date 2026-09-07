// El bucket, en memoria, con LA MISMA FORMA que el SDK v3 de AWS.
//
// `PutObjectCommand` guarda los bytes bajo su clave; `GetObjectCommand` los
// devuelve con un `Body.transformToByteArray()`, que es lo que el SDK real
// entrega y lo que `receiptAttachment` lee. Un doble que devolviera el Buffer
// suelto dejaría en verde un código que en producción no sabe leer el stream.
export const objetos = new Map();
export const llamadas = [];
/** `fallarLectura`: el bucket responde y el objeto no se puede leer — para
 *  probar que un comprobante ilegible NO frena la notificación. */
export const control = { fallarLectura: false };
export const reset = () => { objetos.clear(); llamadas.length = 0; control.fallarLectura = false; };

export class PutObjectCommand { constructor(input) { this.input = input; this.tipo = 'put'; } }
export class GetObjectCommand { constructor(input) { this.input = input; this.tipo = 'get'; } }
export class S3Client {
    constructor(cfg) { this.cfg = cfg; }
    async send(cmd) {
        llamadas.push({ tipo: cmd.tipo, key: cmd.input?.Key });
        if (cmd.tipo === 'put') {
            objetos.set(cmd.input.Key, { bytes: Buffer.from(cmd.input.Body), contentType: cmd.input.ContentType });
            return {};
        }
        if (cmd.tipo === 'get') {
            if (control.fallarLectura) throw new Error('AccessDenied (simulado)');
            const o = objetos.get(cmd.input.Key);
            if (!o) { const e = new Error('NoSuchKey'); e.name = 'NoSuchKey'; throw e; }
            return { ContentType: o.contentType, Body: { transformToByteArray: async () => new Uint8Array(o.bytes) } };
        }
        return {};
    }
}
export default { S3Client, PutObjectCommand, GetObjectCommand };
