/**
 * Presentación comercial — planes, ruta de implementación y cierre (v4.1356.0)
 *
 * Los botones usan las pieles de CTA del proyecto (`ctaStyles`): sólido el
 * principal, suave el de al lado. Un botón sin `href` no se pinta.
 */
import { Link } from 'react-router-dom';
import { ArrowRight, CalendarCheck, Check, LifeBuoy, Sparkles } from 'lucide-react';
import { CTA_SOFT, CTA_SOLID, ctaSkin } from '../../lib/ctaStyles';
import { PRESENTATION } from '../../config/clubPlatformPresentation';
import { enter } from './motion';
import { actionMessage, whatsappLink } from './whatsapp';

type PlansSlide = (typeof PRESENTATION.slides)[4];
type Plan = PlansSlide['plans'][number];

export const PlanCard = ({ plan, monthlyLabel, order }: { plan: Plan; monthlyLabel: string; order: number }) => (
    <article className={`cpd-plan cpd-in${plan.featured ? ' cpd-plan--featured' : ''}`} style={enter(3 + order)} aria-label={`${plan.name}: ${plan.price} ${plan.currency} al ${plan.period}`}>
        <div className="cpd-plan__top">
            <div>
                <span className="cpd-plan__label">{plan.label}</span>
                <h3 className="cpd-plan__name">{plan.name}</h3>
                {'badge' in plan && plan.badge ? <span className="cpd-plan__badge" style={{ marginTop: 8 }}><Sparkles aria-hidden />{plan.badge}</span> : null}
            </div>
            <div className="cpd-plan__price">
                <strong>{plan.price}</strong>
                <span>{plan.currency} / {plan.period}</span>
                <small>{monthlyLabel}: {plan.monthly}</small>
            </div>
        </div>
        <p className="cpd-plan__sum">{plan.summary}</p>
        <span className="cpd-plan__inc">{plan.includesLabel}</span>
        <ul className="cpd-plan__list">
            {plan.features.map(f => <li key={f}><Check aria-hidden /><span>{f}</span></li>)}
        </ul>
    </article>
);

export const ImplementationRoute = ({ route }: { route: PlansSlide['route'] }) => (
    <div>
        <ol className="cpd-route" aria-label="Ruta de implementación">
            {route.steps.map((s, i) => <li key={s}><i>{String(i + 1).padStart(2, '0')}</i><span>{s}</span></li>)}
        </ol>
        <p className="cpd-route__support"><LifeBuoy aria-hidden /><span>{route.support}</span></p>
    </div>
);

interface Action { label: string; href: string | null; message: string }

const ActionLink = ({ action, solid }: { action: Action; solid?: boolean }) => {
    const { contact, audience } = PRESENTATION;
    const href = whatsappLink(contact.whatsapp, actionMessage(action.message, audience?.name)) || action.href;
    if (!href) return null;
    const cls = `cpd-btn ${ctaSkin(solid ? CTA_SOLID : CTA_SOFT)}`;
    const Icon = solid ? ArrowRight : CalendarCheck;
    const inner = <>{solid ? null : <Icon aria-hidden />}<span>{action.label}</span>{solid ? <Icon aria-hidden /> : null}</>;
    return /^https?:\/\//.test(href)
        ? <a className={cls} href={href} target="_blank" rel="noopener noreferrer">{inner}</a>
        : <Link className={cls} to={href}>{inner}</Link>;
};

export const ClosingCta = ({ cta }: { cta: PlansSlide['cta'] }) => {
    const { contact, actions } = PRESENTATION;
    const lines = [contact.whatsapp ? `WhatsApp ${contact.whatsapp}` : null, contact.email, contact.web].filter(Boolean).join(' · ');
    return (
        <div className="cpd-cta">
            <h3>{cta.title}</h3>
            <p>{cta.text}</p>
            <div className="cpd-cta__btns">
                <ActionLink action={actions.primary} solid />
                <ActionLink action={actions.secondary} />
            </div>
            {lines ? <span className="cpd-contact">{lines}</span> : null}
        </div>
    );
};
