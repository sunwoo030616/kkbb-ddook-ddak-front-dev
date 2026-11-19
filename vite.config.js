import { defineConfig, loadEnv } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

export default defineConfig(({ mode }) => {
  const target = loadEnv(mode, '.', 'VITE_').VITE_DEV_COMPOSER_URL;
  return {
  plugins: [
    react(),
    tailwindcss(),
  ],
  server: {
    host: "127.0.0.1",
    port: 5173,
    strictPort: true,
    proxy: { "/api": { target: target || "http://127.0.0.1:8088", changeOrigin: true, ...(target ? { rewrite: path => path.replace(/^\/api\/canvas\/v2/, "/canvas") } : {}) } },
    watch: {
      usePolling: true, 
    }
  }
}})