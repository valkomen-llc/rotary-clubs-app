/**
 * Presentación comercial — los cinco slides (v4.1356.0)
 *
 * Cada uno tiene una composición distinta sobre una identidad común:
 *   01 portada partida 45/55 con dispositivos · 02 arquitectura + repositorio ·
 *   03 cuadrícula de cuatro interfaces · 04 diagrama de automatización ·
 *   05 planes comparables, ruta y cierre.
 * El texto llega de `config/clubPlatformPresentation.ts`; acá no se escribe copy.
 */
import { CreditCard, Globe2, LineChart } from 'lucide-react';
import { PRESENTATION } from '../../config/clubPlatformPresentation';
import { BrandLogo, Closing, DeckIcon, SlideFrame, SlideHeader } from './SlideLayout';
import { enter } from './motion';
import { ConnectivityGraphic, LaptopMockup, PhoneMockup } from './DeviceMockups';
import { CloudExplorer, Mailboxes } from './InfrastructureVisual';
import { ToolTile } from './ResourceTools';
import { AutomationFlow } from './AutomationFlow';
import { ClosingCta, ImplementationRoute, PlanCard } from './PlanCards';

const [S1, S2, S3, S4, S5] = PRESENTATION.slides;
const { media, sampleDomain, brand, audience } = PRESENTATION;
const screens = media.screens;
const anySchematic = (...shots: (string | null)[]) => shots.some(s => !s);

export interface SlideProps { index: number; active: boolean; stage: boolean }

export const CoverSlide = (p: SlideProps) => (
    <SlideFrame {...p} id={S1.id} label={S1.nav} noMark>
        <div className="cpd-cover">
            <div className="cpd-cover__text">
                <div className="cpd-cover__brands cpd-in">
                    <BrandLogo height={brand.mark.coverHeight} />
                    {audience ? (
                        <div className="cpd-cover__for">
                            <span>{audience.label}</span>
                            <img className="cpd-logo" src={audience.logo} alt={audience.name} style={{ ['--cpd-logo-h' as string]: `${audience.height}px` }} />
                        </div>
                    ) : null}
                </div>
                <SlideHeader eyebrow={S1.eyebrow} title={S1.title} description={S1.description} size="xl" level={1} />
                <ul className="cpd-pillars">
                    {S1.pillars.map((x, i) => (
                        <li key={x.label} className="cpd-pillar cpd-in" style={enter(3 + i)}><span className="cpd-chip"><DeckIcon name={x.icon} /></span>{x.label}</li>
                    ))}
                </ul>
                <Closing light delay={7}>{S1.closing}</Closing>
            </div>
            <div className="cpd-cover__visual cpd-in" style={enter(3)}>
                <div className="cpd-cover__panel bg-rotary-geo" aria-hidden />
                <ConnectivityGraphic />
                <LaptopMockup className="cpd-cover__laptop" src={screens.siteDesktop} alt="Sitio institucional construido con Club Platform, en un portátil" />
                <PhoneMockup className="cpd-cover__phone" src={screens.siteMobile} alt="El mismo sitio en un teléfono móvil" />
            </div>
        </div>
    </SlideFrame>
);

export const InfrastructureSlide = (p: SlideProps) => (
    <SlideFrame {...p} id={S2.id} label={S2.nav}>
        <SlideHeader eyebrow={S2.eyebrow} title={S2.title} description={S2.description} />
        <div className="cpd-infra">
            <ul className="cpd-infra__list">
                {S2.components.map((c, i) => (
                    <li key={c.title} className="cpd-feature cpd-in" style={enter(3 + i)}>
                        <span className="cpd-chip"><DeckIcon name={c.icon} /></span>
                        <h3>{c.title}</h3>
                        <p>{c.text}</p>
                    </li>
                ))}
            </ul>
            <div className="cpd-infra__visual cpd-in" style={enter(4)}>
                <CloudExplorer {...S2.cloud} src={screens.cloud} />
                <Mailboxes accounts={S2.mailboxes} domain={sampleDomain} />
            </div>
        </div>
        <div className="cpd-rowfoot">
            <Closing delay={9}>{S2.closing}</Closing>
            <p className="cpd-note" style={{ margin: 0 }}>{S2.footnote}{anySchematic(screens.cloud) ? ` ${media.schematicNote}` : ''}</p>
        </div>
    </SlideFrame>
);

const FACT_ICONS = [Globe2, null, CreditCard, LineChart];

export const ResourcesSlide = (p: SlideProps) => (
    <SlideFrame {...p} id={S3.id} label={S3.nav}>
        <SlideHeader eyebrow={S3.eyebrow} title={S3.title} description={S3.description} size="sm" />
        <div className="cpd-tools-grid">
            {S3.tools.map((t, i) => (
                <ToolTile key={t.id} tool={t} order={i} shot={screens[t.id as keyof typeof screens] ?? null} flag={S3.availabilityLabels[t.availability]} />
            ))}
        </div>
        <ul className="cpd-facts cpd-in" style={{ ...enter(8), listStyle: 'none', padding: 0, marginBottom: 0 }}>
            {S3.complements.map((c, i) => {
                const Icon = FACT_ICONS[i];
                return i === 1
                    ? <li key={c} className="cpd-cur" aria-label={c}>{S3.currencies.map(x => <span key={x}>{x}</span>)}</li>
                    : <li key={c} className="cpd-fact">{Icon ? <Icon aria-hidden /> : null}{c}</li>;
            })}
        </ul>
        <div className="cpd-rowfoot">
            <Closing delay={9}>{S3.closing}</Closing>
            <p className="cpd-note" style={{ margin: 0 }}>{S3.footnote}{anySchematic(screens.crowdfunding, screens.fundraising, screens.memberships, screens.shop) ? ` ${media.schematicNote}` : ''}</p>
        </div>
    </SlideFrame>
);

export const EcosystemSlide = (p: SlideProps) => (
    <SlideFrame {...p} id={S4.id} label={S4.nav}>
        <SlideHeader eyebrow={S4.eyebrow} title={S4.title} description={S4.description} />
        <div className="cpd-eco">
            <div className="cpd-in" style={enter(3)}><AutomationFlow flow={S4.flow} /></div>
            <ul className="cpd-caps">
                {S4.capabilities.map((c, i) => (
                    <li key={c.title} className="cpd-cap cpd-in" style={enter(4 + i)}><h3>{c.title}</h3><p>{c.text}</p></li>
                ))}
            </ul>
        </div>
        <div className="cpd-rowfoot">
            <Closing delay={9}>{S4.closing}</Closing>
            <p className="cpd-note" style={{ margin: 0 }}>{S4.footnote}</p>
        </div>
    </SlideFrame>
);

export const PlansSlide = (p: SlideProps) => (
    <SlideFrame {...p} id={S5.id} label={S5.nav}>
        <div className="cpd-plans-head">
            <SlideHeader eyebrow={S5.eyebrow} title={S5.title} size="sm" />
            <p className="cpd-lead cpd-in" style={enter(2)}>{S5.description}</p>
        </div>
        <div className="cpd-plans">
            {S5.plans.map((plan, i) => <PlanCard key={plan.id} plan={plan} monthlyLabel={S5.monthlyLabel} order={i} />)}
        </div>
        <p className="cpd-diff cpd-in" style={enter(6)}>{S5.differentiator}</p>
        <div className="cpd-close cpd-in" style={enter(7)}>
            <ImplementationRoute route={S5.route} />
            <ClosingCta cta={S5.cta} />
        </div>
    </SlideFrame>
);
