import * as React from 'react';
import type { ReactNode } from 'react';
import { Component } from 'react';
import { AlertCircle, RefreshCw } from 'lucide-react';

interface Props {
    children: ReactNode;
    fallbackLabel?: string;
    resetKey?: string | number;
    compact?: boolean;
    fallback?: ReactNode;
}
interface State { hasError: boolean; error: string }

class ErrorBoundary extends Component<Props, State> {
    constructor(props: Props) {
        super(props);
        this.state = { hasError: false, error: '' };
    }

    static getDerivedStateFromError(error: Error): State {
        return { hasError: true, error: error?.message || 'Error inesperado de renderizado' };
    }

    componentDidCatch(error: Error, info?: React.ErrorInfo) {
        console.error('[ErrorBoundary]', error, info?.componentStack);
    }

    componentDidUpdate(prevProps: Props) {
        if (prevProps.resetKey !== this.props.resetKey && this.state.hasError) {
            this.setState({ hasError: false, error: '' });
        }
    }

    handleRetry = () => {
        this.setState({ hasError: false, error: '' });
    };

    render() {
        if (this.state.hasError) {
            if (this.props.fallback) {
                return this.props.fallback;
            }

            if (this.props.compact) {
                return (
                    <div className="bg-red-50/70 border border-red-100 rounded-xl p-4 flex items-center justify-between gap-3 text-left">
                        <div className="flex items-center gap-2 min-w-0">
                            <AlertCircle className="w-4 h-4 text-red-500 flex-shrink-0" />
                            <p className="text-xs font-bold text-red-800 truncate">
                                {this.props.fallbackLabel || 'No se pudo cargar este elemento'}
                            </p>
                        </div>
                        <button
                            type="button"
                            onClick={this.handleRetry}
                            className="flex items-center gap-1 text-[11px] font-black text-red-700 bg-red-100/80 hover:bg-red-200 px-2.5 py-1 rounded-lg transition flex-shrink-0"
                        >
                            <RefreshCw className="w-3 h-3" /> Reintentar
                        </button>
                    </div>
                );
            }

            return (
                <div className="bg-red-50 border border-red-100 rounded-2xl p-6 flex items-start gap-3">
                    <AlertCircle className="w-5 h-5 text-red-400 flex-shrink-0 mt-0.5" />
                    <div className="flex-1 min-w-0">
                        <p className="text-sm font-black text-red-800 mb-1">
                            {this.props.fallbackLabel || 'Error al cargar el componente'}
                        </p>
                        <p className="text-xs text-red-600 font-mono truncate">{this.state.error}</p>
                        <button
                            type="button"
                            onClick={this.handleRetry}
                            className="mt-3 flex items-center gap-1.5 text-xs font-black text-red-600 hover:text-red-700 transition"
                        >
                            <RefreshCw className="w-3 h-3" /> Reintentar
                        </button>
                    </div>
                </div>
            );
        }
        return this.props.children;
    }
}

export default ErrorBoundary;
