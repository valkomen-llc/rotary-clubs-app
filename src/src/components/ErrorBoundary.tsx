import * as React from 'react';
import type { ReactNode } from 'react';
import { Component } from 'react';
import { AlertCircle, RefreshCw } from 'lucide-react';

interface Props {
    children: ReactNode;
    fallbackLabel?: string;
}
interface State { hasError: boolean; error: string }

class ErrorBoundary extends Component<Props, State> {
    constructor(props: Props) {
        super(props);
        this.state = { hasError: false, error: '' };
    }

    static getDerivedStateFromError(error: Error): State {
        return { hasError: true, error: error.message };
    }

    componentDidCatch(error: Error) {
        console.error('[ErrorBoundary]', error);
    }

    render() {
        if (this.state.hasError) {
            return (
                <div className="bg-red-50 border border-red-100 rounded-2xl p-6 flex items-start gap-3">
                    <AlertCircle className="w-5 h-5 text-red-400 flex-shrink-0 mt-0.5" />
                    <div className="flex-1 min-w-0">
                        <p className="text-sm font-black text-red-800 mb-1">
                            {this.props.fallbackLabel || 'Error al cargar el componente'}
                        </p>
                        <p className="text-xs text-red-600 font-mono truncate">{this.state.error}</p>
                        <button
                            onClick={() => this.setState({ hasError: false, error: '' })}
                            className="mt-3 flex items-center gap-1.5 text-xs font-black text-red-600 hover:text-red-700"
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
