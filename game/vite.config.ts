import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { visualizer } from 'rollup-plugin-visualizer'

export default defineConfig(({ mode }) => ({
  build: {
    rolldownOptions: {
      output: {
        codeSplitting: {
          groups: [
            { name: 'firebase-auth', test: /[\\/]node_modules[\\/](firebase[\\/]auth|@firebase[\\/]auth)[\\/]/, priority: 2 },
            { name: 'firebase-firestore', test: /[\\/]node_modules[\\/](firebase[\\/]firestore|@firebase[\\/]firestore)[\\/]/, priority: 2 },
            { name: 'firebase-core', test: /[\\/]node_modules[\\/](firebase|@firebase)[\\/]/ },
            { name: 'react-vendor', test: /[\\/]node_modules[\\/](react|react-dom|scheduler)[\\/]/ }
          ]
        }
      }
    }
  },
  plugins: [
    react(),
    ...(mode === 'analyze' ? [visualizer({
      filename: 'dist/bundle-stats.html',
      open: false,
      gzipSize: true,
      brotliSize: true
    })] : [])
  ]
}))
