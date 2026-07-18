# PWA tooling for a Vite + React SPA — research findings

Research performed: **2026-07-18**.

Method note: primary sources were consulted live. The sandbox network policy blocked direct access to `vite-pwa-org.netlify.app`, `developer.chrome.com`, `developer.mozilla.org`, `web.dev`, `serwist.pages.dev`, and `npmjs.com`/`api.npmjs.org`; for those, the equivalent primary content was fetched from the projects' GitHub source repositories (`vite-pwa/docs`, `mdn/content`, `GoogleChrome/workbox`, `serwist/serwist`) and from the npm registry API (`registry.npmjs.org`), plus web search snippets of the blocked pages. Canonical doc URLs are cited alongside the GitHub source actually read. Weekly download counts could not be verified (downloads API blocked).

## Executive summary / recommendation

Use **`vite-plugin-pwa` v1.3.0** with the default **`generateSW`** strategy and the default **`registerType: 'prompt'`** update flow. It is actively maintained (latest release 2026-05-05, supports Vite 3.1–8), wraps Workbox 7.4.x (which is again actively maintained under Chrome's Aurora team), generates both the web app manifest and the service worker, and ships a first-class React hook (`useRegisterSW` via `virtual:pwa-register/react`) for a prompt-based "new version available — Reload" toast. For a fully static editor SPA:

- Precache the entire build output (add `ico,png,svg,woff2,…` to `workbox.globPatterns`; hashed Vite assets are handled automatically).
- Keep the default `navigateFallback: 'index.html'` (SPA routing offline) and `cleanupOutdatedCaches: true` — both are vite-plugin-pwa defaults.
- Use `prompt` (not `autoUpdate`): an auto-reload can destroy unsaved in-memory editor state; `prompt` lets the user save first.
- Manifest: `name`, `short_name`, `description`, `start_url`, `id`, `display: 'standalone'`, `theme_color`, and 192 + 512 px icons including a `maskable` 512 icon — this satisfies Chromium desktop installability.
- Test with `devOptions.enabled: true` in dev, and `vite build && vite preview` + Chrome DevTools Application panel (Service workers + "Offline" checkbox) for the real thing. Lighthouse's PWA category no longer exists (removed in Lighthouse 12).

Serwist (`@serwist/vite`) is a healthy Workbox fork and a reasonable alternative if you want to own the service worker file, but it is lower-level (no manifest generation, no framework register hooks) and its original raison d'être — Workbox stagnation — has weakened now that Workbox is releasing again.

---

## 1. vite-plugin-pwa: version, maintenance, config surface

**Current version and cadence** (verified live):

- Latest: **v1.3.0**, published **2026-05-05** on npm ([registry.npmjs.org/vite-plugin-pwa](https://registry.npmjs.org/vite-plugin-pwa)).
- Release history from [GitHub releases](https://github.com/vite-pwa/vite-plugin-pwa/releases): v1.0.0 (2025-03-29), v1.0.1 (2025-06-30), v1.0.2 (2025-07-25), v1.0.3 (2025-08-19), v1.1.0 (2025-10-13), v1.2.0 (2025-11-27), v1.3.0 (2026-05-05) — roughly a release every 1–2 months. v1.3.0 added the **Vite 8 peer dependency** and an `onNeedReload` client callback.
- Repo status via GitHub API: ~4,200 stars, last push 2026-05-05, not archived, ~184 open issues ([github.com/vite-pwa/vite-plugin-pwa](https://github.com/vite-pwa/vite-plugin-pwa)).
- npm maintainers: `antfu`, `hannoeru`, `userquin` (registry data). MIT license.
- Peer dependencies: `vite ^3.1.0 || ^4 || ^5 || ^6 || ^7 || ^8`, `workbox-build ^7.4.1`, `workbox-window ^7.4.1`, optional `@vite-pwa/assets-generator ^1.0.0` (registry data). The plugin builds the SW with the `workbox-build` node library ([guide](https://vite-pwa-org.netlify.app/guide/), source: [vite-pwa/docs guide/index.md](https://github.com/vite-pwa/docs/blob/main/guide/index.md)).
- The plugin is part of Vite's [ecosystem-ci](https://github.com/vitejs/vite-ecosystem-ci), so regressions against new Vite versions are caught upstream ([testing docs](https://github.com/vite-pwa/docs/blob/main/guide/testing-service-worker.md)).

**Config surface** (all from [vite-pwa/docs](https://github.com/vite-pwa/docs) and [src/options.ts](https://github.com/vite-pwa/vite-plugin-pwa/blob/main/src/options.ts)):

- `strategies`: `'generateSW'` (default — Workbox generates the whole SW from config) or `'injectManifest'` (you write `src/sw.ts`; the plugin compiles it and injects the precache manifest at `self.__WB_MANIFEST`) ([inject-manifest guide](https://github.com/vite-pwa/docs/blob/main/guide/inject-manifest.md)).
- `registerType`: `'prompt'` (default) or `'autoUpdate'` ([prompt-for-update](https://github.com/vite-pwa/docs/blob/main/guide/prompt-for-update.md), [auto-update](https://github.com/vite-pwa/docs/blob/main/guide/auto-update.md)).
- `manifest`: inline web app manifest object; the plugin generates `manifest.webmanifest` and injects the `<link rel="manifest">` into `index.html`. `manifest: false` lets you ship your own file ([pwa-minimal-requirements](https://github.com/vite-pwa/docs/blob/main/guide/pwa-minimal-requirements.md)).
- `workbox`: options passed to Workbox `generateSW` (`globPatterns`, `runtimeCaching`, `navigateFallback`, `cleanupOutdatedCaches`, `maximumFileSizeToCacheInBytes`, …). `injectManifest` takes the equivalent options for the other strategy.
- `devOptions`: `{ enabled, type, navigateFallback, navigateFallbackAllowlist, suppressWarnings }` — enables the SW during `vite dev` ([development guide](https://github.com/vite-pwa/docs/blob/main/guide/development.md)).
- `includeAssets`: extra `public/` files (favicon, apple-touch-icon…) to precache; manifest icons under `public/` are precached automatically ([static-assets](https://github.com/vite-pwa/docs/blob/main/guide/static-assets.md)).
- Defaults verified in source ([options.ts](https://github.com/vite-pwa/vite-plugin-pwa/blob/main/src/options.ts)): `navigateFallback: 'index.html'`, `cleanupOutdatedCaches: true`; when `registerType: 'autoUpdate'`, the plugin **forces** `workbox.skipWaiting = true` and `workbox.clientsClaim = true`.

## 2. Alternatives comparison

**Raw Workbox** ([developer.chrome.com/docs/workbox](https://developer.chrome.com/docs/workbox/), repo [GoogleChrome/workbox](https://github.com/GoogleChrome/workbox)):

- Maintenance status verified live: **not archived**, latest release **v7.4.1 (2026-05-05)**, v7.4.0 (2025-11-19), repo pushed 2026-07-10. The README carries a "Maintenance update" note: ownership transferred to **Chrome's Aurora team** ([README, v7 branch](https://github.com/GoogleChrome/workbox/blob/v7/README.md)). There *was* a long quiet stretch (v7.1.0 Apr 2024 → v7.3.0 Oct 2024 → v7.4.0 Nov 2025), which is what spawned the Serwist fork, but as of mid-2026 Workbox is releasing again.
- Using workbox-build directly with Vite means wiring the manifest injection, build hooks, and registration yourself — that is exactly what vite-plugin-pwa automates. Makes sense only if you need full control over the build pipeline.

**Serwist** ([serwist.pages.dev](https://serwist.pages.dev/), repo [serwist/serwist](https://github.com/serwist/serwist)):

- Self-described as "a fork of Workbox that came to be due to its development being stagnated" ([README](https://github.com/serwist/serwist/blob/main/README.md)).
- Current version verified: **`serwist`, `@serwist/vite`, `@serwist/window` all at 9.5.11, published 2026-05-03** ([registry.npmjs.org](https://registry.npmjs.org/serwist)). Repo: ~1,450 stars, only 6 open issues, pushed 2026-05-13 — small but healthy and responsive.
- `@serwist/vite` ("integrates Serwist into your Vite application", docs at [serwist.pages.dev/docs/vite](https://serwist.pages.dev/docs/vite)) requires `vite >= 5` (registry peer deps). It is injectManifest-style only: you always write your own `sw.ts`; there is no manifest generation and no React register hook equivalent to `useRegisterSW`.
- When it makes sense: you want a modern, typed, ESM-first Workbox with an owner-authored SW file, or you distrust Workbox's long-term stewardship. Less compelling now that Workbox 7.4.x is shipping again, and vite-plugin-pwa gives more out of the box for a Vite SPA.

**Hand-written service worker** (no library):

- Entirely possible for a static SPA (install → `cache.addAll`, fetch → cache-first, activate → delete old caches), but you must generate the precache list from the hashed build output yourself, implement cache-busting/versioning, navigation fallback, and update messaging — reinventing `workbox-precaching`. MDN's own tutorials use a service worker for offline but note the ecosystem tooling exists for this reason ([MDN PWA guides](https://developer.mozilla.org/en-US/docs/Web/Progressive_web_apps)). Reasonable only for minimal apps or when a zero-dependency policy matters.
- `vite-plugin-pwa`'s `injectManifest` strategy is the middle ground: hand-written SW logic, but precache manifest, compilation, and registration handled by the plugin ([inject-manifest guide](https://github.com/vite-pwa/docs/blob/main/guide/inject-manifest.md)).

## 3. Caching strategy for a fully static SPA

- **Precache everything.** The SW precache manifest should include all app resources so they are downloaded to Cache Storage at install time and served offline; `workbox-build` walks the `dist` folder and by default includes only `**/*.{js,css,html}` (`globPatterns` default), so add other static types explicitly: `globPatterns: ['**/*.{js,css,html,ico,png,svg,woff2}']` ([service-worker-precache](https://github.com/vite-pwa/docs/blob/main/guide/service-worker-precache.md), [static-assets](https://github.com/vite-pwa/docs/blob/main/guide/static-assets.md)). A common pitfall: when overriding `globPatterns`, you must re-include js/css/html or the SW fails with `WorkboxError non-precached-url index.html` ([static-assets](https://github.com/vite-pwa/docs/blob/main/guide/static-assets.md)).
- **Hashed assets**: Vite emits content-hashed filenames; the precache manifest is regenerated each build, and the browser only re-downloads entries whose URL/revision changed ([service-worker-precache](https://github.com/vite-pwa/docs/blob/main/guide/service-worker-precache.md)). Precaching happens in a background thread, so first load is not blocked.
- **SPA routing offline**: `navigateFallback: 'index.html'` makes the SW answer any navigation request (e.g. deep link `/plans/42`) with the cached app shell. vite-plugin-pwa sets this by default for `generateSW` ([options.ts](https://github.com/vite-pwa/vite-plugin-pwa/blob/main/src/options.ts)). Routes that must hit the network (e.g. `/api`, `/backoffice`) go in `navigateFallbackDenylist` ([workbox/generate-sw](https://github.com/vite-pwa/docs/blob/main/workbox/generate-sw.md)).
- **`cleanupOutdatedCaches: true`** (vite-plugin-pwa default) removes precaches left by older Workbox versions/older builds ([options.ts](https://github.com/vite-pwa/vite-plugin-pwa/blob/main/src/options.ts), [prompt-for-update](https://github.com/vite-pwa/docs/blob/main/guide/prompt-for-update.md)).
- **`maximumFileSizeToCacheInBytes`**: files larger than the limit are silently skipped from precache; default is **2 MiB (2097152 bytes)** ([workbox-build types.ts](https://github.com/GoogleChrome/workbox/blob/v7/packages/workbox-build/src/types.ts)). A code-split editor app can easily exceed this with a single vendor chunk — raise it (e.g. `5 * 1024 * 1024`) if the build warns about skipped files, since a skipped chunk means a broken app offline.
- **Runtime caching is still needed only for cross-origin/CDN resources** (e.g. Google Fonts): precache covers only your own build output. The documented pattern is a `CacheFirst` runtime route with `expiration` and `cacheableResponse: { statuses: [0, 200] }`, plus `crossorigin="anonymous"` on the `<link>` tags ([workbox/generate-sw — Cache External Resources](https://github.com/vite-pwa/docs/blob/main/workbox/generate-sw.md), [Workbox runtime caching docs](https://developer.chrome.com/docs/workbox/caching-resources-during-runtime)). A fully self-hosted static SPA (fonts bundled locally) needs **no** runtime caching at all.

## 4. Update flow: autoUpdate vs prompt

- **`registerType: 'autoUpdate'`**: the plugin forces `skipWaiting: true` + `clientsClaim: true`; when a new SW is detected, caches are updated and **every open tab/window is reloaded automatically** (provided a virtual module is imported; `registerSW({ immediate: true })` for automatic page reload). The docs explicitly warn: "The disadvantage of using this behavior is that the user can lose data in any browser windows/tabs in which the application is open and is filling in a form. If your application has forms, we recommend you to change the behavior to use default `prompt` option" ([auto-update guide](https://github.com/vite-pwa/docs/blob/main/guide/auto-update.md)).
- **`registerType: 'prompt'` (default)**: the new SW installs but stays **waiting**; the app shows a toast via `onNeedRefresh`, and only when the user clicks Reload does `updateServiceWorker()` post `SKIP_WAITING` to the waiting SW and reload the page ([prompt-for-update guide](https://github.com/vite-pwa/docs/blob/main/guide/prompt-for-update.md); the underlying `SKIP_WAITING` message handler is shown in the [inject-manifest guide](https://github.com/vite-pwa/docs/blob/main/guide/inject-manifest.md)).
- **For an editor app this decides it**: unsaved in-memory state (an open plan being edited) would be destroyed by an auto-reload at an arbitrary moment. `prompt` lets the user save/export first, then opt into the update. Also note the docs' warning that switching a shipped SW from `autoUpdate` back to `prompt` later "can be a pain" — choose `prompt` before first production deploy ([auto-update guide](https://github.com/vite-pwa/docs/blob/main/guide/auto-update.md)).
- **`skipWaiting`/`clientsClaim` semantics**: `skipWaiting()` activates the new SW immediately instead of waiting for all tabs to close; `clientsClaim()` makes it take control of open clients right away. In `prompt` mode neither runs until the user consents ([auto-update](https://github.com/vite-pwa/docs/blob/main/guide/auto-update.md), [inject-manifest](https://github.com/vite-pwa/docs/blob/main/guide/inject-manifest.md)).
- **React hook**: `useRegisterSW()` from `virtual:pwa-register/react` returns `offlineReady` and `needRefresh` as `useState` pairs plus `updateServiceWorker(reloadPage?)` ([frameworks/react](https://github.com/vite-pwa/docs/blob/main/frameworks/react.md)). Requires `workbox-window` as a dev dependency and `"types": ["vite-plugin-pwa/react"]` in tsconfig.
- **Periodic update checks**: by default the browser checks for a new SW on navigation, which a long-lived installed SPA rarely does. Use `onRegisteredSW` to call `registration.update()` on an interval (e.g. hourly), guarded by an online/HEAD-fetch check ([periodic-sw-updates](https://github.com/vite-pwa/docs/blob/main/guide/periodic-sw-updates.md), which follows [web.dev service-worker-lifecycle "Manual updates"](https://web.dev/articles/service-worker-lifecycle#manual_updates)).

## 5. Web app manifest essentials for desktop installability (Chrome/Edge)

Per MDN's "Making PWAs installable" (source: [mdn/content](https://github.com/mdn/content/blob/main/files/en-us/web/progressive_web_apps/guides/making_pwas_installable/index.md), canonical: [developer.mozilla.org](https://developer.mozilla.org/en-US/docs/Web/Progressive_web_apps/Guides/Making_PWAs_installable)), Chromium-based browsers (Chrome, Edge) require the manifest to include:

- `name` **or** `short_name`
- `icons` containing a **192 px and a 512 px** icon
- `start_url`
- `display` and/or `display_override` (use `standalone` for an app-like window)
- `prefer_related_applications` absent or `false`

Plus: the app must be served over **HTTPS, or from `localhost`/`127.0.0.1`** during development (same source).

Additional facts:

- **Service worker is no longer an install requirement in Chrome**: the SW-with-fetch-handler check was removed in Chrome 108 (mobile) / **112 (desktop)** — installability is now manifest-based ([Chrome blog: Revisiting Chrome's installability criteria](https://developer.chrome.com/blog/update-install-criteria); see also [web.dev/articles/install-criteria](https://web.dev/articles/install-criteria)). You still want the SW for offline, just not for the install prompt.
- **`id`**: a same-origin URL-like string uniquely identifying the app; if absent it defaults to `start_url`. Setting it explicitly (recommended practice: root-relative, e.g. `"/"`) lets you later move `start_url` without the browser treating it as a different app ([MDN `id` reference](https://developer.mozilla.org/en-US/docs/Web/Progressive_web_apps/Manifest/Reference/id), source: [mdn/content id/index.md](https://github.com/mdn/content/blob/main/files/en-us/web/progressive_web_apps/manifest/reference/id/index.md)).
- **Maskable icons**: vite-pwa's minimal-requirements guide recommends separate 512 px icons with `purpose: 'any'` and `purpose: 'maskable'` rather than one `'any maskable'` icon ([pwa-minimal-requirements](https://github.com/vite-pwa/docs/blob/main/guide/pwa-minimal-requirements.md)). The `@vite-pwa/assets-generator` package can generate the whole icon set from one SVG.
- **`theme_color`** in the manifest should match the `<meta name="theme-color">` in `index.html`; `background_color` is used for the splash/app window background ([pwa-minimal-requirements](https://github.com/vite-pwa/docs/blob/main/guide/pwa-minimal-requirements.md)).
- Desktop install UX: Chromium shows an install icon in the omnibox when criteria are met; `beforeinstallprompt` allows a custom in-app install button ([MDN Making PWAs installable](https://developer.mozilla.org/en-US/docs/Web/Progressive_web_apps/Guides/Making_PWAs_installable)). Desktop Chrome/Edge can also install *any* site via menu, but only a valid manifest gets active promotion.
- Server must serve `manifest.webmanifest` as `application/manifest+json` and serve over https in production ([pwa-minimal-requirements](https://github.com/vite-pwa/docs/blob/main/guide/pwa-minimal-requirements.md)).

## 6. Testing offline locally

- **During dev**: set `devOptions: { enabled: true }` — the SW logic and `manifest.webmanifest` are served by the dev server (generateSW runs with `type: 'classic'`; only `navigateFallback` is in the dev precache manifest). If routes get wrongly intercepted in dev, tune `devOptions.navigateFallbackAllowlist` ([development guide](https://github.com/vite-pwa/docs/blob/main/guide/development.md)).
- **Real verification requires a production build**: run `vite build` then `vite preview` and test at the preview URL — precaching of the full build output only exists in the built SW ([service-worker-precache](https://github.com/vite-pwa/docs/blob/main/guide/service-worker-precache.md), [development guide](https://github.com/vite-pwa/docs/blob/main/guide/development.md)).
- **Chrome DevTools**: Application panel → *Service workers* to inspect the registration, with **Offline**, **Update on reload**, and **Bypass for network** checkboxes; the Offline checkbox (equivalent to Network panel throttling → Offline) simulates no connectivity to verify the SW serves cached content. Application panel → *Manifest* validates installability ([Debug Progressive Web Apps — Chrome DevTools](https://developer.chrome.com/docs/devtools/progressive-web-apps)).
- Hard-refresh test: with Offline checked, reload and deep-load a client-side route — both must render from cache (navigateFallback).
- **Lighthouse**: the PWA category **was removed in Lighthouse 12.0.0 (April 2024, in DevTools from Chrome 126)** following Chrome's updated installability criteria — do not look for a "PWA badge" ([GoogleChrome/lighthouse changelog](https://github.com/GoogleChrome/lighthouse/blob/main/changelog.md), [issue #15535](https://github.com/GoogleChrome/lighthouse/issues/15535)). Use the DevTools Application panel checks instead.
- **HTTPS**: SW registration and installability work on `localhost`/`127.0.0.1` without TLS; any other host (LAN IP, staging) requires https ([MDN Making PWAs installable](https://developer.mozilla.org/en-US/docs/Web/Progressive_web_apps/Guides/Making_PWAs_installable)).

## 7. Concrete recommended setup

**Packages** (dev dependencies):

- `vite-plugin-pwa@^1.3.0` (pulls `workbox-build@^7.4.1` / `workbox-window@^7.4.1` as deps)
- `workbox-window` explicitly (required by the React virtual module per [frameworks/react](https://github.com/vite-pwa/docs/blob/main/frameworks/react.md))
- Optional: `@vite-pwa/assets-generator@^1.0.0` to generate the icon set from a single SVG

**`vite.config.ts`** (fully static editor SPA, precache-all, prompt update flow):

```ts
import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'
import { VitePWA } from 'vite-plugin-pwa'

export default defineConfig({
  plugins: [
    react(),
    VitePWA({
      // registerType: 'prompt' is the default — kept explicit for clarity
      registerType: 'prompt',
      includeAssets: ['favicon.ico', 'apple-touch-icon.png'],
      manifest: {
        name: 'Plan Maker',
        short_name: 'PlanMaker',
        description: 'Offline-capable plan editor',
        id: '/',
        start_url: '/',
        display: 'standalone',
        theme_color: '#ffffff',
        background_color: '#ffffff',
        icons: [
          { src: 'pwa-192x192.png', sizes: '192x192', type: 'image/png' },
          { src: 'pwa-512x512.png', sizes: '512x512', type: 'image/png' },
          { src: 'pwa-maskable-512x512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
        ],
      },
      workbox: {
        // default is '**/*.{js,css,html}' — include the rest of the build output
        globPatterns: ['**/*.{js,css,html,ico,png,svg,woff2}'],
        // defaults kept: navigateFallback: 'index.html', cleanupOutdatedCaches: true
        // raise only if the build reports files skipped from precache (default 2 MiB)
        maximumFileSizeToCacheInBytes: 5 * 1024 * 1024,
      },
      devOptions: {
        enabled: true,
        suppressWarnings: true,
      },
    }),
  ],
})
```

Add to `tsconfig` (or a `d.ts`): `"types": ["vite-plugin-pwa/react"]`.

**`ReloadPrompt.tsx`** (adapted from the official React example, [frameworks/react](https://github.com/vite-pwa/docs/blob/main/frameworks/react.md), with the documented periodic update check from [periodic-sw-updates](https://github.com/vite-pwa/docs/blob/main/guide/periodic-sw-updates.md)):

```tsx
import { useRegisterSW } from 'virtual:pwa-register/react'

const UPDATE_CHECK_INTERVAL_MS = 60 * 60 * 1000 // hourly

export function ReloadPrompt() {
  const {
    offlineReady: [offlineReady, setOfflineReady],
    needRefresh: [needRefresh, setNeedRefresh],
    updateServiceWorker,
  } = useRegisterSW({
    onRegisteredSW(swUrl, registration) {
      if (!registration) return
      setInterval(async () => {
        if (registration.installing || !navigator.onLine) return
        const resp = await fetch(swUrl, { cache: 'no-store' })
        if (resp?.status === 200) await registration.update()
      }, UPDATE_CHECK_INTERVAL_MS)
    },
  })

  const close = () => {
    setOfflineReady(false)
    setNeedRefresh(false)
  }

  if (!offlineReady && !needRefresh) return null

  return (
    <div role="alert" className="reload-prompt">
      <span>
        {needRefresh
          ? 'A new version is available. Save your work, then reload.'
          : 'App ready to work offline.'}
      </span>
      {needRefresh && (
        <button onClick={() => updateServiceWorker(true)}>Reload</button>
      )}
      <button onClick={close}>Close</button>
    </div>
  )
}
```

Mount `<ReloadPrompt />` once near the app root. Because `registerType` is `prompt`, the new service worker waits until the user clicks Reload — unsaved editor state is never lost to a surprise refresh.

**Verification checklist**: `vite build && vite preview` → DevTools Application → Manifest (installable, no errors) → Service workers (activated) → check Offline → reload and deep-link a route → both render; then install from the omnibox icon and repeat offline inside the installed window ([Chrome DevTools PWA debugging](https://developer.chrome.com/docs/devtools/progressive-web-apps)).

---

## Sources

Consulted 2026-07-18. Items marked (source mirror) were read from the project's GitHub content repo because the canonical host was blocked by the sandbox network policy.

- https://registry.npmjs.org/vite-plugin-pwa — version 1.3.0, publish date, peer deps, maintainers
- https://github.com/vite-pwa/vite-plugin-pwa/releases — release history and dates
- https://github.com/vite-pwa/vite-plugin-pwa (repo API) — stars, activity, not archived
- https://github.com/vite-pwa/vite-plugin-pwa/blob/main/src/options.ts — default navigateFallback, cleanupOutdatedCaches, forced skipWaiting/clientsClaim
- https://vite-pwa-org.netlify.app/ — canonical docs; read via source mirror https://github.com/vite-pwa/docs (guide/index, prompt-for-update, auto-update, service-worker-precache, static-assets, inject-manifest, development, periodic-sw-updates, pwa-minimal-requirements, testing-service-worker, workbox/generate-sw, frameworks/react)
- https://github.com/GoogleChrome/workbox — repo API (active, not archived) and https://github.com/GoogleChrome/workbox/blob/v7/README.md (Aurora team maintenance note); releases API for v7.4.0/v7.4.1 dates
- https://github.com/GoogleChrome/workbox/blob/v7/packages/workbox-build/src/types.ts — maximumFileSizeToCacheInBytes default 2097152
- https://developer.chrome.com/docs/workbox/ — canonical Workbox docs (blocked; claims sourced from repo + vite-pwa docs references)
- https://registry.npmjs.org/serwist and https://registry.npmjs.org/@serwist/vite — versions 9.5.11, publish dates, peer deps
- https://github.com/serwist/serwist — repo API + README ("fork of Workbox … development being stagnated")
- https://serwist.pages.dev/docs/vite — canonical @serwist/vite docs (blocked; referenced from package README)
- https://developer.mozilla.org/en-US/docs/Web/Progressive_web_apps/Guides/Making_PWAs_installable — via source mirror https://github.com/mdn/content/blob/main/files/en-us/web/progressive_web_apps/guides/making_pwas_installable/index.md
- https://developer.mozilla.org/en-US/docs/Web/Progressive_web_apps/Manifest/Reference/id — via source mirror https://github.com/mdn/content/blob/main/files/en-us/web/progressive_web_apps/manifest/reference/id/index.md
- https://developer.chrome.com/blog/update-install-criteria — SW fetch-handler requirement removed (Chrome 108 mobile / 112 desktop) [via web search]
- https://web.dev/articles/install-criteria — installability criteria [via web search]
- https://github.com/GoogleChrome/lighthouse/blob/main/changelog.md and https://github.com/GoogleChrome/lighthouse/issues/15535 — PWA category removed in Lighthouse 12.0.0 (2024-04) [via web search]
- https://developer.chrome.com/docs/devtools/progressive-web-apps — DevTools Application panel: Service workers tab, Offline/Update-on-reload/Bypass-for-network checkboxes [via web search]
- https://web.dev/articles/service-worker-lifecycle#manual_updates — registration.update() manual/periodic checks (referenced by vite-pwa docs)
