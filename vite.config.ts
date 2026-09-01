import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import path from 'node:path'
// Vite config for FareIDE as a Tauri desktop app.
// See https://v2.tauri.app/start/frontend/vite/ for why these particular
// settings (fixed port, clearScreen: false, TAURI_ENV_* envPrefix) matter:
// the Tauri CLI drives this dev server itself and needs to parse its own
// errors from the terminal, so Vite can't be allowed to clear the screen
// or pick a random port out from under it.
const tauriDevHost = process.env.TAURI_DEV_HOST

export default defineConfig({
  plugins: [react(), tailwindcss()],
  resolve: {
    alias: {
      '@': path.resolve(import.meta.dirname, './src'),
    },
  },

  // Tauri expects a fixed, predictable dev server port (see tauri.conf.json's
  // build.devUrl) and needs to see raw build failures rather than an
  // overlay-cleared terminal.
  clearScreen: false,
  server: {
    port: 1420,
    strictPort: true,
    host: tauriDevHost || false,
    hmr: tauriDevHost ? { protocol: 'ws', host: tauriDevHost, port: 1421 } : undefined,
    watch: { ignored: ['**/src-tauri/**'] },
  },
  envPrefix: ['VITE_', 'TAURI_ENV_*'],
  build: {
    // Tauri's WebView target: Safari 13 covers WebKitGTK on Linux/macOS,
    // Chrome 105 covers WebView2 on Windows.
    target: process.env.TAURI_ENV_PLATFORM === 'windows' ? 'chrome105' : 'safari13',
    minify: !process.env.TAURI_ENV_DEBUG,
    sourcemap: !!process.env.TAURI_ENV_DEBUG,
  },
})
