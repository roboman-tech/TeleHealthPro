import react from '@vitejs/plugin-react'
import { defineConfig, loadEnv } from 'vite'

const API_PREFIXES = [
  '/auth',
  '/providers',
  '/records',
  '/clinical',
  '/appointments',
  '/telehealth',
  '/admin',
  '/integrations',
  '/notifications',
  '/ws',
] as const

// https://vite.dev/config/
export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '')
  const target = env.VITE_DEV_PROXY_TARGET || 'http://127.0.0.1:8000'

  return {
    plugins: [react()],
    server: {
      port: 5173,
      strictPort: true,
      // Avoid Windows-only issues where localhost → ::1 but nothing is listening on IPv6
      host: true,
      proxy: Object.fromEntries(
        API_PREFIXES.map((prefix) => [
          prefix,
          {
            target,
            changeOrigin: true,
            ...(prefix === '/ws' ? { ws: true } : {}),
          },
        ]),
      ),
    },
  }
})
