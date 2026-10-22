
import React, { useState, useEffect } from 'react';
import { Trophy, LogIn, Mail, RefreshCw, Send, Swords, TrendingUp, ShieldCheck, User, X, Fingerprint, ScanFace } from 'lucide-react';
import { Logo } from './Logo';
import { useWebAuthn } from '../hooks/useWebAuthn';
import { useStore } from '../../store';

interface LoginViewProps {
  handleMagicLink: (e: React.FormEvent) => void;
  handleGoogleLogin: () => void;
  magicLinkEmail: string;
  setMagicLinkEmail: (email: string) => void;
  isSendingMagicLink: boolean;
  isLoggingIn: boolean;
  onClickPublic: () => void;
  onLoginSuccess?: () => void;
  isAttendanceMode?: boolean; // NEW
}

export const LoginView: React.FC<LoginViewProps> = ({
  handleMagicLink,
  handleGoogleLogin,
  magicLinkEmail,
  setMagicLinkEmail,
  isSendingMagicLink,
  isLoggingIn,
  onClickPublic,
  onLoginSuccess,
  isAttendanceMode // NEW
}) => {
  const [recentLogins, setRecentLogins] = useState<string[]>([]);
  const setViewMode = useStore(state => state.setViewMode);
  const { 
    login, 
    register, 
    isLoading: isBiometricLoading, 
    error: biometricError, 
    success: biometricSuccess, 
    clearMessages 
  } = useWebAuthn();
  const [isIframe, setIsIframe] = useState(false);
  const [isPasskeySupported, setIsPasskeySupported] = useState(true);

  // Custom states for the new biometric confirmation check and enrolling popup modal
  const [hasBiometrics, setHasBiometrics] = useState<boolean>(false);
  const [isEnrollModalOpen, setIsEnrollModalOpen] = useState(false);
  const [enrollEmail, setEnrollEmail] = useState('');
  const [modalError, setModalError] = useState<string | null>(null);

  useEffect(() => {
    setHasBiometrics(window.localStorage.getItem('hasBiometricsLinked') === 'true');
  }, [biometricSuccess]);

  useEffect(() => {
    if (isEnrollModalOpen) {
      setModalError(null);
      if (magicLinkEmail) {
        setEnrollEmail(magicLinkEmail);
      }
    }
  }, [isEnrollModalOpen, magicLinkEmail]);

  // Executa o auto-dismiss após 5 segundos das mensagens de sucesso/erro da biometria
  useEffect(() => {
    if (biometricSuccess || biometricError) {
      const timer = setTimeout(() => {
        clearMessages();
      }, 5000);
      return () => clearTimeout(timer);
    }
  }, [biometricSuccess, biometricError, clearMessages]);

  useEffect(() => {
    setIsIframe(window.self !== window.top);
    
    // Check for Passkey/WebAuthn support
    if (typeof window !== 'undefined' && !!window.PublicKeyCredential) {
      setIsPasskeySupported(true);
    } else {
      setIsPasskeySupported(false);
    }
  }, []);

  const handleBiometricLogin = () => {
    // Tenta autenticar diretamente e passa o email informado se houver
    login(() => {
      setViewMode('intentions');
      onLoginSuccess?.();
      const url = new URL(window.location.href);
      if (url.searchParams.has('public')) {
        url.searchParams.delete('public');
        window.history.replaceState({}, document.title, url.pathname + url.search);
      }
    }, magicLinkEmail || undefined);
  };

  useEffect(() => {
    try {
      const stored = JSON.parse(window.localStorage.getItem('recentLogins') || '[]');
      setRecentLogins(stored);
    } catch (e) {
      console.error('Error loading recent logins', e);
    }
  }, []);

  const removeRecent = (email: string) => {
    const updated = recentLogins.filter(e => e !== email);
    setRecentLogins(updated);
    window.localStorage.setItem('recentLogins', JSON.stringify(updated));
  };

  return (
    <div className="min-h-screen bg-black flex flex-col items-center justify-center p-4 relative overflow-hidden">
      <div className="max-w-md w-full relative z-10 space-y-12 animate-in fade-in zoom-in duration-1000">
        <div className="text-center space-y-6">
          <Logo size="lg" className="mx-auto transform hover:scale-110 transition-transform duration-700 drop-shadow-[0_0_30px_rgba(245,196,41,0.3)]" />
          <div className="space-y-2">
            <h1 className="text-5xl font-black text-brand-primary tracking-tighter uppercase leading-none">Guerreiros</h1>
            <p className="text-sm font-bold text-slate-400 uppercase tracking-[0.4em]">Vôlei de Elite</p>
          </div>
        </div>

        <div className="bg-white/5 backdrop-blur-2xl rounded-[2.5rem] shadow-2xl shadow-black/50 p-8 md:p-10 border border-brand-primary/40 space-y-8">
          <div className="space-y-2 text-center">
            <h2 className="text-xl font-black text-white uppercase tracking-tight">
              {isAttendanceMode ? 'Marcar Presença' : 'Acesso ao Club'}
            </h2>
            <p className="text-xs font-bold text-slate-400 uppercase tracking-widest">
              {isAttendanceMode ? 'Use a biometria para confirmar' : 'Entre com seu e-mail de sócio'}
            </p>
          </div>



          {!isAttendanceMode ? (
            <>
              {isIframe && (
                <div className="p-4 bg-slate-900/80 border border-brand-primary/20 rounded-2xl text-[10px] sm:text-[11px] font-black text-amber-400/90 uppercase tracking-widest text-center leading-relaxed animate-pulse">
                  💡 Para usar biometria facial/digital, clique em <span className="text-white underline">"Open in a new tab"</span> no topo direito do AI Studio para abrir fora do iframe!
                </div>
              )}
              <form onSubmit={handleMagicLink} className="space-y-4">
                <div className="space-y-2">
                  <label className="text-[10px] font-black text-brand-primary uppercase tracking-[0.2em] ml-2">E-mail</label>
                  <div className="relative group">
                    <Mail className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-slate-600 group-focus-within:text-brand-primary transition-colors" />
                    <input 
                      type="email"
                      autoComplete="off"
                      placeholder="exemplo@email.com"
                      value={magicLinkEmail}
                      onChange={(e) => setMagicLinkEmail(e.target.value)}
                      className="w-full pl-12 pr-4 py-4 bg-slate-800/50 border border-brand-primary/40 rounded-2xl text-sm font-bold text-white focus:outline-none focus:ring-2 focus:ring-brand-primary/20 focus:border-brand-primary transition-all placeholder:text-slate-600"
                      required
                    />
                  </div>
                </div>

                <button 
                  type="submit"
                  disabled={isSendingMagicLink || isLoggingIn || isBiometricLoading}
                  className="w-full flex items-center justify-center gap-3 px-8 py-5 bg-brand-primary text-brand-secondary rounded-2xl font-black uppercase tracking-widest hover:scale-[1.02] active:scale-[0.98] transition-all shadow-xl shadow-brand-primary/20 disabled:opacity-50 disabled:cursor-not-allowed group"
                >
                  {isSendingMagicLink ? (
                    <RefreshCw className="w-5 h-5 animate-spin" />
                  ) : (
                    <>
                      <LogIn className="w-5 h-5 group-hover:translate-x-1 transition-transform" />
                      Entrar
                    </>
                  )}
                </button>
              </form>

              <div className="relative">
                <div className="absolute inset-0 flex items-center">
                  <div className="w-full border-t border-brand-primary/40"></div>
                </div>
                <div className="relative flex justify-center text-sm">
                  <span className="px-4 bg-transparent text-slate-400 font-black uppercase tracking-widest text-[10px]">Ou</span>
                </div>
              </div>
            </>
          ) : null}

          <button
            onClick={handleGoogleLogin}
            disabled={isLoggingIn || isSendingMagicLink || isBiometricLoading}
            className="w-full flex items-center justify-center gap-3 px-8 py-4 bg-white hover:bg-slate-100 text-black rounded-2xl font-black uppercase tracking-widest transition-all shadow-lg shadow-white/5 disabled:opacity-50 disabled:cursor-not-allowed group active:scale-[0.98] duration-300"
          >
            {isLoggingIn ? (
              <RefreshCw className="w-5 h-5 animate-spin" />
            ) : (
              <>
                <svg className="w-5 h-5" viewBox="0 0 24 24">
                  <path
                     fill="currentColor"
                     d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"
                  />
                  <path
                    fill="currentColor"
                    d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
                  />
                  <path
                    fill="currentColor"
                    d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"
                  />
                  <path
                    fill="currentColor"
                    d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"
                  />
                </svg>
                Entrar com Google
              </>
            )}
          </button>

          {/* GUERREIROS BIOMETRIC ID MODULE */}
          <div className="relative pt-2">
            <div className="absolute inset-0 flex items-center">
              <div className="w-full border-t border-brand-primary/20"></div>
            </div>
            <div className="relative flex justify-center text-sm">
              <span className="px-4 bg-[#0a0a0a] text-brand-primary font-black uppercase tracking-widest text-[9px]">Guerreiros Biometria</span>
            </div>
          </div>

          {isPasskeySupported ? (
            <div className="flex flex-col items-center gap-4 py-2">
              {/* Pulse & Glowing touch targets */}
              <div className="flex justify-center gap-8 py-2 relative">
                <div className="absolute inset-0 bg-brand-primary/10 rounded-full blur-2xl animate-pulse pointer-events-none"></div>
                
                <button
                  type="button"
                  onClick={() => handleBiometricLogin()}
                  disabled={isBiometricLoading || isLoggingIn || isSendingMagicLink}
                  className="relative flex flex-col items-center justify-center w-20 h-20 bg-black border-4 border-brand-primary text-brand-primary rounded-3xl hover:bg-brand-primary/10 active:scale-90 transition-all duration-300 shadow-[0_0_20px_rgba(245,196,41,0.25)] focus:outline-none disabled:opacity-50"
                  aria-label="Acessar com Biometria"
                >
                  {isBiometricLoading ? (
                    <RefreshCw className="w-8 h-8 animate-spin" />
                  ) : (
                    <Fingerprint className="w-9 h-9 animate-pulse" />
                  )}
                </button>

                <button
                  type="button"
                  onClick={() => handleBiometricLogin()}
                  disabled={isBiometricLoading || isLoggingIn || isSendingMagicLink}
                  className="relative flex flex-col items-center justify-center w-20 h-20 bg-black border-4 border-brand-primary text-brand-primary rounded-3xl hover:bg-brand-primary/10 active:scale-90 transition-all duration-300 shadow-[0_0_20px_rgba(245,196,41,0.25)] focus:outline-none disabled:opacity-50"
                  aria-label="Acessar com Face ID"
                >
                  {isBiometricLoading ? (
                    <RefreshCw className="w-8 h-8 animate-spin" />
                  ) : (
                    <ScanFace className="w-9 h-9 opacity-90" />
                  )}
                </button>
              </div>

              {/* Informações de vínculo exibidas próximo ao botão da digital */}
              {biometricSuccess && (
                <div className="w-full text-center py-3 px-4 bg-brand-primary/10 border border-brand-primary/40 rounded-xl text-[10px] font-black text-brand-primary uppercase tracking-wider animate-in fade-in slide-in-from-bottom-2 duration-300">
                  {biometricSuccess}
                </div>
              )}
              
              {biometricError && (
                <div className="w-full text-center py-3 px-4 bg-red-950/40 border border-red-500/40 rounded-xl text-[10px] font-black text-red-200 uppercase tracking-wider animate-in fade-in slide-in-from-bottom-2 duration-300">
                  {biometricError}
                </div>
              )}

              <div className="text-center space-y-1">
                <p className="text-xs font-black text-white uppercase tracking-wider">
                  Reconhecimento Facial / Digital
                </p>
                <p className="text-[10px] text-slate-400 font-medium">
                  Toque na digital para entrar sem senhas usando Face ID ou Leitor do celular.
                </p>
              </div>

              {/* Sub-action to enroll device's biometric key - Sempre acessível */}
              <div className="w-full border-t border-white/5 pt-3 flex flex-col gap-2 items-center">
                <p className="text-[9px] font-bold text-slate-500 uppercase tracking-wider text-center">
                  {hasBiometrics ? 'Dispositivo já vinculado' : 'Ainda não vinculou este dispositivo?'}
                </p>
                <button
                  type="button"
                  onClick={() => {
                    setIsEnrollModalOpen(true);
                  }}
                  disabled={isBiometricLoading || isLoggingIn || isSendingMagicLink}
                  className="px-4 py-2 bg-brand-primary/10 border border-brand-primary/30 hover:border-brand-primary hover:bg-brand-primary/20 rounded-xl text-[9px] font-black text-brand-primary uppercase tracking-widest transition-all active:scale-95 shrink-0"
                >
                  {hasBiometrics ? '🔄 Atualizar Biometria / Face ID' : '🔑 Vincular Biometria do Celular'}
                </button>
              </div>

              {isIframe && (
                <div className="w-full pt-2 flex flex-col gap-2 items-center">
                  <a
                    href={window.location.href}
                    target="_blank"
                    rel="noreferrer"
                    className="w-full text-center py-3 bg-brand-primary text-black rounded-xl font-black uppercase tracking-widest text-[9px] flex items-center justify-center gap-2 hover:scale-[1.02] active:scale-[0.98] transition-all shadow-[0_0_20px_rgba(245,196,41,0.3)]"
                  >
                    🚀 ABRIR EM NOVA ABA (TESTAR BIOMETRIA)
                  </a>
                </div>
              )}
            </div>
          ) : (
            <div className="p-4 bg-slate-900/50 border border-white/10 rounded-2xl text-[10px] text-center text-slate-400 font-bold uppercase tracking-widest">
              Biometria (Passkey) não disponível ou bloqueada no navegador.
            </div>
          )}

          {/* Removed public attendance without login option */}
        </div>

        <div className="flex justify-center gap-8 opacity-20">
          <Swords className="w-6 h-6 text-white" />
          <Trophy className="w-6 h-6 text-white" />
          <ShieldCheck className="w-6 h-6 text-white" />
        </div>
      </div>
      
      {/* MODAL POPUP PARA VINCULAÇÃO REQUISITADA */}
      {isEnrollModalOpen && (
        <div className="fixed inset-0 bg-black/90 backdrop-blur-xl z-50 flex items-center justify-center p-4">
          <div className="bg-black border-2 border-brand-primary/60 rounded-[2rem] max-w-sm w-full p-8 relative shadow-[0_0_50px_rgba(245,196,41,0.25)] space-y-6 animate-in zoom-in-95 duration-200">
            <button
              onClick={() => {
                setIsEnrollModalOpen(false);
                setModalError(null);
              }}
              className="absolute top-5 right-5 text-slate-400 hover:text-brand-primary transition-colors focus:outline-none"
              aria-label="Fechar"
            >
              <X className="w-6 h-6" />
            </button>
            
            <div className="text-center space-y-3">
              <div className="w-24 h-16 rounded-full bg-brand-primary/10 border-2 border-brand-primary/30 flex items-center justify-center gap-2 mx-auto text-brand-primary">
                <Fingerprint className="w-6 h-6 animate-pulse" />
                <ScanFace className="w-6 h-6 opacity-80" />
              </div>
              <h3 className="text-xl font-black text-white uppercase tracking-tight">Vincular Biometria</h3>
              <p className="text-[10px] text-slate-400 font-black uppercase tracking-widest leading-relaxed">
                Insira seu e-mail de sócio cadastrado para vincular a biometria ou reconhecimento facial deste aparelho.
              </p>
            </div>

            {isIframe && (
              <div className="p-3 bg-amber-500/10 border border-amber-500/30 rounded-xl text-[10px] text-amber-300 font-bold text-center">
                Dica: Se o navegador restringir a biometria dentro do preview, abra em uma nova aba pelo botão principal.
              </div>
            )}

            {(modalError || biometricError) && (
              <div className="p-3 bg-red-950/40 border border-red-500/40 rounded-xl text-[10px] font-bold text-red-200 text-center animate-in fade-in">
                {modalError || biometricError}
              </div>
            )}

            <form onSubmit={async (e) => {
              e.preventDefault();
              if (isBiometricLoading) return;
              if (!enrollEmail || !enrollEmail.trim()) {
                setModalError("Por favor, preencha o e-mail de sócio!");
                return;
              }
              setModalError(null);
              const success = await register(enrollEmail.trim());
              if (success) {
                setIsEnrollModalOpen(false);
              }
            }} className="space-y-5">
              <div className="space-y-1">
                <label className="text-[10px] font-black text-brand-primary uppercase tracking-widest ml-1">E-mail de Sócio</label>
                <div className="relative">
                  <Mail className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-500" />
                  <input
                    type="email"
                    autoComplete="off"
                    required
                    placeholder="sócio@email.com"
                    value={enrollEmail}
                    onChange={(e) => {
                      setEnrollEmail(e.target.value);
                      if (modalError) setModalError(null);
                    }}
                    className="w-full pl-11 pr-4 py-4 bg-slate-900 border border-brand-primary/40 rounded-xl text-xs font-bold text-white focus:outline-none focus:ring-2 focus:ring-brand-primary/20 focus:border-brand-primary transition-all placeholder:text-slate-600"
                  />
                </div>
              </div>

              <button
                type="submit"
                disabled={isBiometricLoading}
                className="w-full flex items-center justify-center gap-2 px-4 py-4 bg-brand-primary hover:bg-brand-primary/95 text-black rounded-xl font-black uppercase tracking-widest text-xs hover:scale-[1.02] active:scale-[0.98] transition-all disabled:opacity-50"
              >
                {isBiometricLoading ? (
                  <RefreshCw className="w-5 h-5 animate-spin" />
                ) : (
                  "Confirmar e Registrar"
                )}
              </button>
            </form>
          </div>
        </div>
      )}

      <p className="absolute bottom-8 text-[10px] font-black text-white/20 uppercase tracking-[0.3em]">
        Guerreiros Volleyball Club © 2025
      </p>
    </div>
  );
};