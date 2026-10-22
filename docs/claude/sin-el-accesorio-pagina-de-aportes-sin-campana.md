<!-- Extraído de CLAUDE.md. Las reglas siguen vigentes: léelo ANTES de tocar este módulo. -->

## Sin el accesorio «Página de aportes sin campaña» — v4.989

Pedido expreso con la tarjeta delante («Por favor quita esto»). Se retiró la
card del final del listado y su componente (`DonatePageTextsCard.tsx`);
`'aportes'` salió de `CARD_IDS`. **Supersede** la regla de v4.987 «los textos
de la página sin campaña son un accesorio, no una pantalla»: ya no son ni
eso. Consecuencia conocida y aceptada por el cliente: la página pública
(`ManerasDeContribuir.tsx`) sigue pintando esos textos cuando no hay campaña
al aire —los guardados en `ContentSection` page=`contribucion`, o sus
respaldos— y desde el panel no hay editor para ellos; si algún día hace
falta corregirlos, la vía es volver a montar un editor, no tocar la página.
