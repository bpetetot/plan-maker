/// <reference types="vitest/config" />
import { defineConfig } from 'vite'
import { playwright } from '@vitest/browser-playwright'
import react from '@vitejs/plugin-react'
import { VitePWA } from 'vite-plugin-pwa'

// Spec §6: generateSW precaching the whole build, prompt-based updates
// (never autoUpdate — it would force-reload and lose in-memory state).
const pwa = () =>
  VitePWA({
    registerType: 'prompt',
    devOptions: { enabled: true },
    workbox: {
      globPatterns: ['**/*.{js,css,html,ico,png,svg,woff2}'],
      navigateFallback: 'index.html',
      cleanupOutdatedCaches: true,
    },
    manifest: {
      name: 'Plan Maker',
      short_name: 'Plan Maker',
      id: '/',
      start_url: '/',
      display: 'standalone',
      background_color: '#ffffff',
      theme_color: '#2563eb',
      description: 'Draw simple 2D floor plans of a house or apartment.',
      icons: [
        { src: 'pwa-192.png', sizes: '192x192', type: 'image/png' },
        { src: 'pwa-512.png', sizes: '512x512', type: 'image/png' },
        { src: 'pwa-maskable-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
      ],
    },
  })

// A function so `mode` can drop VitePWA under test: it costs ~550ms per run in
// the import alone and writes dev-dist/ on every `npm test`.
export default defineConfig(({ mode }) => ({
  plugins: [react(), ...(mode === 'test' ? [] : [pwa()])],
  // zustand resolves React to the CJS build while vitest-browser-react carries
  // its own copy — two hook registries, and every test mounting Editor dies on
  // "Invalid hook call".
  resolve: { dedupe: ['react', 'react-dom'] },
  server: { host: true },
  test: {
    projects: [
      {
        test: {
          name: 'node',
          include: ['src/**/*.test.ts'],
          environment: 'node',
        },
      },
      {
        test: {
          name: 'browser',
          include: ['src/**/*.test.tsx'],
          setupFiles: ['./src/testSetup.browser.ts'],
          browser: {
            enabled: true,
            headless: true,
            provider: playwright(),
            viewport: { width: 800, height: 600 },
            instances: [{ browser: 'chromium' }],
          },
        },
      },
    ],
  },
}))
