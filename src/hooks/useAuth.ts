
import { useEffect, useState } from 'react';
import { 
  auth, 
  onAuthStateChanged, 
  signInWithRedirect,
  getRedirectResult,
  isSignInWithEmailLink, 
  signInWithEmailLink, 
  db, 
  doc, 
  onSnapshot, 
  setDoc, 
  updateDoc,
  OperationType,
  handleFirestoreError
} from '../../firebase';
import { useStore } from '../../store';
import { cleanObject } from '../../utils/helpers';
import { Player } from '../../types';

export const useAuth = () => {
  const { 
    user,
    userRole,
    currentPlayer,
    setUser, 
    setUserRole, 
    setCurrentPlayer, 
    players, 
    showNotification 
  } = useStore();

  const [isAuthReady, setIsAuthReady] = useState(false);
  const [isRoleLoading, setIsRoleLoading] = useState(true);

  useEffect(() => {
    console.log('useAuth: Setting up onAuthStateChanged and Redirect Result');
    
    // Handle Redirect Result
    getRedirectResult(auth)
      .then((result) => {
        if (result?.user) {
          console.log('useAuth: Redirect login success', result.user.uid);
          showNotification('Login realizado com sucesso!', 'success');
        }
      })
      .catch((error) => {
        console.error('useAuth: Error processing redirect result:', error);
        if (error.code === 'auth/unauthorized-domain') {
          showNotification('Erro: Domínio não autorizado no Firebase Console.', 'error');
        } else {
          showNotification('Erro ao completar login com Google.', 'error');
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
            window.localStorage.removeItem('emailForSignIn');
            showNotification('Login realizado com sucesso!', 'success');
            window.history.replaceState({}, document.title, window.location.pathname);
          })
          .catch((error) => {
            console.error('Erro ao fazer login com link:', error);
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
        // Check for member session
        const storedMember = window.localStorage.getItem('memberUser');
        console.log('useAuth: Checking localStorage for memberUser', !!storedMember);
        if (storedMember) {
          try {
            const memberData = JSON.parse(storedMember);
            setUser(memberData);
          } catch (e) {
            console.error('useAuth: Error parsing memberUser', e);
            setUser(null);
          }
        } else {
          setUser(null);
        }
        setIsAuthReady(true);
      }
      if (!u && !window.localStorage.getItem('memberUser')) {
        setUserRole(null);
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

    // Mock member/admin role
    if (user.uid?.startsWith('member_') || user.uid?.startsWith('admin_')) {
      console.log('useAuth: Member/Admin login detected');
      const isAdminEmail = user.email?.toLowerCase() === 'rodneyes@gmail.com';
      const playerProfile = players.find(p => p.email?.toLowerCase() === user.email?.toLowerCase());
      
      const newRole = (isAdminEmail || playerProfile?.isAdmin) ? 'ADMIN' : 'MEMBER';
      if (userRole !== newRole) {
        setUserRole(newRole);
      }
      setIsRoleLoading(false);
      return;
    }

    const userRef = doc(db, 'users', user.uid);
    setIsRoleLoading(true);
    const unsubscribeUserDoc = onSnapshot(userRef, (docSnap) => {
      try {
        if (docSnap.exists()) {
          const data = docSnap.data();
          let newRole: 'ADMIN' | 'MEMBER' = 'MEMBER';
          if (user.email?.toLowerCase() === 'rodneyes@gmail.com') {
            newRole = 'ADMIN';
          } else {
            newRole = data.role || 'MEMBER';
          }
          
          if (userRole !== newRole) {
            setUserRole(newRole);
          }
        } else {
          const defaultRole = user.email?.toLowerCase() === "rodneyes@gmail.com" ? 'ADMIN' : 'MEMBER';
          console.info('useAuth: User doc not found, creating default role:', defaultRole);
          setDoc(userRef, cleanObject({
            uid: user.uid,
            email: user.email,
            role: defaultRole
          }), { merge: true }).catch(err => {
            console.error('useAuth: Error creating user doc:', err);
            // Non-fatal, we already set the role locally
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
  }, [user?.uid, user?.email]); // Only depend on user identity

  // Separate effect for mock role updates when players change
  useEffect(() => {
    if (user && (user.uid?.startsWith('member_') || user.uid?.startsWith('admin_'))) {
      const isAdminEmail = user.email?.toLowerCase() === 'rodneyes@gmail.com';
      const playerProfile = players.find(p => p.email?.toLowerCase() === user.email?.toLowerCase());
      const newRole = (isAdminEmail || playerProfile?.isAdmin) ? 'ADMIN' : 'MEMBER';
      
      if (userRole !== newRole) {
        setUserRole(newRole);
      }
    }
  }, [players, user, userRole, setUserRole]);

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

      const player = players.find(p => p.email?.toLowerCase() === user.email?.toLowerCase() || p.uid === user.uid);
      if (player) {
        setCurrentPlayer(player);
        if (!player.uid) {
          const playerRef = doc(db, 'players', player.id);
          setDoc(playerRef, { uid: user.uid }, { merge: true }).catch(console.error);
        }
      }
    } else {
      setCurrentPlayer(null);
    }
  }, [user, players, setCurrentPlayer, showNotification]);

  // Admin sync based on player profile
  useEffect(() => {
    if (user && players.length > 0) {
      const isAdminEmail = user.email?.toLowerCase() === 'rodneyes@gmail.com';
      const playerProfile = players.find(p => p.email?.toLowerCase() === user.email?.toLowerCase());
      const shouldBeAdmin = isAdminEmail || playerProfile?.isAdmin;

      if (shouldBeAdmin && userRole !== 'ADMIN') {
        setUserRole('ADMIN');
        const userRef = doc(db, 'users', user.uid);
        setDoc(userRef, cleanObject({ role: 'ADMIN', email: user.email }), { merge: true })
          .catch(err => handleFirestoreError(err, OperationType.WRITE, `users/${user.uid}`));
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
