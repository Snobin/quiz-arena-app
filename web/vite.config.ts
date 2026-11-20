import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';
import { VitePWA } from 'vite-plugin-pwa';

// Local dev talks to the Compose stack through Caddy on :8080.
const CADDY = 'http://localhost:8080';

export default defineConfig({
  plugins: [
    react(),
    tailwindcss(),
    VitePWA({
      registerType: 'autoUpdate',
      includeAssets: ['icon.svg'],
      manifest: {
        name: 'Minnal',
        short_name: 'Minnal',
        description: 'Live Kerala PSC quiz battles',
        lang: 'ml',
        start_url: '/',
        scope: '/',
        display: 'standalone',
        // No portrait lock (EXPERIENCE.md › Responsive & Platform).
        orientation: 'any',
        background_color: '#ffffff',
        theme_color: '#111111',
        icons: [{ src: 'icon.svg', sizes: 'any', type: 'image/svg+xml', purpose: 'any' }],
      },
      workbox: {
        // App shell only: never cache /api/** or /ws (AD-18).
        globPatterns: ['**/*.{js,css,html,svg,woff2}'],
        // The lazy admin chunk is for admins only: players never download it, not even through the precache.
        globIgnores: ['**/AdminApp-*.js'],
        navigateFallbackDenylist: [/^\/api\//, /^\/ws/],
        runtimeCaching: [],
      },
    }),
  ],
  build: {
    // dist/.vite/manifest.json: check:dist walks the entry chunk's static imports for the JS budget.
    manifest: true,
  },
  server: {
    port: 5173,
    strictPort: true,
    proxy: {
      '/api/core': { target: CADDY, changeOrigin: true },
      '/api/ratings': { target: CADDY, changeOrigin: true },
      '/ws': { target: CADDY, ws: true },
    },
  },
});
