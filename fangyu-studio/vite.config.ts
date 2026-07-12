import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const CANVAS_SRC = path.resolve(__dirname, '../fangyu-canvas/src')
const CORE_SRC = path.resolve(__dirname, '../fangyu-core/src')

export default defineConfig({
  base: process.env.ELECTRON === '1' ? './' : '/',
  plugins: [react()],
  resolve: {
    alias: {
      '@fangyu/core/platform': path.join(CORE_SRC, 'platform/index.ts'),
      '@fangyu/core/schema': path.join(CORE_SRC, 'schema/index.ts'),
      '@fangyu/core/api': path.join(CORE_SRC, 'api/index.ts'),
      '@fangyu/core': path.join(CORE_SRC, 'index.ts'),
      '@fangyu/canvas': CANVAS_SRC,
      '@': CANVAS_SRC,
    },
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
