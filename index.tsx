
import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';
import { ErrorBoundary } from './components/ErrorBoundary';
import './index.css';

console.log('index.tsx: Starting initialization');
const rootElement = document.getElementById('root');
if (!rootElement) {
  console.error('index.tsx: Failed to find the root element');
  throw new Error("Could not find root element to mount to");
}

console.log('index.tsx: Root element found, creating root');

// Global Error Handlers
window.addEventListener('unhandledrejection', (event) => {
  console.error('Unhandled promise rejection:', event.reason);
  // Log more details if needed, but avoid crashing the app
});

window.addEventListener('error', (event) => {
  console.error('Global JS error:', event.error || event.message);
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
