import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vite.dev/config/
// `base` matches the GitHub Pages project site path (dominiquekossi.github.io/vera/).
// Override with `VITE_BASE=/` when deploying at a domain root.
export default defineConfig({
  base: process.env.VITE_BASE ?? '/vera/',
  plugins: [react()],
})
