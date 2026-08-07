import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// Library build: one ES bundle + one stylesheet, with React left external.
// Declarations come from `tsc` (see the build script), so vite must not wipe dist/.
export default defineConfig({
  plugins: [react()],
  build: {
    emptyOutDir: false,
    cssCodeSplit: false,
    lib: {
      entry: fileURLToPath(new URL('./src/index.ts', import.meta.url)),
      formats: ['es'],
      fileName: () => 'zzz-ui.js',
      cssFileName: 'zzz-ui',
    },
    rollupOptions: {
      external: ['react', 'react-dom', 'react/jsx-runtime'],
    },
  },
});
