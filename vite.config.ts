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
  // Default 5001: `npm run dev` often falls back from 5000 (EACCES/EADDRINUSE). Override with VITE_API_PROXY_TARGET in .env.
  const apiProxyTarget = (env.VITE_API_PROXY_TARGET || 'http://127.0.0.1:5001').replace(/\/$/, '');
  const devPort = Number(env.VITE_DEV_PORT) || 5173;
  const disableHmr = process.env.DISABLE_HMR === 'true';
  const hmrHost = env.VITE_HMR_HOST || undefined;
  const hmrPort = Number(env.VITE_HMR_PORT) || undefined;
  const hmrClientPort = Number(env.VITE_HMR_CLIENT_PORT) || undefined;
  const isReplit = !!(process.env.REPL_ID || process.env.REPLIT_DEV_DOMAIN);
  return {
    plugins: [react(), tailwindcss()],
    resolve: {
      alias: {
        '@': path.resolve(__dirname, '.'),
      },
    },
    server: {
      host: '0.0.0.0',
      port: devPort,
      allowedHosts: true,
      hmr: disableHmr
        ? false
        : isReplit
        ? {
            clientPort: 443,
            protocol: 'wss',
          }
        : hmrHost
        ? {
            host: hmrHost,
            port: hmrPort,
            clientPort: hmrClientPort,
            protocol: 'wss',
          }
        : {
            clientPort: 443,
            protocol: 'wss',
          },
      proxy: {
        '/api': {
          target: apiProxyTarget,
          changeOrigin: true,
        },
      },
    },
  };
});
