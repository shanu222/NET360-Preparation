import { defineConfig } from 'vite'
import { loadEnv } from 'vite'
import path from 'path'
import tailwindcss from '@tailwindcss/vite'
import react from '@vitejs/plugin-react'

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '')
  const devApiOrigin = env.VITE_DEV_API_ORIGIN || env.VITE_API_BASE_URL || 'http://localhost:4000'

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
      allowedHosts: ['.onrender.com'],
    },

    server: {
      proxy: {
        '/api': {
          target: devApiOrigin,
          changeOrigin: true,
        },
      },
    },

    // File types to support raw imports. Never add .css, .tsx, or .ts files to this.
    assetsInclude: ['**/*.svg', '**/*.csv'],
  }
})
