import { defineConfig, loadEnv } from 'vite';

// BASE_PATH: where the app is served from ('/' locally; '/<repo>/' on a GitHub Pages project site, set by the
// Pages workflow). VITE_DATA_URL (read in src/world.js) points the tile fetches at a bucket; see docs/HOSTING.md.
export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '');
  return {
    base: env.BASE_PATH || '/',
    server: { port: 5173, strictPort: true, watch: { usePolling: true, interval: 300 } },
    // public/ holds only the baked data: when the app fetches it from a bucket, do not copy 380 MB into dist/
    build: { target: 'es2022', chunkSizeWarningLimit: 1200, copyPublicDir: !env.VITE_DATA_URL },
  };
});
