<!-- Extraído de CLAUDE.md. Las reglas siguen vigentes: léelo ANTES de tocar este módulo. -->

## El pool registrador de un dominio — v4.877

Cada dominio que la plataforma matricula pertenece a un POOL: la billetera que
lo financió. La asignación es una fila de `CrowdfundActivation` —cuenta como
dominio activo y genera su comisión recurrente— y se elige a mano desde la
ficha del sitio.

| Archivo | Qué es |
|---|---|
| `src/lib/registrarPools.ts` | El CRITERIO. **Puro**: qué se puede elegir, cómo se rotula el cupo y qué significa cada valor al guardar |
| `src/components/admin/RegistrarPoolPicker.tsx` | El selector, COMPARTIDO por las seis pantallas de sitios |
| El bloque del pool en `updateClub` | Crea, actualiza o borra la activación |

Pruebas: `npm run test:registrar-pools` (91 casos, **sin base, credenciales ni
red**; el bloque del criterio pide `esbuild` y se salta solo si no está).

**Reglas durables:**

- **EL SELECTOR ES UNO SOLO, NO SEIS.** Vivía escrito a mano dentro de
  `Clubs.tsx` y **en ninguna otra pantalla**, así que un RYE, una Feria, una
  Zona, un Evento o una Asociación no tenían por dónde recibir su pool — se
  reportó exactamente así, con el RYE 4281 delante: «debe aparecer la opción
  desde la herramienta de editar». Copiarlo a las otras cinco habría repetido
  lo que ya pasó con la casilla de distritos (v4.748): escrita cinco veces,
  las copias se separaron en silencio. Acá el precio de que se separen es una
  activación de facturación. Lo comprueba una prueba que lee los seis archivos
  y falla si vuelve a aparecer el rótulo escrito a mano en una pantalla.
- **⚠️ `undefined` ES «NO LO TOQUES»; `''` ES «QUITAR LA ASIGNACIÓN».** Es la
  regla de la que cuelga todo lo demás, y equivocarse borra un dato de
  facturación sin que nadie se entere. `registrarPoolId` **no es columna de
  `Club`** —se deriva de la activación— y `GET /admin/clubs` devuelve
  `SELECT c.*`, así que **el listado NUNCA lo trae**: sólo lo sabe el detalle.
  Tomando el valor ausente por «sin asignar» —que es lo que hacía `Clubs.tsx`—
  un detalle que falla convierte el siguiente guardado en un BORRADO silencioso
  de la activación. `JSON.stringify` omite las claves `undefined`, así que
  dejarlo sin definir es lo que hace que la petición ni mencione el campo, y
  `updateClub` ya distinguía las dos cosas (`if (registrarPoolId !==
  undefined)`). Mientras no se sepa, el control se muestra inerte y lo DICE:
  pintarlo en «Sin asignar» invita a guardar un borrado que nadie pidió.
- **EL VALOR ACTUAL SIEMPRE ES UNA OPCIÓN**, aunque el pool esté sin cupo y
  aunque ya no figure en el catálogo. Si no estuviera en la lista, el `select`
  se pintaría vacío y el primer guardado movería la asignación sin que nadie lo
  pidiera — el mismo defecto por la otra puerta. El pool ausente entra marcado
  y con su motivo.
- **SIN CUPO SE AVISA, NO SE BLOQUEA.** Un pool lleno es un dato para decidir,
  no una prohibición: quien administra puede saber que se amplió, y bloquearlo
  lo dejaría sin salida — «avisar sin dar salida deja un callejón». Mismo
  criterio que los avisos que no bloquean del panel de tarifas (v4.854).
- **El cupo se DERIVA de las dos cifras primitivas.** El endpoint también manda
  `availableUnits` y no se usa: con dos fuentes, el número del aviso podría
  contradecir al «3/20» del propio rótulo.
- **⚠️ ASIGNAR UN POOL ES SÓLO DEL OPERADOR, comprobado en el SERVIDOR.**
  `PUT /admin/clubs/:id` la pueden usar `club_admin`, `district_admin` y
  `crowdfunder` para su propio sitio, así que sin esa condición cualquiera de
  ellos podía crear una activación de facturación en la billetera de un pool
  ajeno mandando el campo a mano. La pantalla no lo ofrece, y esconder un
  control no protege el endpoint de quien lo conoce (v4.868). Se DESCARTA en
  silencio —patrón `stripProtected`—, no con un 403, para no romper un guardado
  legítimo que arrastre el campo.
- **El componente consulta el catálogo por su cuenta.** Las pantallas no
  guardan la lista de pools ni la piden: con la consulta en cada una, la sexta
  se olvidaría de hacerla y el selector saldría vacío sin que nada avisara.
- **Un catálogo que no carga CONSERVA lo guardado y lo dice.** Sin esa cautela,
  un fallo del endpoint dejaría el desplegable en «Sin asignar» y el guardado
  siguiente borraría la activación — la misma trampa de arriba por una tercera
  puerta.

### El distrito se ve al abrir la ficha (v4.877)

- **`district` estaba en el estado y en la pantalla, pero no se cargaba.**
  Faltaba en los dos `setFormData` de `handleOpenModal` de las CINCO pantallas
  de asociaciones, así que al editar un sitio los distritos aparecían todos sin
  marcar aunque los tuviera — es lo que se ve en la ficha del RYE 4281. No
  borraba nada (el campo no viajaba, y `addField` saltea lo `undefined`), pero
  hacía imposible saber a qué distrito estaba vinculado un sitio sin
  consultarlo por otra vía. **Y sí tenía error de tipo**: eran diez de los
  errores previos del proyecto, uno por cada objeto literal incompleto.
- **Al agregar un campo al formulario de un sitio, agregarlo a los TRES sitios**
  —el estado inicial, la rama de edición y el reset— o queda a medias sin que
  la pantalla lo diga. En `Clubs.tsx` el reset había perdido así cuatro campos
  (`subscriptionStatus`, `expirationDate` y los dos de facturación): al crear un
  sitio nuevo quedaban en `undefined` y su `<select>` pasaba a no controlado.
