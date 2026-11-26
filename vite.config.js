import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';

// Runs the /api/*.js serverless functions inside the Vite dev server, so
// `npm run dev` works without the Vercel CLI. In production Vercel serves them.
function apiDev() {
  return {
    name: 'api-dev',
    configureServer(server) {
      server.middlewares.use(async (req, res, next) => {
        const m = req.url.match(/^\/api\/([a-z-]+)(\?.*)?$/);
        if (!m) return next();
        try {
          const mod = await server.ssrLoadModule(`/api/${m[1]}.js`);
          const handler = mod[req.method];
          if (!handler) {
            res.statusCode = 405;
            return res.end();
          }
          let body;
          if (!['GET', 'HEAD'].includes(req.method)) {
            body = await new Promise((resolve) => {
              let d = '';
              req.on('data', (c) => (d += c));
              req.on('end', () => resolve(d));
            });
          }
          const headers = {};
          for (const h of ['content-type', 'x-admin-key', 'x-forwarded-for']) if (req.headers[h]) headers[h] = req.headers[h];
          const response = await handler(new Request(`http://${req.headers.host}${req.url}`, { method: req.method, headers, body }));
          res.statusCode = response.status;
          response.headers.forEach((v, k) => res.setHeader(k, v));
          res.end(Buffer.from(await response.arrayBuffer()));
        } catch (e) {
          console.error(e);
          res.statusCode = 500;
          res.end(JSON.stringify({ error: 'dev api error' }));
        }
      });
    },
  };
}

export default defineConfig(({ mode }) => {
  // Expose all .env values (incl. non-VITE_ secrets) to the dev API functions only.
  Object.assign(process.env, loadEnv(mode, process.cwd(), ''));
  if (mode === 'development') process.env.DEV_MEMORY_STORE ??= '1';

  return {
    plugins: [react(), apiDev()],
    // Spotify rejects "localhost" redirect URIs, so bind to the loopback IP.
    server: { host: '127.0.0.1', port: 5173, strictPort: true },
    preview: { host: '127.0.0.1', port: 4173 },
  };
});
