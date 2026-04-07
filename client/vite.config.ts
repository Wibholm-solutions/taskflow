import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import { VitePWA } from 'vite-plugin-pwa';

const basePath = process.env.BASE_PATH || '/';
const base = basePath === '/' ? '/' : `${basePath}/`;

export default defineConfig({
  root: 'client',
  base,
  plugins: [
    react(),
    tailwindcss(),
    VitePWA({
      registerType: 'autoUpdate',
      scope: base,
      manifest: {
        name: 'TaskFlow',
        short_name: 'TaskFlow',
        start_url: base,
        scope: base,
        display: 'standalone',
        background_color: '#111827',
        theme_color: '#3b82f6',
        icons: [
          { src: `${base}icon-192.png`, sizes: '192x192', type: 'image/png' },
          { src: `${base}icon-512.png`, sizes: '512x512', type: 'image/png' },
        ],
      },
      workbox: {
        globPatterns: ['**/*.{js,css,html,png,svg,ico}'],
        navigateFallback: `${base}index.html`,
        runtimeCaching: [
          {
            urlPattern: new RegExp(`${basePath.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}/api/`),
            handler: 'NetworkFirst',
            options: {
              cacheName: 'api-cache',
              expiration: { maxEntries: 50, maxAgeSeconds: 300 },
              backgroundSync: {
                name: 'taskflow-sync-queue',
                options: { maxRetentionTime: 24 * 60 },
              },
            },
          },
        ],
      },
    }),
  ],
  build: {
    outDir: '../dist/client',
    emptyOutDir: true,
  },
  server: {
    port: 5173,
    proxy: {
      [`${basePath === '/' ? '' : basePath}/api`]: {
        target: 'http://localhost:3000',
        changeOrigin: true,
      },
    },
  },
});
