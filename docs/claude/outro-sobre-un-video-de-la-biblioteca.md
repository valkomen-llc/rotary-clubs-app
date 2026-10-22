<!-- Extraído de CLAUDE.md. Las reglas siguen vigentes: léelo ANTES de tocar este módulo. -->

## Outro sobre un video de la Biblioteca — v4.1039

Un video ya guardado en la Biblioteca Multimedia recibe un outro de los ya
existentes en la plataforma y sale como una VERSIÓN nueva, compuesta con FFmpeg,
sin pasar por ningún motor generativo.

| Archivo | Qué es |
|---|---|
| `server/lib/libraryOutro.js` | El CRITERIO. **Puro**: transición, plan (duración final, geometría, escenario de audio), grafo de ffmpeg, argumentos, presupuesto de `/tmp`, validación del resultado, claves y nombres, DTO |
| `server/lib/ensureLibraryOutroSchema.js` | `MediaOutroComposition` en runtime (fuera de Prisma) |
| `server/controllers/libraryOutroController.js` | `GET`/`POST`/`DELETE /media/:id/outro`: estado, aplicar/cambiar, quitar |
| `LibraryOutroModal` en `src/pages/admin/MediaLibrary.tsx` | El selector de outros guardados, la transición, la previsualización y la ficha de la versión |
| `prefill` en `DistributionPanel.tsx` · `?tab=distribution&kind=video&mediaUrl=` en `ContentStudio.tsx` | «Publicar» entra por la Distribución de siempre con el archivo ya cargado |

Pruebas: `npm run test:library:outro` (104 casos: criterio, seis composiciones
REALES con el ffmpeg empaquetado sobre clips sintéticos —duración, geometría y
nivel de audio medidos con `volumedetect`—, y el cableado leído de los archivos;
la composición se salta sin `ffmpeg-static`).

**Reglas durables:**

- **⚠️ NO HAY IA EN NINGÚN PUNTO, Y ES ESTRUCTURAL.** El controlador no importa
  `kieService`, `reelNarration`, `reelMusic` ni el redactor; una prueba lo lee.
  El outro que se aplica es uno YA guardado (`OutroProject` con `videoUrl`, o
  un video de la Biblioteca), así que no se regenera escena, outro, voz ni
  música: `creditsUsed = 0` literal y `credits: 0` en el plan.
- **⚠️ EL ORIGINAL NUNCA SE SOBRESCRIBE NI SE BORRA.** Hay UN solo `PutObject`
  y va sobre `versionKeyFor(original.s3Key, compositionId)` —carpeta hermana
  `outro-versions/`—; el `UPDATE "Media"` apunta a `versionMediaId` y el
  `DELETE` está guardado contra `original.id`. Lo fija la prueba leyendo el
  controlador.
- **⚠️ «CAMBIAR OUTRO» SE MONTA SIEMPRE DESDE EL MÁSTER**, nunca desde una
  versión con outro: sobre una versión, el controlador resuelve
  `existing.originalMediaId` y sobrescribe la CLAVE DE ESA VERSIÓN (la URL de
  la versión no cambia). «Quitar outro» borra la versión y su objeto, marca la
  composición `removed` y no ejecuta ffmpeg: volver al original no reprocesa.
- **⚠️ LA DURACIÓN FINAL ES `principal + outro − transición` Y EL OUTRO NUNCA SE
  TRUNCA.** Las dos entradas se conforman a la geometría del máster (cover,
  crop al centro, fps del máster, `setsar=1`, `yuv420p`), el `xfade` va con
  `offset = principal − T`, y `validateComposedOutro` rechaza el archivo si la
  duración medida se aparta más de 0,35 s. Sin `-shortest`: la duración la
  sostiene el grafo (v4.674). La transición se acota a la mitad del clip más
  corto y cae a corte si queda en 0.
- **⚠️ EL AUDIO SE PLANIFICA ANTES DE UNIR, con CUATRO escenarios declarados**
  (`AUDIO_MODES`): los dos con pista → `acrossfade` lineal (`tri`/`tri`, la
  suma de rampas es constante: sin hueco ni saturación en el cruce; con corte,
  `concat`); outro mudo → el principal se desvanece durante la transición y
  después silencio, no se le inventa audio al outro; principal mudo → el outro
  entra con `afade` y `adelay` + `asetpts=N/SR/TB` (la lección de v4.1033);
  ninguno → `-an`. Cada pista se lleva primero a la duración EXACTA de su video
  (`apad,atrim`) para que el desfase de un AAC no adelante el cruce, y la pieza
  cierra con `apad,atrim` a la duración final. **Nada de `atempo`**: la voz y
  la música del outro se oyen completas. Pedir el outro mudo es un gesto
  expreso que se anota.
- **EL PRESUPUESTO DE `/tmp` SE COMPRUEBA ANTES DE BAJAR NADA** con lo que se
  sabe (peso y duración declarados) y otra vez tras medir; `MAX_MAIN_SEC`
  (180, `LIBRARY_OUTRO_MAX_MAIN_SEC`) acota porque la composición recodifica
  la pieza entera dentro de `LIBRARY_OUTRO_TIMEOUT_MS` (240 s).
- **LA COMPOSICIÓN SE RECLAMA** (status `processing`, vencido a los 10 min):
  dos clics no componen dos veces, y todo final de intento libera el reclamo
  con su motivo.
- **LA PREVISUALIZACIÓN DEL NAVEGADOR ES APROXIMADA Y LO DICE**: dos `<video>`
  apilados con un cruce de opacidad en `duración − T`. El archivo real lo
  compone ffmpeg y la ficha de la versión reproduce ese archivo.
- **LA PANTALLA PINTA; EL SERVIDOR DECIDE.** `compositionView` viaja resuelto:
  «Listo para publicar», outro aplicado, transición, duración final, escenario
  de audio, avisos y créditos. El aislamiento es el de la Biblioteca
  (`canTouch`: operador o mismo `clubId`) y el outro de otro sitio no se
  encuentra.
- **`MediaOutroComposition` vive fuera de Prisma** y `Media` no gana ni una
  columna (regla de `logo_intl`, v4.699). Ni una comilla invertida dentro del
  `db.query(\`…\`)` del ensure.

**Pendientes conocidos:** el selector ofrece sólo los outros del Generador de
Outros con archivo listo (un video suelto de la Biblioteca elegido como outro
entra por `outroMediaId`, pero la pantalla todavía no lo ofrece); no hay
freno de composiciones simultáneas por sitio; y la versión no hereda las
publicaciones del original — se publica como un archivo nuevo desde
Distribución.
