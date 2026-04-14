importScripts('https://www.gstatic.com/firebasejs/10.8.0/firebase-app-compat.js');
importScripts('https://www.gstatic.com/firebasejs/10.8.0/firebase-messaging-compat.js');

const firebaseConfig = {
  projectId: "volleyclub-manager",
  appId: "1:238897290870:web:d2226b2375996408254957",
  apiKey: "AIzaSyAFHrfcQKfl1MMEH97JFujGvZ4ngvsCVys",
  authDomain: "volleyclub-manager.firebaseapp.com",
  storageBucket: "volleyclub-manager.firebasestorage.app",
  messagingSenderId: "238897290870"
};

firebase.initializeApp(firebaseConfig);

const messaging = firebase.messaging();

messaging.onBackgroundMessage((payload) => {
  console.log('[firebase-messaging-sw.js] Received background message ', payload);
  
  const notificationTitle = payload.notification?.title || 'Sua vez de jogar!';
  const notificationOptions = {
    body: payload.notification?.body || 'Dirija-se à quadra. O jogo vai começar!',
    icon: '/pwa-192x192.png',
    vibrate: [200, 100, 200, 100, 200, 100, 200],
    tag: 'match-start',
    renotify: true
  };

  self.registration.showNotification(notificationTitle, notificationOptions);
});
