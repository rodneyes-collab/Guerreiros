import path from 'path';
import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import { VitePWA } from 'vite-plugin-pwa';

export default defineConfig(({ mode }) => {
    const env = loadEnv(mode, '.', '');
    return {
      server: {
        port: 3000,
        host: '0.0.0.0',
      },
      plugins: [
        react(), 
        tailwindcss(),
        VitePWA({
          registerType: 'autoUpdate',
          includeAssets: ['logo.png'],
          manifest: {
            name: 'Guerreiros Volei',
            short_name: 'Guerreiros Volei',
            description: 'Sistema de gestão de clubes de vôlei e geração de times equilibrados.',
            theme_color: '#064e3b',
            icons: [
              {
                src: 'logo.png',
                sizes: '192x192',
                type: 'image/png'
              },
              {
                src: 'logo.png',
                sizes: '512x512',
                type: 'image/png'
              },
              {
                src: 'logo.png',
                sizes: '512x512',
                type: 'image/png',
                purpose: 'any maskable'
              }
            ]
          },
          workbox: {
            maximumFileSizeToCacheInBytes: 5 * 1024 * 1024, // 5MB
          }
        })
      ],
      define: {
        'process.env.API_KEY': JSON.stringify(env.GEMINI_API_KEY || ''),
        'process.env.GEMINI_API_KEY': JSON.stringify(env.GEMINI_API_KEY || '')
      },
      resolve: {
        alias: {
          '@': path.resolve(__dirname, '.'),
        }
      }
    };
});
