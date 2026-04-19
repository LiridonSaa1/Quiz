import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import path from 'path';
import {defineConfig, loadEnv} from 'vite';

export default defineConfig(({mode}) => {
  const env = loadEnv(mode, '.', '');
  // When you run the Vite CLI alone (not `npm run dev` / tsx server.ts), the UI has no Express
  // routes — `/api/*` would 404 unless proxied. Default to the usual Express dev port; override
  // with VITE_API_PROXY_TARGET if your API listens elsewhere.
  // Default: API on 5000 (tsx server.ts). Vite dev server uses a different port so /api can proxy to Express
  // without binding the same port twice when you run `vite` and `tsx server.ts` in two terminals.
  const apiProxyTarget = (env.VITE_API_PROXY_TARGET || 'http://127.0.0.1:5000').replace(/\/$/, '');
  return {
    plugins: [react(), tailwindcss()],
    define: {
      'process.env.GEMINI_API_KEY': JSON.stringify(env.GEMINI_API_KEY),
    },
    resolve: {
      alias: {
        '@': path.resolve(__dirname, '.'),
      },
    },
    server: {
      host: '0.0.0.0',
      port: Number(env.VITE_DEV_PORT) || 5173,
      allowedHosts: true,
      hmr: process.env.DISABLE_HMR !== 'true',
      proxy: {
        '/api': {
          target: apiProxyTarget,
          changeOrigin: true,
        },
      },
    },
  };
});
