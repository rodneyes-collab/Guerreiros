
// Ensure global availability of Gender before anything else is imported or evaluated
if (typeof window !== 'undefined') {
  (window as any).Gender = (window as any).Gender || { MALE: 'MALE', FEMALE: 'FEMALE' };
}
if (typeof globalThis !== 'undefined') {
  (globalThis as any).Gender = (globalThis as any).Gender || { MALE: 'MALE', FEMALE: 'FEMALE' };
}

import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';
import { ErrorBoundary } from './components/ErrorBoundary';
import './index.css';

console.log('index.tsx: Starting initialization');

// Suppress specific noisy error strings from third-party libraries (Firebase/Vite)
const isNoisyMessage = (args: any[]) => {
  const msg = args.map(arg => {
    try {
      if (typeof arg === 'object' && arg !== null) {
        // Detect if it is an Event or has isTrusted
        if (arg.isTrusted === true || arg instanceof Event || Object.prototype.toString.call(arg) === '[object Event]') {
          return 'istrusted';
        }
        // Avoid JSON.stringify on large objects or snapshots
        if ('docs' in arg || 'size' in arg || 'metadata' in arg) {
          return '[firestore_object]';
        }
        // Limit stringification to small objects
        const str = String(arg);
        if (str === '[object Object]') {
          return '[object]';
        }
        return str;
      }
      return String(arg);
    } catch (e) {
      return 'unstringifiable';
    }
  }).join(' ').toLowerCase();

  return msg.includes('websocket') || 
         msg.includes('closed without opened') || 
         msg.includes('close before opened') ||
         msg.includes('connection reset') ||
         msg.includes('istrusted') ||
         msg.includes('[object event]') ||
         msg.includes('firebase-firestore') && msg.includes('stream');
};

const originalConsoleError = console.error;
const originalConsoleWarn = console.warn;

console.error = (...args) => {
  if (isNoisyMessage(args)) return;
  originalConsoleError.apply(console, args);
};

console.warn = (...args) => {
  if (isNoisyMessage(args)) return;
  originalConsoleWarn.apply(console, args);
};

const rootElement = document.getElementById('root');
if (!rootElement) {
  console.error('index.tsx: Failed to find the root element');
  throw new Error("Could not find root element to mount to");
}

console.log('index.tsx: Root element found, creating root');

// Global Error Handlers
window.addEventListener('unhandledrejection', (event) => {
  // Prevent unhandled promise rejections (like Vite WebSocket disconnects in iframe sandbox, network interruptions, or Event objects) from bubbling as uncaught errors
  if (typeof event.preventDefault === 'function') {
    event.preventDefault();
  }
  
  const reason = event.reason;
  if (!reason) return;

  // Detect if it is a generic Event object or an object with isTrusted: true
  const isEventObject = (typeof reason === 'object' && reason !== null) && 
                        (reason.isTrusted === true || reason instanceof Event || Object.prototype.toString.call(reason) === '[object Event]');
  
  if (isEventObject) {
    // Silently consume generic event rejections
    return;
  }

  const msg = reason.message || String(reason);
  const stringified = (typeof reason === 'object' && reason !== null) ? JSON.stringify(reason) : '';
  
  if (isNoisyMessage([msg]) || isNoisyMessage([stringified])) {
    return;
  }

  // Log unhandled rejections that are NOT noisy, but catch them safely
  console.warn('Unhandled promise rejection caught safely:', msg);
});

window.addEventListener('error', (event) => {
  const msg = event.message || '';
  if (msg.includes('ResizeObserver') || msg.includes('Script error') || isNoisyMessage([msg])) {
    if (typeof event.preventDefault === 'function') {
      event.preventDefault();
    }
    return;
  }
  console.warn('Global error caught safely:', event.error || event.message);
});

const root = ReactDOM.createRoot(rootElement);
console.log('index.tsx: Rendering App');
root.render(
  <React.StrictMode>
    <ErrorBoundary>
      <App />
    </ErrorBoundary>
  </React.StrictMode>
);
console.log('index.tsx: Render call complete');
