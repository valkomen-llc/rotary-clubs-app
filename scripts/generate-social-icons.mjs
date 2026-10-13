import fs from 'node:fs';
import path from 'node:path';
import sharp from 'sharp';

const outputDir = path.resolve('public/icons/social');
fs.mkdirSync(outputDir, { recursive: true });

const networks = {
  instagram: {
    name: 'Instagram',
    colorBg: `<defs>
      <linearGradient id="ig-grad" x1="0%" y1="100%" x2="100%" y2="0%">
        <stop offset="0%" stop-color="#fdf497"/>
        <stop offset="25%" stop-color="#fd5949"/>
        <stop offset="60%" stop-color="#d6249f"/>
        <stop offset="100%" stop-color="#285AEB"/>
      </linearGradient>
    </defs>
    <circle cx="32" cy="32" r="28" fill="url(#ig-grad)"/>`,
    glyphColor: '#ffffff',
    glyphElements: (color) => `
      <rect x="18" y="18" width="28" height="28" rx="8" fill="none" stroke="${color}" stroke-width="3.6"/>
      <circle cx="32" cy="32" r="6.8" fill="none" stroke="${color}" stroke-width="3.6"/>
      <circle cx="39.8" cy="24.2" r="2" fill="${color}"/>
    `
  },
  facebook: {
    name: 'Facebook',
    colorBg: `<circle cx="32" cy="32" r="28" fill="#1877F2"/>`,
    glyphColor: '#ffffff',
    glyphElements: (color) => `
      <path d="M35 24h4.5v-6.5h-5.8c-6.2 0-8.2 4-8.2 8.8V31h-4.5v7h4.5v15h7.5V38h5.2l.8-7h-6v-3.5c0-1.8.8-2.5 2-2.5z" fill="${color}"/>
    `
  },
  youtube: {
    name: 'YouTube',
    colorBg: `<circle cx="32" cy="32" r="28" fill="#FF0000"/>`,
    glyphColor: '#ffffff',
    glyphElements: (color) => `
      <polygon points="27,22 42,32 27,42" fill="${color}"/>
    `
  },
  linkedin: {
    name: 'LinkedIn',
    colorBg: `<circle cx="32" cy="32" r="28" fill="#0A66C2"/>`,
    glyphColor: '#ffffff',
    glyphElements: (color) => `
      <circle cx="22" cy="22" r="2.8" fill="${color}"/>
      <rect x="19.2" y="27.5" width="5.6" height="15.5" rx="1" fill="${color}"/>
      <path d="M28.5 27.5h5.4v2.4h.1c.8-1.5 2.7-3 5.5-3 5.9 0 7 3.9 7 8.9V43h-5.6v-8.2c0-2-.1-4.4-2.7-4.4-2.7 0-3.1 2.1-3.1 4.3V43h-5.6V27.5z" fill="${color}"/>
    `
  },
  tiktok: {
    name: 'TikTok',
    colorBg: `<circle cx="32" cy="32" r="28" fill="#000000"/>`,
    glyphColor: '#ffffff',
    glyphElements: (color) => `
      <path d="M37.5 17c1.3 2.5 3.5 4.3 6.5 4.8v5.2c-2.4-.1-4.7-.9-6.5-2.2v12.2c0 6.6-5.4 12-12 12s-12-5.4-12-12 5.4-12 12-12c1.1 0 2.2.2 3.2.5v5.8c-.9-.5-2-.8-3.2-.8-3.6 0-6.5 2.9-6.5 6.5s2.9 6.5 6.5 6.5 6.5-2.9 6.5-6.5V17h5.5z" fill="${color}"/>
    `
  },
  x: {
    name: 'X',
    colorBg: `<circle cx="32" cy="32" r="28" fill="#000000"/>`,
    glyphColor: '#ffffff',
    glyphElements: (color) => `
      <path d="M20 18h4.5l6.7 9 7.8-9H44l-10 11.5 11.5 15.5h-4.5l-7.4-9.9-8.4 9.9H20l10.5-12.3L20 18zm6.5 3.2l13 17.5h2.3L28.8 21.2h-2.3z" fill="${color}"/>
    `
  },
  whatsapp: {
    name: 'WhatsApp',
    colorBg: `<circle cx="32" cy="32" r="28" fill="#25D366"/>`,
    glyphColor: '#ffffff',
    glyphElements: (color) => `
      <path d="M32 16c-8.8 0-16 7.2-16 16 0 2.8.7 5.5 2.1 7.9L16 48l8.4-2.2c2.3 1.3 5 2.2 7.6 2.2 8.8 0 16-7.2 16-16s-7.2-16-16-16zm0 29.3c-2.4 0-4.8-.7-6.8-1.9l-.5-.3-5 1.3 1.3-4.9-.3-.5c-1.3-2.1-2-4.5-2-7 0-7.3 6-13.3 13.3-13.3 7.3 0 13.3 6 13.3 13.3 0 7.4-6 13.4-13.3 13.4zm7.3-10c-.4-.2-2.4-1.2-2.7-1.3-.4-.1-.7-.2-.9.2s-1 1.3-1.2 1.5-.4.3-.8.1c-.4-.2-1.7-.6-3.2-2-1.2-1-2-2.3-2.2-2.7-.2-.4 0-.6.2-.8.2-.2.4-.4.6-.7.2-.2.3-.4.4-.6.1-.2.1-.4 0-.6-.1-.2-.9-2.2-1.2-3-.3-.8-.7-.7-.9-.7h-.8c-.3 0-.8.1-1.2.5-.4.4-1.6 1.6-1.6 3.8s1.6 4.4 1.8 4.7c.3.3 3.2 4.9 7.7 6.9 1.1.5 1.9.7 2.6.9 1.1.4 2.1.3 2.9.2.9-.1 2.8-1.1 3.2-2.2.4-1.1.4-2 .3-2.2-.1-.2-.4-.3-.8-.5z" fill="${color}"/>
    `
  },
  web: {
    name: 'Sitio Web',
    colorBg: `<circle cx="32" cy="32" r="28" fill="#0284C7"/>`,
    glyphColor: '#ffffff',
    glyphElements: (color) => `
      <circle cx="32" cy="32" r="14" fill="none" stroke="${color}" stroke-width="3"/>
      <ellipse cx="32" cy="32" rx="6.5" ry="14" fill="none" stroke="${color}" stroke-width="2.5"/>
      <line x1="18.5" y1="32" x2="45.5" y2="32" stroke="${color}" stroke-width="2.5"/>
      <line x1="21.5" y1="24" x2="42.5" y2="24" stroke="${color}" stroke-width="2"/>
      <line x1="21.5" y1="40" x2="42.5" y2="40" stroke="${color}" stroke-width="2"/>
    `
  }
};

async function generateAll() {
  console.log('Generating official social icons in public/icons/social/...');
  for (const [key, net] of Object.entries(networks)) {
    // 1. Color: Circular badge with brand background
    const svgColor = `<svg xmlns="http://www.w3.org/2000/svg" width="64" height="64" viewBox="0 0 64 64">
      ${net.colorBg}
      ${net.glyphElements(net.glyphColor)}
    </svg>`;
    await sharp(Buffer.from(svgColor)).png({ quality: 100 }).toFile(path.join(outputDir, `${key}-color.png`));

    // 2. White: Monocromático blanco con máscara para calado transparente universal
    const svgWhite = `<svg xmlns="http://www.w3.org/2000/svg" width="64" height="64" viewBox="0 0 64 64">
      <defs>
        <mask id="cutout-white-${key}">
          <rect width="64" height="64" fill="#ffffff"/>
          ${net.glyphElements('#000000')}
        </mask>
      </defs>
      <circle cx="32" cy="32" r="28" fill="#ffffff" mask="url(#cutout-white-${key})"/>
    </svg>`;
    await sharp(Buffer.from(svgWhite)).png({ quality: 100 }).toFile(path.join(outputDir, `${key}-white.png`));

    // 3. Black: Monocromático negro con máscara para calado transparente universal
    const svgBlack = `<svg xmlns="http://www.w3.org/2000/svg" width="64" height="64" viewBox="0 0 64 64">
      <defs>
        <mask id="cutout-black-${key}">
          <rect width="64" height="64" fill="#ffffff"/>
          ${net.glyphElements('#000000')}
        </mask>
      </defs>
      <circle cx="32" cy="32" r="28" fill="#0f172a" mask="url(#cutout-black-${key})"/>
    </svg>`;
    await sharp(Buffer.from(svgBlack)).png({ quality: 100 }).toFile(path.join(outputDir, `${key}-black.png`));

    console.log(`✓ Generated ${key} (color, white, black)`);
  }
  console.log('All 24 icons successfully regenerated with transparent masks in public/icons/social/');
}

generateAll().catch(console.error);
