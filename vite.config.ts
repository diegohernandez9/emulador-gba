import { defineConfig } from 'vite';
import { VitePWA } from 'vite-plugin-pwa';

// Por defecto se sirve desde la raiz del dominio. Un hosting que publique bajo
// un subdirectorio necesita BASE_PATH=/subdirectorio/ (GitHub Pages, por ejemplo).
const base = process.env.BASE_PATH ?? '/';

// mGBA usa threads, por lo que la pagina necesita aislamiento de origen cruzado
// (SharedArrayBuffer). Las manda el servidor: en dev estos headers, en produccion
// public/_headers. WebKit descarta las que anade un service worker, asi que un
// hosting que no permita cabeceras propias no sirve para esta app.
const crossOriginIsolation = {
  'Cross-Origin-Opener-Policy': 'same-origin',
  'Cross-Origin-Embedder-Policy': 'require-corp',
};

export default defineConfig({
  base,
  server: { headers: crossOriginIsolation, host: true },
  preview: { headers: crossOriginIsolation, host: true },
  worker: { format: 'es' },
  build: { target: 'es2022' },
  plugins: [
    VitePWA({
      strategies: 'injectManifest',
      srcDir: 'src',
      filename: 'sw.ts',
      registerType: 'autoUpdate',
      injectManifest: {
        globPatterns: ['**/*.{js,css,html,wasm,png,svg,webmanifest}'],
        // El core wasm pesa ~1.9 MB y tiene que entrar al precache.
        maximumFileSizeToCacheInBytes: 12 * 1024 * 1024,
      },
      devOptions: { enabled: false, type: 'module' },
      manifest: {
        name: 'Emulador GBA',
        short_name: 'GBA',
        description: 'Emulador de Game Boy Advance instalable, funciona sin conexion',
        lang: 'es',
        start_url: base,
        scope: base,
        display: 'standalone',
        orientation: 'any',
        background_color: '#0b0d12',
        theme_color: '#0b0d12',
        icons: [
          { src: `${base}icons/icon-192.png`, sizes: '192x192', type: 'image/png', purpose: 'any' },
          { src: `${base}icons/icon-512.png`, sizes: '512x512', type: 'image/png', purpose: 'any' },
          { src: `${base}icons/icon-maskable-512.png`, sizes: '512x512', type: 'image/png', purpose: 'maskable' },
        ],
      },
    }),
  ],
});
