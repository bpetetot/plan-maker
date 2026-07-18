# 03 — PWA tooling and service worker strategy

Type: research
Status: resolved
Blocked by: —

## Question

What is the current best-practice setup to make a Vite + React SPA an installable,
offline-capable PWA?

Cover: vite-plugin-pwa (maturity, config surface) vs alternatives; service worker
caching strategy for a fully static app (precache-all vs runtime caching); update
flow (prompt-to-refresh vs auto-update) and its UX for an editor where losing
unsaved state matters; web manifest essentials for desktop install; how to test
offline behavior locally. Recommend a concrete setup.

## Answer

Use `vite-plugin-pwa` v1.3.0 (actively maintained, released 2026-05-05, Vite 3.1-8 support,
wraps Workbox 7.4.x which is again active under Chrome's Aurora team) with the default
`generateSW` strategy. Precache the entire static build via `workbox.globPatterns`
(`**/*.{js,css,html,ico,png,svg,woff2}`); keep default `navigateFallback: 'index.html'` and
`cleanupOutdatedCaches`. Use `registerType: 'prompt'` (not `autoUpdate`, which force-reloads
and loses unsaved in-memory editor state) with a React `ReloadPrompt` built on `useRegisterSW`
from `virtual:pwa-register/react`, plus an hourly `registration.update()` check. Manifest needs
`name`, `short_name`, `id`, `start_url`, `display: 'standalone'`, `theme_color`, and 192/512 px
icons incl. a maskable 512 for desktop Chromium install. Test with `devOptions.enabled: true`
in dev and `vite build && vite preview` + DevTools Application panel offline toggle (Lighthouse's
PWA category was removed in v12). Serwist (`@serwist/vite` 9.5.11) is a viable lower-level
alternative only if you want to hand-write the service worker.
Full findings: ../research/pwa-tooling.md
