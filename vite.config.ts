import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  base: './',
  optimizeDeps: { exclude: ['manifold-3d'] },
  build: { chunkSizeWarningLimit: 1500 },
});
