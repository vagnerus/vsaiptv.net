import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  build: {
    chunkSizeWarningLimit: 600,
    rollupOptions: {
      output: {
        manualChunks(id) {
          if (id.includes('node_modules/hls.js')) {
            return 'vendor-hls';
          }
          if (id.includes('node_modules/lucide-react')) {
            return 'vendor-icons';
          }
        }
      }
    }
  },
  server: {
    port: 3000,
    proxy: {
      '/api': 'http://localhost:5000',
      '/player_api.php': 'http://localhost:5000',
      '/get.php': 'http://localhost:5000',
      '/xmltv.php': 'http://localhost:5000',
      '/live': 'http://localhost:5000',
      '/movie': 'http://localhost:5000',
      '/series': 'http://localhost:5000',
      '/tracker': {
        target: 'ws://localhost:5000',
        ws: true
      }
    }
  }
})
