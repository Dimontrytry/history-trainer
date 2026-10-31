import { defineConfig, externalizeDepsPlugin } from 'electron-vite';
import react from '@vitejs/plugin-react';
import { resolve } from 'node:path';

export default defineConfig({
  main: {
    plugins: [externalizeDepsPlugin()],
    build: { rollupOptions: { input: {
      index: resolve('src/main/index.ts'),
      worker: resolve('src/data-process/index.ts'),
      integration: resolve('tests/integration/run.ts')
    } } }
  },
  preload: { plugins: [externalizeDepsPlugin()], build: { rollupOptions: { input: resolve('src/preload/index.ts') } } },
  renderer: { plugins: [react()], root: resolve('src/renderer'), build: { rollupOptions: { input: resolve('src/renderer/index.html') } } }
});
