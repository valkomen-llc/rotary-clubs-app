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
            {/*
                La banda ocupa TODO el ancho de la pantalla menos 20 px a cada
                lado (`px-5`), no el contenedor centrado del resto de la
                portada. Es a propósito: la imagen es la sección entera, no un
                bloque de contenido dentro de ella.
            */}
            <div className="px-5">
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
                    /*
                        SIN sombra, sin halo y sin filtro: `shadow-none` está
                        escrito a propósito y no de más. La imagen se apoya en
                        un fondo del mismo tono, así que cualquier resplandor se
                        lee como un marco pegado alrededor de la pieza — es lo
                        que se pidió quitar. Al tocar estas clases, no
                        reintroducir `shadow-*`, `ring-*` ni `drop-shadow-*`.
                    */
                    className="w-full h-auto rounded-2xl object-contain shadow-none"
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
