import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';
import { VitePWA } from 'vite-plugin-pwa';

const apiProxy = {
  '/api': { target: process.env.ANBU_API_URL ?? 'http://localhost:4000', changeOrigin: false },
};

export default defineConfig({
  plugins: [
    react(),
    tailwindcss(),
    VitePWA({
      registerType: 'prompt',
      injectRegister: false,
      includeAssets: ['favicon.svg', 'apple-touch-icon-180x180.png', 'favicon.ico'],
      manifest: {
        id: '/',
        name: 'Anbu - a companion who listens',
        short_name: 'Anbu',
        description: 'A gentle, private space to talk whenever you need someone to listen. Anbu is an AI companion.',
        lang: 'en',
        start_url: '/',
        scope: '/',
        display: 'standalone',
        orientation: 'portrait',
        background_color: '#FBF6EE',
        theme_color: '#FBF6EE',
        categories: ['health', 'lifestyle'],
        icons: [
          { src: 'pwa-64x64.png', sizes: '64x64', type: 'image/png' },
          { src: 'pwa-192x192.png', sizes: '192x192', type: 'image/png' },
          { src: 'pwa-512x512.png', sizes: '512x512', type: 'image/png' },
          { src: 'maskable-icon-512x512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
        ],
      },
      workbox: {
        // Only the app shell is cached. API responses (conversations, settings) never are.
        globPatterns: ['**/*.{js,css,html,svg,png,ico,woff2}'],
        // Font subsets the app never uses (Indian scripts use system fonts).
        globIgnores: ['**/*-cyrillic*', '**/*-greek*', '**/*-vietnamese*'],
        navigateFallback: '/index.html',
        navigateFallbackDenylist: [/^\/api\//],
        runtimeCaching: [],
        cleanupOutdatedCaches: true,
      },
    }),
  ],
  server: { port: 5173, proxy: apiProxy },
  preview: { port: 4173, proxy: apiProxy },
  build: { target: 'es2022', sourcemap: false },
});
