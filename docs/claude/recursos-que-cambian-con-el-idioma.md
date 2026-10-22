<!-- Extraído de CLAUDE.md. Las reglas siguen vigentes: léelo ANTES de tocar este módulo. -->

## Recursos que cambian con el idioma — v4.699

Algunas piezas gráficas están **rotuladas** y por tanto tienen idioma: el logo
de la feria dice «Feria de Proyectos» o «Projects Fair» según la versión. Esas
piezas siguen al idioma activo del sitio.

| Archivo | Qué es |
|---|---|
| `src/lib/audienceAssets.ts` | El criterio: `isNationalLang` + `pickLocalizedAsset` |
| `src/sections/Navbar.tsx` | Resuelve el logo del encabezado |
| `server/routes/clubs.js` | `by-domain` devuelve `logoIntl` |
| `server/controllers/clubController.js` | Lo guarda como `Setting logo_intl` |
| `src/pages/admin/ClubSettings.tsx` | Campo «Logo Header (Internacional)» |

Prueba: `npm run test:assets` (21 casos). Pide `esbuild`, que se instala aparte.

**Reglas durables:**

- **La división es BINARIA, no una versión por idioma.** Nacional = `es`/`es-CO`;
  internacional = los otros siete (inglés, francés, portugués, alemán, italiano,
  japonés y coreano). Al japonés no le toca el logo en inglés por descuido: el
  cliente mantiene DOS versiones de cada pieza, la colombiana y la
  internacional, y ésta última está rotulada en inglés.
- **Manda el IDIOMA ACTIVO, no el país.** Mismo criterio que los botones de
  registro desde v4.652, y por el mismo motivo: un visitante que lee el sitio en
  inglés desde Colombia tiene que ver una página coherente.
- **`NATIONAL_LANGS` es espejo de `DEFAULT_NATIONAL_LOCALES`** del servidor
  (`eventRegistrationSpec.js`). Está duplicado a propósito, igual que
  `ADMIN_ROLES`: allá decide qué categorías de registro se ofrecen, aquí qué
  archivo se pinta. Si cambia una lista, cambiar la otra — lo comprueba
  `npm run test:assets`.
- **La pieza nacional es la de referencia.** Si no hay versión internacional
  cargada se usa ella en TODOS los idiomas. Eso es lo que hace que esta función
  no cambie nada en los sitios que no la usan, que son casi todos.
- **Nunca se deja un hueco**: entre una pieza en el idioma equivocado y ninguna
  pieza, se prefiere la primera.
- **El logo internacional vive en `Setting` (`logo_intl`), NO como columna de
  `Club`.** Y el motivo es importante: `/clubs/by-domain` consulta con **Prisma**,
  así que una columna declarada en `schema.prisma` que todavía no exista en la
  base haría responder **500 a todo el sitio público** desde el primer despliegue
  hasta que alguien la creara. `Setting` ya es donde viven los logos de
  Rotaract/Interact y el tamaño del encabezado; se hereda del club maestro igual
  que ellos. **No convertirlo en columna** sin resolver antes ese orden de
  despliegue.
- **Para aplicar esto a otra imagen**: usar `pickLocalizedAsset` y añadir el
  campo donde ya se sube la original. No reescribir la comprobación a mano —
  fue justamente lo que hizo que el fallo de los enlaces externos apareciera en
  siete lugares a la vez (v4.657).

**Pendiente:** el cliente todavía no ha definido qué imágenes de la portada
llevan versión internacional. El mecanismo está listo; falta la lista.
