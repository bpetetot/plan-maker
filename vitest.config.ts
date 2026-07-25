import { defineConfig } from 'vitest/config'
import { playwright } from '@vitest/browser-playwright'
import react from '@vitejs/plugin-react'

// Vitest loads one config file and this one wins over vite.config.ts, so the
// plugins the tests need are declared here rather than inherited from it.
export default defineConfig({
  plugins: [react()],
  // zustand resolves React to the CJS build while vitest-browser-react carries
  // its own copy — two hook registries, and every test mounting Editor dies on
  // "Invalid hook call".
  resolve: { dedupe: ['react', 'react-dom'] },
  test: {
    projects: [
      {
        test: {
          name: 'node',
          include: ['tests/**/*.test.ts'],
          environment: 'node',
          // The PNG export inlines the sheet's stylesheet (ADR 0024); left at
          // its default, vitest hands every CSS import back as an empty string.
          css: true,
        },
      },
      {
        test: {
          name: 'browser',
          include: ['tests/**/*.test.tsx'],
          setupFiles: ['./tests/setup.browser.ts'],
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
})
