import path from 'path';
import { fileURLToPath } from 'url';
import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';

import { VitePWA } from 'vite-plugin-pwa';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

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
          // @ts-ignore
          updateViaCache: 'all',
          registerType: 'prompt',
          includeAssets: ['logo.png', 'fonts/*.ttf'],
          workbox: {
            maximumFileSizeToCacheInBytes: 5 * 1024 * 1024 // 5MB
          },
          manifest: {
            name: 'Guerreiros - Vôlei de Elite',
            short_name: 'Guerreiros',
            description: 'Aplicativo de Gestão de Vôlei - Guerreiros',
            theme_color: '#000000',
            background_color: '#000000',
            display: 'standalone',
            icons: [
              {
                src: 'logo.png',
                sizes: '192x192',
                type: 'image/png',
                purpose: 'any maskable'
              },
              {
                src: 'logo.png',
                sizes: '512x512',
                type: 'image/png',
                purpose: 'any maskable'
              }
            ]
          }
        })
      ],
      build: {
        outDir: 'dist'
      },
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
