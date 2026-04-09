import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import path from 'path';
import {defineConfig, loadEnv} from 'vite';

export default defineConfig(({mode}) => {
  const env = loadEnv(mode, '.', '');
  // When you run the Vite CLI alone (not `npm run dev` / tsx server.ts), the UI has no Express
  // routes — `/api/*` would 404 unless proxied. Default to the usual Express dev port; override
  // with VITE_API_PROXY_TARGET if your API listens elsewhere.
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
      port: 5000,
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
