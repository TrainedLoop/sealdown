import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

// https://vite.dev/config/
// BASE_PATH comes from GitHub Pages ("/rendermd/" there, "/" locally).
export default defineConfig({
  base: process.env.BASE_PATH ?? '/',
  plugins: [react()],
})
