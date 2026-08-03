import React from 'react';
import { Upload, Images } from 'lucide-react';

// ════════════════════════════════════════════════════════════════════════════
// Las dos formas de poner una imagen — v4.700
//
// Toda casilla de imagen del panel ofrece SIEMPRE las dos: subir un archivo
// nuevo, o elegir una que ya está en la Biblioteca Multimedia. Antes sólo se
// podía subir, así que para reutilizar un logo que ya estaba cargado había que
// descargarlo del sitio y volverlo a subir — y quedaba duplicado en la
// biblioteca, con otro nombre y otra dirección.
//
// Se superpone sobre la vista previa y aparece al pasar el ratón, que es el
// gesto que el panel ya usaba para subir. Reutilizarlo evita agregar botones
// sueltos alrededor de cada casilla.
// ════════════════════════════════════════════════════════════════════════════

interface Props {
    /** Archivo nuevo desde el disco. */
    onUpload: (e: React.ChangeEvent<HTMLInputElement>) => void;
    /** Abre la Biblioteca Multimedia. */
    onPickFromLibrary: () => void;
    /** Igual que el del recuadro, para que el velo no se salga por las esquinas. */
    rounded?: string;
    /** Tipos aceptados al subir. */
    accept?: string;
}

const ImageSourceOverlay: React.FC<Props> = ({
    onUpload,
    onPickFromLibrary,
    rounded = 'rounded-2xl',
    accept = 'image/*',
}) => (
    <div
        className={`absolute inset-0 flex items-center justify-center gap-2 bg-black/50 opacity-0 group-hover:opacity-100 focus-within:opacity-100 transition-opacity ${rounded}`}
    >
        <label
            title="Subir un archivo nuevo"
            className="flex flex-col items-center gap-1 px-3 py-2 rounded-xl bg-white/15 hover:bg-white/30 cursor-pointer transition-colors"
        >
            <Upload className="text-white w-5 h-5" />
            <span className="text-[9px] font-black text-white uppercase tracking-wide">Subir</span>
            <input type="file" className="hidden" onChange={onUpload} accept={accept} />
        </label>

        <button
            type="button"
            onClick={onPickFromLibrary}
            title="Elegir una imagen ya cargada en la Biblioteca Multimedia"
            className="flex flex-col items-center gap-1 px-3 py-2 rounded-xl bg-white/15 hover:bg-white/30 transition-colors"
        >
            <Images className="text-white w-5 h-5" />
            <span className="text-[9px] font-black text-white uppercase tracking-wide">Biblioteca</span>
        </button>
    </div>
);

export default ImageSourceOverlay;
