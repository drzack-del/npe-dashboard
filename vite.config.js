import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { resolve } from 'node:path';

// Serve the app page for /app and anything under it, and the sign-up page for /signup, like
// vercel.json does in production.
const appRoute = {
  name: 'app-route',
  configureServer(server) {
    server.middlewares.use((req, _res, next) => {
      const [path, query = ''] = req.url.split('?');
      if (path === '/app' || (path.startsWith('/app/') && !path.includes('.'))) {
        req.url = '/app/index.html' + (query ? '?' + query : '');
      } else if (path === '/signup' || path === '/signup/') {
        req.url = '/signup/index.html' + (query ? '?' + query : '');
      }
      next();
    });
  },
};

export default defineConfig({
  plugins: [react(), appRoute],
  build: {
    rollupOptions: {
      // Three pages: the public homepage at /, the app (login + dashboard) at /app, and
      // new-practice sign-up at /signup.
      input: {
        home: resolve(__dirname, 'index.html'),
        app: resolve(__dirname, 'app/index.html'),
        signup: resolve(__dirname, 'signup/index.html'),
      },
    },
  },
});
