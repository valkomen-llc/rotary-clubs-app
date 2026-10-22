<!-- Extraído de CLAUDE.md. Las reglas siguen vigentes: léelo ANTES de tocar este módulo. -->

## El tablero de campañas — v4.990

Pedido con el listado del Distrito 4281 delante: un tablero al entrar a
«Campañas de Contribución», como el de las inscripciones a un evento y el
Centro de Inteligencia de la Feria, con las campañas debajo. Los indicadores
que se pidieron: cuántas **solicitudes** de contenido llegaron por el
formulario que llenan los clubes, cuántos **aportantes** por campaña, cuánto se
**recaudó en dólares y en pesos**, y que la cifra en pesos lleve al historial de
aportantes en la **Bóveda de Fondos**.

| Archivo | Qué es |
|---|---|
| `server/lib/campaignBoard.js` | El CRITERIO. **Puro**: recaudo por moneda, conteo de aportes, resumen de solicitudes y armado del tablero |
| `getCampaignBoard` en `contributionCampaignController.js` | La orquestación: tres agregaciones y la degradación |
| `src/components/admin/contribution/CampaignBoard.tsx` | El tablero y la tira de indicadores de cada fila |
| `destinoKeyOf` en `src/lib/walletFilters.ts` | El espejo que arma la clave del filtro de la Bóveda |

Pruebas: dentro de `npm run test:contribution:module` (73 casos) y
`npm run test:contribution:ui` (31, navegador con la API interceptada).
Verificadas a la inversa: sumando monedas fallan 3, sin el aislamiento por
club 1, y quitando el tablero de la pantalla 3.

**Reglas durables:**

- **⚠️ ES LA CABECERA DE LA PANTALLA QUE YA HAY, NO UNA PANTALLA NUEVA.** Los
  indicadores van arriba y las campañas debajo, dentro de
  `/admin/campanas-contribucion`. Un segundo sitio donde mirar lo mismo se
  separa del primero en silencio — es la lección que costó v4.986 y la regla
  que estrenó v4.987.
- **⚠️ LAS MONEDAS NO SE SUMAN, Y NO HAY NINGÚN CAMPO QUE LAS JUNTE.** El
  recaudo viaja como una LISTA por moneda; ni la fila de una campaña ni los
  totales tienen un «total». Es la regla del módulo financiero desde v4.841 y
  acá el error se multiplicaría por la cantidad de campañas. Lo fija una prueba
  que comprueba la AUSENCIA del campo, no sólo el valor.
- **⚠️ LO QUE CUENTA ES `Donation`, NO EL CONTADOR DIARIO.** Leer
  `ContributionCampaignMetric.donation_completed` sería más barato —ya está
  agregado por campaña— y diría de MÁS: ese contador **no baja** cuando un
  aporte se reembolsa (v4.859 marca `Donation.status = 'refunded'` y el contador
  se queda donde estaba). Un tablero que afirma un dinero que se devolvió es
  peor que no tener tablero. Es el mismo razonamiento por el que
  `contributorRoll.js` tampoco lo usa, y `COUNTED_STATUS` es el mismo valor en
  los dos archivos — al tocar uno, mirar el otro.
- **⚠️ `Donation` NO GANA UNA COLUMNA DE CAMPAÑA.** La atribución sigue viviendo
  dentro de `Payment.rawPayload` y el camino es el de `contributorRollFor`: los
  pagos que MENCIONAN la campaña → sus aportes. Agregar la columna a Prisma es
  la trampa de `logo_intl` (v4.699) en su versión más cara — `Donation` y
  `Payment` se consultan con `findMany` **sin `select`** en media plataforma, y
  lo que caería en 500 es el cobro.
- **⚠️ EL ALCANCE DEL DINERO ES EL MISMO QUE EL DE LA BÓVEDA, y eso es lo que
  hace honesto el enlace.** Para un SITIO se cuentan sólo los aportes que
  entraron por su página (`Donation."clubId"`, filtrado en el WHERE), porque es
  lo que su Bóveda muestra y lo que va a ver al pulsar la cifra; una campaña de
  la plataforma que alcanza a veinte sitios tiene un recaudo total que no es de
  ninguno de ellos. Para el OPERADOR se cuenta la campaña entera. **Y se DICE en
  la pantalla**: con dos alcances distintos y sin decirlo, el número del tablero
  y el de la pantalla a la que lleva se contradirían sin explicación.
- **⚠️ LA CLAVE DEL FILTRO LA ARMA `destinoKeyOf`, NO UNA CADENA A MANO.** Es el
  MISMO criterio con el que la Bóveda agrupa un aporte por destino; con la forma
  `campana:<id>` escrita en dos sitios, el día que el criterio del servidor
  cambie el enlace llevaría a un filtro que no existe y la Bóveda saldría VACÍA,
  sin ningún error que lo dijera. Por eso el espejo del navegador ganó
  `destinoKeyOf`, comparado por SALIDAS contra el servidor en las pruebas.
- **⚠️ Y LA BÓVEDA TUVO QUE APRENDER A LEER SUS FILTROS DE LA DIRECCIÓN.** Los
  escribía hacia su API y no los leía: sin esta mitad, el enlace abriría la
  Bóveda sin filtrar y el número no cuadraría con el que se acaba de pulsar. Es
  ADITIVO —sin parámetros se comporta igual que antes—, un `rango` que no exista
  se ignora, y una `moneda` que ese sitio no cobra **se corrige sola**: dejarla
  seleccionada mostraría una caja vacía sin decir por qué.
- **El enlace lleva `rango=todo`.** La cifra del tablero es del histórico, así
  que mandar a un período recortado enseñaría un número distinto del que se
  pulsó.
- **⚠️ LA CIFRA ENLAZADA NO PUEDE IR DENTRO DEL BOTÓN DE ABRIR LA CAMPAÑA.** La
  fila era un `<button>` entero; un enlace dentro de un botón no se puede pulsar
  por separado. Ahora la fila es un `div` con el botón adentro y los indicadores
  debajo — la misma regla que sacó la casilla de selección de dentro del botón
  de editar en la Biblioteca (v4.940).
- **«APORTES» NO ES «APORTANTES», y por eso se rotula «aportes».** Contar
  personas exigiría atribuir cada aporte a alguien, y uno anónimo —o sin
  correo— no se puede atribuir sin inventarlo. `personas` cuenta los correos
  declarados, en minúsculas, y **sólo se muestra cuando aporta algo** (o sea,
  cuando es menor que el total): decir «3 aportes · 3 con correo» es ruido.
- **⚠️ LO QUE NO SE PUDO MEDIR SE DECLARA** (`medido`), y se pinta con un guion.
  Cada bloque va en su propio `try`: si no se pueden leer las solicitudes, los
  aportes se muestran igual. Un cero es una afirmación; un hueco es la verdad.
- **⚠️ EL TABLERO VA APARTE DEL LISTADO, EN SU PROPIA PETICIÓN.** El listado es
  la función principal de la pantalla y se responde con una sola consulta; el
  tablero recorre pagos, parsea su JSON y agrega solicitudes. En la misma
  respuesta, un tablero lento o roto dejaría sin listar las campañas — que es
  para lo que se entra. Su fallo se traga en el navegador y arriba no se pinta
  nada.
- **⚠️ EL NÚMERO DE CONSULTAS ES FIJO Y NO CRECE CON LAS CAMPAÑAS** (cinco). Una
  consulta POR campaña dejaría el tablero inservible con el segundo cliente
  grande — es el punto de escalabilidad de `getCentralOverview` (v4.853). Lo fija
  una prueba que las cuenta: si el número cambia, hay que volver a mirar por qué.
- **El JSON del pago se filtra AMPLIO en el SQL y se comprueba EXACTO en
  JavaScript.** Castear a `jsonb` una columna de TEXTO estalla con una sola fila
  mal formada, y Postgres no garantiza que el filtro que protege el casteo se
  evalúe antes que el casteo — mismo patrón que el reenvío de la Bóveda.
- **La cota por fecha no es un tope.** Ningún pago de estas campañas puede ser
  anterior a la más vieja de ellas, así que acota lo que se recorre sin dejar
  fuera ni un aporte. Un `LIMIT` sí dejaría fuera, y un total truncado
  presentado como total es peor que no mostrar ninguno.
- **`/board` se declara ANTES de `/:id`.** Express casa por orden y «board» se
  leería como el id de una campaña, con un fallo mudo (`check:routes`).
- **⚠️ AL PROBAR EL TABLERO EN UN NAVEGADOR, COMPARAR SIN DISTINGUIR CAJA.**
  `innerText` respeta `text-transform`, así que los rótulos en versalitas llegan
  en MAYÚSCULAS y una comprobación exacta falla con el tablero pintado delante.
  Y `boundingBox()` sobre un localizador que no existe **lanza** y se lleva por
  delante el resto del bloque: la ausencia se comprueba antes con `count()`.

**Pendientes conocidos:** ~~el número de solicitudes se muestra a un sitio que
todavía no puede abrir la bandeja~~ — **RESUELTO en v4.999**: la tarjeta lleva a
`/admin/campanas-contribucion/solicitudes` y el gate de la bandeja pasó de
`superAdminOnly` a `requireCampaignAccess`. No hay evolución en el tiempo ni
comparación entre períodos: el tablero es una foto del histórico, y los flujos
por período ya viven en la Bóveda. Y el tablero **no se filtra**: con decenas de
campañas convendría acotarlo por estado, que es la vuelta siguiente.
