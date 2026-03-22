import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import electron from 'vite-plugin-electron/simple'

export default defineConfig({
  plugins: [
    react(),
    electron({
      main: {
        entry: 'electron/main.js',
        onstart(args) {
          args.startup()
        },
        vite: {
          build: {
            outDir: 'dist-electron',
            rollupOptions: {
              output: {
                entryFileNames: '[name].js',
              },
            },
          },
        },
      },
      preload: {
        input: 'electron/preload.js',
        vite: {
          build: {
            outDir: 'dist-electron',
            rollupOptions: {
              output: {
                format: 'cjs',
                entryFileNames: '[name].js',
              },
            },
          },
        },
      },
      renderer: {},
    }),
  ],
  clearScreen: false,
})
