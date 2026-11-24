import type { CSSProperties } from 'react';

/** Retardo escalonado de la entrada: `style={enter(2)}` junto a la clase `cpd-in`. */
export const enter = (i: number) => ({ '--i': i }) as CSSProperties;
