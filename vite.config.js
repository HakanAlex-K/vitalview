import { defineConfig, loadEnv } from 'vite';
export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), 'PORT');
  const target = `http://127.0.0.1:${process.env.PORT || env.PORT || 8787}`;
  return {
    root: 'web',
    base: './',
    // The browser uses runtime API settings; never embed local environment secrets.
    envPrefix: [],
    publicDir: false,
    build: { outDir: '../dist', emptyOutDir: true, sourcemap: false },
    server: { proxy: { '/api': target, '/glucose': target } },
  };
});
