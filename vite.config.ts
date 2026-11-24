import path from 'path';
import { fileURLToPath } from 'url';
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import { VitePWA } from 'vite-plugin-pwa';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

export default defineConfig(() => {
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
          injectRegister: 'auto',
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
          },
          workbox: {
            cleanupOutdatedCaches: true,
            clientsClaim: true,
            skipWaiting: true,
            globPatterns: ['**/*.{js,css,html,png,ico,webmanifest}'],
            globIgnores: ['**/fonts/**', '**/assets/aistudio/**'],
            maximumFileSizeToCacheInBytes: 5 * 1024 * 1024,
            navigateFallbackDenylist: [/^\/api/],
            runtimeCaching: [
              {
                urlPattern: ({ url }) => url.pathname === '/' || url.pathname === '/index.html',
                handler: 'NetworkFirst',
                options: {
                  cacheName: 'html-cache',
                  expiration: {
                    maxEntries: 1,
                  },
                },
              },
              {
                urlPattern: ({ url }) => url.pathname.startsWith('/api/'),
                handler: 'NetworkOnly',
              }
            ]
          }
        })
      ],
      build: {
        target: 'es2020',
        outDir: 'dist',
        emptyOutDir: true,
        sourcemap: false,
        minify: 'esbuild' as const,
        cssMinify: 'lightningcss' as const,
        reportCompressedSize: false,
        rollupOptions: {
          output: {
            manualChunks: {
              'vendor-react': ['react', 'react-dom'],
              'vendor-firebase': ['firebase/app', 'firebase/auth', 'firebase/firestore']
            }
          }
        },
        chunkSizeWarningLimit: 2000,
      },
      base: '/',
      resolve: {
        dedupe: ['react', 'react-dom'],
        alias: {
          '@': path.resolve(__dirname, 'src')
        }
      },
      optimizeDeps: {
        include: ['react', 'react-dom']
      }
    };
});
