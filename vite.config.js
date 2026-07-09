import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import mkcert from 'vite-plugin-mkcert'

// https://vite.dev/config/
export default defineConfig({
  base: './', // Generates relative asset paths for GitHub Pages
  plugins: [
    react(),
    mkcert()
  ],
  server: {
    https: true,
    host: true // Exposes server on network
  }
})

