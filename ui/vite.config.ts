import path from 'node:path'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import { defineConfig } from 'vite'

export default defineConfig({
  plugins: [react(), tailwindcss()],
  server: {
    host: '0.0.0.0',
    port: 5173,
    proxy: {
      '/report-files': {
        target: 'http://localhost:9010',
        // Docker backend signs URLs with the internal MinIO host.
        headers: { host: 'reports:9000' },
        rewrite: (url) => url.replace(/^\/report-files/, ''),
      },
      '/api': {
        target: 'http://localhost:10000',
        changeOrigin: true,
        rewrite: (url) => url.replace(/^\/api/, ''),
      },
    },
  },
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
  build: {
    rollupOptions: {
      output: {
        /* libraries change rarely, so keep them in a separate file:
           UI edits then do not invalidate the whole cache */
        manualChunks: {
          react: ['react', 'react-dom', 'react-router-dom'],
          query: ['@tanstack/react-query', 'axios'],
          forms: ['react-hook-form', 'zod', '@hookform/resolvers/zod'],
        },
      },
    },
  },
})
