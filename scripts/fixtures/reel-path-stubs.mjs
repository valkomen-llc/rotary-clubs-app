// Los dobles del modelo de lenguaje y del motor de Reels para
// `test:submissions:reel:path`. Registran lo que se les pidió, para que la
// prueba pueda comprobar QUÉ se le mandó al motor —no sólo que se le mandó—.
export const llamadas = { copy: [], reels: [] };
export const reset = () => { llamadas.copy.length = 0; llamadas.reels.length = 0; };

// ⚠️ LAS LÍNEAS NO LLEVAN CIFRAS, y el motivo importa: la primera versión de
// este doble devolvía «Escena 1», «Escena 2»… y el validador de veracidad las
// rechazaba —con razón, porque esos números no los suministró nadie— y
// disparaba el reintento. La prueba culpaba al módulo de llamar dos veces al
// modelo, y el módulo estaba bien: el fixture codificaba el defecto (v4.1001).
//
// `inventarCifra` sirve para ejercitar el bucle a propósito. Y el doble OBEDECE
// la instrucción de corrección: si no lo hiciera, no se podría distinguir «el
// bucle reintenta» de «el bucle reintenta y sirve para algo».
const PALABRAS = ['Una calle del barrio', 'La gente se acerca', 'Las manos se cruzan', 'Alguien recibe lo suyo', 'El club se despide'];
export const opciones = { inventarCifra: false };

export const generateCopy = async (o) => {
    llamadas.copy.push(o);
    const m = String(o.userText || '').match(/cada una de las (\d+) escenas/);
    const n = Number(m?.[1] || 3);
    const corrigiendo = /rompió estas reglas/.test(String(o.userText || ''));
    const cifra = opciones.inventarCifra && !corrigiendo;
    return {
        content: JSON.stringify({
            hook: cifra ? 'Ayudamos a 5000 familias' : 'El club salió a la calle',
            scenes: Array.from({ length: n }, (_, i) => ({ beat: 'b', line: PALABRAS[i % PALABRAS.length], motion: 'la gente se mueve' })),
            closing: 'Así se sirve', cta: 'Sumate', summary: 'Un resumen',
        }),
    };
};

// El doble del MOTOR. Que sea un doble es lo que permite comprobar que se le
// pide UN solo Reel y con qué: si el módulo creara el proyecto por su cuenta,
// esta lista quedaría vacía y la prueba fallaría.
export const startReelProject = async (input, user) => {
    llamadas.reels.push({ input, user });
    return { ok: true, status: 201, project: { id: 'proj-1', status: 'generating', statusDetail: null, creditsEstimated: 100 } };
};
export const createReel = async () => {};

// Las tres vías de RECUPERACIÓN (v4.1028). Registran lo que se les pidió: el
// engine tiene que mandar el proyecto correcto y, en «continuar», sólo las
// escenas pedidas — nunca las que ya tienen clip.
export const resumeReelProject = async (projectId, o = {}) => {
    llamadas.reels.push({ resume: projectId, sceneIds: o.sceneIds || null, strategy: o.strategy || null });
    return { ok: true, project: { id: projectId, status: 'generating', statusDetail: null }, resumed: (o.sceneIds || []).length || 1, preserved: 3, outcomes: [] };
};
export const fallbackReelScene = async (projectId, sceneId, o = {}) => {
    llamadas.reels.push({ fallback: projectId, sceneId });
    return { ok: true, project: { id: projectId, status: 'generating', statusDetail: null }, scene: { id: sceneId, status: 'rendering' } };
};
export const regenerateReelScene = async (projectId, sceneId, body = {}, o = {}) => {
    llamadas.reels.push({ regenerate: projectId, sceneId, strategy: body?.strategy || null });
    return { ok: true, project: { id: projectId, status: 'generating', statusDetail: null }, scene: { id: sceneId, status: 'pending' } };
};
export default { generateCopy, startReelProject, createReel, resumeReelProject, fallbackReelScene, regenerateReelScene };
