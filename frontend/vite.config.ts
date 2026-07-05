import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  test: {
    exclude: ['e2e/**', 'node_modules/**'],
  },
  server: {
    port: 5173,
    proxy: {
      '/api': {
        target: 'http://localhost:8000',
        changeOrigin: true,
      },
    },
  },
  build: {
    chunkSizeWarningLimit: 600,
    rollupOptions: {
      output: {
        manualChunks(id: string) {
          if (id.includes('node_modules/react-dom') || id.includes('node_modules/react/') || id.includes('node_modules/react-redux') || id.includes('node_modules/@reduxjs/toolkit')) return 'vendor-react'
          if (id.includes('node_modules/reactflow')) return 'vendor-flow'
          if (id.includes('node_modules/codemirror') || id.includes('node_modules/@codemirror')) return 'vendor-cm'
        },
      },
    },
  },
})
