import React, { Component, ErrorInfo, ReactNode } from 'react';
import { AlertCircle, RotateCcw } from 'lucide-react';

interface Props {
  children: ReactNode;
}

interface State {
  hasError: boolean;
  error: Error | null;
  errorInfo: string | null;
}

export class ErrorBoundary extends React.Component<Props, State> {
  public state: State = {
    hasError: false,
    error: null,
    errorInfo: null
  };

  public static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error, errorInfo: null };
  }

  public componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    console.error('Uncaught error:', error, errorInfo);
    
    // Try to parse JSON error from Firestore
    let detailedInfo = null;
    try {
      if (error.message.startsWith('{')) {
        detailedInfo = JSON.parse(error.message);
      }
    } catch (e) {
      // Not a JSON error
    }

    this.setState({
      error,
      errorInfo: detailedInfo ? JSON.stringify(detailedInfo, null, 2) : error.message
    });
  }

  private handleReset = () => {
    window.location.reload();
  };

  public render() {
    if (this.state.hasError) {
      return (
        <div className="min-h-screen bg-brand-secondary flex items-center justify-center p-4">
          <div className="max-w-md w-full bg-brand-secondary/50 backdrop-blur-xl rounded-[2.5rem] shadow-2xl border border-white/5 border-l-[8px] border-l-brand-primary p-8 text-center">
            <div className="w-20 h-20 bg-rose-500/10 rounded-full flex items-center justify-center mx-auto mb-6 border border-rose-500/20">
              <AlertCircle className="w-10 h-10 text-rose-500" />
            </div>
            
            <h1 className="text-2xl font-black text-white mb-2 uppercase tracking-tight italic">Ops! Algo deu errado</h1>
            <p className="text-white/40 mb-8 font-bold text-sm">
              Ocorreu um erro inesperado. Tentamos capturar os detalhes para ajudar na correção.
            </p>

            <div className="bg-black/40 rounded-2xl p-4 mb-8 text-left overflow-auto max-h-48 border border-white/5">
              <p className="text-xs font-mono text-rose-400/80 break-all leading-relaxed">
                {this.state.errorInfo || this.state.error?.message}
              </p>
            </div>

            <button
              onClick={this.handleReset}
              className="w-full bg-brand-primary hover:bg-brand-primary/90 text-brand-secondary font-black py-4 rounded-2xl transition-all flex items-center justify-center gap-2 shadow-lg shadow-brand-primary/20 uppercase tracking-widest text-xs"
            >
              <RotateCcw className="w-5 h-5" />
              Recarregar Aplicativo
            </button>
            
            <p className="mt-6 text-[10px] font-black text-white/20 uppercase tracking-widest">
              Se o problema persistir, contate o suporte
            </p>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}
