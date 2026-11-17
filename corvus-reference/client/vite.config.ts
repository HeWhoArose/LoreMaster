import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import path from 'path';

export default defineConfig({
  plugins: [react()],
  root: '.',
  build: {
    outDir: 'dist',
  },
  resolve: {
    alias: {
      '@': path.resolve(__dirname, 'src'),
    },
  },
  server: {
    port: 5173,
    proxy: {
      '/api': {
        target: 'http://localhost:3000',
        changeOrigin: true,
        // Required for SSE streaming — prevent the proxy from buffering responses
        configure: (proxy) => {
          proxy.on('proxyReq', (proxyReq, req) => {
            // If the client accepts event-stream, tell the proxy not to buffer
            if (req.headers.accept?.includes('text/event-stream')) {
              proxyReq.setHeader('Cache-Control', 'no-cache');
              proxyReq.setHeader('Connection', 'keep-alive');
            }
          });
          proxy.on('proxyRes', (proxyRes, req) => {
            if (req.headers.accept?.includes('text/event-stream')) {
              // Disable response buffering for SSE
              proxyRes.headers['cache-control'] = 'no-cache';
              proxyRes.headers['x-accel-buffering'] = 'no';
            }
          });
        },
      },
    },
  },
});
