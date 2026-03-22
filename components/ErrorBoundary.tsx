import React, { Component } from 'react';
import { ShieldAlert, RefreshCw, LogOut } from 'lucide-react';
import { auth } from '../firebase';

interface ErrorBoundaryProps {
  children: React.ReactNode;
}

interface ErrorBoundaryState {
  hasError: boolean;
  error: any;
}

export class ErrorBoundary extends Component<ErrorBoundaryProps, ErrorBoundaryState> {
  public state: ErrorBoundaryState;
  public props: ErrorBoundaryProps;

  constructor(props: ErrorBoundaryProps) {
    super(props);
    this.state = { hasError: false, error: null };
    this.props = props;
  }

  static getDerivedStateFromError(error: any) {
    return { hasError: true, error };
  }

  componentDidCatch(error: any, errorInfo: any) {
    console.error("ErrorBoundary caught an error", error, errorInfo);
  }

  render() {
    if (this.state.hasError) {
      let errorMessage = "Ocorreu um erro inesperado.";
      try {
        const parsedError = JSON.parse(this.state.error.message);
        if (parsedError.error.includes("permission-denied") || parsedError.error.includes("Missing or insufficient permissions")) {
          errorMessage = "Você não tem permissão para realizar esta ação ou acessar estes dados. Por favor, verifique se está logado com a conta correta.";
        }
      } catch (e) {
        // Not a JSON error
      }

      return (
        <div className="min-h-screen flex items-center justify-center bg-zinc-950 text-white p-4">
          <div className="max-w-md w-full bg-zinc-900 border border-zinc-800 rounded-2xl p-8 text-center">
            <ShieldAlert className="w-16 h-16 text-red-500 mx-auto mb-4" />
            <h1 className="text-2xl font-bold mb-2">Ops! Algo deu errado</h1>
            <p className="text-zinc-400 mb-6">{errorMessage}</p>
            <div className="flex flex-col gap-3">
              <button 
                onClick={() => window.location.reload()}
                className="px-6 py-2 bg-emerald-600 hover:bg-emerald-500 rounded-full transition-colors flex items-center justify-center gap-2"
              >
                <RefreshCw className="w-4 h-4" />
                Recarregar Página
              </button>
              <button 
                onClick={() => {
                  auth.signOut();
                  window.location.reload();
                }}
                className="px-6 py-2 bg-zinc-800 hover:bg-zinc-700 rounded-full transition-colors flex items-center justify-center gap-2"
              >
                <LogOut className="w-4 h-4" />
                Sair e Tentar Novamente
              </button>
            </div>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}
