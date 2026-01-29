import { defineConfig } from 'vite';
import path from 'path';

export default defineConfig({
  base: './',
  root: 'src/renderer',
  publicDir: '../../assets',
  resolve: {
    alias: {
      '@shared': path.resolve(__dirname, '../shared'),
    },
    extensions: ['.ts', '.mjs', '.js', '.jsx', '.tsx', '.json'],
  },
  server: {
    port: 5173,
    open: true,
  },
  build: {
    outDir: '../../dist-web',
  },
});
