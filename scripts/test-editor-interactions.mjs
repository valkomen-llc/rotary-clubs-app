import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

const projectRoot = process.cwd();
const visualEditorPath = path.join(projectRoot, 'src/components/admin/email-marketing/VisualTemplateEditor.tsx');
const plannerPath = path.join(projectRoot, 'src/components/admin/rotary/RotaryMarketingInteligente.tsx');

test('VisualTemplateEditor: Estructura Flexbox y scroll vertical sin bloqueos (min-h-0)', () => {
  const code = fs.readFileSync(visualEditorPath, 'utf8');

  // Verificar que el contenedor de fila y el main tienen min-h-0 y scrollbar visible permanente
  assert.ok(
    code.includes('className="flex-1 min-h-0 flex overflow-hidden"'),
    'El contenedor horizontal debe tener flex-1 min-h-0 flex overflow-hidden'
  );
  assert.ok(
    code.includes('id="rotary-visual-canvas-scroll"'),
    'El main debe tener el id rotary-visual-canvas-scroll para estilos dedicados de scrollbar'
  );
  assert.ok(
    code.includes('#rotary-visual-canvas-scroll::-webkit-scrollbar'),
    'Debe existir la regla de scrollbar visible con thumb en azul rotario #013388'
  );
  assert.ok(
    code.includes('scrollToBottom'),
    'Debe incluir función scrollToBottom para navegación rápida al pie de página'
  );
  assert.ok(
    code.includes('scrollToTop'),
    'Debe incluir función scrollToTop para navegación rápida al inicio'
  );
  assert.ok(
    code.includes('onWheel='),
    'Debe existir reenvío de eventos onWheel al contenedor principal de diseño'
  );

  // Verificar el wrapper de scroll con padding inferior amplio
  assert.ok(
    code.includes('className="w-full flex flex-col items-center pb-64 min-h-full"'),
    'El wrapper del lienzo debe tener pb-64 min-h-full para que los bloques inferiores y el footer nunca queden tapados'
  );
});

test('VisualTemplateEditor: Barra WYSIWYG dockeada al tope sin tapar el contenido del lienzo', () => {
  const code = fs.readFileSync(visualEditorPath, 'utf8');

  // Verificar que la barra WYSIWYG está dockeada encima del lienzo horizontal
  assert.ok(
    code.includes('{/* ─── 2.5. BARRA DE FORMATO ENRIQUECIDO WYSIWYG DOCKEADA AL TOPE ──── */}'),
    'Debe existir la barra WYSIWYG dockeada superiormente'
  );

  // Verificar que NO está flotando de manera pegajosa dentro del main
  const mainIndex = code.indexOf('<main');
  const toolbarInMain = code.indexOf('<InlineRichTextToolbar', mainIndex);
  assert.strictEqual(
    toolbarInMain,
    -1,
    'InlineRichTextToolbar no debe estar dentro del <main> para no flotar encima de los párrafos ni tapar el texto'
  );
});

test('VisualTemplateEditor: Renderizadores de lienzo controlados por Ref para no perder selecciones', () => {
  const code = fs.readFileSync(visualEditorPath, 'utf8');

  assert.ok(
    code.includes('const TextBlockCanvasRenderer: React.FC<TextBlockCanvasRendererProps>'),
    'TextBlockCanvasRenderer debe estar declarado'
  );
  assert.ok(
    code.includes('const HeadingBlockCanvasRenderer: React.FC<HeadingBlockCanvasRendererProps>'),
    'HeadingBlockCanvasRenderer debe estar declarado'
  );

  // Verificar uso de los renderizadores en el mapa de bloques
  assert.ok(
    code.includes('<HeadingBlockCanvasRenderer'),
    'El mapa de bloques debe instanciar HeadingBlockCanvasRenderer'
  );
  assert.ok(
    code.includes('<TextBlockCanvasRenderer'),
    'El mapa de bloques debe instanciar TextBlockCanvasRenderer'
  );

  // Verificar separación de single click (selección) vs double click (edición)
  assert.ok(
    code.includes('setSelectedBlockId(block.id);'),
    'Single click selecciona el bloque y abre el inspector'
  );
  assert.ok(
    code.includes("setEditingBlockId(block.id);"),
    'Double click activa el modo de edición de texto'
  );
});

test('VisualTemplateEditor: Drag & Drop nativo y reordenamiento de bloques', () => {
  const code = fs.readFileSync(visualEditorPath, 'utf8');

  assert.ok(
    code.includes('const handleDropBlock = (fromIndex: number, toIndex: number) =>'),
    'handleDropBlock debe estar definido para reordenar bloques'
  );
  assert.ok(
    code.includes('onDragOver={(e) => {'),
    'Los bloques deben tener manejador onDragOver'
  );
  assert.ok(
    code.includes('onDrop={(e) => {'),
    'Los bloques deben tener manejador onDrop'
  );
  assert.ok(
    code.includes('GripVertical'),
    'El tirador de arrastre GripVertical debe estar presente'
  );
});

test('VisualTemplateEditor: Inspector lateral con modo Visual vs Código HTML', () => {
  const code = fs.readFileSync(visualEditorPath, 'utf8');

  assert.ok(
    code.includes("const [textInspectorMode, setTextInspectorMode] = useState<'visual' | 'html'>('visual');"),
    'textInspectorMode debe estar inicializado en "visual"'
  );
  assert.ok(
    code.includes('<span>Modo Visual</span>'),
    'Debe existir el botón Modo Visual en el inspector'
  );
  assert.ok(
    code.includes('<span>Código HTML</span>'),
    'Debe existir el botón Código HTML en el inspector'
  );
});

test('VisualTemplateEditor: Vista Previa Final con altura dinámica 100% y sin corte de 700px', () => {
  const code = fs.readFileSync(visualEditorPath, 'utf8');

  assert.ok(
    code.includes('previewMode === \'live\''),
    'previewMode === live debe estar gestionado'
  );
  assert.ok(
    !code.includes('className="w-full min-h-[700px] border-0 bg-white"'),
    'No debe existir el iframe con límite fijo de 700px'
  );
  assert.ok(
    code.includes('dangerouslySetInnerHTML={{ __html: compiledHtml }}'),
    'Debe renderizarse compiledHtml de forma fluida y completa'
  );
});

test('RotaryMarketingInteligente: Modal de previsualización ampliado para campañas institucionales', () => {
  const code = fs.readFileSync(plannerPath, 'utf8');

  assert.ok(
    code.includes('max-w-4xl w-full max-h-[92vh]'),
    'El modal de vista previa en RotaryMarketingInteligente debe tener max-w-4xl para acomodar la plantilla con holgura'
  );
  assert.ok(
    code.includes('max-w-[620px] bg-white rounded-xl shadow-xs overflow-hidden select-text'),
    'El contenedor de la plantilla debe estar centrado con max-w-[620px]'
  );
});
