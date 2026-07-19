import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const CANVAS_SRC = path.resolve(__dirname, '../fangyu-canvas/src')
const CORE_SRC = path.resolve(__dirname, '../fangyu-core/src')

export default defineConfig({
  // TAURI 打包用相对路径；生产挂在 /fangyu/ 时设 BASE_PATH=/fangyu/
  base: process.env.TAURI === '1' ? './' : (process.env.BASE_PATH || '/'),
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
    host: '127.0.0.1',
    port: 5173,
    strictPort: true,
    proxy: {
      '/api': {
        target: 'http://127.0.0.1:8000',
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
