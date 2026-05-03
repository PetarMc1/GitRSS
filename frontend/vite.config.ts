import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  server: {
    port: 3000,
    proxy: {
      '/rss': 'http://localhost:4000',
      '/admin-api': 'http://localhost:4000',
    },
  },
});
