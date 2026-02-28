import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import path from 'path'

export default defineConfig(({ mode }) => ({
  plugins: [react()],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
      // Stub Monaco only in test so dev/build use the real editor
      ...(mode === 'test' && {
        '@monaco-editor/react': path.resolve(__dirname, './src/test/mocks/monaco-editor-react.jsx'),
      }),
    },
  },
  server: {
    port: 5173,
    host: true,
  },
  build: {
    outDir: 'dist',
    sourcemap: false,
    rollupOptions: {
      output: {
        manualChunks: {
          'react-vendor': ['react', 'react-dom', 'react-router-dom'],
        },
      },
    },
  },
  test: {
    globals: true,
    environment: 'jsdom',
    setupFiles: './src/test/setup.js',
    coverage: {
      provider: 'v8',
      reporter: ['text', 'json', 'html'],
      exclude: [
        'node_modules/',
        'src/test/',
        'dist/',
        '**/*.config.js',
        '**/*.config.cjs',
        '.eslintrc.cjs',
      ],
      // Coverage thresholds for PRs. Raise toward 100 as coverage improves.
      thresholds: {
        statements: 26,
        branches: 70,
        functions: 54,
        lines: 26,
      },
    },
  },
}));
