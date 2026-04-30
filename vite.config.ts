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
          registerType: 'autoUpdate',
          includeAssets: ['logo.svg'],
          manifest: {
            name: 'Guerreiros Volleyball Club',
            short_name: 'Guerreiros VC',
            description: 'Sistema de gestão de clubes de vôlei e geração de times equilibrados.',
            theme_color: '#000000',
            icons: [
              {
                src: 'logo.svg',
                sizes: '192x192',
                type: 'image/svg+xml',
                purpose: 'any'
              },
              {
                src: 'logo.svg',
                sizes: '512x512',
                type: 'image/svg+xml',
                purpose: 'any'
              },
              {
                src: 'logo.svg',
                sizes: '512x512',
                type: 'image/svg+xml',
                purpose: 'maskable'
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
