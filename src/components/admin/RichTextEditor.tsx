import { Suspense, lazy } from 'react';

/**
 * El editor de texto enriquecido, cargado SÓLO cuando se va a pintar.
 *
 * ⚠️ POR QUÉ ES PEREZOSO. `react-quill-new` y su hoja de estilos pesan **206
 * kB**. Importado de forma estática entra en el chunk de la pantalla, así que
 * se descarga aunque nadie llegue a ver el editor — y en Configuración /
 * Identidad eso es exactamente lo que pasaba: la pestaña de entrada es
 * «estado» y el único editor vive en «identidad», tres pestañas más allá.
 * Se reportó como «la configuración se demora mucho en cargar».
 *
 * El respaldo NO es un hueco vacío: conserva la altura del editor, así que la
 * pantalla no salta cuando llega. Un salto de maquetación medio segundo
 * después de abrir se lee como que algo se rompió.
 *
 * `Suspense` va DENTRO de este componente y no en cada pantalla que lo use:
 * puesto afuera, la siguiente que lo monte se olvidaría y el fallo sería mudo
 * —React sube al `Suspense` más cercano, que en el panel es el de las rutas, y
 * entonces la PANTALLA ENTERA parpadearía a un spinner mientras baja el
 * editor—.
 */
// Se carga `QuillEditor`, no `react-quill-new` a secas: ese módulo lleva
// dentro la hoja de estilos, y ésa es justamente la pieza que NO puede
// importarse de forma estática desde acá — ver el comentario de QuillEditor.
const ReactQuill = lazy(() => import('./QuillEditor'));

export interface RichTextEditorProps {
    value: string;
    onChange: (value: string) => void;
    /** Alto del área de escritura. Tiene que coincidir con el del respaldo. */
    className?: string;
    placeholder?: string;
}

const RichTextEditor = ({ value, onChange, className = 'h-40', placeholder }: RichTextEditorProps) => (
    <Suspense fallback={
        <div className={`${className} w-full bg-gray-50 animate-pulse`} aria-hidden="true" />
    }>
        <ReactQuill theme="snow" value={value} onChange={onChange} className={className} placeholder={placeholder} />
    </Suspense>
);

export default RichTextEditor;
