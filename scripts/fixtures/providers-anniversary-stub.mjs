// ════════════════════════════════════════════════════════════════════
// Aniversarios IA — los proveedores, sustituidos
// v4.896.0
//
// KIE, el redactor/visión, el control de preservación y S3. `sharp` NO se
// sustituye: las mediciones de blanco y de franja se ejercitan de VERDAD sobre
// imágenes reales, que es la mitad que más importa comprobar.
// ════════════════════════════════════════════════════════════════════

export let estado = {
    tareas: [],            // cada createTask que se pidió
    resultado: 'success',  // qué contesta el sondeo
    imagen: null,          // el buffer que devuelve KIE
    copyRespuestas: [],    // se consumen en orden
    analisis: null,
    preservation: { state: 'ok', use: true },
    subidas: [],
    fallarCreateTask: null,
};

export const reset = (patch = {}) => {
    estado = {
        tareas: [], resultado: 'success', imagen: null, copyRespuestas: [],
        analisis: null, preservation: { state: 'ok', use: true }, subidas: [],
        fallarCreateTask: null, ...patch,
    };
};

// ── kieService ─────────────────────────────────────────────────────────
export const createKieImageTask = async (opts) => {
    if (estado.fallarCreateTask) throw new Error(estado.fallarCreateTask);
    estado.tareas.push(opts);
    return `task-${estado.tareas.length}`;
};
export const getKieImageTask = async (taskId) => (
    estado.resultado === 'success'
        ? { state: 'success', imageUrl: `https://kie.example/${taskId}.png` }
        : { state: 'failed', failMsg: 'el modelo no pudo componer' }
);
export const fetchKieImageBuffer = async () => estado.imagen;
// El resto del servicio no se usa acá, pero el módulo tiene que exportarlo o
// una importación nombrada fallaría.
export const triggerVideoGeneration = async () => ({});
export const checkTaskStatus = async () => ({});
export const pollKieImageTask = async () => '';
export const createKieVideoTask = async () => '';

// ── copywritingService ─────────────────────────────────────────────────
export const generateCopy = async ({ imageUrl }) => {
    // Con imagen es el ANÁLISIS; sin ella, la redacción.
    if (imageUrl) return { text: JSON.stringify(estado.analisis ?? { people: 6, group: true, subjectSide: 'derecha', freeSide: 'izquierda', scene: 'un grupo en un salón' }) };
    const siguiente = estado.copyRespuestas.shift();
    if (siguiente === undefined) {
        return { text: JSON.stringify({ title: 'Celebramos juntos', message: 'Cuatro décadas de servicio y amistad junto a nuestra comunidad. Gracias por tanto.' }) };
    }
    if (siguiente instanceof Error) throw siguiente;
    return { text: typeof siguiente === 'string' ? siguiente : JSON.stringify(siguiente) };
};
export const COPY_PROVIDERS = {};
export const DEFAULT_COPY_PROVIDER = 'gemini';
export const isProviderAvailable = () => true;

// ── designGuard ────────────────────────────────────────────────────────
export const checkPreservation = async () => estado.preservation;
export const PRESERVATION = {};
export const EDGE_CROP = { ALLOW: 'allow', STRICT: 'strict' };
export const decidePreservation = () => ({});
export const readPeopleVerdict = () => ({});
export const PEOPLE_SYSTEM = '';
export const PEOPLE_USER = '';

// ── @aws-sdk/client-s3 ─────────────────────────────────────────────────
export class S3Client { async send(cmd) { estado.subidas.push(cmd.input); return {}; } }
export class PutObjectCommand { constructor(input) { this.input = input; } }
