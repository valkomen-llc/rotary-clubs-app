import { useState, useEffect, useRef } from 'react';
import { useNavigate, useSearchParams, Link } from 'react-router-dom';
import { Sparkles, Loader2, CheckCircle, ArrowLeft, RefreshCw } from 'lucide-react';
import { useAuth } from '../hooks/useAuth';

export default function VerifyEmail() {
    const navigate = useNavigate();
    const [searchParams] = useSearchParams();
    const { login } = useAuth();
    const email = searchParams.get('email') || '';

    const [code, setCode] = useState(['', '', '', '', '', '']);
    const [loading, setLoading] = useState(false);
    const [resending, setResending] = useState(false);
    const [error, setError] = useState('');
    const [success, setSuccess] = useState(false);
    const [resendTimer, setResendTimer] = useState(60);

    const LOGO_CACHE_KEY = 'cp_platform_logo';
    const cached = (() => { try { return JSON.parse(localStorage.getItem(LOGO_CACHE_KEY) || 'null'); } catch { return null; } })();
    const [platformLogo, setPlatformLogo] = useState<string | null>(cached?.url || null);
    const [platformLogoSize, setPlatformLogoSize] = useState<number>(cached?.size || 48);
    const [logoReady, setLogoReady] = useState(!!cached);

    useEffect(() => {
        const apiUrl = import.meta.env.VITE_API_URL || '/api';
        fetch(`${apiUrl}/platform-config/logo`.replace(/\/+/g, '/').replace(':/', '://'))
            .then(r => r.json())
            .then(data => {
                const url = data.url || null;
                const size = data.size || 48;
                setPlatformLogo(url);
                setPlatformLogoSize(size);
                try { localStorage.setItem(LOGO_CACHE_KEY, JSON.stringify({ url, size })); } catch { }
            })
            .catch(() => {})
            .finally(() => setLogoReady(true));
    }, []);

    const inputRefs = useRef<(HTMLInputElement | null)[]>([]);

    // Countdown for resend button
    useEffect(() => {
        if (resendTimer <= 0) return;
        const t = setTimeout(() => setResendTimer(s => s - 1), 1000);
        return () => clearTimeout(t);
    }, [resendTimer]);

    // Auto-focus first input
    useEffect(() => {
        inputRefs.current[0]?.focus();
    }, []);

    const handleChange = (index: number, value: string) => {
        if (!/^[0-9]?$/.test(value)) return;

        const newCode = [...code];
        newCode[index] = value;
        setCode(newCode);
        setError('');

        // Auto-advance to next input
        if (value && index < 5) {
            inputRefs.current[index + 1]?.focus();
        }

        // Auto-submit when all 6 digits are filled
        if (value && index === 5 && newCode.every(d => d !== '')) {
            handleVerify(newCode.join(''));
        }
    };

    const handleKeyDown = (index: number, e: React.KeyboardEvent) => {
        if (e.key === 'Backspace' && !code[index] && index > 0) {
            inputRefs.current[index - 1]?.focus();
        }
    };

    const handlePaste = (e: React.ClipboardEvent) => {
        e.preventDefault();
        const pasted = e.clipboardData.getData('text').replace(/\D/g, '').slice(0, 6);
        if (pasted.length === 6) {
            const newCode = pasted.split('');
            setCode(newCode);
            inputRefs.current[5]?.focus();
            handleVerify(pasted);
        }
    };

    const handleVerify = async (fullCode?: string) => {
        const codeStr = fullCode || code.join('');
        if (codeStr.length !== 6) {
            setError('Ingresa los 6 dígitos del código');
            return;
        }

        setLoading(true);
        setError('');

        try {
            const apiUrl = import.meta.env.VITE_API_URL || '/api';
            const resp = await fetch(`${apiUrl}/auth/verify-email`.replace(/\/+/g, '/').replace(':/', '://'), {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ email, code: codeStr }),
            });

            const data = await resp.json();

            if (!resp.ok) {
                setError(data.error || 'Código incorrecto');
                setCode(['', '', '', '', '', '']);
                inputRefs.current[0]?.focus();
                return;
            }

            // Login with the returned token
            if (data.token && data.user) {
                login(data.token, data.user);
            }

            setSuccess(true);

            // Redirect to onboarding
            setTimeout(() => {
                navigate('/admin/onboarding');
            }, 2000);

        } catch {
            setError('Error de conexión. Por favor intenta de nuevo.');
        } finally {
            setLoading(false);
        }
    };

    const handleResend = async () => {
        if (resendTimer > 0) return;

        setResending(true);
        setError('');

        try {
            const apiUrl = import.meta.env.VITE_API_URL || '/api';
            const resp = await fetch(`${apiUrl}/auth/resend-code`.replace(/\/+/g, '/').replace(':/', '://'), {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ email }),
            });

            const data = await resp.json();

            if (!resp.ok) {
                setError(data.error || 'Error al reenviar');
                return;
            }

            setResendTimer(60);
            setCode(['', '', '', '', '', '']);
            inputRefs.current[0]?.focus();

        } catch {
            setError('Error de conexión');
        } finally {
            setResending(false);
        }
    };

    if (!email) {
        return (
            <div className="min-h-screen bg-rotary-concrete bg-gradient-to-br from-blue-50 to-white flex items-center justify-center p-6">
                <div className="bg-white rounded-3xl shadow-xl border border-gray-100 p-10 max-w-md w-full text-center">
                    <p className="text-gray-500 mb-4">No se encontró el correo electrónico.</p>
                    <Link to="/registro" className="text-[#019fcb] font-bold hover:underline">Volver al registro</Link>
                </div>
            </div>
        );
    }

    if (success) {
        return (
            <div className="min-h-screen bg-rotary-concrete bg-gradient-to-br from-blue-50 to-white flex items-center justify-center p-6">
                <div className="bg-white rounded-3xl shadow-xl border border-gray-100 p-10 max-w-md w-full text-center">
                    <div className="w-20 h-20 rounded-full bg-emerald-50 flex items-center justify-center mx-auto mb-6 animate-bounce">
                        <CheckCircle className="w-10 h-10 text-emerald-500" />
                    </div>
                    <h2 className="text-2xl font-black text-gray-900 mb-2">¡Correo verificado!</h2>
                    <p className="text-gray-500 mb-4">Redirigiendo al asistente de configuración...</p>
                    <div className="h-1.5 bg-gray-100 rounded-full overflow-hidden">
                        <div className="h-full bg-[#019fcb] rounded-full" style={{ width: '100%', animation: 'progress 2s linear forwards' }} />
                    </div>
                </div>
                <style>{`
                    @keyframes progress { from { width: 0%; } to { width: 100%; } }
                `}</style>
            </div>
        );
    }

    return (
        <div className="min-h-screen bg-rotary-concrete bg-gradient-to-br from-blue-50 to-white flex items-center justify-center p-6">
            <div className="w-full max-w-md">
                {/* Back link */}
                <div className="text-center mb-8">
                    <Link to="/registro" className="inline-flex items-center gap-1.5 text-sm text-gray-400 hover:text-gray-600 transition-colors">
                        <ArrowLeft className="w-4 h-4" /> Volver al registro
                    </Link>
                </div>

                {/* Header */}
                <div className="text-center mb-8">
                    <div className="flex items-center justify-center gap-2.5 mb-4" style={{ minHeight: '40px' }}>
                        {logoReady && (platformLogo ? (
                            <img src={platformLogo} alt="ClubPlatform" style={{ height: platformLogoSize + 'px', width: 'auto', maxWidth: '320px' }} />
                        ) : (
                            <>
                                <div className="w-10 h-10 rounded-2xl bg-[#019fcb] flex items-center justify-center shadow-lg shadow-blue-200">
                                    <Sparkles className="w-5 h-5 text-white" />
                                </div>
                                <span className="font-black text-gray-900 text-xl">ClubPlatform</span>
                            </>
                        ))}
                    </div>
                    <h1 className="text-2xl font-black text-gray-900 mb-2">Verifica tu correo</h1>
                    <p className="text-gray-500 text-sm">
                        Enviamos un código de 6 dígitos a<br />
                        <strong className="text-gray-700">{email}</strong>
                    </p>
                </div>

                {/* Card */}
                <div className="bg-white rounded-3xl shadow-xl border border-gray-100 overflow-hidden">
                    <div className="p-8">
                        {/* OTP Inputs */}
                        <div className="flex justify-center gap-3 mb-6" onPaste={handlePaste}>
                            {code.map((digit, i) => (
                                <input
                                    key={i}
                                    ref={el => { inputRefs.current[i] = el; }}
                                    type="text"
                                    inputMode="numeric"
                                    maxLength={1}
                                    value={digit}
                                    onChange={e => handleChange(i, e.target.value)}
                                    onKeyDown={e => handleKeyDown(i, e)}
                                    className={`w-12 h-14 text-center text-xl font-black border-2 rounded-xl transition-all focus:outline-none focus:ring-2 focus:ring-[#019fcb]/20
                                        ${digit ? 'border-[#019fcb] text-[#019fcb] bg-blue-50/50' : 'border-gray-200 text-gray-900'}
                                        ${error ? 'border-red-300 animate-shake' : ''}
                                    `}
                                />
                            ))}
                        </div>

                        {/* Error */}
                        {error && (
                            <div className="bg-red-50 border border-red-100 text-red-600 text-sm px-4 py-3 rounded-xl mb-4 text-center">
                                {error}
                            </div>
                        )}

                        {/* Verify Button */}
                        <button
                            onClick={() => handleVerify()}
                            disabled={loading || code.some(d => !d)}
                            className="w-full flex items-center justify-center gap-2 bg-[#019fcb] text-white font-bold py-3.5 rounded-xl hover:bg-[#017da3] transition-all shadow-lg shadow-blue-900/20 disabled:opacity-60 text-sm"
                        >
                            {loading
                                ? <><Loader2 className="w-4 h-4 animate-spin" /> Verificando...</>
                                : <><CheckCircle className="w-4 h-4" /> Verificar código</>
                            }
                        </button>

                        {/* Resend */}
                        <div className="text-center mt-6">
                            {resendTimer > 0 ? (
                                <p className="text-gray-400 text-xs">
                                    ¿No recibiste el código? Reenviar en <strong className="text-gray-600">{resendTimer}s</strong>
                                </p>
                            ) : (
                                <button
                                    onClick={handleResend}
                                    disabled={resending}
                                    className="inline-flex items-center gap-1.5 text-[#019fcb] font-bold text-sm hover:underline disabled:opacity-50"
                                >
                                    {resending ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <RefreshCw className="w-3.5 h-3.5" />}
                                    Reenviar código
                                </button>
                            )}
                        </div>
                    </div>
                </div>

                <p className="text-center text-gray-400 text-xs mt-6">
                    Revisa tu bandeja de entrada y la carpeta de spam.
                </p>
            </div>

            <style>{`
                @keyframes shake {
                    0%, 100% { transform: translateX(0); }
                    25% { transform: translateX(-4px); }
                    75% { transform: translateX(4px); }
                }
                .animate-shake { animation: shake 0.3s ease; }
            `}</style>
        </div>
    );
}
