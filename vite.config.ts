import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    proxy: {
      '/download': 'http://localhost:8000',
      '/downloads': 'http://localhost:8000',
      '/info':      'http://localhost:8000',
      '/edit':      'http://localhost:8000',
      '/health':    'http://localhost:8000',
    },
  },
})
