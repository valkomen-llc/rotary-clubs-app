import { useSiteImages } from '../hooks/useSiteImages';

/**
 * Banda de imagen de la portada, entre las cifras y la sección «Únete».
 *
 * Es un hueco CONFIGURABLE por sitio (`homeBanner` en Distribución de
 * Imágenes), no una imagen escrita en el código. La portada la comparten todos
 * los sitios de la plataforma: una URL fija acá pondría la misma foto en cada
 * club. Es la lección de v4.737, cuando la campaña de un distrito se convirtió
 * en la portada de todos los distritos.
 *
 * Sin imagen configurada NO se pinta nada —ni el espacio—, así que los sitios
 * que no la usan se ven exactamente como antes.
 */
const HomeBannerSection = () => {
    const images = useSiteImages();
    const banner = images.homeBanner;
    const url = banner?.url?.trim();

    if (!url) return null;

    // El fondo es el MISMO azul de la barra superior del sitio, tomado del token
    // del tema (`rotary-topbar`) y no repetido como literal: son tres
    // componentes los que lo llevan y tres copias se separan en cuanto alguien
    // cambie una. Sobre blanco, estas piezas —que suelen ser azules de borde a
    // borde— quedaban como una tarjeta recortada en medio de la página.
    return (
        <section className="py-12 md:py-16 bg-rotary-topbar">
            <div className="max-w-6xl mx-auto px-6">
                {/*
                    `object-contain` y la proporción natural, NO un recorte a una
                    banda panorámica: estas piezas suelen traer el texto DENTRO
                    de la imagen —nombres, cargos, el logotipo del distrito— y
                    recortarlas se lleva justamente eso. Se muestra entera y se
                    deja que el alto lo decida la imagen.
                */}
                <img
                    src={url}
                    alt={banner?.alt || 'Imagen destacada'}
                    /* Sin sombra: sobre el fondo oscuro una sombra negra no se ve. */
                    className="w-full h-auto rounded-2xl object-contain"
                    /*
                        Va debajo del pliegue: cargarla de forma diferida evita
                        que compita con el primer pintado, que es la regla de
                        rendimiento de v4.659.
                    */
                    loading="lazy"
                    decoding="async"
                />
            </div>
        </section>
    );
};

export default HomeBannerSection;
