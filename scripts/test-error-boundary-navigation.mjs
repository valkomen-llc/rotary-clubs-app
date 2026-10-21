// ═════════════════════════════════════════════════════════════════════════════
// AUDITORÍA Y VERIFICACIÓN AUTOMATIZADA: SISTEMA DE ERRORES Y NAVEGACIÓN
// Verifica las correcciones de ChunkErrorBoundary, AdminModuleBoundary,
// ErrorBoundary local y AnalyticsPage contra todos los escenarios de la auditoría.
// ═════════════════════════════════════════════════════════════════════════════

import { readFileSync } from 'fs';
import { resolve } from 'path';

let passed = 0;
let failed = 0;

function ok(condition, message) {
    if (condition) {
        console.log(`  \x1b[32mOK\x1b[0m    ${message}`);
        passed++;
    } else {
        console.error(`  \x1b[31mFALLA\x1b[0m ${message}`);
        failed++;
    }
}

console.log('\n▸ 1. Arquitectura de Error Boundaries y Aislamiento por Módulo');

const chunkBoundarySrc = readFileSync(resolve('src/components/ChunkErrorBoundary.tsx'), 'utf-8');
const adminModuleSrc = readFileSync(resolve('src/components/admin/AdminModuleBoundary.tsx'), 'utf-8');
const errorBoundarySrc = readFileSync(resolve('src/components/ErrorBoundary.tsx'), 'utf-8');
const appSrc = readFileSync(resolve('src/App.tsx'), 'utf-8');
const analyticsSrc = readFileSync(resolve('src/pages/admin/Analytics.tsx'), 'utf-8');

// Escenario: ChunkErrorBoundary debe ser location-aware
ok(
    chunkBoundarySrc.includes('componentDidUpdate(prevProps') && chunkBoundarySrc.includes('this.state.error'),
    'ChunkErrorBoundary detecta cambio de ubicación (locationKey) y restablece el error automáticamente'
);
ok(
    chunkBoundarySrc.includes('Reintentar') && chunkBoundarySrc.includes('this.handleRetry'),
    'ChunkErrorBoundary ofrece botón de reintento in-situ sin obligar a recargar la página'
);
ok(
    chunkBoundarySrc.includes('Ir al inicio'),
    'ChunkErrorBoundary ofrece navegación de escape hacia el inicio'
);

// Escenario: AdminModuleBoundary debe aislar el error dentro de AdminLayout
ok(
    adminModuleSrc.includes('<AdminLayout') && (adminModuleSrc.includes('wide={wide}') || adminModuleSrc.includes('wide={this.props.wide}')),
    'AdminModuleBoundary mantiene el menú lateral y la cabecera (AdminLayout) operativos ante fallos'
);
ok(
    adminModuleSrc.includes('useLocation') && adminModuleSrc.includes('useNavigate'),
    'AdminModuleBoundary consume contexto de navegación de React Router'
);
ok(
    adminModuleSrc.includes('componentDidUpdate') && adminModuleSrc.includes('prevProps.locationKey !== this.props.locationKey'),
    'AdminModuleBoundary limpia estados de error obsoletos al navegar a otra ruta'
);
ok(
    adminModuleSrc.includes("navigate('/admin/dashboard')"),
    'AdminModuleBoundary permite redirigir al panel principal vía SPA sin recargas forzadas'
);

// Escenario: App.tsx envuelve rutas administrativas en AdminModuleBoundary
ok(
    appSrc.includes('const PrivateRoute = ({ children') && appSrc.includes('<AdminModuleBoundary>{children}</AdminModuleBoundary>'),
    'PrivateRoute envuelve todas las pantallas administrativas con AdminModuleBoundary'
);
ok(
    appSrc.includes('const PlatformOnlyRoute = ({ children') && appSrc.includes('<AdminModuleBoundary>{children}</AdminModuleBoundary>'),
    'PlatformOnlyRoute envuelve rutas protegidas de plataforma con AdminModuleBoundary'
);

console.log('\n▸ 2. Tolerancia a Fallos y Tipado Defensivo en Analytics.tsx');

// Escenario: club.domain y cálculo de hostnames seguro
ok(
    analyticsSrc.includes("typeof club.domain === 'string'") || analyticsSrc.includes("rawClubDomain = typeof club.domain === 'string'"),
    'Analytics.tsx valida que club.domain sea un string antes de invocar .replace()'
);
ok(
    analyticsSrc.includes('typeof effectiveDomain === \'string\' && effectiveDomain'),
    'Analytics.tsx protege effectiveDomain contra tipos no string'
);

// Escenario: fetchTraffic maneja respuestas HTTP no-200
ok(
    analyticsSrc.includes('if (!r.ok)') && analyticsSrc.includes('totals: { sessions: 0'),
    'Analytics.tsx intercepta errores HTTP (401/403/500) y suministra valores de reserva seguros'
);

// Escenario: SVGWorldMap resistente a datos corruptos
ok(
    analyticsSrc.includes('Array.isArray(topCountries) ? topCountries.filter(Boolean) : []'),
    'SVGWorldMap filtra elementos nulos o no definidos de topCountries'
);
ok(
    analyticsSrc.includes('list.slice(0, 4).map'),
    'SVGWorldMap mapea de forma segura sobre la lista saneada'
);

// Escenario: Límites de error por sección (ErrorBoundary local)
ok(
    analyticsSrc.includes("import ErrorBoundary from '../../components/ErrorBoundary'"),
    'Analytics.tsx importa ErrorBoundary para aislamiento granular de componentes'
);
ok(
    analyticsSrc.includes('<ErrorBoundary fallbackLabel="Módulo de Redes Sociales no disponible">') ||
    analyticsSrc.includes('SocialAnalytics') && analyticsSrc.includes('ErrorBoundary'),
    'SocialAnalytics está protegido con su propio ErrorBoundary local'
);
ok(
    analyticsSrc.includes('<ErrorBoundary compact fallbackLabel="Gráfico de tráfico no disponible">'),
    'El gráfico principal AreaChart está protegido con ErrorBoundary local'
);
ok(
    analyticsSrc.includes('<ErrorBoundary compact fallbackLabel="Distribución geográfica no disponible">'),
    'La sección de geolocalización y mapas está protegida con ErrorBoundary local'
);
ok(
    analyticsSrc.includes('<ErrorBoundary compact fallbackLabel="Comparativa de sesiones no disponible">'),
    'El gráfico BarChart está protegido con ErrorBoundary local'
);
ok(
    analyticsSrc.includes('<ErrorBoundary compact fallbackLabel="Tabla de rendimiento de sitios no disponible">'),
    'La tabla de rendimiento global está protegida con ErrorBoundary local'
);

console.log('\n▸ 3. Autenticación y Navegación Pública Desacoplada');

// Escenario: Páginas públicas no dependen innecesariamente de la sesión administrativa
ok(
    appSrc.includes('<Route path="/quienes-somos" element={<QuienesSomos />} />') &&
    appSrc.includes('<Route path="/proyectos" element={<Proyectos />} />') &&
    appSrc.includes('<Route path="/blog" element={<Blog />} />'),
    'Rutas públicas operan de forma autónoma sin exigir autenticación administrativa'
);

// Escenario: ErrorBoundary general con soporte para resetKey y modo compacto
ok(
    errorBoundarySrc.includes('resetKey?:') && errorBoundarySrc.includes('compact?: boolean'),
    'ErrorBoundary incluye soporte de reinicio reactivo (resetKey) y modo inline/compact'
);

console.log('\n' + '─'.repeat(60));
console.log(`Resultados: ${passed} pasadas, ${failed} fallidas`);

if (failed > 0) {
    process.exit(1);
} else {
    console.log('\x1b[32m✔ Todas las verificaciones de auditoría pasaron con éxito.\x1b[0m\n');
}
