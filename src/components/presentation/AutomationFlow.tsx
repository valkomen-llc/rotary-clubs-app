/**
 * Presentación comercial — el flujo de contenidos con IA (v4.1356.0)
 *
 * Actividad → Rotary en Acción → Agentes de IA → Estudio de contenido →
 * Revisión → canales → Distrito. Va en HTML y rejilla (no en un SVG de
 * coordenadas fijas) para que en móvil el mismo marcado baje a una columna.
 * El punto dorado que recorre cada conexión es la única animación; se apaga
 * con «reducir movimiento».
 */
import { Bot, Facebook, Globe, Instagram, Network, Share2 } from 'lucide-react';
import type { CSSProperties } from 'react';
import { PRESENTATION } from '../../config/clubPlatformPresentation';

type Flow = (typeof PRESENTATION.slides)[3]['flow'];
interface Step { step: string; title: string; text: string }

const CHANNEL_ICONS = [Globe, Facebook, Instagram, Share2];

const Node = ({ s, hub }: { s: Step; hub?: boolean }) => (
    <div className={`cpd-node${hub ? ' cpd-node--hub' : ''}`}>
        {hub ? <Bot aria-hidden /> : null}
        <span className="cpd-node__step">{s.step}</span>
        <h3>{s.title}</h3>
        <p>{s.text}</p>
    </div>
);

const Link = ({ i }: { i: number }) => <span className="cpd-link" style={{ '--i': i } as CSSProperties} aria-hidden />;

export const AutomationFlow = ({ flow }: { flow: Flow }) => (
    <div className="cpd-flow bg-rotary-geo" role="group" aria-label="Flujo de creación, automatización y distribución de contenidos">
        <p className="cpd-flow__tag" style={{ margin: 0 }}><b>{PRESENTATION.brand.name}</b><span>De la actividad de servicio a todos los canales</span></p>
        <span className="cpd-flow__gap cpd-flow__gap--a" aria-hidden />
        <Node s={flow.source} />
        <Link i={0} />
        <Node s={flow.intake} />
        <Link i={1} />
        <Node s={flow.engine} hub />
        <Link i={2} />
        <Node s={flow.studio} />
        <Link i={3} />
        <Node s={flow.review} />
        <Link i={4} />
        <div className="cpd-channels">
            <span className="cpd-channels__step">{flow.channelsStep} · DISTRIBUCIÓN</span>
            {flow.channels.map((c, i) => {
                const Icon = CHANNEL_ICONS[i] || Share2;
                return <span key={c} className="cpd-channel"><Icon aria-hidden />{c}</span>;
            })}
        </div>
        <span className="cpd-flow__gap cpd-flow__gap--b" aria-hidden />
        <div className="cpd-district">
            <Network aria-hidden />
            <div><span className="cpd-district__step">{flow.district.step}</span> <b>{flow.district.title}</b><br /><span>{flow.district.text}</span></div>
        </div>
    </div>
);
