import { defineConfig } from 'vite'
import { loadEnv } from 'vite'
import path from 'path'
import tailwindcss from '@tailwindcss/vite'
import react from '@vitejs/plugin-react'

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '')
  const devApiOrigin = String(env.VITE_API_URL || '').trim()

  return {
    plugins: [
      // The React and Tailwind plugins are both required for Make, even if
      // Tailwind is not being actively used – do not remove them
      react(),
      tailwindcss(),
    ],
    resolve: {
      alias: {
        // Alias @ to the src directory
        '@': path.resolve(__dirname, './src'),
      },
    },

    // Allow Render-assigned domains when serving the production build via `vite preview`.
    preview: {
      allowedHosts: true,
    },

    server: {
      // Default 3000 matches many IDE “Simple Browser” / live preview URLs (127.0.0.1:3000).
      // Override: VITE_DEV_SERVER_PORT=5173 npm run dev
      port: Number(process.env.VITE_DEV_SERVER_PORT || 3000),
      strictPort: false,
      host: '127.0.0.1',
      ...(devApiOrigin
        ? {
            proxy: {
              '/api': {
                target: devApiOrigin,
                changeOrigin: true,
              },
            },
          }
        : {}),
    },

    // File types to support raw imports. Never add .css, .tsx, or .ts files to this.
    assetsInclude: ['**/*.svg', '**/*.csv'],

    build: {
      modulePreload: { polyfill: true },
      rollupOptions: {
        output: {
          // Avoid stacking extra manual chunk rules on Vite defaults (reduces odd split edge cases).
          manualChunks: undefined,
        },
      },
    },
  }
})
