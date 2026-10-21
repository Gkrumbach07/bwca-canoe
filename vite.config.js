import { defineConfig } from 'vite';

export default defineConfig({
  server: { port: 5173, strictPort: true, watch: { usePolling: true, interval: 300 } },
  build: { target: 'es2022' },
});
