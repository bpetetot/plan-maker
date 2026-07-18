# 02 — Offline persistence and undo/redo architecture

Type: research
Status: resolved
Blocked by: —

## Question

How should the app persist the plan locally with automatic save, and how should
undo/redo be architected on top of that state?

Cover: IndexedDB access layer (Dexie vs idb vs raw API) for a single-document app;
autosave patterns (debounced writes, write-on-change) and their failure modes;
undo/redo approaches (command pattern vs immutable snapshots vs a state-library
plugin such as zustand + zundo or similar) and how they interact with autosave
(undo history persisted or in-memory only?); storage quota/persistence API
(`navigator.storage.persist()`) considerations. Recommend a concrete combination
of libraries and patterns for React + TypeScript.

## Answer

Persist with `idb-keyval` 6.3.0 (~300–600 B, actively maintained, used by Excalidraw): whole plan as one
`set("plan:current", {schemaVersion, savedAt, plan})` — atomic single-record write — plus a `plan:backup`
last-known-good key and ordered schema migrations on load. Dexie (~31 kB gz) is overkill for one document;
raw IndexedDB is painful (event API, transaction auto-commit). Autosave: subscribe to the store, debounce
300–500 ms, flush on `visibilitychange`/`pagehide` (not `beforeunload`), catch `QuotaExceededError` in the UI,
Web Lock for single-writer tab semantics. Undo/redo: `zustand` 5.0.14 + `zundo` 2.3.0 (immutable snapshots,
`partialize` to exclude selection/camera, `limit` ~100, pause/resume or `handleSet` to group drags); history
in-memory only — never persisted (matches Excalidraw/tldraw). Avoid redux-undo (archived). Call
`navigator.storage.persist()` on startup. Optionally `immer` 11.x for updates and future patch-based history.
Full findings: ../research/offline-persistence-and-undo.md
