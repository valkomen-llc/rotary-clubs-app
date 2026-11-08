// ════════════════════════════════════════════════════════════════════
// Videos de proyectos (video PROPIO del club) — tipos compartidos (v4.1298.0)
// Lo que comparten la tarjeta y la vista de «Mi proyecto» con la pestaña
// «Videos propios» del administrador.
// ════════════════════════════════════════════════════════════════════
export type PvStatus = 'none' | 'draft' | 'received' | 'in_review' | 'changes_requested' | 'approved' | 'rejected' | 'withdrawn';

export interface PvVersion {
    id: string; number: number; fileName: string; format: string; formatLabel: string; contentType: string; sizeBytes: number; sizeLabel: string;
    width: number | null; height: number | null; durationSec: number | null; durationLabel: string | null; warnings: string[];
    processingStatus: string; uploadedBy: string | null; uploadedByRole: string | null; current: boolean; retiredAt: string | null; createdAt: string;
}
export interface PvVideo {
    id: string; submissionId: string; status: PvStatus; statusLabel: string; statusTone: string;
    title: string; description: string; language: string; productionYear: number | null; notes: string;
    currentVersion: PvVersion | null; consentAccepted: boolean; consentVersion: string | null; consentAt: string | null;
    reviewNote: string | null; adminNotes: string | null;
    submittedAt: string | null; reviewedAt: string | null; approvedAt: string | null; lastEditedAt: string | null; createdAt: string; updatedAt: string;
}
export interface PvEvent { id: string; type: string; title: string | null; detail: string | null; metadata: any; actorName: string | null; actorRole: string | null; visibility: 'all' | 'internal'; createdAt: string }
export interface PvPortalVideo extends PvVideo {
    versions: PvVersion[]; events: PvEvent[];
    canEdit: boolean; canReplace: boolean; canSubmit: boolean; canWithdraw: boolean;
    validation: { ok: boolean; errors: { field: string; message: string }[] };
}
export interface PvConfig {
    allowedFormats: string[]; maxSizeMb: number; recommendedMinSec: number; recommendedMaxSec: number; maxDurationSec: number; recommendedResolution: string;
    maxActiveVideos: number; deadline: string; recommendations: string[]; replacementPolicy: string; requireConsent: boolean; consentText: string;
    reviewFlow: string; publicVisibility: boolean; enabled: boolean;
    consentVersion?: string; deadlinePassed?: boolean; accept?: string; formats?: string[];
}
export interface PvPortalView {
    available: boolean; reason: string | null; status: PvStatus; statusLabel: string; statusTone: string;
    identity: { projectName: string; clubName: string; district: string; publicRef: string; responsible: string };
    config: PvConfig; catalog: { statuses: { key: PvStatus; label: string; tone: string }[]; languages: { key: string; label: string }[] };
    videos: PvPortalVideo[]; main: PvPortalVideo | null; canCreate: boolean;
    card: { headline: string | null; actions: { key: 'open' | 'edit' | 'replace'; label: string }[] };
}
