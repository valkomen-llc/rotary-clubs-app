/**
 * Presentación comercial — el repositorio institucional y los correos (v4.1356.0)
 * El almacenamiento en la nube es el protagonista del slide 2: periodos
 * rotarios a la izquierda, carpetas del periodo abierto a la derecha.
 */
import { Cloud, FileText, Folder, FolderOpen, Mail } from 'lucide-react';
import { PRESENTATION } from '../../config/clubPlatformPresentation';

interface CloudProps { title: string; shotTitle: string; periods: readonly string[]; openPeriod: number; folders: readonly string[]; recentLabel: string; recent: readonly { name: string; folder: string }[]; src: string | null }

export const CloudExplorer = ({ title, shotTitle, periods, openPeriod, folders, recentLabel, recent, src }: CloudProps) => (
    <div className="cpd-window" role="img" aria-label={src ? shotTitle : `${title}: carpetas por periodo rotario con ${folders.join(', ').toLowerCase()}`}>
        <div className="cpd-window__bar"><Cloud aria-hidden /><span>{src ? shotTitle : title}</span>{src ? null : <span className="cpd-window__path">{PRESENTATION.sampleDomain} / {periods[openPeriod]}</span>}</div>
        {src ? <div className="cpd-window__shot"><img className="cpd-shot" src={src} alt="" /></div> : (
            <div className="cpd-window__body" aria-hidden>
                <ul className="cpd-tree">
                    {periods.map((p, i) => (
                        <li key={p} className={i === openPeriod ? 'is-open' : undefined}>{i === openPeriod ? <FolderOpen /> : <Folder />}<span>{p}</span></li>
                    ))}
                </ul>
                <div className="cpd-window__main">
                    <ul className="cpd-folders">
                        {folders.map(f => <li key={f} className="cpd-folder"><Folder /><span>{f}</span></li>)}
                    </ul>
                    <div className="cpd-files">
                        <span className="cpd-files__label">{recentLabel}</span>
                        {recent.map(r => <div key={r.name} className="cpd-file"><FileText /><span>{r.name}</span><em>{r.folder}</em></div>)}
                    </div>
                </div>
            </div>
        )}
    </div>
);

export const Mailboxes = ({ accounts, domain }: { accounts: readonly string[]; domain: string }) => (
    <ul className="cpd-mails" style={{ listStyle: 'none', margin: 0, padding: 0 }} aria-label="Ejemplos de correos institucionales">
        {accounts.map(a => (
            <li key={a} className="cpd-mail"><Mail aria-hidden /><span><b>{a}</b>@{domain}</span></li>
        ))}
    </ul>
);
