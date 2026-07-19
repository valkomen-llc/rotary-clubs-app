// Tipos del dataset de Informes Ejecutivos (Club Platform Insights).
// Reflejan el contrato emitido por server/services/reportMetricsService.js.

export type MetricStatus = 'good' | 'warn' | 'bad' | 'neutral';
export type ModuleStatus = 'active' | 'configured' | 'pending' | 'disabled';

export interface Kpi {
    key?: string;
    label: string;
    value: number | string;
    display?: string;
    unit?: string;
    icon?: string;
    status?: MetricStatus;
    delta?: number;
}

export interface EcosystemModule {
    key: string;
    label: string;
    icon: string;
    status: ModuleStatus;
    statusLabel: string;
    metric: string;
}

export interface ChartBlock {
    type: 'bar' | 'hbar' | 'line' | 'area' | 'pie' | 'donut';
    title: string;
    data: Array<Record<string, any>>;
    dataKeys?: Array<{ key: string; label: string; color: string }>;
    valueFormat?: 'number' | 'currency' | 'percent';
    currency?: string;
    height?: number;
}

export interface ReportSection {
    id: string;
    title: string;
    icon: string;
    accent: string;
    kpis?: Kpi[];
    charts?: ChartBlock[];
    note?: string;
    available?: boolean;
}

export interface MaturityDimension { key: string; label: string; score: number; weight: number; }

export interface Maturity {
    score: number;
    level: string;
    levelIndex: number;
    dimensions: MaturityDimension[];
}

export interface TimelineItem { date: string; title: string; description: string; icon: string; tone: string; }
export interface Achievement { key: string; label: string; description: string; icon: string; earned: boolean; tier: string; }

export interface Narrative {
    executiveSummary: string;
    highlights: string[];
    conclusion: string;
    recommendations: Array<{ title: string; detail: string; area: string; priority: string }>;
    generatedBy?: string;
}

export interface ReportDataset {
    version: number;
    meta: {
        platform: { name: string; tagline: string };
        site: {
            id: string; name: string; category: string; categoryLabel: string;
            type?: string; organizationType?: string; city?: string; country?: string;
            domain?: string; subdomain?: string; logo?: string; avatarUrl?: string;
            colors?: { primary?: string; secondary?: string };
            districtName?: string | null; createdAt?: string;
        };
        period: { key: string; label: string; start: string; end: string; compareLabel?: string | null };
        generatedAt: string;
    };
    maturity: Maturity;
    headlineKpis: Kpi[];
    ecosystem: { digitalizationPct: number; activeCount: number; configuredCount: number; totalCount: number; modules: EcosystemModule[] };
    engineering: { items: Array<{ label: string; value: string; icon: string; source: string }> };
    sections: ReportSection[];
    comparatives: Array<{ title: string; series: Array<{ key: string; label: string; color: string }>; data: Array<Record<string, any>> }>;
    timeline: TimelineItem[];
    achievements: Achievement[];
    currency: string;
    narrative?: Narrative;
}

export interface SiteOption {
    id: string; name: string; category: string; categoryLabel: string; type?: string;
    city?: string; country?: string; domain?: string; subdomain?: string; logo?: string;
    avatarUrl?: string; status?: string; subscriptionStatus?: string; districtId?: string; createdAt?: string;
}

export interface ReportSummary {
    id: string; title: string; siteIds: string[]; primarySiteId?: string; scope: string;
    periodKey: string; periodLabel?: string; status: string; maturityScore?: number; maturityLevel?: string;
    shared: boolean; shareToken?: string; pdfUrl?: string; createdByEmail?: string; emailedTo?: string[];
    lastEmailedAt?: string; createdAt: string;
}
