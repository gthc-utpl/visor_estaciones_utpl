import path from 'path';
import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, '.', '');
  const supabaseTarget = env.VITE_SUPABASE_URL || 'https://njchhtssnvvqvklwesni.supabase.co';

  return {
    server: {
      port: 5173,
      host: '0.0.0.0',
      allowedHosts: true,
      proxy: {
        '/api': {
          target: process.env.VITE_API_URL || 'http://localhost:8004',
          changeOrigin: true,
          secure: false,
          rewrite: (path) => path.replace(/^\/api/, ''),
        },
        // Proxy for Supabase Auth API
        '/sb-auth': {
          target: supabaseTarget,
          changeOrigin: true,
          secure: true,
          rewrite: (path) => path.replace(/^\/sb-auth/, '/auth'),
          configure: (proxy) => {
            proxy.on('error', (err) => {
              console.log('⚠️ Proxy sb-auth error:', err.message);
            });
            proxy.on('proxyReq', (proxyReq, req) => {
              console.log(`📡 Proxy: ${req.method} ${req.url} → ${supabaseTarget}`);
            });
            proxy.on('proxyRes', (proxyRes, req) => {
              console.log(`📡 Proxy response: ${proxyRes.statusCode} for ${req.url}`);
            });
          },
        },
        // Proxy for Supabase REST API (profiles, etc.)
        '/sb-rest': {
          target: supabaseTarget,
          changeOrigin: true,
          secure: true,
          rewrite: (path) => path.replace(/^\/sb-rest/, '/rest'),
          configure: (proxy) => {
            proxy.on('error', (err) => {
              console.log('⚠️ Proxy sb-rest error:', err.message);
            });
          },
        },
      },
    },
    plugins: [react()],

    resolve: {
      alias: {
        '@': path.resolve(__dirname, '.'),
      }
    }
  };
});
