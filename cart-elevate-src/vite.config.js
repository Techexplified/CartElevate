import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { resolve } from 'path';

/**
 * Vite config for CartElevate storefront bundle.
 *
 * Source lives in: cart-elevate-src/src/
 * Output goes to:  extensions/cart-elevate/assets/
 *
 * The extension folder (extensions/cart-elevate/) contains ONLY
 * Shopify-allowed directories: assets/, blocks/, locales/
 * No source files, no node_modules, no build config.
 */
export default defineConfig({
  plugins: [
    react({
      include: '**/*.{js,jsx}',
    }),
  ],
  esbuild: {
    loader: 'jsx',
    include: /src\/.*\.js$/,
    exclude: [],
  },
  define: {
    'process.env.NODE_ENV': JSON.stringify('production'),
  },
  build: {
    // Output directly into the extension's assets/ folder
    outDir: resolve(__dirname, '../extensions/cart-elevate/assets'),
    emptyOutDir: false,
    lib: {
      entry: resolve(__dirname, 'src/index.js'),
      name: 'CartElevate',
      fileName: () => 'cart-elevate.js',
      formats: ['iife'],
    },
    rollupOptions: {
      output: {
        assetFileNames: (assetInfo) => {
          if (assetInfo.name && assetInfo.name.endsWith('.css')) {
            return 'cart-elevate.css';
          }
          return '[name][extname]';
        },
      },
    },
    minify: true,
    sourcemap: false,
  },
  optimizeDeps: {
    esbuildOptions: {
      loader: { '.js': 'jsx' },
    },
  },
});
