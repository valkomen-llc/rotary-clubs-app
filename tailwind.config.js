/** @type {import('tailwindcss').Config} */
module.exports = {
  darkMode: ["class"],
  content: ['./index.html', './src/**/*.{js,ts,jsx,tsx}'],
  theme: {
    extend: {
      colors: {
        border: "hsl(var(--border))",
        input: "hsl(var(--input))",
        ring: "hsl(var(--ring))",
        background: "hsl(var(--background))",
        foreground: "hsl(var(--foreground))",
        primary: {
          DEFAULT: "hsl(var(--primary))",
          foreground: "hsl(var(--primary-foreground))",
        },
        secondary: {
          DEFAULT: "hsl(var(--secondary))",
          foreground: "hsl(var(--secondary-foreground))",
        },
        destructive: {
          DEFAULT: "hsl(var(--destructive) / <alpha-value>)",
          foreground: "hsl(var(--destructive-foreground) / <alpha-value>)",
        },
        muted: {
          DEFAULT: "hsl(var(--muted))",
          foreground: "hsl(var(--muted-foreground))",
        },
        accent: {
          DEFAULT: "hsl(var(--accent))",
          foreground: "hsl(var(--accent-foreground))",
        },
        popover: {
          DEFAULT: "hsl(var(--popover))",
          foreground: "hsl(var(--popover-foreground))",
        },
        card: {
          DEFAULT: "hsl(var(--card))",
          foreground: "hsl(var(--card-foreground))",
        },
        sidebar: {
          DEFAULT: "hsl(var(--sidebar-background))",
          foreground: "hsl(var(--sidebar-foreground))",
          primary: "hsl(var(--sidebar-primary))",
          "primary-foreground": "hsl(var(--sidebar-primary-foreground))",
          accent: "hsl(var(--sidebar-accent))",
          "accent-foreground": "hsl(var(--sidebar-accent-foreground))",
          border: "hsl(var(--sidebar-border))",
          ring: "hsl(var(--sidebar-ring))",
        },
        // El azul de la barra superior del sitio público (Endpolio.org / My
        // Rotary / idioma). Estaba escrito a mano como `bg-[#28354b]` en dos
        // componentes y al aparecer un tercero que tiene que llevar el MISMO
        // fondo, tres literales se separan en cuanto alguien cambie uno.
        //
        // Va acá y no en `index.css` a propósito: una clase escrita a mano en
        // `@layer utilities` —como `bg-rotary-blue`— NO genera los modificadores
        // de opacidad, así que `hover:bg-rotary-blue/90` no existe y falla en
        // silencio (v4.719). Un color del tema sí los genera.
        "rotary-topbar": "#28354b",
      },
      borderRadius: {
        xl: "calc(var(--radius) + 4px)",
        lg: "var(--radius)",
        md: "calc(var(--radius) - 2px)",
        sm: "calc(var(--radius) - 4px)",
        xs: "calc(var(--radius) - 6px)",
      },
      boxShadow: {
        xs: "0 1px 2px 0 rgb(0 0 0 / 0.05)",
      },
      keyframes: {
        "accordion-down": {
          from: { height: "0" },
          to: { height: "var(--radix-accordion-content-height)" },
        },
        "accordion-up": {
          from: { height: "var(--radix-accordion-content-height)" },
          to: { height: "0" },
        },
        "caret-blink": {
          "0%,70%,100%": { opacity: "1" },
          "20%,50%": { opacity: "0" },
        },
        // El acercamiento lento de los heroes con carrusel (v4.813). Vive en
        // el TEMA y no en un `<style>` de cada pantalla porque lo usan la
        // portada y la landing de campaña: escrito dos veces, el día que se
        // ajuste la escala una de las dos se queda atrás. Mismo criterio que
        // `rotary-topbar` (v4.745) — y en el tema, no en `@layer utilities`
        // de index.css, que es donde una clase a mano no genera lo que
        // Tailwind sí genera (v4.719).
        "hero-zoom": {
          from: { transform: "scale(1)" },
          to: { transform: "scale(1.08)" },
        },
        // La tira de la galería «Rotarios en acción» (v4.822). La lista se
        // duplica en el componente, así que desplazarse la MITAD deja la
        // segunda copia exactamente donde estaba la primera: el salto de
        // vuelta al inicio no se ve.
        "gallery-marquee": {
          from: { transform: "translateX(0)" },
          to: { transform: "translateX(-50%)" },
        },
      },
      animation: {
        "accordion-down": "accordion-down 0.2s ease-out",
        "accordion-up": "accordion-up 0.2s ease-out",
        "caret-blink": "caret-blink 1.25s ease-out infinite",
        // 5 s: lo que dura una diapositiva, así el acercamiento termina justo
        // al cambiar. `forwards` deja la imagen en su tamaño final en vez de
        // dar un salto atrás.
        "hero-zoom": "hero-zoom 5s ease-out forwards",
        // La duración real la pone el componente (`animationDuration`) en
        // proporción a cuántas piezas hay: con una fija, más piezas
        // desfilarían más rápido. Acá sólo se declara la curva y el ciclo.
        "gallery-marquee": "gallery-marquee 40s linear infinite",
      },
    },
  },
  plugins: [require("tailwindcss-animate")],
}