import React, { Component, type ReactNode } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import AdminLayout from './AdminLayout';
import { AlertTriangle, RefreshCw, LayoutDashboard, Copy, Check, ChevronDown, ChevronUp } from 'lucide-react';
import { toast } from 'sonner';

interface Props {
    children: ReactNode;
    moduleName?: string;
    wide?: boolean;
}

interface InnerProps extends Props {
    locationKey: string;
    navigate: (to: string) => void;
}

interface State {
    hasError: boolean;
    error: Error | null;
    errorInfo: React.ErrorInfo | null;
    copied: boolean;
    showDetails: boolean;
}

/**
 * Envoltorio seguro para la barra y navegación del administrador:
 * si `AdminLayout` llegase a fallar por algún error de datos o iconos,
 * este contenedor captura el fallo y mantiene disponible una interfaz limpia
 * para no perder la navegación ni expulsar al usuario al enrutador raíz.
 */
class SafeLayoutShell extends Component<{ children: ReactNode; wide?: boolean }, { layoutFailed: boolean }> {
    state = { layoutFailed: false };
    static getDerivedStateFromError() {
        return { layoutFailed: true };
    }
    render() {
        if (this.state.layoutFailed) {
            return (
                <div className="min-h-screen bg-slate-50 flex flex-col font-sans">
                    <header className="h-16 bg-white border-b border-gray-200 px-6 flex items-center justify-between shadow-sm">
                        <div className="flex items-center gap-3">
                            <div className="w-8 h-8 rounded-lg bg-[#0c3c7c] text-white font-black flex items-center justify-center text-xs shadow-sm">
                                CP
                            </div>
                            <span className="font-bold text-gray-900 text-sm">Panel de Control · Club Platform</span>
                        </div>
                        <a href="/admin/dashboard" className="text-xs font-bold text-[#0c3c7c] hover:underline">
                            ← Ir al Dashboard
                        </a>
                    </header>
                    <main className="flex-1 p-6 flex items-center justify-center">
                        {this.props.children}
                    </main>
                </div>
            );
        }
        return <AdminLayout wide={this.props.wide}>{this.props.children}</AdminLayout>;
    }
}

class AdminModuleBoundaryInner extends Component<InnerProps, State> {
    constructor(props: InnerProps) {
        super(props);
        this.state = {
            hasError: false,
            error: null,
            errorInfo: null,
            copied: false,
            showDetails: false,
        };
    }

    static getDerivedStateFromError(error: Error): Partial<State> {
        return { hasError: true, error };
    }

    componentDidCatch(error: Error, errorInfo: React.ErrorInfo) {
        console.error(`[AdminModuleBoundary] Error en módulo "${this.props.moduleName || 'Desconocido'}":`, error, errorInfo);
        this.setState({ errorInfo });
    }

    componentDidUpdate(prevProps: InnerProps) {
        // Al cambiar de ruta o parámetros, restablecer automáticamente el estado de error
        if (prevProps.locationKey !== this.props.locationKey && this.state.hasError) {
            this.setState({
                hasError: false,
                error: null,
                errorInfo: null,
                copied: false,
                showDetails: false,
            });
        }
    }

    handleRetry = () => {
        this.setState({ hasError: false, error: null, errorInfo: null });
    };

    handleCopyError = () => {
        const { error, errorInfo } = this.state;
        const text = `Modulo: ${this.props.moduleName || 'Admin'}\nMensaje: ${error?.message || 'Error desconocido'}\nStack: ${error?.stack || ''}\nComponentStack: ${errorInfo?.componentStack || ''}`;
        navigator.clipboard.writeText(text).then(() => {
            this.setState({ copied: true });
            toast.success('Detalles del error copiados al portapapeles');
            setTimeout(() => this.setState({ copied: false }), 2000);
        }).catch(() => {
            toast.error('No se pudo copiar el texto');
        });
    };

    render() {
        if (this.state.hasError) {
            const { moduleName, wide, navigate } = this.props;
            const { error, copied, showDetails } = this.state;

            return (
                <SafeLayoutShell wide={wide}>
                    <div className="max-w-3xl mx-auto my-12 animate-in fade-in duration-300">
                        <div className="bg-white rounded-3xl border border-red-100 shadow-xl overflow-hidden">
                            {/* Cabecera del aviso */}
                            <div className="bg-gradient-to-r from-red-500/10 via-amber-500/10 to-transparent p-8 border-b border-red-100/60">
                                <div className="flex items-start gap-4">
                                    <div className="w-12 h-12 rounded-2xl bg-red-100 flex items-center justify-center text-red-600 flex-shrink-0 shadow-sm">
                                        <AlertTriangle className="w-6 h-6" />
                                    </div>
                                    <div className="flex-1">
                                        <div className="inline-flex items-center gap-2 px-2.5 py-0.5 rounded-full bg-red-100 text-red-800 text-[11px] font-black uppercase tracking-wider mb-2">
                                            Aislamiento de Incidencia
                                        </div>
                                        <h2 className="text-2xl font-black text-gray-900 tracking-tight">
                                            No pudimos cargar la vista de {moduleName || 'este módulo'}
                                        </h2>
                                        <p className="text-sm text-gray-600 font-medium mt-1 leading-relaxed">
                                            El resto del panel de control sigue operando con normalidad. Puedes navegar a otros módulos mediante el menú lateral izquierdo o reintentar cargar esta sección.
                                        </p>
                                    </div>
                                </div>
                            </div>

                            {/* Acciones principales */}
                            <div className="p-8 space-y-6">
                                <div className="flex flex-wrap items-center gap-3">
                                    <button
                                        type="button"
                                        onClick={this.handleRetry}
                                        className="inline-flex items-center gap-2 bg-rotary-blue hover:bg-sky-800 text-white font-bold text-sm px-6 py-3 rounded-xl transition shadow-md shadow-rotary-blue/20"
                                    >
                                        <RefreshCw className="w-4 h-4" /> Reintentar módulo
                                    </button>

                                    <button
                                        type="button"
                                        onClick={() => navigate('/admin/dashboard')}
                                        className="inline-flex items-center gap-2 bg-gray-100 hover:bg-gray-200 text-gray-800 font-bold text-sm px-5 py-3 rounded-xl transition"
                                    >
                                        <LayoutDashboard className="w-4 h-4" /> Ir al Panel Principal
                                    </button>

                                    <button
                                        type="button"
                                        onClick={this.handleCopyError}
                                        className="inline-flex items-center gap-2 border border-gray-200 hover:bg-gray-50 text-gray-600 font-semibold text-sm px-4 py-3 rounded-xl transition ml-auto"
                                    >
                                        {copied ? <Check className="w-4 h-4 text-emerald-600" /> : <Copy className="w-4 h-4" />}
                                        {copied ? 'Copiado' : 'Copiar diagnóstico'}
                                    </button>
                                </div>

                                {/* Desplegable técnico para observabilidad */}
                                <div className="border border-gray-200 rounded-2xl overflow-hidden bg-gray-50/50">
                                    <button
                                        type="button"
                                        onClick={() => this.setState({ showDetails: !showDetails })}
                                        className="w-full flex items-center justify-between px-5 py-3.5 text-xs font-bold text-gray-600 hover:text-gray-900 transition"
                                    >
                                        <span>Detalles técnicos del error</span>
                                        {showDetails ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
                                    </button>

                                    {showDetails && (
                                        <div className="p-5 pt-0 border-t border-gray-100 text-left font-mono text-[11px] text-red-700 space-y-2">
                                            <div className="p-3 bg-red-50/60 rounded-xl border border-red-100 break-words">
                                                <strong>Mensaje:</strong> {error?.message || 'Error no especificado'}
                                            </div>
                                            {error?.stack && (
                                                <pre className="p-3 bg-gray-900 text-gray-200 rounded-xl overflow-x-auto text-[10px] max-h-48 leading-relaxed">
                                                    {error.stack}
                                                </pre>
                                            )}
                                        </div>
                                    )}
                                </div>
                            </div>
                        </div>
                    </div>
                </SafeLayoutShell>
            );
        }

        return this.props.children;
    }
}

export function AdminModuleBoundary(props: Props) {
    const location = useLocation();
    const navigate = useNavigate();
    return (
        <AdminModuleBoundaryInner
            {...props}
            locationKey={`${location.pathname}${location.search}`}
            navigate={navigate}
        />
    );
}

export default AdminModuleBoundary;
