// ════════════════════════════════════════════════════════════════════════════
// Formulario institucional de programas — el cliente (v4.1286.0)
//
// El navegador NO decide qué se pregunta: recibe el formulario ya resuelto
// para el programa (`GET /public/intake/form/:slug`). Este archivo sólo habla
// con la API y sube archivos.
//
// El acceso a un borrador es un SECRETO que viaja en la cabecera
// `X-Intake-Token`. En este dispositivo se guarda en `localStorage` para
// continuar después; en otro dispositivo se recupera por correo.
//
// SUBIDA: directo a S3. Hasta 64 MB, un PUT; más, multiparte por partes de
// 16 MB, tres a la vez, cada parte con tres intentos y espera creciente. Si se
// corta o se recarga la página, volver a elegir el MISMO archivo reanuda la
// carga desde las partes que S3 ya tiene. Un error de carga nunca borra el
// resto del formulario: queda marcado en su archivo con «Reintentar».
// ════════════════════════════════════════════════════════════════════════════
import { leerJson } from './leerJson';

const API = import.meta.env.VITE_API_URL || '/api';
export const INTAKE_BASE = `${API}/programas/public/intake`;
const DRAFTS_KEY = 'program-intake-drafts';

export type FieldType = 'text' | 'textarea' | 'email' | 'phone' | 'url' | 'year' | 'date' | 'select' | 'checkbox' | 'multi' | 'na' | 'files' | 'club' | 'district' | 'list' | 'heading' | 'focus' | 'storylink';
export interface FieldDef {
  k: string; t: FieldType; l: string; h?: string; max?: number; rows?: number; full?: boolean; opt?: { id: string; label: string }[];
  pub?: 'publico' | 'interno' | ''; clinical?: boolean; required?: boolean; purpose?: string; fileMeta?: string[];
  showIf?: [string, unknown]; fields?: FieldDef[]; item?: string; add?: string; need?: string[]; target?: string; refKind?: string; actions?: string[]; bulk?: string;
  /** v4.1287 — Campo que ya no se pide: sólo se muestra si un borrador anterior lo trae. */
  legacy?: boolean;
}
/** v4.1287 — Un bloque interno desplegable de una sección (nunca un paso). */
export interface BlockDef { t: string; d: string; open: boolean; f: string[] }
export interface StepDef { k: string; n: number; short: string; title: string; desc: string; sections: string[] }
export interface SectionDef { k: string; icon: string; always: boolean; title: string; desc: string; target: string; landing: string | null; need: string[]; fields: FieldDef[]; blocks: BlockDef[]; collapsible?: boolean }
export interface IntakeForm { health: boolean; intro: string; sections: SectionDef[]; steps: StepDef[]; contentSections: string[] }
export interface ProgramLite { slug: string; name: string; category: string; categoryLabel: string; shortName: string; logoUrl: string }
export interface RecordRef { id: string; kind: string; title: string; detail: string; format?: string }
export interface FormPayload {
  program: ProgramLite; form: IntakeForm; records: RecordRef[];
  limits: { image: number; video: number; audio: number; document: number; design: number; filesPerIntake: number; multipartThreshold: number; partSize: number; label: string };
  purposes: Record<string, { label: string; exts: string[] }>;
  consents: { data: string; rights: string; newsletter: string };
  submissionTypes: { id: string; label: string; help: string }[];
  districts: { number: number; label: string }[];
}
export interface IntakeFile { id: string; purpose: string; filename: string; bytes: number; kind: string; status: string; format?: string }
export interface IntakeView {
  id: string; publicRef: string; status: string; statusLabel: string; submissionType: string; sections: string[]; sender: Record<string, any>;
  data: Record<string, any>; consents: { data?: boolean; rights?: boolean; newsletter?: boolean }; editable: boolean; reviewNote: string;
  adjustments: { key: string; section: string; label: string; note: string }[]; lastSavedAt: string; submittedAt: string | null; files: IntakeFile[];
}
export interface ApiErr { section?: string; field: string; message: string }

const authHeader = (): Record<string, string> => {
  try { const t = localStorage.getItem('rotary_token'); return t ? { Authorization: `Bearer ${t}` } : {}; } catch { return {}; }
};

export class IntakeError extends Error {
  status: number; errors: ApiErr[];
  constructor(message: string, status: number, errors: ApiErr[] = []) { super(message); this.status = status; this.errors = errors; }
}

export async function intakeApi<T = any>(path: string, { method = 'GET', body, token }: { method?: string; body?: unknown; token?: string } = {}): Promise<T> {
  let r: Response;
  try {
    r = await fetch(`${INTAKE_BASE}${path}`, {
      method, headers: { 'Content-Type': 'application/json', ...authHeader(), ...(token ? { 'X-Intake-Token': token } : {}) },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
  } catch {
    throw new IntakeError('Sin conexión con el servidor. Lo que escribiste sigue aquí: vuelve a intentar.', 0);
  }
  const { data } = await leerJson<any>(r);
  if (!r.ok) throw new IntakeError(data?.error || `El servidor respondió ${r.status}.`, r.status, Array.isArray(data?.errors) ? data.errors : []);
  return (data || {}) as T;
}

// ── Borradores de ESTE dispositivo ──────────────────────────────────────
/** `step`: la clave del paso en el que se dejó (v4.1287); un borrador anterior no la trae. */
export interface LocalDraft { ref: string; slug: string; programName: string; token: string; savedAt: string; step?: string }
export const localDrafts = (): LocalDraft[] => {
  try { const v = JSON.parse(localStorage.getItem(DRAFTS_KEY) || '[]'); return Array.isArray(v) ? v.filter(d => d && d.token && d.ref) : []; } catch { return []; }
};
export const rememberDraft = (d: LocalDraft) => {
  try { localStorage.setItem(DRAFTS_KEY, JSON.stringify([d, ...localDrafts().filter(x => x.ref !== d.ref)].slice(0, 10))); } catch { /* sin almacenamiento */ }
};
export const rememberStep = (ref: string, step: string) => {
  try { localStorage.setItem(DRAFTS_KEY, JSON.stringify(localDrafts().map(d => (d.ref === ref ? { ...d, step } : d)))); } catch { /* noop */ }
};
export const forgetDraft = (ref: string) => {
  try { localStorage.setItem(DRAFTS_KEY, JSON.stringify(localDrafts().filter(x => x.ref !== ref))); } catch { /* noop */ }
};

// ── Subida ──────────────────────────────────────────────────────────────
export type UploadState = { progress: number; status: 'uploading' | 'ready' | 'error'; error?: string; file?: File; preview?: string };
const sleep = (ms: number) => new Promise(r => setTimeout(r, ms));

const putWithProgress = (url: string, body: Blob, { contentType, onProgress, signal }: { contentType?: string; onProgress?: (loaded: number) => void; signal?: AbortSignal }) =>
  new Promise<string>((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open('PUT', url);
    if (contentType) { xhr.setRequestHeader('Content-Type', contentType); xhr.setRequestHeader('Cache-Control', 'no-store'); }
    xhr.upload.onprogress = (e) => { if (e.lengthComputable) onProgress?.(e.loaded); };
    xhr.onload = () => (xhr.status >= 200 && xhr.status < 300 ? resolve(xhr.getResponseHeader('ETag') || '') : reject(new Error(`La transferencia falló (${xhr.status}).`)));
    xhr.onerror = () => reject(new Error('Se cortó la conexión.'));
    xhr.ontimeout = () => reject(new Error('La carga tardó demasiado.'));
    signal?.addEventListener('abort', () => { try { xhr.abort(); } catch { /* noop */ } reject(new Error('Carga cancelada.')); });
    xhr.send(body);
  });

/**
 * Sube UN archivo del envío. Devuelve el archivo listo (validado en el
 * servidor por su contenido real). `onCreated` entrega el id apenas existe,
 * para que el formulario lo cite aunque la carga siga en curso.
 */
export async function uploadIntakeFile(token: string, file: File, purpose: string, { onCreated, onProgress, signal }: { onCreated?: (id: string) => void; onProgress?: (pct: number) => void; signal?: AbortSignal } = {}): Promise<IntakeFile> {
  const pre = await intakeApi<any>('/files/presign', { method: 'POST', token, body: { filename: file.name, size: file.size, purpose } });
  onCreated?.(pre.fileId);
  if (pre.mode === 'single') {
    let ultimo: Error | null = null;
    for (let intento = 0; intento < 3; intento++) {
      try { await putWithProgress(pre.uploadUrl, file, { contentType: pre.contentType, signal, onProgress: (l) => onProgress?.(Math.min(99, Math.round((l / file.size) * 100))) }); ultimo = null; break; }
      catch (e: any) { ultimo = e; if (signal?.aborted) throw e; await sleep(1500 * (intento + 1)); }
    }
    if (ultimo) throw ultimo;
  } else {
    const total: number = pre.parts; const size: number = pre.partSize;
    const done = new Set<number>(pre.done || []);
    const loaded: Record<number, number> = {};
    for (const n of done) loaded[n] = Math.min(size, file.size - (n - 1) * size);
    const report = () => onProgress?.(Math.min(99, Math.round((Object.values(loaded).reduce((a, b) => a + b, 0) / file.size) * 100)));
    report();
    const pendientes = Array.from({ length: total }, (_, i) => i + 1).filter(n => !done.has(n));
    const subirParte = async (n: number) => {
      for (let intento = 0; intento < 4; intento++) {
        try {
          const { urls } = await intakeApi<{ urls: { partNumber: number; url: string }[] }>('/files/parts', { method: 'POST', token, body: { fileId: pre.fileId, partNumbers: [n] } });
          const blob = file.slice((n - 1) * size, Math.min(file.size, n * size));
          await putWithProgress(urls[0].url, blob, { signal, onProgress: (l) => { loaded[n] = l; report(); } });
          loaded[n] = blob.size; report();
          return;
        } catch (e) {
          if (signal?.aborted || intento === 3) throw e;
          await sleep(2000 * 2 ** intento);
        }
      }
    };
    // Tres partes a la vez: rápido sin ahogar una conexión móvil.
    const cola = [...pendientes];
    await Promise.all([0, 1, 2].map(async () => { while (cola.length) { const n = cola.shift()!; await subirParte(n); } }));
  }
  const { file: ready } = await intakeApi<{ file: IntakeFile }>('/files/complete', { method: 'POST', token, body: { fileId: pre.fileId } });
  onProgress?.(100);
  return ready;
}

export const fmtBytes = (n: number) => (n >= 1024 ** 3 ? `${(n / 1024 ** 3).toFixed(1)} GB` : n >= 1024 ** 2 ? `${(n / 1024 ** 2).toFixed(1)} MB` : `${Math.max(1, Math.round(n / 1024))} KB`);
export const newRowId = () => `r${Math.random().toString(36).slice(2, 10)}${Date.now().toString(36).slice(-4)}`;
export const isEmptyValue = (v: unknown) => v === undefined || v === null || v === '' || (Array.isArray(v) && !v.length) || (typeof v === 'object' && !Array.isArray(v) && v !== null && 'status' in (v as any) && (v as any).status === 'texto' && !(v as any).text);
export const showIfOk = (f: FieldDef, row: Record<string, any>) => {
  if (!f.showIf) return true;
  const [k, want] = f.showIf;
  return Array.isArray(want) ? want.includes(row[k]) : row[k] === want;
};
