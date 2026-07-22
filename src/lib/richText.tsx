import { Fragment, type ReactNode, type CSSProperties } from 'react';

// Renderiza un texto con formato inline simple para los contenidos editables de la portada:
//   - **negrilla**  → pone en negrita cualquier parte (o todo, si se envuelve completo)
//   - highlight/color → resalta en color la PRIMERA aparición de `highlight` (misma lógica
//     que el campo "palabras a resaltar" del editor).
// Se conservan los saltos de línea del texto original (el contenedor usa whitespace-pre-line).
export function renderRichText(text: string, opts?: { highlight?: string; color?: string }): ReactNode {
    if (!text) return text;
    const highlight = (opts?.highlight || '').trim();
    const color = opts?.color || '#f6a40a';

    // 1) Partir por **...** en segmentos { text, bold }.
    const runs: { text: string; bold: boolean }[] = [];
    const re = /\*\*([\s\S]+?)\*\*/g;
    let last = 0;
    let m: RegExpExecArray | null;
    while ((m = re.exec(text)) !== null) {
        if (m.index > last) runs.push({ text: text.slice(last, m.index), bold: false });
        runs.push({ text: m[1], bold: true });
        last = m.index + m[0].length;
    }
    if (last < text.length) runs.push({ text: text.slice(last), bold: false });
    if (runs.length === 0) runs.push({ text, bold: false });

    // 2) Aplicar el resaltado de color a la primera aparición global de `highlight`.
    let highlightDone = false;
    const renderRun = (run: { text: string; bold: boolean }, key: number): ReactNode => {
        let inner: ReactNode = run.text;
        if (highlight && !highlightDone) {
            const idx = run.text.toLowerCase().indexOf(highlight.toLowerCase());
            if (idx !== -1) {
                highlightDone = true;
                inner = (
                    <Fragment>
                        {run.text.slice(0, idx)}
                        <span style={{ color } as CSSProperties}>{run.text.slice(idx, idx + highlight.length)}</span>
                        {run.text.slice(idx + highlight.length)}
                    </Fragment>
                );
            }
        }
        return run.bold
            ? <strong key={key} className="font-bold">{inner}</strong>
            : <Fragment key={key}>{inner}</Fragment>;
    };

    return <>{runs.map(renderRun)}</>;
}

// ¿El texto usa markup de negrilla (**...**)? Útil para decidir el peso base de un título que
// hoy va todo en negrita: si el usuario marca partes con **, el resto debe quedar en peso normal.
export function hasBoldMarkup(text?: string): boolean {
    return !!text && /\*\*[\s\S]+?\*\*/.test(text);
}
