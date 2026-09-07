/**
 * El selector de comprobantes de un desembolso (v4.998).
 *
 * COMPARTIDO por el modal de un aporte y el del bloque —como
 * `NoticeRecipients`—: escrito dos veces, el día que cambie el tope o el tipo
 * admitido uno se queda atrás y el fallo es mudo (la casilla de distritos,
 * v4.748).
 *
 * Admite VARIOS archivos porque un giro deja varios soportes: el PDF que
 * emite el banco y la captura con el costo de la transferencia. Se SUMAN a
 * lo elegido —volver al selector no borra lo anterior— y cada uno se puede
 * quitar por separado. Lo que no entra se dice con su motivo, antes de gastar
 * la subida.
 */
import { Paperclip, X } from 'lucide-react';
import toast from 'react-hot-toast';
import { RECEIPT_ACCEPT, RECEIPT_MAX_FILES, agregarComprobantes } from '../../../lib/receiptFiles';

interface Props {
    label: string;
    files: File[];
    onChange: (files: File[]) => void;
    hint?: React.ReactNode;
    disabled?: boolean;
}

const peso = (n: number) => (n >= 1024 * 1024 ? `${(n / 1024 / 1024).toFixed(1)} MB` : `${Math.max(1, Math.round(n / 1024))} KB`);

export default function ReceiptFilesInput({ label, files, onChange, hint, disabled }: Props) {
    const lleno = files.length >= RECEIPT_MAX_FILES;
    return (
        <div>
            <span className="block text-[11px] font-bold uppercase tracking-wider text-gray-500 mb-1">
                {label}
            </span>
            <input
                type="file"
                multiple
                accept={RECEIPT_ACCEPT}
                disabled={disabled || lleno}
                aria-label={label}
                onChange={e => {
                    const elegidos = Array.from(e.target.files || []);
                    const r = agregarComprobantes(files, elegidos);
                    r.rechazados.forEach(m => toast.error(m, { duration: 8000 }));
                    onChange(r.files);
                    // Sin esto, volver a elegir el MISMO archivo no dispara
                    // `change` —el valor no cambió— y el botón parece roto
                    // justo cuando alguien reintenta (regla de v4.784).
                    e.target.value = '';
                }}
                className="w-full text-xs file:mr-3 file:px-3 file:py-1.5 file:rounded-lg file:border-0 file:bg-gray-100 file:text-xs file:font-bold disabled:opacity-50"
            />
            {files.length > 0 && (
                <ul className="mt-2 space-y-1" aria-label="Comprobantes elegidos">
                    {files.map((f, i) => (
                        <li key={`${f.name}-${f.size}-${i}`} className="flex items-center gap-2 text-xs text-gray-700 bg-gray-50 rounded-lg px-2 py-1">
                            <Paperclip className="w-3 h-3 text-gray-400 flex-shrink-0" />
                            <span className="truncate flex-1" data-no-translate>{f.name}</span>
                            <span className="text-gray-400 flex-shrink-0" data-no-translate>{peso(f.size)}</span>
                            <button
                                type="button"
                                onClick={() => onChange(files.filter((_, j) => j !== i))}
                                aria-label={`Quitar ${f.name}`}
                                title="Quitar"
                                className="p-0.5 rounded hover:bg-gray-200 text-gray-500"
                                disabled={disabled}
                            >
                                <X className="w-3 h-3" />
                            </button>
                        </li>
                    ))}
                </ul>
            )}
            <p className="text-[11px] text-gray-500 mt-1">
                {hint}{hint ? ' ' : ''}Podés elegir varios archivos a la vez o de a uno (hasta {RECEIPT_MAX_FILES}, PDF, JPG o PNG, 10 MB cada uno): por ejemplo, el PDF del banco y la captura con el costo de la transferencia.
                {lleno ? ' Ya están los ' + RECEIPT_MAX_FILES + ' admitidos; quitá uno para cambiarlo.' : ''}
            </p>
        </div>
    );
}
