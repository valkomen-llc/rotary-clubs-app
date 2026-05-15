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

**Regla #1: NO POSTPROCESAR el output de gpt-image-1.** Equipo cliente rechazó múltiples versiones donde aplicamos composite-back / máscara / blur sobre el output del modelo — siempre se ve "overlay / pegado / montaje". ChatGPT (referencia explícita del equipo) no postprocesa. Replicar ese flujo: foto + prompt → output as-is.

Pipeline actual (v4.325 — direct i2i):

1. Fetch + `enhanceOriginal` (sharp, pixel-space, identidad intacta).
2. GPT-4o multimodal para copy social (FB/IG/X/LinkedIn). El `visual_prompt` ya no se usa.
3. `gpt-image-1` `/v1/images/edits` **sin máscara** con `input_fidelity:"high"` y `quality:"high"` al `size` target. Prompt corto (3 líneas) pidiendo conversión a portrait/landscape preservando sujetos.
4. **Devolver el buffer del modelo TAL CUAL.** Sin composite, sin máscara, sin feather, sin blur, sin nada.

Trade-off aceptado por el equipo: la IA regenera el scene completo, hay leve drift de rostros / ropa (visible incluso en la salida ChatGPT que tomaron como referencia). A cambio: cero overlays visibles.

Approaches DESCARTADOS (no volver a probarlos sin razón muy fuerte):

- **Masked outpainting con bandas grandes** (v4.317-v4.320): `gpt-image-1` con máscara grande duplica intermitentemente (efecto mosaico / tiling). Sin solución por prompt.
- **Letterbox / blur background** (v4.321): equipo rechazó — "no quiero fondos difuminados".
- **Composite-back del original** (v4.323-v4.324): equipo rechazó — "se ve overlay / montaje". Aunque preserve identidad, el seam visible entre original e IA arruina el resultado.
- **Seeded mirror + masked edit** (v4.324): inteligente en teoría pero termina siendo otra forma de composite, mismo rechazo.

Prompts largos con listas negras (NO banderas, NO logos, NO X, NO Y) son contraproducentes — el modelo se obsesiona con lo prohibido. Mantener prompts cortos y positivos.

`vercel.json` tiene `maxDuration: 120s` para `/api` — necesario por la latencia de `gpt-image-1` con `quality:"high"`.

## GitHub

- Repo único: `valkomen-llc/rotary-clubs-app`.
- Rama de trabajo actual: ver instrucciones de la sesión.
- No usar `gh` CLI — usar las MCP tools de GitHub.
