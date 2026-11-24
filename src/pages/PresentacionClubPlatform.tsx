/**
 * /presentacion — Presentación comercial interactiva de Club Platform for
 * Rotary (v4.1356.0). Pública, sin sesión. Detalle y reglas en
 * `docs/claude/presentacion-comercial.md`.
 *
 * El `<head>` que leen WhatsApp y las redes lo pone el SERVIDOR
 * (`server/lib/presentationHead.js`); `useSEO` sólo lo mantiene al navegar.
 */
import { PRESENTATION, PRESENTATION_PATH } from '../config/clubPlatformPresentation';
import { useSEO } from '../hooks/useSEO';
import { useDeck } from '../components/presentation/useDeck';
import { DeckBar, DeckNav } from '../components/presentation/DeckChrome';
import { CoverSlide, EcosystemSlide, InfrastructureSlide, PlansSlide, ResourcesSlide } from '../components/presentation/Slides';
import '../components/presentation/presentation.css';

/** El orden de los slides. Su longitud tiene que ser la de la configuración. */
const SLIDE_COMPONENTS = [CoverSlide, InfrastructureSlide, ResourcesSlide, EcosystemSlide, PlansSlide];

export default function PresentacionClubPlatform() {
    const { rootRef, viewportRef, index, stage, scale, present, idle, go, next, prev, togglePresent, onTouchStart, onTouchEnd } = useDeck(SLIDE_COMPONENTS.length);
    useSEO({ title: PRESENTATION.meta.title, description: PRESENTATION.meta.description, path: PRESENTATION_PATH, image: PRESENTATION.meta.shareImage || PRESENTATION.brand.logo });

    const cls = ['cpd-root', stage ? 'cpd--stage' : 'cpd--flow', stage && present ? 'cpd--present' : '', idle ? 'cpd--idle' : ''].filter(Boolean).join(' ');

    return (
        <div ref={rootRef} className={cls} style={{ ['--cpd-scale' as string]: scale }} aria-roledescription="presentación" aria-label={PRESENTATION.meta.title}>
            <DeckBar index={index} present={present} go={go} togglePresent={togglePresent} />
            <main ref={viewportRef} className="cpd-viewport" onTouchStart={onTouchStart} onTouchEnd={onTouchEnd}>
                <div className="cpd-stage">
                    {SLIDE_COMPONENTS.map((Slide, i) => <Slide key={i} index={i} active={i === index} stage={stage} />)}
                </div>
            </main>
            <DeckNav index={index} present={present} prev={prev} next={next} go={go} togglePresent={togglePresent} />
        </div>
    );
}
