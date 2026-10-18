import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

declare const process: { env: Record<string, string | undefined> } // no @types/node here

// API_URL lets compose point the proxy at the backend container (http://backend:8000).
export default defineConfig({
  plugins: [react(), tailwindcss()],
  server: { proxy: { '/api': process.env.API_URL ?? 'http://localhost:8000' } },
})
