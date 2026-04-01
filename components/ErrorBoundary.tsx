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
        <div className="min-h-screen bg-slate-50 flex items-center justify-center p-4">
          <div className="max-w-md w-full bg-white rounded-[2.5rem] shadow-xl border border-slate-200 p-8 text-center">
            <div className="w-20 h-20 bg-rose-50 rounded-full flex items-center justify-center mx-auto mb-6">
              <AlertCircle className="w-10 h-10 text-rose-500" />
            </div>
            
            <h1 className="text-2xl font-black text-slate-800 mb-2">Ops! Algo deu errado</h1>
            <p className="text-slate-500 mb-8">
              Ocorreu um erro inesperado. Tentamos capturar os detalhes para ajudar na correção.
            </p>

            <div className="bg-slate-50 rounded-2xl p-4 mb-8 text-left overflow-auto max-h-48">
              <p className="text-xs font-mono text-slate-600 break-all">
                {this.state.errorInfo || this.state.error?.message}
              </p>
            </div>

            <button
              onClick={this.handleReset}
              className="w-full bg-indigo-600 hover:bg-indigo-700 text-white font-black py-4 rounded-2xl transition-all flex items-center justify-center gap-2 shadow-lg shadow-indigo-200"
            >
              <RotateCcw className="w-5 h-5" />
              Recarregar Aplicativo
            </button>
            
            <p className="mt-6 text-[10px] font-bold text-slate-400 uppercase tracking-widest">
              Se o problema persistir, contate o suporte
            </p>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}
