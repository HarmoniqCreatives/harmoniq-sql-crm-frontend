import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { firebaseMessagingSwPlugin } from './vite-plugin-firebase-sw.js'

export default defineConfig({
  plugins: [react(), firebaseMessagingSwPlugin()],
  server: {
    port: 5174,
    proxy: {
      '/api': {
        target: 'http://127.0.0.1:5001',
        changeOrigin: true,
      },
    },
  },
})
