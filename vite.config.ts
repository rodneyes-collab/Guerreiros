/// <reference types="vitest" />
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
        hmr: false,
      },
      plugins: [
        react(), 
        tailwindcss(),
        VitePWA({
          registerType: 'autoUpdate',
          includeAssets: ['logo.png'],
          manifest: {
            name: 'Guerreiros Volleyball Club',
            short_name: 'Guerreiros',
            description: 'Sistema de gestão do Guerreiros Volleyball Club',
            theme_color: '#000000',
            icons: [
              {
                src: 'logo.png',
                sizes: '192x192',
                type: 'image/png',
              }
            ]
          }
        })
      ],
      build: {
        target: 'chrome64',
        outDir: 'dist',
        emptyOutDir: true,
        sourcemap: false,
        rollupOptions: {
          output: {
            manualChunks(id) {
              if (id.includes('node_modules')) {
                if (id.includes('firebase')) return 'vendor-firebase';
                if (id.includes('lucide-react')) return 'vendor-icons';
                if (id.includes('d3') || id.includes('recharts')) return 'vendor-charts';
                if (id.includes('motion') || id.includes('framer-motion')) return 'vendor-motion';
                return 'vendor';
              }
            }
          }
        },
        chunkSizeWarningLimit: 2000,
      },
      base: '/',
      define: {
        'process.env.API_KEY': JSON.stringify(env.GEMINI_API_KEY || ''),
        'process.env.GEMINI_API_KEY': JSON.stringify(env.GEMINI_API_KEY || '')
      },
      resolve: {
        alias: {
          '@': path.resolve(__dirname, 'src')
        }
      },
      test: {
        environment: 'jsdom',
        globals: true,
        include: ['src/**/*.test.ts', 'src/**/*.spec.ts', 'src/**/*.test.tsx', 'src/**/*.spec.tsx']
      }
    };
});
