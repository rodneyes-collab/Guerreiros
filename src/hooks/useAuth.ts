
import { useEffect, useState, useRef } from 'react';
import { 
  auth, 
  onAuthStateChanged, 
  signInWithRedirect,
  getRedirectResult,
  isSignInWithEmailLink, 
  signInWithEmailLink, 
  signOut,
  db, 
  doc, 
  onSnapshot, 
  setDoc, 
  updateDoc,
  OperationType,
  handleFirestoreError,
  setCurrentPlayerId,
  trackAccess,
  getFirestoreDateKey,
  addDoc,
  collection,
  serverTimestamp
} from '../../firebase';
import { useStore } from '../../store';
import { cleanObject } from '../../utils/helpers';
import { Player } from '../../types';

const logLoginAttempt = async (email: string | null, status: 'SUCCESS' | 'FAILURE', error?: string) => {
  try {
    await addDoc(collection(db, 'loginLogs'), {
      email,
      status,
      error: error || null,
      device: navigator.userAgent,
      timestamp: new Date().toISOString(),
      createdAt: serverTimestamp()
    });
  } catch (e) {
    console.error('Sentinel: Failed to log login attempt', e);
  }
};

export const useAuth = () => {
  const user = useStore(state => state.user);
  const userRole = useStore(state => state.userRole);
  const currentPlayer = useStore(state => state.currentPlayer);
  const setUser = useStore(state => state.setUser);
  const setUserRole = useStore(state => state.setUserRole);
  const setCurrentPlayer = useStore(state => state.setCurrentPlayer);
  const players = useStore(state => state.players);
  const showNotification = useStore(state => state.showNotification);

  const [isAuthReady, setIsAuthReady] = useState(false);
  const [isRoleLoading, setIsRoleLoading] = useState(true);

  // Use a ref for players to always have the latest list in the onSnapshot closure without triggering re-runs
  const playersRef = useRef<Player[]>(players);
  useEffect(() => {
    playersRef.current = players;
  }, [players]);

  useEffect(() => {
    console.log('useAuth: Setting up onAuthStateChanged and Redirect Result');
    
    // Handle Redirect Result
    getRedirectResult(auth)
      .then((result) => {
        if (result?.user) {
          console.log('useAuth: Redirect login success', result.user.uid);
          logLoginAttempt(result.user.email, 'SUCCESS');
          showNotification('Login realizado com sucesso!', 'success');
        }
      })
      .catch((error) => {
        console.error('useAuth: Error processing redirect result:', error);
        
        // Storage isolated/blocked environments (like PWAs or iframes) might throw errors on startup check
        const shouldIgnoreError = 
          error.code === 'auth/web-storage-unsupported' || 
          error.code === 'auth/operation-not-supported-in-this-environment' ||
          error.message?.includes('missing initial state') ||
          error.message?.includes('storage-partitioned');
          
        if (!shouldIgnoreError) {
          logLoginAttempt(null, 'FAILURE', error.message);
          if (error.code === 'auth/unauthorized-domain') {
            showNotification('Erro: Domínio não autorizado no Firebase Console.', 'error');
          } else {
            showNotification('Erro ao completar login com Google.', 'error');
          }
        }
      });

    // Handle Magic Link
    if (isSignInWithEmailLink(auth, window.location.href)) {
      let email = window.localStorage.getItem('emailForSignIn');
      if (!email) {
        email = window.prompt('Por favor, confirme seu e-mail para completar o login:');
      }
      if (email) {
        signInWithEmailLink(auth, email, window.location.href)
          .then(() => {
            logLoginAttempt(email, 'SUCCESS');
            window.localStorage.removeItem('emailForSignIn');
            showNotification('Login realizado com sucesso!', 'success');
            window.history.replaceState({}, document.title, window.location.pathname);
          })
          .catch((error) => {
            console.error('Erro ao fazer login com link:', error);
            logLoginAttempt(email, 'FAILURE', error.message);
            showNotification('Link de login inválido ou expirado.', 'error');
          });
      }
    }

    const unsubscribeAuth = onAuthStateChanged(auth, async (u) => {
      console.log('useAuth: onAuthStateChanged fired', u?.uid);
      if (u) {
        setUser(u);
        setIsAuthReady(true);
      } else {
        setUser(null);
        setUserRole(null);
        setIsAuthReady(true);
      }
    });

    return () => {
      unsubscribeAuth();
    };
  }, [setUser, setUserRole, showNotification]);

  // Role Sync and User Doc Subscription
  useEffect(() => {
    if (!user) {
      setIsRoleLoading(false);
      return;
    }

    console.log('useAuth: User changed', user.uid);

    const userRef = doc(db, 'users', user.uid);
    setIsRoleLoading(true);
    const simpleEmail = window.localStorage.getItem('simpleLoginEmail')?.trim().toLowerCase();
    const isMobileDevice = /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent) || window.innerWidth < 768;

    const unsubscribeUserDoc = onSnapshot(userRef, (docSnap) => {
      try {
        const effectiveEmail = user.email?.trim().toLowerCase() || simpleEmail;
        if (docSnap.exists()) {
          const data = docSnap.data();
          let newRole: 'ADMIN' | 'MEMBER' = 'MEMBER';
          
          // Priority 1: Official Owner
          const isOwner = effectiveEmail === 'rodneyes@gmail.com';
          
          // Priority 2: Firestore Role
          const roleFromDoc = data.role;
          
          // Priority 3: Player Profile (checked using ref to avoid loop)
          const playerProfile = effectiveEmail ? playersRef.current.find(p => p.email?.trim().toLowerCase() === effectiveEmail) : null;
          const isAdminFromProfile = playerProfile?.isAdmin === true;

          if (isOwner || roleFromDoc === 'ADMIN' || isAdminFromProfile) {
            newRole = 'ADMIN';
          }
          
          console.log(`[MOBILE AUTH DEBUG] Role validation check on device:`, {
            isMobileDevice,
            userAgent: navigator.userAgent,
            viewport: `${window.innerWidth}x${window.innerHeight}`,
            uid: user.uid,
            email: user.email,
            effectiveEmail,
            isOwner,
            docRole: roleFromDoc,
            isAdminFromProfile,
            validatedRole: newRole,
            isAdminValidated: newRole === 'ADMIN'
          });

          if (userRole !== newRole) {
            setUserRole(newRole);
          }
        } else {
          // New User
          const isOwner = effectiveEmail === 'rodneyes@gmail.com';
          const playerProfile = effectiveEmail ? playersRef.current.find(p => p.email?.trim().toLowerCase() === effectiveEmail) : null;
          const isAdminFromProfile = playerProfile?.isAdmin === true;
          
          const defaultRole = (isOwner || isAdminFromProfile) ? 'ADMIN' : 'MEMBER';
          
          console.info(`[MOBILE AUTH DEBUG] User doc not found, creating default role (${defaultRole}):`, {
            isMobileDevice,
            uid: user.uid,
            email: user.email,
            defaultRole,
            isAdminValidated: defaultRole === 'ADMIN'
          });
          setDoc(userRef, cleanObject({
            uid: user.uid,
            email: user.email || simpleEmail,
            role: defaultRole
          }), { merge: true }).catch(err => {
            console.error('useAuth: Error creating user doc:', err);
          });
          
          if (userRole !== defaultRole) {
            setUserRole(defaultRole);
          }
        }
      } catch (e) {
        console.error('useAuth: Error processing user doc snapshot:', e);
      } finally {
        setIsRoleLoading(false);
      }
    }, (err) => {
      console.error('useAuth: User doc snapshot error:', err);
      if (err.message.includes('permission') && !auth.currentUser) {
        setIsRoleLoading(false);
        return;
      }
      // Don't throw here to avoid crashing the app
      setIsRoleLoading(false);
    });

    return () => {
      console.log('useAuth: Cleaning up user doc listener');
      unsubscribeUserDoc();
    };
  }, [user?.uid, user?.email]); // Removed players to prevent infinite sync loop

  // Link user to player profile
  useEffect(() => {
    if (user && players.length > 0) {
      const urlParams = new URLSearchParams(window.location.search);
      const invitePlayerId = urlParams.get('invite_player_id');

      if (invitePlayerId) {
        const player = players.find(p => p.id === invitePlayerId);
        if (player) {
          if (!player.uid) {
            const playerRef = doc(db, 'players', player.id);
            setDoc(playerRef, { uid: user.uid, email: user.email }, { merge: true })
              .then(() => {
                showNotification(`Perfil de ${player.name} vinculado com sucesso!`, 'success');
                window.history.replaceState({}, document.title, window.location.pathname);
              })
              .catch(console.error);
          } else if (player.uid === user.uid) {
            showNotification('Seu perfil já está vinculado.', 'info');
            window.history.replaceState({}, document.title, window.location.pathname);
          } else {
            showNotification('Este perfil já pertence a outro usuário.', 'error');
          }
        }
      }

      const simpleEmail = window.localStorage.getItem('simpleLoginEmail');
      const player = players.find(p => 
        (user.email && p.email?.trim().toLowerCase() === user.email?.trim().toLowerCase()) || 
        p.uid === user.uid ||
        (simpleEmail && p.email?.trim().toLowerCase() === simpleEmail.trim().toLowerCase())
      );
      if (player) {
        console.log('useAuth: Current player found!', player.name);
        setCurrentPlayer(player);
        setCurrentPlayerId(player.id);
        
        // Track access once per session/day
        const todayKey = getFirestoreDateKey();
        const lastAccessKey = `last_access_tracked_${player.id}_${todayKey}`;
        if (!window.sessionStorage.getItem(lastAccessKey)) {
          trackAccess(player.id);
          window.sessionStorage.setItem(lastAccessKey, 'true');
        }

        if (!player.uid && user.uid) {
          const playerRef = doc(db, 'players', player.id);
          setDoc(playerRef, { uid: user.uid }, { merge: true }).catch(console.error);
        }
      } else {
        console.warn('useAuth: No player found for current user email:', user.email);
      }
    } else {
      setCurrentPlayer(null);
    }
  }, [user, players, setCurrentPlayer, showNotification]);

  // Enforce access control for non-members once players are loaded (to support redirect login flow)
  useEffect(() => {
    if (user && players.length > 0) {
      const urlParams = new URLSearchParams(window.location.search);
      const invitePlayerId = urlParams.get('invite_player_id');
      if (invitePlayerId) return; // Permit linking profile

      const trimmedEmail = user.email?.trim().toLowerCase();
      const isAdminEmail = trimmedEmail === 'rodneyes@gmail.com';
      const player = players.find(p => p.email?.trim().toLowerCase() === trimmedEmail || p.uid === user.uid);
      
      if (!player && !isAdminEmail && user.email) {
        console.warn('useAuth: Non-member/admin access denied. Signing out... email:', user.email);
        signOut(auth).then(() => {
          showNotification('Acesso negado: Este e-mail não está cadastrado como sócio ou administrador.', 'error');
        }).catch(console.error);
      }
    }
  }, [user, players, showNotification]);

  // Admin sync based on player profile
  useEffect(() => {
    if (user && players.length > 0) {
      const simpleEmail = window.localStorage.getItem('simpleLoginEmail')?.trim().toLowerCase();
      const effectiveEmail = user.email?.trim().toLowerCase() || simpleEmail;
      const isAdminEmail = effectiveEmail === 'rodneyes@gmail.com';
      const playerProfile = effectiveEmail ? players.find(p => p.email?.trim().toLowerCase() === effectiveEmail) : null;
      const shouldBeAdmin = isAdminEmail || playerProfile?.isAdmin;

      if (shouldBeAdmin && userRole !== 'ADMIN') {
        setUserRole('ADMIN');
        const userRef = doc(db, 'users', user.uid);
        setDoc(userRef, cleanObject({ role: 'ADMIN', email: user.email || simpleEmail }), { merge: true })
          .catch(err => handleFirestoreError(err, OperationType.WRITE, `users/${user.uid}`));
      }

      // Auto-grant ADMIN role to the server account if an admin logs in
      if (shouldBeAdmin) {
        const serverUid = 'YwBU0W89ktMLB7XY8noA5TuWg9G3';
        const serverRef = doc(db, 'users', serverUid);
        setDoc(serverRef, { role: 'ADMIN' }, { merge: true })
          .then(() => console.log('Server admin role verified'))
          .catch(err => console.error('Failed to verify server admin role', err));
      }
    }
  }, [user, players, userRole, setUserRole]);

  return {
    user,
    userRole,
    currentPlayer,
    isAuthReady,
    isRoleLoading
  };
};
