// ════════════════════════════════════════════════════════════════════
// AI Agent Command Center — cliente de la API (/api/agent-center)
// Toda respuesta pasa por `leerJson`: un HTML de error (un 502 de Vercel) no
// revienta la pantalla con «Unexpected token <».
// ════════════════════════════════════════════════════════════════════
import { leerJson } from '../../../lib/leerJson';

export const API = import.meta.env.VITE_API_URL || '/api';

export async function acApi<T = any>(path: string, opts: { method?: string; body?: unknown } = {}): Promise<T> {
    const token = localStorage.getItem('rotary_token');
    const res = await fetch(`${API}/agent-center${path}`, {
        method: opts.method || 'GET',
        headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
        ...(opts.body !== undefined ? { body: JSON.stringify(opts.body) } : {}),
    });
    const { data, esJson } = await leerJson<any>(res);
    if (!res.ok) {
        const msg = esJson && data?.error ? data.error : `El servidor respondió ${res.status}.`;
        throw new Error(msg);
    }
    return data as T;
}

export interface Team { key: string; label: string; short: string; help: string }
export interface SiteTypeMeta { type: string; label: string; organizationType: string; hint: string; defaultEnabled: boolean }
export interface Meta {
    teams: Team[];
    templateStates: Record<string, string>;
    origins: Record<string, string>;
    levels: Record<string, string>;
    installationStates: Record<string, { label: string; help: string }>;
    auditActions: Record<string, string>;
    siteTypes: SiteTypeMeta[];
    agency: { owner: string; repo: string; ref: string; license: string };
}

export interface TemplateDraft {
    name?: string; role?: string; description?: string; systemPrompt?: string; greeting?: string;
    capabilities?: string[]; skills?: string[]; toolRequests?: { tool: string; mode: string }[];
    modelPolicy?: { preferred: string | null; allowFallback?: boolean };
    approvalPolicy?: { autoApproveN2?: boolean };
    needsAdaptation?: boolean;
}

export interface Template {
    id: string; key: string; team: string; level: string; origin: string; status: string;
    sourceRef: Record<string, any>; draft: TemplateDraft; currentVersionId: string | null;
    allowedSiteTypes: string[]; ownerSiteId: string | null; legacyAgentId: string | null;
    avatarSeed: string | null; avatarColor: string | null; currentVersion: number | null;
    installationCount?: number; enabledCount?: number; updatedAt?: string;
    versions?: { id: string; version: number; changelog: string | null; createdAt: string; snapshot: TemplateDraft }[];
    installations?: Installation[];
    readiness?: { ready: boolean; missing: string[] };
}

export interface Installation {
    id: string; templateId: string; versionId: string | null; scopeType: 'platform' | 'site'; siteId: string | null;
    enabled: boolean; disabledReason: string | null; overrides: Record<string, any>; modelPolicy: Record<string, any>;
    budget: Record<string, any>; responsibleUserId: string | null; templateKey: string; team: string;
    templateName: string; templateStatus: string; avatarSeed: string | null; avatarColor: string | null;
    siteName: string | null; siteType: string | null; siteSubdomain: string | null; versionNumber: number | null;
    state: string; stateReason: string;
}

export interface SiteTypePolicy extends SiteTypeMeta {
    siteType: string; enabled: boolean; allowedTeams: string[]; notes: string; saved: boolean;
    sites: number; installations: number; updatedAt: string | null;
}

export interface Site { id: string; name: string; type: string; subdomain: string | null; domain: string | null; status: string }
export interface AuditEntry { id: string; actorId: string | null; actorRole: string | null; entityType: string; entityId: string | null; action: string; siteId: string | null; before: any; after: any; createdAt: string }
