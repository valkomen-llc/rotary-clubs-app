import { Fragment, type ReactNode, type CSSProperties } from 'react';

// Renderiza un texto con formato inline simple para los contenidos editables de la portada:
//   - **negrilla**  → pone en negrita cualquier parte (o todo, si se envuelve completo)
//   - bold → pone en negrita la PRIMERA aparición de ese texto (campo "palabras en negrilla"
//     del editor; alternativa amigable al markup ** para quien no quiere escribir asteriscos).
//   - highlight/color → resalta en color la PRIMERA aparición de `highlight` (misma lógica
//     que el campo "palabras a resaltar" del editor).
// Se conservan los saltos de línea del texto original (el contenedor usa whitespace-pre-line).
export function renderRichText(text: string, opts?: { highlight?: string; color?: string; bold?: string }): ReactNode {
    if (!text) return text;
    const highlight = (opts?.highlight || '').trim();
    const color = opts?.color || '#f6a40a';
    const boldText = (opts?.bold || '').trim();

    // 1) Partir por **...** en segmentos { text, bold }.
    let runs: { text: string; bold: boolean }[] = [];
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

    // 1b) Aplicar el campo "palabras en negrilla" sobre la primera aparición en los tramos
    // que aún no están en negrita.
    if (boldText) {
        let boldDone = false;
        runs = runs.flatMap(run => {
            if (boldDone || run.bold) return [run];
            const idx = run.text.toLowerCase().indexOf(boldText.toLowerCase());
            if (idx === -1) return [run];
            boldDone = true;
            const parts: { text: string; bold: boolean }[] = [];
            if (idx > 0) parts.push({ text: run.text.slice(0, idx), bold: false });
            parts.push({ text: run.text.slice(idx, idx + boldText.length), bold: true });
            const rest = run.text.slice(idx + boldText.length);
            if (rest) parts.push({ text: rest, bold: false });
            return parts;
        });
    }

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
