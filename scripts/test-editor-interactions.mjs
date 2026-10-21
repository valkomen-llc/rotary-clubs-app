#!/usr/bin/env node
// ════════════════════════════════════════════════════════════════════
// Tests: Diagnóstico y Validación Funcional del Editor Visual de Email
// Cubre:
// 1. Arquitectura de Desplazamiento (Scroll Canvas): min-h-0, overflow-y-auto, pb-48.
// 2. Jerarquía de Interacción: Single-click (selección/inspector) vs Double-click (edición enriquecida).
// 3. Sistema de Drag & Drop y Reordenamiento de Bloques: handleDropBlock, handleMoveBlock, handleAddBlockAt.
// 4. Integridad Editorial y Preservación de Campaña [DIR-SEM-02]: Merge tags, estructura y protección institucional.
// 5. Exclusividad del Inspector Lateral y Catálogo de Bloques.
// ════════════════════════════════════════════════════════════════════
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  renderDesignToHtml,
  cleanUnresolvedVariables,
  textToHtml,
  sanitizeRichTextHtml
} from '../server/lib/emailBlocks.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const editorSourcePath = path.resolve(__dirname, '../src/components/admin/email-marketing/VisualTemplateEditor.tsx');
const editorSource = fs.readFileSync(editorSourcePath, 'utf-8');

// ─── TEST 1: ARQUITECTURA DE SCROLL Y CONTENEDORES CSS ───
test('Arquitectura CSS: flex-1 con min-h-0, createPortal y overflow-y-scroll previenen el bloqueo de scroll vertical en el lienzo y la barra lateral', () => {
  // 1. El modal debe usar createPortal para desacoplarse del DOM de AdminLayout
  assert.ok(
    editorSource.includes('createPortal(editorModalContent, document.body)'),
    'El editor debe montarse mediante createPortal en document.body para aislarse de scrolls ancestros'
  );

  // 2. El contenedor raíz debe tener z-[99999] y dimensiones de pantalla completas
  assert.ok(
    editorSource.includes('fixed inset-0 z-[99999] h-screen w-screen bg-slate-100 flex flex-col text-slate-800 font-sans overflow-hidden'),
    'El contenedor raíz debe cubrir el viewport con z-[99999] y bloquear overflow exterior'
  );

  // 3. El contenedor flex padre de la fila central debe tener min-h-0
  assert.ok(
    editorSource.includes('className="flex-1 min-h-0 flex overflow-hidden"'),
    'El contenedor flex principal debe incluir min-h-0 para permitir que los hijos calculen la altura del viewport'
  );

  // 4. El elemento <main> debe tener flex-1 min-h-0 overflow-y-scroll con scrollbar estable
  assert.ok(
    editorSource.includes('className="flex-1 min-h-0 bg-slate-200/60 overflow-y-scroll'),
    'El lienzo <main> debe tener min-h-0 y overflow-y-scroll para garantizar scroll continuo y visible con rueda y trackpad'
  );

  // 5. El panel lateral <aside> debe tener min-h-0
  assert.ok(
    editorSource.includes('<aside className="w-80 sm:w-96 bg-white border-l border-slate-200 flex flex-col min-h-0 shrink-0 z-20">'),
    'La barra lateral debe tener min-h-0 para mantener su propio scroll independiente'
  );

  // 6. El contenedor de scroll interno del aside debe tener min-h-0 overflow-y-auto
  assert.ok(
    editorSource.includes('className="flex-1 min-h-0 overflow-y-auto p-4 space-y-4"'),
    'El scroll interior del inspector/catálogo debe tener min-h-0 y overflow-y-auto'
  );

  // 7. Wrapper con padding inferior amplio (pb-64) para no cortar footers ni botones inferiores
  assert.ok(
    editorSource.includes('className="w-full flex flex-col items-center pb-64 min-h-full"'),
    'Debe existir un wrapper de lienzo con pb-64 para garantizar acceso cómodo hasta el último bloque'
  );
});

// ─── TEST 2: SEPARACIÓN DE MODOS DE INTERACCIÓN Y EDICIÓN INMEDIATA ───
test('Jerarquía de Interacción: un clic selecciona bloque y activa edición en texto/encabezados sin trampas de cursor', () => {
  // 1. Debe existir estado editingBlockId separado de selectedBlockId
  assert.ok(editorSource.includes('const [selectedBlockId, setSelectedBlockId] = useState<string | null>(null);'));
  assert.ok(editorSource.includes('const [editingBlockId, setEditingBlockId] = useState<string | null>(null);'));

  // 2. Click activa edición en bloques de texto o encabezados
  assert.ok(
    editorSource.includes("if (!isProt && !readOnly && (block.type === 'text' || block.type === 'heading')) {\n                              setEditingBlockId(block.id);"),
    'Clic simple en bloque editable debe habilitar el modo de edición de inmediato'
  );

  // 3. contentEditable se habilita para textos y encabezados
  assert.ok(
    editorSource.includes('contentEditable={isEditing && !isProt && !readOnly}'),
    'contentEditable debe activarse en modo isEditing para permitir edición directa en el lienzo'
  );

  // 4. Edición de encabezados en el lienzo
  assert.ok(
    editorSource.includes("{block.type === 'heading' ? ("),
    'Los encabezados deben renderizarse con soporte de edición en vivo'
  );

  // 5. Asistente visual estructurado para componentes HTML en la barra lateral
  assert.ok(
    editorSource.includes('Textos del Componente Institucional'),
    'El inspector lateral debe ofrecer campos amigables para editar los textos de componentes HTML'
  );

  // 6. Botón de edición explícito en barra flotante rápida (Edit3)
  assert.ok(
    editorSource.includes('<Edit3 className="w-3.5 h-3.5" />'),
    'Debe haber botón directo para editar texto en la barra rápida del bloque'
  );
});

// ─── TEST 3: SISTEMA DE DRAG & DROP Y REORDENAMIENTO ───
test('Sistema Drag & Drop: controlador con GripVertical, handleDropBlock y handleAddBlockAt', () => {
  // 1. Drag handle con icono GripVertical y draggable
  assert.ok(
    editorSource.includes('<GripVertical className="w-3.5 h-3.5" />'),
    'Debe existir el controlador de arrastre visual GripVertical'
  );
  assert.ok(
    editorSource.includes('draggable'),
    'El controlador de arrastre debe tener el atributo draggable activado'
  );

  // 2. Reordenamiento nativo handleDropBlock
  assert.ok(
    editorSource.includes('const handleDropBlock = (fromIndex: number, toIndex: number) => {'),
    'handleDropBlock debe estar implementado para reordenar bloques'
  );

  // 3. Inserción en posición específica handleAddBlockAt
  assert.ok(
    editorSource.includes('const handleAddBlockAt = (type: BlockType, targetIndex?: number) => {'),
    'handleAddBlockAt debe permitir insertar bloques en posiciones específicas o al final'
  );

  // 4. Fuentes de arrastre en los Bloques Disponibles del panel lateral
  assert.ok(
    editorSource.includes("e.dataTransfer.setData('application/rotary-new-block-type', item.type);"),
    'Los bloques del catálogo deben ser fuentes de arrastre con tipo de bloque registrado'
  );

  // 5. Zona de caída en el fondo del lienzo
  assert.ok(
    editorSource.includes('+ Arrastra un bloque aquí o haz clic para abrir la biblioteca'),
    'Debe existir zona de inserción inferior en el lienzo'
  );
});

// ─── TEST 4: EXCLUSIVIDAD DEL PANEL LATERAL Y VOLVER A BLOQUES ───
test('Panel Lateral: inspector contextual con botón de retorno y catálogo accesible', () => {
  // 1. Botón "Volver" a bloques dentro del inspector
  assert.ok(
    editorSource.includes('title="Volver al catálogo de bloques"'),
    'El inspector debe contar con botón para regresar al catálogo de bloques'
  );

  // 2. Al hacer clic en cualquier pestaña superior (Bloques, Diseños, Globales, Estilo, Tags), se deselecciona el bloque
  assert.ok(
    editorSource.includes("setActiveTab('blocks');\n              }}"),
    'El cambio de pestaña debe deseleccionar el bloque para mostrar la biblioteca limpia'
  );

  // 3. Renderizado condicional exclusivo del inspector vs catálogo
  assert.ok(
    editorSource.includes('{selectedBlock ? ('),
    'Debe renderizar condicionalmente el inspector cuando hay un bloque seleccionado'
  );
});

// ─── TEST 5: SIMULACIÓN DE OPERACIONES EN MEMORIA (REORDENAMIENTO, DUPLICACIÓN, BORRADO) ───
test('Lógica funcional de reordenamiento, duplicación y eliminación de bloques', () => {
  let blocks = [
    { id: 'b1', type: 'global', globalKey: 'rotary_header', isProtected: true },
    { id: 'b2', type: 'heading', text: 'Hola Líder Rotario', isProtected: false },
    { id: 'b3', type: 'text', text: 'Texto de campaña', isProtected: false },
    { id: 'b4', type: 'global', globalKey: 'rotary_footer', isProtected: true }
  ];

  // Simular handleMoveBlock (bajar b2)
  const moveBlock = (arr, index, direction) => {
    const targetIdx = direction === 'up' ? index - 1 : index + 1;
    if (targetIdx < 0 || targetIdx >= arr.length) return arr;
    const copy = [...arr];
    const [moved] = copy.splice(index, 1);
    copy.splice(targetIdx, 0, moved);
    return copy;
  };

  blocks = moveBlock(blocks, 1, 'down');
  assert.equal(blocks[1].id, 'b3', 'b3 ahora debe estar en el índice 1');
  assert.equal(blocks[2].id, 'b2', 'b2 ahora debe estar en el índice 2');

  // Simular handleDropBlock (arrastrar b3 a la posición 2)
  const dropBlock = (arr, from, to) => {
    const copy = [...arr];
    const [moved] = copy.splice(from, 1);
    copy.splice(to, 0, moved);
    return copy;
  };

  blocks = dropBlock(blocks, 1, 2);
  assert.equal(blocks[1].id, 'b2');
  assert.equal(blocks[2].id, 'b3');

  // Simular handleDuplicateBlock
  const duplicateBlock = (arr, index) => {
    const orig = arr[index];
    const copy = { ...orig, id: 'b_copy', isProtected: false };
    const res = [...arr];
    res.splice(index + 1, 0, copy);
    return res;
  };

  blocks = duplicateBlock(blocks, 2); // Duplicar b3
  assert.equal(blocks.length, 5);
  assert.equal(blocks[3].id, 'b_copy');
  assert.equal(blocks[3].text, 'Texto de campaña');
  assert.equal(blocks[3].isProtected, false, 'Las copias siempre son editables');

  // Simular handleDeleteBlock
  blocks = blocks.filter(b => b.id !== 'b_copy');
  assert.equal(blocks.length, 4);
  assert.ok(!blocks.some(b => b.id === 'b_copy'));
});

// ─── TEST 6: PRESERVACIÓN EXACTA DE LA CAMPAÑA [DIR-SEM-02] Y MERGE TAGS ───
test('Integridad de Campaña [DIR-SEM-02]: compilación HTML, variables y protección institucional', () => {
  const dirSem02Design = {
    version: 1,
    settings: {
      width: 600,
      bg: '#f1f5f9',
      contentBg: '#ffffff',
      textColor: '#334155',
      linkColor: '#013388',
      font: "'Open Sans', Arial, sans-serif"
    },
    blocks: [
      {
        id: 'header-prot',
        type: 'global',
        globalKey: 'rotary_header',
        label: 'Cabecera Distrital Oficial',
        isProtected: true
      },
      {
        id: 'heading-1',
        type: 'heading',
        level: 2,
        text: 'Una identidad digital que conecta y fortalece tu club.',
        color: '#005a9c',
        align: 'center',
        isProtected: false
      },
      {
        id: 'text-saludo',
        type: 'text',
        text: '<p><strong>Hola {{contact.first_name|Líder Rotario(a)}},</strong></p><p>Estimadas rotarias y estimados rotarios:</p><p>Motivar la actualización de la información institucional y los recursos multimedia del club para multiplicar el alcance y credibilidad en el distrito.</p>',
        isProtected: false
      },
      {
        id: 'text-directorio',
        type: 'text',
        text: '<p><strong>Directorio Oficial de Clubes Distrito 4281:</strong></p><p>Centraliza la ficha pública de <strong>{{club.name|su Club}}</strong> en <strong>{{club.city|su localidad}}</strong>, facilitando que nuevos miembros y la comunidad general puedan contactarlos.</p>',
        isProtected: false
      },
      {
        id: 'footer-prot',
        type: 'global',
        globalKey: 'rotary_footer',
        label: 'Footer Institucional',
        isProtected: true
      }
    ]
  };

  // 1. Compilar HTML
  const compiled = renderDesignToHtml(dirSem02Design, {
    interactive: false,
    siteContext: {
      id: 'd4281',
      name: 'Distrito 4281 Rotary International',
      logoUrl: '/logos/rotary-4281.png'
    }
  });

  // 2. Verificar que el HTML contenga los textos de la campaña [DIR-SEM-02]
  assert.ok(compiled.includes('Una identidad digital que conecta y fortalece tu club.'));
  assert.ok(compiled.includes('Estimadas rotarias y estimados rotarios:'));
  assert.ok(compiled.includes('Directorio Oficial de Clubes Distrito 4281:'));

  // 3. Verificar que las variables dinámicas se mantengan intactas para su reemplazo en el envío
  assert.ok(compiled.includes('{{contact.first_name|Líder Rotario(a)}}'));
  assert.ok(compiled.includes('{{club.name|su Club}}'));
  assert.ok(compiled.includes('{{club.city|su localidad}}'));

  // 4. Verificar reemplazo de variables en runtime con datos de prueba
  const personalized = cleanUnresolvedVariables(compiled, {
    'contact.first_name': 'Gustavo Adolfo',
    'club.name': 'Rotary Club Medellín',
    'club.city': 'Medellín'
  });

  assert.ok(personalized.includes('Hola Gustavo Adolfo'));
  assert.ok(personalized.includes('Rotary Club Medellín'));
  assert.ok(personalized.includes('Medellín'));
});
