/**
 * El editor y SU HOJA DE ESTILOS, juntos, en un módulo que se carga aparte.
 *
 * ⚠️ EL `import` DEL CSS TIENE QUE ESTAR ACÁ DENTRO, no en quien hace el
 * `lazy()`. Está medido: con la hoja importada desde `RichTextEditor.tsx`
 * —que sí es estático— Vite la asigna al chunk `vendor-editor` (la regla de
 * `manualChunks` captura todo `node_modules/react-quill*`), y entonces ese
 * chunk pasa a ser dependencia ESTÁTICA de la pantalla: `__vitePreload` lo
 * descarga igual y los 206 kB vuelven, con el `lazy()` puesto y sin que nada
 * avise. Comprobado con el iniciador de la petición en el navegador.
 *
 * Al vivir el CSS acá, viaja con el chunk perezoso y el editor sigue siendo
 * autosuficiente: quien lo monte no tiene que acordarse de importar nada.
 */
import ReactQuill from 'react-quill-new';
import 'react-quill-new/dist/quill.snow.css';

export default ReactQuill;
