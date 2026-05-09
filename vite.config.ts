import { defineConfig, type Plugin } from 'vite'
import { loadEnv } from 'vite'
import path from 'path'
import fs from 'fs'
import tailwindcss from '@tailwindcss/vite'
import react from '@vitejs/plugin-react'
import viteCompression from 'vite-plugin-compression'
import { visualizer } from 'rollup-plugin-visualizer'

function writeDistVersionJsonPlugin(): Plugin {
  return {
    name: 'net360-dist-version-json',
    closeBundle() {
      const dir = path.resolve(__dirname, 'dist')
      if (!fs.existsSync(dir)) return
      const version =
        String(process.env.VERCEL_GIT_COMMIT_SHA || process.env.GITHUB_SHA || '').trim().slice(0, 12)
        || String(Math.floor(Date.now() / 1000))
      fs.writeFileSync(path.join(dir, 'version.json'), `${JSON.stringify({ version }, null, 2)}\n`)
    },
  }
}

function injectS3PreconnectPlugin(mode: string): Plugin {
  const env = loadEnv(mode, process.cwd(), '')
  const raw = String(env.VITE_S3_BASE_URL || env.VITE_PUBLIC_MEDIA_BASE_URL || '').trim().replace(/\/+$/, '')
  return {
    name: 'inject-s3-preconnect',
    transformIndexHtml(html) {
      if (!raw || !/^https?:\/\//i.test(raw)) return html
      try {
        const origin = new URL(raw).origin
        const extra = `  <link rel="dns-prefetch" href="${origin}" />\n  <link rel="preconnect" href="${origin}" crossorigin />\n`
        return html.replace(/<\/head>/i, `${extra}</head>`)
      } catch {
        return html
      }
    },
  }
}

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '')
  const devApiOrigin = String(env.VITE_API_URL || env.VITE_API_BASE_URL || '').trim()
  const analyzeBundle = mode === 'analyze'

  return {
    plugins: [
      // The React and Tailwind plugins are both required for Make, even if
      // Tailwind is not being actively used – do not remove them
      react(),
      tailwindcss(),
      injectS3PreconnectPlugin(mode),
      writeDistVersionJsonPlugin(),
      ...(analyzeBundle
        ? [
            visualizer({
              filename: path.resolve(__dirname, 'dist/stats.html'),
              gzipSize: true,
              brotliSize: true,
              open: false,
              template: 'treemap',
            }),
          ]
        : []),
      viteCompression({
        threshold: 1024,
        algorithm: 'gzip',
        ext: '.gz',
      }),
      viteCompression({
        threshold: 1024,
        algorithm: 'brotliCompress',
        ext: '.br',
      }),
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
      target: 'es2020',
      modulePreload: { polyfill: true },
      reportCompressedSize: false,
      minify: 'terser',
      terserOptions: {
        compress: {
          passes: 2,
          ecma: 2020,
          drop_debugger: true,
          pure_funcs: ['console.log', 'console.debug', 'console.info'],
        },
        format: {
          comments: false,
          ecma: 2020,
        },
      },
      // Linked maps satisfy Lighthouse "missing source maps"; maps ship as separate files (not inline).
      sourcemap: true,
      cssCodeSplit: true,
      cssMinify: true,
      rollupOptions: {
        output: {
          /** Smaller merges on HTTP/2+ CDNs — improves cache granularity for lazy routes */
          experimentalMinChunkSize: 12_000,
          manualChunks(id) {
            if (!id.includes('node_modules')) return
            if (
              /node_modules[\\/]react-dom[\\/]/.test(id)
              || /node_modules[\\/]scheduler[\\/]/.test(id)
              || /node_modules[\\/]react[\\/]/.test(id)
            ) {
              return 'vendor-react'
            }
            if (/node_modules[\\/]react-router(-dom)?[\\/]/.test(id)) {
              return 'vendor-router'
            }
            if (/node_modules[\\/]firebase[\\/]/.test(id)) {
              if (/[/\\]auth[/\\]/.test(id)) return 'vendor-firebase-auth'
              return 'vendor-firebase'
            }
            if (id.includes('@mui') || id.includes('@emotion')) return 'vendor-mui'
            if (id.includes('recharts')) return 'vendor-charts'
            if (id.includes('mathlive')) return 'vendor-mathlive'
            if (id.includes('katex')) return 'vendor-katex'
            if (id.includes('socket.io-client')) return 'vendor-socket'
            if (id.includes('lucide-react')) return 'vendor-icons'
            if (id.includes('@tanstack')) return 'vendor-tanstack'
            if (id.includes('date-fns')) return 'vendor-dates'
            if (id.includes('zod')) return 'vendor-zod'
            if (id.includes('/motion') || id.includes('framer-motion')) return 'vendor-motion'
            return
          },
        },
      },
    },
  }
})
