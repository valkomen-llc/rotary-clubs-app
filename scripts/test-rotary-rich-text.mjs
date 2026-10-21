#!/usr/bin/env node
// ════════════════════════════════════════════════════════════════════
// Tests: Editor Visual de Texto Enriquecido (WYSIWYG) en Email Marketing
// Verifica:
// 1. Detección de texto plano vs HTML enriquecido (isRichTextHtml).
// 2. Sanitización estricta de HTML compatible con Gmail, Outlook y Apple Mail.
// 3. Formato parcial dentro de un mismo bloque (palabra en negrita sin afectar el resto).
// 4. Preservación intacta de variables dinámicas (Merge Tags) con y sin fallback.
// 5. Resolución correcta de variables embebidas en HTML y atributos href.
// 6. Protección contra inyección de scripts maliciosos y eventos JS.
// ════════════════════════════════════════════════════════════════════
import test from 'node:test';
import assert from 'node:assert/strict';
import {
  isRichTextHtml,
  sanitizeRichTextHtml,
  textToHtml,
  cleanUnresolvedVariables,
  renderDesignToHtml
} from '../server/lib/emailBlocks.js';

test('isRichTextHtml detecta correctamente texto plano vs HTML con formato', () => {
  // Texto plano tradicional
  assert.equal(isRichTextHtml('Hola a todos los rotarios'), false);
  assert.equal(isRichTextHtml('Línea 1\n\nLínea 2 con párrafo'), false);
  assert.equal(isRichTextHtml('Valores: 2 < 3 y 5 > 4'), false);

  // Texto con formato enriquecido
  assert.ok(isRichTextHtml('<p>Párrafo formateado</p>'));
  assert.ok(isRichTextHtml('Texto con <strong>negrilla</strong>'));
  assert.ok(isRichTextHtml('Texto con <em>cursiva</em>'));
  assert.ok(isRichTextHtml('Texto con <span style="color: #dc2626">color</span>'));
  assert.ok(isRichTextHtml('Enlace <a href="https://rotary4281.org">aquí</a>'));
  assert.ok(isRichTextHtml('<ul><li>Item 1</li><li>Item 2</li></ul>'));
});

test('textToHtml mantiene retrocompatibilidad total con texto plano heredado', () => {
  const plain = 'Estimadas rotarias y estimados rotarios:\n\nCada club tiene una historia que contar.';
  const html = textToHtml(plain);
  assert.ok(html.includes('<p style="margin:0 0 12px 0;line-height:inherit">Estimadas rotarias y estimados rotarios:</p>'));
  assert.ok(html.includes('<p style="margin:0 0 12px 0;line-height:inherit">Cada club tiene una historia que contar.</p>'));
});

test('textToHtml procesa formato parcial dentro de un mismo bloque sin escapar HTML', () => {
  const message = 'Cada club tiene una historia que contar, líderes que inspiran y proyectos que transforman comunidades. <strong>¡Es momento de hacer visible todo ese impacto!</strong>';
  const html = textToHtml(message);
  
  // No debe contener entidades escapadas como &lt;strong&gt;
  assert.ok(!html.includes('&lt;strong&gt;'), 'No debe escapar los tags HTML');
  assert.ok(html.includes('<strong>¡Es momento de hacer visible todo ese impacto!</strong>'), 'Debe preservar el tag <strong> intacto');
  assert.ok(html.includes('Cada club tiene una historia que contar'), 'Debe conservar el texto previo sin modificar');
});

test('sanitizeRichTextHtml limpia scripts peligrosos y preserva estilos seguros de email', () => {
  const dirty = '<p>Mensaje con <script>alert("hack")</script> y enlace <a href="javascript:steal()">click</a> y <span onclick="doBad()">texto</span> <strong>seguro</strong>.</p>';
  const clean = sanitizeRichTextHtml(dirty);

  assert.ok(!clean.includes('<script>'), 'Debe eliminar tags de script');
  assert.ok(!clean.includes('steal()'), 'Debe neutralizar enlaces javascript:');
  assert.ok(!clean.includes('onclick'), 'Debe eliminar atributos de eventos on*');
  assert.ok(clean.includes('<strong>seguro</strong>'), 'Debe conservar tags seguros');
});

test('las variables dinámicas Merge Tags se preservan y resuelven en HTML enriquecido', () => {
  const content = '<p>Hola <strong>{{contact.first_name|Líder Rotario(a)}}</strong>,</p><p>Te invitamos a actualizar <a href="{{form_url}}">{{club.name|su Club}}</a> con avance del <span>{{club.completion_percentage|0%}}</span>.</p>';
  
  // 1. textToHtml debe preservarlas
  const formatted = textToHtml(content);
  assert.ok(formatted.includes('{{contact.first_name|Líder Rotario(a)}}'));
  assert.ok(formatted.includes('{{club.name|su Club}}'));
  assert.ok(formatted.includes('{{club.completion_percentage|0%}}'));
  assert.ok(formatted.includes('{{form_url}}'));

  // 2. cleanUnresolvedVariables debe resolverlas con valores reales o fallbacks
  const resolved = cleanUnresolvedVariables(formatted, {
    'contact.first_name': 'María Camila',
    'club.name': 'Rotary Club Medellín',
    'club.completion_percentage': '90%'
  });

  assert.ok(resolved.includes('<strong>María Camila</strong>'), 'Debe reemplazar variable de contacto');
  assert.ok(resolved.includes('Rotary Club Medellín</a>'), 'Debe reemplazar variable de club');
  assert.ok(resolved.includes('<span>90%</span>'), 'Debe reemplazar porcentaje');
  assert.ok(resolved.includes('https://rotary4281.org/rotary-en-accion'), 'Debe resolver form_url institucional');
});

test('renderDesignToHtml renderiza bloques de texto con estilos enriquecidos para email', () => {
  const testDesign = {
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
        id: 'block-text-1',
        type: 'text',
        align: 'left',
        color: '#1e293b',
        size: 15,
        text: '<p>Estimados socios: <span style="color:#005a9c;font-weight:700">¡Gran logro distrital!</span></p><p>Pueden ver los detalles en <a href="https://rotary4281.org">este enlace</a>.</p>'
      }
    ]
  };

  const html = renderDesignToHtml(testDesign, { interactive: false });
  assert.ok(html.includes('font-weight:700'), 'Debe incluir el estilo de peso inline');
  assert.ok(html.includes('color:#005a9c'), 'Debe incluir el color de texto azul');
  assert.ok(html.includes('target="_blank"'), 'Debe asegurar target="_blank" en el enlace');
  assert.ok(html.includes('rel="noopener noreferrer"'), 'Debe asegurar rel="noopener noreferrer"');
});
