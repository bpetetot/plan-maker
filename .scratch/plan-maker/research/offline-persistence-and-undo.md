# Offline persistence and undo/redo for a single-document React floor-plan editor

Research date: 2026-07-18. Ticket: `../issues/02-offline-persistence-and-undo.md`.

All versions/dates verified against the npm registry API (`registry.npmjs.org`), the GitHub API, and MDN source content (npmjs.com and developer.mozilla.org HTML pages blocked direct fetching from the research environment; the npm registry JSON API and MDN's source markdown on GitHub were used as equivalent primary sources; `api.npmjs.org` download-counts endpoint was blocked by network policy, so weekly download numbers could not be verified).

## 1. IndexedDB access layer for a single-document app

### Dexie.js

- **Latest: 4.4.4**, published 2026-06-16; repo actively maintained (last push 2026-07-08, 14.5k stars, not archived). Sources: https://registry.npmjs.org/dexie, https://api.github.com/repos/dexie/Dexie.js
- **Bundle size**: `dist/dexie.min.js` for 4.4.4 measured at **96 kB minified / ~31 kB gzipped** (downloaded from https://unpkg.com/dexie@4.4.4/dist/dexie.min.js and gzipped locally).
- API style: class-based schema declaration (`db.version(n).stores({...})`), promise-based queries, built-in schema versioning/upgrade hooks. React integration via **`dexie-react-hooks` 4.4.0** (published 2026-03-18) providing `useLiveQuery`, which re-renders components when queried data changes (shown in the Dexie README: https://github.com/dexie/Dexie.js/blob/master/README.md).
- **Verdict for this app**: overkill. Dexie's value is indexes, compound queries, live queries over many records, and sync add-ons. A single-document app has exactly one key; you pay ~31 kB gz for features you won't use, and liveQuery is redundant when the in-memory store (zustand) is the source of truth.

### idb (Jake Archibald)

- **Latest: 8.0.3**, published 2025-05-07; repo last push 2025-05-07 (7.4k stars, not archived). It is "done" software — small API surface mirroring IndexedDB, no open maintenance red flags. Sources: https://registry.npmjs.org/idb, https://api.github.com/repos/jakearchibald/idb
- README: "a tiny (~1.19kB brotli'd) library that mostly mirrors the IndexedDB API" — promise-wrapped `openDB`, transactions, async iterators, TypeScript-typed schemas. Source: https://github.com/jakearchibald/idb/blob/main/README.md

### idb-keyval

- **Latest: 6.3.0**, published **2026-07-08** (actively maintained; repo push same day). Sources: https://registry.npmjs.org/idb-keyval, https://api.github.com/repos/jakearchibald/idb-keyval
- README: "If you only use get/set, the library is **295 bytes (brotli'd)**, if you use all methods it's 573 bytes." Tree-shakeable `get`/`set`/`del`/`update`/`createStore` API; explicitly positions itself as the right tool when you don't need iteration/indexing, deferring to `idb` for more. Source: https://github.com/jakearchibald/idb-keyval/blob/main/README.md
- Notably, **Excalidraw itself uses idb-keyval** for its IndexedDB storage (see §3) — a strong production precedent for the single-document case.

### Raw IndexedDB pain points (why a wrapper at all)

Per MDN "Using IndexedDB" (source: https://github.com/mdn/content/blob/main/files/en-us/web/api/indexeddb_api/using_indexeddb/index.md):

- Event-based API (`onsuccess`/`onerror`/`onupgradeneeded`) predating promises.
- **Transaction auto-commit**: "If you make a transaction and return to the event loop without using it then the transaction will become inactive. The only way to keep the transaction active is to make a request on it." Awaiting any non-IDB promise (e.g., `fetch`) mid-transaction deactivates it → `TransactionInactiveError`. Wrappers make this ergonomic but cannot remove the constraint.
- Unhandled request errors bubble and **abort the whole transaction** by default.
- Values go through the **structured clone algorithm**: functions and DOM nodes throw `DataCloneError`; class instances lose their prototype chain (cloned as plain objects). Source: https://github.com/mdn/content/blob/main/files/en-us/web/api/web_workers_api/structured_clone_algorithm/index.md. Practical consequence: keep the persisted plan document as plain JSON-safe data (desirable anyway for export/import).

### localStorage and OPFS

- **localStorage**: synchronous (blocks the main thread on read/write), **5 MiB per origin**, string-only key/value — the whole doc must be `JSON.stringify`ed on every save; exceeding the limit throws `QuotaExceededError`. Source: MDN storage quotas guide, https://github.com/mdn/content/blob/main/files/en-us/web/api/storage_api/storage_quotas_and_eviction_criteria/index.md ("Web Storage … is limited to 10 MiB of data maximum on all browsers. Browsers can store up to 5 MiB of local storage, and 5 MiB of session storage per origin"). Excalidraw does use localStorage for scene JSON (with quota-error handling) but that is a legacy choice paired with IndexedDB for binary files. Fine as a fallback, not the primary store.
- **OPFS**: private-to-origin file system; byte-level in-place writes; synchronous `createSyncAccessHandle()` only in Web Workers; same quota bucket as IndexedDB. Source: https://github.com/mdn/content/blob/main/files/en-us/web/api/file_system_api/origin_private_file_system/index.md. **Not worth it here**: its win is high-throughput byte-level I/O (SQLite-wasm, video editing). For one JSON document of KB–low-MB size, IndexedDB `put` is simpler, transactional, and doesn't require worker plumbing.

## 2. Autosave patterns and failure modes

### Debounce + flush

- **Debounced writes** are the standard: writing on every mousemove during a drag would serialize + structured-clone the doc hundreds of times/sec. **Excalidraw debounces saves at 300 ms** (`SAVE_TO_LOCAL_STORAGE_TIMEOUT = 300` in https://github.com/excalidraw/excalidraw/blob/master/excalidraw-app/app_constants.ts) and exposes `LocalData.flushSave()` (calls `debounce.flush()`) plus a save-pause mechanism keyed on `document.hidden` (https://github.com/excalidraw/excalidraw/blob/master/excalidraw-app/data/LocalData.ts). A 300 ms–1 s debounce is a reasonable envelope; also flush at natural boundaries (pointer-up ending a drag, dialog close).
- **Flush on lifecycle events, not `beforeunload`**. MDN `beforeunload` docs: "It is recommended to use the `visibilitychange` event as a more reliable signal for automatic app state saving"; `beforeunload` listeners also disqualify pages from the back/forward cache in Firefox and should only be attached while there are unsaved changes. Source: https://github.com/mdn/content/blob/main/files/en-us/web/api/window/beforeunload_event/index.md. MDN `pagehide` docs: `pagehide`/`unload`/`beforeunload` are "not reliably fired by browsers, especially on mobile" (app-switch then kill never fires them); "The best event to use to signal the end of a user's session is the `visibilitychange` event… If you're specifically trying to detect page unload events, the `pagehide` event is the best option," and unlike `unload` it is bfcache-compatible. Source: https://github.com/mdn/content/blob/main/files/en-us/web/api/window/pagehide_event/index.md. Pattern: debounce during editing; on `visibilitychange`→`hidden` and on `pagehide`, synchronously kick off the flush (IndexedDB writes started there generally complete).

### Failure modes

- **QuotaExceededError**: any write via IndexedDB/Cache/OPFS beyond quota "fails with a `QuotaExceededError` exception"; MDN says to wrap storage writes in try/catch and free space before writing. Source: MDN quotas guide (above). Excalidraw catches exactly `DOMException` named `QuotaExceededError` and flips a UI atom to warn the user (LocalData.ts above) — copy that pattern: surface a persistent "cannot save" banner rather than failing silently.
- **Transaction aborts**: an unhandled request error rolls back the whole transaction (MDN Using IndexedDB, above). This is actually a friend for atomicity — see below.
- **Atomicity / corrupted partial writes**: the cleanest design for a single-document app is **one `put` of the whole document object under one key** — a single IndexedDB request in a single transaction is atomic; half a plan can never be observed. If the doc is ever split into multiple records (e.g., per-element), all writes must share one `readwrite` transaction so an abort rolls back everything together. Prefer the single-blob `put` until the doc is large enough to make full-doc writes measurable.
- **Safari / private browsing**: MDN quotas guide notes private-browsing modes "may apply different quotas, and stored data is usually deleted when the private browsing mode ends." (Old Safari ≤10 threw on any IDB write in private mode; modern Safari allows writes but wipes them, and Safari's IDB has a history of flakiness — e.g., the well-known WebKit bug 226547 where `indexedDB.open()` hangs after browser launch, worked around by many libraries with retry loops. webkit.org was not fetchable from the research environment to re-verify that bug's current status; treat "retry `open()` once on failure" as cheap insurance.)
- **Multi-tab conflicts**: two tabs of the same origin share the DB; last-write-wins can silently clobber. Two primary-source remedies: **Web Locks API** — "if a web app running in multiple tabs wants to ensure that only one tab is syncing… each tab could try to acquire a lock, but only one tab will succeed (leader election)"; locks auto-release, and `ifAvailable`/`steal` options exist. Supported Chrome 69+, Firefox 96+, Safari 15.4+ (mdn/browser-compat-data `api/LockManager.json`). Source: https://github.com/mdn/content/blob/main/files/en-us/web/api/web_locks_api/index.md. Alternatively/additionally **BroadcastChannel** to notify other tabs a newer version was saved — this is what Excalidraw's `tabSync.ts` version-stamp approach and tldraw's `persistenceKey` cross-tab sync do. For a single-doc app the simple robust choice: hold a Web Lock while the tab is the active editor; other tabs open read-only or show "open in another tab."
- **Versioned schema / migrations**: store `{ schemaVersion, savedAt, plan }` and run a small ordered list of pure `migrate(vN→vN+1)` functions on load. tldraw ships exactly this: a snapshot + "a migration system for handling schema changes" (source: https://github.com/tldraw/tldraw/blob/main/apps/docs/content/docs/persistence.mdx). IndexedDB's own `onupgradeneeded` versioning is for object-store shape, not document shape — keep document migration in app code.
- **Rolling last-known-good backup**: keep two keys, e.g. `plan:current` and `plan:backup`. On each successful save cycle (or every N saves / on session start), copy the last verified-good doc to `plan:backup` before overwriting `plan:current`; on load, if `plan:current` fails parse/migration, fall back to backup. Cost is trivial at single-document scale.

## 3. Undo/redo architecture

### Approaches

- **Command pattern** (each operation implements do/undo): maximal control, but an inverse must be hand-written and maintained for every operation — error-prone as the editor grows.
- **Immutable snapshots**: store past states; with structural sharing (immutable updates) memory cost is proportional to what changed. Simplest correct option; this is what zundo does.
- **Immer patches**: `produceWithPatches` returns `[nextState, patches, inversePatches]`; `applyPatches` replays them; docs explicitly list "basis for undo/redo" as a use case; requires one-time `enablePatches()`; patch format is RFC-6902-like with array paths; patches are correct but not guaranteed minimal. Source: https://immerjs.github.io/immer/patches/ (verified from repo source https://github.com/immerjs/immer/blob/main/website/docs/patches.mdx). **immer latest: 11.1.15, published 2026-07-16** — extremely active (https://registry.npmjs.org/immer, https://api.github.com/repos/immerjs/immer). Patch-based history is the memory-optimal middle ground: store tiny inverse/forward patch pairs instead of snapshots.

### zustand + zundo (state-library plugin)

- **zustand 5.0.14**, published 2026-05-28; repo pushed 2026-07-14, 58.4k stars — very healthy. Source: https://registry.npmjs.org/zustand, https://api.github.com/repos/pmndrs/zustand
- **zundo 2.3.0**, published 2024-11-17 (added zustand v5 support); repo last push 2026-01-30, 879 stars, not archived — maintained but slow-moving/feature-complete. Claims **<700 B minified**; requires zustand ≥4.2. Features verified from README (https://github.com/charkour/zundo): `partialize` (choose which fields enter history — critical: exclude selection/camera/hover), `limit` (cap history length), `equality` (custom fn to skip no-op states), `diff` (store deltas instead of full states), `handleSet` (wrap the history-recording setter — the documented hook for **throttling/debouncing history capture, i.e., grouping drag operations**), `wrapTemporal` (apply middleware — including zustand `persist` — to the history store itself), and a temporal store API: `undo(n)`, `redo(n)`, `clear()`, `pause()`/`resume()`, `isTracking`, `setOnSave()`. Production users listed include Alibaba, Dify.ai, Stability AI.

### Other current options

- **Redux Toolkit + redux-undo**: **redux-undo is archived on GitHub** (`archived: true` per https://api.github.com/repos/omnidan/redux-undo; last npm publish 1.1.0 on 2023-07-17 per https://registry.npmjs.org/redux-undo). Do not adopt for new work.
- **jotai-history**: 0.5.1, published 2026-05-13; small but active (repo pushed 2026-05-13, 58 stars). Viable only if already on Jotai. Sources: https://registry.npmjs.org/jotai-history, https://api.github.com/repos/jotaijs/jotai-history
- **@tanstack/store**: 0.11.0 (2026-04-17) — still 0.x, no first-party undo story. Source: https://registry.npmjs.org/@tanstack/store
- **XState 5.32.5** (2026-07-14) — statecharts, not a history/undo store; useful for modeling editor tool modes, orthogonal to undo. Source: https://registry.npmjs.org/xstate
- **What production editors do**:
  - **Excalidraw**: undo/redo is **delta-based** — `HistoryDelta extends StoreDelta`, computed by diffing store snapshots (`StoreDelta.calculate(prevSnapshot, nextSnapshot)`) and applied/inverted for undo/redo; history is in-memory. Persistence is debounced (300 ms) to localStorage for scene JSON + **idb-keyval** stores (`createStore("files-db", "files-store")`) for binary files, with quota-error handling, save pause when `document.hidden`, `flushSave()`, and cross-tab version stamps. Sources: https://github.com/excalidraw/excalidraw/blob/master/packages/excalidraw/history.ts, https://github.com/excalidraw/excalidraw/blob/master/excalidraw-app/data/LocalData.ts, https://github.com/excalidraw/excalidraw/blob/master/excalidraw-app/app_constants.ts
  - **tldraw**: `persistenceKey` prop "automatically saves to IndexedDB and syncs across browser tabs"; snapshots split **`document`** (shapes/pages) from **`session`** (camera, selection, UI state) — the latter deliberately not part of the shared/undoable document; plus a schema migration system. Source: https://github.com/tldraw/tldraw/blob/main/apps/docs/content/docs/persistence.mdx

### Interaction with autosave

- **Keep undo history in-memory only; persist only the current document.** Rationale: (a) users of desktop-style editors don't expect undo to survive a crash/reload — neither Excalidraw's nor tldraw's local persistence restores the undo stack; (b) persisting history multiplies quota use and write volume; (c) history entries must be serializable and migrated across schema versions — pure liability. zundo's `wrapTemporal` + zustand `persist` makes persisting history possible if ever demanded, so this isn't a one-way door.
- **Autosave subscribes to the base store, not the temporal store**: undo/redo themselves change the document and therefore trigger the same debounced save — persistence stays a pure function of current state.
- **Group drags into one undo entry.** Two working patterns with zundo: (1) `temporal.pause()` on pointer-down, `resume()` on pointer-up so only the final state is captured — but capture one entry at the boundary; or (2) `handleSet` with a debounce/throttle so rapid intermediate sets coalesce (the README's documented approach). tldraw formalizes the same idea as history "stopping points"/marks; Excalidraw coalesces by computing one delta per committed store update rather than per pointer event.

## 4. Storage quota and persistence

All from MDN's Storage quotas and eviction criteria guide (source markdown: https://github.com/mdn/content/blob/main/files/en-us/web/api/storage_api/storage_quotas_and_eviction_criteria/index.md, rendered at https://developer.mozilla.org/en-US/docs/Web/API/Storage_API/Storage_quotas_and_eviction_criteria) and the `persist()` page (https://developer.mozilla.org/en-US/docs/Web/API/StorageManager/persist):

- **Best-effort vs persistent buckets**: all storage is best-effort by default — kept while under quota and no storage pressure. `navigator.storage.persist()` requests the persistent bucket; persistent data "is only evicted… if the user chooses to, by using their browser's settings." The promise resolves `true` only if granted; the browser may refuse.
- **Browser differences**: "In Firefox… the user is notified with a UI popup that their permission is requested. Safari and most Chromium-based browsers… automatically approve or deny the request based on the user's history of interaction with the site and do not show any prompts." Chrome-team research (web.dev, cited by MDN) shows best-effort data is very rarely evicted for regularly-visited sites.
- **Eviction**: under storage pressure browsers evict whole origins LRU-first, skipping persistent-bucket origins; when an origin is evicted, **all** its data (IDB + Cache + OPFS) is deleted together.
- **Safari 7-day ITP cap — still current as of this MDN revision (fetched 2026-07-18)**: "Safari proactively evicts data when cross-site tracking prevention is turned on. If an origin has no user interaction, such as click or tap, in the last seven days of browser use, its data created from script will be deleted." This applies to all script-writable storage (IDB included). Regular use resets the clock; `persist()` and installing to Home Screen/Dock mitigate. (webkit.org was not fetchable from the research environment to cross-check WebKit's own wording; MDN main-branch content is the verified source.)
- **Quota sizes**: Firefox best-effort: min(10% of total disk, 10 GiB group limit); persistent: up to 50% of disk (cap 8 TiB). Chromium: up to 60% of total disk per origin (both modes); Chrome uses at most 80% of disk overall. Safari (macOS 14/iOS 17+): ~60% of disk per origin in browser apps, ~15% in embedded WebViews (~60% if installed as web app); overall cap 80%/20%; earlier Safari: 1 GiB initial then a user prompt. localStorage: 5 MiB per origin everywhere.
- **`navigator.storage.estimate()`** returns `{usage, quota}` estimates (usage may be padded for cross-origin resources) — use it to warn before hitting quota.

## 5. Recommended combination for this app

**Persistence layer — `idb-keyval` 6.3.0** (~300–600 B brotli, published 2026-07-08, same author as `idb`):

- One IndexedDB store via `createStore("plan-maker", "documents")`; whole plan saved as a single `set("plan:current", {schemaVersion, savedAt, plan})` → atomic by construction, no partial-write corruption. Keep `plan:backup` as rolling last-known-good, written before overwriting current. Plain-JSON document model (structured-clone-safe, export-friendly).
- If richer querying ever becomes necessary, graduate to `idb` 8.0.3 (~1.2 kB) — same mental model. Dexie 4.4.4 (~31 kB gz) is healthy but overkill for one document; OPFS unnecessary at this data size; localStorage only as an emergency fallback.

**State + undo — `zustand` 5.0.14 + `zundo` 2.3.0** (+ optionally `immer` 11.1.15 middleware for ergonomic updates):

- `temporal` middleware with: `partialize` to exclude selection/camera/tool state from history (tldraw's document/session split); `limit: ~100`; `handleSet`-based coalescing plus `pause()/resume()` around drags so a drag is one undo entry; `equality` (e.g. shallow/deep) to skip no-op entries.
- History in memory only; do not persist the undo stack. If patch-level memory optimization is ever needed, zundo's `diff` option or Immer `produceWithPatches`/`applyPatches` (with `enablePatches()`) is the upgrade path.
- Avoid redux-undo (GitHub-archived, last release 2023).

**Autosave wiring**:

- `store.subscribe` → debounce ~500 ms (Excalidraw uses 300 ms) → single `set()` of the whole doc; try/catch surfacing `QuotaExceededError` in the UI; `debounce.flush()` on `visibilitychange`→hidden and `pagehide` (never rely on `beforeunload` for saving — attach it only, while dirty, to show the leave-warning dialog); skip saves while `document.hidden` if a save is already in flight.
- On startup: `navigator.storage.persist()` (silent auto-grant in Chrome/Safari, prompt in Firefox) and optionally `estimate()`; acquire a Web Lock (`navigator.locks.request("plan-maker:editor", …)`, Chrome 69+/Firefox 96+/Safari 15.4+) for single-writer tab semantics, with BroadcastChannel to tell other tabs to reload/read-only.
- Load path: read `plan:current`, run ordered `schemaVersion` migrations, fall back to `plan:backup` on parse/migration failure.

## Sources

- npm registry API: https://registry.npmjs.org/dexie · /idb · /idb-keyval · /zundo · /zustand · /immer · /redux-undo · /jotai-history · /dexie-react-hooks · /@tanstack/store · /xstate (versions, publish dates, unpacked sizes; fetched 2026-07-18)
- GitHub API repo metadata: https://api.github.com/repos/dexie/Dexie.js · /jakearchibald/idb · /jakearchibald/idb-keyval · /charkour/zundo · /pmndrs/zustand · /omnidan/redux-undo (archived: true) · /immerjs/immer · /jotaijs/jotai-history
- idb README: https://github.com/jakearchibald/idb/blob/main/README.md
- idb-keyval README: https://github.com/jakearchibald/idb-keyval/blob/main/README.md
- zundo README/repo: https://github.com/charkour/zundo
- Dexie README: https://github.com/dexie/Dexie.js/blob/master/README.md; measured bundle: https://unpkg.com/dexie@4.4.4/dist/dexie.min.js
- Immer patches docs: https://immerjs.github.io/immer/patches/ (source: https://github.com/immerjs/immer/blob/main/website/docs/patches.mdx)
- MDN (source markdown, mdn/content@main, fetched 2026-07-18): StorageManager.persist (`files/en-us/web/api/storagemanager/persist/index.md`); Storage quotas and eviction criteria (`…/storage_api/storage_quotas_and_eviction_criteria/index.md`); Using IndexedDB (`…/indexeddb_api/using_indexeddb/index.md`); beforeunload (`…/window/beforeunload_event/index.md`); pagehide (`…/window/pagehide_event/index.md`); Web Locks API (`…/web_locks_api/index.md`); Structured clone algorithm (`…/web_workers_api/structured_clone_algorithm/index.md`); OPFS (`…/file_system_api/origin_private_file_system/index.md`)
- mdn/browser-compat-data: `api/LockManager.json` (Chrome 69, Firefox 96, Safari 15.4)
- Excalidraw source: https://github.com/excalidraw/excalidraw/blob/master/excalidraw-app/data/LocalData.ts · …/excalidraw-app/app_constants.ts · …/packages/excalidraw/history.ts
- tldraw persistence docs: https://github.com/tldraw/tldraw/blob/main/apps/docs/content/docs/persistence.mdx (rendered at https://tldraw.dev/docs/persistence)

Fetch failures noted: npmjs.com package pages, developer.mozilla.org HTML, immerjs.github.io, tldraw.dev, api.npmjs.org (download counts), and webkit.org were blocked from the research environment; equivalent primary sources (registry JSON API, MDN/tldraw/immer source markdown on GitHub) were used instead. Weekly download counts and WebKit's own ITP blog wording are the only requested data points that could not be independently verified.
