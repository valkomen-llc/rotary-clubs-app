// ════════════════════════════════════════════════════════════════════
// Restablecer contraseña — /restablecer?token=…
// v4.932.0
//
// Es PÚBLICA a propósito: se llega desde el enlace del correo, o sea
// justamente sin sesión. Está en `PRIVATE_PREFIXES` del SEO —abierta y no
// indexada son cosas distintas—.
//
// ⚠️ NO DICE SI EL CORREO EXISTE. El formulario de «lo olvidé» responde siempre
// lo mismo, porque el servidor responde siempre lo mismo: sin eso, el endpoint
// sería un censo de las direcciones institucionales de todos los sitios.
// ════════════════════════════════════════════════════════════════════
import React, { useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { Lock, Mail, CheckCircle2, Loader2 } from 'lucide-react';
import { PASSWORD_MIN } from '../lib/institutionalAccess';

const RestablecerPassword: React.FC = () => {
    const [params] = useSearchParams();
    const navigate = useNavigate();
    const token = params.get('token') || '';

    const [password, setPassword] = useState('');
    const [confirm, setConfirm] = useState('');
    const [email, setEmail] = useState('');
    const [enviando, setEnviando] = useState(false);
    const [aviso, setAviso] = useState<string | null>(null);
    const [error, setError] = useState<string | null>(null);
    const [listo, setListo] = useState(false);

    const pedirEnlace = async (e: React.FormEvent) => {
        e.preventDefault();
        setEnviando(true);
        setError(null);
        try {
            const r = await fetch('/api/auth/forgot', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ email }),
            });
            const cuerpo = await r.json().catch(() => ({}));
            // Siempre el mismo mensaje: exista o no la cuenta.
            setAviso(cuerpo?.message || 'Si el correo pertenece a una cuenta con acceso, recibirás un enlace.');
        } catch {
            setError('No hubo respuesta del servidor. Revisa tu conexión.');
        } finally {
            setEnviando(false);
        }
    };

    const guardar = async (e: React.FormEvent) => {
        e.preventDefault();
        setError(null);
        if (password.length < PASSWORD_MIN) {
            setError(`La contraseña debe tener al menos ${PASSWORD_MIN} caracteres.`);
            return;
        }
        if (password !== confirm) {
            setError('Las dos contraseñas no coinciden.');
            return;
        }
        setEnviando(true);
        try {
            const r = await fetch('/api/auth/reset', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ token, password, passwordConfirm: confirm }),
            });
            const cuerpo = await r.json().catch(() => ({}));
            if (!r.ok) {
                setError(cuerpo?.error || 'No pudimos restablecer la contraseña.');
                return;
            }
            setListo(true);
        } catch {
            setError('No hubo respuesta del servidor. Revisa tu conexión.');
        } finally {
            setEnviando(false);
        }
    };

    return (
        <div className="min-h-screen bg-gray-50 flex items-center justify-center px-4 py-12">
            <div className="w-full max-w-md bg-white border border-gray-200 rounded-[32px] shadow-sm p-8">
                {listo ? (
                    <div className="text-center">
                        <div className="w-14 h-14 rounded-3xl bg-emerald-50 flex items-center justify-center mx-auto">
                            <CheckCircle2 className="w-7 h-7 text-emerald-600" />
                        </div>
                        <h1 className="mt-6 text-xl font-bold text-gray-900">Tu contraseña quedó lista</h1>
                        <p className="mt-2 text-sm text-gray-500">
                            Ya puedes entrar con tu correo institucional desde el botón «Iniciar sesión».
                        </p>
                        <button
                            onClick={() => navigate('/')}
                            className="mt-6 w-full py-3 bg-gray-900 text-white text-xs font-black rounded-2xl uppercase tracking-widest hover:bg-rotary-blue transition-all"
                        >
                            Ir al sitio
                        </button>
                    </div>
                ) : token ? (
                    <form onSubmit={guardar}>
                        <div className="w-12 h-12 rounded-2xl bg-sky-100 flex items-center justify-center">
                            <Lock className="w-6 h-6 text-rotary-blue" />
                        </div>
                        <h1 className="mt-5 text-xl font-bold text-gray-900">Crea tu contraseña</h1>
                        <p className="mt-2 text-sm text-gray-500">
                            Mínimo {PASSWORD_MIN} caracteres. El enlace sólo se puede usar una vez.
                        </p>

                        <label className="block mt-6">
                            <span className="text-[11px] font-black text-gray-400 uppercase tracking-wider">Contraseña nueva</span>
                            <input
                                type="password"
                                autoComplete="new-password"
                                value={password}
                                onChange={e => setPassword(e.target.value)}
                                className="mt-2 w-full px-4 py-3 bg-gray-50 rounded-2xl outline-none focus:ring-2 focus:ring-sky-200"
                            />
                        </label>
                        <label className="block mt-4">
                            <span className="text-[11px] font-black text-gray-400 uppercase tracking-wider">Repítela</span>
                            <input
                                type="password"
                                autoComplete="new-password"
                                value={confirm}
                                onChange={e => setConfirm(e.target.value)}
                                className="mt-2 w-full px-4 py-3 bg-gray-50 rounded-2xl outline-none focus:ring-2 focus:ring-sky-200"
                            />
                        </label>

                        {error && <p className="mt-4 text-sm text-red-600">{error}</p>}

                        <button
                            type="submit"
                            disabled={enviando}
                            className="mt-6 w-full py-3 bg-gray-900 text-white text-xs font-black rounded-2xl uppercase tracking-widest hover:bg-rotary-blue transition-all disabled:opacity-60 flex items-center justify-center gap-2"
                        >
                            {enviando && <Loader2 className="w-4 h-4 animate-spin" />}
                            Guardar contraseña
                        </button>
                    </form>
                ) : (
                    <form onSubmit={pedirEnlace}>
                        <div className="w-12 h-12 rounded-2xl bg-sky-100 flex items-center justify-center">
                            <Mail className="w-6 h-6 text-rotary-blue" />
                        </div>
                        <h1 className="mt-5 text-xl font-bold text-gray-900">¿Olvidaste tu contraseña?</h1>
                        <p className="mt-2 text-sm text-gray-500">
                            Escribe tu correo institucional y te enviamos un enlace para crear una nueva.
                            No enviamos contraseñas por correo.
                        </p>

                        <label className="block mt-6">
                            <span className="text-[11px] font-black text-gray-400 uppercase tracking-wider">Correo institucional</span>
                            <input
                                type="email"
                                autoComplete="username"
                                value={email}
                                onChange={e => setEmail(e.target.value)}
                                placeholder="usuario@tudominio.org"
                                className="mt-2 w-full px-4 py-3 bg-gray-50 rounded-2xl outline-none focus:ring-2 focus:ring-sky-200"
                            />
                        </label>

                        {aviso && (
                            <p className="mt-4 text-sm text-emerald-700 bg-emerald-50 border border-emerald-200 rounded-2xl p-3">
                                {aviso}
                            </p>
                        )}
                        {error && <p className="mt-4 text-sm text-red-600">{error}</p>}

                        <button
                            type="submit"
                            disabled={enviando || !email}
                            className="mt-6 w-full py-3 bg-gray-900 text-white text-xs font-black rounded-2xl uppercase tracking-widest hover:bg-rotary-blue transition-all disabled:opacity-40 flex items-center justify-center gap-2"
                        >
                            {enviando && <Loader2 className="w-4 h-4 animate-spin" />}
                            Enviarme el enlace
                        </button>
                    </form>
                )}
            </div>
        </div>
    );
};

export default RestablecerPassword;
