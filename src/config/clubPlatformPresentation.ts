/**
 * Presentación comercial de Club Platform for Rotary — EL CONTENIDO (v4.1356.0)
 *
 * Todo lo que se LEE en `/presentacion` vive acá: textos, precios, planes,
 * llamados a la acción, enlaces, contacto, capturas y disponibilidad de cada
 * funcionalidad. Los componentes de `src/components/presentation/` sólo pintan.
 *
 * Reglas (detalle en `docs/claude/presentacion-comercial.md`):
 *   · Son EXACTAMENTE seis slides. Lo fija `scripts/test-presentation.mjs`.
 *   · Los precios vigentes son los de este archivo y prevalecen sobre cualquier
 *     documento comercial anterior.
 *   · Una interfaz dibujada NO es una captura. Mientras `media.screens.*` esté
 *     en `null`, la presentación pinta una representación esquemática y lo dice.
 *     Para usar una captura real basta poner su URL pública.
 *   · Un enlace que no existe no se inventa: `href: null` deja el botón sin
 *     pintar.
 *   · El título y la descripción para compartir se repiten en
 *     `server/lib/presentationHead.js` (los rastreadores no ejecutan
 *     JavaScript). La prueba compara los dos.
 */

export const PRESENTATION_PATH = '/presentacion';

/** `available`: en producción · `setup`: existe y depende de configuración o de un proveedor externo · `concept`: todavía no operativo. */
export type Availability = 'available' | 'setup' | 'concept';

export const PRESENTATION = {
    meta: {
        title: 'Club Platform for Rotary — Un activo digital para tu club',
        description: 'Un ecosistema digital para conectar, comunicar, movilizar recursos y multiplicar el impacto rotario. Conoce los planes Club Digital y Club Inteligente.',
        concept: 'Un activo digital. Infinitas oportunidades de servicio.',
        /** Imagen para compartir (1200 × 630). `null` → se usa el logotipo. */
        shareImage: null as string | null,
    },

    brand: {
        name: 'Club Platform for Rotary',
        /** El logotipo oficial, servido por la propia aplicación (`public/presentacion/`). */
        logo: '/presentacion/club-platform-for-rotary.png',
        district: 'Distrito 4281',
        /**
         * La marca de Club Platform en la presentación. Va por defecto en
         * TODOS los slides, en la misma esquina, y más grande en la portada.
         * `corner`: 'bottom-left' | 'bottom-right'. Alturas en px del lienzo
         * de 1600 × 900; el ancho sale solo (el logotipo nunca se deforma).
         */
        mark: { corner: 'bottom-left' as 'bottom-left' | 'bottom-right', height: 40, coverHeight: 76 },
    },

    /**
     * A quién va dirigida ESTA versión de la presentación. Su logotipo sale en
     * la portada, junto al de Club Platform. Para otro club: cambiar nombre y
     * logotipo. Con `null` la portada lleva sólo la marca de Club Platform.
     */
    audience: {
        label: 'Presentación para',
        name: 'Club Rotario Cali Pance',
        logo: '/presentacion/rotary-cali-pance.png',
        /** Altura en px del lienzo. El logotipo de Rotary no se deforma ni se recolorea. */
        height: 92,
    } as { label: string; name: string; logo: string; height: number } | null,

    /** Información de contacto. `null` → no se pinta. Nada de esto se inventa. */
    contact: {
        email: null as string | null,
        whatsapp: null as string | null,
        web: 'clubplatform.org',
    },

    /**
     * Capturas REALES del producto. Con `null` se pinta la representación
     * esquemática. Subir cada captura a la Biblioteca y pegar acá su URL.
     */
    media: {
        screens: {
            // Portada de un sitio en producción. Guardar los archivos en
            // `public/presentacion/` y escribir acá su ruta (`/presentacion/…`),
            // o pegar una URL pública. Se recortan desde arriba, sin deformar.
            siteDesktop: '/presentacion/sitio-escritorio.jpg' as string | null,   // captura real, 1702 × 983
            siteTablet: '/presentacion/sitio-tableta.jpg' as string | null,    // captura real, 1100 × 1100
            siteMobile: '/presentacion/sitio-movil.jpg' as string | null,    // captura real, 780 × 1353
            // Ventana grande del slide 2. Hoy es una captura del panel de control
            // (Estudio de Contenido); con `null` vuelve el repositorio por periodos.
            cloud: '/presentacion/panel-estudio-de-contenido.jpg' as string | null,
            crowdfunding: null as string | null,
            fundraising: null as string | null,
            memberships: null as string | null,
            shop: null as string | null,
        },
        schematicNote: 'Interfaces representadas de forma esquemática.',
    },

    /** Dominio de ejemplo de los mockups. No es un sitio real. */
    sampleDomain: 'rotarynombreclub.org',

    slides: [
        {
            id: 'activo-digital',
            nav: 'Activo digital',
            eyebrow: 'Club Platform for Rotary',
            title: 'Tu club merece mucho más que una página web.',
            description: 'Un ecosistema digital para conectar, comunicar, movilizar recursos y multiplicar el impacto rotario.',
            closing: 'Un activo digital que crece con tu club y trasciende cada periodo rotario.',
            pillars: [
                { icon: 'globe', label: 'Presencia institucional global' },
                { icon: 'coins', label: 'Generación de recursos' },
                { icon: 'sparkles', label: 'Comunicación inteligente' },
                { icon: 'landmark', label: 'Continuidad institucional' },
            ],
        },
        {
            id: 'patrimonio-digital',
            nav: 'Patrimonio digital',
            eyebrow: 'Identidad y patrimonio digital',
            title: 'Una infraestructura propia. Un legado permanente.',
            description: 'Toda la arquitectura tecnológica que tu club necesita, integrada en un solo ecosistema.',
            closing: 'La junta directiva cambia. El patrimonio digital permanece.',
            components: [
                { icon: 'monitor', title: 'Sitio web institucional', text: 'Interactivo, adaptable a móviles y optimizado para buscadores.' },
                { icon: 'globe', title: 'Dominio personalizado', text: 'Identidad digital del club con un dominio .org.' },
                { icon: 'shield', title: 'Alojamiento y seguridad', text: 'Infraestructura, certificados, mantenimiento y actualizaciones.' },
                { icon: 'mail', title: 'Correos institucionales ilimitados', text: 'Cuentas asociadas a los cargos y responsabilidades del club.' },
                { icon: 'cloud', title: 'Almacenamiento ilimitado en la nube', text: 'Repositorio para organizar y consultar documentos desde cualquier lugar.' },
                { icon: 'landmark', title: 'Continuidad institucional', text: 'El patrimonio documental se conserva entre periodos rotarios.' },
            ],
            cloud: {
                title: 'Repositorio institucional',
                /** Rótulo de la ventana cuando muestra una captura real (dice lo que la captura ES). */
                shotTitle: 'Panel de control del club · Estudio de Contenido',
                periods: ['Periodo rotario 2024–2025', 'Periodo rotario 2025–2026', 'Periodo rotario 2026–2027', 'Periodo rotario 2027–2028'],
                /** Índice del periodo que se muestra abierto. */
                openPeriod: 2,
                folders: ['Actas', 'Informes', 'Documentos administrativos', 'Proyectos', 'Subvenciones', 'Fotografías', 'Material multimedia'],
                /** Filas de ejemplo de la lista de documentos (nombre y carpeta). */
                recentLabel: 'Documentos recientes',
                recent: [
                    { name: 'Acta de junta directiva.pdf', folder: 'Actas' },
                    { name: 'Informe de tesorería.xlsx', folder: 'Informes' },
                    { name: 'Solicitud de subvención.docx', folder: 'Subvenciones' },
                ],
            },
            mailboxes: ['presidencia', 'secretaria', 'tesoreria'],
            /** Aclaración comercial discreta (sección 9 del encargo). */
            footnote: 'Almacenamiento y correos ilimitados según las condiciones vigentes del servicio.',
        },
        {
            id: 'generacion-de-recursos',
            nav: 'Generación de recursos',
            eyebrow: 'Sostenibilidad y generación de recursos',
            title: 'Convierte tu presencia digital en nuevas oportunidades de financiación.',
            description: 'Herramientas para movilizar recursos, fortalecer la sostenibilidad y ampliar el alcance de tus proyectos.',
            closing: 'Más oportunidades para financiar proyectos. Más recursos para servir.',
            tools: [
                { id: 'crowdfunding', number: '01', title: 'Crowdfunding', text: 'Proyectos sociales con metas de financiación y aportes colectivos.', availability: 'setup' as Availability },
                { id: 'fundraising', number: '02', title: 'Fundraising', text: 'Campañas de recaudación para obras, causas, actividades y subvenciones.', availability: 'setup' as Availability },
                { id: 'memberships', number: '03', title: 'Membresías online', text: 'Pago digital de las cuotas de los socios y cobros recurrentes.', availability: 'setup' as Availability },
                { id: 'shop', number: '04', title: 'Comercio electrónico', text: 'Artículos, souvenirs, entradas e inscripciones para eventos.', availability: 'setup' as Availability },
            ],
            complements: ['Aportes nacionales e internacionales', 'Transacciones en COP y USD', 'Integración con pasarelas de pago', 'Seguimiento de campañas y contribuciones'],
            currencies: ['COP', 'USD'],
            availabilityLabels: { available: '', setup: '', concept: 'Representación conceptual · próximamente' } as Record<Availability, string>,
            footnote: 'Los recaudos dependen de la pasarela de pago que configure cada club y de la gestión de sus campañas. No se garantizan resultados financieros.',
        },
        {
            id: 'ecosistema-inteligente',
            nav: 'Ecosistema inteligente',
            eyebrow: 'Marketing digital e inteligencia artificial',
            title: 'Una actividad. Múltiples canales. Mayor impacto.',
            description: 'Un ecosistema inteligente de marketing digital, comunicaciones e imagen pública, conectado con el Distrito 4281.',
            closing: 'Menos tiempo creando contenido. Más tiempo generando impacto.',
            capabilities: [
                { title: 'Rotary en Acción', text: 'Las actividades y proyectos del club se convierten en contenidos institucionales.' },
                { title: 'Estudio de contenido con IA', text: 'Noticias, artículos, textos y publicaciones digitales.' },
                { title: 'Agentes virtuales', text: 'Creación, programación y distribución automatizadas.' },
                { title: 'Marketing digital', text: 'Publicaciones, redes, campañas y posicionamiento en un solo lugar.' },
                { title: 'Integración distrital', text: 'Amplificación en los canales del Distrito, según sus criterios editoriales.' },
            ],
            flow: {
                source: { step: '01', title: 'El club sirve', text: 'Realiza una actividad de servicio.' },
                intake: { step: '02', title: 'Rotary en Acción', text: 'Registra fotografías e información.' },
                engine: { step: '03', title: 'Agentes de IA', text: 'Procesan la información en Club Platform.' },
                studio: { step: '04', title: 'Estudio de contenido', text: 'Noticias, artículos y publicaciones.' },
                review: { step: '05', title: 'Revisión', text: 'Se revisa o aprueba según la configuración.' },
                channelsStep: '06',
                channels: ['Sitio web institucional', 'Facebook', 'Instagram', 'Otros canales compatibles'],
                district: { step: '07', title: 'Ecosistema digital del Distrito 4281', text: 'Los contenidos elegibles pueden amplificarse.' },
            },
            footnote: 'La publicación en redes requiere conectar las cuentas del club. La amplificación distrital aplica a contenidos elegibles.',
        },
        {
            id: 'planes',
            nav: 'Planes',
            eyebrow: 'Implementación y acompañamiento',
            title: 'Tu transformación digital comienza aquí.',
            description: 'Dos planes. Un ecosistema tecnológico. Acompañamiento durante todo el año rotario.',
            plans: [
                {
                    id: 'club-digital',
                    label: 'Plan 01',
                    name: 'Club Digital',
                    price: '$1.000.000',
                    priceAmount: 1000000,
                    currency: 'COP',
                    period: 'año',
                    monthly: '$83.333 COP',
                    summary: 'Infraestructura tecnológica integral para fortalecer la identidad y presencia institucional del club.',
                    featured: false,
                    includesLabel: 'Incluye',
                    features: [
                        'Sitio web institucional',
                        'Dominio personalizado .org',
                        'Alojamiento web',
                        'Seguridad y mantenimiento',
                        'Almacenamiento ilimitado en la nube',
                        'Correos institucionales ilimitados',
                        'Herramientas de gestión digital',
                        'Creación de noticias y artículos de blog',
                        'Puesta en marcha de la plataforma',
                        'Capacitación permanente',
                        'Soporte técnico durante toda la vigencia',
                    ],
                },
                {
                    id: 'club-inteligente',
                    label: 'Plan 02',
                    name: 'Club Inteligente',
                    price: '$1.480.000',
                    priceAmount: 1480000,
                    currency: 'COP',
                    period: 'año',
                    monthly: '$123.333 COP',
                    summary: 'Toda la infraestructura de Club Digital, potenciada por agentes de inteligencia artificial.',
                    featured: true,
                    badge: 'Con agentes de IA',
                    includesLabel: 'Todo Club Digital, más',
                    features: [
                        'Agentes virtuales de inteligencia artificial',
                        'Creación automatizada de contenido',
                        'Publicaciones para redes sociales',
                        'Programación y distribución automatizada',
                        'Ecosistema multiagente de comunicaciones',
                        'Automatización de procesos de imagen pública',
                    ],
                },
            ],
            monthlyLabel: 'Equivalente mensual de referencia',
            differentiator: 'Ambos planes son un ecosistema tecnológico institucional. Club Inteligente suma agentes virtuales especializados en crear y distribuir contenidos.',
            route: {
                steps: ['Vinculación', 'Configuración', 'Capacitación y onboarding', 'Puesta en marcha'],
                support: 'Acompañamiento durante los doce meses de vigencia con la estrategia de Customer Success de Club Platform.',
            },
            cta: {
                title: 'Activa el ecosistema digital de tu club.',
                text: 'Agenda tu sesión de onboarding y comienza tu proceso de transformación digital.',
            },
        },
        {
            id: 'ecosistema',
            nav: 'Quiénes lo usan',
            eyebrow: 'Ecosistema Club Platform',
            title: 'Una red rotaria que ya trabaja en un mismo ecosistema.',
            description: '',
            /**
             * Mitad superior: clubes, distritos y organizaciones rotarias que usan
             * la plataforma. `ratio` = ancho ÷ alto del archivo: con él todos los
             * logotipos ocupan la misma superficie, sin deformarse ni recolorearse.
             */
            rotary: {
                label: 'Clubes, distritos y organizaciones rotarias',
                logos: [
                    { name: 'COLROTARIOS — Fundación Colombiana de Rotarios', src: '/presentacion/logos/colrotarios.png', ratio: 4.79 },
                    { name: 'Rotary Distrito 4281', src: '/presentacion/logos/distrito-4281.png', ratio: 2.68 },
                    { name: 'Feria de Proyectos, Distritos 4271 y 4281', src: '/presentacion/logos/feria-de-proyectos.png', ratio: 4.95 },
                    { name: 'Club Rotario Armenia International', src: '/presentacion/logos/armenia-international.png', ratio: 3.83 },
                    { name: 'Club Rotario Bogotá Chicó', src: '/presentacion/logos/bogota-chico.png', ratio: 2.59 },
                    { name: 'Club Rotario Bogotá Occidente', src: '/presentacion/logos/bogota-occidente.png', ratio: 3.12 },
                    { name: 'Club Rotario Bogotá Usaquén', src: '/presentacion/logos/bogota-usaquen.png', ratio: 2.95 },
                    { name: 'Club Rotario Buenaventura Pacífico', src: '/presentacion/logos/buenaventura-pacifico.png', ratio: 3.85 },
                    { name: 'Rotary E-Club Origen', src: '/presentacion/logos/e-club-origen.png', ratio: 2.65 },
                    { name: 'Club Rotario Nuevo Cali', src: '/presentacion/logos/nuevo-cali.png', ratio: 2.45 },
                    { name: 'Club Rotario Pereira', src: '/presentacion/logos/pereira.png', ratio: 2.38 },
                    { name: 'Club Rotario Santa Rosa de Cabal', src: '/presentacion/logos/santa-rosa-de-cabal.png', ratio: 5.92 },
                ] as { name: string; src: string; ratio: number }[],
            },
            /**
             * Mitad inferior: aliados tecnológicos y proveedores de la
             * infraestructura. Las insignias «Partner» (AWS, Google Cloud, Meta)
             * sólo las puede usar quien está inscrito en ese programa: confirmar
             * la vigencia antes de publicar, o cambiarlas por el logotipo simple.
             */
            allies: {
                label: 'Aliados tecnológicos y proveedores de infraestructura',
                pending: 'Logotipos por incorporar',
                logos: [
                    { name: 'Valkomen', src: '/presentacion/logos/valkomen.png', ratio: 9.76 },
                    { name: 'AWS Partner Network', src: '/presentacion/logos/aws-partner-network.png', ratio: 3.63 },
                    { name: 'Google Cloud Partner', src: '/presentacion/logos/google-cloud-partner.png', ratio: 4.12 },
                    { name: 'Meta Business Partner', src: '/presentacion/logos/meta-business-partner.png', ratio: 2.52 },
                    { name: 'Vercel', src: '/presentacion/logos/vercel.png', ratio: 5.0 },
                    { name: 'Supabase', src: '/presentacion/logos/supabase.png', ratio: 5.19 },
                    { name: 'Resend', src: '/presentacion/logos/resend.png', ratio: 4.71 },
                    { name: 'OpenAI', src: '/presentacion/logos/openai.png', ratio: 3.64 },
                    { name: 'Anthropic', src: '/presentacion/logos/anthropic.png', ratio: 8.83 },
                ] as { name: string; src: string; ratio: number }[],
            },
        },
    ],

    /**
     * Los dos botones del cierre. Apuntan a rutas que YA existen en la
     * aplicación; `href: null` deja el botón sin pintar. Cambiarlos acá.
     */
    actions: {
        primary: { label: 'Solicitar implementación', href: '/activar-mi-club' as string | null },
        secondary: { label: 'Agendar una demostración', href: '/agendar-capacitacion' as string | null },
    },

    ui: {
        prev: 'Anterior',
        next: 'Siguiente',
        restart: 'Volver al inicio',
        fullscreen: 'Pantalla completa',
        exitFullscreen: 'Salir de pantalla completa',
        print: 'Imprimir o guardar como PDF',
        goTo: 'Ir al slide',
        progress: 'Progreso de la presentación',
    },
} as const;

export type Presentation = typeof PRESENTATION;
export type PresentationSlide = Presentation['slides'][number];
export const SLIDE_COUNT = PRESENTATION.slides.length;
