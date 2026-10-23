import { defineConfig, loadEnv } from 'vite';

// BASE_PATH: where the app is served from ('/' locally; '/<repo>/' on a GitHub Pages project site, set by the
// Pages workflow). VITE_DATA_URL (read in src/world.js) points the tile fetches at a bucket; see docs/HOSTING.md.
export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '');
  return {
    base: env.BASE_PATH || '/',
    // the watcher polls, so keep it off what never needs a reload: agent and session worktrees (full copies of
    // the repo, each with a link to the baked data), the baked data itself, the bake cache and dependencies
    server: { port: 5173, strictPort: true, watch: { usePolling: true, interval: 300, ignored: ['**/.claude/**', '**/public/data/**', '**/data-cache/**', '**/node_modules/**', '**/dist/**'] } },
    // public/ holds only the baked data: when the app fetches it from a bucket, do not copy 380 MB into dist/
    build: { target: 'es2022', chunkSizeWarningLimit: 1200, copyPublicDir: !env.VITE_DATA_URL },
  };
});
