importScripts('https://www.gstatic.com/firebasejs/9.23.0/firebase-app-compat.js');
importScripts('https://www.gstatic.com/firebasejs/9.23.0/firebase-messaging-compat.js');

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
  const notificationOptions = {
    body: payload.notification?.body,
    icon: '/logo.svg'
  };

  self.registration.showNotification(notificationTitle, notificationOptions);
});
