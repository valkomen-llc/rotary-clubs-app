# Rotary Clubs App — guía para Claude

## Despliegue a producción

**Regla durable**: cada vez que se cree un PR a `main`, pasarlo de **draft → ready** y hacer **squash-merge** automáticamente, sin pedir confirmación. Producción se despliega desde `main` vía Vercel, así que un PR sin mergear = el cambio no llega al usuario.

Si el merge falla por conflictos:

1. `git fetch origin main && git rebase origin/main` (commits ya squash-mergeados en main se saltean solos)
2. `git push --force-with-lease origin <branch>`
3. Reintentar el merge

Idioma del PR title/body y commits: español (el equipo del cliente es hispanohablante).

## Versionado

Cada PR que toca features visibles debe bumpear:

- `package.json` → `version` y `cache_bust`
- `package-lock.json` → ambas ocurrencias de la versión (raíz y `packages.""`)
- `src/pages/SystemUpdates.tsx` → cabecera + nueva entry al tope del array `SYSTEM_UPDATES`
- Log de arranque del controller afectado (ej. `contentStudioController.js`)

Usar incrementos de patch (`v4.323` → `v4.324`) para fixes. Major-feel changes pueden saltar pero mantener semver patch sigue siendo aceptable porque el equipo trackea por número de release.

## Content Studio / Generador de Publicaciones

Archivo principal: `server/controllers/contentStudioController.js`. Función `generatePost`.

Pipeline actual (v4.323 — i2i + identity-lock):

1. Fetch + `enhanceOriginal` (sharp, pixel-space).
2. GPT-4o multimodal para copy + `visual_prompt` hint.
3. `gpt-image-1` `/v1/images/edits` **sin máscara** con `input_fidelity:"high"` y `quality:"high"` al `size` target — regenera el scene al aspecto pedido extendiendo el entorno.
4. Composite del original encima con feather de 80px (`compositeOriginalOnAi`) → caras / banderas / banners quedan pixel-perfect.

Restricciones aprendidas:

- `gpt-image-1` con máscara grande **duplica intermitentemente** (efecto mosaico / tiling). No usar masked-outpainting con bandas > ~150px transparentes. Si hace falta IA en una banda grande, usar el approach maskless + composite-back.
- Pipeline puramente pixel-space (blur background letterbox) **no es aceptable** para el equipo — la salida tiene que parecer una foto extendida real, no un letterbox.
- Regeneración pura sin composite-back deriva rostros. Siempre componer el original encima para identidad.

`vercel.json` tiene `maxDuration: 120s` para `/api` — necesario por la latencia de `gpt-image-1` con `quality:"high"`.

## GitHub

- Repo único: `valkomen-llc/rotary-clubs-app`.
- Rama de trabajo actual: ver instrucciones de la sesión.
- No usar `gh` CLI — usar las MCP tools de GitHub.
