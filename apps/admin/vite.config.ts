import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';

const api = process.env.VITE_DEV_API ?? 'http://localhost:3000';

export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    // Même origine que l'API en développement : le cookie de session reste « SameSite=Strict ».
    proxy: {
      '/api': { target: api, changeOrigin: true },
      '/socket.io': { target: api, ws: true, changeOrigin: true },
    },
  },
  build: {
    sourcemap: true,
    chunkSizeWarningLimit: 900,
  },
});
