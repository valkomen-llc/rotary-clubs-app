
export interface ClubConfig {
    id: string;
    name: string;
    domain: string;
    logoText: string;
    colors: {
        primary: string;
        secondary: string;
    };
    social: {
        facebook?: string;
        instagram?: string;
        twitter?: string;
        youtube?: string;
    };
    contact: {
        email: string;
        phone: string;
        address: string;
    };
}

export const CLUBS: Record<string, ClubConfig> = {
    'rotary-origen': {
        id: 'origen',
        name: 'Rotary Club Origen',
        domain: 'localhost', // Para desarrollo
        logoText: 'Origen',
        colors: {
            primary: '#013388', // Rotary Blue
            secondary: '#E29C00', // Rotary Gold
        },
        social: {
            facebook: 'https://facebook.com/rotaryorigen',
            instagram: 'https://instagram.com/rotaryorigen',
        },
        contact: {
            email: 'contacto@rotaryorigen.org',
            phone: '+57 123 4567',
            address: 'Bogotá, Colombia',
        }
    },
    'rotary-retiro': {
        id: 'retiro',
        name: 'Rotary Club El Retiro',
        domain: 'elretiro.rotary.org',
        logoText: 'El Retiro',
        colors: {
            primary: '#013388',
            secondary: '#E29C00',
        },
        social: {
            instagram: 'https://instagram.com/rotaryretiro',
        },
        contact: {
            email: 'hola@rotaryretiro.org',
            phone: '+57 987 6543',
            address: 'El Retiro, Antioquia',
        }
    },
    'rotary-norte': {
        id: 'norte',
        name: 'Rotary Club Bogotá Norte',
        domain: 'bogotanorte.rotary.org',
        logoText: 'Bogotá Norte',
        colors: {
            primary: '#013388',
            secondary: '#E29C00',
        },
        social: {
            facebook: 'https://facebook.com/rotarybogotanorte',
        },
        contact: {
            email: 'secretaria@rotarybogotanorte.org',
            phone: '+57 555 1234',
            address: 'Bogotá Norte, Colombia',
        }
    }
};

export const getClubByHostname = (hostname: string): ClubConfig => {
    // Permitir override vía URL para pruebas (ej: ?club=retiro)
    const urlParams = new URLSearchParams(window.location.search);
    const clubId = urlParams.get('club');

    if (clubId && CLUBS[`rotary-${clubId}`]) {
        return CLUBS[`rotary-${clubId}`];
    }

    // En desarrollo, devolvemos el primero o basamos en una variable de entorno
    if (hostname === 'localhost' || hostname === '127.0.0.1') {
        return CLUBS['rotary-origen'];
    }

    const club = Object.values(CLUBS).find(c => c.domain === hostname);
    return club || CLUBS['rotary-origen']; // Default to Origen
};
