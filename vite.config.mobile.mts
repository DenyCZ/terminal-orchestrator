import { resolve } from 'path'
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// Mobile Web UI build configuration
// This builds the React mobile app that will be served by the Express server
export default defineConfig({
  plugins: [react()],
  root: resolve(__dirname, 'src/mobile'),
  publicDir: resolve(__dirname, 'src/mobile/public'),
  build: {
    outDir: resolve(__dirname, 'out/mobile'),
    rollupOptions: {
      input: {
        main: resolve(__dirname, 'src/mobile/index.html')
      }
    },
    sourcemap: false,
    minify: 'esbuild',
    target: 'es2020'
  },
  resolve: {
    alias: {
      '@shared': resolve(__dirname, 'src/shared')
    }
  },
  define: {
    // Ensure process.env is available for any node-compatible code
    'process.env': {}
  }
})
