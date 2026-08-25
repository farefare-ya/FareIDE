# FareIDE

A desktop code editor (Tauri + React + CodeMirror) that runs real code by
shelling out to whatever interpreters/compilers are installed on the user's
machine — python3, node, gcc, javac, rustc, go, php, ruby, and more.

## Project structure

- `src/App.tsx` — main UI: file explorer, tabs, editor, terminal panel
- `src/syntax.ts` — filename → CodeMirror language + display label
- `src/languages.ts` — filename → *runnable* language id (finer-grained than
  syntax.ts; e.g. splits `.c` from `.cpp` since they need different compilers)
- `src/runner.ts` — frontend bridge to the Rust backend (`invoke`/`listen`)
- `src-tauri/src/lib.rs` — the backend: writes the workspace to a temp dir,
  builds the right shell command per language (`build_script()`), spawns it,
  streams stdout/stderr back as events, and supports stdin + force-stop
- `src-tauri/tauri.conf.json` — window, bundle, and dev-server config
- `src-tauri/capabilities/default.json` — permissions granted to the main window

## Adding a new runnable language

1. Add the extension → language id mapping in `src/languages.ts`
   (`RUN_EXT_MAP` and `RUN_LABELS`)
2. Add the shell command for it in `src-tauri/src/lib.rs`'s `build_script()`
3. If it needs new syntax highlighting, add a CodeMirror language extension
   in `src/syntax.ts` and `getEditorExtensions()` in `src/App.tsx`
   (check `@codemirror/legacy-modes` first — it covers dozens of languages
   without adding a new dependency)

## Commands

- `npm run dev` — Vite dev server only (browser preview, no Run button —
  the run/write-stdin/stop commands only exist in the Tauri backend)
- `npm run tauri:dev` — the actual app, with hot reload
- `npm run tauri:build` — production installer for your current OS

See `README.md` for prerequisites and full setup.
