import React, { useState } from 'react';
import { X, Globe, ShoppingCart, Link2, ArrowRightLeft, Loader2, CheckCircle2, AlertCircle, RefreshCw } from 'lucide-react';

type Mode = 'buy' | 'connect' | 'transfer';

interface DomainManagerProps {
    clubId: string;
    currentDomain?: string | null;
    onAssigned: (domain: string) => void;
    onClose: () => void;
}

interface PriceInfo {
    currency: string;
    registration: number | null;
    renewal: number | null;
    transfer: number | null;
}

const api = (path: string) => `${import.meta.env.VITE_API_URL || '/api'}${path}`;
const authHeaders = () => ({
    'Content-Type': 'application/json',
    Authorization: `Bearer ${localStorage.getItem('rotary_token')}`,
});

const cleanDomain = (d: string) =>
    d.toLowerCase().replace(/https?:\/\//g, '').replace(/^www\./, '').split('/')[0].trim();

const MODES: { key: Mode; label: string; icon: React.ElementType; hint: string }[] = [
    { key: 'buy', label: 'Comprar', icon: ShoppingCart, hint: 'Registrar un dominio nuevo en Route53 (.org)' },
    { key: 'connect', label: 'Conectar', icon: Link2, hint: 'El club ya tiene el dominio en otro proveedor' },
    { key: 'transfer', label: 'Transferir', icon: ArrowRightLeft, hint: 'Mover un dominio existente hacia Club Platform' },
];

const DomainManager: React.FC<DomainManagerProps> = ({ clubId, currentDomain, onAssigned, onClose }) => {
    const [mode, setMode] = useState<Mode>('buy');
    const [domain, setDomain] = useState(currentDomain || '');
    const [authCode, setAuthCode] = useState('');

    const [loading, setLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);

    const [availability, setAvailability] = useState<null | { isAvailable: boolean; status: string; price?: PriceInfo }>(null);
    const [operation, setOperation] = useState<null | { operationId?: string; status?: string; mode: string; dnsInstructions?: { host: string; type: string; value: string }[] }>(null);

    const isOrg = cleanDomain(domain).endsWith('.org');

    const resetResults = () => { setAvailability(null); setOperation(null); setError(null); };

    const check = async () => {
        resetResults();
        setLoading(true);
        try {
            const res = await fetch(api(`/domains/check?domain=${encodeURIComponent(cleanDomain(domain))}`), { headers: authHeaders() });
            const data = await res.json();
            if (!res.ok) throw new Error(data.error || 'Error verificando el dominio');
            setAvailability({ isAvailable: data.isAvailable, status: data.status, price: data.price });
        } catch (e: any) {
            setError(e.message);
        } finally {
            setLoading(false);
        }
    };

    const submit = async () => {
        resetResults();
        setLoading(true);
        try {
            const endpoint = mode === 'buy' ? '/domains/register' : mode === 'connect' ? '/domains/connect' : '/domains/transfer';
            const body: Record<string, string> = { domain: cleanDomain(domain), clubId };
            if (mode === 'transfer') body.authCode = authCode;

            const res = await fetch(api(endpoint), { method: 'POST', headers: authHeaders(), body: JSON.stringify(body) });
            const data = await res.json();
            if (!res.ok) throw new Error(data.error || 'La operación falló');

            setOperation({ operationId: data.operationId, status: data.operationId ? 'SUBMITTED' : 'CONNECTED', mode: data.mode, dnsInstructions: data.dnsInstructions });
            onAssigned(cleanDomain(domain)); // refleja el dominio en el formulario del club
        } catch (e: any) {
            setError(e.message);
        } finally {
            setLoading(false);
        }
    };

    const refreshStatus = async () => {
        if (!operation?.operationId) return;
        setLoading(true);
        try {
            const res = await fetch(api(`/domains/operation/${operation.operationId}?domain=${encodeURIComponent(cleanDomain(domain))}`), { headers: authHeaders() });
            const data = await res.json();
            if (!res.ok) throw new Error(data.error || 'Error consultando el estado');
            setOperation((prev) => prev && { ...prev, status: data.status });
        } catch (e: any) {
            setError(e.message);
        } finally {
            setLoading(false);
        }
    };

    const price = availability?.price;

    return (
        <div className="fixed inset-0 z-[100000] bg-black/50 flex items-center justify-center p-4">
            <div className="bg-white rounded-2xl shadow-2xl w-full max-w-lg overflow-hidden">
                <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100 bg-gradient-to-r from-rotary-blue to-sky-700">
                    <div className="flex items-center gap-2 text-white">
                        <Globe className="w-5 h-5" />
                        <h3 className="font-black text-sm uppercase tracking-wide">Gestión de Dominio</h3>
                    </div>
                    <button onClick={onClose} className="text-white/70 hover:text-white"><X className="w-5 h-5" /></button>
                </div>

                <div className="p-6 space-y-4">
                    {/* Selector de modo */}
                    <div className="grid grid-cols-3 gap-2">
                        {MODES.map((m) => (
                            <button
                                key={m.key}
                                onClick={() => { setMode(m.key); resetResults(); }}
                                className={`flex flex-col items-center gap-1 px-2 py-3 rounded-xl border text-xs font-bold transition-all ${mode === m.key ? 'border-rotary-blue bg-sky-50 text-rotary-blue' : 'border-gray-200 text-gray-500 hover:border-gray-300'}`}
                            >
                                <m.icon className="w-5 h-5" />
                                {m.label}
                            </button>
                        ))}
                    </div>
                    <p className="text-xs text-gray-400 text-center -mt-2">{MODES.find((m) => m.key === mode)?.hint}</p>

                    {/* Dominio */}
                    <div>
                        <label className="block text-xs font-bold text-gray-600 mb-1">Dominio (.org)</label>
                        <input
                            type="text"
                            value={domain}
                            onChange={(e) => { setDomain(cleanDomain(e.target.value)); resetResults(); }}
                            placeholder="ej: rotarymiciudad.org"
                            className="w-full px-4 py-2 border border-gray-200 rounded-lg focus:ring-2 focus:ring-rotary-blue outline-none"
                        />
                        {domain && !isOrg && (
                            <p className="text-[11px] text-amber-600 mt-1">Solo se permiten dominios terminados en <strong>.org</strong>.</p>
                        )}
                    </div>

                    {/* Código EPP (transferencia) */}
                    {mode === 'transfer' && (
                        <div>
                            <label className="block text-xs font-bold text-gray-600 mb-1">Código de autorización (EPP)</label>
                            <input
                                type="text"
                                value={authCode}
                                onChange={(e) => setAuthCode(e.target.value)}
                                placeholder="Provisto por el registrador actual"
                                className="w-full px-4 py-2 border border-gray-200 rounded-lg focus:ring-2 focus:ring-rotary-blue outline-none font-mono text-sm"
                            />
                        </div>
                    )}

                    {/* Verificar disponibilidad (solo compra) */}
                    {mode === 'buy' && (
                        <button
                            onClick={check}
                            disabled={loading || !isOrg}
                            className="w-full flex items-center justify-center gap-2 bg-gray-100 hover:bg-gray-200 text-gray-700 font-bold py-2 rounded-lg text-sm disabled:opacity-50"
                        >
                            {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Globe className="w-4 h-4" />}
                            Verificar disponibilidad
                        </button>
                    )}

                    {availability && (
                        <div className={`p-3 rounded-lg text-sm flex items-start gap-2 ${availability.isAvailable ? 'bg-emerald-50 text-emerald-800' : 'bg-red-50 text-red-700'}`}>
                            {availability.isAvailable ? <CheckCircle2 className="w-4 h-4 mt-0.5" /> : <AlertCircle className="w-4 h-4 mt-0.5" />}
                            <div>
                                <p className="font-bold">{availability.isAvailable ? 'Disponible para registrar' : `No disponible (${availability.status})`}</p>
                                {price?.registration != null && (
                                    <p className="text-xs mt-0.5">Precio de registro: <strong>{price.currency} ${price.registration}/año</strong>{price.renewal != null && ` · renovación ${price.currency} $${price.renewal}/año`}</p>
                                )}
                            </div>
                        </div>
                    )}

                    {error && (
                        <div className="p-3 rounded-lg bg-red-50 text-red-700 text-sm flex items-center gap-2">
                            <AlertCircle className="w-4 h-4" /> {error}
                        </div>
                    )}

                    {/* Resultado de operación */}
                    {operation && (
                        <div className="p-3 rounded-lg bg-sky-50 text-sky-900 text-sm space-y-2">
                            <p className="font-bold flex items-center gap-2"><CheckCircle2 className="w-4 h-4" /> Operación iniciada ({operation.mode})</p>
                            {operation.operationId && (
                                <div className="flex items-center justify-between gap-2">
                                    <span className="text-xs">Estado: <strong>{operation.status}</strong></span>
                                    <button onClick={refreshStatus} disabled={loading} className="flex items-center gap-1 text-xs font-bold text-rotary-blue hover:underline disabled:opacity-50">
                                        <RefreshCw className={`w-3 h-3 ${loading ? 'animate-spin' : ''}`} /> Actualizar
                                    </button>
                                </div>
                            )}
                            {operation.dnsInstructions && (
                                <div className="text-xs">
                                    <p className="font-bold mb-1">Configura estos registros DNS en tu proveedor actual:</p>
                                    <div className="space-y-1 font-mono">
                                        {operation.dnsInstructions.map((r, i) => (
                                            <div key={i} className="bg-white px-2 py-1 rounded border border-sky-100">
                                                {r.host} &nbsp;<strong>{r.type}</strong>&nbsp; → {r.value}
                                            </div>
                                        ))}
                                    </div>
                                </div>
                            )}
                        </div>
                    )}

                    {/* Acción principal */}
                    <button
                        onClick={submit}
                        disabled={loading || !isOrg || (mode === 'buy' && availability ? !availability.isAvailable : false) || (mode === 'transfer' && !authCode)}
                        className="w-full flex items-center justify-center gap-2 bg-rotary-blue hover:bg-sky-800 text-white font-bold py-2.5 rounded-lg text-sm disabled:opacity-50"
                    >
                        {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : null}
                        {mode === 'buy' ? 'Comprar y registrar' : mode === 'connect' ? 'Conectar dominio' : 'Iniciar transferencia'}
                    </button>
                </div>
            </div>
        </div>
    );
};

export default DomainManager;
