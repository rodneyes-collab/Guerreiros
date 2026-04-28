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
  
  const notificationTitle = payload.notification?.title || 'Notificação';
  const notificationBadgeCount = payload.data?.unreadCount ? parseInt(payload.data.unreadCount) : undefined;
  
  const notificationOptions = {
    body: payload.notification?.body || 'Nova mensagem',
    icon: '/pwa-192x192.png',
    badge: '/pwa-192x192.png', // Small icon for the status bar
    vibrate: [200, 100, 200, 100, 200, 100, 200],
    tag: payload.notification?.tag || payload.data?.type || 'app-notification-' + Date.now(),
    renotify: true,
    data: payload.data
  };

  if (self.navigator && self.navigator.setAppBadge && notificationBadgeCount) {
    self.navigator.setAppBadge(notificationBadgeCount);
  } else if (self.navigator && self.navigator.setAppBadge) {
    self.navigator.setAppBadge(); // Shows generic dot
  }

  self.registration.showNotification(notificationTitle, notificationOptions);
});
