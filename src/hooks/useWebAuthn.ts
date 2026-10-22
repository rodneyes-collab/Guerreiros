
import { useState } from 'react';
import { startRegistration, startAuthentication } from '@simplewebauthn/browser';
import { auth, db, doc, setDoc, signOut } from '../../firebase';
import { signInAnonymously } from 'firebase/auth';
import { useStore } from '../../store';

const formatWebAuthnError = (e: any): string => {
  const msg = e?.message || String(e || '');
  if (msg.includes('BIOMETRIA_BLOQUEADA_IFRAME') || msg.includes('not enabled in this document') || msg.includes('feature is not enabled')) {
    return "A autenticação biométrica (Passkey) requer execução em aba nativa por segurança do navegador. Use o botão 'ABRIR EM NOVA ABA' no topo!";
  }
  if (e?.name === 'NotAllowedError' || msg.includes('NotAllowedError') || msg.includes('timed out or was not allowed')) {
    return "Leitura biométrica / Face ID cancelada ou expirada. Tente novamente!";
  }
  if (e?.name === 'NotSupportedError' || msg.includes('NotSupportedError')) {
    return "Este dispositivo ou navegador não possui suporte a biometria nativa. Acesse via E-mail ou Google.";
  }
  if (e?.name === 'InvalidStateError' || msg.includes('InvalidStateError')) {
    return "Esta biometria já se encontra cadastrada neste dispositivo.";
  }
  if (msg.includes('Biometria não cadastrada') || msg.includes('404')) {
    return "Nenhuma biometria cadastrada neste dispositivo para este e-mail. Toque em 'Vincular Biometria' abaixo para cadastrar!";
  }
  return msg || "Erro ao processar biometria. Tente novamente.";
};

export const useWebAuthn = () => {
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  const clearMessages = () => {
    setError(null);
    setSuccess(null);
  };

  const register = async (email?: string): Promise<boolean> => {
    setIsLoading(true);
    clearMessages();
    try {
      if (!email || !email.trim()) {
        throw new Error("Por favor, informe seu e-mail de sócio antes de configurar a biometria!");
      }

      const targetEmail = email.trim().toLowerCase();
      
      // Encontra o player correspondente na store local se existir
      const { players } = useStore.getState();
      const matchedPlayer = (players || []).find(p => p.email && p.email.trim().toLowerCase() === targetEmail);
      const playerId = matchedPlayer ? matchedPlayer.id : (targetEmail === "rodneyes@gmail.com" ? "owner_admin" : targetEmail);
      const playerName = matchedPlayer ? matchedPlayer.name : (targetEmail === "rodneyes@gmail.com" ? "Administrador" : targetEmail.split('@')[0]);

      const rpID = window.location.hostname;
      const response = await fetch('/api/auth/webauthn/register/options', { 
        method: 'POST',
        body: JSON.stringify({ rpID, email: targetEmail, playerId, playerName }),
        headers: { 'Content-Type': 'application/json' }
      });
      
      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(errorData.error || `Erro do servidor (${response.status})`);
      }
      
      const options = await response.json();
      if (options.error) {
        throw new Error(options.error);
      }

      const attestationResponse = await startRegistration(options);
      
      const verifyResponse = await fetch('/api/auth/webauthn/register/verify', { 
        method: 'POST',
        body: JSON.stringify({ 
          attestationResponse, 
          challenge: options.challenge, 
          origin: window.location.origin, 
          rpID,
          email: targetEmail
        }),
        headers: { 'Content-Type': 'application/json' }
      });
      
      const verificationResult = await verifyResponse.json();
      if (verificationResult.error) {
        throw new Error(verificationResult.error);
      }

      // Salvamento em Background no Cloud Firestore pelo Navegador (que possui acesso autenticado normal)
      if (verificationResult.credential) {
        try {
          await setDoc(doc(db, "webauthnCredentials", verificationResult.credential.id), verificationResult.credential);
          console.log("[Client WebAuthn] Backed up biometric credential in standard collection.");
          
          await setDoc(doc(db, "metadata", "webauthn_credentials"), {
            [verificationResult.credential.id]: verificationResult.credential
          }, { merge: true });
          console.log("[Client WebAuthn] Backed up biometric credential in unified metadata document.");
        } catch (backupErr) {
          console.warn("[Client WebAuthn] Background Cloud backup bypassed/failed:", backupErr);
        }
      }
      
      window.localStorage.setItem('hasBiometricsLinked', 'true');
      window.localStorage.setItem('simpleLoginEmail', targetEmail);
      setSuccess("Biometria / Face ID registrada com sucesso!");
      return true;
    } catch (e: any) {
      console.error("WebAuthn register error:", e);
      setError(formatWebAuthnError(e));
      return false;
    } finally {
      setIsLoading(false);
    }
  };

  const login = async (onSuccessCallback?: () => void, preferredEmail?: string) => {
    setIsLoading(true);
    clearMessages();
    try {
      const rpID = window.location.hostname;
      const targetEmail = preferredEmail || window.localStorage.getItem('simpleLoginEmail') || undefined;

      const response = await fetch('/api/auth/webauthn/login/options', { 
        method: 'POST',
        body: JSON.stringify({ rpID, email: targetEmail }),
        headers: { 'Content-Type': 'application/json' }
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(errorData.error || `Erro do servidor (${response.status})`);
      }

      const options = await response.json();
      if (options.error) {
        throw new Error(options.error);
      }

      const assertionResponse = await startAuthentication(options);
      
      const verifyResponse = await fetch('/api/auth/webauthn/login/verify', { 
        method: 'POST',
        body: JSON.stringify({ 
          assertionResponse, 
          challenge: options.challenge, 
          origin: window.location.origin, 
          rpID 
        }),
        headers: { 'Content-Type': 'application/json' }
      });
      
      const verificationResult = await verifyResponse.json();
      if (verificationResult.error) {
        throw new Error(verificationResult.error);
      }

      if (verificationResult.verified && verificationResult.email) {
        // Guarde o e-mail no localStorage para que o app logue como esse jogador!
        window.localStorage.setItem('simpleLoginEmail', verificationResult.email);
        window.localStorage.setItem('hasBiometricsLinked', 'true');
        
        // Atualiza a store imediatamente para máxima velocidade de renderização
        const { players, setCurrentPlayer, setUserRole } = useStore.getState();
        const player = (players || []).find(p => p.email && p.email.trim().toLowerCase() === verificationResult.email.trim().toLowerCase());
        if (player) {
          setCurrentPlayer(player);
          const isAdmin = verificationResult.email === "rodneyes@gmail.com" || player.isAdmin;
          setUserRole(isAdmin ? "ADMIN" : "MEMBER");
        } else if (verificationResult.email === "rodneyes@gmail.com") {
          setUserRole("ADMIN");
        }

        let currentAuthUser = auth.currentUser;
        if (!currentAuthUser) {
          try {
            const userCred = await signInAnonymously(auth);
            currentAuthUser = userCred.user;
          } catch (signUpErr) {
            console.log("[WebAuthn] Erro ao logar anonimamente, prosseguindo:", signUpErr);
          }
        }

        // Auto-vincula o dispositivo logo após o login biométrico
        if (player && currentAuthUser) {
          try {
            await fetch(`/api/players/${player.id}/link`, {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ uid: currentAuthUser.uid })
            });
            const updatedPlayer = { ...player, uid: currentAuthUser.uid };
            setCurrentPlayer(updatedPlayer);
            useStore.setState(state => ({
              players: state.players.map(p => p.id === player.id ? updatedPlayer : p)
            }));
          } catch (err) {
            console.error("[WebAuthn] Falha ao auto-vincular dispositivo:", err);
          }
        }

        // Adiciona aos logins recentes
        try {
          const recentLogins = JSON.parse(window.localStorage.getItem('recentLogins') || '[]');
          const newRecent = [verificationResult.email, ...recentLogins.filter((e: string) => e !== verificationResult.email)].slice(0, 3);
          window.localStorage.setItem('recentLogins', JSON.stringify(newRecent));
        } catch (e) {
          console.error('Error saving recent logins from biometrics', e);
        }

        setSuccess("Autenticação biométrica bem-sucedida!");
        if (onSuccessCallback) {
          onSuccessCallback();
        }
      } else {
        setError("Falha na autenticação biométrica.");
      }
    } catch (e: any) {
      console.error("WebAuthn login error:", e);
      setError(formatWebAuthnError(e));
    } finally {
      setIsLoading(false);
    }
  };

  return { register, login, isLoading, error, success, clearMessages };
};

