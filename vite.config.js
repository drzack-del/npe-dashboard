import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { resolve } from 'node:path';

// Serve the app page for /app and anything under it, like vercel.json does in production.
const appRoute = {
  name: 'app-route',
  configureServer(server) {
    server.middlewares.use((req, _res, next) => {
      const [path, query = ''] = req.url.split('?');
      if (path === '/app' || (path.startsWith('/app/') && !path.includes('.'))) {
        req.url = '/app/index.html' + (query ? '?' + query : '');
      }
      next();
    });
  },
};

export default defineConfig({
  plugins: [react(), appRoute],
  build: {
    rollupOptions: {
      // Two pages: the public homepage at / and the app (login + dashboard) at /app.
      input: {
        home: resolve(__dirname, 'index.html'),
        app: resolve(__dirname, 'app/index.html'),
      },
    },
  },
});
