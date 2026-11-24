/**
 * Presentación comercial — las cuatro herramientas de recaudo (v4.1356.0)
 *
 * Cada tarjeta lleva una mini-interfaz ESQUEMÁTICA (sin cifras: una barra de
 * avance no promete un recaudo) o, si la configuración trae la captura real,
 * la captura. Una herramienta `concept` se rotula como representación
 * conceptual: no se simula operativa.
 */
import { Repeat, ShoppingBag } from 'lucide-react';
import type { Availability } from '../../config/clubPlatformPresentation';
import { enter } from './motion';

const Line = ({ w, strong }: { w: string; strong?: boolean }) => <span className={`cpd-ui-line${strong ? ' cpd-ui-line--strong' : ''}`} style={{ width: w }} />;
const Bar = ({ pct }: { pct: number }) => <span className="cpd-ui-bar"><i style={{ width: `${pct}%` }} /></span>;

const CrowdfundingUi = () => (
    <div className="cpd-ui-card">
        <div className="cpd-ui-row">
            <span className="cpd-ui-thumb" style={{ width: 54, height: 46 }} />
            <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 6 }}><span className="cpd-ui-label">Proyecto social</span><Line w="80%" /></div>
        </div>
        <Bar pct={68} />
        <div className="cpd-ui-row" style={{ justifyContent: 'space-between' }}><span className="cpd-ui-muted">Meta de financiación</span><span className="cpd-ui-btn">Aportar</span></div>
    </div>
);

const FundraisingUi = () => (
    <>
        <div className="cpd-ui-card"><span className="cpd-ui-label">Campaña de recaudación</span><Bar pct={82} /></div>
        <div className="cpd-ui-card"><span className="cpd-ui-label">Apoyo a subvención</span><Bar pct={41} /></div>
        <div className="cpd-ui-row"><span className="cpd-ui-pill is-on">COP</span><span className="cpd-ui-pill">USD</span><span className="cpd-ui-btn" style={{ marginLeft: 'auto' }}>Contribuir</span></div>
    </>
);

const MembershipsUi = () => (
    <div className="cpd-ui-card">
        <div className="cpd-ui-row"><Repeat aria-hidden style={{ width: 15, height: 15, color: 'var(--cpd-blue)' }} /><span className="cpd-ui-label">Cuota de socio</span></div>
        <div className="cpd-ui-row" style={{ flexWrap: 'wrap', gap: 5 }}>
            <span className="cpd-ui-pill">Mensual</span><span className="cpd-ui-pill is-on">Trimestral</span><span className="cpd-ui-pill">Anual</span>
        </div>
        <Line w="62%" />
        <span className="cpd-ui-btn">Pagar cuota</span>
    </div>
);

const ShopUi = () => (
    <>
        <div className="cpd-ui-products">
            {[0, 1, 2].map(i => <div key={i} className="cpd-ui-card"><span className="cpd-ui-thumb" /><Line w="85%" strong /><Line w="50%" /></div>)}
        </div>
        <div className="cpd-ui-row"><span className="cpd-ui-muted">Artículos · Entradas</span><span className="cpd-ui-btn cpd-ui-btn--soft" style={{ marginLeft: 'auto', display: 'inline-flex', gap: 5, alignItems: 'center' }}><ShoppingBag aria-hidden style={{ width: 11, height: 11 }} />Carrito</span></div>
    </>
);

const UI: Record<string, () => React.ReactElement> = { crowdfunding: CrowdfundingUi, fundraising: FundraisingUi, memberships: MembershipsUi, shop: ShopUi };

export interface Tool { id: string; number: string; title: string; text: string; availability: Availability }

export const ToolTile = ({ tool, order, shot, flag }: { tool: Tool; order: number; shot: string | null; flag: string }) => {
    const Ui = UI[tool.id];
    return (
        <article className="cpd-tool cpd-in" style={enter(3 + order)}>
            <div className="cpd-tool__ui" aria-hidden>{shot ? <img className="cpd-shot" src={shot} alt="" style={{ borderRadius: 6 }} /> : Ui ? <Ui /> : null}</div>
            <div>
                <span className="cpd-tool__n">{tool.number}</span>
                <h3>{tool.title}</h3>
                <p>{tool.text}</p>
                {flag ? <span className="cpd-tool__flag">{flag}</span> : null}
            </div>
        </article>
    );
};
